// tests/unit/boardConfidenceRubric.test.ts
//
// scoreBoardConfidence — deterministic Board Confidence rubric (spec §7).
//
// The three §7.2 worked examples are still the conformance fixture, but their
// pinned finals were RE-DERIVED for the corrected arithmetic: the composite is
// Σ(w·conf·S)/Σ(w·conf), not Σ(w/100)·S·conf against a fixed denominator of 100,
// and `development`/`completeness` no longer carry verdict weight. A pinned
// number alone cannot tell a right engine from a wrong one, so every example also
// asserts the composite IDENTITY (final = Σcontribution/coverage − A) recomputed
// from (weight, score, confidence) — that arm fails for any factor whose three
// reported numbers stop agreeing with the score they produced.
//
// The invariant suite at the bottom is the real guard: it pins PROPERTIES that
// must hold for every record — absence never lowers the composite, self-attested
// fields cannot move it — rather than the output of the current implementation.
//
// Plus every §7 boundary:
// band edges 85/70/50/30, gap edge 90 days, grace edge 365 days, coverage edge
// 0.95, N_obs edge 3, trend edge 4 evals, adverse caps 30/20, PFA 36-month
// INCLUSIVE bound, and the §7 item-8 zero-data guard (never NaN).
// Band model per PERS-80 promotion-brief confidence votes (100/75/50/25/0).

import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_RUBRIC_CONFIG,
  compositeRaw,
  scoreBoardConfidence,
  bandDeltas,
  bandFor,
  round1HalfAway,
  FACTOR_WEIGHTS,
} from "@/lib/boardConfidence/rubric";
import { earlyPromoteMax } from "@/lib/forcedDistribution";
import type {
  FactorKey,
  FactorResult,
  LadrCategory,
  LadrItemInput,
  LadrStatus,
  PromotionRec,
  PsrSection,
  RubricEvalInput,
  RubricInputs,
  RubricResult,
} from "@/lib/boardConfidence/types";

const T = "2026-09-01"; // board date for all §7.2 fixtures

const num = (v: unknown): number => v as number;

const byKey = (r: RubricResult): Record<FactorKey, FactorResult> =>
  Object.fromEntries(r.factors.map((f) => [f.key, f])) as Record<
    FactorKey,
    FactorResult
  >;

const rawSum = (r: RubricResult): number =>
  r.factors.reduce((s, f) => s + f.contribution, 0);

/**
 * The composite recomputed from scratch out of (weight, score, confidence) —
 * Σ(w·conf·S)/Σ(w·conf) − A, clamped and rounded. Deliberately NOT written the
 * way the engine writes it, so a pinned final and this arm cannot both be wrong
 * in the same way. Any factor whose reported triple stops agreeing with the score
 * it produced fails here even when the pinned number is updated to match.
 */
const recompute = (r: RubricResult): number => {
  let num = 0;
  let den = 0;
  for (const f of r.factors) {
    num += f.weight * f.confidence * f.score;
    den += f.weight * f.confidence;
  }
  const raw = den === 0 ? 0 : num / den;
  return round1HalfAway(Math.min(100, Math.max(0, raw - r.adverseAdjustment)));
};

const emptyPsr: PsrSection = {
  entered: false,
  awards: null,
  necs: null,
  education: null,
  tours: null,
  pfa: null,
  adverse: [],
};

const baseEval: RubricEvalInput = {
  period_from: "2025-03-16",
  period_to: "2026-03-15",
  report_type: "EVAL",
  promotion_recommendation: "Promotable",
  trait_average: 4.0,
  summary_group_average: 3.9,
  rsca: null,
  sea_duty: false,
  ep_count: null,
  group_size: null,
};

const ev = (over: Partial<RubricEvalInput>): RubricEvalInput => ({
  ...baseEval,
  ...over,
});

const run = (over: Partial<RubricInputs>): RubricResult =>
  scoreBoardConfidence({
    boardDate: T,
    evals: [],
    psr: emptyPsr,
    ladr: [],
    preceptFlags: [],
    ...over,
  });

// LaDR item builders (items arrive pre-filtered for applicability, §3 rule).
let seq = 0;
const li = (
  category: LadrCategory,
  status: LadrStatus,
  verified = true,
): LadrItemInput => ({
  milestone_id: `m-${++seq}`,
  category,
  status,
  verified_in_ompf: verified,
});
const many = (
  n: number,
  category: LadrCategory,
  status: LadrStatus,
  verified = true,
): LadrItemInput[] => Array.from({ length: n }, () => li(category, status, verified));

// ---------------------------------------------------------------------------
// §7.2 EXAMPLE 1 — STRONG (IT1 up for ITC)
// ---------------------------------------------------------------------------

const ex1Inputs: RubricInputs = {
  boardDate: T,
  evals: [
    ev({
      period_from: "2020-03-16",
      period_to: "2021-03-15",
      promotion_recommendation: "Must Promote",
      trait_average: 4.0,
      summary_group_average: 3.95,
    }),
    ev({
      period_from: "2021-03-16",
      period_to: "2022-03-15",
      promotion_recommendation: "Must Promote",
      trait_average: 4.1,
      summary_group_average: 4.0,
      sea_duty: true,
    }),
    ev({
      period_from: "2022-03-16",
      period_to: "2023-03-15",
      promotion_recommendation: "Early Promote",
      trait_average: 4.3,
      summary_group_average: 4.05,
      sea_duty: true,
      ep_count: 2,
      group_size: 12,
    }),
    ev({
      period_from: "2023-03-16",
      period_to: "2024-03-15",
      promotion_recommendation: "Early Promote",
      trait_average: 4.4,
      summary_group_average: 4.1,
      sea_duty: true,
      ep_count: 2,
      group_size: 13,
    }),
    ev({
      period_from: "2024-03-16",
      period_to: "2025-03-15",
      promotion_recommendation: "Early Promote",
      trait_average: 4.5,
      summary_group_average: 4.2,
      ep_count: 1,
      group_size: 9,
    }),
    ev({
      period_from: "2025-03-16",
      period_to: "2026-03-15",
      promotion_recommendation: "Early Promote",
      trait_average: 4.57,
      summary_group_average: 4.22,
      ep_count: 2,
      group_size: 10,
    }),
  ],
  psr: {
    entered: true,
    awards: [
      // L2 = 10 + 10 + 20 + 4 + 4 = 48, all OMPF-verified, all within 120 months
      { title: "NAM", level: "personal_achievement", date_awarded: "2022-05-01", verified_in_ompf: true },
      { title: "NAM (2nd)", level: "personal_achievement", date_awarded: "2024-04-01", verified_in_ompf: true },
      { title: "NCM", level: "personal_commendation", date_awarded: "2025-11-01", verified_in_ompf: true },
      { title: "Battle E", level: "unit", date_awarded: "2021-10-01", verified_in_ompf: true },
      { title: "MUC", level: "unit", date_awarded: "2023-08-01", verified_in_ompf: true },
    ],
    necs: [{ code: "746A", title: "Systems Administration", date_awarded: "2022-01-15", verified_in_ompf: true }],
    education: [{ kind: "degree", title: "AS Information Technology", date: "2024-12-15", verified_in_ompf: true }],
    tours: [
      // 2 leadership tours → L1 = 100; sea span > 36 months in window → L3 = 100
      { title: "USS NEVERSAIL", start: "2020-09-01", end: "2024-03-15", sea_duty: true, leadership: true },
      { title: "NCTS shore", start: "2024-03-16", end: null, sea_duty: false, leadership: true },
    ],
    pfa: [
      { cycle: "2024-1", date: "2024-05-10", result: "pass" },
      { cycle: "2024-2", date: "2024-11-10", result: "pass" },
      { cycle: "2025-1", date: "2025-05-10", result: "pass" },
    ],
    adverse: [],
  },
  // 27/27 answered; ratios warfare 1.0, watch 1.0, rate 5/6, pme_req 1.0,
  // skill_req 1.0, cred 2/3, edu 0.5 (met unverified), nec 0.5, pme_rec 0.5,
  // skill_rec 2/3 → S_D = 87.00. One unverified item total → esrFlags 8.
  ladr: [
    ...many(2, "qual_warfare", "met"),
    ...many(3, "qual_watchstanding", "met"),
    ...many(5, "qual_rate_specific", "met"),
    li("qual_rate_specific", "not_met", false),
    ...many(3, "pme_required", "met"),
    ...many(2, "skill_training_required", "met"),
    ...many(2, "credential", "met"),
    li("credential", "not_met", false),
    li("education_degree", "met", false), // the ONE unverified entry
    li("nec_opportunity", "met"),
    li("nec_opportunity", "not_met", false),
    li("pme_recommended", "met"),
    li("pme_recommended", "not_met", false),
    ...many(2, "skill_training_recommended", "met"),
    li("skill_training_recommended", "not_met", false),
  ],
  preceptFlags: ["warfighting", "leadership_positions"],
};

describe("§7.2 Example 1 — strong record (conformance fixture)", () => {
  const r = scoreBoardConfidence(ex1Inputs);
  const f = byKey(r);

  it("emits six factors; the three off the verdict axis carry weight 0", () => {
    expect(r.factors).toHaveLength(6);
    // development 15 + completeness 10 + continuity 10 excluded; 40/15/10 → ×100/65.
    expect(f.development.weight).toBe(0);
    expect(f.completeness.weight).toBe(0);
    expect(f.continuity.weight).toBe(0);
    expect(f.performance.weight).toBeCloseTo((40 * 100) / 65, 9);
    expect(f.precept.weight).toBeCloseTo((10 * 100) / 65, 9);
    expect(r.factors.reduce((a, x) => a + x.weight, 0)).toBeCloseTo(100, 9);
  });

  it("pins the performance subcomponents P1–P4", () => {
    expect(num(f.performance.detail.P1)).toBeCloseTo(97.0, 1);
    expect(num(f.performance.detail.P2)).toBeCloseTo(84.48, 1);
    expect(num(f.performance.detail.P3)).toBeCloseTo(56.67, 1);
    // P4 = 92.67, not the old 78.77: the two earliest evals record NO summary-group
    // distribution, and they no longer sit in P4's denominator scoring s = 0.
    expect(num(f.performance.detail.P4)).toBeCloseTo(92.67, 1);
    expect(num(f.performance.detail.declinePenalty)).toBe(0);
  });

  it("pins the factor scores S_P / S_L / S_D / S_R", () => {
    expect(f.performance.score).toBeCloseTo(85.92, 1);
    expect(f.leadership.score).toBeCloseTo(84.4, 1);
    // 89.50, not 87.00: the one met-but-unverified education row counts in full.
    expect(f.development.score).toBeCloseTo(89.5, 1);
    expect(f.completeness.score).toBeCloseTo(100, 1);
  });

  it("the excluded factors are still fully computed, they just contribute nothing", () => {
    expect(f.development.confidence).toBe(1);
    expect(f.completeness.confidence).toBe(1);
    expect(f.development.contribution).toBe(0);
    expect(f.completeness.contribution).toBe(0);
    expect(r.ladrUnmet!.length).toBeGreaterThan(0);
  });

  it("FINAL = 87.7 → vote 100 'Clearly at the top' (exact)", () => {
    expect(r.adverseAdjustment).toBe(0);
    expect(r.final).toBe(87.7);
    expect(r.band).toBe(100);
    expect(r.bandLabel).toBe("Clearly at the top");
  });

  it("satisfies the composite identity independently of the pinned number", () => {
    expect(r.final).toBe(recompute(r));
  });
});

// ---------------------------------------------------------------------------
// §7.2 EXAMPLE 2 — AVERAGE (one decline, no EPs, warfare gap)
// ---------------------------------------------------------------------------

const ex2Inputs: RubricInputs = {
  boardDate: T,
  evals: [
    ev({
      period_from: "2020-12-01",
      period_to: "2021-11-30",
      promotion_recommendation: "Promotable",
      trait_average: 3.8,
      summary_group_average: 3.9,
      sea_duty: true,
      ep_count: 0,
      group_size: 10,
    }),
    ev({
      period_from: "2021-12-01",
      period_to: "2022-11-30",
      promotion_recommendation: "Promotable",
      trait_average: 3.9,
      summary_group_average: 3.92,
      sea_duty: true,
      ep_count: 0,
      group_size: 10,
    }),
    ev({
      period_from: "2022-12-01",
      period_to: "2023-11-30",
      promotion_recommendation: "Must Promote",
      trait_average: 4.0,
      summary_group_average: 3.98,
      ep_count: 0,
      group_size: 10,
    }),
    ev({
      period_from: "2023-12-01",
      period_to: "2024-11-30",
      promotion_recommendation: "Promotable", // decline MP→P
      trait_average: 3.95,
      summary_group_average: 4.0,
      ep_count: 0,
      group_size: 10,
    }),
    ev({
      period_from: "2024-12-01",
      period_to: "2025-11-30",
      promotion_recommendation: "Must Promote",
      trait_average: 4.1,
      summary_group_average: 4.02,
      ep_count: 0,
      group_size: 10,
    }),
  ],
  psr: {
    entered: true,
    awards: [
      // L2 = 10 + 4 + 4 = 18, all verified
      { title: "NAM", level: "personal_achievement", date_awarded: "2023-03-01", verified_in_ompf: true },
      { title: "Battle E", level: "unit", date_awarded: "2021-06-01", verified_in_ompf: true },
      { title: "MUC", level: "unit", date_awarded: "2022-06-01", verified_in_ompf: true },
    ],
    necs: [{ code: "746A", verified_in_ompf: true }],
    education: [{ kind: "course", title: "NAVEDTRA module", verified_in_ompf: true }],
    tours: [
      // 1 leadership tour → L1 = 50; ~24 sea months in window → L3 = 66.67
      { title: "USS NEVERSAIL", start: "2020-12-01", end: "2022-12-02", sea_duty: true, leadership: true },
      { title: "NCTS shore", start: "2022-12-03", end: null, sea_duty: false, leadership: false },
    ],
    pfa: [
      { cycle: "2024-1", date: "2024-05-10", result: "pass" },
      { cycle: "2024-2", date: "2024-11-10", result: "pass" },
      { cycle: "2025-1", date: "2025-05-10", result: "pass" },
    ],
    adverse: [],
  },
  // 23/29 answered; warfare 0/1, watch 1.0, rate 0.5, pme_req 2/3, skill_req 1.0,
  // cred 1/3, nec 0.5, skill_rec 0.5; edu + pme_rec unanswered → dropped, wSum 92.
  ladr: [
    li("qual_warfare", "not_met", false),
    li("qual_warfare", "unanswered", false),
    ...many(4, "qual_watchstanding", "met"),
    ...many(2, "qual_rate_specific", "met"),
    ...many(2, "qual_rate_specific", "not_met", false),
    ...many(2, "pme_required", "met"),
    li("pme_required", "not_met", false),
    ...many(4, "skill_training_required", "met"),
    li("credential", "met"),
    ...many(2, "credential", "not_met", false),
    li("credential", "unanswered", false),
    li("nec_opportunity", "met"),
    li("nec_opportunity", "not_met", false),
    li("skill_training_recommended", "met"),
    li("skill_training_recommended", "not_met", false),
    ...many(2, "education_degree", "unanswered", false),
    ...many(2, "pme_recommended", "unanswered", false),
  ],
  preceptFlags: ["warfighting", "leadership_positions"],
};

describe("§7.2 Example 2 — average record (crunch / second-review profile)", () => {
  const r = scoreBoardConfidence(ex2Inputs);
  const f = byKey(r);

  it("pins P1 / P2 and the one-decline penalty", () => {
    expect(num(f.performance.detail.P1)).toBeCloseTo(65.19, 1);
    expect(num(f.performance.detail.P2)).toBeCloseTo(50.61, 1);
    expect(num(f.performance.detail.declinePenalty)).toBe(10);
  });

  it("pins S_P, S_D, and conf_D", () => {
    expect(f.performance.score).toBeCloseTo(39.53, 1);
    expect(f.development.score).toBeCloseTo(51.81, 1);
    expect(f.development.confidence).toBeCloseTo(0.793, 1);
  });

  it("FINAL = 38.7 → vote 25 (exact), and the identity holds", () => {
    // 50.3 before. The drop is entirely the two data-entry factors leaving the
    // verdict: completeness was carrying S_R 88.9 and development S_D 51.8 into a
    // record whose PERFORMANCE is 39.5 — one decline, no Early Promote in five
    // years, trait averages at or below the summary group, and a warfare-qual gap
    // that the precept factor reads as `warfighting: 0`. Filling in APEX forms was
    // worth a band; it is not any more.
    expect(r.adverseAdjustment).toBe(0);
    expect(r.final).toBe(38.7);
    expect(r.band).toBe(25);
    expect(r.final).toBe(recompute(r));
  });

  it("a weight-0 factor's confidence cannot reach the denominator", () => {
    // conf_D is 0.79 and conf_R/conf_C are 1, but none of the three carries
    // weight, so coverage over the VERDICT is exactly 1 for this record.
    expect(r.factors.reduce((a, x) => a + x.weight * x.confidence, 0) / 100).toBe(1);
    expect(rawSum(r)).toBeCloseTo(38.66, 1);
  });
});

// ---------------------------------------------------------------------------
// §7.2 EXAMPLE 3 — WEAK/INCOMPLETE (confidence collapse + PFA failure)
// ---------------------------------------------------------------------------

const ex3Inputs: RubricInputs = {
  boardDate: T,
  evals: [
    ev({
      period_from: "2023-06-01",
      period_to: "2024-05-31",
      promotion_recommendation: "Promotable",
      trait_average: 3.7,
      summary_group_average: null, // no comparator → P2 fallback path
      rsca: null,
    }),
    ev({
      period_from: "2024-06-01",
      period_to: "2025-05-31",
      promotion_recommendation: "Must Promote",
      trait_average: 4.05,
      summary_group_average: 4.0,
    }),
  ],
  psr: {
    entered: false,
    awards: [
      { title: "NAM", level: "personal_achievement", date_awarded: "2024-02-01", verified_in_ompf: false },
    ],
    necs: null,
    education: null,
    tours: null,
    pfa: [{ cycle: "2025-1", date: "2025-06-15", result: "fail" }],
    adverse: [],
  },
  // 6 of 27 applicable answered; every met item OMPF-verified.
  ladr: [
    li("qual_warfare", "met"),
    li("qual_warfare", "unanswered", false),
    li("pme_required", "met"),
    ...many(2, "pme_required", "unanswered", false),
    li("qual_rate_specific", "met"),
    li("qual_rate_specific", "not_met", false),
    ...many(2, "qual_rate_specific", "unanswered", false),
    li("qual_watchstanding", "met"),
    li("qual_watchstanding", "not_met", false),
    ...many(2, "qual_watchstanding", "unanswered", false),
    ...many(4, "credential", "unanswered", false),
    li("education_degree", "unanswered", false),
    ...many(3, "nec_opportunity", "unanswered", false),
    ...many(2, "pme_recommended", "unanswered", false),
    ...many(2, "skill_training_required", "unanswered", false),
    ...many(2, "skill_training_recommended", "unanswered", false),
  ],
  preceptFlags: ["warfighting", "leadership_positions"],
};

describe("§7.2 Example 3 — weak/incomplete record (drop-risk profile)", () => {
  const r = scoreBoardConfidence(ex3Inputs);
  const f = byKey(r);

  it("pins P2 (fallback comparator path) and the conf_P collapse", () => {
    expect(num(f.performance.detail.P2)).toBeCloseTo(45.08, 1);
    expect(f.performance.confidence).toBeCloseTo(0.467, 1);
  });

  it("tours-not-entered removes L1+L3: S_L = 10 at conf_L 0.30", () => {
    // 10, not 5: the single NAM is worth its 10 points whether or not the Sailor
    // has ticked "verified in OMPF" on it.
    expect(f.leadership.score).toBeCloseTo(10, 1);
    expect(f.leadership.confidence).toBeCloseTo(0.3, 1);
  });

  it("pins S_D 80.77 at conf_D 6/27 (unanswered ≠ not met, but cannot help)", () => {
    expect(f.development.score).toBeCloseTo(80.77, 1);
    expect(f.development.confidence).toBeCloseTo(0.222, 1);
  });

  it("continuity: window coverage 0.4003 is REPORTED, the score grades the observed span", () => {
    // detail.coverage keeps its meaning — 731 of the 1826 window days documented,
    // which is what readiness.ts grades the area on and what the completeness
    // continuity95 item tests. The SCORE grades spanCoverage (731/824), because
    // the 1095 days before this Sailor's first report are not a missing report.
    expect(num(f.continuity.detail.coverage)).toBeCloseTo(0.4003, 3);
    expect(num(f.continuity.detail.spanCoverage)).toBeCloseTo(0.8871, 3);
    // ONE genuine break (the trailing gap), not two — the leading span is gone.
    expect(num(f.continuity.detail.gapCount)).toBe(1);
    expect(f.continuity.score).toBeCloseTo(100 * 0.8871359 - 15, 3);
    // …and the observed span is only 824 of 1826 days, which lands on conf.
    expect(f.continuity.confidence).toBeCloseTo(824 / 1826, 6);
    expect(f.completeness.score).toBeCloseTo((100 * 15) / 90, 1);
  });

  it("A = 10 (PFA fail ≤36 mo); FINAL = 46.7 on coverage 0.43 (graded, NOT gated)", () => {
    expect(r.adverseAdjustment).toBe(10);
    // 10.2 before. This record is not WORSE than it was — APEX can barely SEE it:
    // 2 reports, no tours, PSR not entered, 6 of 27 roadmap rows answered. Every
    // one of those absences used to be charged as an earned zero. They now leave
    // the denominator, and the residue is what APEX actually measured. Coverage
    // 0.44 is how the Sailor is told that, and readiness.ts refuses to render a
    // number at all below its 0.75 floor.
    expect(r.final).toBe(46.7);
    expect(r.band).toBe(25);
    expect(r.factors.reduce((a, x) => a + x.weight * x.confidence, 0) / 100).toBeCloseTo(0.433, 3);
    expect(r.final).toBe(recompute(r));
  });

  it("raises the continuity advisory for the genuine trailing gap (leading span excluded)", () => {
    // gapCount 2 (graded: leading + trailing) but only the trailing gap is a
    // genuine reporting break, so recordGapCount 1 drives the advisory.
    expect(num(f.continuity.detail.recordGapCount)).toBe(1);
    expect(r.continuityGap).toBe(true);
    expect(r.continuityAdvisory).toMatch(/reporting continuity/i);
    expect(r.warnings.some((w) => /reporting continuity/i.test(w))).toBe(true);
  });

  // REGRESSION PIN — BUPERSINST 1610.10H para 17-6 says missing reports "do not
  // disqualify a member before a selection board". APEX shipped the exact inversion
  // ("even a single day ... enough to disqualify a candidate"). Never reintroduce it.
  it("states the 17-6 rule, never the disqualification inversion", () => {
    const advisory = r.continuityAdvisory ?? "";
    expect(advisory).toMatch(/do NOT disqualify you before a selection board/i);
    expect(advisory).toMatch(/1610\.10H para 17-6/);
    expect(advisory).not.toMatch(/even a single day/i);
    expect(advisory).not.toMatch(/enough to disqualify/i);
    // it must name the remedy the instruction provides, at its real threshold
    expect(advisory).toMatch(/E-5 or above within the past 5 years/i);
    expect(advisory).toMatch(/PERS-32/);
    expect(advisory).toMatch(/17-6a/);
    expect(advisory).toMatch(/letter in lieu/i);
    expect(advisory).toMatch(/17-6b/);
    // ...and the CONDITIONS on each remedy. A Sailor who mails a bare copy without
    // 17-6a's signed cover letter, or a letter that omits 17-6b's "why" and its
    // blocks 1-19 / 22-26 data, gets the submission bounced. Naming the paragraph
    // without its requirements fails the Sailor the same way withholding it did.
    expect(advisory).toMatch(/all required signatures, initials and dates/i);
    expect(advisory).toMatch(/signed cover letter/i);
    expect(advisory).toMatch(/filed in your official record/i);
    expect(advisory).toMatch(/explaining why it could not be obtained/i);
    expect(advisory).toMatch(/blocks 1-19 and 22-26/i);
    // the advisory is what gets pushed into warnings, verbatim
    expect(r.warnings).toContain(advisory);
  });
});

// ---------------------------------------------------------------------------
// v1.5 config tuning — weights, board-emphasis multiplier, gap threshold
// ---------------------------------------------------------------------------

describe("v1.5 RubricConfig tuning", () => {
  it("weights are normalized to 100: doubling every weight changes nothing", () => {
    const doubled = Object.fromEntries(
      Object.entries(DEFAULT_RUBRIC_CONFIG.weights).map(([k, v]) => [k, v * 2]),
    ) as Record<FactorKey, number>;
    const a = scoreBoardConfidence(ex1Inputs);
    const b = scoreBoardConfidence(ex1Inputs, {
      ...DEFAULT_RUBRIC_CONFIG,
      weights: doubled,
    });
    expect(b.final).toBe(a.final);
    expect(byKey(b).performance.weight).toBe(byKey(a).performance.weight);
  });

  it("skewed weights shift the final and show up as normalized factor weights", () => {
    const skewed = scoreBoardConfidence(ex1Inputs, {
      ...DEFAULT_RUBRIC_CONFIG,
      weights: {
        performance: 70,
        leadership: 10,
        development: 5,
        continuity: 5,
        completeness: 5,
        precept: 5,
      },
    });
    // development 5 + completeness 5 + continuity 5 excluded → the rest ×100/85.
    expect(byKey(skewed).performance.weight).toBeCloseTo((70 * 100) / 85, 9);
    expect(byKey(skewed).development.weight).toBe(0);
    expect(skewed.final).not.toBe(scoreBoardConfidence(ex1Inputs).final);
  });

  it("board_emphasis items count ×multiplier inside their category", () => {
    const dev = (mult: number) =>
      byKey(
        scoreBoardConfidence(
          {
            boardDate: T,
            evals: [],
            psr: emptyPsr,
            preceptFlags: [],
            ladr: [
              li("qual_warfare", "met"),
              { ...li("qual_warfare", "not_met", false), board_emphasis: true },
            ],
          },
          { ...DEFAULT_RUBRIC_CONFIG, board_emphasis_multiplier: mult },
        ),
      ).development.score;
    // met=1 vs emphasized not_met: mult 1 → 1/2, default mult 2 → 1/3.
    expect(dev(1)).toBeCloseTo(50, 1);
    expect(dev(2)).toBeCloseTo(100 / 3, 1);
  });

  it("continuity_gap_days is the advisory threshold: raising it past Ex3's gaps clears the advisory and lifts the graded score", () => {
    const wide = scoreBoardConfidence(ex3Inputs, {
      ...DEFAULT_RUBRIC_CONFIG,
      continuity_gap_days: 1100, // both Ex3 gaps (~1002 and ~93 days) tolerated
    });
    expect(wide.continuityGap).toBe(false);
    expect(wide.continuityAdvisory).toBeNull();
    // no gap penalty now → continuity factor rises → final above the gated case
    expect(wide.final).toBeGreaterThan(10.2);
  });
});

describe("bands — §7.1 boundaries are ≥ on the lower bound", () => {
  const cases: Array<[number, number]> = [
    [85.0, 100],
    [84.9, 75],
    [70.0, 75],
    [69.9, 50],
    [50.0, 50],
    [49.9, 25],
    [30.0, 25],
    [29.9, 0],
  ];
  for (const [final, vote] of cases) {
    it(`rounded final ${final} → vote ${vote}`, () => {
      expect(bandFor(final).vote).toBe(vote);
    });
  }

  it("labels match the §7.1 band table", () => {
    expect(bandFor(85).label).toBe("Clearly at the top");
    expect(bandFor(70).label).toBe("Competitive");
    expect(bandFor(50).label).toBe("Crunch — middle band");
    expect(bandFor(30).label).toBe("Not competitive this cycle");
    expect(bandFor(0).label).toBe("Drop-from-consideration risk");
  });

  it("band is computed from the ROUNDED final: 84.96 → 85.0 → 100, 84.94 → 84.9 → 75", () => {
    expect(round1HalfAway(84.96)).toBe(85.0);
    expect(bandFor(round1HalfAway(84.96)).vote).toBe(100);
    expect(round1HalfAway(84.94)).toBe(84.9);
    expect(bandFor(round1HalfAway(84.94)).vote).toBe(75);
  });
});

// ---------------------------------------------------------------------------
// Factor 4 continuity edges (5-year recorder check, 60-month window)
// ---------------------------------------------------------------------------

describe("continuity — gap edge at 90 days (spec §7 Factor 4)", () => {
  const gapRun = (secondFrom: string) =>
    byKey(
      run({
        evals: [
          ev({ period_from: "2021-06-01", period_to: "2024-01-31" }),
          ev({ period_from: secondFrom, period_to: "2026-08-31" }),
        ],
      }),
    ).continuity;

  it("a 90-day uncovered run incurs no gap penalty", () => {
    const c = gapRun("2024-05-01"); // uncovered 2024-02-01..2024-04-30 = 90 days
    expect(num(c.detail.gapCount)).toBe(0);
    expect(c.score).toBeCloseTo(95.07, 1);
  });

  it("a 91-day uncovered run incurs one 15-point gap penalty", () => {
    const c = gapRun("2024-05-02"); // uncovered = 91 days
    expect(num(c.detail.gapCount)).toBe(1);
    expect(c.score).toBeCloseTo(80.02, 1);
  });
});

describe("continuity — 365-day trailing grace edge", () => {
  it("latest period_to exactly 365 days before T: windowEnd = period_to, full coverage", () => {
    const c = byKey(
      run({ evals: [ev({ period_from: "2020-01-01", period_to: "2025-09-01" })] }),
    ).continuity;
    expect(num(c.detail.coverage)).toBeCloseTo(1, 6);
    expect(num(c.detail.gapCount)).toBe(0);
    expect(c.score).toBeCloseTo(100, 1);
  });

  it("366 days before T opens a trailing uncovered run (coverage < 1)", () => {
    const c = byKey(
      run({ evals: [ev({ period_from: "2020-01-01", period_to: "2025-08-31" })] }),
    ).continuity;
    expect(num(c.detail.coverage)).toBeLessThan(1);
    expect(num(c.detail.coverage)).toBeCloseTo(1825 / 1826, 3);
    expect(num(c.detail.gapCount)).toBe(0); // 1 uncovered day ≤ 90 → no penalty
  });
});

describe("completeness — continuity-coverage item edge at 0.95", () => {
  // Single eval ending inside the grace window; only the leading uncovered run
  // varies, so the two runs differ ONLY in the 20-point continuity95 item.
  const covRun = (from: string) =>
    byKey(run({ evals: [ev({ period_from: from, period_to: "2026-08-31" })] }));

  it("coverage 0.9502 earns the 20-point item; 0.9491 does not", () => {
    const a = covRun("2021-12-01"); // covered 1735/1826 = 0.9502
    const b = covRun("2021-12-03"); // covered 1733/1826 = 0.9491
    // The item still keys on WINDOW coverage — "do you have five years of reports"
    // is a completeness question, and it is the one readiness.ts reuses.
    expect(num(a.continuity.detail.coverage)).toBeGreaterThanOrEqual(0.95);
    expect(num(b.continuity.detail.coverage)).toBeLessThan(0.95);
    // 20 of the table's 90 points, rescaled to the 0-100 factor.
    expect(a.completeness.score - b.completeness.score).toBeCloseTo((100 * 20) / 90, 5);
    expect(a.completeness.confidence).toBe(1); // never confidence-discounted
  });
});

// ---------------------------------------------------------------------------
// Missing-data policy — N_obs edge 3, trend edge 4, sub-weight removal
// ---------------------------------------------------------------------------

// n contiguous annual reports, all ending BEFORE T (v1.1 review fix: the old
// helper's latest period_to was 2027-03-15 — after T — and passed only because
// future-dated evals used to slip through with recency weight > 1).
const annual = (n: number): RubricEvalInput[] =>
  Array.from({ length: n }, (_, i) =>
    ev({
      period_from: `${2025 - n + i}-03-16`,
      period_to: `${2026 - n + i}-03-15`,
    }),
  );

describe("missing-data policy — performance confidence and sub-weights", () => {
  it("2 observed evals: conf_P = a_P · 2/3 = 0.70 · 2/3", () => {
    const p = byKey(run({ evals: annual(2) })).performance;
    expect(num(p.detail.nObserved)).toBe(2);
    expect(num(p.detail.availableSubweight)).toBeCloseTo(0.7, 3);
    expect(p.confidence).toBeCloseTo(0.7 * (2 / 3), 3);
  });

  it("3 observed evals reach full volume confidence: conf_P = 0.70", () => {
    const p = byKey(run({ evals: annual(3) })).performance;
    expect(p.confidence).toBeCloseTo(0.7, 6);
  });

  it("trend needs ≥4 evals: with 4, P3 joins a_P (0.85) and equals 50 for a flat record", () => {
    const p = byKey(run({ evals: annual(4) })).performance;
    expect(num(p.detail.availableSubweight)).toBeCloseTo(0.85, 3);
    expect(p.confidence).toBeCloseTo(0.85, 6);
    expect(num(p.detail.P3)).toBeCloseTo(50, 1);
  });

  it("tours-not-entered removes L1+L3: awards-only leadership at conf_L 0.30", () => {
    const psr: PsrSection = {
      ...emptyPsr,
      awards: [
        { title: "NAM", level: "personal_achievement", date_awarded: "2024-02-01", verified_in_ompf: true },
      ],
    };
    const l = byKey(run({ psr })).leadership;
    expect(l.score).toBeCloseTo(10, 1); // NAM = 10, renormalized over L2 alone
    expect(l.confidence).toBeCloseTo(0.3, 3);
  });
});

describe("verdict exclusion — ONE redistribution mechanism, weights always sum to 100", () => {
  it("development, completeness and continuity are always excluded", () => {
    const f = byKey(scoreBoardConfidence(ex3Inputs)); // precept flags ARE configured
    expect(f.development.weight).toBe(0);
    expect(f.completeness.weight).toBe(0);
    expect(f.continuity.weight).toBe(0);
    // excluded = 15 + 10 + 10 = 35 → ×100/65 over performance/leadership/precept
    for (const key of ["performance", "leadership", "precept"] as FactorKey[])
      expect(f[key].weight).toBeCloseTo((FACTOR_WEIGHTS[key] * 100) / 65, 9);
  });

  it("zero precept flags excludes it too: ×100/55, and detail.excluded is set", () => {
    const f = byKey(run({ evals: annual(3) })); // preceptFlags: []
    expect(f.precept.weight).toBe(0);
    expect(f.precept.contribution).toBe(0);
    expect(f.precept.detail.excluded).toBe(true);
    for (const key of ["performance", "leadership"] as FactorKey[])
      expect(f[key].weight).toBeCloseTo((FACTOR_WEIGHTS[key] * 100) / 55, 9);
  });

  it("effective weights sum to exactly 100 in BOTH branches", () => {
    for (const flags of [[], ["warfighting"]] as RubricInputs["preceptFlags"][]) {
      const r = run({ evals: annual(3), preceptFlags: flags });
      expect(r.factors.reduce((a, f) => a + f.weight, 0)).toBeCloseTo(100, 9);
    }
  });
});

describe("missing-data policy — LaDR na renormalizes, unanswered lowers conf_D only", () => {
  it("'na' item drops its category without touching conf_D", () => {
    const d = byKey(
      run({ ladr: [li("qual_warfare", "met"), li("pme_required", "na", false)] }),
    ).development;
    expect(d.score).toBeCloseTo(100, 1);
    expect(d.confidence).toBeCloseTo(1, 6);
  });

  it("'unanswered' item keeps score renormalized but halves conf_D", () => {
    const d = byKey(
      run({
        ladr: [li("qual_warfare", "met"), li("pme_required", "unanswered", false)],
      }),
    ).development;
    expect(d.score).toBeCloseTo(100, 1);
    expect(d.confidence).toBeCloseTo(0.5, 6);
  });
});

describe("self-attestation is not scored — `verified_in_ompf` is a box the Sailor ticks", () => {
  it("a met LaDR item scores its category in full whether or not it is ticked", () => {
    expect(byKey(run({ ladr: [li("qual_warfare", "met", false)] })).development.score).toBeCloseTo(100, 1);
    expect(byKey(run({ ladr: [li("qual_warfare", "met", true)] })).development.score).toBeCloseTo(100, 1);
  });

  it("an award earns its full L2 points whether or not it is ticked", () => {
    const award = (verified: boolean): PsrSection => ({
      ...emptyPsr,
      awards: [
        { title: "NAM", level: "personal_achievement", date_awarded: "2024-02-01", verified_in_ompf: verified },
      ],
    });
    expect(byKey(run({ psr: award(true) })).leadership.score).toBeCloseTo(10, 1);
    expect(byKey(run({ psr: award(false) })).leadership.score).toBeCloseTo(10, 1);
  });

  it("completeness scores the PRESENCE of an awards section, not the verified share", () => {
    const mixed: PsrSection = {
      ...emptyPsr,
      awards: [
        { title: "NAM", level: "personal_achievement", date_awarded: "2024-02-01", verified_in_ompf: false },
        { title: "NCM", level: "personal_commendation", date_awarded: "2024-03-01", verified_in_ompf: false },
      ],
    };
    const all: PsrSection = {
      ...mixed,
      awards: (mixed.awards ?? []).map((a) => ({ ...a, verified_in_ompf: true })),
    };
    expect(byKey(run({ psr: mixed })).completeness.score).toBe(
      byKey(run({ psr: all })).completeness.score,
    );
    // …but the unscored count the OMPF reminder is built from is still reported.
    expect(num(byKey(run({ psr: mixed })).completeness.detail.unverifiedCount)).toBe(2);
    expect(num(byKey(run({ psr: all })).completeness.detail.unverifiedCount)).toBe(0);
  });

  it("there is no esrFlags term left to score the unverified count", () => {
    expect(byKey(run({})).completeness.detail).not.toHaveProperty("esrFlags");
  });
});

// ---------------------------------------------------------------------------
// Penalties and caps
// ---------------------------------------------------------------------------

describe("decline penalty — flat −10 per consecutive drop, capped at −20", () => {
  const declineRun = (recs: PromotionRec[]) =>
    byKey(
      run({
        evals: recs.map((rec, i) =>
          ev({
            period_from: `${2022 + i}-03-16`,
            period_to: `${2023 + i}-03-15`,
            promotion_recommendation: rec,
          }),
        ),
      }),
    ).performance;

  it("one decline subtracts 10", () => {
    const p = declineRun(["Early Promote", "Must Promote", "Early Promote", "Early Promote"]);
    expect(num(p.detail.declinePenalty)).toBe(10);
  });

  it("three declines cap at 20", () => {
    const p = declineRun(["Early Promote", "Must Promote", "Promotable", "Progressing"]);
    expect(num(p.detail.declinePenalty)).toBe(20);
  });
});

describe("adverse adjustment A — 15/item capped 30; PFA 36-month INCLUSIVE bound", () => {
  it("1 adverse item → A = 15", () => {
    const r = run({
      psr: { ...emptyPsr, adverse: [{ kind: "njp", date: "2024-01-10" }] },
    });
    expect(r.adverseAdjustment).toBe(15);
  });

  it("3 adverse items cap at A = 30", () => {
    const r = run({
      psr: {
        ...emptyPsr,
        adverse: [
          { kind: "njp", date: "2024-01-10" },
          { kind: "page13", date: "2023-05-01" },
          { kind: "court_memo", date: "2025-02-20" },
        ],
      },
    });
    expect(r.adverseAdjustment).toBe(30);
  });

  it("PFA failure at exactly 36 months before T adds 10 (inclusive bound)", () => {
    // daysBetween(2023-09-01, 2026-09-01) = 1096 → floor(1096/30.44) = 36
    const r = run({
      psr: { ...emptyPsr, pfa: [{ cycle: "2023-2", date: "2023-09-01", result: "fail" }] },
    });
    expect(r.adverseAdjustment).toBe(10);
  });

  it("PFA failure at 37 months before T adds 0", () => {
    // daysBetween(2023-07-29, 2026-09-01) = 1130 → floor(1130/30.44) = 37
    const r = run({
      psr: { ...emptyPsr, pfa: [{ cycle: "2023-2", date: "2023-07-29", result: "fail" }] },
    });
    expect(r.adverseAdjustment).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §7 item-8 zero-data guard + determinism
// ---------------------------------------------------------------------------

describe("zero-data guard — empty record still yields a finite low score (§7 item 8)", () => {
  const r = run({ preceptFlags: ["warfighting"] }); // zero evals, all-null PSR, empty LaDR

  it("affected factors emit S_f 0, conf_f 0, detail.no_data — never NaN", () => {
    const f = byKey(r);
    for (const key of ["performance", "leadership", "development"] as FactorKey[]) {
      expect(f[key].score).toBe(0);
      expect(f[key].confidence).toBe(0);
      expect(f[key].contribution).toBe(0);
      expect(f[key].detail.no_data).toBe(true);
    }
  });

  it("every number in the result is finite", () => {
    expect(Number.isFinite(r.final)).toBe(true);
    expect(Number.isFinite(r.adverseAdjustment)).toBe(true);
    for (const fac of r.factors) {
      expect(Number.isFinite(fac.weight)).toBe(true);
      expect(Number.isFinite(fac.score)).toBe(true);
      expect(Number.isFinite(fac.confidence)).toBe(true);
      expect(Number.isFinite(fac.contribution)).toBe(true);
    }
    expect(r.band).toBe(0); // an unbriefable record does not exist to the board
  });
});

// ---------------------------------------------------------------------------
// v1.1 review fixes — future evals, unknown recs, dateless entries
// ---------------------------------------------------------------------------

describe("v1.1 review fixes — robustness guards", () => {
  it("evals with period_to after T are excluded from ALL factors, with warning", () => {
    const future = ev({ period_from: "2026-03-16", period_to: "2027-03-15" });
    const withFuture = run({ evals: [ev({}), future] });
    const without = run({ evals: [ev({})] });
    expect(withFuture.factors).toEqual(without.factors); // continuity included
    expect(withFuture.warnings).toContain(
      "Excluded 1 report dated after the board date.",
    );
  });

  it("an unknown promotion_recommendation is treated as NOB — continuity yes, performance no", () => {
    const bogus = ev({ promotion_recommendation: "EP" as PromotionRec });
    const r = run({ evals: [bogus] });
    const f = byKey(r);
    expect(f.performance.detail.no_data).toBe(true); // never indexes REC_POINTS
    expect(num(f.continuity.detail.coveredDays)).toBeGreaterThan(0);
    expect(Number.isFinite(r.final)).toBe(true);
  });

  it("a dateless award is excluded from L2, with the missing-dates warning", () => {
    const psr: PsrSection = {
      ...emptyPsr,
      awards: [
        { title: "NAM", level: "personal_achievement", date_awarded: "", verified_in_ompf: true },
        { title: "NCM", level: "personal_commendation", date_awarded: "2024-02-01", verified_in_ompf: true },
      ],
    };
    const r = run({ psr });
    expect(byKey(r).leadership.score).toBeCloseTo(20, 1); // dated NCM only
    expect(r.warnings).toContain(
      "1 entry with missing dates was excluded from scoring — add dates in Record Entry.",
    );
  });

  it("a PFA failure without a date still applies the −10 penalty (conservative), with warning", () => {
    const r = run({
      psr: { ...emptyPsr, pfa: [{ cycle: "2025-1", date: "", result: "fail" }] },
    });
    expect(r.adverseAdjustment).toBe(10);
    expect(r.warnings).toContain(
      "A PFA failure without a date was counted as recent — add the date to confirm the 36-month window.",
    );
  });
});

// ---------------------------------------------------------------------------
// Mutation kills — clamp order, board-date boundary, dateless tours, NOB mixing
// ---------------------------------------------------------------------------

describe("mutation kills — decline penalty applies BEFORE the clamp", () => {
  it("weak declining record floors at S_P = 0 with a non-negative contribution", () => {
    // P1 ≈ 10.4 (Progressing→Significant Problems), P2 = 0 (trait 3.4 vs SGA
    // 3.9 → clamp), so sum/a_P ≈ 5.2 < the 10-point penalty. Penalty-then-clamp
    // gives 0; a clamp-then-penalty mutation would leave S_P ≈ −4.8 and a
    // negative contribution.
    const p = byKey(
      run({
        evals: [
          ev({
            period_from: "2024-03-16",
            period_to: "2025-03-15",
            promotion_recommendation: "Progressing",
            trait_average: 3.4,
            summary_group_average: 3.9,
          }),
          ev({
            period_from: "2025-03-16",
            period_to: "2026-03-15",
            promotion_recommendation: "Significant Problems",
            trait_average: 3.4,
            summary_group_average: 3.9,
          }),
        ],
      }),
    ).performance;
    expect(num(p.detail.declinePenalty)).toBe(10);
    expect(num(p.detail.P2)).toBe(0);
    expect(p.score).toBe(0);
    expect(p.contribution).toBeGreaterThanOrEqual(0);
  });
});

describe("mutation kills — board-date boundary on the future-eval filter", () => {
  it("an eval ending exactly ON the board date is included, without the exclusion warning", () => {
    const r = run({
      evals: [ev({ period_from: "2025-09-02", period_to: T })],
    });
    const f = byKey(r);
    expect(num(f.performance.detail.nObserved)).toBe(1);
    expect(num(f.continuity.detail.coveredDays)).toBeGreaterThan(0);
    expect(r.warnings).not.toContain(
      "Excluded 1 report dated after the board date.",
    );
  });

  it("an eval ending one day AFTER the board date is excluded from every factor, with the warning", () => {
    const r = run({
      evals: [ev({ period_from: "2025-09-03", period_to: "2026-09-02" })],
    });
    const f = byKey(r);
    expect(f.performance.detail.no_data).toBe(true);
    expect(num(f.continuity.detail.coveredDays)).toBe(0);
    expect(r.warnings).toContain(
      "Excluded 1 report dated after the board date.",
    );
  });
});

describe("mutation kills — dateless tours and dateless PFA passes", () => {
  it("a tour with a missing start date is excluded from L1/L3, with the warning", () => {
    const psr: PsrSection = {
      ...emptyPsr,
      tours: [
        { title: "dateless", start: "", end: null, sea_duty: true, leadership: true },
        { title: "dated", start: "2023-01-01", end: null, sea_duty: false, leadership: true },
      ],
    };
    const r = run({ psr });
    const l = byKey(r).leadership;
    expect(num(l.detail.L1)).toBe(50); // only the dated leadership tour counts
    expect(num(l.detail.seaMonths72)).toBe(0); // the dateless sea tour adds nothing
    expect(r.warnings).toContain(
      "1 entry with missing dates was excluded from scoring — add dates in Record Entry.",
    );
  });

  it("a dateless PFA PASS adds no penalty and no dateless-fail warning", () => {
    const r = run({
      psr: { ...emptyPsr, pfa: [{ cycle: "2025-1", date: "", result: "pass" }] },
    });
    expect(r.adverseAdjustment).toBe(0);
    expect(r.warnings).not.toContain(
      "A PFA failure without a date was counted as recent — add the date to confirm the 36-month window.",
    );
  });
});

describe("mutation kills — NOB/null rec mixed with an observed rec", () => {
  it("counts continuity coverage but carries zero Performance weight", () => {
    const f = byKey(
      run({
        evals: [
          ev({
            period_from: "2024-03-16",
            period_to: "2025-03-15",
            promotion_recommendation: null as unknown as PromotionRec,
          }),
          ev({
            period_from: "2025-03-16",
            period_to: "2026-03-15",
            promotion_recommendation: "Must Promote",
          }),
        ],
      }),
    );
    expect(num(f.performance.detail.nObserved)).toBe(1);
    // MP alone → P1 exactly 80; a NOB-as-0-points mutation would drag it down.
    expect(num(f.performance.detail.P1)).toBeCloseTo(80, 6);
    // Both periods merge into one covered run: 2024-03-16..2026-03-15 = 730 days.
    expect(num(f.continuity.detail.coveredDays)).toBe(730);
  });
});

describe("determinism — pure engine, no clock reads", () => {
  it("same inputs twice produce deep-equal results", () => {
    const a = scoreBoardConfidence(structuredClone(ex1Inputs));
    const b = scoreBoardConfidence(structuredClone(ex1Inputs));
    expect(a).toEqual(b);
  });

  it("never calls Date.now (T is the only time source)", () => {
    const spy = vi.spyOn(Date, "now");
    scoreBoardConfidence(structuredClone(ex2Inputs));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// INVARIANTS. These pin PROPERTIES the engine must have for every record, not
// the output of the current implementation. Prior rounds on this epic shipped
// five tests that pinned today's numbers and therefore caught nothing when the
// numbers were wrong; the rule of this block is that no assertion may contain a
// constant copied out of a test run.
// ---------------------------------------------------------------------------

// A record with something real in every factor, used as the perturbation base.
const solidEvals = (n: number, rec: PromotionRec = "Must Promote"): RubricEvalInput[] =>
  Array.from({ length: n }, (_, i) =>
    ev({
      period_from: `${2026 - n + i}-03-16`,
      period_to: `${2027 - n + i}-03-15`,
      promotion_recommendation: rec,
      trait_average: 4.2,
      summary_group_average: 4.0,
      ep_count: 0,
      group_size: 10,
    }),
  );

const solidPsr = (): PsrSection => ({
  entered: true,
  awards: [
    { title: "NAM", level: "personal_achievement", date_awarded: "2024-02-01", verified_in_ompf: true },
    { title: "MSM", level: "msm_or_above", date_awarded: "2025-02-01", verified_in_ompf: true },
  ],
  necs: [{ code: "746A", verified_in_ompf: true }],
  education: [{ kind: "degree", title: "AS", date: "2024-12-15", verified_in_ompf: true }],
  tours: [{ title: "USS NEVERSAIL", start: "2021-01-01", end: null, sea_duty: true, leadership: true }],
  pfa: [
    { cycle: "2024-1", date: "2024-05-10", result: "pass" },
    { cycle: "2024-2", date: "2024-11-10", result: "pass" },
    { cycle: "2025-1", date: "2025-05-10", result: "pass" },
  ],
  adverse: [],
});

const solidLadr = (): LadrItemInput[] => [
  li("qual_warfare", "met"),
  li("qual_warfare", "not_met", false),
  li("qual_rate_specific", "met"),
  li("pme_required", "met"),
  li("credential", "not_met", false),
  li("education_degree", "met"),
  li("nec_opportunity", "not_met", false),
];

const solid = (over: Partial<RubricInputs> = {}): RubricInputs => ({
  boardDate: T,
  evals: solidEvals(4),
  psr: solidPsr(),
  ladr: solidLadr(),
  preceptFlags: [],
  ...over,
});

describe("INVARIANT — unknown and weak are separate axes", () => {
  // The founding decision, stated as arithmetic: for EVERY factor, a record that
  // gives APEX nothing to look at must never score below the SAME record with the
  // worst possible data in that factor. Before the fix these were identical by
  // construction — conf = 0 and S = 0 both contributed nothing against a fixed
  // denominator of 100 — which is the whole reason this PR exists.
  const cases: Array<{ factor: string; absent: Partial<RubricInputs>; worst: Partial<RubricInputs> }> = [
    {
      factor: "performance",
      absent: { evals: [] },
      worst: { evals: solidEvals(4, "Significant Problems") },
    },
    {
      factor: "leadership",
      absent: { psr: { ...solidPsr(), tours: null, awards: null } },
      worst: { psr: { ...solidPsr(), tours: [], awards: [] } },
    },
    {
      factor: "precept",
      absent: { ladr: [], psr: { ...solidPsr(), tours: null }, preceptFlags: ["warfighting", "leadership_positions"] },
      worst: {
        ladr: [li("qual_warfare", "not_met", false)],
        psr: { ...solidPsr(), tours: [] },
        preceptFlags: ["warfighting", "leadership_positions"],
      },
    },
    {
      factor: "continuity",
      absent: { evals: [] },
      worst: {
        // two reports at opposite ends of the window: a real, enormous break
        evals: [
          ev({ period_from: "2021-04-01", period_to: "2021-06-30" }),
          ev({ period_from: "2026-01-01", period_to: "2026-03-15" }),
        ],
      },
    },
  ];

  for (const c of cases) {
    it(`${c.factor}: no data scores at least as high as worst-possible data`, () => {
      const absent = scoreBoardConfidence(solid(c.absent));
      const worst = scoreBoardConfidence(solid(c.worst));
      expect(absent.final).toBeGreaterThanOrEqual(worst.final);
      // …and the two are genuinely distinguishable, so this is not vacuously true.
      expect(absent.final).not.toBe(worst.final);
    });
  }

  it("a factor APEX cannot see leaves the denominator entirely", () => {
    const r = scoreBoardConfidence(solid({ evals: [] }));
    const perf = byKey(r).performance;
    expect(perf.confidence).toBe(0);
    // The composite equals the mean over the factors that DO have data — computed
    // here without performance appearing anywhere, weight or otherwise.
    const seen = r.factors.filter((f) => f.weight > 0 && f.confidence > 0);
    const mean =
      seen.reduce((a, f) => a + f.weight * f.confidence * f.score, 0) /
      seen.reduce((a, f) => a + f.weight * f.confidence, 0);
    expect(r.final).toBe(round1HalfAway(mean - r.adverseAdjustment));
  });

  it("answering a roadmap row and failing it beats leaving it blank, never the reverse", () => {
    // Measured before the fix: 59.3 for "every row answered, every row failed" vs
    // 58.2 for "answered nothing" — being honest cost the Sailor a point.
    const rows = solidLadr();
    const blank = scoreBoardConfidence(solid({ ladr: rows.map((x) => ({ ...x, status: "unanswered" as const })) }));
    const failed = scoreBoardConfidence(solid({ ladr: rows.map((x) => ({ ...x, status: "not_met" as const })) }));
    expect(failed.final).toBeGreaterThanOrEqual(blank.final);
  });
});

describe("compositeRaw — the fingerprint service.ts checks the readiness triple with", () => {
  it("is the unrounded composite, adverse included, and distinguishes what `final` rounds away", () => {
    const clean = solid({});
    const punished = solid({ psr: { ...solidPsr(), adverse: [{ kind: "njp", date: "2025-01-01" }] } });
    const a = scoreBoardConfidence(clean);
    const b = scoreBoardConfidence(punished);

    // It must carry A: assertTripleMatches uses it to catch "this result was not
    // scored from these inputs", and two records differing only in adverse
    // material are exactly the mismatch it is there to catch.
    expect(compositeRaw(a) - compositeRaw(b)).toBeCloseTo(b.adverseAdjustment, 9);
    expect(b.adverseAdjustment).toBeGreaterThan(0);

    // Unrounded, so a near-miss cannot slip through a 1-decimal comparison.
    expect(compositeRaw(a)).not.toBe(round1HalfAway(compositeRaw(a)));
    expect(round1HalfAway(compositeRaw(a))).toBe(a.final);
  });

  it("is 0 − A when nothing in the verdict has data, never NaN", () => {
    const r = scoreBoardConfidence({ boardDate: T, evals: [], psr: emptyPsr, ladr: [], preceptFlags: [] });
    expect(Number.isFinite(compositeRaw(r))).toBe(true);
    expect(compositeRaw(r)).toBe(0 - r.adverseAdjustment);
    expect(r.adverseAdjustment).toBe(0);
  });
});

describe("INVARIANT — a roadmap is a plan, not a verdict", () => {
  const statuses: LadrStatus[] = ["met", "not_met", "unanswered", "na"];

  it("no LaDR answer moves the composite when no precept is configured", () => {
    const base = scoreBoardConfidence(solid({ ladr: [] })).final;
    for (const st of statuses)
      expect(scoreBoardConfidence(solid({ ladr: solidLadr().map((x) => ({ ...x, status: st })) })).final).toBe(base);
    // …including the case that used to cost 15 weighted points outright.
    expect(scoreBoardConfidence(solid({ ladr: [] })).final).toBe(base);
  });

  it("the length of the roadmap cannot move the composite", () => {
    const short = solidLadr();
    const long = [...solidLadr(), ...many(80, "advancement_consideration", "not_met", false)];
    const a = scoreBoardConfidence(solid({ ladr: short }));
    const b = scoreBoardConfidence(solid({ ladr: long }));
    expect(b.final).toBe(a.final);
    // …while the AREA still reports the difference, because the plan needs it.
    expect(byKey(b).development.score).not.toBe(byKey(a).development.score);
  });

  it("with a precept configured the roadmap moves the composite ONLY through the precept factor", () => {
    const flags: RubricInputs["preceptFlags"] = ["warfighting"];
    const met = scoreBoardConfidence(solid({ preceptFlags: flags, ladr: [li("qual_warfare", "met")] }));
    const notMet = scoreBoardConfidence(solid({ preceptFlags: flags, ladr: [li("qual_warfare", "not_met", false)] }));
    expect(met.final).toBeGreaterThan(notMet.final);
    for (const key of ["performance", "leadership", "continuity"] as FactorKey[])
      expect(byKey(met)[key].contribution).toBeCloseTo(byKey(notMet)[key].contribution, 9);
    expect(byKey(met).development.contribution).toBe(0);
    expect(byKey(notMet).development.contribution).toBe(0);
  });

  it("the action plan survives development leaving the verdict", () => {
    const inputs = solid({});
    const plan = bandDeltas(scoreBoardConfidence(inputs), inputs, DEFAULT_RUBRIC_CONFIG);
    expect(plan.length).toBe(inputs.ladr.filter((i) => i.status === "not_met" || i.status === "unanswered").length);
    expect(plan.some((d) => d.delta > 0)).toBe(true);
    expect([...plan].sort((a, b) => b.delta - a.delta)).toEqual(plan);
    // every delta is the development factor's own marginal, not a composite delta
    const unmet = new Map(scoreBoardConfidence(inputs).ladrUnmet!.map((u) => [u.milestone_id, u.factorLocalPoints]));
    for (const d of plan) expect(d.delta).toBe(unmet.get(d.milestoneId));
  });
});

describe("INVARIANT — self-attested fields cannot move the composite", () => {
  it("flipping every verified_in_ompf box changes nothing anywhere", () => {
    const honest = solid({
      psr: { ...solidPsr(), awards: (solidPsr().awards ?? []).map((a) => ({ ...a, verified_in_ompf: false })) },
      ladr: solidLadr().map((x) => ({ ...x, verified_in_ompf: false })),
      preceptFlags: ["warfighting", "education", "technical_expertise"],
    });
    const ticked = solid({
      psr: solidPsr(),
      ladr: solidLadr().map((x) => ({ ...x, verified_in_ompf: true })),
      preceptFlags: ["warfighting", "education", "technical_expertise"],
    });
    const a = scoreBoardConfidence(honest);
    const b = scoreBoardConfidence(ticked);
    expect(a.final).toBe(b.final);
    for (const f of a.factors) {
      const g = byKey(b)[f.key];
      expect(f.score).toBeCloseTo(g.score, 9);
      expect(f.confidence).toBeCloseTo(g.confidence, 9);
    }
  });

  it("a self-typed rsca can never RAISE the composite", () => {
    // rsca comes from member_board_records.eval_context — the Sailor types it.
    // With no summary group it used to be the sole comparator, so typing 3.0
    // against a 4.2 trait average was worth double digits.
    const noSga = solidEvals(4).map((e) => ({ ...e, summary_group_average: null, ep_count: null, group_size: null }));
    const honest = scoreBoardConfidence(solid({ evals: noSga })).final;
    for (const rsca of [2.0, 3.0, 3.4, 4.0, 4.2, 4.6, 5.0]) {
      const typed = scoreBoardConfidence(solid({ evals: noSga.map((e) => ({ ...e, rsca })) })).final;
      expect(typed).toBeLessThanOrEqual(honest);
    }
  });

  it("with a real summary group, rsca is still allowed to make the comparison tougher", () => {
    const withSga = solidEvals(4); // sga 4.0, trait 4.2
    const plain = scoreBoardConfidence(solid({ evals: withSga })).final;
    const tougher = scoreBoardConfidence(solid({ evals: withSga.map((e) => ({ ...e, rsca: 4.6 })) })).final;
    const softer = scoreBoardConfidence(solid({ evals: withSga.map((e) => ({ ...e, rsca: 2.0 })) })).final;
    expect(tougher).toBeLessThan(plain);
    expect(softer).toBe(plain); // a lower self-typed number buys nothing
  });
});

describe("INVARIANT — P4 breakout scarcity follows the Table 1-2 quota", () => {
  // The three earlier reports deliberately record NO summary-group distribution,
  // so the ONLY thing that can put P4 on the board is the Early Promote row.
  const epEval = (groupSize: number | null, epCount: number | null): RubricEvalInput[] => [
    ...solidEvals(3).map((e) => ({ ...e, ep_count: null, group_size: null })),
    ev({
      period_from: "2025-03-16",
      period_to: "2026-03-15",
      promotion_recommendation: "Early Promote",
      trait_average: 4.5,
      summary_group_average: 4.0,
      ep_count: epCount,
      group_size: groupSize,
    }),
  ];

  it("an Early Promote in a summary group of ONE carries no breakout information", () => {
    // earlyPromoteMax(1) = 1 = N: the whole group could be Early Promote. The eval
    // is dropped from P4 entirely — it does NOT score 0, which would be the same
    // defect pointing the other way.
    const solo = byKey(scoreBoardConfidence(solid({ evals: epEval(1, 1) }))).performance;
    expect(solo.detail.P4).toBeNull();
    expect(num(solo.detail.availableSubweight)).toBeCloseTo(0.85, 9);
  });

  it("the same Early Promote in a group of twelve does, and scores higher", () => {
    const solo = scoreBoardConfidence(solid({ evals: epEval(1, 1) }));
    const group = scoreBoardConfidence(solid({ evals: epEval(12, 1) }));
    expect(num(byKey(group).performance.detail.P4)).toBeGreaterThan(0);
    expect(byKey(group).performance.score).toBeGreaterThan(byKey(solo).performance.score);
  });

  it("the gate is the instruction's quota, checked against forcedDistribution for N = 1..30", () => {
    // earlyPromoteMax is PR #25's verbatim transcription of Table 1-2. The gate is
    // "the quota binds", i.e. earlyPromoteMax(N) < N. Pin the whole table so the
    // rubric cannot drift from the instruction it claims to follow.
    for (let n = 1; n <= 30; n++) {
      const binds = earlyPromoteMax(n) < n;
      expect(binds).toBe(n >= 2);
      const p = byKey(scoreBoardConfidence(solid({ evals: epEval(n, 1) }))).performance;
      expect(p.detail.P4 !== null).toBe(binds);
    }
  });

  it("a solo group cannot inflate P4 even when another eval DOES supply it", () => {
    // Mutation survivor M07. The `informative.length > 0` filter alone does not
    // guard this: once ANY eval puts P4 on the board, the per-eval gate is the
    // only thing keeping a summary group of one out of the numerator, where it
    // scores a perfect s = 1 for a breakout nobody had to compete for.
    const withSolo = [
      ...solidEvals(2).map((e) => ({ ...e, ep_count: 0, group_size: 10 })),
      ev({
        period_from: "2024-03-16", period_to: "2025-03-15",
        promotion_recommendation: "Early Promote", trait_average: 4.5,
        summary_group_average: 4.0, ep_count: 1, group_size: 1,
      }),
    ];
    const withoutSolo = withSolo.slice(0, 2);
    const a = byKey(scoreBoardConfidence(solid({ evals: withSolo }))).performance;
    const b = byKey(scoreBoardConfidence(solid({ evals: withoutSolo }))).performance;
    expect(num(a.detail.P4)).toBe(0); // the two real groups, neither broken out of
    expect(num(a.detail.P4)).toBe(num(b.detail.P4));
  });

  it("evals that record NO distribution stay out of P4's denominator", () => {
    // They used to sit in it scoring s = 0, so a Sailor whose earlier commands
    // never recorded a summary group was charged for it. A lone Early Promote in
    // a group of 12 is a perfect breakout whether or not the reports around it
    // happen to carry a distribution.
    const blanksAround = byKey(scoreBoardConfidence(solid({ evals: epEval(12, 1) }))).performance;
    expect(num(blanksAround.detail.P4)).toBeCloseTo(100, 9);

    // …and a genuine non-breakout DOES stay in it: same record, but the earlier
    // reports record real groups the Sailor did not break out of.
    const realGroups = byKey(
      scoreBoardConfidence(
        solid({ evals: epEval(12, 1).map((e, i) => (i === 3 ? e : { ...e, ep_count: 0, group_size: 10 })) }),
      ),
    ).performance;
    expect(num(realGroups.detail.P4)).toBeLessThan(100);
  });
});

describe("INVARIANT — a section APEX could not read is not a section that is empty", () => {
  const dateless = (over: Partial<PsrSection>): PsrSection => ({ ...solidPsr(), ...over });

  it("tours whose dates are all missing behave exactly like an unfilled tours section", () => {
    const unreadable = scoreBoardConfidence(
      solid({ psr: dateless({ tours: [{ title: "X", start: "", end: null, sea_duty: true, leadership: true }] }) }),
    );
    const unfilled = scoreBoardConfidence(solid({ psr: dateless({ tours: null }) }));
    expect(byKey(unreadable).leadership.score).toBeCloseTo(byKey(unfilled).leadership.score, 9);
    expect(byKey(unreadable).leadership.confidence).toBe(byKey(unfilled).leadership.confidence);
    expect(unreadable.warnings.some((w) => /missing dates/.test(w))).toBe(true);
  });

  it("and NOT like a tours section entered with no tours in it", () => {
    const unreadable = scoreBoardConfidence(
      solid({ psr: dateless({ tours: [{ title: "X", start: "", end: null, sea_duty: true, leadership: true }] }) }),
    );
    const genuinelyNone = scoreBoardConfidence(solid({ psr: dateless({ tours: [] }) }));
    expect(byKey(unreadable).leadership.confidence).toBeGreaterThan(0);
    expect(byKey(genuinelyNone).leadership.confidence).toBeGreaterThan(
      byKey(unreadable).leadership.confidence,
    );
    // NOT asserted: that `unreadable.final` is higher. It IS higher — removing a
    // low sub-score raises the mean of what is left — and that is the withholding
    // surface, not a property to pin as desirable. An earlier revision of this
    // test pinned exactly that comparison, which made the exploit a passing
    // invariant. What stops a Sailor cashing it is the evidence floor, pinned in
    // boardConfidenceReadiness.test.ts ("blanking a section buys a raw number
    // nobody is shown").
  });

  it("the same holds for awards", () => {
    const unreadable = scoreBoardConfidence(
      solid({ psr: dateless({ awards: [{ title: "NAM", level: "personal_achievement", date_awarded: "", verified_in_ompf: true }] }) }),
    );
    const unfilled = scoreBoardConfidence(solid({ psr: dateless({ awards: null }) }));
    expect(byKey(unreadable).leadership.score).toBeCloseTo(byKey(unfilled).leadership.score, 9);
    expect(byKey(unreadable).leadership.confidence).toBe(byKey(unfilled).leadership.confidence);
  });
});

describe("INVARIANT — continuity grades missing REPORTS, never missing YEARS", () => {
  const consecutive = (n: number): RubricEvalInput[] =>
    Array.from({ length: n }, (_, i) =>
      ev({ period_from: `${2026 - n + i}-03-16`, period_to: `${2027 - n + i}-03-15` }),
    );

  it("a complete run of reports is complete however short it is", () => {
    for (const n of [1, 2, 3, 4, 5]) {
      const c = byKey(scoreBoardConfidence(solid({ evals: consecutive(n) }))).continuity;
      expect(c.score).toBeCloseTo(100, 6);
      expect(num(c.detail.gapCount)).toBe(0);
      expect(num(c.detail.recordGapCount)).toBe(0);
    }
  });

  it("…and how short it is lands on confidence instead", () => {
    const conf = [1, 2, 3, 4, 5].map(
      (n) => byKey(scoreBoardConfidence(solid({ evals: consecutive(n) }))).continuity.confidence,
    );
    expect([...conf].sort((a, b) => a - b)).toEqual(conf); // strictly increasing
    expect(conf[0]).toBeLessThan(0.3);
    expect(conf[4]).toBe(1);
  });

  it("an INTERNAL break is still a break, and still costs the penalty", () => {
    const gapped = [
      ev({ period_from: "2021-04-01", period_to: "2022-03-31" }),
      ev({ period_from: "2025-03-16", period_to: "2026-03-15" }),
    ];
    const c = byKey(scoreBoardConfidence(solid({ evals: gapped }))).continuity;
    expect(num(c.detail.gapCount)).toBe(1);
    expect(c.score).toBeLessThan(100);
    expect(scoreBoardConfidence(solid({ evals: gapped })).continuityGap).toBe(true);
  });

  it("a TRAILING break is still a break", () => {
    const stale = [ev({ period_from: "2021-04-01", period_to: "2022-03-31" })];
    const r = scoreBoardConfidence(solid({ evals: stale }));
    expect(num(byKey(r).continuity.detail.gapCount)).toBe(1);
    expect(r.continuityGap).toBe(true);
  });

  it("an undocumented span inside the window is charged ONCE, through coverage", () => {
    // Mutation survivor M17. A stale report outside the five-year window pins the
    // window start back to the full 1826 days, which re-opens a leading uncovered
    // run inside it. That run is real and it IS charged — spanCoverage falls to
    // 365/1826 — but charging it a second time as a 15-point "gap" penalty is the
    // double-count this factor was rewritten to stop.
    const staleThenRecent = [
      ev({ period_from: "2014-03-16", period_to: "2015-03-15" }), // clipped out entirely
      ev({ period_from: "2025-03-16", period_to: "2026-03-15" }),
    ];
    const c = byKey(scoreBoardConfidence(solid({ evals: staleThenRecent }))).continuity;
    expect(num(c.detail.observedDays)).toBe(1826); // the stale row pinned it back
    expect(num(c.detail.coveredDays)).toBe(365);
    expect(num(c.detail.spanCoverage)).toBeCloseTo(365 / 1826, 6);
    expect(num(c.detail.gapCount)).toBe(0); // charged once, not twice
    expect(c.score).toBeCloseTo((100 * 365) / 1826, 6);
  });

  it("no usable report at all is the zero-data case, not a graded zero", () => {
    const c = byKey(scoreBoardConfidence(solid({ evals: [] }))).continuity;
    expect(c.confidence).toBe(0);
    expect(c.detail.no_data).toBe(true);
    expect(c.contribution).toBe(0);
    expect(num(c.detail.coveredDays)).toBe(0);
  });
});

describe("INVARIANT — every number the engine emits is finite", () => {
  const hostile: Array<[string, Partial<RubricInputs>]> = [
    ["empty", { evals: [], psr: emptyPsr, ladr: [] }],
    ["malformed eval dates", { evals: [ev({ period_from: "not-a-date", period_to: "2026-03-15" })] }],
    ["one report, no group, no comparator", { evals: [ev({ summary_group_average: null, rsca: null })] }],
    ["all sections dateless", {
      psr: {
        ...solidPsr(),
        awards: [{ title: "X", level: "unit", date_awarded: "", verified_in_ompf: false }],
        tours: [{ title: "Y", start: "", end: null, sea_duty: true, leadership: true }],
      },
    }],
    ["every flag configured, nothing to compute them from", {
      evals: [], ladr: [], psr: emptyPsr,
      preceptFlags: ["warfighting", "leadership_positions", "education", "sea_duty", "technical_expertise"],
    }],
  ];

  for (const [name, over] of hostile) {
    it(name, () => {
      const r = scoreBoardConfidence(solid(over));
      expect(Number.isFinite(r.final)).toBe(true);
      expect(r.final).toBeGreaterThanOrEqual(0);
      expect(r.final).toBeLessThanOrEqual(100);
      for (const f of r.factors) {
        expect(Number.isFinite(f.score)).toBe(true);
        expect(Number.isFinite(f.confidence)).toBe(true);
        expect(Number.isFinite(f.contribution)).toBe(true);
        expect(Number.isFinite(f.weight)).toBe(true);
      }
    });
  }

  it("a record with NOTHING in any verdict factor says so instead of scoring it", () => {
    const r = scoreBoardConfidence({ boardDate: T, evals: [], psr: emptyPsr, ladr: [], preceptFlags: [] });
    expect(r.factors.reduce((a, f) => a + f.weight * f.confidence, 0)).toBe(0);
    expect(r.final).toBe(0);
    expect(r.warnings.some((w) => /placeholder, not an assessment/.test(w))).toBe(true);
  });
});
