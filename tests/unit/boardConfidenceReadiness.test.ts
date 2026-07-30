// tests/unit/boardConfidenceReadiness.test.ts
//
// v2 readiness layer (epic §3.4b, revised after the PR #21 domain review) —
// buildReadinessReport, bandDeltas, and scoreLadr's unmet output. The layer
// exists because rubric.ts sums (weight/100)·S·conf against fixed bands with no
// renormalization by Σ(weight·conf), so "we have no data" (conf = 0) and "the
// record is bad" (S = 0) are numerically identical.
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
  compositeRaw,
  scoreBoardConfidence,
  BAND_DELTA_CANDIDATE_CAP,
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

describe("the band inversion the layer exists to fix", () => {
  it("still reproduces in the raw rubric: the all-EP record bands BELOW the all-Promotable one", () => {
    const a = scoreBoardConfidence(sailorA, CFG);
    const b = scoreBoardConfidence(sailorB, CFG);
    const perf = (r: typeof a) => r.factors.find((f) => f.key === "performance")!;

    expect(perf(a).score).toBeGreaterThan(perf(b).score);
    expect(a.final).toBeLessThan(b.final);
    expect(a.bandLabel).toBe("Not competitive this cycle");
    expect(b.bandLabel).toBe("Crunch — middle band");
  });

  it("coverage separates the two records, and only the well-entered one gets a number", () => {
    const a = report(sailorA);
    const b = report(sailorB);

    expect(a.coverage.measured).toBeLessThan(COVERAGE_FLOOR);
    expect(b.coverage.measured).toBeGreaterThanOrEqual(COVERAGE_FLOOR);
    expect(b.coverage.measured - a.coverage.measured).toBeGreaterThan(0.2);

    expect(a.score).toBeNull();
    expect(a.scoreNote).toMatch(/cannot score/i);
    expect(b.score).toEqual({ value: 57.3, band: 50, label: "Crunch — middle band" });
    expect(b.scoreNote).toBeNull();
  });

  it("names what is missing instead of scoring it as zero, and still reports the strong areas", () => {
    const a = report(sailorA);

    expect(a.coverage.areasKnown).toBe(3);
    expect(a.coverage.areasTotal).toBe(6);
    expect(a.coverage.missing.map((m) => m.area).sort()).toEqual([
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

  it("BLIND SPOT: a flawless record is not scored while a weighted factor has zero confidence", () => {
    const rep = report(flawless);
    expect(rep.coverage.measured).toBeGreaterThan(COVERAGE_FLOOR); // the floor would NOT have caught it
    expect(scoreBoardConfidence(flawless, CFG).bandLabel).toBe("Crunch — middle band");
    expect(rep.score).toBeNull();
    // A first-run condition, not a permanent one: tell them to pull the roadmap.
    expect(rep.scoreNote).toContain("Navy COOL");
    expect(rep.scoreNote).toContain("one click");
  });

  it("COVERAGE FLOOR: still catches a thin record whose factors all have some confidence", () => {
    const thin: RubricInputs = {
      ...sailorB,
      evals: [annual(2025, "Promotable", 3.8), annual(2026, "Promotable", 3.8)],
      psr: { ...sailorB.psr, awards: [{ title: "NAM", level: "personal_achievement", date_awarded: "2025-01-01", verified_in_ompf: true }], tours: null },
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

  it("gates on conf < AREA_EVIDENCE_FLOOR, not conf === 0 — the PR #22 interaction", () => {
    // A returning user who changes NOTHING while their rating's roadmap grows
    // from 6 to 86 milestones (80 transcribed advancement_consideration rows).
    // Their development S stays 100. Measured with a `=== 0` gate:
    //   BEFORE  dev conf 1.000, contrib 15.00 -> 72.2 "Competitive"  (scored)
    //   AFTER   dev conf 0.070, contrib  1.05 -> 57.2 "Crunch"       (scored!)
    // -15 points and a full band drop because APEX learned more about their
    // rating. conf 0.070 slips a zero test, and coverage lands at 0.80 — above
    // COVERAGE_FLOOR — so the floor does not catch it either.
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
    expect(devOf(base).confidence).toBe(1);
    expect(devOf(after).score).toBe(100); // unchanged: the RECORD did not change
    expect(devOf(after).confidence).toBeCloseTo(6 / 86, 6);
    expect(devOf(after).confidence).toBeGreaterThan(0); // a `=== 0` gate would miss it
    expect(devOf(after).confidence).toBeLessThan(AREA_EVIDENCE_FLOOR);

    const before = report(base);
    const grownRep = report(after);
    expect(before.score).not.toBeNull();
    expect(scoreBoardConfidence(after, CFG).final).toBeLessThan(before.score!.value - 10);

    // The floor alone would NOT have caught it...
    expect(grownRep.coverage.measured).toBeGreaterThan(COVERAGE_FLOOR);
    // ...so the gate must, and the band never regresses in front of the Sailor.
    expect(grownRep.score).toBeNull();

    // And the sentence does not blame them for rows that did not exist before.
    expect(grownRep.scoreNote).toMatch(/grows when APEX loads newer roadmap data/);
    const dev = grownRep.areas.find((a) => a.key === "development")!;
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
    expect(rep.coverage.areasTotal).toBe(5);
    expect(rep.coverage.missing.map((m) => m.area)).not.toContain("precept");
  });
});

describe("the empty record — the first thing a new user sees", () => {
  it("the raw rubric still calls it a drop-from-consideration risk", () => {
    const r = scoreBoardConfidence(emptyRecord, CFG);
    expect(r.final).toBe(1);
    expect(r.bandLabel).toBe("Drop-from-consideration risk");
  });

  it("the readiness report emits no score and no band at all", () => {
    const rep = report(emptyRecord);
    expect(rep.score).toBeNull();
    expect(JSON.stringify(rep.areas)).not.toContain("Drop-from-consideration risk");
  });

  it("coverage is NOT zero for an empty record — three factors report conf = 1 by construction", () => {
    expect(report(emptyRecord).coverage.measured).toBeCloseTo(0.3, 10);
  });

  it("lists every unknown area rather than grading it", () => {
    const s = Object.fromEntries(report(emptyRecord).areas.map((a) => [a.key, a.status]));
    expect(s.performance).toBe("not_enough_entered");
    expect(s.leadership).toBe("not_enough_entered");
    expect(s.development).toBe("not_enough_entered");
    expect(s.continuity).toBe("not_enough_entered");
    expect(s.precept).toBe("not_enough_entered");
    // Completeness is the honest exception: an empty record really IS incomplete.
    expect(s.completeness).toBe("needs_attention");
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
    // ...but the factor SCORE carries the pre-first-report leading-span penalty,
    // which is exactly what must not be turned back into a sentence.
    expect(c.score).toBeLessThan(55);
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
    // sea_duty is a perfect 1.0; warfighting/education/technical_expertise are
    // structurally 0 because they read LaDR ratios that do not exist.
    expect(p.detail.sea_duty).toBe(1);
    expect(p.detail.warfighting).toBe(0);

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
    expect(cert.marginal_points).toBeGreaterThan(0);
  });

  it("marginal_points is a recompute of this factor's own score, not an estimate", () => {
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
      expect(u.marginal_points).toBeCloseTo(dev(flipped) - dev(base), 10);
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
        marginal_points: 100,
        board_emphasis: true,
      },
    ]);
  });
});

describe("bandDeltas — true marginal points, hand-checked against a full re-score", () => {
  const base = scoreBoardConfidence(sailorB, CFG);
  const handDelta = (next: RubricInputs) =>
    compositeRaw(scoreBoardConfidence(next, CFG)) - compositeRaw(base);
  const meet = (id: string): RubricInputs => ({
    ...sailorB,
    ladr: sailorB.ladr.map((i) => (i.milestone_id === id ? { ...i, status: "met" as const } : i)),
  });

  it("answering an unanswered LaDR row matches the hand re-score exactly", () => {
    // The flip the audit's verifier flagged as NOT a clean arithmetic
    // consequence: it moves the numerator AND the answered/applicable
    // confidence denominator, plus completeness and the precept indicators.
    const got = bandDeltas(base, sailorB, CFG).find((d) => d.id === "ladr:m-open:answer")!;
    expect(got.kind).toBe("ladr_answer");
    expect(got.delta).toBe(handDelta(meet("m-open")));

    // Recomputed, not derivable from the development factor alone.
    const local = base.ladrUnmet!.find((u) => u.milestone_id === "m-open")!.marginal_points;
    expect(got.delta).not.toBeCloseTo(local, 3);
  });

  it("every candidate delta equals its own full re-score, and the list is ranked", () => {
    const deltas = bandDeltas(base, sailorB, CFG);
    expect(deltas.length).toBe(4); // 3 not_met + 1 unanswered; no verify candidates
    for (let i = 1; i < deltas.length; i++)
      expect(deltas[i - 1].delta).toBeGreaterThanOrEqual(deltas[i].delta);
    for (const d of deltas) expect(d.delta).toBe(handDelta(meet(d.milestoneId!)));
  });

  it("a flip can be NEGATIVE, and the negative is the PRECEPT indicator diluting", () => {
    const inputs: RubricInputs = {
      boardDate: T,
      evals: [],
      psr: { ...emptyPsr, entered: true },
      ladr: [
        { milestone_id: "v1", category: "qual_warfare", status: "met", verified_in_ompf: true, item: "EIWS" },
        { milestone_id: "v2", category: "qual_warfare", status: "met", verified_in_ompf: true, item: "ESWS" },
        { milestone_id: "u1", category: "qual_warfare", status: "unanswered", verified_in_ompf: false, item: "EAWS" },
        { milestone_id: "n1", category: "pme_required", status: "not_met", verified_in_ompf: false, item: "Required PME" },
      ],
      preceptFlags: ["warfighting"],
    };
    const r = scoreBoardConfidence(inputs, CFG);
    const flipped = scoreBoardConfidence(
      {
        ...inputs,
        ladr: inputs.ladr.map((i) => (i.milestone_id === "u1" ? { ...i, status: "met" as const } : i)),
      },
      CFG,
    );
    const delta = bandDeltas(r, inputs, CFG).find((d) => d.id === "ladr:u1:answer")!.delta;

    expect(delta).toBeCloseTo(-29 / 120, 12);

    // The decomposition, because the cause was mis-attributed once already:
    // completeness nets POSITIVE, and the whole negative is the precept.
    const contrib = (res: typeof r, k: string) =>
      res.factors.find((f) => f.key === k)!.contribution;
    expect(contrib(flipped, "development") - contrib(r, "development")).toBeCloseTo(0.625, 10);
    expect(contrib(flipped, "completeness") - contrib(r, "completeness")).toBeCloseTo(0.8, 10);
    expect(contrib(flipped, "precept") - contrib(r, "precept")).toBeCloseTo(-5 / 3, 10);

    // ...and the plan does not tell anyone to do something that costs them points.
    expect(buildReadinessReport(r, inputs, CFG).actions.map((a) => a.id)).not.toContain(
      "ladr:u1:answer",
    );
  });

  it("measures on the UNCLAMPED composite, so a heavily-penalized record still gets a plan", () => {
    // 2 adverse items + a PFA failure ⇒ A = 40, and the composite clamps to 0.
    // Clamping before subtracting made every delta 0 and blanked the plan for
    // exactly the Sailor in the most trouble.
    const inputs: RubricInputs = {
      boardDate: T,
      evals: [annual(2026, "Promotable", 3.8)],
      psr: {
        ...emptyPsr,
        entered: true,
        adverse: [
          { kind: "njp", date: "2025-01-01" },
          { kind: "page13", date: "2025-02-01" },
        ],
        pfa: [{ cycle: "2025-1", date: "2025-04-01", result: "fail" }],
      },
      ladr: [{ milestone_id: "x", category: "credential", status: "not_met", verified_in_ompf: false, item: "Security+" }],
      preceptFlags: ["warfighting"],
    };
    const r = scoreBoardConfidence(inputs, CFG);
    expect(r.adverseAdjustment).toBe(40);
    expect(r.final).toBe(0); // the DISPLAY value is still clamped

    expect(bandDeltas(r, inputs, CFG)[0].delta).toBeGreaterThan(0);
    expect(buildReadinessReport(r, inputs, CFG).actions.length).toBeGreaterThan(0);
  });

  it("pre-ranks by stake before the cap, so the top candidate is never sliced off", () => {
    // 60 filler rows would fill the cap in raw input order and drop the one row
    // that actually matters.
    const filler: LadrItemInput[] = Array.from({ length: BAND_DELTA_CANDIDATE_CAP }, (_, i) => ({
      milestone_id: `f-${i}`,
      category: "credential" as const,
      status: "not_met" as const,
      verified_in_ompf: false,
      item: `Filler ${i}`,
    }));
    const star: LadrItemInput = {
      milestone_id: "STAR",
      category: "advancement_consideration",
      status: "not_met",
      verified_in_ompf: false,
      item: "Serve as Leading Petty Officer",
      board_emphasis: true,
    };
    const inputs: RubricInputs = {
      boardDate: T,
      evals: [annual(2026, "Promotable", 3.8)],
      psr: { ...emptyPsr, entered: true },
      ladr: [...filler, star], // STAR is LAST in input order
      preceptFlags: ["warfighting"],
    };
    const deltas = bandDeltas(scoreBoardConfidence(inputs, CFG), inputs, CFG);

    expect(deltas.length).toBe(BAND_DELTA_CANDIDATE_CAP);
    expect(deltas[0].milestoneId).toBe("STAR");
    expect(deltas[0].delta).toBeGreaterThan(0);
  });

  it("the stake proxy accounts for DILUTION — a lone row in a light category outranks a crowded heavy one", () => {
    // Ranking on the raw category weight reproduced the cap defect in another
    // shape: a category's ratio is shared by every row in it, so one of 60
    // `credential` rows (weight 10) barely moves it, while a LONE
    // `skill_training_recommended` row (weight 2) moves its ratio 0 → 0.5
    // outright. Measured: LONE is +1.05 and the ONLY positive candidate; the 60
    // credential rows are −0.096 each. Weight-blind ranking shipped 0 actions.
    const crowded: LadrItemInput[] = Array.from({ length: BAND_DELTA_CANDIDATE_CAP }, (_, i) => ({
      milestone_id: `d-${i}`,
      category: "credential" as const,
      status: "not_met" as const,
      verified_in_ompf: false,
      item: `Credential ${i}`,
    }));
    const lone: LadrItemInput = {
      milestone_id: "LONE",
      category: "skill_training_recommended",
      status: "not_met",
      verified_in_ompf: false,
      item: "Lone light-category row",
    };
    const inputs: RubricInputs = {
      boardDate: T,
      evals: [annual(2026, "Promotable", 3.8)],
      psr: {
        ...emptyPsr,
        entered: true,
        awards: [{ title: "NAM", level: "personal_achievement", date_awarded: "2024-01-01", verified_in_ompf: true }],
        tours: [{ title: "Sea Tour", start: "2021-01-01", end: null, sea_duty: true, leadership: true }],
      },
      ladr: [...crowded, lone], // LONE is LAST, and its category weight is the LOWEST
      preceptFlags: ["warfighting"],
    };
    const r = scoreBoardConfidence(inputs, CFG);
    const deltas = bandDeltas(r, inputs, CFG);

    expect(deltas.length).toBe(BAND_DELTA_CANDIDATE_CAP);
    expect(deltas[0].milestoneId).toBe("LONE");
    expect(deltas[0].delta).toBeCloseTo(1.05, 6);
    // It is the only improvement that exists, so the plan must contain exactly it.
    expect(buildReadinessReport(r, inputs, CFG).actions.map((a) => a.source.id)).toEqual(["LONE"]);
  });

  it("pre-ranking is deterministic, and stable when every stake ties", () => {
    const tied: LadrItemInput[] = Array.from({ length: BAND_DELTA_CANDIDATE_CAP + 1 }, (_, i) => ({
      milestone_id: `t-${i}`,
      category: "credential" as const,
      status: "not_met" as const,
      verified_in_ompf: false,
      item: `Tied ${i}`,
    }));
    const inputs: RubricInputs = {
      boardDate: T,
      evals: [annual(2026, "Promotable", 3.8)],
      psr: { ...emptyPsr, entered: true },
      ladr: tied,
      preceptFlags: ["warfighting"],
    };
    const r = scoreBoardConfidence(inputs, CFG);
    const orderings = new Set(
      Array.from({ length: 20 }, () =>
        bandDeltas(r, inputs, CFG)
          .map((d) => d.milestoneId)
          .join(","),
      ),
    );
    expect(orderings.size).toBe(1);
  });

  it("respects an operator-tuned config — which is why config is required", () => {
    const tuned = { ...CFG, weights: { ...CFG.weights, development: 60, performance: 20 } };
    const stock = bandDeltas(scoreBoardConfidence(sailorB, CFG), sailorB, CFG);
    const under = bandDeltas(scoreBoardConfidence(sailorB, tuned), sailorB, tuned);
    expect(under[0].delta).not.toBeCloseTo(stock[0].delta, 3);
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
