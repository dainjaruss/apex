// tests/unit/boardConfidenceRubric.test.ts
//
// scoreBoardConfidence — deterministic Board Confidence rubric (spec §7).
// The three §7.2 worked examples are the conformance fixture: final/band are
// pinned exactly, cited intermediates at 1-decimal tolerance (§11.1 — the §7.2
// numbers are 2-decimal displays of full-float values). Plus every §7 boundary:
// band edges 85/70/50/30, gap edge 90 days, grace edge 365 days, coverage edge
// 0.95, N_obs edge 3, trend edge 4 evals, adverse caps 30/20, PFA 36-month
// INCLUSIVE bound, and the §7 item-8 zero-data guard (never NaN).
// Band model per PERS-80 promotion-brief confidence votes (100/75/50/25/0).

import { describe, it, expect, vi } from "vitest";
import {
  scoreBoardConfidence,
  bandFor,
  round1HalfAway,
  FACTOR_WEIGHTS,
} from "@/lib/boardConfidence/rubric";
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

  it("emits six factors with the nominal weights", () => {
    expect(r.factors).toHaveLength(6);
    expect(f.performance.weight).toBe(40);
    expect(f.precept.weight).toBe(10);
  });

  it("pins the performance subcomponents P1–P4", () => {
    expect(num(f.performance.detail.P1)).toBeCloseTo(97.0, 1);
    expect(num(f.performance.detail.P2)).toBeCloseTo(84.48, 1);
    expect(num(f.performance.detail.P3)).toBeCloseTo(56.67, 1);
    expect(num(f.performance.detail.P4)).toBeCloseTo(78.77, 1);
    expect(num(f.performance.detail.declinePenalty)).toBe(0);
  });

  it("pins the factor scores S_P / S_L / S_D / S_R", () => {
    expect(f.performance.score).toBeCloseTo(83.84, 1);
    expect(f.leadership.score).toBeCloseTo(84.4, 1);
    expect(f.development.score).toBeCloseTo(87.0, 1);
    expect(f.completeness.score).toBeCloseTo(98, 1);
  });

  it("pins all six contributions", () => {
    expect(f.performance.contribution).toBeCloseTo(33.53, 1);
    expect(f.leadership.contribution).toBeCloseTo(12.66, 1);
    expect(f.development.contribution).toBeCloseTo(13.05, 1);
    expect(f.continuity.contribution).toBeCloseTo(10.0, 1);
    expect(f.completeness.contribution).toBeCloseTo(9.8, 1);
    expect(f.precept.contribution).toBeCloseTo(10.0, 1);
  });

  it("FINAL = 89.0 → vote 100 'Clearly at the top' (exact)", () => {
    expect(r.adverseAdjustment).toBe(0);
    expect(r.final).toBe(89.0);
    expect(r.band).toBe(100);
    expect(r.bandLabel).toBe("Clearly at the top");
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

  it("raw = 50.29; FINAL = 50.3 → vote 50 'Crunch — middle band' (exact)", () => {
    expect(rawSum(r)).toBeCloseTo(50.29, 1);
    expect(r.adverseAdjustment).toBe(0);
    expect(r.final).toBe(50.3);
    expect(r.band).toBe(50);
    expect(r.bandLabel).toBe("Crunch — middle band");
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
    expect(f.performance.contribution).toBeCloseTo(10.51, 1);
  });

  it("tours-not-entered removes L1+L3: S_L = 5 at conf_L 0.30", () => {
    expect(f.leadership.score).toBeCloseTo(5, 1);
    expect(f.leadership.confidence).toBeCloseTo(0.3, 1);
  });

  it("pins S_D 80.77 at conf_D 6/27 (unanswered ≠ not met, but cannot help)", () => {
    expect(f.development.score).toBeCloseTo(80.77, 1);
    expect(f.development.confidence).toBeCloseTo(0.222, 1);
  });

  it("pins continuity S_C = 100·0.4003 − 30 = 10.03 and completeness S_R = 8", () => {
    expect(num(f.continuity.detail.coverage)).toBeCloseTo(0.4003, 1);
    expect(num(f.continuity.detail.gapCount)).toBe(2);
    expect(f.continuity.score).toBeCloseTo(10.03, 1);
    expect(f.completeness.score).toBeCloseTo(8, 1);
  });

  it("raw = 20.23, A = 10 (PFA fail ≤36 mo); FINAL = 10.2 → vote 0 (exact)", () => {
    expect(rawSum(r)).toBeCloseTo(20.23, 1);
    expect(r.adverseAdjustment).toBe(10);
    expect(r.final).toBe(10.2);
    expect(r.band).toBe(0);
    expect(r.bandLabel).toBe("Drop-from-consideration risk");
  });
});

// ---------------------------------------------------------------------------
// §7.1 band boundaries + terminal rounding
// ---------------------------------------------------------------------------

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
    expect(num(a.continuity.detail.coverage)).toBeGreaterThanOrEqual(0.95);
    expect(num(b.continuity.detail.coverage)).toBeLessThan(0.95);
    expect(a.completeness.score - b.completeness.score).toBeCloseTo(20, 5);
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
    expect(l.score).toBeCloseTo(10, 1); // verified NAM = 10, renormalized over L2 alone
    expect(l.confidence).toBeCloseTo(0.3, 3);
  });
});

describe("missing-data policy — precept exclusion redistributes ×100/90 (admin-side only)", () => {
  it("zero precept flags: precept weight 0 / detail.excluded, five weights ×100/90", () => {
    const f = byKey(run({ evals: annual(3) })); // preceptFlags: []
    expect(f.precept.weight).toBe(0);
    expect(f.precept.score).toBe(0);
    expect(f.precept.confidence).toBe(1);
    expect(f.precept.contribution).toBe(0);
    expect(f.precept.detail.excluded).toBe(true);
    for (const key of [
      "performance",
      "leadership",
      "development",
      "continuity",
      "completeness",
    ] as FactorKey[]) {
      expect(f[key].weight).toBeCloseTo((FACTOR_WEIGHTS[key] * 100) / 90, 3);
    }
  });

  it("with flags configured, weights stay nominal (sailor-side absence never redistributes)", () => {
    const f = byKey(scoreBoardConfidence(ex3Inputs));
    expect(f.performance.weight).toBe(40);
    expect(f.precept.weight).toBe(10);
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

describe("UNVERIFIED_MULT — ESR-only items count at half value everywhere", () => {
  it("a met LaDR item with verified_in_ompf false scores its category at 0.5", () => {
    const d = byKey(run({ ladr: [li("qual_warfare", "met", false)] })).development;
    expect(d.score).toBeCloseTo(50, 1);
  });

  it("an unverified award earns half its L2 points", () => {
    const award = (verified: boolean): PsrSection => ({
      ...emptyPsr,
      awards: [
        { title: "NAM", level: "personal_achievement", date_awarded: "2024-02-01", verified_in_ompf: verified },
      ],
    });
    expect(byKey(run({ psr: award(true) })).leadership.score).toBeCloseTo(10, 1);
    expect(byKey(run({ psr: award(false) })).leadership.score).toBeCloseTo(5, 1);
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
      "Excluded 1 reports dated after the board date.",
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
      "1 entries with missing dates were excluded from scoring — add dates in Record Entry.",
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
      "Excluded 1 reports dated after the board date.",
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
      "Excluded 1 reports dated after the board date.",
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
      "1 entries with missing dates were excluded from scoring — add dates in Record Entry.",
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
