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
// THE POPULATION THE GATE REMOVAL LETS THROUGH.
//
// Deleting COVERAGE_FLOOR is a behaviour change, and "the record it was wrongly
// withholding" is one fixture, not a measurement. This sweeps a synthetic
// population and publishes who is newly scored.
//
// The old decision is RECONSTRUCTED rather than checked out, and exactly:
// before the removal a score was emitted iff (no verdict factor below
// AREA_EVIDENCE_FLOOR) AND (coverage >= 0.75). The blind-spot half is unchanged,
// so `oldScored = newScored && measured >= 0.75` — which makes the newly-scored
// population precisely {newScored AND measured < 0.75}. No mystery, and it is
// auditable from the two numbers the report already returns.
//
// ponytail: a seeded LCG over a hand-enumerated parameter space, not a property
// -testing library. It has to be deterministic and reviewable, and it is 20
// lines. If the space ever needs to be inferred from the types, reach for fast
// -check then.
// ---------------------------------------------------------------------------

describe("population — who is newly scored now that the aggregate floor is gone", () => {
  let seed = 20260731;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <X,>(xs: X[]): X => xs[Math.floor(rnd() * xs.length)];

  const sample = (): RubricInputs => {
    const n = pick([0, 1, 2, 3, 4, 5, 6]);
    const withGroup = rnd() < 0.6;
    const withIta = rnd() < 0.75;
    const rec = pick<PromotionRec>(["Early Promote", "Must Promote", "Promotable", "Progressing"]);
    const tours = pick([null, [], WEAK_TOURS, STRONG_TOURS]);
    const awards = pick([null, [], psrWith(null).awards]);
    const flags = pick([[], ALL_FLAGS.slice(0, 1), ALL_FLAGS.slice(0, 3), ALL_FLAGS]);
    const answered = pick([0, 2, 5]);
    return {
      boardDate: T,
      evals: Array.from({ length: n }, (_, i) =>
        ev(2026 - n + 1 + i, rec, withIta ? 4.0 + rnd() * 0.6 : 0, {
          trait_average: withIta ? 4.0 + rnd() * 0.6 : null,
          summary_group_average: withGroup ? 4.0 : null,
          ep_count: withGroup ? 0 : null,
          group_size: withGroup ? 10 : null,
        }),
      ),
      psr: psrWith(tours, {
        entered: rnd() < 0.8,
        awards,
        necs: rnd() < 0.7 ? [{ code: "742A", verified_in_ompf: true }] : null,
        education: rnd() < 0.6 ? [{ kind: "degree", title: "AS", verified_in_ompf: true }] : null,
        pfa: rnd() < 0.7 ? psrWith(null).pfa : [],
      }),
      ladr: LADR.slice(0, answered),
      preceptFlags: flags,
    };
  };

  const N = 4000;
  const rows = Array.from({ length: N }, sample).map((i) => {
    const r = scoreBoardConfidence(i, CFG);
    const rep = buildReadinessReport(r, i, CFG, { asOf: AS_OF });
    const blind = r.factors.filter(
      (f) => f.weight > 0 && f.confidence < AREA_EVIDENCE_FLOOR,
    );
    return { i, r, rep, blind, newScored: rep.score !== null };
  });

  const newly = rows.filter((x) => x.newScored && x.rep.coverage.measured < 0.75);
  const stillScored = rows.filter((x) => x.newScored && x.rep.coverage.measured >= 0.75);
  const withheld = rows.filter((x) => !x.newScored);

  it("publishes the population", () => {
    const pct = (k: number) => `${((100 * k) / N).toFixed(1)}%`;
    const cov = newly.map((x) => x.rep.coverage.measured).sort((a, b) => a - b);
    // eslint-disable-next-line no-console
    console.log(
      [
        "",
        `POPULATION (${N} synthetic records, seeded — rerun for the same numbers)`,
        `  scored before AND after            ${String(stillScored.length).padStart(5)}  ${pct(stillScored.length)}`,
        `  NEWLY SCORED (floor removal)       ${String(newly.length).padStart(5)}  ${pct(newly.length)}`,
        `  still withheld (a factor is blind) ${String(withheld.length).padStart(5)}  ${pct(withheld.length)}`,
        newly.length
          ? `  newly-scored coverage: min ${cov[0].toFixed(4)}  median ${cov[Math.floor(cov.length / 2)].toFixed(4)}  max ${cov[cov.length - 1].toFixed(4)}`
          : "  newly-scored coverage: n/a",
        "  what held them under 0.75 (lowest-confidence verdict factor):",
        ...Object.entries(
          newly.reduce<Record<string, number>>((acc, x) => {
            const weighted = x.r.factors.filter((f) => f.weight > 0);
            const low = weighted.reduce((a, f) => (f.confidence < a.confidence ? f : a), weighted[0]);
            acc[low.key] = (acc[low.key] ?? 0) + 1;
            return acc;
          }, {}),
        )
          .sort((a, b) => b[1] - a[1])
          .map(([k, v]) => `      ${k.padEnd(13)} ${String(v).padStart(4)}  ${pct(v)}`),
        "",
      ].join("\n"),
    );
  });

  it("every newly-scored record has EVERY verdict factor at least half observed", () => {
    // This is the whole claim. The removed gate was an aggregate; the surviving
    // one is per-factor, and it is the one that carries the meaning. Nobody in
    // this population is scored off a half-blind area.
    expect(newly.length).toBeGreaterThan(0);
    for (const x of newly) {
      expect(x.blind).toEqual([]);
      for (const f of x.r.factors)
        if (f.weight > 0) expect(f.confidence).toBeGreaterThanOrEqual(AREA_EVIDENCE_FLOOR);
    }
  });

  it("the removed floor was, in practice, a SECOND performance-confidence gate", () => {
    // The most useful thing the sweep found. In every one of the newly-scored
    // records the lowest-confidence verdict factor is `performance` — not one is
    // held under 0.75 by leadership or by the precept. The aggregate floor was
    // not measuring "too little of the record is entered"; it was measuring
    // "too little of the PERFORMANCE factor", which the per-factor rule already
    // governs at a threshold that was actually derived rather than fitted. That
    // is the coordinator's casualty generalised: four reports, everything else
    // entered, trait averages simply not typed -> conf_P 0.65, coverage 0.7455.
    for (const x of newly) {
      const weighted = x.r.factors.filter((f) => f.weight > 0);
      const low = weighted.reduce((a, f) => (f.confidence < a.confidence ? f : a), weighted[0]);
      expect(low.key).toBe("performance");
    }
  });

  it("nobody newly scored is thin in the way the old floor was aimed at", () => {
    // The floor's stated purpose was "at most a quarter of the weighted record
    // may be scored as zeros it did not earn". No newly-scored record has ANY
    // unearned zeros — that is what the denominator change removed — and the
    // lowest coverage any of them reaches is bounded by the per-factor rule.
    const minCov = Math.min(...newly.map((x) => x.rep.coverage.measured));
    expect(minCov).toBeGreaterThanOrEqual(AREA_EVIDENCE_FLOOR);
    // …and they are not empty records sneaking through: an empty one has a blind
    // factor and stays withheld.
    const empty: RubricInputs = {
      boardDate: T, evals: [], ladr: [], preceptFlags: [],
      psr: { entered: false, awards: null, necs: null, education: null, tours: null, pfa: null, adverse: [] },
    };
    expect(buildReadinessReport(scoreBoardConfidence(empty, CFG), empty, CFG, { asOf: AS_OF }).score).toBeNull();
  });

  it("the reconstruction of the old gate is exact, not an approximation", () => {
    // If this drifts, every number above is wrong. oldScored ≡ newScored AND
    // coverage >= 0.75, because the blind-spot half of the old gate is the whole
    // of the new one.
    for (const x of rows) {
      const oldScored = x.blind.length === 0 && x.rep.coverage.measured >= 0.75;
      const newScored = x.blind.length === 0;
      expect(x.newScored).toBe(newScored);
      if (oldScored) expect(newScored).toBe(true); // strictly a widening
    }
  });
});
