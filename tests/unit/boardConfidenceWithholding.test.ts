// tests/unit/boardConfidenceWithholding.test.ts
//
// THE PUBLISHED FIXTURES. Every before/after figure quoted in PR #37 is produced
// here, by name, and asserted — so a reviewer can reproduce the table instead of
// reconstructing a record from prose. An earlier revision of that PR quoted four
// headline pairs whose fixtures existed only in a scratch file; a reviewer
// rebuilding them from the descriptions got materially different magnitudes.
// The properties reproduced; the numbers could not. That is the wrong note to
// strike in a PR about arithmetic honesty, so the fixtures live in the repo now.
//
// Run `npx vitest run tests/unit/boardConfidenceWithholding.test.ts` to print the
// whole table.

import { describe, it, expect } from "vitest";
import { scoreBoardConfidence, DEFAULT_RUBRIC_CONFIG as CFG } from "@/lib/boardConfidence/rubric";
import { buildReadinessReport, AREA_EVIDENCE_FLOOR } from "@/lib/boardConfidence/readiness";
import type {
  LadrItemInput,
  PreceptFlag,
  PromotionRec,
  PsrSection,
  RubricEvalInput,
  RubricInputs,
} from "@/lib/boardConfidence/types";

const T = "2026-09-01";
const AS_OF = "2026-04-01";
const ALL_FLAGS: PreceptFlag[] = [
  "warfighting", "leadership_positions", "education", "sea_duty", "technical_expertise",
];

/** One annual report ending 15 Mar of `endYear`, against a real summary group. */
const ev = (
  endYear: number,
  rec: PromotionRec,
  ita: number,
  o: Partial<RubricEvalInput> = {},
): RubricEvalInput => ({
  period_from: `${endYear - 1}-03-16`,
  period_to: `${endYear}-03-15`,
  report_type: "EVAL",
  promotion_recommendation: rec,
  trait_average: ita,
  summary_group_average: 4.0,
  rsca: null,
  sea_duty: false,
  ep_count: 0,
  group_size: 10,
  ...o,
});

const LADR: LadrItemInput[] = [
  { milestone_id: "w", category: "qual_warfare", status: "met", verified_in_ompf: true, item: "EIWS" },
  { milestone_id: "e", category: "education_degree", status: "met", verified_in_ompf: true, item: "AS" },
  { milestone_id: "c", category: "credential", status: "not_met", verified_in_ompf: false, item: "Security+" },
  { milestone_id: "n", category: "nec_opportunity", status: "met", verified_in_ompf: true, item: "NEC 742A" },
  { milestone_id: "r", category: "qual_rate_specific", status: "met", verified_in_ompf: true, item: "Rate quals" },
];

/** A fully-entered PSR; `tours` is the variable under test. */
const psrWith = (tours: PsrSection["tours"], over: Partial<PsrSection> = {}): PsrSection => ({
  entered: true,
  awards: [{ title: "NAM", level: "personal_achievement", date_awarded: "2024-01-01", verified_in_ompf: true }],
  necs: [{ code: "742A", verified_in_ompf: true }],
  education: [{ kind: "degree", title: "AS", verified_in_ompf: true }],
  tours,
  pfa: [
    { cycle: "a", date: "2024-04-01", result: "pass" },
    { cycle: "b", date: "2024-10-01", result: "pass" },
    { cycle: "c", date: "2025-04-01", result: "pass" },
  ],
  adverse: [],
  ...over,
});

/** A shore tour with no sea duty and no leadership billet: honest, and weak. */
const WEAK_TOURS = [{ title: "Shore", start: "2021-01-01", end: null, sea_duty: false, leadership: false }];
/** Sea duty plus a leadership billet — the case where AWARDS are the weak part. */
const STRONG_TOURS = [
  { title: "Sea", start: "2020-01-01", end: "2024-01-01", sea_duty: true, leadership: true },
  { title: "Shore", start: "2024-01-02", end: null, sea_duty: false, leadership: true },
];

const record = (o: Partial<RubricInputs> = {}): RubricInputs => ({
  boardDate: T,
  evals: [2022, 2023, 2024, 2025, 2026].map((y) => ev(y, "Must Promote", 4.3)),
  psr: psrWith(WEAK_TOURS),
  ladr: LADR,
  preceptFlags: ALL_FLAGS,
  ...o,
});

type Row = { final: number; coverage: number; shown: boolean };
const measure = (i: RubricInputs): Row => {
  const r = scoreBoardConfidence(i, CFG);
  const rep = buildReadinessReport(r, i, CFG, { asOf: AS_OF });
  return { final: r.final, coverage: rep.coverage.measured, shown: rep.score !== null };
};

const table: string[] = [];
const row = (label: string, i: RubricInputs): Row => {
  const m = measure(i);
  table.push(
    `${label.padEnd(46)} final ${String(m.final).padStart(5)}   coverage ${m.coverage.toFixed(4)}   ${m.shown ? "SHOWN" : "withheld"}`,
  );
  return m;
};

describe("published fixtures — what withholding is worth, and what stops it", () => {
  it("A. blanking a weak tours section — caught", () => {
    const honest = row("tours entered (shore, no sea, no lead)", record());
    const blanked = row("tours: null — section blanked", record({ psr: psrWith(null) }));

    // The raw number rises and cannot be made not to: the numerator is identical
    // and only the denominator shrinks, because the sub-scores that vanish are
    // the low ones. The gate is what makes it worthless — HERE.
    expect(blanked.final).toBeGreaterThan(honest.final);
    expect(honest.shown).toBe(true);
    expect(blanked.shown).toBe(false);
    expect(blanked.coverage).toBeLessThan(honest.coverage);
  });

  it("A2. blanking the AWARDS section instead — NOT caught, one line over", () => {
    // Leadership has exactly two removable sections: tours at sub-weight 0.70
    // and awards at 0.30. AREA_EVIDENCE_FLOOR = 0.50 sits between them, so it
    // catches one and not the other — and so would any floor in (0.30, 0.70].
    // This is the counter-example to "the gate binds where it must". It is a
    // sibling of fixture A and it is published for that reason.
    const honest = row("awards entered", record());
    const blanked = row("awards: null — section blanked", record({ psr: psrWith(WEAK_TOURS, { awards: null }) }));

    expect(blanked.final).toBeGreaterThan(honest.final);
    expect(blanked.shown).toBe(true); // <- the gate does NOT stop this one
    expect(
      scoreBoardConfidence(record({ psr: psrWith(WEAK_TOURS, { awards: null }) }), CFG)
        .factors.find((f) => f.key === "leadership")!.confidence,
    ).toBe(0.7);
  });

  it("A3. unlinking the summary group — NOT caught, and it is a dropdown", () => {
    // EvaluationForm's summary-group selector. Dropping it removes P4 outright
    // (a_P 1.00 -> 0.85) and pushes P2 onto the absolute fallback scale. conf_P
    // stays far above any usable floor, so the removal converts straight into
    // score. Sub-component removal is invisible to a gate that reads factors.
    const linked = row("summary group linked", record({ psr: psrWith(STRONG_TOURS) }));
    const unlinked = row(
      "summary group unlinked (a dropdown)",
      record({
        psr: psrWith(STRONG_TOURS),
        evals: [2022, 2023, 2024, 2025, 2026].map((y) =>
          ev(y, "Must Promote", 4.3, { summary_group_average: null, ep_count: null, group_size: null }),
        ),
      }),
    );
    expect(unlinked.shown).toBe(true);
    expect(linked.shown).toBe(true);
  });

  it("A4. refusing to answer beats answering honestly", () => {
    // `awards: []` is "I have no awards" and scores L2 = 0 at full confidence.
    // `awards: null` is "I did not fill this in" and drops L2 entirely. The
    // honest answer is the one that costs.
    const strong = (o: Partial<PsrSection>) => record({ psr: psrWith(STRONG_TOURS, o) });
    const entered = row("awards entered", strong({}));
    const none = row("awards [] — honest 'I have none'", strong({ awards: [] }));
    const refused = row("awards null — refused to answer", strong({ awards: null }));

    expect(none.final).toBeLessThan(entered.final);
    expect(refused.final).toBeGreaterThan(none.final);
    expect(refused.shown).toBe(true);
  });

  it("B. deleting a declining report — NOT closable, and it is scored", () => {
    const declining = record({
      evals: [ev(2023, "Must Promote", 4.3), ev(2024, "Must Promote", 4.3), ev(2025, "Must Promote", 4.3), ev(2026, "Promotable", 3.9)],
    });
    const withAll = row("4 reports including a decline", declining);
    const deleted = row("the declining report deleted", { ...declining, evals: declining.evals.slice(0, 3) });

    // Performance grades the reports it HAS. APEX cannot know about one that was
    // never typed, so this is the irreducible case — and both ends are scored.
    expect(deleted.final).toBeGreaterThan(withAll.final);
    expect(withAll.shown).toBe(true);
    expect(deleted.shown).toBe(true);
  });

  it("C. omitting adverse material — the largest, and invisible to coverage", () => {
    const disclosed = record({
      psr: psrWith(WEAK_TOURS, {
        adverse: [{ kind: "njp", date: "2025-01-01" }],
        pfa: [
          { cycle: "a", date: "2025-04-01", result: "fail" },
          { cycle: "b", date: "2024-10-01", result: "pass" },
          { cycle: "c", date: "2024-04-01", result: "pass" },
        ],
      }),
    });
    const withNjp = row("NJP + PFA failure disclosed", disclosed);
    const omitted = row("both omitted", record());

    // 25 points, and coverage is IDENTICAL at both ends — adverse material has no
    // "section entered" flag that can be missing. Genuinely pre-existing: exactly
    // 25.0 on `main` too, at coverage 1.0000 on both trees.
    //
    // ONE CORRECTION to an earlier claim of "unchanged": dropping a PFA failure
    // that also takes the record under three PFA rows is +10.0 here against +8.9
    // on main, because `completeness` no longer pushes back on the missing rows.
    // A widening, small, and disclosed rather than rounded to "unchanged".
    expect(omitted.final - withNjp.final).toBe(25);
    expect(omitted.coverage).toBe(withNjp.coverage);
    expect(withNjp.shown).toBe(true);
    expect(omitted.shown).toBe(true);
  });

  it("D. hiding a reporting gap — closed, because continuity carries no weight", () => {
    const seaTours = [{ title: "Sea", start: "2020-01-01", end: null, sea_duty: true, leadership: true }];
    const gapped = record({
      evals: [ev(2022, "Must Promote", 4.3), ev(2026, "Must Promote", 4.3)],
      psr: psrWith(seaTours),
    });
    const visible = row("both reports entered (2-year gap visible)", gapped);
    const hiddenR = row("older report deleted (gap hidden)", { ...gapped, evals: [gapped.evals[1]] });

    const contOf = (i: RubricInputs) =>
      scoreBoardConfidence(i, CFG).factors.find((f) => f.key === "continuity")!;
    // S_C still swings 25 -> 100, and contributes 0 at both ends.
    expect(contOf({ ...gapped, evals: [gapped.evals[1]] }).score).toBeGreaterThan(contOf(gapped).score);
    expect(contOf(gapped).contribution).toBe(0);
    expect(Math.abs(hiddenR.final - visible.final)).toBeLessThan(1);
  });

  it("E. the gate catches ONE of these five, and that is the whole claim", () => {
    // RETRACTED TITLE. This test used to be called "the gate is what does the
    // work, and it binds where it must". It does not bind where it must —
    // fixture A2 is a counter-example one line away, and A3 and B are two more.
    // A PR arguing for arithmetic honesty cannot ship a passing test asserting a
    // property its own engine violates. What the gate actually does:
    const blanked = scoreBoardConfidence(record({ psr: psrWith(null) }), CFG);
    const lead = blanked.factors.find((f) => f.key === "leadership")!;
    expect(lead.confidence).toBeLessThan(AREA_EVIDENCE_FLOOR);
    expect(lead.confidence).toBeGreaterThan(0.25); // it cleared the OLD 0.25 floor

    // …and here is the honest score line: of the five removals published above,
    // exactly one is stopped. No value of the floor changes that — see the
    // sub-weight argument on AREA_EVIDENCE_FLOOR and the proof on
    // scoreBoardConfidence that no scoring rule closes the class.
    const caught = [
      measure(record({ psr: psrWith(null) })),                                    // A  tours
      measure(record({ psr: psrWith(WEAK_TOURS, { awards: null }) })),            // A2 awards
      measure(record({ psr: psrWith(STRONG_TOURS, { awards: null }) })),          // A4 refusal
    ].filter((m) => !m.shown).length;
    expect(caught).toBe(1);

    // eslint-disable-next-line no-console
    console.log("\n" + table.join("\n") + "\n");
  });
});

// ---------------------------------------------------------------------------
// THE EFFECT OF RETIRING THE AGGREGATE FLOOR — correctly scoped.
//
// An earlier revision of this block claimed to reconstruct `main`'s decision as
// `newScored && newCoverage >= 0.75`. It does not. `coverage.measured` runs over
// the EFFECTIVE verdict weights and this PR zeroes three of six, so the two
// engines compute a different quantity under the same name; substituting one
// into the other's gate reconstructs nothing. Measured through both engines side
// by side over 8,000 decorrelated records, that reconstruction disagreed with
// main's real decision 888 times.
//
// Worse, the test that asserted the equivalence used only new-engine values and
// reduced to `if (blind.length === 0 && cov >= 0.75) expect(blind.length === 0)
// .toBe(true)` — true under every possible change, including the one it existed
// to detect. Deleted. What remains below is scoped to what it can actually see.
//
// The true main-vs-PR figures (889 newly scored, 0 newly withheld — a strict
// widening) are NOT pinned here: they need a vendored copy of main's engine,
// which does not belong in the repo. They are reported in the PR as a
// measurement, and the mechanism behind them is separately pinned — development
// carries weight 0, so it cannot trip the blind-spot gate, which is what
// suppressed those records on main.
//
// ponytail: a seeded LCG over a hand-enumerated parameter space, not a
// property-testing library. It has to be deterministic and reviewable, and it is
// 20 lines. Reach for fast-check if the space ever needs inferring from types.
// ---------------------------------------------------------------------------

describe("retiring the aggregate floor — measured inside this engine", () => {
  let seed = 20260731;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <X,>(xs: X[]): X => xs[Math.floor(rnd() * xs.length)];

  // DECORRELATED. The previous generator coupled the summary-group average with
  // breakout presence and drew tours/awards from small categorical sets, which is
  // why one cell below read 100% and could not have read anything else.
  const sample = (): RubricInputs => {
    const n = pick([0, 1, 2, 3, 4, 5, 6]);
    const withSga = rnd() < 0.55;
    const withGrp = rnd() < 0.55;
    const withIta = rnd() < 0.7;
    const nLadr = pick([0, 1, 2, 3, 4, 5]);
    const nFlags = pick([0, 1, 2, 3, 4, 5]);
    return {
      boardDate: T,
      evals: Array.from({ length: n }, (_, i) =>
        ev(2026 - n + 1 + i, pick<PromotionRec>(["Early Promote", "Must Promote", "Promotable", "Progressing"]), 0, {
          trait_average: withIta ? 4.0 + rnd() * 0.6 : null,
          summary_group_average: withSga ? 4.0 : null,
          ep_count: withGrp ? 0 : null,
          group_size: withGrp ? 10 : null,
        }),
      ),
      psr: psrWith(pick([null, [], WEAK_TOURS, STRONG_TOURS]), {
        entered: rnd() < 0.8,
        awards: pick([null, [], psrWith(null).awards]),
        necs: rnd() < 0.6 ? [{ code: "742A", verified_in_ompf: true }] : null,
        education: rnd() < 0.6 ? [{ kind: "degree", title: "AS", verified_in_ompf: true }] : null,
        pfa: rnd() < 0.6 ? psrWith(null).pfa : [],
      }),
      ladr: LADR.slice(0, nLadr),
      preceptFlags: ALL_FLAGS.slice(0, nFlags),
    };
  };

  const N = 8000;
  const rows = Array.from({ length: N }, sample).map((i) => {
    const r = scoreBoardConfidence(i, CFG);
    const rep = buildReadinessReport(r, i, CFG, { asOf: AS_OF });
    return { r, rep, scored: rep.score !== null };
  });
  // The one thing this file CAN measure honestly: who a re-imposed 0.75 aggregate
  // floor would take away from the records this engine scores today.
  const wouldLose = rows.filter((x) => x.scored && x.rep.coverage.measured < 0.75);

  it("publishes what a re-imposed 0.75 floor would cost", () => {
    const cov = wouldLose.map((x) => x.rep.coverage.measured).sort((a, b) => a - b);
    const tally = wouldLose.reduce<Record<string, number>>((acc, x) => {
      const w = x.r.factors.filter((f) => f.weight > 0);
      const low = w.reduce((a, f) => (f.confidence < a.confidence ? f : a), w[0]);
      acc[low.key] = (acc[low.key] ?? 0) + 1;
      return acc;
    }, {});
    // eslint-disable-next-line no-console
    console.log(
      [
        "",
        `RE-IMPOSING A 0.75 AGGREGATE FLOOR (${N} decorrelated records, seeded)`,
        `  scored today                       ${String(rows.filter((x) => x.scored).length).padStart(5)}`,
        `  …of those, it would withhold       ${String(wouldLose.length).padStart(5)}`,
        `  their coverage: min ${cov[0]?.toFixed(4)}  median ${cov[Math.floor(cov.length / 2)]?.toFixed(4)}  max ${cov[cov.length - 1]?.toFixed(4)}`,
        `  lowest-confidence verdict factor among them: ${JSON.stringify(tally)}`,
        "",
      ].join("\n"),
    );
    expect(wouldLose.length).toBeGreaterThan(0);
  });

  it("every one of them has EVERY verdict factor at least half observed", () => {
    // The claim the deletion rests on: the aggregate floor was taking records
    // away from Sailors with nothing blind. Non-vacuous — it reads each factor's
    // own confidence, and the set is non-empty by the assertion above.
    for (const x of wouldLose)
      for (const f of x.r.factors)
        if (f.weight > 0) expect(f.confidence).toBeGreaterThanOrEqual(AREA_EVIDENCE_FLOOR);
  });

  it("with NO precept loaded, performance is provably the binding factor", () => {
    // SCOPED, because the unqualified version was a generator artefact. With no
    // precept the verdict is performance 40 and leadership 15, rescaled ×100/55,
    // so coverage = (40·cP + 15·cL)/55. conf_L ∈ {0.3, 0.7, 1.0} and 0.3 blinds,
    // so a scored record has cL ∈ {0.7, 1.0}. For leadership to be the lower of
    // the two AND coverage < 0.75 needs cP ∈ (0.7, 0.769) — and conf_P is
    // a_P·min(1, N/3) over a_P ∈ {0.35, 0.5, 0.65, 0.7, 0.85, 1.0}, which has no
    // value in that interval. Unsatisfiable, hence 100% and not by luck.
    //
    // With a precept LOADED it does not hold universally — the reviewer measured
    // 55 of 216 held by precept on a differently-shaped generator. No-precept is
    // every real user today (hosted board_precepts is empty), but v1.6 shipped
    // real MyNavyHR precept fetch, so that regime is arriving.
    const noPrecept = wouldLose.filter((x) => x.r.factors.find((f) => f.key === "precept")!.weight === 0);
    expect(noPrecept.length).toBeGreaterThan(0);
    for (const x of noPrecept) {
      const w = x.r.factors.filter((f) => f.weight > 0);
      const low = w.reduce((a, f) => (f.confidence < a.confidence ? f : a), w[0]);
      expect(low.key).toBe("performance");
    }
  });

  it("NO scored report ever labels a weight-carrying area 'not entered'", () => {
    // The precept card defect, generalised and pinned. With two flags configured
    // and no LaDR, `precept` contributed 3.85 weighted points to an emitted score
    // of 64.9 while its card rendered the dashed "Not entered" pill, said "APEX
    // cannot check the emphasis areas", and listed itself under Missing. APEX had
    // checked them, and the check moved the score: scored data shown as missing —
    // this epic's own defect class, inverted.
    //
    // The cause was two different rules for one question: `statusOf` demanded
    // EVERY configured flag be computable while the arithmetic used the fraction.
    // They are the same rule now, and this asserts the agreement across the whole
    // population rather than on one fixture. It is what kills both the
    // all-or-nothing precept predicate and a `<=` slip on the statusOf boundary
    // (conf exactly 0.500 is reachable — a two-flag precept with one computable
    // indicator — and both comparisons must grade it).
    let checked = 0;
    for (const x of rows) {
      if (!x.scored) continue;
      for (const area of x.rep.areas) {
        if (area.detail.weight === 0) continue;
        checked++;
        expect(area.status).not.toBe("not_enough_entered");
      }
      for (const m of x.rep.coverage.missing) {
        const a = x.rep.areas.find((y) => y.key === m.area)!;
        expect(a.detail.weight).toBe(0);
      }
    }
    expect(checked).toBeGreaterThan(1000); // not vacuous
  });

  it("an empty record is still withheld, by the per-factor rule alone", () => {
    const empty: RubricInputs = {
      boardDate: T, evals: [], ladr: [], preceptFlags: [],
      psr: { entered: false, awards: null, necs: null, education: null, tours: null, pfa: null, adverse: [] },
    };
    expect(buildReadinessReport(scoreBoardConfidence(empty, CFG), empty, CFG, { asOf: AS_OF }).score).toBeNull();
  });
});
