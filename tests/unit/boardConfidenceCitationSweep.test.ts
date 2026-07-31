// tests/unit/boardConfidenceCitationSweep.test.ts
//
// The semantic citation gate, swept across the status space rather than pinned
// on one hand-built fixture.
//
// This exists because the epic kept citing a "200-record sweep" that was not in
// the repo, so no one could re-run it and no change could be checked against it.
// It is deterministic (seeded PRNG, no clock, no network, no credentials), so it
// runs in `npm run verify` forever instead of being a script that rots.
//
// The expectation table below is written from the RULE, deliberately duplicating
// what narrative.ts encodes. That duplication is the point: a sweep that imports
// the implementation's own table proves only that the table equals itself.
//
// WHAT N=200 IS AND IS NOT. It is not breadth. All four statuses are already
// reachable by record index 1, the decision surface is 8 cells plus the pair
// rule, and the remaining ~198 records re-exercise the same cells with different
// prose. Do not quote the assertion count as coverage — it is repetition. The
// records are kept because they are free (49 ms) and because the generator, not
// the count, is what would catch a rubric change that stops producing a status;
// the reachability guard below is what actually enforces that.
//
// What DOES add coverage here is the SPELLING axis: three path families resolve
// to an area's status (`areas.<key>`, `coverage.missing.<key>`, `actions.<id>`),
// and a rule enforced for one spelling but not the others is not enforced.

import { describe, it, expect } from "vitest";
import {
  narrativePayload,
  fallbackNarrative,
  applyCitationGate,
  type Narrative,
} from "@/lib/boardConfidence/narrative";
import {
  DEFAULT_RUBRIC_CONFIG as CFG,
  scoreBoardConfidence,
} from "@/lib/boardConfidence/rubric";
import { buildReadinessReport } from "@/lib/boardConfidence/readiness";
import type { RubricInputs } from "@/lib/boardConfidence/types";

/** What must be true of the cited area for an item of this valence to stand. */
const EXPECT_KEEP: Record<"strengths" | "gaps", Record<string, boolean>> = {
  //          strong  on_track  needs_attention  not_enough_entered
  strengths: { strong: true, on_track: true, needs_attention: false, not_enough_entered: false },
  gaps: { strong: false, on_track: true, needs_attention: true, not_enough_entered: false },
};

const RECS = ["Significant Problems", "Progressing", "Promotable", "Must Promote", "Early Promote"];

function makeGenerator(seedStart: number) {
  let seed = seedStart;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  return (i: number): RubricInputs => {
    const nEvals = Math.floor(rnd() * 6);
    const nTours = Math.floor(rnd() * 3);
    const nLadr = Math.floor(rnd() * 5);
    const nFlags = Math.floor(rnd() * 6);
    const entered = rnd() > 0.25;
    return {
      boardDate: "2026-09-01",
      evals: [2021, 2022, 2023, 2024, 2025, 2026].slice(0, nEvals).map((y) => ({
        period_from: `${y - 1}-03-16`,
        period_to: `${y}-03-15`,
        report_type: "EVAL" as const,
        promotion_recommendation: pick(RECS) as any,
        trait_average: 2.6 + rnd() * 2.2,
        summary_group_average: rnd() > 0.5 ? 3.2 + rnd() : null,
        rsca: null,
        sea_duty: rnd() > 0.5,
        ep_count: null,
        group_size: null,
      })),
      psr: {
        entered,
        awards:
          entered && rnd() > 0.4
            ? [{ title: "NAM", level: "personal_achievement" as const, date_awarded: "2024-01-01", verified_in_ompf: rnd() > 0.5 }]
            : [],
        necs: entered && rnd() > 0.5 ? [{ code: "742A", verified_in_ompf: true }] : [],
        education:
          entered && rnd() > 0.5
            ? [{ kind: "degree" as const, title: "Associate of Science", verified_in_ompf: true }]
            : [],
        tours: Array.from({ length: nTours }, (_, t) => ({
          title: `T${t}`,
          start: `${2019 + t}-01-01`,
          end: null,
          sea_duty: rnd() > 0.5,
          leadership: rnd() > 0.5,
        })),
        pfa: entered ? [{ cycle: "a", date: "2024-04-01", result: (rnd() > 0.15 ? "pass" : "fail") as any }] : [],
        adverse: [],
      },
      ladr: Array.from({ length: nLadr }, (_, l) => ({
        milestone_id: `m${i}-${l}`,
        category: pick(["qual_warfare", "pme_required", "credential", "education_degree"]) as any,
        status: (rnd() > 0.5 ? "met" : "not_met") as any,
        verified_in_ompf: rnd() > 0.5,
        item: `Milestone ${l}`,
        typical_months: 3,
      })),
      preceptFlags: (
        ["warfighting", "leadership_positions", "education", "sea_duty", "technical_expertise"] as const
      ).slice(0, nFlags) as any,
    };
  };
}

const N = 200;
const makeRecord = makeGenerator(20260731);
const RECORDS = Array.from({ length: N }, (_, i) => {
  const inputs = makeRecord(i);
  const result = scoreBoardConfidence(inputs, CFG);
  const report = buildReadinessReport(result, inputs, CFG, { asOf: "2026-04-01" });
  return { report, payload: narrativePayload(report, result), det: fallbackNarrative(report) };
});

const gateOne = (
  r: (typeof RECORDS)[number],
  list: "strengths" | "gaps",
  text: string,
) =>
  applyCitationGate(
    {
      strengths: [],
      gaps: [],
      recommendations: [],
      factor_commentary: r.det.factor_commentary,
      [list]: [text],
    } as Narrative,
    r.payload,
    r.det,
  );

describe(`the semantic citation gate, swept over ${N} generated records`, () => {
  it("the sweep actually reaches all four statuses", () => {
    // Without this the whole file could be asserting on two statuses and still
    // pass — the sweep's own vacuity check.
    const seen = new Set(RECORDS.flatMap((r) => r.report.areas.map((a) => a.status)));
    expect(Array.from(seen).sort()).toEqual([
      "needs_attention",
      "not_enough_entered",
      "on_track",
      "strong",
    ]);
  });

  it("every (list, cited-area-status) pair matches the rule, in EVERY spelling", () => {
    // The three path families that resolve to an area's status must all be
    // enforced. Enforcing `areas.<key>` alone left the more natural spellings
    // open — `coverage.missing.precept` is how a model actually refers to an
    // unentered area, and it was sailing straight through.
    const failures: string[] = [];
    const spellingsSeen = new Set<string>();
    let checks = 0;
    RECORDS.forEach((r, i) => {
      for (const area of r.report.areas) {
        const spellings = [`areas.${area.key}`];
        if (r.payload.coverage.missing.some((m) => m.area === area.key))
          spellings.push(`coverage.missing.${area.key}`);
        for (const a of r.payload.actions)
          if (a.area === area.key) spellings.push(`actions.${a.id}`);

        for (const path of spellings) {
          spellingsSeen.add(path.split(".")[0] + (path.startsWith("coverage") ? ".missing" : ""));
          for (const list of ["strengths", "gaps"] as const) {
            const gated = gateOne(r, list, `Claim about ${area.key}. [${path}]`);
            const kept = gated[list].length === 1;
            checks++;
            if (kept !== EXPECT_KEEP[list][area.status])
              failures.push(`#${i} ${list} [${path}] area=${area.status} kept=${kept}`);
            if ((gated.withheld ?? 0) !== (kept ? 0 : 1))
              failures.push(`#${i} ${list} [${path}] withheld=${gated.withheld} kept=${kept}`);
          }
        }
      }
    });
    // All three families must actually have been exercised, or this test is
    // quietly only testing `areas.` again.
    expect(Array.from(spellingsSeen).sort()).toEqual(["actions", "areas", "coverage.missing"]);
    expect(checks).toBeGreaterThan(N * 6 * 2);
    expect(failures).toEqual([]);
  });

  it("paths with no area really do abstain, on every record", () => {
    // The other half of the same rule: widening the status map must not start
    // eating items whose citation genuinely carries no status.
    const failures: string[] = [];
    RECORDS.forEach((r, i) => {
      for (const path of ["monthsToBoard", "coverage.measured", "coverage.areasKnown"])
        for (const list of ["strengths", "gaps"] as const) {
          const gated = gateOne(r, list, `Claim. [${path}]`);
          if (gated[list].length !== 1) failures.push(`#${i} ${list} [${path}] dropped`);
        }
      for (const u of r.payload.unmet.slice(0, 2))
        if (gateOne(r, "gaps", `Claim. [unmet.${u.milestone_id}]`).gaps.length !== 1)
          failures.push(`#${i} gaps [unmet.${u.milestone_id}] dropped`);
    });
    expect(failures).toEqual([]);
  });

  it("an extra bracket group cannot switch the gate off, on any record", () => {
    // The R1 bypass, swept: the trailing group is stripped, but EVERY group is
    // checked, so appending a statusless one cannot launder a contradiction.
    const failures: string[] = [];
    RECORDS.forEach((r, i) => {
      for (const area of r.report.areas)
        for (const list of ["strengths", "gaps"] as const) {
          const gated = gateOne(r, list, `Claim. [areas.${area.key}] [monthsToBoard]`);
          const kept = gated[list].length === 1;
          if (kept !== EXPECT_KEEP[list][area.status])
            failures.push(`#${i} ${list} ${area.key}=${area.status} two-group kept=${kept}`);
        }
    });
    expect(failures).toEqual([]);
  });

  it("multi-path citations are unanimous across every pair of areas", () => {
    const failures: string[] = [];
    let checks = 0;
    RECORDS.forEach((r, i) => {
      const areas = r.report.areas;
      for (let a = 0; a < areas.length; a++)
        for (let b = a + 1; b < areas.length; b++) {
          const gated = gateOne(
            r,
            "strengths",
            `Pair claim. [areas.${areas[a].key}, areas.${areas[b].key}]`,
          );
          const want =
            EXPECT_KEEP.strengths[areas[a].status] && EXPECT_KEEP.strengths[areas[b].status];
          checks++;
          if ((gated.strengths.length === 1) !== want)
            failures.push(
              `#${i} ${areas[a].key}=${areas[a].status} + ${areas[b].key}=${areas[b].status}`,
            );
        }
    });
    expect(checks).toBe(N * 15);
    expect(failures).toEqual([]);
  });

  it("recommendations survive every status on every record", () => {
    // The no-regression half: the gate must not quietly start eating the list it
    // does not police.
    const failures: string[] = [];
    RECORDS.forEach((r, i) => {
      for (const area of r.report.areas) {
        const gated = gateOne(r, "recommendations" as any, `Do something. [areas.${area.key}]`);
        if (gated.recommendations.length !== 1) failures.push(`#${i} ${area.key}=${area.status}`);
        if ((gated.withheld ?? 0) !== 0) failures.push(`#${i} ${area.key} withheld≠0`);
      }
    });
    expect(failures).toEqual([]);
  });
});
