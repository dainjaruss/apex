// lib/boardConfidence/readiness.ts
//
// v2 readiness layer — epic §3.4b, revised 2026-07-29 after the domain review of
// PR #21 returned BLOCKER. Pure: no I/O, no clock reads, no randomness. This
// sits ABOVE the rubric and changes none of its arithmetic.
//
// It exists because the composite alone cannot tell "we have no data" apart from
// "the record is bad": rubric.ts computes contribution = (weight/100)·S·conf and
// thresholds the sum against fixed bands with no renormalization by
// Σ(weight·conf), so conf = 0 and S = 0 are numerically identical.
//
// The domain review's finding was that the arithmetic was sound and the
// SENTENCES BOLTED TO IT were not. Every string below is gated on the data that
// actually supports it, because each of these was measured firing wrongly:
//   - a three-year Sailor with a perfect record told they had reporting gaps
//     (statusOf read f.score, which carries the leading-span penalty that v1.5
//     deliberately stopped treating as a real break — rubric.ts:374-389);
//   - a Sailor with four years of sea duty told that "little of what this cycle's
//     precept emphasizes" was in their record, from a precept APEX modeled;
//   - "the weakest part of what APEX can see" fired on performance while
//     leadership scored 32 points lower — a comparison nothing computes.

import {
  bandDeltas,
  monthsBefore,
  type BandDelta,
} from "@/lib/boardConfidence/rubric";
import {
  BOARD_DISCLAIMER,
  type BandVote,
  type FactorKey,
  type FactorResult,
  type LadrItemInput,
  type PreceptFlag,
  type RubricConfig,
  type RubricInputs,
  type RubricResult,
} from "@/lib/boardConfidence/types";

// ---------------------------------------------------------------------------
// Tunable constants — exported because every one is an assertion, not a
// measurement, and the domain reviewer must be able to move them.
// ---------------------------------------------------------------------------

/**
 * Coverage backstop. Below this, `score` is null and the caller renders "not
 * enough of your record is entered to assess" — no number, no band.
 *
 * WHY 0.75. Coverage is NOT zero for an empty record: continuity and
 * completeness measure missingness itself and precept is a fixed indicator
 * table, so all three report conf = 1 unconditionally and a Sailor who has
 * entered nothing already reads 0.30 (0.22 with no precept loaded, when the five
 * remaining weights redistribute ×100/90). The honest range is 0.30 → 1.00.
 * 0.75 encodes: at most a quarter of the weighted record may be scored as zeros
 * it did not earn.
 *
 * This is now the SECONDARY gate. The primary one is BLIND_SPOT_GATE below,
 * which a floor on a weighted average cannot express: a flawless Sailor with
 * 6× Early Promote, an MSM and four years of sea duty reached coverage 0.79 —
 * clear of this floor — and was scored a middle band with an EMPTY action plan,
 * because 15 weighted points of development were earned zeros from a rating with
 * no curated LaDR. Only 2 of 82 ratings ship a verified LaDR seed (ratings.ts
 * lists 82; there are 3 seed files and BM self-declares source "representative"),
 * so that is the common case, not an edge one.
 */
export const COVERAGE_FLOOR = 0.75;

/**
 * No score at all while any factor carrying weight sits below
 * AREA_EVIDENCE_FLOOR. A near-blind factor is a blind spot, not low coverage:
 * almost its entire weight enters the composite as points the Sailor is charged
 * for and cannot earn.
 *
 * The threshold is AREA_EVIDENCE_FLOOR rather than zero, and that is the point —
 * the same constant that already decides an AREA is unassessable now also
 * decides the COMPOSITE is. A `=== 0` test let this through, measured on a
 * returning user who changed nothing while their rating's roadmap grew from 6 to
 * 86 milestones (80 transcribed advancement_consideration rows):
 *
 *   BEFORE  dev S=100.00 conf=1.000 contrib=15.00 -> FINAL 74.9 "Competitive"
 *   AFTER   dev S=100.00 conf=0.070 contrib= 1.05 -> FINAL 59.9 "Crunch"
 *
 * Their S is still 100 and their record did not change: −15 points and a full
 * band drop because APEX learned more about their rating. conf 0.070 slipped the
 * zero test, and coverage landed at 0.80 — above COVERAGE_FLOOR — so the band
 * silently regressed. Missing data rendered as a deficiency is the exact class
 * this layer exists to eliminate.
 */
export const BLIND_SPOT_GATE = true;

/**
 * A factor whose own confidence is below this is reported as `not_enough_entered`
 * rather than graded, and (per BLIND_SPOT_GATE) also suppresses the composite.
 * Performance with a single report has conf ≈ 0.12–0.23; calling that "needs
 * attention" is noise, not a finding.
 */
export const AREA_EVIDENCE_FLOOR = 0.25;

/** S_f cut points for the graded statuses. Assertions, not calibration. */
export const AREA_STATUS_THRESHOLDS = { strong: 80, on_track: 55 } as const;

// ---------------------------------------------------------------------------
// Contract (epic §3.4b as revised), plus additive fields marked v2+
// ---------------------------------------------------------------------------

/**
 * `adequate` is retired. In eval vocabulary "adequate"/"satisfactory" is where
 * 3.0 lives (Meets Standards), which to an E7 candidate reads as "you will not
 * be selected". `not_enough_entered` is a DATA STATE on a separate axis — never
 * the bottom rung of the graded scale.
 */
export type AreaStatus = "strong" | "on_track" | "needs_attention" | "not_enough_entered";

/**
 * EVIDENCE TIERS. The epic's original union ("corroborated" / "attested" /
 * "unknown") was replaced outright by the domain review, and all three were
 * wrong:
 *
 *   - Nothing here is "corroborated". Evals are selected
 *     `.eq("created_by", subjectUserId)` (subject-drafted); "finalized" is an
 *     APEX workflow state with no OMPF relationship; `rsca` is self-typed into
 *     member_board_records.eval_context; `verified_in_ompf` is a self-ticked box;
 *     the precept is modeled; only 2 of 82 ratings have a verified LaDR seed.
 *   - "Attested" reads STRONGER than "the Sailor typed it" and collides with the
 *     existing PSR attestation checkbox.
 *   - "Unknown" reads as a negative finding rather than a data state.
 *
 * Only `performance` may ever be `peer_compared`, and only against a group with
 * someone else in it — continuity touches NO peer data at all, so tagging it
 * from another factor's inputs is fabricated provenance. These are three
 * provenance labels, never a quality ladder.
 */
export type EvidenceTier = "self_reported" | "peer_compared" | "not_entered";

export type ActionHorizon = "before_board" | "next_cycle" | "blocked";

/** How `horizon` was decided — so the UI never implies a duration APEX guessed. */
export type HorizonBasis =
  | "blocked_unless"     // ladr_milestones.detail.blocked_unless is set
  | "typical_months"     // a real duration was compared to monthsToBoard
  | "administrative"     // answering a checklist row — no duration to estimate
  | "unknown_duration";  // no typical_months: "start now", and say we don't know

export interface ReadinessAction {
  id: string;
  action: string;
  // Narrowed from the wider forward-looking contract (`FactorKey`, and a
  // three-way source kind): with the verification flips removed every action is
  // a LaDR row, so `record_field` and `eval` were unreachable. Widen both again
  // when non-LaDR candidates return in P1b.
  area: "development";
  worth: number;                 // marginal composite points, from bandDeltas()
  horizon: ActionHorizon;
  blockedBy: string | null;
  source: { kind: "ladr_milestone"; id: string };
  horizonBasis: HorizonBasis;    // v2+
}

export interface ReadinessArea {
  key: FactorKey;
  label: string;
  status: AreaStatus;
  evidence: EvidenceTier;
  evidenceLabel: string;         // v2+ — the UI string for the tier
  summary: string;               // plain language — NO engine internals
  evidenceNote: string;          // v2+ — provenance, rendered inline not in a tooltip
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
  /** v2+ — plain-language reason `score` is null. Null when a score was emitted. */
  scoreNote: string | null;
  /**
   * v2+ — UNSCORED. Entries the Sailor has ticked met/earned but not yet
   * confirmed in their OMPF. Deliberately carries no `worth`: see BandDeltaKind.
   */
  confirmInOmpf: { count: number; items: string[]; note: string } | null;
  /** v2+ — §1.1 normative text; types.ts:5-7 requires it on every results view. */
  disclaimer: string;
}

export interface ReadinessOptions {
  /**
   * The caller's "today", YYYY-MM-DD. The engine reads no clock; a route passes
   * this in. NOTE the brief specified monthsToBoard "from boardDate and the run's
   * T" — but in this engine T IS inputs.boardDate (types.ts:94), so that is
   * always 0. Absent or malformed, this falls back to the board date itself,
   * giving monthsToBoard = 0 so nothing is promised as achievable. An earlier
   * revision defaulted to the latest evaluation period_to, which is always in the
   * past and therefore OVERSTATES the time remaining — it failed unsafe.
   */
  asOf?: string;
  /** Override COVERAGE_FLOOR for this run. */
  coverageFloor?: number;
  /**
   * `board_precepts.source_url` for the active precept. Null/absent means the
   * emphasis flags were entered by hand rather than taken from a convening
   * order, and every precept string is prefixed to say so. Defaulting to null is
   * deliberate: a caller that does not pass it gets the cautious rendering.
   */
  preceptSourceUrl?: string | null;
}

// ---------------------------------------------------------------------------
// Plain-language copy. A data table on purpose: these strings are what the
// domain reviewer rewrites, and none of them should require reading code.
// No engine internals (P1..P4, aP, wSum, coveredDays, availableSubweight) may
// appear here — those stay in `detail` behind "show the math".
//
// No string may assert a comparison the engine does not compute (no "your
// weakest area" — nothing ranks areas against each other) or describe content
// APEX has not read (no "what this cycle's precept emphasizes" — see below).
// ---------------------------------------------------------------------------

type AreaCopy = {
  label: string;
  missingLabel: string;
  unlocks: string;
  howTo: string;
  // Partial by design: completeness can never be not_enough_entered (see
  // hasEvidence), and the domain review flagged the unreachable string.
  statuses: Partial<Record<AreaStatus, string>>;
};

const AREA_COPY: Record<FactorKey, AreaCopy> = {
  performance: {
    label: "Performance",
    missingLabel: "your evaluations",
    unlocks: "performance assessment",
    howTo: "Finalize your evaluations under Evaluations, then run the review again.",
    statuses: {
      strong: "Your recent reports sit at the top of what this rubric measures.",
      on_track: "Your recent reports are solid, without standing out from the middle.",
      needs_attention:
        "Your recent reports score low against this rubric's promotion-recommendation and trait scales.",
      not_enough_entered:
        "APEX holds too few finalized reports to say anything about your performance.",
    },
  },
  leadership: {
    label: "Leadership and impact",
    missingLabel: "your tours and awards",
    unlocks: "leadership assessment",
    howTo: "Record Entry tab — add your tours and your awards.",
    statuses: {
      strong: "Your tours and awards show sustained leadership and sea time.",
      on_track: "Your tours and awards show leadership, with room to add more.",
      needs_attention:
        "The tours and awards you have entered show few leadership billets and little sea time.",
      not_enough_entered: "You have not entered any tours or awards yet.",
    },
  },
  development: {
    label: "Professional development",
    missingLabel: "your development checklist",
    unlocks: "your development plan",
    howTo: "LaDR Checklist tab — answer every row, including the ones that do not apply.",
    statuses: {
      strong: "You have closed most of the milestones your rating's roadmap lists.",
      on_track: "You have closed some of your rating's milestones and several are still open.",
      needs_attention: "Most of the milestones your rating's roadmap lists are still open.",
      // not_enough_entered is supplied by developmentNotEnough(): the honest
      // sentence depends on whether APEX holds a roadmap at all, and a fixed
      // string blamed returning users for rows that did not exist last time.
    },
  },
  continuity: {
    // Status here keys on recordGapCount, NEVER on the factor score: the score
    // carries a penalty for the span before a Sailor's first report, which is
    // not a break in anyone's record. v1.5 already separated the two
    // (rubric.ts:374-389) and this layer must not re-merge them.
    label: "Reporting continuity",
    missingLabel: "your reporting periods",
    unlocks: "the reporting continuity check",
    howTo:
      "Under Evaluations, finalize any report you have not entered yet. If a period is genuinely missing from your official record, your command's admin office files the correction — APEX cannot.",
    statuses: {
      strong: "APEX found no break between the reports you have entered.",
      on_track:
        "APEX found no break between the reports you have entered, and does not yet hold a full five years of them.",
      needs_attention:
        "There is a break between the reports you have entered. Check BOL and NSIPS, and be ready to explain it.",
      not_enough_entered: "APEX holds no reporting periods, so continuity cannot be checked.",
    },
  },
  completeness: {
    label: "Record completeness",
    missingLabel: "your record sections",
    unlocks: "the record completeness check",
    howTo: "Record Entry tab — fill in every section.",
    statuses: {
      strong: "Almost everything APEX asks for is entered.",
      on_track: "Most of your record is entered; some sections are still empty.",
      needs_attention: "Large parts of your record are not entered yet.",
    },
  },
  precept: {
    // "Alignment" overclaims: APEX maps five booleans to five crude indicators.
    // No string here describes what the board emphasizes, because the shipped
    // precept (scripts/ladr-data/precept_fy27.ts) is titled "modeled" and
    // carries source_url: null — asserting its content would put invented
    // doctrine in front of a Sailor. See PRECEPT_UNSOURCED_PREFIX.
    label: "Board emphasis areas",
    missingLabel: "the board emphasis areas",
    unlocks: "the board emphasis check",
    howTo:
      "An APEX Admin loads the board emphasis areas for your cycle. Until then APEX leaves this out of the review.",
    statuses: {
      strong: "Your record covers the emphasis areas APEX is set up to look for.",
      on_track: "Your record covers some of the emphasis areas APEX is set up to look for.",
      needs_attention:
        "Your record covers few of the emphasis areas APEX is set up to look for.",
      not_enough_entered:
        "APEX cannot check the emphasis areas: either none are loaded, or your record does not yet contain what they are measured from.",
    },
  },
};

const EVIDENCE_LABEL: Record<EvidenceTier, string> = {
  self_reported: "From your entries",
  peer_compared: "From your entries, compared to your summary group",
  not_entered: "Not entered",
};

const EVIDENCE_NOTE: Record<EvidenceTier, string> = {
  self_reported:
    "You entered this. APEX has not checked it against your OMPF, PSR, or NSIPS.",
  peer_compared:
    "You entered this. The comparison uses evaluations other APEX users entered for the same summary group — those are not checked against any official record either.",
  not_entered: "You have not entered this yet, so APEX left it out.",
};

/**
 * Precept strings are prefixed unless the active precept cites a source. The
 * shipped seed is hand-set booleans titled "(modeled)" with source_url: null.
 */
export const PRECEPT_UNSOURCED_PREFIX =
  "Emphasis areas are entered by an APEX Admin and are not taken from the board's convening order. ";

/**
 * Which LaDR category ratios each precept flag's indicator reads. scorePrecept
 * emits 0 for a flag whose inputs are absent (rubric.ts, "never fabricate"), and
 * a 0 from absence is indistinguishable from a 0 from a genuine gap — which is
 * how a Sailor with four years of sea duty was told their record showed little
 * of what the board emphasizes, purely because their rating has no curated LaDR.
 * An empty list means the indicator reads the tours/awards section instead.
 */
const PRECEPT_RATIO_SOURCES: Record<PreceptFlag, string[]> = {
  warfighting: ["ratio_qual_warfare"],
  education: ["ratio_education_degree", "ratio_credential"],
  technical_expertise: ["ratio_nec_opportunity", "ratio_qual_rate_specific"],
  leadership_positions: [],
  sea_duty: [],
};

// ---------------------------------------------------------------------------

const byKey = (result: RubricResult): Record<FactorKey, FactorResult> =>
  Object.fromEntries(result.factors.map((f) => [f.key, f])) as Record<FactorKey, FactorResult>;

/** True when EVERY active precept flag has data behind its indicator. */
function preceptFullyComputable(result: RubricResult, inputs: RubricInputs): boolean {
  if (inputs.preceptFlags.length === 0) return false;
  const devDetail = byKey(result).development.detail;
  return inputs.preceptFlags.every((flag) => {
    const ratios = PRECEPT_RATIO_SOURCES[flag] ?? [];
    // leadership_positions reads L1 and sea_duty reads seaMonths72; both come
    // from the tours/awards section — i.e. whatever the leadership factor scored.
    if (ratios.length === 0) return byKey(result).leadership.confidence > 0;
    return ratios.some((k) => devDetail[k] != null);
  });
}

/**
 * Does this area rest on ANY underlying row? Confidence alone cannot answer it:
 * continuity, completeness and precept all report conf = 1 whether or not there
 * is anything behind them, which is the miniature of the bug this file contains.
 *
 * EVERY arm reads what the engine ACTUALLY SCORED — a factor's own confidence, or
 * a value from its own detail — and never the raw `inputs` arrays. That is not a
 * style rule: scoreBoardConfidence scores a FILTERED copy of the inputs that this
 * layer never sees (future-dated reports are dropped from every factor, dateless
 * awards and tours from theirs), so the two counts diverge. Reading
 * `inputs.evals.length` told a Sailor whose ONLY report was excluded as "dated
 * after the board date" that APEX had found no break between the reports they had
 * entered — a confident claim from zero usable data, on the same screen where
 * Performance correctly reported holding too few reports. Fabricating confidence
 * is a worse failure than the pessimism this layer exists to remove.
 *
 * `inputs` is still read for preceptFlags, which the engine does not filter.
 */
function hasEvidence(key: FactorKey, result: RubricResult, inputs: RubricInputs): boolean {
  const f = byKey(result)[key];
  switch (key) {
    case "performance":
      return Number(f.detail.nObserved ?? 0) > 0;
    case "leadership":
      return f.confidence > 0;
    case "development":
      return f.confidence > 0;
    case "continuity":
      // Days actually covered by in-window reports — 0 when every report was
      // filtered out, or dated entirely outside the five-year window.
      return Number(f.detail.coveredDays ?? 0) > 0;
    case "completeness":
      // The honest exception: an empty record genuinely IS incomplete, so that
      // is a real finding rather than an absence of one.
      return true;
    case "precept":
      return preceptFullyComputable(result, inputs);
  }
}

function statusOf(key: FactorKey, result: RubricResult, inputs: RubricInputs): AreaStatus {
  const f = byKey(result)[key];
  if (!hasEvidence(key, result, inputs)) return "not_enough_entered";

  // Continuity is graded from the GAP COUNT, never from f.score. f.score carries
  // the leading-span penalty, which made the engine tell a three-year Sailor with
  // three consecutive Must Promotes and nothing missing that their "reporting
  // periods leave gaps a board would ask about" — measured recordGapCount 0,
  // continuityGap false, advisory null, score 45.02.
  if (key === "continuity") {
    if (Number(f.detail.recordGapCount ?? 0) > 0 || result.continuityGap)
      return "needs_attention";
    // No break — but "strong" is the token a UI paints green, and APEX holding
    // 3 of the 5 window years is not the same claim as holding all of them.
    // 0.95 is the engine's own "continuity is complete" threshold
    // (COMPLETENESS_POINTS.continuity95), reused rather than invented.
    return Number(f.detail.coverage ?? 0) >= 0.95 ? "strong" : "on_track";
  }

  if (f.confidence < AREA_EVIDENCE_FLOOR) return "not_enough_entered";
  if (f.score >= AREA_STATUS_THRESHOLDS.strong) return "strong";
  if (f.score >= AREA_STATUS_THRESHOLDS.on_track) return "on_track";
  return "needs_attention";
}

function evidenceOf(key: FactorKey, status: AreaStatus, inputs: RubricInputs): EvidenceTier {
  if (status === "not_enough_entered") return "not_entered";
  // ONLY performance, and only against a group with someone else in it. A
  // single-member group yields a summary-group average equal to the Sailor's own
  // trait average (service.ts does not exclude the subject's own rows), which is
  // a comparison with themselves.
  const peerCompared = inputs.evals.some(
    (e) => e.summary_group_average != null && (e.group_size ?? 0) >= 2,
  );
  return key === "performance" && peerCompared ? "peer_compared" : "self_reported";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * asOf is a trust boundary — a route hands it in from a query string or a
 * client. A malformed value makes monthsBefore return NaN, and every
 * `typical_months <= NaN` comparison false, silently pushing every action to
 * next_cycle. Fall back to the board date, which promises nothing.
 */
function resolveAsOf(asOf: string | undefined, boardDate: string): string {
  if (!asOf || !ISO_DATE.test(asOf) || Number.isNaN(Date.parse(asOf))) return boardDate;
  return asOf;
}

function actionTextFor(d: BandDelta): string {
  return d.kind === "ladr_answer"
    ? // Deliberately does NOT quote the payout for answering "met": that coaches
      // the Sailor on what a self-report is worth.
      `Answer "${d.label}" on your LaDR checklist — APEX cannot score this area until it is answered either way.`
    : `Complete "${d.label}".`;
}

function horizonFor(
  d: BandDelta,
  item: LadrItemInput | undefined,
  monthsToBoard: number,
): { horizon: ActionHorizon; blockedBy: string | null; horizonBasis: HorizonBasis } {
  // Answering a checklist row is paperwork: no duration to estimate, nothing
  // that can block it.
  if (d.kind === "ladr_answer")
    return { horizon: "before_board", blockedBy: null, horizonBasis: "administrative" };
  if (item?.blocked_unless)
    return { horizon: "blocked", blockedBy: item.blocked_unless, horizonBasis: "blocked_unless" };
  const months = item?.typical_months;
  if (months == null)
    // No duration on the milestone. APEX does NOT invent one: "start now" is the
    // only advice that cannot be wrong, and horizonBasis says why.
    return { horizon: "next_cycle", blockedBy: null, horizonBasis: "unknown_duration" };
  return {
    horizon: months <= monthsToBoard ? "before_board" : "next_cycle",
    blockedBy: null,
    horizonBasis: "typical_months",
  };
}

/**
 * The development area's `not_enough_entered` sentence. A fixed string cannot be
 * honest here: "your rating's development checklist is unanswered" blames the
 * Sailor for rows that did not exist the last time they looked. APEX holds no
 * history and cannot tell "the roadmap grew" from "you never answered it", so it
 * states the counts and names both possibilities instead of picking one.
 */
function developmentNotEnough(f: FactorResult, inputs: RubricInputs): string {
  if (inputs.ladr.length === 0)
    return "APEX does not have your rating's development roadmap yet, so there is nothing to assess.";
  const answered = Number(f.detail.answered ?? 0);
  const applicable = Number(f.detail.applicable ?? 0);
  return `${answered} of ${applicable} milestones on your rating's roadmap are answered — too few for APEX to assess this area. Answer the rest either way. This list grows when APEX loads newer roadmap data for your rating, so items can appear that were not here before.`;
}

/** Unscored: entries ticked met/earned but not yet confirmed in the OMPF. */
function confirmList(inputs: RubricInputs): ReadinessReport["confirmInOmpf"] {
  const items = [
    ...(inputs.psr.awards ?? []).filter((a) => !a.verified_in_ompf).map((a) => a.title),
    ...inputs.ladr
      .filter((i) => i.status === "met" && !i.verified_in_ompf)
      .map((i) => i.item || i.milestone_id),
  ];
  if (items.length === 0) return null;
  const one = items.length === 1;
  return {
    count: items.length,
    items,
    note: `You have ${items.length} ${one ? "entry" : "entries"} not yet confirmed in your OMPF. A board sees only your OMPF — confirm ${one ? "it" : "these"} on BOL/NDAWS before the board.`,
  };
}

/**
 * The v2 output. `result` must be the run of `inputs` under `config`.
 *
 * `config` is REQUIRED: defaulting it silently scored operator-tuned installs
 * against the stock weights, which produced action values wrong by multiples and
 * could invert the ranking.
 */
export function buildReadinessReport(
  result: RubricResult,
  inputs: RubricInputs,
  config: RubricConfig,
  opts: ReadinessOptions = {},
): ReadinessReport {
  const floor = opts.coverageFloor ?? COVERAGE_FLOOR;
  const preceptPrefix = opts.preceptSourceUrl ? "" : PRECEPT_UNSOURCED_PREFIX;

  // §3.1 — Σ(weight·conf)/100. The weights are the EFFECTIVE ones (after the
  // ×100/90 redistribution when no precept is loaded), so this stays in [0,1].
  const measured = result.factors.reduce((a, f) => a + f.weight * f.confidence, 0) / 100;

  const areas: ReadinessArea[] = result.factors.map((f) => {
    const status = statusOf(f.key, result, inputs);
    const evidence = evidenceOf(f.key, status, inputs);
    const copy = AREA_COPY[f.key];
    // Non-null: every area supplies copy for every status it can actually reach
    // (completeness omits not_enough_entered, which hasEvidence makes impossible;
    // development's is computed because a fixed string cannot be honest there).
    const base =
      f.key === "development" && status === "not_enough_entered"
        ? developmentNotEnough(f, inputs)
        : copy.statuses[status]!;
    return {
      key: f.key,
      label: copy.label,
      status,
      evidence,
      evidenceLabel: EVIDENCE_LABEL[evidence],
      summary: f.key === "precept" ? preceptPrefix + base : base,
      evidenceNote: EVIDENCE_NOTE[evidence],
      detail: f,
    };
  });

  // A weight-0 factor is a TOOL configuration gap, not a gap in the Sailor's
  // record: with no precept loaded the headline otherwise read "APEX can see
  // 5 of 6 areas of your record" for a fully-entered one.
  const counted = areas.filter((a) => a.detail.weight > 0);

  const missing = counted
    .filter((a) => a.status === "not_enough_entered")
    .map((a) => ({
      area: a.key,
      label: AREA_COPY[a.key].missingLabel,
      unlocks: AREA_COPY[a.key].unlocks,
      // ponytail: plain instruction, not a URL — the Results screen does not read
      // a ?tab query param yet (app/board-confidence/page.tsx:414). Make these
      // hrefs when the UI task wires tab deep-linking.
      howTo: AREA_COPY[a.key].howTo,
    }));

  const asOf = resolveAsOf(opts.asOf, inputs.boardDate);
  const monthsToBoard = Math.max(0, monthsBefore(asOf, inputs.boardDate));

  const byMilestone = new Map(inputs.ladr.map((i) => [i.milestone_id, i]));
  const actions: ReadinessAction[] = bandDeltas(result, inputs, config)
    // Only improvements. A flip can come out negative — measured −29/120, which
    // is entirely the warfighting precept indicator diluting as an unverified row
    // joins its category — and "do this, lose 0.24 points" is not advice.
    .filter((d) => d.delta > 0)
    .map((d) => ({
      id: d.id,
      action: actionTextFor(d),
      area: d.area,
      worth: d.delta,
      source: { kind: "ladr_milestone" as const, id: d.milestoneId },
      ...horizonFor(d, byMilestone.get(d.milestoneId), monthsToBoard),
    }))
    .sort((a, b) => b.worth - a.worth);

  // The two gates on emitting a number at all. The blind-spot test is
  // `< AREA_EVIDENCE_FLOOR`, NOT `=== 0`: a factor at conf 0.07 carries almost
  // its whole weight into the composite as unearned zeros, and `=== 0` let a
  // returning user's band silently drop when their rating's roadmap grew.
  const blind = counted.filter((a) => a.detail.confidence < AREA_EVIDENCE_FLOOR);
  let scoreNote: string | null = null;
  if (BLIND_SPOT_GATE && blind.length > 0) {
    // The development-specific wording only applies when development is the ONLY
    // thing missing; otherwise name every blind area rather than one of them.
    const dev = blind.length === 1 && blind[0].key === "development";
    scoreNote =
      dev && inputs.ladr.length === 0
        ? // A first-run condition the Sailor fixes in one click — not a permanent
          // honesty-vs-coverage tradeoff. Tell them to pull their roadmap.
          "APEX does not have the development roadmap for your rating yet, so it cannot score your record. Fetch it from Navy COOL on the LaDR Checklist tab — it takes one click. Here is what APEX can see in the meantime:"
        : dev
          ? // Rows exist but too few are answered. Never phrased as the Sailor
            // falling behind: the list grows when APEX loads newer roadmap data,
            // so items appear that were not there last time they looked.
            "APEX cannot score your record until more of your rating's development roadmap is answered. Answer each row either way — the list grows when APEX loads newer roadmap data for your rating. Here is what APEX can see in the meantime:"
          : `APEX cannot score your record yet: too little is entered for ${blind
              .map((a) => a.label.toLowerCase())
              .join(", ")}. Here is what APEX can see in the meantime:`;
  } else if (measured < floor) {
    scoreNote =
      "Not enough of your record is entered to assess. Here is what APEX can see in the meantime:";
  }

  return {
    coverage: {
      measured,
      areasKnown: counted.filter((a) => a.status !== "not_enough_entered").length,
      areasTotal: counted.length,
      missing,
      floor,
    },
    actions,
    areas,
    boardDate: inputs.boardDate,
    monthsToBoard,
    score:
      scoreNote === null
        ? { value: result.final, band: result.band, label: result.bandLabel }
        : null,
    scoreNote,
    confirmInOmpf: confirmList(inputs),
    disclaimer: BOARD_DISCLAIMER,
  };
}
