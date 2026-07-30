// lib/boardConfidence/readiness.ts
//
// v2 readiness layer — epic §3.4b. Pure: no I/O, no clock reads, no randomness.
// This sits ABOVE the rubric and changes none of its arithmetic. It exists
// because the composite alone cannot tell "we have no data" apart from "the
// record is bad": rubric.ts computes contribution = (weight/100)·S·conf and
// thresholds the sum against fixed bands with no renormalization by Σ(weight·conf),
// so conf = 0 and S = 0 are numerically identical. The fix is not to change the
// arithmetic (512 pinned tests depend on it) — it is to stop shipping a verdict
// the arithmetic cannot support, and to ship a plan instead.
//
// Three readouts, never multiplied together:
//   coverage — how much of the record APEX can actually see;
//   actions  — ranked, dated, sourced, each worth a TRUE recomputed delta;
//   areas    — per-factor status with its evidence tier, "not enough data"
//              being a separate axis rather than the bottom of the scale.

import {
  bandDeltas,
  monthsBefore,
  type BandDelta,
} from "@/lib/boardConfidence/rubric";
import type {
  BandVote,
  FactorKey,
  FactorResult,
  LadrItemInput,
  RubricConfig,
  RubricInputs,
  RubricResult,
} from "@/lib/boardConfidence/types";

// ---------------------------------------------------------------------------
// Tunable constants — exported because every one of them is an assertion, not a
// measurement, and the domain reviewer must be able to move them.
// ---------------------------------------------------------------------------

/**
 * Below this coverage, `score` is null and the caller renders "not enough of
 * your record is entered to assess" — no number, no band.
 *
 * WHY 0.75. Coverage is NOT zero for an empty record. Three of the six factors
 * report conf = 1 unconditionally — continuity and completeness measure
 * missingness itself, and precept is a fixed indicator table — so a Sailor who
 * has entered literally nothing already reads 0.30 (0.22 when no precept is
 * loaded and the five remaining weights redistribute ×100/90). The honest range
 * is therefore 0.30 → 1.00, not 0 → 1.
 *
 * Stated plainly, the rule 0.75 encodes is: AT MOST A QUARTER of the weighted
 * record may be scored as zeros it did not earn.
 *
 * Measured shapes (numbers from the suite, not estimates; performance
 * confidence caps at 0.85 without summary-group peer data, because P4 needs a
 * group distribution — a single-user install never reaches 1.00):
 *
 *   nothing entered                         0.30   → null   (this is what kills
 *                                                           the 1.0 "Drop-from-
 *                                                           consideration risk"
 *                                                           first impression)
 *   6 EPs, PSR/LaDR never filled            0.64   → null   (the audit's Sailor A)
 *   4+ evals only, nothing else             0.64   → null
 *   3 evals + full PSR, no curated LaDR     0.73   → null
 *   4+ evals + full PSR, no curated LaDR    0.79   → scored (82 of 85 ratings
 *                                                           have no LaDR seed —
 *                                                           the COMMON case, and
 *                                                           it stays scoreable)
 *   4+ evals + LaDR, no PSR                 0.77   → scored
 *   full PSR + LaDR but no evals            0.58   → null
 *   5 evals, everything filled              0.92   → scored (the audit's Sailor B)
 *
 * A STRICTER floor is defensible and was considered: the narrowest band is 15
 * points wide (85–100, 70–85), so "the unseen weight cannot move the band"
 * would demand 0.85 — which suppresses the number for essentially every rating
 * without a curated LaDR. That is arguably correct (the epic notes a flawless
 * AT1 is capped near 84 purely because APEX lacks their seed file) but it is a
 * product call, not an engine one.
 *
 * Neither floor is the real fix. The real fix is renormalizing the composite by
 * Σ(weight·conf) so unseen weight stops counting as earned zeros; that is an
 * arithmetic change to scoreBoardConfidence, which this task is explicitly
 * forbidden from making. Until then this floor is an honesty guard, and it is
 * exported so the domain reviewer can move it without touching code.
 */
export const COVERAGE_FLOOR = 0.75;

/**
 * A factor whose own confidence is below this is reported as
 * `insufficient_data` rather than graded. Performance with a single report has
 * conf ≈ 0.12–0.23; calling that "needs work" is noise, not a finding.
 */
export const AREA_EVIDENCE_FLOOR = 0.25;

/** S_f cut points for the graded statuses. Assertions, not calibration. */
export const AREA_STATUS_THRESHOLDS = { strong: 80, adequate: 55 } as const;

// ---------------------------------------------------------------------------
// Contract (epic §3.4b), plus additive fields marked v2+
// ---------------------------------------------------------------------------

export type AreaStatus = "strong" | "adequate" | "needs_work" | "insufficient_data";

/**
 * EVIDENCE TIERS — the union is the epic's, verbatim. The mapping is NOT the
 * epic's suggested one, and the difference is deliberate:
 *
 * The epic proposes "performance and continuity derive from finalized, signed,
 * locked evaluation rows, so they are the strongest evidence available" →
 * "corroborated". That overclaims. Those rows are selected
 * `.eq("created_by", subjectUserId)` (service.ts) — reports the SUBJECT drafted;
 * "finalized" means finalized inside APEX, not verified against an OMPF; and
 * `rsca`, the comparator half of the performance score, is typed by the Sailor
 * into member_board_records.eval_context. A single-user install has no external
 * anchor anywhere in the 100 points.
 *
 * The one genuinely external input in the whole engine is the summary-group peer
 * distribution (service.ts step 5): it requires the Sailor's PEERS to also be
 * APEX users, and it cannot be self-served. So:
 *
 *   corroborated — at least one contributing report carries real peer context
 *                  (a summary-group average or group size). Someone other than
 *                  the subject put data behind this.
 *   attested     — the subject entered it. Everything else with data.
 *   unknown      — nothing entered.
 *
 * RECOMMENDATION for P1b (needs the domain reviewer, and there is no UI yet to
 * break): rename the tier to `"peer_anchored" | "self_reported" | "not_entered"`.
 * "Corroborated" still reads to a Navy audience as "checked against your record,"
 * which is false for every value this engine can produce. Renaming is a
 * user-visible label change and the brief reserves those for P1b, so the union
 * is left alone here and `evidenceNote` carries the honest sentence.
 */
export type EvidenceTier = "corroborated" | "attested" | "unknown";

export type ActionHorizon = "before_board" | "next_cycle" | "blocked";

/** How `horizon` was decided — so the UI never implies a duration APEX guessed. */
export type HorizonBasis =
  | "blocked_unless"     // ladr_milestones.detail.blocked_unless is set
  | "typical_months"     // a real duration was compared to monthsToBoard
  | "administrative"     // paperwork (verify / answer a checkbox) — no duration
  | "unknown_duration";  // no typical_months: "start now", and say we don't know

export interface ReadinessAction {
  id: string;
  action: string;
  area: FactorKey;
  worth: number;                 // marginal composite points, from bandDeltas()
  horizon: ActionHorizon;
  blockedBy: string | null;
  source: { kind: "ladr_milestone" | "record_field" | "eval"; id: string };
  horizonBasis: HorizonBasis;    // v2+
}

export interface ReadinessArea {
  key: FactorKey;
  label: string;
  status: AreaStatus;
  evidence: EvidenceTier;
  summary: string;               // plain language — NO engine internals
  evidenceNote: string;          // v2+ — the provenance sentence, rendered inline
  detail: FactorResult;          // behind "show the math"
}

export interface ReadinessReport {
  coverage: {
    measured: number;            // Σ(w·conf)/100 in [0,1]
    areasKnown: number;
    areasTotal: number;
    missing: Array<{ area: FactorKey; label: string; unlocks: string; howTo: string }>;
    floor: number;               // v2+ — the floor this run was judged against
  };
  actions: ReadinessAction[];
  areas: ReadinessArea[];
  boardDate: string;
  monthsToBoard: number;
  score: { value: number; band: BandVote; label: string } | null;
}

export interface ReadinessOptions {
  /**
   * The caller's "today", YYYY-MM-DD. The engine reads no clock; a route passes
   * this in. NOTE the brief says monthsToBoard comes "from boardDate and the
   * run's T" — but in this engine T IS inputs.boardDate (types.ts:94), so that
   * would always be 0. Absent asOf, the fallback is the newest fact the record
   * itself contains: the latest evaluation period_to at or before the board
   * date, else the board date (monthsToBoard = 0, so nothing is promised as
   * achievable on duration grounds).
   */
  asOf?: string;
  /** Override COVERAGE_FLOOR for this run. */
  coverageFloor?: number;
}

// ---------------------------------------------------------------------------
// Plain-language copy. A data table on purpose: these strings are what the
// domain reviewer will rewrite, and none of them should require reading code.
// No engine internals (P1..P4, aP, wSum, coveredDays, availableSubweight) may
// appear here — those stay in `detail` behind "show the math".
// ---------------------------------------------------------------------------

const AREA_COPY: Record<
  FactorKey,
  {
    label: string;
    missingLabel: string;
    unlocks: string;
    howTo: string;
    strong: string;
    adequate: string;
    needs_work: string;
    insufficient_data: string;
  }
> = {
  performance: {
    label: "Performance",
    missingLabel: "your evaluations",
    unlocks: "performance assessment",
    howTo: "Finalize your evaluations under Evaluations, then run the review again.",
    strong: "Your recent reports sit at the top of what this rubric measures.",
    adequate: "Your recent reports are solid, without standing out from the middle.",
    needs_work: "Your recent reports are the weakest part of what APEX can see.",
    insufficient_data:
      "APEX holds too few finalized reports to say anything about your performance.",
  },
  leadership: {
    label: "Leadership and impact",
    missingLabel: "your tours and awards",
    unlocks: "leadership assessment",
    howTo: "Record Entry tab — add your tours and your awards.",
    strong: "Your tours and awards show sustained leadership and sea time.",
    adequate: "Your tours and awards show leadership, with room to add more.",
    needs_work: "Your entered tours and awards show little leadership or sea time.",
    insufficient_data: "You have not entered any tours or awards yet.",
  },
  development: {
    label: "Professional development",
    missingLabel: "your development checklist",
    unlocks: "your development plan",
    howTo: "LaDR Checklist tab — answer every row, including the ones that do not apply.",
    strong: "You have closed most of the milestones your rating's roadmap lists.",
    adequate: "You have closed some of your rating's milestones and several are still open.",
    needs_work: "Most of the milestones your rating's roadmap lists are still open.",
    insufficient_data:
      "Your rating's development checklist is unanswered, so APEX cannot assess it.",
  },
  continuity: {
    label: "Reporting continuity",
    missingLabel: "your reporting periods",
    unlocks: "the reporting continuity check",
    howTo: "Finalize every evaluation under Evaluations so no reporting period is missing.",
    strong: "Your reporting periods run without a break APEX can see.",
    adequate: "Your reporting periods cover most of the last five years.",
    needs_work: "Your reporting periods leave gaps a board would ask about.",
    insufficient_data: "APEX holds no reporting periods, so continuity cannot be checked.",
  },
  completeness: {
    label: "Record completeness",
    missingLabel: "your record sections",
    unlocks: "the record completeness check",
    howTo: "Record Entry tab — fill in every section.",
    strong: "Almost everything APEX asks for is entered and marked verified.",
    adequate: "Most of your record is entered; some sections or verifications are missing.",
    needs_work: "Large parts of your record are not entered yet.",
    insufficient_data: "Nothing has been entered yet.",
  },
  precept: {
    label: "Board precept alignment",
    missingLabel: "the board precept",
    unlocks: "precept alignment",
    howTo:
      "No board precept is loaded for this cycle. Your command administrator loads it; this area is left out of the review until then.",
    strong: "What this cycle's precept emphasizes is well covered in your record.",
    adequate: "You cover some of what this cycle's precept emphasizes.",
    needs_work: "Little of what this cycle's precept emphasizes shows up in your record.",
    insufficient_data:
      "APEX has no precept loaded, or nothing in your record it can measure the precept against.",
  },
};

const EVIDENCE_NOTE: Record<EvidenceTier, string> = {
  corroborated:
    "Based partly on reports where other Sailors' data set the comparison. Still not checked against your OMPF.",
  attested: "You told APEX this. Nothing here has been checked against your OMPF.",
  unknown: "Nothing entered.",
};

// ---------------------------------------------------------------------------

const byKey = (result: RubricResult): Record<FactorKey, FactorResult> =>
  Object.fromEntries(result.factors.map((f) => [f.key, f])) as Record<FactorKey, FactorResult>;

/**
 * Does this area rest on ANY underlying row? Confidence alone cannot answer it:
 * continuity, completeness and precept all report conf = 1 whether or not there
 * is anything behind them, which is the miniature of the bug this file exists
 * to contain. Continuity with zero reports is unknowable, not "needs work".
 * Completeness is the one honest exception — an empty record IS incomplete, and
 * that is a real finding rather than an absence of one.
 */
function hasEvidence(key: FactorKey, result: RubricResult, inputs: RubricInputs): boolean {
  const f = byKey(result)[key];
  switch (key) {
    case "performance":
      return Number(f.detail.nObserved ?? 0) > 0;
    case "leadership":
      return inputs.psr.tours != null || inputs.psr.awards != null;
    case "development":
      return f.confidence > 0;
    case "continuity":
      return inputs.evals.length > 0;
    case "completeness":
      return true;
    case "precept":
      // The precept indicators are all derived from the LaDR ratios and the
      // leadership proxies — with neither behind them, an all-zero precept
      // score is an absence of data, not a finding.
      return (
        inputs.preceptFlags.length > 0 &&
        (byKey(result).development.confidence > 0 ||
          inputs.psr.tours != null ||
          inputs.psr.awards != null)
      );
  }
}

function statusOf(key: FactorKey, result: RubricResult, inputs: RubricInputs): AreaStatus {
  const f = byKey(result)[key];
  if (!hasEvidence(key, result, inputs) || f.confidence < AREA_EVIDENCE_FLOOR)
    return "insufficient_data";
  if (f.score >= AREA_STATUS_THRESHOLDS.strong) return "strong";
  if (f.score >= AREA_STATUS_THRESHOLDS.adequate) return "adequate";
  return "needs_work";
}

function evidenceOf(key: FactorKey, status: AreaStatus, inputs: RubricInputs): EvidenceTier {
  if (status === "insufficient_data") return "unknown";
  const peerAnchored = inputs.evals.some(
    (e) => e.summary_group_average != null || e.group_size != null,
  );
  return (key === "performance" || key === "continuity") && peerAnchored
    ? "corroborated"
    : "attested";
}

/** Latest evaluation period_to at or before the board date; else the board date. */
function defaultAsOf(inputs: RubricInputs): string {
  const T = inputs.boardDate;
  return inputs.evals
    .map((e) => e.period_to)
    .filter((d) => d <= T)
    .sort()
    .at(-1) ?? T;
}

function actionTextFor(d: BandDelta): string {
  switch (d.kind) {
    case "award_verify":
      return `Confirm "${d.label}" appears in your OMPF (check BOL/NDAWS), then mark it verified in Record Entry.`;
    case "ladr_answer":
      return `Answer "${d.label}" on your LaDR checklist — this is what it is worth if the honest answer is "met".`;
    case "ladr_meet":
      return `Complete "${d.label}".`;
    case "ladr_verify":
      return `Confirm "${d.label}" appears in your OMPF, then mark it verified on your LaDR checklist.`;
  }
}

function horizonFor(
  d: BandDelta,
  item: LadrItemInput | undefined,
  monthsToBoard: number,
): { horizon: ActionHorizon; blockedBy: string | null; horizonBasis: HorizonBasis } {
  // Verifying an entry, or answering a checklist row, is paperwork: it has no
  // duration to guess at and nothing can block it.
  if (d.kind !== "ladr_meet")
    return { horizon: "before_board", blockedBy: null, horizonBasis: "administrative" };
  if (item?.blocked_unless)
    return { horizon: "blocked", blockedBy: item.blocked_unless, horizonBasis: "blocked_unless" };
  const months = item?.typical_months;
  if (months == null)
    // No duration on the milestone. APEX does NOT invent one: "start now" is
    // the only advice that cannot be wrong, and horizonBasis says why.
    return { horizon: "next_cycle", blockedBy: null, horizonBasis: "unknown_duration" };
  return {
    horizon: months <= monthsToBoard ? "before_board" : "next_cycle",
    blockedBy: null,
    horizonBasis: "typical_months",
  };
}

/**
 * The v2 output. `result` must be the run of `inputs` under `config` — the
 * caller already has it, and re-scoring it here would just be waste.
 */
export function buildReadinessReport(
  result: RubricResult,
  inputs: RubricInputs,
  config?: RubricConfig,
  opts: ReadinessOptions = {},
): ReadinessReport {
  const floor = opts.coverageFloor ?? COVERAGE_FLOOR;

  // §3.1 — Σ(weight·conf)/100. The weights are the EFFECTIVE ones (after the
  // ×100/90 redistribution when no precept is loaded), so this stays in [0,1].
  const measured =
    result.factors.reduce((a, f) => a + f.weight * f.confidence, 0) / 100;

  const areas: ReadinessArea[] = result.factors.map((f) => {
    const status = statusOf(f.key, result, inputs);
    const evidence = evidenceOf(f.key, status, inputs);
    return {
      key: f.key,
      label: AREA_COPY[f.key].label,
      status,
      evidence,
      summary: AREA_COPY[f.key][status],
      evidenceNote: EVIDENCE_NOTE[evidence],
      detail: f,
    };
  });

  const missing = areas
    .filter((a) => a.status === "insufficient_data")
    .map((a) => ({
      area: a.key,
      label: AREA_COPY[a.key].missingLabel,
      unlocks: AREA_COPY[a.key].unlocks,
      // ponytail: plain instruction, not a URL — the Results screen does not
      // read a ?tab query param yet (app/board-confidence/page.tsx:414). Make
      // these hrefs when the UI task wires tab deep-linking.
      howTo: AREA_COPY[a.key].howTo,
    }));

  const asOf = opts.asOf ?? defaultAsOf(inputs);
  const monthsToBoard = Math.max(0, monthsBefore(asOf, inputs.boardDate));

  const byMilestone = new Map(inputs.ladr.map((i) => [i.milestone_id, i]));
  const actions: ReadinessAction[] = bandDeltas(result, inputs, config)
    // Only improvements. A flip CAN come out negative — recording an unverified
    // award or LaDR item costs record-completeness points — and "do this, lose
    // 0.4 points" is not advice. That the rubric can charge a Sailor for
    // entering something honestly is a real finding, logged for P1b.
    .filter((d) => d.delta > 0)
    .map((d) => {
      const item = d.milestoneId ? byMilestone.get(d.milestoneId) : undefined;
      return {
        id: d.id,
        action: actionTextFor(d),
        area: d.area,
        worth: d.delta,
        source: {
          kind: d.milestoneId ? ("ladr_milestone" as const) : ("record_field" as const),
          id: d.milestoneId ?? d.id,
        },
        ...horizonFor(d, item, monthsToBoard),
      };
    })
    .sort((a, b) => b.worth - a.worth);

  return {
    coverage: {
      measured,
      areasKnown: areas.filter((a) => a.status !== "insufficient_data").length,
      areasTotal: areas.length,
      missing,
      floor,
    },
    actions,
    areas,
    boardDate: inputs.boardDate,
    monthsToBoard,
    // §3.4b binding rule: below the floor there is no number and no band. This
    // is what stops a brand-new user's first interaction with the product being
    // "1.0 — Drop-from-consideration risk".
    score:
      measured >= floor
        ? { value: result.final, band: result.band, label: result.bandLabel }
        : null,
  };
}
