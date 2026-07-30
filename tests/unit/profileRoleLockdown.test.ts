// tests/unit/profileRoleLockdown.test.ts
//
// Regression guards for the P0 security fixes in
// supabase/migrations/009_profile_role_and_pii_lockdown.sql.
//
// Two layers, because the hole spans the database and the client:
//
//   1. The migration itself. The real enforcement is a Postgres column-level
//      privilege, which no in-process test can exercise — vitest has no
//      database. These assertions therefore pin the exact statements that were
//      verified by hand against postgres:17 with 001+002+009 applied:
//        update profiles set preferred_role=... -> ERROR 42501
//        select count(*) from profiles          -> 1 (own row only)
//        select count(*) from profiles_directory-> all rows, 4 columns
//      They fail loudly if anyone re-adds the columns to the grant, restores
//      `using (true)`, or flips the view to security_invoker.
//
//   2. The client. Migration 009 makes the whole UPDATE statement fail with
//      42501 if preferred_role appears in the payload AT ALL — even unchanged.
//      So updateProfile() must never send it, or saving a profile breaks for
//      every user. That part is a real behavioural test.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";

const MIGRATION = resolve(
  process.cwd(),
  "supabase/migrations/009_profile_role_and_pii_lockdown.sql",
);

// Comment-stripped SQL, so an assertion can never be satisfied by prose in the
// migration's (long) header.
const sql = readFileSync(MIGRATION, "utf8")
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .toLowerCase();

describe("migration 009 — profiles role + PII lockdown", () => {
  describe("part A1: preferred_role / assigned_roles are not self-updatable", () => {
    // The load-bearing statement. Revoking only the COLUMNS is a no-op while
    // the role still holds Supabase's default table-level UPDATE grant —
    // measured on postgres:17: the escalating UPDATE still returned "UPDATE 1".
    it("revokes TABLE-level update from authenticated, not just the columns", () => {
      expect(sql).toMatch(
        /revoke\s+update\s+on\s+public\.profiles\s+from\s+authenticated/,
      );
    });

    it("grants back only non-privilege-bearing columns", () => {
      const grant = sql.match(
        /grant\s+update\s*\(([^)]*)\)\s*on\s+public\.profiles\s+to\s+authenticated/,
      );
      expect(grant, "no column-level grant found").toBeTruthy();

      const columns = grant![1]
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

      expect(columns).not.toContain("preferred_role");
      expect(columns).not.toContain("assigned_roles");
      expect(columns).not.toContain("id");
      // Still writable, or the profile page stops working entirely.
      expect(columns).toEqual(
        expect.arrayContaining(["first_name", "last_name", "navy_rank"]),
      );
    });
  });

  describe("part A2: the signup trigger does not trust client metadata", () => {
    it("hard-codes the new-account role instead of reading raw_user_meta_data", () => {
      const fn = sql.slice(
        sql.indexOf("create or replace function public.handle_new_user"),
      );
      expect(fn).toContain("handle_new_user");
      // The exact expression that made a self-service Admin account possible.
      expect(fn).not.toMatch(/raw_user_meta_data->>'preferred_role'/);
      expect(fn).toMatch(/'sailor'/);
    });
  });

  describe("part B: profile reads are own-row plus a narrow directory view", () => {
    it("drops the blanket read policy from 001", () => {
      expect(sql).toMatch(
        /drop policy if exists "allow public read of profiles" on public\.profiles/,
      );
    });

    it("replaces it with an own-row policy, with no `using (true)` left behind", () => {
      const policy = sql.match(
        /create policy "profiles_select_own"[\s\S]*?;/,
      )?.[0];
      expect(policy).toBeTruthy();
      expect(policy).toMatch(/auth\.uid\(\)\s*=\s*id/);
      expect(sql).not.toMatch(
        /on public\.profiles for select[\s\S]*?using\s*\(\s*true\s*\)/,
      );
    });

    it("exposes exactly four columns through profiles_directory", () => {
      const view = sql.match(
        /create or replace view public\.profiles_directory as([\s\S]*?);/,
      );
      expect(view, "profiles_directory view not found").toBeTruthy();

      const body = view![1];
      for (const col of ["id", "first_name", "last_name", "preferred_role"]) {
        expect(body).toContain(col);
      }
      // The whole point: protected PII must never reach the broad surface.
      for (const col of ["dod_id", "email", "uic", "command"]) {
        expect(body).not.toContain(col);
      }
    });

    it("leaves security_invoker off so the view can see past own-row RLS", () => {
      // With security_invoker = true the view collapses to the caller's own row
      // (measured: 2 rows -> 1 row) and every reviewer picker silently empties.
      expect(sql).not.toMatch(/security_invoker\s*=\s*true/);
    });

    it("grants the directory SELECT-only, and not to anon", () => {
      expect(sql).toMatch(
        /grant select on public\.profiles_directory to authenticated/,
      );
      expect(sql).not.toMatch(
        /grant\s+(all|update|insert|delete)[^;]*on public\.profiles_directory/,
      );
      expect(sql).not.toMatch(
        /grant select on public\.profiles_directory to[^;]*anon/,
      );
    });
  });

  it("is safe to re-run: every create is guarded by a drop or replace", () => {
    expect(sql).toMatch(
      /drop policy if exists "profiles_select_own" on public\.profiles/,
    );
    expect(sql).toMatch(/create or replace view public\.profiles_directory/);
    expect(sql).toMatch(/create or replace function public\.handle_new_user/);
  });
});

// ── Client side ────────────────────────────────────────────────────────────
// A single privileged column anywhere in the payload aborts the entire UPDATE
// with 42501, so this is not cosmetic — it is what keeps profile saves working.

const h = vi.hoisted(() => ({ update: vi.fn() }));

vi.mock("@/lib/supabaseClient", () => ({
  createBrowserClient: () => ({
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        h.update(payload);
        return {
          eq: () => ({
            select: () => ({
              single: async () => ({ data: payload, error: null }),
            }),
          }),
        };
      },
    }),
  }),
}));

import { updateProfile } from "@/lib/profileService";

describe("updateProfile never writes a privilege-bearing column", () => {
  beforeEach(() => h.update.mockClear());

  it("drops a role even when a caller tries to pass one", async () => {
    await updateProfile("user-1", {
      firstName: "John",
      navyRank: "PO1",
      // Not in the parameter type; a stale caller could still pass it at runtime.
      ...({ preferredRole: "Admin" } as Record<string, unknown>),
    });

    const payload = h.update.mock.calls[0][0];
    expect(payload).toEqual({ first_name: "John", navy_rank: "PO1" });
    expect(payload).not.toHaveProperty("preferred_role");
    expect(payload).not.toHaveProperty("assigned_roles");
  });
});
