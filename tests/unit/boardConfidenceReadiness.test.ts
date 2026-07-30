// tests/unit/boardConfidenceReadiness.test.ts
//
// v2 readiness layer (epic §3.4b) — buildReadinessReport, bandDeltas, and
// scoreLadr's unmet output. The layer exists because rubric.ts sums
// (weight/100)·S·conf against fixed bands with no renormalization by
// Σ(weight·conf), so "we have no data" (conf = 0) and "the record is bad"
// (S = 0) are numerically identical. These tests pin the two consequences the
// audit measured — the band inversion between a 6×Early-Promote record with
// empty tabs and a 5×Promotable record with every box filled, and the 1.0
// "Drop-from-consideration risk" a brand-new user is shown — and prove the
// layer separates them without touching the arithmetic underneath.
//
// bandDeltas is checked against a HAND re-score (flip the input, re-run the
// whole engine, subtract) for both flip shapes the audit called out: award
// verification, which is a clean arithmetic consequence, and answering an
// unanswered LaDR row, which is not — it moves the numerator, the
// answered/applicable confidence denominator, record completeness and the
// precept ratios at once.

import { describe, it, expect } from "vitest";
import {
  bandDeltas,
  compositeRaw,
  scoreBoardConfidence,
  BAND_DELTA_CANDIDATE_CAP,
} from "@/lib/boardConfidence/rubric";
import {
  buildReadinessReport,
  COVERAGE_FLOOR,
  AREA_EVIDENCE_FLOOR,
} from "@/lib/boardConfidence/readiness";
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
const annual = (
  endYear: number,
  rec: PromotionRec,
  ita: number,
): RubricEvalInput => ({
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

const report = (
  inputs: RubricInputs,
  opts: { asOf?: string; coverageFloor?: number } = { asOf: AS_OF },
) => buildReadinessReport(scoreBoardConfidence(inputs), inputs, undefined, opts);

// ---------------------------------------------------------------------------
// The audit's two worked records
// ---------------------------------------------------------------------------

// Sailor A — six consecutive annual EVALs, ALL Early Promote, ITA 4.60,
// unbroken continuity. PSR and LaDR tabs never filled.
const sailorA: RubricInputs = {
  boardDate: T,
  evals: [2021, 2022, 2023, 2024, 2025, 2026].map((y) =>
    annual(y, "Early Promote", 4.6),
  ),
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

// ---------------------------------------------------------------------------

describe("the band inversion the layer exists to fix", () => {
  it("still reproduces in the raw rubric: the all-EP record bands BELOW the all-Promotable one", () => {
    const a = scoreBoardConfidence(sailorA);
    const b = scoreBoardConfidence(sailorB);

    // A's promotion recommendations are two full grades higher on every report
    // and A's performance factor beats B's outright...
    const perf = (r: typeof a) => r.factors.find((f) => f.key === "performance")!;
    expect(perf(a).score).toBeGreaterThan(perf(b).score);

    // ...yet the composite and the band invert, driven entirely by data entry.
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

    // The empty-tabs record gets no number and no band — the inversion cannot
    // be rendered at all.
    expect(a.score).toBeNull();
    expect(b.score).toEqual({ value: 57.3, band: 50, label: "Crunch — middle band" });
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
    expect(a.coverage.missing.every((m) => m.howTo.length > 0 && m.unlocks.length > 0)).toBe(true);

    // Six Early Promotes are reported as strong even though the composite band
    // said "Not competitive this cycle".
    expect(a.areas.find((x) => x.key === "performance")!.status).toBe("strong");
  });
});

describe("the empty record — the first thing a new user sees", () => {
  it("the raw rubric still calls it a drop-from-consideration risk", () => {
    const r = scoreBoardConfidence(emptyRecord);
    expect(r.final).toBe(1);
    expect(r.bandLabel).toBe("Drop-from-consideration risk");
  });

  it("the readiness report emits no score and no band at all", () => {
    const rep = report(emptyRecord);
    expect(rep.score).toBeNull();
    expect(JSON.stringify(rep)).not.toContain("Drop-from-consideration risk");
  });

  it("coverage is NOT zero for an empty record — three factors report conf = 1 by construction", () => {
    // Documents why COVERAGE_FLOOR cannot be a small number: continuity,
    // completeness and precept are confident about nothing.
    expect(report(emptyRecord).coverage.measured).toBeCloseTo(0.3, 10);
  });

  it("lists every unknown area rather than grading it", () => {
    const rep = report(emptyRecord);
    const statuses = Object.fromEntries(rep.areas.map((a) => [a.key, a.status]));
    expect(statuses.performance).toBe("insufficient_data");
    expect(statuses.leadership).toBe("insufficient_data");
    expect(statuses.development).toBe("insufficient_data");
    // Continuity scores 0 with conf = 1 in the rubric; unknowable is not a deficiency.
    expect(statuses.continuity).toBe("insufficient_data");
    expect(statuses.precept).toBe("insufficient_data");
    // Completeness is the honest exception: an empty record really IS incomplete.
    expect(statuses.completeness).toBe("needs_work");
  });
});

describe("insufficient_data is a separate axis, never the bottom of the scale", () => {
  it("an unknown area is never needs_work, and carries evidence 'unknown'", () => {
    for (const a of report(emptyRecord).areas) {
      if (a.status === "insufficient_data") expect(a.evidence).toBe("unknown");
      expect(a.status === "insufficient_data" && a.status === "needs_work").toBe(false);
    }
  });

  it("a factor below the evidence floor is not graded even though it has a score", () => {
    const oneEval: RubricInputs = { ...sailorA, evals: [annual(2026, "Early Promote", 4.6)] };
    const r = scoreBoardConfidence(oneEval);
    const perf = r.factors.find((f) => f.key === "performance")!;

    expect(perf.score).toBeGreaterThan(0);           // the rubric happily grades it
    expect(perf.confidence).toBeLessThan(AREA_EVIDENCE_FLOOR);
    expect(report(oneEval).areas.find((a) => a.key === "performance")!.status).toBe(
      "insufficient_data",
    );
  });

  it("evidence is 'attested' with self-entered data and 'corroborated' only with peer context", () => {
    const solo = report(sailorB).areas.find((a) => a.key === "performance")!;
    expect(solo.evidence).toBe("attested");
    expect(solo.evidenceNote).toMatch(/OMPF/);

    const withPeers: RubricInputs = {
      ...sailorB,
      evals: sailorB.evals.map((e) => ({ ...e, summary_group_average: 3.9, group_size: 12 })),
    };
    expect(report(withPeers).areas.find((a) => a.key === "performance")!.evidence).toBe(
      "corroborated",
    );
    // Self-typed sections never reach the top tier, whoever else is in the group.
    expect(report(withPeers).areas.find((a) => a.key === "development")!.evidence).toBe(
      "attested",
    );
  });
});

describe("summaries are plain language — engine internals stay behind 'show the math'", () => {
  it("no factor summary, evidence note or howTo leaks an internal name", () => {
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
});

describe("scoreLadr emits milestone identity", () => {
  it("names the actual unmet milestones rather than a category ratio", () => {
    const unmet = scoreBoardConfidence(sailorB).ladrUnmet!;
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
    const base = scoreBoardConfidence(sailorB);
    const dev = (r: typeof base) => r.factors.find((f) => f.key === "development")!.score;

    for (const u of base.ladrUnmet!) {
      const flipped = scoreBoardConfidence({
        ...sailorB,
        ladr: sailorB.ladr.map((i) =>
          i.milestone_id === u.milestone_id
            ? { ...i, status: "met" as const, verified_in_ompf: true }
            : i,
        ),
      });
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
    expect(scoreBoardConfidence(inputs).ladrUnmet).toEqual([
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
  const base = scoreBoardConfidence(sailorB);
  const handDelta = (next: RubricInputs) =>
    compositeRaw(scoreBoardConfidence(next)) - compositeRaw(base);

  it("award verification matches the hand re-score exactly", () => {
    const hand = handDelta({
      ...sailorB,
      psr: {
        ...sailorB.psr,
        awards: sailorB.psr.awards!.map((a, i) =>
          i === 0 ? { ...a, verified_in_ompf: true } : a,
        ),
      },
    });
    const got = bandDeltas(base, sailorB).find((d) => d.id === "award:0")!;

    expect(got.kind).toBe("award_verify");
    expect(got.label).toBe("Navy Achievement Medal");
    expect(got.delta).toBe(hand);
    expect(got.delta).toBeCloseTo(1.125, 10);
  });

  it("answering an unanswered LaDR row matches the hand re-score exactly", () => {
    // The flip the audit's verifier flagged as NOT a clean arithmetic
    // consequence: it moves the numerator AND the answered/applicable
    // confidence denominator, plus completeness and the precept ratios.
    const hand = handDelta({
      ...sailorB,
      ladr: sailorB.ladr.map((i) =>
        i.milestone_id === "m-open" ? { ...i, status: "met" as const } : i,
      ),
    });
    const got = bandDeltas(base, sailorB).find((d) => d.id === "ladr:m-open:answer")!;

    expect(got.kind).toBe("ladr_answer");
    expect(got.delta).toBe(hand);
    // Recomputed, not derivable from the development factor alone: the
    // factor-local marginal is a different number on a different scale.
    const local = base.ladrUnmet!.find((u) => u.milestone_id === "m-open")!.marginal_points;
    expect(got.delta).not.toBeCloseTo(local, 3);
  });

  it("every candidate delta equals its own full re-score, and the list is ranked", () => {
    const deltas = bandDeltas(base, sailorB);
    expect(deltas.length).toBe(6); // 1 unverified award + 5 improvable LaDR rows
    for (let i = 1; i < deltas.length; i++)
      expect(deltas[i - 1].delta).toBeGreaterThanOrEqual(deltas[i].delta);

    const meet = deltas.find((d) => d.id === "ladr:m-cert:meet")!;
    expect(meet.delta).toBe(
      handDelta({
        ...sailorB,
        ladr: sailorB.ladr.map((i) =>
          i.milestone_id === "m-cert" ? { ...i, status: "met" as const } : i,
        ),
      }),
    );
  });

  it("a flip can be NEGATIVE — the rubric charges a Sailor for entering an unverified item", () => {
    // A category already at ratio 1.0 plus one unanswered row: answering it
    // honestly as "met, not yet in OMPF" LOWERS the composite.
    const inputs: RubricInputs = {
      boardDate: T,
      evals: [],
      psr: { ...emptyPsr, entered: true },
      ladr: [
        { milestone_id: "v1", category: "qual_warfare", status: "met", verified_in_ompf: true, item: "EIWS" },
        { milestone_id: "v2", category: "qual_warfare", status: "met", verified_in_ompf: true, item: "ESWS" },
        { milestone_id: "u1", category: "qual_warfare", status: "unanswered", verified_in_ompf: false, item: "EAWS" },
        // A second answered category, so the confidence gain from answering u1
        // no longer outweighs the ratio it drags down.
        { milestone_id: "n1", category: "pme_required", status: "not_met", verified_in_ompf: false, item: "Required PME" },
      ],
      preceptFlags: ["warfighting"],
    };
    const r = scoreBoardConfidence(inputs);
    expect(bandDeltas(r, inputs).find((d) => d.id === "ladr:u1:answer")!.delta).toBeLessThan(0);

    // ...and the plan does not tell anyone to do something that costs them points.
    expect(buildReadinessReport(r, inputs).actions.map((a) => a.id)).not.toContain(
      "ladr:u1:answer",
    );
  });

  it("caps the number of full re-scores it will run", () => {
    const many: LadrItemInput[] = Array.from({ length: 200 }, (_, i) => ({
      milestone_id: `x-${i}`,
      category: "credential" as const,
      status: "not_met" as const,
      verified_in_ompf: false,
      item: `Credential ${i}`,
    }));
    const inputs: RubricInputs = { ...sailorB, ladr: many };
    expect(bandDeltas(scoreBoardConfidence(inputs), inputs).length).toBe(
      BAND_DELTA_CANDIDATE_CAP,
    );
  });
});

describe("the ranked action plan", () => {
  const rep = report(sailorB);

  it("is ranked by worth, and every worth is a bandDeltas value", () => {
    const worths = rep.actions.map((a) => a.worth);
    expect(worths.length).toBeGreaterThan(0);
    expect([...worths].sort((x, y) => y - x)).toEqual(worths);
    expect(worths.every((w) => w > 0)).toBe(true);

    const deltas = new Map(bandDeltas(scoreBoardConfidence(sailorB), sailorB).map((d) => [d.id, d.delta]));
    for (const a of rep.actions) expect(a.worth).toBe(deltas.get(a.id));
  });

  it("names the milestone and sources it", () => {
    const cert = rep.actions.find((a) => a.id === "ladr:m-cert:meet")!;
    expect(cert.action).toContain("CompTIA Security+");
    expect(cert.source).toEqual({ kind: "ladr_milestone", id: "m-cert" });

    const award = rep.actions.find((a) => a.id === "award:0")!;
    expect(award.source.kind).toBe("record_field");
    expect(award.area).toBe("leadership");
  });

  it("partitions by horizon against the board date", () => {
    expect(rep.monthsToBoard).toBe(5); // 2026-04-01 → 2026-09-01

    const h = Object.fromEntries(rep.actions.map((a) => [a.id, a]));
    // typical_months 2 ≤ 5 months to the board.
    expect(h["ladr:m-cert:meet"]).toMatchObject({ horizon: "before_board", horizonBasis: "typical_months" });
    // typical_months 18 > 5.
    expect(h["ladr:m-deg:meet"]).toMatchObject({ horizon: "next_cycle", horizonBasis: "typical_months" });
    // blocked_unless wins outright.
    expect(h["ladr:m-nec:meet"]).toMatchObject({
      horizon: "blocked",
      horizonBasis: "blocked_unless",
      blockedBy: "requires a sea billet",
    });
    // Verifying an entry, or answering a checkbox, is paperwork — no duration.
    expect(h["award:0"]).toMatchObject({ horizon: "before_board", horizonBasis: "administrative" });
    expect(h["ladr:m-watch:verify"]).toMatchObject({ horizon: "before_board", horizonBasis: "administrative" });
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
    // Same record, a board 23 months out instead of 5: the 18-month degree
    // becomes achievable. Nothing but the dates changed.
    const far = report(sailorB, { asOf: "2024-09-01" });
    expect(far.monthsToBoard).toBe(23); // floor(730 days / 30.44), the engine's convention
    expect(far.actions.find((a) => a.id === "ladr:m-deg:meet")!.horizon).toBe("before_board");
  });
});

describe("purity and the coverage identity", () => {
  it("coverage.measured is exactly Σ(weight·conf)/100 over the six factors", () => {
    for (const inputs of [sailorA, sailorB, emptyRecord]) {
      const r = scoreBoardConfidence(inputs);
      const expected = r.factors.reduce((a, f) => a + f.weight * f.confidence, 0) / 100;
      expect(buildReadinessReport(r, inputs).coverage.measured).toBe(expected);
    }
  });

  it("reads no clock — with no asOf it falls back to the record's own latest report", () => {
    // Sailor B's newest report ends 2026-03-15; the board is 2026-09-01.
    expect(report(sailorB, {}).monthsToBoard).toBe(5);
    // Nothing in the record and no asOf ⇒ 0 months, so nothing is promised.
    expect(report(emptyRecord, {}).monthsToBoard).toBe(0);
  });

  it("is deterministic and does not mutate its inputs", () => {
    const snapshot = JSON.stringify(sailorB);
    const a = report(sailorB);
    const b = report(sailorB);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(sailorB)).toBe(snapshot);
  });

  it("the floor is tunable per run", () => {
    const r = scoreBoardConfidence(sailorA);
    expect(buildReadinessReport(r, sailorA, undefined, { coverageFloor: 0.5 }).score).not.toBeNull();
    expect(buildReadinessReport(r, sailorA, undefined, { coverageFloor: 0.99 }).score).toBeNull();
  });
});
