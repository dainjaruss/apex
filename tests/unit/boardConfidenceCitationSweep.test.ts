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
  type ModelNarrative,
  type SubjectKey,
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

/**
 * One item through the gate. `subject` defaults to `record`, which ABSTAINS from
 * the subject rule — so every sweep below that was written for the CITATION rule
 * still measures the citation rule and nothing else. The subject rule has its own
 * sweep and its own contradiction table.
 */
const gateOne = (
  r: (typeof RECORDS)[number],
  list: "strengths" | "gaps" | "recommendations",
  text: string,
  subject: SubjectKey = "record",
) => {
  const model: ModelNarrative = {
    strengths: [],
    gaps: [],
    recommendations: [],
    factor_commentary: r.det.factor_commentary,
  };
  if (list === "recommendations") model.recommendations = [text];
  else model[list] = [{ text, subject }];
  return applyCitationGate(model, r.payload, r.det);
};

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

  // ── The subject rule ──────────────────────────────────────────────────────
  //
  // What the path rule alone could never see: the area the prose is ABOUT. Each
  // row below is a strengths item praising an area the report says is weak — the
  // shape that shipped live, with `withheld === 0`, one viewport above a card
  // reading NEEDS ATTENTION.
  //
  // The table is the honest scoreboard, not a pass list. It names which rows the
  // gate catches AND which it still does not, because "closed" here would be a
  // claim no structural check can support: `subject` is the model's own assertion
  // about its own output, so a model that lies twice still gets through.

  /**
   * A weak area (for a strengths claim) and TWO healthy ones, on the same record.
   *
   * Two healthy areas, not one, because the two rules catch different things and
   * a fixture with one healthy area cannot tell them apart. S1 fires whenever the
   * subject area's own status disagrees, which covers most of the table on its
   * own; S2 only decides the case where the subject area is perfectly healthy and
   * the citation names a DIFFERENT healthy area. Written against a single strong
   * area, three separate S2 mutants survived this suite.
   */
  const polarised = RECORDS.map((r) => {
    const healthy = r.report.areas.filter((a) => EXPECT_KEEP.strengths[a.status]);
    return {
      r,
      weak: r.report.areas.find((a) => !EXPECT_KEEP.strengths[a.status]),
      strong: healthy[0],
      strong2: healthy[1],
    };
  }).filter((x) => x.weak && x.strong && x.strong2);

  it("the sweep reaches records carrying a weak area and two healthy ones at once", () => {
    // Without such a record there is no contradiction to construct and every row
    // below would pass vacuously.
    expect(polarised.length).toBeGreaterThan(20);
  });

  it("scores the contradiction table — every row, caught or named", () => {
    // Each row: how the model dresses a strengths claim about `weak`, except the
    // two S2 rows, which are claims about `strong` citing `strong2` — a
    // misattributed citation between two areas the status rule is happy with, so
    // S1 abstains and only coherence can see it.
    const ROWS: Array<{
      name: string;
      subjectArea: "weak" | "strong";
      cite: (a: {
        weak: string;
        strong: string;
        strong2: string;
        r: (typeof RECORDS)[number];
      }) => string;
      subject: (
        area: string,
        k: { weak: string; strong: string; strong2: string },
      ) => SubjectKey;
      caught: boolean;
    }> = [
      // ── caught before this change, by the path rule alone ──
      {
        name: "cites the weak area honestly",
        subjectArea: "weak",
        cite: ({ weak }) => `[areas.${weak}]`,
        subject: (a) => a as SubjectKey,
        caught: true,
      },
      {
        name: "cites the weak area, subject `record`",
        subjectArea: "weak",
        cite: ({ weak }) => `[areas.${weak}]`,
        subject: () => "record",
        caught: true,
      },
      {
        name: "cites weak + healthy together",
        subjectArea: "weak",
        cite: ({ weak, strong }) => `[areas.${weak}, areas.${strong}]`,
        subject: (a) => a as SubjectKey,
        caught: true,
      },
      {
        name: "cites the weak area, then a statusless second group",
        subjectArea: "weak",
        cite: ({ weak }) => `[areas.${weak}] [monthsToBoard]`,
        subject: () => "record",
        caught: true,
      },
      // ── used to survive; caught by S1, the subject's own status ──
      {
        // Caught TWICE over — S1 on the subject's own status, and independently
        // by S2, since the subject is not among the cited areas. Named rather
        // than filed under S1 alone: this file's whole argument is that rows get
        // credited to the wrong rule unless someone checks.
        name: "S1+S2: cites a healthy area for a claim about the weak one",
        subjectArea: "weak",
        cite: ({ strong }) => `[areas.${strong}]`,
        subject: (a) => a as SubjectKey,
        caught: true,
      },
      {
        name: "S1: cites monthsToBoard",
        subjectArea: "weak",
        cite: () => "[monthsToBoard]",
        subject: (a) => a as SubjectKey,
        caught: true,
      },
      {
        name: "S1: cites coverage.measured",
        subjectArea: "weak",
        cite: () => "[coverage.measured]",
        subject: (a) => a as SubjectKey,
        caught: true,
      },
      {
        name: "S1: cites an unmet milestone",
        subjectArea: "weak",
        cite: ({ r }) =>
          r.payload.unmet.length ? `[unmet.${r.payload.unmet[0].milestone_id}]` : "",
        subject: (a) => a as SubjectKey,
        caught: true,
      },
      // ── used to survive; caught by S2, coherence. S1 abstains on these: both
      //    areas are healthy, so nothing about a STATUS is wrong — only the
      //    provenance is, and the bracket is read as provenance.
      {
        name: "S2: a claim about one healthy area citing a different healthy one",
        subjectArea: "strong",
        cite: ({ strong2 }) => `[areas.${strong2}]`,
        subject: (a) => a as SubjectKey,
        caught: true,
      },
      {
        name: "S2: the same, hidden behind a statusless trailing group",
        subjectArea: "strong",
        cite: ({ strong2 }) => `[areas.${strong2}] [monthsToBoard]`,
        subject: (a) => a as SubjectKey,
        caught: true,
      },
      // ── the residual, stated rather than hidden ──
      //
      // ONE CLASS, FOUR MEMBERS. An earlier revision of this table listed only
      // the two `record` rows, which reads as though that one dodge is the whole
      // hole. It is not: declaring a HEALTHY AREA and citing that same area is
      // identical in effect and needs no `record` at all. The class is "any
      // declared subject that is false about the prose but healthy for its
      // valence and consistent with its own citation"; `record` is merely its
      // cheapest member. Enumerate the class, not its laziest instance.
      {
        name: "RESIDUAL: statusless citation AND subject declared `record`",
        subjectArea: "weak",
        cite: () => "[monthsToBoard]",
        subject: () => "record",
        caught: false,
      },
      {
        name: "RESIDUAL: cites a healthy area AND calls the subject `record`",
        subjectArea: "weak",
        cite: ({ strong }) => `[areas.${strong}]`,
        subject: () => "record",
        caught: false,
      },
      {
        name: "RESIDUAL: declares a healthy AREA as the subject, and cites it",
        subjectArea: "weak",
        cite: ({ strong }) => `[areas.${strong}]`,
        subject: (_a, k) => k.strong as SubjectKey,
        caught: false,
      },
      {
        name: "RESIDUAL: declares a healthy AREA as the subject, cites nothing with a status",
        subjectArea: "weak",
        cite: () => "[monthsToBoard]",
        subject: (_a, k) => k.strong as SubjectKey,
        caught: false,
      },
    ];

    const failures: string[] = [];
    const rowChecks = new Map<string, number>();
    for (const { r, weak, strong, strong2 } of polarised) {
      const keys = { weak: weak!.key, strong: strong!.key, strong2: strong2!.key, r };
      for (const row of ROWS) {
        const cite = row.cite(keys);
        if (!cite) continue; // this record has no unmet milestone to cite
        const about = keys[row.subjectArea];
        rowChecks.set(row.name, (rowChecks.get(row.name) ?? 0) + 1);
        const gated = gateOne(
          r,
          "strengths",
          `Your ${about} record stands out. ${cite}`,
          row.subject(about, keys),
        );
        const survived = gated.strengths.length === 1;
        if (survived === row.caught)
          failures.push(`${row.name}: about=${about} weak=${weak!.status} survived=${survived}`);
      }
    }
    // Every row was actually exercised — a row that never ran is not a row that passed.
    for (const row of ROWS)
      expect(rowChecks.get(row.name) ?? 0, `row never ran: ${row.name}`).toBeGreaterThan(0);
    expect(failures.slice(0, 10)).toEqual([]);

    // The scoreboard, asserted so it cannot drift silently: 10 of 14 caught, and
    // every survivor needs the model to make a SECOND false statement in a field
    // whose only purpose is to be checked. The survivor LIST is asserted by name,
    // not just counted — an incomplete scoreboard is worse than no scoreboard,
    // and this one was incomplete until a reviewer constructed the two
    // healthy-area rows it did not contain.
    expect(ROWS.filter((x) => x.caught)).toHaveLength(10);
    expect(ROWS.filter((x) => !x.caught).map((x) => x.name)).toEqual([
      "RESIDUAL: statusless citation AND subject declared `record`",
      "RESIDUAL: cites a healthy area AND calls the subject `record`",
      "RESIDUAL: declares a healthy AREA as the subject, and cites it",
      "RESIDUAL: declares a healthy AREA as the subject, cites nothing with a status",
    ]);
  });

  it("an honest subject on a healthy area is not collateral damage", () => {
    // The other direction, and the one that decides whether this rule is
    // shippable: requiring an area CITATION was rejected because it deleted
    // legitimate items. The subject rule must not re-introduce that.
    const failures: string[] = [];
    RECORDS.forEach((r, i) => {
      for (const area of r.report.areas)
        for (const list of ["strengths", "gaps"] as const) {
          // Honest: subject names the area, citation names the same area.
          const honest = gateOne(
            r,
            list,
            `Claim about ${area.key}. [areas.${area.key}]`,
            area.key,
          );
          if ((honest[list].length === 1) !== EXPECT_KEEP[list][area.status])
            failures.push(`#${i} ${list} honest ${area.key}=${area.status}`);
        }
      // And the item the rejected rule would have deleted: about the record as a
      // whole, citing a statusless path, subject `record`. Must survive.
      for (const list of ["strengths", "gaps"] as const)
        if (gateOne(r, list, "APEX could see most of your record. [coverage.measured]")[list].length !== 1)
          failures.push(`#${i} ${list} breadth item dropped`);
    });
    expect(failures).toEqual([]);
  });

  it("S2 abstains when the item cites no area at all — it is not the rejected rule", () => {
    // The line between this and the rule that WAS rejected. "Every strengths/gaps
    // item must cite an area" would delete an honest claim about a healthy area
    // that happens to cite a statusless path; S2 only fires when there IS a cited
    // area to disagree with. Tightening `citedAreas.size === 0 || …` into a bare
    // `citedAreas.has(subject)` re-introduces exactly the rejected rule, so this
    // is the assertion standing between the two.
    const failures: string[] = [];
    for (const { r, strong } of polarised)
      for (const path of ["monthsToBoard", "coverage.measured"])
        if (
          gateOne(r, "strengths", `Your ${strong!.key} record is solid. [${path}]`, strong!.key)
            .strengths.length !== 1
        )
          failures.push(`${strong!.key}=${strong!.status} [${path}] dropped`);
    expect(failures).toEqual([]);
  });

  it("recommendations survive every status on every record", () => {
    // The no-regression half: the gate must not quietly start eating the list it
    // does not police.
    const failures: string[] = [];
    RECORDS.forEach((r, i) => {
      for (const area of r.report.areas) {
        const gated = gateOne(r, "recommendations", `Do something. [areas.${area.key}]`);
        if (gated.recommendations.length !== 1) failures.push(`#${i} ${area.key}=${area.status}`);
        if ((gated.withheld ?? 0) !== 0) failures.push(`#${i} ${area.key} withheld≠0`);
      }
    });
    expect(failures).toEqual([]);
  });
});
