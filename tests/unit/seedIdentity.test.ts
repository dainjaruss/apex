// tests/unit/seedIdentity.test.ts
//
// Pins the identity scheme that makes `npm run db:seed` idempotent.
//
// The defect: every seed write was a bare INSERT, so seven runs left 12
// CHIEFEVAL, 14 FITREP and 75 EVAL drafts stacked on the hosted project and the
// seed could not be re-run to repair data. The fix derives each fixture's
// primary key from its own identity so the second run upserts over the first.
//
// These tests exercise the REAL scripts/seedIdentity.ts — no mirrored copy of
// the logic. What they cannot see is whether the seed scripts actually call it
// (they import a live Supabase client at module scope, so they are not
// importable here); that half is proven by running the seed three times against
// a local Postgres and counting rows. Both halves are needed.

import { describe, it, expect, vi } from "vitest";
import {
  seedUuid,
  evaluationSeedId,
  withSeedIds,
  pruneSeedEvaluations,
} from "@/scripts/seedIdentity";

const base = {
  member_name: "DOE, JOHN A",
  report_type: "EVAL",
  period_from: "2025-01-01",
  period_to: "2025-12-31",
};

describe("seedUuid", () => {
  it("returns the same id for the same input", () => {
    expect(seedUuid("evaluations", "a", "b")).toBe(
      seedUuid("evaluations", "a", "b"),
    );
  });

  it("namespaces by scope, so two seeds never collide on the same identity", () => {
    expect(seedUuid("evaluations", "a")).not.toBe(seedUuid("summary_groups", "a"));
  });

  it("cannot confuse a field boundary — parts are NUL-joined", () => {
    // A space or empty separator would make these two identities the same id,
    // and member names are full of spaces.
    expect(seedUuid("s", "AB", "C")).not.toBe(seedUuid("s", "A", "BC"));
    expect(seedUuid("s", "DOE, JOHN A", "EVAL")).not.toBe(
      seedUuid("s", "DOE, JOHN", "A EVAL"),
    );
  });

  it("emits a well-formed UUID that gen_random_uuid() could never produce", () => {
    const id = seedUuid("evaluations", "x");
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    // Version nibble 8 (RFC 9562 custom) is the free marker: Postgres
    // gen_random_uuid() only ever emits version 4, so a v8 id in `evaluations`
    // was written by a seed and nothing else.
    expect(id[14]).toBe("8");
  });
});

describe("evaluationSeedId identity", () => {
  it("changes when ANY of the four identity fields changes", () => {
    // A hash that silently dropped a field would still pass a determinism test.
    const id = evaluationSeedId(base);
    expect(evaluationSeedId({ ...base, member_name: "DOE, JANE A" })).not.toBe(id);
    expect(evaluationSeedId({ ...base, report_type: "CHIEFEVAL" })).not.toBe(id);
    expect(evaluationSeedId({ ...base, period_from: "2025-01-02" })).not.toBe(id);
    expect(evaluationSeedId({ ...base, period_to: "2026-12-31" })).not.toBe(id);
  });

  it("ignores custody — a signed, advanced record still maps to its seed row", () => {
    // THE load-bearing property. A demo signs these records and walks them up
    // the chain; if custody were part of the key the next seed run would insert
    // a NEW row beside the advanced one, which is the original defect.
    const id = evaluationSeedId(base);
    for (const custody of [
      { routing_stage: "debrief" },
      { status: "completed" },
      { current_holder_id: "0000-somebody-else" },
      { participants: ["a", "b", "c"] },
      { signature_locked: true },
      { trait_average: 5.0 },
      { created_by: "a-different-author" },
    ]) {
      expect(evaluationSeedId({ ...base, ...custody })).toBe(id);
    }
  });

  it("refuses to hash a hole rather than colliding every incomplete draft", () => {
    for (const field of [
      "member_name",
      "report_type",
      "period_from",
      "period_to",
    ] as const) {
      expect(() => evaluationSeedId({ ...base, [field]: undefined })).toThrow(
        /incomplete identity/,
      );
      expect(() => evaluationSeedId({ ...base, [field]: "" })).toThrow(
        /incomplete identity/,
      );
    }
  });
});

describe("withSeedIds", () => {
  // The seven fixtures scripts/seed-e2e.ts writes, by identity. All seven share
  // buildValidEval()'s period, so member_name and report_type are what separate
  // them — exactly the case a weaker key would get wrong.
  const e2eFixtures = [
    { member_name: "DOE, JOHN A", report_type: "EVAL" },
    { member_name: "DOE, JOHN A (RECYCLE)", report_type: "EVAL" },
    { member_name: "SMITH, BETTY L (CHIEF)", report_type: "CHIEFEVAL" },
    { member_name: "JONES, CARL R (OFFICER)", report_type: "FITREP" },
    { member_name: "WILLIAMS, SARAH K (IT1)", report_type: "EVAL" },
    { member_name: "RODRIGUEZ, MARCOS E (ITCS)", report_type: "CHIEFEVAL" },
    { member_name: "CHEN, DAVID T (LT)", report_type: "FITREP" },
  ].map((f) => ({
    ...f,
    period_from: "2025-01-01",
    period_to: "2025-12-31",
  }));

  it("gives all seven E2E fixtures distinct ids", () => {
    const ids = withSeedIds(e2eFixtures).map((d) => d.id);
    expect(new Set(ids).size).toBe(7);
  });

  it("preserves the draft and only adds `id`", () => {
    const [first] = withSeedIds([{ ...base, comments: "KEEP ME" }]);
    expect(first.comments).toBe("KEEP ME");
    expect(first.id).toBe(evaluationSeedId(base));
  });

  it("throws on two drafts that share a natural key", () => {
    // Without this the seed would report seven rows and write six: the second
    // draft would upsert straight over the first.
    expect(() =>
      withSeedIds([base, { ...base, comments: "a different draft" }]),
    ).toThrow(/identity collision/);
  });

  // Stability pin. The value under test is not "these bytes" but "these ids do
  // not move between releases": every seeded row on the hosted project is keyed
  // by them, so changing the scope string, the separator, the hash, or the
  // field order orphans all of them — the next seed writes a fresh generation
  // beside the old one and the prune deletes what it no longer recognises.
  // Recoverable, but it must be a deliberate act, not a side effect.
  it("keeps the E2E fixture ids stable across releases", () => {
    expect(
      Object.fromEntries(
        withSeedIds(e2eFixtures).map((d) => [d.member_name, d.id]),
      ),
    ).toEqual({
      "DOE, JOHN A": "d609447f-86bb-8376-b52b-408b98dbe0e6",
      "DOE, JOHN A (RECYCLE)": "ad4d9bfa-fbb3-8c6c-86f4-0c679102395f",
      "SMITH, BETTY L (CHIEF)": "db8ceb8c-5e8c-8f62-ba1c-27e41f3a7d0d",
      "JONES, CARL R (OFFICER)": "014e75b0-6c6d-8168-bea3-269ce8058e71",
      "WILLIAMS, SARAH K (IT1)": "db389741-1daa-84f3-a9b2-c752fa0b994b",
      "RODRIGUEZ, MARCOS E (ITCS)": "194888ce-1ad6-83b9-96e6-54b657d6bde8",
      "CHEN, DAVID T (LT)": "7fe3cd2e-ed4a-8e48-a872-f9bf07d52a22",
    });
  });
});

describe("pruneSeedEvaluations", () => {
  /**
   * Smallest client that answers the two chains prune uses:
   *   from("brag_sheets").select(...).in(...)   -> awaited
   *   from("evaluations").delete().in(...)      -> awaited
   */
  function fakeAdmin(bragRows: Array<{ id: string; evaluation_id: string }>) {
    const deleted: string[][] = [];
    const admin = {
      from(table: string) {
        if (table === "brag_sheets") {
          return {
            select: () => ({
              in: (_col: string, ids: string[]) =>
                Promise.resolve({
                  data: bragRows.filter((b) => ids.includes(b.evaluation_id)),
                  error: null,
                }),
            }),
          };
        }
        return {
          delete: () => ({
            in: (_col: string, ids: string[]) => {
              deleted.push(ids);
              return Promise.resolve({ error: null });
            },
          }),
        };
      },
    };
    return { admin: admin as never, deleted };
  }

  // Ids are long and distinctive on purpose. This suite first asserted
  // `toContain("b")` against the warning, which could not fail: the static
  // template already reads "referenced BY a brag sheet" before any id is
  // interpolated, so dropping the id list entirely — or printing the WRONG ids
  // — still passed. Assert on ids no template text can accidentally contain.
  const KEPT = "kept-eval-11111111";
  const GONE1 = "gone-eval-22222222";
  const GONE2 = "gone-eval-33333333";

  it("deletes the stale rows", async () => {
    const { admin, deleted } = fakeAdmin([]);
    expect(await pruneSeedEvaluations(admin, [GONE1, GONE2], "eval")).toBe(2);
    expect(deleted).toEqual([[GONE1, GONE2]]);
  });

  it("skips rows a brag sheet references instead of failing the seed", async () => {
    // brag_sheets.evaluation_id is NO ACTION (006:17): deleting a referenced
    // evaluation raises, and one such row would take the whole seed down.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { admin, deleted } = fakeAdmin([{ id: "bs1", evaluation_id: KEPT }]);
    expect(await pruneSeedEvaluations(admin, [GONE1, KEPT, GONE2], "eval")).toBe(
      2,
    );
    expect(deleted).toEqual([[GONE1, GONE2]]);
    // Names the row it KEPT — not the ones it deleted, and not nothing at all.
    const message = warn.mock.calls[0][0] as string;
    expect(message).toContain(KEPT);
    expect(message).not.toContain(GONE1);
    expect(message).not.toContain(GONE2);
    warn.mockRestore();
  });

  it("says so loudly rather than silently keeping a referenced row", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { admin, deleted } = fakeAdmin([{ id: "bs1", evaluation_id: KEPT }]);
    expect(await pruneSeedEvaluations(admin, [KEPT], "eval")).toBe(0);
    expect(deleted).toEqual([]); // never issues an empty delete
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toContain(KEPT);
    warn.mockRestore();
  });

  it("does nothing when there is nothing stale", async () => {
    const { admin, deleted } = fakeAdmin([]);
    expect(await pruneSeedEvaluations(admin, [], "eval")).toBe(0);
    expect(deleted).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// ponytail: a source-text assertion, in the idiom already established at
// tests/unit/boardConfidenceService.test.ts:715 — both seed scripts build a live
// Supabase client at module scope and call main() on import, so there is no seam
// to call into and refactoring two entrypoints to unit-test one line each is a
// worse trade than reading the file.
//
// This is the whole fix. Everything above tests the id helper in isolation and
// stays green if the seeds never call it: reverting `.upsert(drafts)` to
// `.insert(drafts)` left all 931 default-scope tests passing.
//
// Assert the POSITIVE form only. The negative (`not.toMatch(/\.insert\(/)`) is
// what produced the eleventh vacuous test in this epic — a comment that merely
// mentions the string satisfies it.
//
// Upgrade path: if either seed ever grows a testable export, assert the written
// row instead of the text.
// ---------------------------------------------------------------------------
describe("the seeds actually use the deterministic ids", () => {
  const read = async (script: string) => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    return readFileSync(resolve(process.cwd(), script), "utf8");
  };

  it.each([["scripts/seed-e2e.ts"], ["scripts/seed-stress.ts"]])(
    "%s stamps ids with withSeedIds and upserts them",
    async (script) => {
      const src = await read(script);
      expect(src).toMatch(/const drafts = withSeedIds\(/);
      expect(src).toMatch(/\.upsert\(drafts\)/);
      // The UNCONDITIONAL post-upsert cleanup specifically, not just "the word
      // pruneSeedEvaluations appears somewhere". Both scripts also call prune
      // under --reset, so a bare /pruneSeedEvaluations\(/ stayed green when the
      // cleanup call was deleted and only the optional one was left.
      expect(src).toMatch(
        /const keep = new Set\(drafts\.map\(\(d\) => d\.id\)\);\s*await pruneSeedEvaluations\(/,
      );
    },
  );

  // Both prunes are scoped by TWO predicates, and that is a data-loss guard,
  // not a style point. A synthetic dod_id identifies the ACCOUNT, not the
  // writer: a human logging in as a seeded account and clicking New Report gets
  // a real draft carrying it. One such row exists on hosted (CONNOR, SARAH A)
  // and a single-predicate prune would have deleted it.
  it("scopes the e2e prune by member name AND seeded authorship", async () => {
    expect(await read("scripts/seed-e2e.ts")).toMatch(
      /\.in\("member_name", memberNames\)\s*\.in\("created_by", userIds\)/,
    );
  });

  it("scopes the stress prune by synthetic dod_id AND the fixture period", async () => {
    expect(await read("scripts/seed-stress.ts")).toMatch(
      /\.like\("dod_id", "10000000%"\)\s*\.in\("period_from", periodFrom\)\s*\.in\("period_to", periodTo\)/,
    );
  });
});
