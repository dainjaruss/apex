// tests/unit/boardConfidenceReadiness.test.ts
//
// v2 readiness layer (epic §3.4b, revised after the PR #21 domain review) —
// buildReadinessReport, bandDeltas, and scoreLadr's unmet output.
//
// The layer was built because rubric.ts summed (weight/100)·S·conf against a
// FIXED denominator of 100, so "we have no data" (conf = 0) and "the record is
// bad" (S = 0) were numerically identical. That is fixed in the engine now — the
// composite renormalizes by Σ(weight·conf) — and the tests below that used to
// pin the defect so the layer could work around it now pin its ABSENCE. The
// layer is still load-bearing: it decides whether a number may be SHOWN at all,
// which is a different question from whether the number is right.
//
// Most of these pin a SENTENCE, not a number. The domain review found the
// arithmetic sound and the strings bolted to it wrong, so the regressions worth
// guarding are: a three-year Sailor told their record has gaps; a Sailor with
// four years of sea duty told the board's emphasis is missing from their record,
// from a precept APEX modeled; a flawless record scored off 15 points of earned
// zeros; and a self-ticked checkbox priced as if it were verification.

import { describe, it, expect } from "vitest";
import {
  bandDeltas,
  scoreBoardConfidence,
  DEFAULT_RUBRIC_CONFIG,
} from "@/lib/boardConfidence/rubric";
import {
  buildReadinessReport,
  COVERAGE_FLOOR,
  AREA_EVIDENCE_FLOOR,
  PRECEPT_UNSOURCED_PREFIX,
  type AreaStatus,
  type ReadinessOptions,
} from "@/lib/boardConfidence/readiness";
import { BOARD_DISCLAIMER } from "@/lib/boardConfidence/types";
import type {
  LadrItemInput,
  PreceptFlag,
  PromotionRec,
  PsrSection,
  RubricEvalInput,
  RubricInputs,
} from "@/lib/boardConfidence/types";

const T = "2026-09-01";
const AS_OF = "2026-04-01"; // 5 months to the board; the engine reads no clock
const CFG = DEFAULT_RUBRIC_CONFIG;

const ALL_FLAGS: PreceptFlag[] = [
  "warfighting",
  "leadership_positions",
  "education",
  "sea_duty",
  "technical_expertise",
];

const emptyPsr: PsrSection = {
  entered: false,
  awards: null,
  necs: null,
  education: null,
  tours: null,
  pfa: null,
  adverse: [],
};

/** One annual report ending 15 Mar of `endYear`. */
const annual = (endYear: number, rec: PromotionRec, ita: number): RubricEvalInput => ({
  period_from: `${endYear - 1}-03-16`,
  period_to: `${endYear}-03-15`,
  report_type: "EVAL",
  promotion_recommendation: rec,
  trait_average: ita,
  summary_group_average: null,
  rsca: null,
  sea_duty: false,
  ep_count: null,
  group_size: null,
});

const report = (inputs: RubricInputs, opts: ReadinessOptions = { asOf: AS_OF }) =>
  buildReadinessReport(scoreBoardConfidence(inputs, CFG), inputs, CFG, opts);

const howToFor = (rep: ReturnType<typeof report>, key: string): string =>
  rep.coverage.missing.find((x) => x.area === key)?.howTo ?? "";

const GRADED: AreaStatus[] = ["strong", "on_track", "needs_attention"];

// ---------------------------------------------------------------------------
// The audit's two worked records
// ---------------------------------------------------------------------------

// Sailor A — six consecutive annual EVALs, ALL Early Promote, ITA 4.60,
// unbroken continuity. PSR and LaDR tabs never filled.
const sailorA: RubricInputs = {
  boardDate: T,
  evals: [2021, 2022, 2023, 2024, 2025, 2026].map((y) => annual(y, "Early Promote", 4.6)),
  psr: emptyPsr,
  ladr: [],
  preceptFlags: ALL_FLAGS,
};

// Sailor B — five annual EVALs, ALL Promotable (never recommended above the
// middle), ITA 3.80. Every section filled.
const sailorBLadr: LadrItemInput[] = [
  { milestone_id: "m-warfare", category: "qual_warfare", status: "met", verified_in_ompf: true, item: "Information Warfare (EIWS)" },
  { milestone_id: "m-pme", category: "pme_required", status: "met", verified_in_ompf: true, item: "Petty Officer First Class Selectee Leadership Course" },
  { milestone_id: "m-deg", category: "education_degree", status: "not_met", verified_in_ompf: false, item: "Occupational-related Associate degree", typical_months: 18 },
  { milestone_id: "m-cert", category: "credential", status: "not_met", verified_in_ompf: false, item: "CompTIA Security+", typical_months: 2 },
  { milestone_id: "m-watch", category: "qual_watchstanding", status: "met", verified_in_ompf: false, item: "Section Leader" },
  { milestone_id: "m-nec", category: "nec_opportunity", status: "not_met", verified_in_ompf: false, item: "NEC 742A", blocked_unless: "requires a sea billet" },
  { milestone_id: "m-open", category: "skill_training_required", status: "unanswered", verified_in_ompf: false, item: "Advanced Network Analyst" },
];

const sailorB: RubricInputs = {
  boardDate: T,
  evals: [2022, 2023, 2024, 2025, 2026].map((y) => annual(y, "Promotable", 3.8)),
  psr: {
    entered: true,
    awards: [
      { title: "Navy Achievement Medal", level: "personal_achievement", date_awarded: "2023-06-01", verified_in_ompf: false },
      { title: "Navy Commendation Medal", level: "personal_commendation", date_awarded: "2025-06-01", verified_in_ompf: true },
    ],
    necs: [{ code: "742A", verified_in_ompf: true }],
    education: [{ kind: "degree", title: "Associate of Science", verified_in_ompf: true }],
    tours: [
      { title: "USS Example", start: "2020-01-01", end: "2024-01-01", sea_duty: true, leadership: true },
      { title: "Shore Command", start: "2024-01-02", end: null, sea_duty: false, leadership: true },
    ],
    pfa: [
      { cycle: "2024-1", date: "2024-04-01", result: "pass" },
      { cycle: "2024-2", date: "2024-10-01", result: "pass" },
      { cycle: "2025-1", date: "2025-04-01", result: "pass" },
    ],
    adverse: [],
  },
  ladr: sailorBLadr,
  preceptFlags: ALL_FLAGS,
};

const emptyRecord: RubricInputs = {
  boardDate: T,
  evals: [],
  psr: emptyPsr,
  ladr: [],
  preceptFlags: ALL_FLAGS,
};

// A four-year sea-duty record whose rating has no curated LaDR — B1's fixture.
const seaSailor: RubricInputs = {
  boardDate: T,
  evals: [2023, 2024, 2025, 2026].map((y) => annual(y, "Early Promote", 4.5)),
  psr: {
    ...emptyPsr,
    entered: true,
    tours: [{ title: "Sea Tour", start: "2022-01-01", end: "2026-01-01", sea_duty: true, leadership: true }],
  },
  ladr: [],
  preceptFlags: ALL_FLAGS,
};

// ---------------------------------------------------------------------------

describe("the band inversion — now fixed in the ENGINE, not worked around", () => {
  it("the all-EP record no longer bands below the all-Promotable one", () => {
    // THE defect this epic opened on. Measured before: sailorA 45.0 "Not
    // competitive" against sailorB 57.3 "Crunch" — six Early Promotes losing to
    // five Promotables because A had not filled in the PSR and LaDR tabs.
    const a = scoreBoardConfidence(sailorA, CFG);
    const b = scoreBoardConfidence(sailorB, CFG);
    const perf = (r: typeof a) => r.factors.find((f) => f.key === "performance")!;

    expect(perf(a).score).toBeGreaterThan(perf(b).score);
    // The composite now agrees with the performance factor instead of contradicting it.
    expect(a.final).toBeGreaterThan(b.final);
    expect(a.bandLabel).toBe("Competitive");
    expect(b.bandLabel).toBe("Crunch — middle band");
  });

  it("coverage still separates the two records, and still gates the thin one", () => {
    // The engine being right is not a licence to SHOW a number computed from a
    // quarter of a record. sailorA's 85.2 is arithmetically honest and still
    // withheld, because two of the four verdict factors have nothing in them.
    const a = report(sailorA);
    const b = report(sailorB);

    expect(a.coverage.measured).toBeLessThan(COVERAGE_FLOOR);
    expect(b.coverage.measured).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
    expect(b.coverage.measured - a.coverage.measured).toBeGreaterThan(0.2);

    expect(a.score).toBeNull();
    expect(a.scoreNote).toMatch(/cannot score/i);
    expect(b.score).toEqual({ value: 53.1, band: 50, label: "Crunch — middle band" });
    expect(b.scoreNote).toBeNull();
  });

  it("names what is missing instead of scoring it as zero, and still reports the strong areas", () => {
    const a = report(sailorA);

    // All six areas are SHOWN — development, completeness and continuity are the
    // Sailor's record and carry a how-to even though they carry no verdict
    // weight. Only a precept the admin never configured is hidden, and this
    // record has one. What changed is that none of them is GRADED as a zero.
    expect(a.coverage.areasKnown).toBe(2);
    expect(a.coverage.areasTotal).toBe(6);
    expect(a.coverage.missing.map((m) => m.area).sort()).toEqual([
      "completeness",
      "development",
      "leadership",
      "precept",
    ]);
    expect(a.areas.find((x) => x.key === "performance")!.status).toBe("strong");
  });
});

describe("the two gates on emitting a number", () => {
  // 6× Early Promote, an MSM, four years of sea duty — and a rating with no
  // curated LaDR. Coverage clears the floor, so the floor alone lets it through:
  // measured "Crunch — middle band" with an EMPTY action plan, off 15 weighted
  // points of earned zeros.
  const flawless: RubricInputs = {
    boardDate: T,
    evals: [2021, 2022, 2023, 2024, 2025, 2026].map((y) => annual(y, "Early Promote", 4.6)),
    psr: {
      entered: true,
      awards: [{ title: "Meritorious Service Medal", level: "msm_or_above", date_awarded: "2025-01-01", verified_in_ompf: true }],
      necs: [{ code: "742A", verified_in_ompf: true }],
      education: [{ kind: "degree", title: "Bachelor of Science", verified_in_ompf: true }],
      tours: [{ title: "Sea Tour", start: "2022-01-01", end: "2026-01-01", sea_duty: true, leadership: true }],
      pfa: [
        { cycle: "a", date: "2024-04-01", result: "pass" },
        { cycle: "b", date: "2024-10-01", result: "pass" },
        { cycle: "c", date: "2025-04-01", result: "pass" },
      ],
      adverse: [],
    },
    ladr: [],
    preceptFlags: ["warfighting", "leadership_positions", "sea_duty"],
  };

  it("a missing LaDR is no longer a blind spot, because it no longer carries weight", () => {
    // This record used to be scored "Crunch" off 15 weighted points of earned
    // zeros, and the blind-spot gate then had to suppress the number to stop it
    // reaching the Sailor. Development leaving the verdict removes the cause, so
    // the gate has nothing to fire on and a flawless record gets its number.
    const rep = report(flawless);
    const dev = rep.areas.find((a) => a.key === "development")!;
    expect(dev.detail.weight).toBe(0);
    expect(dev.detail.confidence).toBe(0);
    expect(rep.score).not.toBeNull();
    expect(rep.score!.band).toBeGreaterThanOrEqual(75);
    // …and the Sailor is still told the roadmap is missing, on the coverage axis.
    expect(dev.status).toBe("not_enough_entered");
    expect(dev.summary).toMatch(/does not have your rating's development roadmap/);
  });

  it("BLIND SPOT: still a real gate on a factor that DOES carry verdict weight", () => {
    // Leadership blind (no tours, no awards) while every other verdict factor is
    // fully observed: coverage lands at 0.80, clear of the floor, so the floor
    // would not catch it — the gate must.
    const noLeadership: RubricInputs = {
      boardDate: T,
      evals: [2021, 2022, 2023, 2024, 2025, 2026].map((y) => ({
        ...annual(y, "Must Promote", 4.4),
        summary_group_average: 4.0,
        ep_count: 0,
        group_size: 10,
      })),
      psr: {
        entered: true,
        awards: null,
        tours: null,
        necs: [{ code: "742A", verified_in_ompf: true }],
        education: [{ kind: "degree", title: "AS", verified_in_ompf: true }],
        pfa: [
          { cycle: "a", date: "2024-04-01", result: "pass" },
          { cycle: "b", date: "2024-10-01", result: "pass" },
          { cycle: "c", date: "2025-04-01", result: "pass" },
        ],
        adverse: [],
      },
      // every flag here is computable from the LaDR alone, so only leadership is blind
      ladr: [
        { milestone_id: "w", category: "qual_warfare", status: "met", verified_in_ompf: true, item: "EIWS" },
        { milestone_id: "e", category: "education_degree", status: "met", verified_in_ompf: true, item: "AS" },
        { milestone_id: "c", category: "credential", status: "met", verified_in_ompf: true, item: "Sec+" },
        { milestone_id: "n", category: "nec_opportunity", status: "met", verified_in_ompf: true, item: "742A" },
        { milestone_id: "r", category: "qual_rate_specific", status: "met", verified_in_ompf: true, item: "Rate" },
      ],
      preceptFlags: ["warfighting", "education", "technical_expertise"],
    };
    const rep = report(noLeadership);
    const lead = rep.areas.find((a) => a.key === "leadership")!;
    expect(lead.detail.weight).toBeGreaterThan(0);
    expect(lead.detail.confidence).toBeLessThan(AREA_EVIDENCE_FLOOR);
    expect(rep.coverage.measured).toBeGreaterThan(COVERAGE_FLOOR); // the floor would NOT catch it
    expect(rep.score).toBeNull();
    expect(rep.scoreNote).toMatch(/leadership and impact/);
  });

  it("COVERAGE FLOOR: still catches a thin record whose factors all have some confidence", () => {
    // Three reports (conf_P 0.70), tours entered but NO awards section (conf_L
    // 0.70), and a precept whose LaDR-derived flags are partly computable
    // (conf_X 0.60). Every verdict factor is more than half observed, so the
    // blind-spot gate has nothing to fire on — and the weighted total still
    // lands under the floor.
    const thin: RubricInputs = {
      ...sailorB,
      evals: [2024, 2025, 2026].map((y) => annual(y, "Promotable", 3.8)),
      psr: { ...sailorB.psr, awards: null },
      ladr: sailorBLadr.filter((i) => i.category !== "nec_opportunity"),
    };
    const rep = report(thin);
    // Every weighted factor clears the blind-spot gate, so it is the FLOOR doing
    // the work here — not the gate.
    expect(
      rep.areas.every((a) => a.detail.weight === 0 || a.detail.confidence >= AREA_EVIDENCE_FLOOR),
    ).toBe(true);
    expect(rep.coverage.measured).toBeLessThan(COVERAGE_FLOOR);
    expect(rep.score).toBeNull();
  });

  it("blanking a section buys a raw number nobody is shown", () => {
    // REQUIRED-1 regression. A weak tours section drags leadership to S_L 3.00;
    // deleting it removes the evidence and the mean of what remains RISES. The
    // numerator is identical either way — only the denominator shrinks — so no
    // arithmetic can undo it (see the withholding proof on scoreBoardConfidence).
    // What stops the Sailor cashing it is that leadership lands at conf 0.30,
    // below AREA_EVIDENCE_FLOOR, and the composite is withheld.
    const weakTours = [
      { title: "Shore", start: "2021-01-01", end: null, sea_duty: false, leadership: false },
    ];
    const honest: RubricInputs = {
      ...sailorB,
      evals: [2022, 2023, 2024, 2025, 2026].map((y) => annual(y, "Must Promote", 4.3)),
      psr: { ...sailorB.psr, tours: weakTours },
    };
    const blanked: RubricInputs = { ...honest, psr: { ...honest.psr, tours: null } };

    const a = scoreBoardConfidence(honest, CFG);
    const b = scoreBoardConfidence(blanked, CFG);
    // the raw arithmetic does rise, and the numerator is untouched
    const numOf = (r: typeof a) =>
      r.factors.reduce((x, f) => x + f.weight * f.confidence * f.score, 0);
    expect(b.final).toBeGreaterThan(a.final);
    expect(numOf(b)).toBeCloseTo(numOf(a), 6);

    // …and the gate is what makes it worthless.
    expect(report(honest).score).not.toBeNull();
    expect(report(blanked).score).toBeNull();
    const lead = report(blanked).areas.find((x) => x.key === "leadership")!;
    expect(lead.detail.confidence).toBeLessThan(AREA_EVIDENCE_FLOOR);
    expect(lead.status).toBe("not_enough_entered");
  });

  it("deleting a report that hides a gap COSTS points — it must never pay", () => {
    // REQUIRED-2 regression. While continuity was graded on the span between the
    // reports the Sailor chose to enter, deleting the older of two reports
    // collapsed the span, took spanCoverage to 1.0 and the gap count to 0, and
    // paid +7.6 for hiding a two-year break — with the §17-6 advisory beside it
    // telling them to recover missing reports. Continuity carries no verdict
    // weight now, so the deletion can only cost confidence.
    const gapped: RubricInputs = {
      ...sailorB,
      evals: [annual(2022, "Must Promote", 4.3), annual(2026, "Must Promote", 4.3)],
    };
    const hidden: RubricInputs = { ...gapped, evals: [gapped.evals[1]] };

    const before = scoreBoardConfidence(gapped, CFG);
    const after = scoreBoardConfidence(hidden, CFG);
    const cont = (r: typeof before) => r.factors.find((f) => f.key === "continuity")!;

    expect(before.continuityGap).toBe(true); // the advisory still names the break
    // The factor still MEASURES the swing — it is what the advisory is built on —
    // and contributes exactly nothing to the composite at either end of it.
    expect(cont(after).score).toBeGreaterThan(cont(before).score); // 24.98 -> 100
    expect(cont(before).contribution).toBe(0);
    expect(cont(after).contribution).toBe(0);

    // What is left is the generic withholding residue: one fewer report lowers
    // conf_P, which shifts performance's share of the mean. It is under a point
    // here against +7.6 before, and it is not closable — see the withholding
    // proof on scoreBoardConfidence.
    expect(Math.abs(after.final - before.final)).toBeLessThan(1);
  });

  it("the roadmap growing under a returning user changes NOTHING about their score", () => {
    // The regression this gate was built to catch, now impossible by construction.
    // A returning user who changes nothing while their rating's roadmap grows from
    // 6 to 86 milestones (80 transcribed advancement_consideration rows):
    //   ORIGINALLY  dev conf 1.000, contrib 15.00 -> 72.2 "Competitive"
    //   THEN        dev conf 0.070, contrib  1.05 -> 57.2 "Crunch"
    // −15 points and a full band drop because APEX learned more about their
    // RATING. The roadmap is no longer in the verdict, so the same record scores
    // the same number before and after, and no gate has to rescue it.
    const answered6: LadrItemInput[] = [
      { milestone_id: "a1", category: "qual_warfare", status: "met", verified_in_ompf: true, item: "EIWS" },
      { milestone_id: "a2", category: "pme_required", status: "met", verified_in_ompf: true, item: "PME" },
      { milestone_id: "a3", category: "credential", status: "met", verified_in_ompf: true, item: "Security+" },
      { milestone_id: "a4", category: "qual_watchstanding", status: "met", verified_in_ompf: true, item: "Watch" },
      { milestone_id: "a5", category: "nec_opportunity", status: "met", verified_in_ompf: true, item: "NEC 742A" },
      { milestone_id: "a6", category: "education_degree", status: "met", verified_in_ompf: true, item: "Associate degree" },
    ];
    const grown: LadrItemInput[] = [
      ...answered6,
      ...Array.from({ length: 80 }, (_, i) => ({
        milestone_id: `ac-${i}`,
        category: "advancement_consideration" as const,
        status: "unanswered" as const,
        verified_in_ompf: false,
        item: `Consideration ${i}`,
        board_emphasis: true,
      })),
    ];
    const base: RubricInputs = {
      boardDate: T,
      evals: [2022, 2023, 2024, 2025, 2026].map((y) => annual(y, "Must Promote", 4.2)),
      psr: {
        entered: true,
        awards: [{ title: "NAM", level: "personal_achievement", date_awarded: "2024-01-01", verified_in_ompf: true }],
        necs: [{ code: "742A", verified_in_ompf: true }],
        education: [{ kind: "degree", title: "Associate of Science", verified_in_ompf: true }],
        tours: [{ title: "Sea Tour", start: "2021-01-01", end: null, sea_duty: true, leadership: true }],
        pfa: [
          { cycle: "a", date: "2024-04-01", result: "pass" },
          { cycle: "b", date: "2024-10-01", result: "pass" },
          { cycle: "c", date: "2025-04-01", result: "pass" },
        ],
        adverse: [],
      },
      ladr: answered6,
      preceptFlags: ALL_FLAGS,
    };
    const after: RubricInputs = { ...base, ladr: grown };

    const devOf = (i: RubricInputs) =>
      scoreBoardConfidence(i, CFG).factors.find((f) => f.key === "development")!;
    // The area still MEASURES the change — the plan needs it — it just cannot
    // spend it. conf falls 1.000 -> 6/86 exactly as before.
    expect(devOf(base).confidence).toBe(1);
    expect(devOf(after).score).toBe(100); // unchanged: the RECORD did not change
    expect(devOf(after).confidence).toBeCloseTo(6 / 86, 6);
    expect(devOf(after).weight).toBe(0);

    // …and not a thousandth of a point of it reaches the composite.
    expect(scoreBoardConfidence(after, CFG).final).toBe(scoreBoardConfidence(base, CFG).final);
    expect(scoreBoardConfidence(after, CFG).band).toBe(scoreBoardConfidence(base, CFG).band);

    const before = report(base);
    const grownRep = report(after);
    expect(before.score).not.toBeNull();
    expect(grownRep.score).toEqual(before.score); // no silent band regression
    expect(grownRep.coverage.measured).toBe(before.coverage.measured);

    // And the sentence still does not blame them for rows that did not exist before.
    const dev = grownRep.areas.find((a) => a.key === "development")!;
    expect(dev.status).toBe("not_enough_entered");
    expect(dev.summary).toContain("6 of 86 milestones");
    expect(dev.summary).toMatch(/were not here before/);
    expect(dev.summary).not.toMatch(/checklist is unanswered/);
  });

  it("the floor comparison is >= — a record exactly at the floor is scored", () => {
    const r = scoreBoardConfidence(sailorB, CFG);
    const exact = buildReadinessReport(r, sailorB, CFG, {
      asOf: AS_OF,
      coverageFloor: r.factors.reduce((a, f) => a + f.weight * f.confidence, 0) / 100,
    });
    expect(exact.coverage.measured).toBe(exact.coverage.floor);
    expect(exact.score).not.toBeNull();
  });

  it("excludes weight-0 factors from the headline count — a missing precept is a TOOL gap", () => {
    // Without this, a fully-entered record reads "APEX can see 5 of 6 areas of
    // YOUR RECORD" when the gap is that no precept is loaded.
    const rep = report({ ...sailorB, preceptFlags: [] });
    // performance + leadership + continuity: the verdict factors that remain once
    // the precept is excluded too.
    // Five: everything but the unconfigured precept, which is the ONLY factor a
    // Sailor cannot act on. Weight-0-but-the-Sailor's-record still shows.
    expect(rep.coverage.areasTotal).toBe(5);
    expect(rep.coverage.missing.map((m) => m.area)).not.toContain("precept");
  });
});

describe("the empty record — the first thing a new user sees", () => {
  it("the raw rubric emits a flagged PLACEHOLDER, not a verdict", () => {
    // There is nothing in any verdict factor, so Σ(weight·conf) is 0 and the
    // composite is undefined. `final` is typed `number` and the column is NOT
    // NULL, so 0 is emitted — with a warning that says in words that it is not an
    // assessment. Making `final` nullable is the honest fix and it belongs to
    // whoever owns service.ts and the board_analyses column.
    const r = scoreBoardConfidence(emptyRecord, CFG);
    expect(r.factors.reduce((a, f) => a + f.weight * f.confidence, 0)).toBe(0);
    expect(r.final).toBe(0);
    expect(r.warnings.some((w) => /placeholder, not an assessment/.test(w))).toBe(true);
  });

  it("the readiness report emits no score and no band at all", () => {
    const rep = report(emptyRecord);
    expect(rep.score).toBeNull();
    expect(JSON.stringify(rep.areas)).not.toContain("Drop-from-consideration risk");
  });

  it("coverage IS zero for an empty record — nothing in the verdict claims to see it", () => {
    // It used to read 0.30, because continuity, completeness and precept reported
    // conf = 1 unconditionally and so asserted knowledge of a record that did not
    // exist. Continuity and precept now report the §7 item-8 zero-data case, and
    // completeness — which really can measure its own subject — carries no verdict
    // weight. An empty record is 0.00 known, which is what it is.
    expect(report(emptyRecord).coverage.measured).toBe(0);
  });

  it("lists every unknown area rather than grading it", () => {
    const s = Object.fromEntries(report(emptyRecord).areas.map((a) => [a.key, a.status]));
    expect(s.performance).toBe("not_enough_entered");
    expect(s.leadership).toBe("not_enough_entered");
    expect(s.development).toBe("not_enough_entered");
    expect(s.continuity).toBe("not_enough_entered");
    expect(s.precept).toBe("not_enough_entered");
    // Completeness too. It used to be the "honest exception" — an empty record
    // really IS incomplete — but the finding it produced was "Large parts of your
    // record are not entered yet" under a NEEDS ATTENTION pill, three cards below
    // a banner promising "nothing below is a grade on what you have not entered".
    // Its every string is about entry volume, so its bottom rung is a data state.
    expect(s.completeness).toBe("not_enough_entered");
  });
});

describe("BLOCKER B2 — a three-year Sailor must not be told their record has gaps", () => {
  const threeYear: RubricInputs = {
    boardDate: T,
    evals: [2024, 2025, 2026].map((y) => annual(y, "Must Promote", 4.2)),
    psr: { ...emptyPsr, entered: true },
    ladr: [],
    preceptFlags: ["warfighting"],
  };

  it("the engine itself reports no break", () => {
    const r = scoreBoardConfidence(threeYear, CFG);
    const c = r.factors.find((f) => f.key === "continuity")!;
    expect(c.detail.recordGapCount).toBe(0);
    expect(r.continuityGap).toBe(false);
    expect(r.continuityAdvisory).toBeNull();
    // …and the factor SCORE now agrees with the advisory instead of contradicting
    // it. It used to read 45.02 — a 0.60 window coverage AND a 15-point
    // leading-gap penalty, charging this Sailor twice for years they had not
    // served. Three consecutive reports with nothing missing between them is
    // complete continuity; "APEX holds 3 of 5 years" is a CONFIDENCE statement.
    expect(c.score).toBe(100);
    expect(c.confidence).toBeCloseTo(1096 / 1826, 3);
    expect(Number(c.detail.coverage)).toBeLessThan(0.95); // window coverage, unchanged
  });

  it("continuity status keys on the gap count, never on the factor score", () => {
    const area = report(threeYear).areas.find((a) => a.key === "continuity")!;
    // No break — but not "strong" either: `strong` is the token a UI paints
    // green, and APEX holds 3 of the 5 window years.
    expect(area.status).toBe("on_track");
    expect(area.summary).toBe(
      "APEX found no break between the reports you have entered, and does not yet hold a full five years of them.",
    );
  });

  it("a record covering the full window with no break IS strong", () => {
    const area = report(sailorB).areas.find((a) => a.key === "continuity")!;
    expect(Number(area.detail.detail.coverage)).toBeGreaterThanOrEqual(0.95);
    expect(area.status).toBe("strong");
  });

  it("a record whose ONLY report was excluded is not told its continuity looks strong", () => {
    // Observed live by P1b: the sole eval was dated after the board date, so
    // scoreBoardConfidence dropped it from every factor — yet hasEvidence read
    // the RAW inputs.evals array, found length 1, and rendered "Reporting
    // continuity — LOOKING STRONG · APEX found no break between the reports you
    // have entered" on the same screen where Performance correctly reported
    // holding too few reports. A confident claim from zero usable data.
    const futureOnly: RubricInputs = {
      boardDate: T,
      evals: [annual(2027, "Must Promote", 4.2)], // period_to is AFTER the board date
      psr: { ...emptyPsr, entered: true },
      ladr: [],
      preceptFlags: ["warfighting"],
    };
    const r = scoreBoardConfidence(futureOnly, CFG);
    expect(r.warnings.join(" ")).toMatch(/dated after the board date/);
    expect(futureOnly.evals.length).toBe(1); // the raw input still says "we have one"
    expect(Number(r.factors.find((f) => f.key === "continuity")!.detail.coveredDays)).toBe(0);

    const rep = report(futureOnly);
    const areas = Object.fromEntries(rep.areas.map((a) => [a.key, a.status]));
    expect(areas.continuity).toBe("not_enough_entered");
    expect(areas.performance).toBe("not_enough_entered");
    expect(rep.areas.find((a) => a.key === "continuity")!.summary).not.toMatch(/no break/);
  });

  it("a report dated entirely outside the five-year window is also not evidence", () => {
    const stale: RubricInputs = {
      boardDate: T,
      evals: [annual(2015, "Must Promote", 4.2)],
      psr: { ...emptyPsr, entered: true },
      ladr: [],
      preceptFlags: ["warfighting"],
    };
    expect(report(stale).areas.find((a) => a.key === "continuity")!.status).toBe(
      "not_enough_entered",
    );
  });

  it("the leadership and precept evidence gates are real gates, not `true`", () => {
    // The same fix was extended to leadership (and to the precept check that
    // shares it), so both need their own guard — mutating either arm to `true`
    // must fail here.
    const noSections: RubricInputs = {
      boardDate: T,
      evals: [2022, 2023, 2024, 2025, 2026].map((y) => annual(y, "Must Promote", 4.2)),
      psr: { ...emptyPsr, entered: true }, // tours AND awards both null
      ladr: [],
      preceptFlags: ["warfighting", "leadership_positions"],
    };
    const r = scoreBoardConfidence(noSections, CFG);
    expect(r.factors.find((f) => f.key === "leadership")!.confidence).toBe(0);

    const areas = Object.fromEntries(
      report(noSections).areas.map((a) => [a.key, a.status]),
    );
    expect(areas.leadership).toBe("not_enough_entered");
    // precept: `warfighting` reads a LaDR ratio that does not exist and
    // `leadership_positions` reads the leadership section, which is empty.
    expect(areas.precept).toBe("not_enough_entered");

    // ...and both DO report evidence once the sections are entered.
    const withSections: RubricInputs = {
      ...noSections,
      psr: {
        ...noSections.psr,
        tours: [{ title: "Sea Tour", start: "2021-01-01", end: null, sea_duty: true, leadership: true }],
        awards: [{ title: "NAM", level: "personal_achievement", date_awarded: "2024-01-01", verified_in_ompf: true }],
      },
      preceptFlags: ["leadership_positions", "sea_duty"],
    };
    const filled = Object.fromEntries(
      report(withSections).areas.map((a) => [a.key, a.status]),
    );
    expect(filled.leadership).not.toBe("not_enough_entered");
    expect(filled.precept).not.toBe("not_enough_entered");
  });

  it("a genuine break between two reports still reports needs_attention", () => {
    // Both reports sit inside the 1826-day window, with three uncovered years
    // between them — an INTERNAL break, not the pre-first-report leading span.
    const gapped: RubricInputs = {
      ...threeYear,
      evals: [annual(2022, "Must Promote", 4.2), annual(2026, "Must Promote", 4.2)],
    };
    const r = scoreBoardConfidence(gapped, CFG);
    expect(
      Number(r.factors.find((f) => f.key === "continuity")!.detail.recordGapCount),
    ).toBeGreaterThan(0);
    expect(report(gapped).areas.find((a) => a.key === "continuity")!.status).toBe(
      "needs_attention",
    );
  });
});

describe("BLOCKER B1 — the precept must not assert doctrine APEX guessed", () => {
  it("does not call a four-year sea-duty record deficient on flags it cannot compute", () => {
    const r = scoreBoardConfidence(seaSailor, CFG);
    const p = r.factors.find((f) => f.key === "precept")!;
    // sea_duty is a perfect 1.0. warfighting/education/technical_expertise read
    // LaDR ratios that do not exist — they are NULL now, not a structural 0, and
    // they drop out of both the average and the confidence instead of being
    // scored as deficiencies the Sailor earned.
    expect(p.detail.sea_duty).toBe(1);
    expect(p.detail.warfighting).toBeNull();
    expect(p.confidence).toBeLessThan(1);
    expect(p.score).toBeGreaterThan(0);

    const area = report(seaSailor).areas.find((a) => a.key === "precept")!;
    expect(area.status).toBe("not_enough_entered");
    expect(area.summary).not.toMatch(/covers few/);
  });

  it("prefixes every precept string while the active precept cites no source", () => {
    const area = report(sailorB).areas.find((a) => a.key === "precept")!;
    expect(area.summary.startsWith(PRECEPT_UNSOURCED_PREFIX)).toBe(true);
    expect(area.summary).toContain("not taken from the board's convening order");

    const sourced = report(sailorB, {
      asOf: AS_OF,
      preceptSourceUrl: "https://www.mynavyhr.navy.mil/precept.pdf",
    }).areas.find((a) => a.key === "precept")!;
    expect(sourced.summary.startsWith(PRECEPT_UNSOURCED_PREFIX)).toBe(false);
  });

  it("is named for what it measures, and never claims to know what the board emphasizes", () => {
    const area = report(sailorB).areas.find((a) => a.key === "precept")!;
    expect(area.label).toBe("Board emphasis areas");
    expect(area.label).not.toMatch(/alignment/i);
    for (const inputs of [sailorA, sailorB, emptyRecord, seaSailor])
      for (const a of report(inputs).areas)
        expect(a.summary).not.toMatch(/what this cycle's precept emphasizes/i);
  });

  it("uses a role that exists — there is no 'command administrator' in permissions.ts", () => {
    const rep = report(emptyRecord);
    expect(howToFor(rep, "precept")).toContain("APEX Admin");
    expect(howToFor(rep, "precept")).not.toMatch(/command administrator/i);
  });
});

describe("BLOCKER B3 — a self-ticked checkbox is not verification", () => {
  it("bandDeltas emits no verification candidates at all", () => {
    const kinds = bandDeltas(scoreBoardConfidence(sailorB, CFG), sailorB, CFG).map((d) => d.kind);
    expect(kinds).not.toContain("award_verify");
    expect(kinds).not.toContain("ladr_verify");
    expect(new Set(kinds)).toEqual(new Set(["ladr_answer", "ladr_meet"]));
  });

  it("no action offers points for ticking a verified_in_ompf box", () => {
    for (const a of report(sailorB).actions) {
      expect(a.id).not.toMatch(/verify$/);
      expect(a.id).not.toMatch(/^award:/);
      expect(a.action).not.toMatch(/mark it verified/i);
    }
  });

  it("surfaces unconfirmed entries as an UNSCORED reminder instead", () => {
    const c = report(sailorB).confirmInOmpf!;
    expect(c.count).toBe(2); // 1 unverified award + 1 met-but-unverified LaDR row
    expect(c.items).toEqual(["Navy Achievement Medal", "Section Leader"]);
    expect(c.note).toContain("A board sees only your OMPF");
    expect(JSON.stringify(c)).not.toMatch(/worth/);
    // Nothing to confirm ⇒ the block is absent, not an empty list.
    expect(report(emptyRecord).confirmInOmpf).toBeNull();
  });

  it("does not coach the Sailor on what a self-report answer is worth", () => {
    const a = report(sailorB).actions.find((x) => x.id === "ladr:m-open:answer")!;
    expect(a.action).toBe(
      'Answer "Advanced Network Analyst" on your LaDR checklist — APEX cannot score this area until it is answered either way.',
    );
    expect(a.action).not.toMatch(/worth/i);
  });
});

describe("BLOCKER B4 — evidence labels", () => {
  it("self-entered data is 'self_reported', never a word that reads stronger", () => {
    const rep = report(sailorB);
    for (const a of rep.areas) {
      expect(["self_reported", "peer_compared", "not_entered"]).toContain(a.evidence);
      expect(a.evidenceNote).toMatch(/OMPF|left it out/);
    }
    expect(rep.areas.find((a) => a.key === "performance")!.evidence).toBe("self_reported");
    expect(rep.areas.find((a) => a.key === "performance")!.evidenceLabel).toBe("From your entries");
  });

  it("ONLY performance may be peer_compared, and only with a group of 2 or more", () => {
    const withPeers: RubricInputs = {
      ...sailorB,
      evals: sailorB.evals.map((e) => ({ ...e, summary_group_average: 3.9, group_size: 12 })),
    };
    const rep = report(withPeers);
    expect(rep.areas.find((a) => a.key === "performance")!.evidence).toBe("peer_compared");
    // Continuity touches no peer data at all — tagging it would be fabricated.
    expect(rep.areas.find((a) => a.key === "continuity")!.evidence).toBe("self_reported");
    expect(rep.areas.find((a) => a.key === "development")!.evidence).toBe("self_reported");
  });

  it("a summary group of ONE is a comparison with yourself, not a peer comparison", () => {
    const solo: RubricInputs = {
      ...sailorB,
      evals: sailorB.evals.map((e) => ({ ...e, summary_group_average: 3.8, group_size: 1 })),
    };
    expect(report(solo).areas.find((a) => a.key === "performance")!.evidence).toBe("self_reported");
  });

  it("not_entered is a data state, never the bottom of the graded scale", () => {
    for (const a of report(emptyRecord).areas) {
      if (a.status === "not_enough_entered") {
        expect(a.evidence).toBe("not_entered");
        expect(GRADED).not.toContain(a.status);
      }
    }
  });
});

describe("statuses and summaries", () => {
  it("'adequate' is retired everywhere", () => {
    for (const inputs of [sailorA, sailorB, emptyRecord]) {
      const rep = report(inputs);
      expect(JSON.stringify(rep.areas.map((a) => a.status))).not.toMatch(/adequate/);
      for (const a of rep.areas) expect(a.summary).not.toMatch(/\badequate\b/i);
    }
  });

  it("a factor below the evidence floor is not graded even though it has a score", () => {
    const oneEval: RubricInputs = { ...sailorA, evals: [annual(2026, "Early Promote", 4.6)] };
    const perf = scoreBoardConfidence(oneEval, CFG).factors.find((f) => f.key === "performance")!;
    expect(perf.score).toBeGreaterThan(0);
    expect(perf.confidence).toBeLessThan(AREA_EVIDENCE_FLOOR);
    expect(report(oneEval).areas.find((a) => a.key === "performance")!.status).toBe(
      "not_enough_entered",
    );
  });

  it("no summary asserts a cross-area comparison nothing computes", () => {
    for (const inputs of [sailorA, sailorB, emptyRecord])
      for (const a of report(inputs).areas)
        expect(a.summary).not.toMatch(/weakest|strongest|\bbest\b|\bworst\b/i);
  });

  it("no summary, evidence note or howTo leaks an engine internal", () => {
    const banned =
      /\b(P1|P2|P3|P4|aP|wSum|conf|S_f|coveredDays|availableSubweight|nObserved|declinePenalty|ratio_[a-z_]+)\b/;
    for (const inputs of [sailorA, sailorB, emptyRecord]) {
      const rep = report(inputs);
      for (const a of rep.areas) {
        expect(a.summary).not.toMatch(banned);
        expect(a.evidenceNote).not.toMatch(banned);
      }
      for (const m of rep.coverage.missing) expect(m.howTo).not.toMatch(banned);
    }
  });

  it("the internals are still available on detail for the disclosure", () => {
    const perf = report(sailorB).areas.find((a) => a.key === "performance")!;
    expect(perf.detail.detail).toHaveProperty("P1");
    expect(perf.detail.detail).toHaveProperty("availableSubweight");
  });

  it("carries the normative disclaimer required on every results view", () => {
    expect(report(sailorB).disclaimer).toBe(BOARD_DISCLAIMER);
  });
});

describe("scoreLadr emits milestone identity", () => {
  it("names the actual unmet milestones rather than a category ratio", () => {
    const unmet = scoreBoardConfidence(sailorB, CFG).ladrUnmet!;
    expect(unmet.map((u) => u.item).sort()).toEqual([
      "Advanced Network Analyst",
      "CompTIA Security+",
      "NEC 742A",
      "Occupational-related Associate degree",
    ]);
    const cert = unmet.find((u) => u.milestone_id === "m-cert")!;
    expect(cert).toMatchObject({ category: "credential", board_emphasis: false });
    expect(cert.factorLocalPoints).toBeGreaterThan(0);
  });

  it("factorLocalPoints is a recompute of this factor's own score, not an estimate", () => {
    const base = scoreBoardConfidence(sailorB, CFG);
    const dev = (r: typeof base) => r.factors.find((f) => f.key === "development")!.score;
    for (const u of base.ladrUnmet!) {
      const flipped = scoreBoardConfidence(
        {
          ...sailorB,
          ladr: sailorB.ladr.map((i) =>
            i.milestone_id === u.milestone_id
              ? { ...i, status: "met" as const, verified_in_ompf: true }
              : i,
          ),
        },
        CFG,
      );
      expect(u.factorLocalPoints).toBeCloseTo(dev(flipped) - dev(base), 10);
    }
  });

  it("carries board_emphasis through", () => {
    const inputs: RubricInputs = {
      ...emptyRecord,
      ladr: [
        { milestone_id: "ac-1", category: "advancement_consideration", status: "not_met", verified_in_ompf: false, item: "Serve as an LPO", board_emphasis: true },
      ],
    };
    expect(scoreBoardConfidence(inputs, CFG).ladrUnmet).toEqual([
      {
        milestone_id: "ac-1",
        item: "Serve as an LPO",
        category: "advancement_consideration",
        factorLocalPoints: 100,
        board_emphasis: true,
      },
    ]);
  });
});

describe("bandDeltas — the plan, priced on the development area's own scale", () => {
  const inputs = sailorB;
  const base = scoreBoardConfidence(inputs, CFG);
  const deltas = bandDeltas(base, inputs, CFG);

  it("prices EVERY unmet or unanswered row, and nothing else", () => {
    const candidates = inputs.ladr.filter(
      (i) => i.status === "not_met" || i.status === "unanswered",
    );
    expect(deltas.map((d) => d.milestoneId).sort()).toEqual(
      candidates.map((i) => i.milestone_id).sort(),
    );
    // There is deliberately no verification candidate: ticking a self-ticked box
    // is not an improvement and must never appear in a plan.
    expect(deltas.every((d) => d.kind === "ladr_answer" || d.kind === "ladr_meet")).toBe(true);
    expect(JSON.stringify(deltas)).not.toMatch(/verify/i);
  });

  it("delta is the development factor's own marginal, recomputed not estimated", () => {
    // The unit changed with the arithmetic: development carries no verdict weight,
    // so a COMPOSITE delta is ~0 for every row and would ship an empty plan. Each
    // delta is checked here against an independent full re-score of the factor.
    const dev = (r: typeof base) => r.factors.find((f) => f.key === "development")!.score;
    for (const d of deltas) {
      const flipped = scoreBoardConfidence(
        {
          ...inputs,
          ladr: inputs.ladr.map((i) =>
            i.milestone_id === d.milestoneId ? { ...i, status: "met" as const } : i,
          ),
        },
        CFG,
      );
      expect(d.delta).toBeCloseTo(dev(flipped) - dev(base), 10);
    }
  });

  it("a composite delta would have been useless — every flip moves the final by 0", () => {
    // The measurement that forced the unit change. Without a precept loaded there
    // is nothing left for a LaDR flip to move, so ranking on the composite would
    // have produced an all-zero plan that readiness.ts filters to empty.
    const noPrecept: RubricInputs = { ...inputs, preceptFlags: [] };
    const before = scoreBoardConfidence(noPrecept, CFG).final;
    for (const i of noPrecept.ladr) {
      const flipped = scoreBoardConfidence(
        { ...noPrecept, ladr: noPrecept.ladr.map((x) => (x === i ? { ...x, status: "met" as const } : x)) },
        CFG,
      );
      expect(flipped.final).toBe(before);
    }
    // …and the plan is NOT empty anyway.
    expect(bandDeltas(scoreBoardConfidence(noPrecept, CFG), noPrecept, CFG).some((d) => d.delta > 0)).toBe(true);
  });

  it("is ranked highest-first", () => {
    expect([...deltas].sort((a, b) => b.delta - a.delta)).toEqual(deltas);
  });

  it("distinguishes 'answer this row' from 'complete this milestone'", () => {
    const open = deltas.find((d) => d.milestoneId === "m-open")!;
    const cert = deltas.find((d) => d.milestoneId === "m-cert")!;
    expect(open.kind).toBe("ladr_answer");
    expect(open.id).toBe("ladr:m-open:answer");
    expect(cert.kind).toBe("ladr_meet");
    expect(cert.id).toBe("ladr:m-cert:meet");
  });

  it("names the milestone, falling back to its id when no text was threaded", () => {
    expect(deltas.find((d) => d.milestoneId === "m-cert")!.label).toBe("CompTIA Security+");
    const bare: RubricInputs = {
      ...emptyRecord,
      ladr: [{ milestone_id: "bare-1", category: "credential", status: "not_met", verified_in_ompf: false }],
    };
    expect(bandDeltas(scoreBoardConfidence(bare, CFG), bare, CFG)[0].label).toBe("bare-1");
  });

  it("a heavily-penalized record still gets a plan", () => {
    // The clamp used to be able to flatten every candidate to 0 on a record with
    // a large adverse adjustment. Nothing about the plan reads the composite now,
    // so the plan cannot be destroyed by anything that happens to the composite.
    const penalized: RubricInputs = {
      ...inputs,
      psr: {
        ...inputs.psr,
        adverse: [
          { kind: "njp", date: "2025-01-01" },
          { kind: "page13", date: "2025-02-01" },
        ],
        pfa: [{ cycle: "2025-1", date: "2025-04-01", result: "fail" }],
      },
    };
    const r = scoreBoardConfidence(penalized, CFG);
    expect(r.adverseAdjustment).toBe(40);
    expect(r.final).toBeLessThan(scoreBoardConfidence(inputs, CFG).final - 39);
    const plan = bandDeltas(r, penalized, CFG).filter((d) => d.delta > 0);
    expect(plan.length).toBeGreaterThan(0);
  });

  it("board-emphasis weighting is honoured, because the base run already applied it", () => {
    const emphasised: RubricInputs = {
      ...emptyRecord,
      ladr: [
        { milestone_id: "plain", category: "qual_warfare", status: "not_met", verified_in_ompf: false, item: "Plain" },
        { milestone_id: "big", category: "qual_warfare", status: "not_met", verified_in_ompf: false, item: "Emphasised", board_emphasis: true },
        { milestone_id: "anchor", category: "qual_warfare", status: "met", verified_in_ompf: true, item: "Anchor" },
      ],
    };
    const one = bandDeltas(scoreBoardConfidence(emphasised, { ...CFG, board_emphasis_multiplier: 1 }), emphasised, CFG);
    const five = bandDeltas(scoreBoardConfidence(emphasised, { ...CFG, board_emphasis_multiplier: 5 }), emphasised, CFG);
    const of = (ds: typeof one, id: string) => ds.find((d) => d.milestoneId === id)!.delta;
    expect(of(one, "big")).toBeCloseTo(of(one, "plain"), 10);
    expect(of(five, "big")).toBeGreaterThan(of(five, "plain"));
    // and at ×5 the emphasised row outranks the plain one in the plan order
    expect(five[0].milestoneId).toBe("big");
  });

  it("scales to a pathological roadmap without a candidate cap", () => {
    // The 60-candidate cap and its ranking heuristic are gone: every row is priced
    // by the base run, so there is nothing left to cap and nothing to drop.
    const huge: RubricInputs = {
      ...emptyRecord,
      ladr: Array.from({ length: 300 }, (_, i) => ({
        milestone_id: `m-${i}`,
        category: "credential" as const,
        status: "not_met" as const,
        verified_in_ompf: false,
        item: `Row ${i}`,
      })),
    };
    expect(bandDeltas(scoreBoardConfidence(huge, CFG), huge, CFG).length).toBe(300);
  });

  it("is pure — same inputs, deep-equal output", () => {
    expect(bandDeltas(base, inputs, CFG)).toEqual(bandDeltas(scoreBoardConfidence(inputs, CFG), inputs, CFG));
  });
});
describe("the ranked action plan", () => {
  const rep = report(sailorB);

  it("is ranked by worth, and every worth is a bandDeltas value", () => {
    const worths = rep.actions.map((a) => a.worth);
    expect(worths.length).toBeGreaterThan(0);
    expect([...worths].sort((x, y) => y - x)).toEqual(worths);
    expect(worths.every((w) => w > 0)).toBe(true);

    const deltas = new Map(
      bandDeltas(scoreBoardConfidence(sailorB, CFG), sailorB, CFG).map((d) => [d.id, d.delta]),
    );
    for (const a of rep.actions) expect(a.worth).toBe(deltas.get(a.id));
  });

  it("names the milestone and sources it", () => {
    const cert = rep.actions.find((a) => a.id === "ladr:m-cert:meet")!;
    expect(cert.action).toContain("CompTIA Security+");
    expect(cert.source).toEqual({ kind: "ladr_milestone", id: "m-cert" });
    expect(cert.area).toBe("development");
  });

  it("partitions by horizon against the board date", () => {
    expect(rep.monthsToBoard).toBe(5); // 2026-04-01 → 2026-09-01
    const h = Object.fromEntries(rep.actions.map((a) => [a.id, a]));
    expect(h["ladr:m-cert:meet"]).toMatchObject({
      horizon: "before_board",
      horizonBasis: "typical_months",
    });
    expect(h["ladr:m-deg:meet"]).toMatchObject({
      horizon: "next_cycle",
      horizonBasis: "typical_months",
    });
    expect(h["ladr:m-open:answer"]).toMatchObject({
      horizon: "before_board",
      horizonBasis: "administrative",
    });
  });

  it("blocked_unless wins over a duration that would otherwise fit", () => {
    // The fixture gives the blocked row a typical_months INSIDE the window, so
    // this distinguishes precedence rather than blessing either answer.
    const inputs: RubricInputs = {
      ...sailorB,
      ladr: sailorB.ladr.map((i) => (i.milestone_id === "m-nec" ? { ...i, typical_months: 1 } : i)),
    };
    expect(report(inputs).actions.find((a) => a.id === "ladr:m-nec:meet")).toMatchObject({
      horizon: "blocked",
      horizonBasis: "blocked_unless",
      blockedBy: "requires a sea billet",
    });
  });

  it("does not guess a duration when the milestone has none", () => {
    const noDuration: RubricInputs = {
      ...sailorB,
      ladr: [{ milestone_id: "m-x", category: "credential", status: "not_met", verified_in_ompf: false, item: "Some cert" }],
    };
    expect(report(noDuration).actions.find((a) => a.id === "ladr:m-x:meet")).toMatchObject({
      horizon: "next_cycle",
      horizonBasis: "unknown_duration",
      blockedBy: null,
    });
  });

  it("moves an item into reach as the board date recedes", () => {
    const far = report(sailorB, { asOf: "2024-09-01" });
    expect(far.monthsToBoard).toBe(23); // floor(730 days / 30.44), the engine's convention
    expect(far.actions.find((a) => a.id === "ladr:m-deg:meet")!.horizon).toBe("before_board");
  });
});

describe("purity, and asOf as a trust boundary", () => {
  it("coverage.measured is exactly Σ(weight·conf)/100 over the six factors", () => {
    for (const inputs of [sailorA, sailorB, emptyRecord]) {
      const r = scoreBoardConfidence(inputs, CFG);
      const expected = r.factors.reduce((a, f) => a + f.weight * f.confidence, 0) / 100;
      expect(buildReadinessReport(r, inputs, CFG).coverage.measured).toBe(expected);
    }
  });

  it("defaults asOf to the board date — never to a past date, which overstates time left", () => {
    // Sailor B's newest report ends 2026-03-15. Defaulting to it would claim 5
    // months remain when the caller told us nothing about today.
    expect(report(sailorB, {}).monthsToBoard).toBe(0);
    expect(report(emptyRecord, {}).monthsToBoard).toBe(0);
  });

  it("rejects a malformed asOf instead of producing NaN", () => {
    for (const bad of ["", "not-a-date", "26-04-01", "2026/04/01", "2026-4-1"]) {
      const rep = report(sailorB, { asOf: bad });
      expect(Number.isFinite(rep.monthsToBoard)).toBe(true);
      expect(rep.monthsToBoard).toBe(0);
    }
    // An asOf after the board date clamps at 0 rather than going negative.
    expect(report(sailorB, { asOf: "2027-01-01" }).monthsToBoard).toBe(0);
  });

  it("is deterministic and does not mutate its inputs", () => {
    const snapshot = JSON.stringify(sailorB);
    expect(JSON.stringify(report(sailorB))).toBe(JSON.stringify(report(sailorB)));
    expect(JSON.stringify(sailorB)).toBe(snapshot);
  });

  it("the floor is tunable per run", () => {
    const r = scoreBoardConfidence(sailorB, CFG);
    expect(buildReadinessReport(r, sailorB, CFG, { coverageFloor: 0.99 }).score).toBeNull();
    expect(buildReadinessReport(r, sailorB, CFG, { coverageFloor: 0.1 }).score).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// COVERAGE_FLOOR was calibrated on a scale where the precept factor contributed
// a free 0.10 at conf = 1 whether or not anything backed it. Now that an
// unsourced precept is excluded like an absent one (service.ts), coverage maps
// measured_after = (measured_before − 0.10) × 10/9 — strictly downward, fixed
// point only at 1.0. The floor is deliberately NOT rescaled; this pins both the
// mapping and that decision, so a future rescale is a conscious act.
// ---------------------------------------------------------------------------
describe("COVERAGE_FLOOR against the post-redistribution scale", () => {
  const withPrecept = { ...sailorB, preceptFlags: ALL_FLAGS };
  const without = { ...sailorB, preceptFlags: [] as PreceptFlag[] };

  it("excluding the precept rescales coverage over the surviving verdict weights", () => {
    // The mapping is derived, not memorised: coverage is Σ(w·conf)/100 over the
    // EFFECTIVE weights, which are nominal × 100/(100 − excluded). With
    // development, completeness and continuity always off the axis the two
    // denominators are 65 (precept in) and 55 (precept out), and a fully
    // observed precept contributes its nominal 10 to the numerator.
    const m1 = report(withPrecept).coverage.measured;
    const m2 = report(without).coverage.measured;
    const preceptConf = scoreBoardConfidence(withPrecept, CFG).factors.find(
      (f) => f.key === "precept",
    )!.confidence;
    expect(m2).toBeCloseTo((m1 * 65 - 10 * preceptConf) / 55, 10);
    expect(m2).toBeLessThan(m1); // strictly downward below 1.0
  });

  it("the floor is judged against effective weights, and stays 0.75", () => {
    expect(COVERAGE_FLOOR).toBe(0.75);
    // Both runs are judged against the same number — the scale changed, the
    // threshold did not. The no-precept case has always been on this scale.
    expect(report(withPrecept).coverage.floor).toBe(COVERAGE_FLOOR);
    expect(report(without).coverage.floor).toBe(COVERAGE_FLOOR);
  });

  it("a record can cross the floor purely from the precept exclusion", () => {
    // The consequence, stated rather than discovered later: same Sailor, same
    // entries, suppressed after the change because the free 0.10 is gone.
    // The reviewer's worked example: 0.7675 before, 0.7417 after.
    const before = 0.7675;
    const after = ((before - 0.1) * 10) / 9;
    expect(before).toBeGreaterThan(COVERAGE_FLOOR); // a number was emitted
    expect(after).toBeCloseTo(0.7417, 4);
    expect(after).toBeLessThan(COVERAGE_FLOOR); // now suppressed, same Sailor
  });
});

describe("completeness never grades a Sailor on what they have not entered", () => {
  // The screen prints "Nothing below is a grade on what you have not entered."
  // This is the area that made that false: it reports conf = 1 whether or not
  // anything is behind it, so the ONE purely-data-entry measure was the one
  // guaranteed to be graded rather than excluded.
  const partial: RubricInputs = {
    boardDate: T,
    evals: [2024, 2025, 2026].map((y) => annual(y, "Must Promote", 4.2)),
    psr: { ...emptyPsr, entered: true },
    ladr: [],
    preceptFlags: [],
  };

  it("never reports needs_attention, on any record", () => {
    for (const inputs of [emptyRecord, partial, sailorA, sailorB])
      expect(
        report(inputs).areas.find((a) => a.key === "completeness")!.status,
      ).not.toBe("needs_attention");
  });

  it("has no needs_attention string left to reach", () => {
    // A future edit that re-adds the copy would resurrect the contradiction.
    for (const inputs of [emptyRecord, partial, sailorA])
      expect(
        report(inputs).areas.find((a) => a.key === "completeness")!.summary,
      ).not.toContain("Large parts of your record are not entered");
  });

  it("routes the sections into the plan instead, with a how-to", () => {
    const missing = report(partial).coverage.missing.find((m) => m.area === "completeness");
    expect(missing).toBeDefined();
    expect(missing!.howTo).toContain("Record Entry tab");
  });

  it("still says so plainly when the record IS well entered", () => {
    const full = report(sailorB).areas.find((a) => a.key === "completeness")!;
    expect(["strong", "on_track"]).toContain(full.status);
  });
});
