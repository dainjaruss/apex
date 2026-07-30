// tests/unit/profileRoleLockdown.test.ts
//
// Client-side half of the migration 009 guards.
//
// The database half — that `authenticated` genuinely cannot escalate a role and
// genuinely cannot read another user's row — is asserted against a real
// postgres:17 in tests/integration/profilesRlsLockdown.test.ts. It used to be
// asserted here by regexing the migration file for expected statements; that was
// removed because it verified the wrong thing. Appending a single line to an
// otherwise-untouched 009 kept all of those assertions green in eight separate
// broken variants, including `grant update on public.profiles to authenticated;`
// which re-opens the exact P0 the file exists to close. Source text is not
// privilege state; do not reintroduce that pattern here.
//
// What is left is a genuine behavioural test with no database in it: migration
// 009 makes the whole UPDATE statement fail with 42501 if preferred_role appears
// in the payload AT ALL — even unchanged, even set to its current value. So
// updateProfile() must never send it, or saving a profile breaks for every user.

import { describe, it, expect, vi, beforeEach } from "vitest";

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

  it("sends exactly the columns migration 009 grants back", async () => {
    await updateProfile("user-1", {
      firstName: "John",
      lastName: "Doe",
      middleInitial: "A",
      dodId: "1234567890",
      uic: "12345",
      navyRank: "PO1",
      command: "USS NEVERSAIL",
    });

    // Must stay equal to the column-level grant in migration 009 part A1 — a
    // column here that is not granted there fails every profile save with 42501.
    expect(Object.keys(h.update.mock.calls[0][0]).sort()).toEqual([
      "command",
      "dod_id",
      "first_name",
      "last_name",
      "middle_initial",
      "navy_rank",
      "uic",
    ]);
  });
});
