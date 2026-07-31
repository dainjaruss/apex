// lib/boardConfidence/rubric.ts
//
// Pure deterministic scoring engine for the Board Confidence Analyzer. The
// normative algorithm is spec §7 (docs/specs/board-confidence-analyzer.md);
// the three §7.2 worked examples are the conformance fixture pinned by tests.
// No clock reads (board date T is an input), no randomness, no I/O; full float
// precision throughout with a single terminal 1-decimal rounding, and the band
// is computed from that ROUNDED final. Zero-data guard (§7 item 8): any factor
// whose normalizing denominator is 0 emits S_f = 0, conf_f = 0,
// detail.no_data = true — never NaN. v1.1 review fixes: unknown/absent
// promotion recommendations are treated as NOB (never index REC_POINTS with an
// unknown key); evals with period_to after T are excluded from every factor;
// dateless awards/tours are excluded from scoring; a dateless PFA failure
// counts as recent (conservative — never inflate). All emit result warnings.

import type {
  RubricConfig,
  AwardLevel,
  BandVote,
  FactorKey,
  FactorResult,
  LadrCategory,
  LadrItemInput,
  LadrUnmet,
  PreceptFlag,
  PromotionRec,
  PsrSection,
  RubricEvalInput,
  RubricInputs,
  RubricResult,
} from "@/lib/boardConfidence/types";
import { earlyPromoteMax } from "@/lib/forcedDistribution";

// ---------------------------------------------------------------------------
// Constants (spec §4.2, exact values)
// ---------------------------------------------------------------------------

export const HALF_LIFE_MONTHS = 24;
export const SEA_MULT = 1.25;
export const LOOKBACK_MONTHS = 72;
export const REC_POINTS: Record<Exclude<PromotionRec, "NOB">, number> = {
  "Early Promote": 100, "Must Promote": 80, "Promotable": 50,
  "Progressing": 25, "Significant Problems": 0,
};
export const FACTOR_WEIGHTS: Record<FactorKey, number> = {
  performance: 40, leadership: 15, development: 15,
  continuity: 10, completeness: 10, precept: 10,
};

/**
 * The factors that carry weight in the READINESS VERDICT.
 *
 * The test every factor has to pass is: CAN A BOARD MEMBER SEE IT? A selection
 * board reads the OMPF — the reports, the PSR, the awards and quals in the
 * official record. Anything else may be measured, reported and acted on, but it
 * may not move a number that claims to model how a board would read the record.
 *
 * `development` FAILS it. The LaDR is a Navy COOL career-planning roadmap; no
 * board member has ever seen one. Four separate problems, all measured:
 *   - Its denominator is the RATING's roadmap, not the Sailor. The same record
 *     scored S_D 63.5 against a 34-row roadmap and 21.2 against the same roadmap
 *     re-transcribed to 80 rows. Roadmap size is an APEX ingestion artifact.
 *   - Only 2 of 82 ratings ship a verified LaDR seed (readiness.ts COVERAGE_FLOOR
 *     note), so for 80 ratings this was 15 weighted points of representative data.
 *   - The board-relevant SUBSET of the LaDR is already in the verdict: every
 *     `precept` indicator but `sea_duty` is computed from these same category
 *     ratios. Weighting development too scored those rows twice, and scored the
 *     `pme_recommended` / `credential` / `nec_opportunity` rows a board never sees
 *     on top.
 *   - It is a PLAN. Every unmet row is an action item, and it is the sole source
 *     of the action plan (see bandDeltas). Charging the Sailor a verdict penalty
 *     for the length of their own to-do list inverts what the list is for.
 *
 * `completeness` fails it more plainly: every one of its items asks whether the
 * Sailor filled in an APEX FORM (psr_entered, the awards/NEC/education sections,
 * three PFA rows, 90% of the checklist). None of it exists in the OMPF. It is
 * the coverage axis wearing a score, and coverage is already reported separately
 * and honestly by ReadinessReport.coverage — where "we cannot see this" reads as
 * a data state instead of a deficiency.
 *
 * `continuity` fails it for a reason that only became visible under review, and
 * it is the sharpest of the three. A board CAN see a gap — but APEX cannot tell
 * a gap from an unentered report, and it grades what it is given. Both possible
 * denominators are indefensible in opposite directions: measured over the fixed
 * 1826-day window it charges a three-year Sailor for years they had not served
 * (0.60 coverage AND a leading-gap penalty, S_C 45 on a record with nothing
 * missing); measured over the span between the reports the Sailor chose to
 * enter, deleting the older of two reports collapses the span, takes gapCount to
 * 0 and PAYS 7.6 for hiding a two-year break — beside the §17-6 advisory telling
 * them to recover missing reports. There is no third denominator. A factor whose
 * input is "reports the Sailor typed in" cannot grade the absence of reports
 * without asserting something APEX does not know, and every contiguous record
 * returned exactly 100 at every length while holding 13-15% of the verdict —
 * the same paperwork axis `completeness` was removed for.
 *
 * The §17-6 advisory is untouched and still fires on `recordGapCount`. It is the
 * right surface for a reporting gap: sourced, actionable, and unscored.
 *
 * All three factors are still computed in full, still returned in `factors`,
 * still rendered as areas with a how-to, and development still drives the entire
 * action plan. They carry weight 0; the remaining weights redistribute through
 * the one redistribution mechanism in scoreBoardConfidence.
 */
export const VERDICT_FACTORS: ReadonlySet<FactorKey> = new Set<FactorKey>([
  "performance", "leadership", "precept",
]);
// v1.5: operator-tunable parameters. Defaults reproduce spec §7 — EXCEPT that
// `weights` no longer describes the verdict on its own: development,
// completeness and continuity are excluded from it whatever this table says (see
// VERDICT_FACTORS), and the remainder redistribute. Continuity was never a hard
// zero and is now not a score at all; a detected reporting gap raises the §17-6
// advisory, which is the only thing that ever mattered about it.
export const DEFAULT_RUBRIC_CONFIG: RubricConfig = {
  weights: { ...FACTOR_WEIGHTS },
  continuity_gap_days: 90,
  board_emphasis_multiplier: 2,
};

export const PERF_SUBWEIGHTS = { P1: 0.35, P2: 0.35, P3: 0.15, P4: 0.15 } as const;
export const FALLBACK_P2_MULT = 0.6;
export const P2_SLOPE = 125;              // score2 = clamp(50 + 125·d, 0, 100)
export const P2_FALLBACK_SLOPE = 62.5;    // clamp(62.5·(ITA − 3.4), 0, 100)
export const P2_FALLBACK_FLOOR = 3.4;
export const TREND_MIN_EVALS = 4;
export const DECLINE_PENALTY = 10;
export const DECLINE_PENALTY_CAP = 20;
export const MIN_OBSERVED_FOR_FULL_CONF = 3;   // conf_P ×= min(1, N/3)
export const LEADERSHIP_SUBWEIGHTS = { L1: 0.40, L2: 0.30, L3: 0.30 } as const;
export const L1_POINTS_PER_TOUR = 50;          // min(100, 50·n)
export const AWARD_POINTS: Record<AwardLevel, number> = {
  personal_achievement: 10, personal_commendation: 20, msm_or_above: 30, unit: 4,
};
export const AWARD_LOOKBACK_MONTHS = 120;
export const SEA_MONTHS_FULL = 36;             // L3 = min(100, (100/36)·seaMonths72)
export const LADR_CATEGORY_WEIGHTS: Record<LadrCategory, number> = {
  // v1.5: the explicit E7+ advancement-considerations section carries the bulk
  // of the board emphasis — the heaviest category when present. Weights
  // renormalize over present categories, so LaDRs without it are unaffected.
  advancement_consideration: 30,
  qual_warfare: 20, pme_required: 20, qual_rate_specific: 15, qual_watchstanding: 10,
  skill_training_required: 10, credential: 10, education_degree: 5, nec_opportunity: 5,
  pme_recommended: 3, skill_training_recommended: 2,
  career_milestone: 0, billet_recommended: 0,   // informational only — never scored
};

/**
 * v1.5 board emphasis: an explicitly flagged row (parser/seed), the
 * "Considerations for advancement" category, or a milestone that exists only
 * at E7+ while the member is targeting E7+.
 *
 * Lives here, not in service.ts, because LadrChecklist.tsx badges the same
 * rows: two copies of this predicate would drift and the UI would then claim
 * an emphasis the engine does not score. service.ts assembles the scoring
 * input from it; the checklist renders the badge from it.
 */
export function isBoardEmphasis(
  m: {
    category: string;
    applies_to_paygrades: number[];
    detail?: Record<string, unknown> | null;
  },
  targetPaygrade: number | null,
): boolean {
  return (
    m.detail?.board_emphasis === true ||
    m.category === "advancement_consideration" ||
    (targetPaygrade != null &&
      targetPaygrade >= 7 &&
      m.applies_to_paygrades.length > 0 && // Math.min() of [] is Infinity
      Math.min(...m.applies_to_paygrades) >= 7)
  );
}

export const CONTINUITY_WINDOW_DAYS = 1826;    // 60 months
export const CONTINUITY_GRACE_DAYS = 365;
export const CONTINUITY_GAP_DAYS_DEFAULT = 90;
export const CONTINUITY_GAP_PENALTY = 15;
// `esrFlags` is GONE: it scaled 10 points by the count of entries the Sailor had
// NOT ticked `verified_in_ompf`, which is a self-ticked box (RecordEntryForm), so
// it charged points for disclosing honestly. `awards` is presence now, not the
// verified/total ratio, for the same reason and to match `necs`/`education`,
// which have always tested presence. S_R is normalized over the table's own sum,
// so the remaining items keep their relative sizes without a hand-edited total.
//
// KNOWN CONSEQUENCE, not a regression to paper over. The table now totals 90
// instead of 100, so after renormalization every surviving item is worth 11.1
// rather than 10 and a record missing one 10-point item lands lower against the
// unchanged AREA_STATUS_THRESHOLDS (80/55). Measured: a record with only two PFA
// cycles reads 77.8 / "On track" where it read 90 / "Strong". The card status
// flips in roughly a quarter of records, in both directions.
//
// The thresholds are deliberately NOT retuned. They are a global assertion
// shared by all six areas ("assertions, not calibration", readiness.ts), and the
// scale really did change: a record that read Strong partly because the Sailor
// had ticked verification boxes now reads on entry alone. Moving 80/55 to put
// those cards back where they were would restore the old reading of a number
// that no longer means the same thing. `completeness` carries no verdict weight,
// so this is a card label, not a score.
export const COMPLETENESS_POINTS = {
  continuity95: 20, psrEntered: 15, awards: 15, necs: 10,
  education: 10, pfa3: 10, ladr90: 10,
} as const;
export const COMPLETENESS_MAX = Object.values(COMPLETENESS_POINTS).reduce((a, b) => a + b, 0);
export const ADVERSE_PER_ITEM = 15;
export const ADVERSE_CAP = 30;
export const PFA_FAIL_PENALTY = 10;
export const PFA_FAIL_LOOKBACK_MONTHS = 36;
export const BANDS: Array<{ min: number; vote: BandVote; label: string }> = [
  { min: 85, vote: 100, label: "Clearly at the top" },
  { min: 70, vote: 75,  label: "Competitive" },
  { min: 50, vote: 50,  label: "Crunch — middle band" },
  { min: 30, vote: 25,  label: "Not competitive this cycle" },
  { min: 0,  vote: 0,   label: "Drop-from-consideration risk" },
];

// ---------------------------------------------------------------------------
// Date + rounding helpers (spec §7 GLOBAL CONSTANTS)
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;

/** UTC-midnight day number of a YYYY-MM-DD string (integer). */
const dayNum = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

const isoOf = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10);

const daysBetween = (a: string, b: string): number => dayNum(b) - dayNum(a);

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** True when s is a parseable YYYY-MM-DD date (v1.1 review fix — dateless entries). */
const hasDate = (s: string | null | undefined): boolean =>
  !!s && !Number.isNaN(dayNum(s));

/** Observed rec = a REC_POINTS key; NOB and any unknown value are not observed. */
const isObservedRec = (r: PromotionRec): r is Exclude<PromotionRec, "NOB"> =>
  (r as string) in REC_POINTS;

/** floor(daysBetween(date, T) / 30.44); daysBetween via UTC-midnight Date.UTC(y,m,d). */
export function monthsBefore(dateIso: string, tIso: string): number {
  return Math.floor(daysBetween(dateIso, tIso) / 30.44);
}

/** 0.5^(monthsBefore(periodTo, T) / 24), ×1.25 when seaDuty. */
export function recencyWeight(periodTo: string, tIso: string, seaDuty: boolean): number {
  return Math.pow(0.5, monthsBefore(periodTo, tIso) / HALF_LIFE_MONTHS) * (seaDuty ? SEA_MULT : 1);
}

/** Band from the ROUNDED final. All comparisons are >= on the lower bound. */
export function bandFor(finalRounded: number): { vote: BandVote; label: string } {
  const b = BANDS.find((band) => finalRounded >= band.min) ?? BANDS[BANDS.length - 1];
  return { vote: b.vote, label: b.label };
}

/** Round half away from zero to 1 decimal (the ONLY rounding in the engine). */
export function round1HalfAway(n: number): number {
  return ((Math.sign(n) || 1) * Math.round((Math.abs(n) + Number.EPSILON) * 10)) / 10;
}

// ---------------------------------------------------------------------------
// Factors
// ---------------------------------------------------------------------------

type Detail = FactorResult["detail"];
type FactorScore = { S: number; conf: number; detail: Detail };

// FACTOR 1 — Performance (§7). Observed = rows with a REC_POINTS rec within the
// 0..72-month lookback, chronological (unknown recs are treated as NOB — v1.1
// review fix, never index REC_POINTS with an unknown key). Missing subcomponents
// are removed and the score is renormalized over the available sub-weights a_P;
// conf_P = a_P·min(1, N/3).
function scorePerformance(evals: RubricEvalInput[], T: string): FactorScore {
  const obs = evals
    .filter((e) => {
      const m = monthsBefore(e.period_to, T);
      return isObservedRec(e.promotion_recommendation) && m >= 0 && m <= LOOKBACK_MONTHS;
    })
    .sort((a, b) => a.period_to.localeCompare(b.period_to));
  if (obs.length === 0) {
    return { S: 0, conf: 0, detail: { no_data: true, nObserved: 0 } };
  }
  const r = obs.map((e) => recencyWeight(e.period_to, T, e.sea_duty));
  const sumR = r.reduce((a, b) => a + b, 0);
  const pts = obs.map((e) => REC_POINTS[e.promotion_recommendation as Exclude<PromotionRec, "NOB">]);

  // P1 — promotion recommendation, recency-weighted.
  const P1 = obs.reduce((a, _e, i) => a + r[i] * pts[i], 0) / sumR;

  // P2 — trait average vs comparator (the tougher of SGA and RSCA governs);
  // comparator-less evals use the absolute fallback scale at r_i·0.6 weight.
  let n2 = 0;
  let d2 = 0;
  obs.forEach((e, i) => {
    if (e.trait_average == null) return; // uncomputable row: contributes no P2 weight
    // `summary_group_average` is pooled server-side from peers; `rsca` is typed by
    // the Sailor into member_board_records.eval_context. A self-typed number may
    // only ever make the comparison TOUGHER, never supply the comparator on its
    // own — as the sole comparator, typing rsca 3.0 against a 4.5 trait average
    // was worth +31 P2 points over the honest no-comparator fallback.
    const sga = e.summary_group_average;
    const comparator = sga == null ? null : Math.max(sga, e.rsca ?? sga);
    let s: number;
    let w: number;
    if (comparator != null) {
      s = clamp(50 + P2_SLOPE * (e.trait_average - comparator), 0, 100);
      w = r[i];
    } else {
      s = clamp(P2_FALLBACK_SLOPE * (e.trait_average - P2_FALLBACK_FLOOR), 0, 100);
      w = r[i] * FALLBACK_P2_MULT;
    }
    n2 += w * s;
    d2 += w;
  });
  const P2 = d2 > 0 ? n2 / d2 : null;

  // P3 — trend; requires ≥4 observed evals.
  let P3: number | null = null;
  if (obs.length >= TREND_MIN_EVALS) {
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const recent = pts.slice(-3);
    const prior = pts.slice(Math.max(0, pts.length - 6), pts.length - 3);
    P3 = clamp(50 + 0.5 * (mean(recent) - mean(prior)), 0, 100);
  }

  // P4 — EP breakout scarcity. An eval carries breakout information only when it
  // records a summary-group distribution AND that group's Early Promote quota
  // actually BINDS: earlyPromoteMax(N) < N. At N = 1 the instruction allows the
  // whole group to be Early Promote (ceil(0.20·1) = 1), so an EP in a summary
  // group of one is compliant and says nothing — it used to score s = 1, the
  // maximum, because max(1, N−1) hid the degenerate denominator.
  //
  // The denominator is Σr over the INFORMATIVE evals, not Σr over all of them.
  // Charging an eval that records no distribution with s = 0 against the full
  // denominator is the founding defect in miniature: absent data was pulling P4
  // down exactly as if the Sailor had been passed over. A non-EP eval that DOES
  // record a binding distribution keeps its s = 0 — being in a real breakout
  // group and not breaking out is evidence, not absence.
  let P4: number | null = null;
  const informative = obs.filter(
    (e) => e.ep_count != null && e.group_size != null && earlyPromoteMax(e.group_size) < e.group_size,
  );
  if (informative.length > 0) {
    let n4 = 0;
    let d4 = 0;
    obs.forEach((e, i) => {
      if (e.ep_count == null || e.group_size == null) return;
      if (earlyPromoteMax(e.group_size) >= e.group_size) return;
      const s =
        e.promotion_recommendation === "Early Promote"
          ? 1 - (e.ep_count - 1) / Math.max(1, e.group_size - 1)
          : 0;
      n4 += r[i] * s;
      d4 += r[i];
    });
    P4 = (100 * n4) / d4;
  }

  // Decline penalty: −10 per consecutive drop in REC_POINTS, capped at −20.
  let declines = 0;
  for (let i = 1; i < obs.length; i++) if (pts[i] < pts[i - 1]) declines++;
  const declinePenalty = Math.min(DECLINE_PENALTY_CAP, DECLINE_PENALTY * declines);

  const subs: Array<[number, number]> = [[PERF_SUBWEIGHTS.P1, P1]];
  if (P2 != null) subs.push([PERF_SUBWEIGHTS.P2, P2]);
  if (P3 != null) subs.push([PERF_SUBWEIGHTS.P3, P3]);
  if (P4 != null) subs.push([PERF_SUBWEIGHTS.P4, P4]);
  const aP = subs.reduce((a, [w]) => a + w, 0);
  const S = clamp(subs.reduce((a, [w, s]) => a + w * s, 0) / aP - declinePenalty, 0, 100);
  const conf = aP * Math.min(1, obs.length / MIN_OBSERVED_FOR_FULL_CONF);
  return {
    S,
    conf,
    detail: { P1, P2, P3, P4, declinePenalty, nObserved: obs.length, availableSubweight: aP },
  };
}

// FACTOR 2 — Leadership/Impact (§7). Structured proxies only. Tours-not-entered
// removes L1+L3 (sub-weight 0.70); awards-not-entered removes L2 (0.30).
// Also returns seaMonths72 and L1 for the precept indicators.
function scoreLeadership(
  psr: PsrSection,
  T: string,
): FactorScore & { L1: number | null; seaMonths72: number } {
  const subs: Array<[number, number]> = [];
  let L1: number | null = null;
  let L2: number | null = null;
  let L3: number | null = null;
  let seaMonths72 = 0;
  if (psr.tours) {
    const endOf = (end: string | null) => end ?? T; // ongoing tour runs through T
    const nLead = psr.tours.filter(
      (t) => t.leadership && monthsBefore(endOf(t.end), T) <= LOOKBACK_MONTHS,
    ).length;
    L1 = Math.min(100, L1_POINTS_PER_TOUR * nLead);
    // Sea/arduous days inside the trailing 72-month window, months = days/30.44
    // (same day-counting convention as monthsBefore; endpoints inclusive).
    const tDay = dayNum(T);
    const windowStartDay = tDay - LOOKBACK_MONTHS * 30.44;
    let seaDays = 0;
    for (const t of psr.tours) {
      if (!t.sea_duty) continue;
      const from = Math.max(dayNum(t.start), windowStartDay);
      const to = Math.min(dayNum(endOf(t.end)), tDay);
      if (to >= from) seaDays += to - from + 1;
    }
    seaMonths72 = seaDays / 30.44;
    L3 = Math.min(100, (100 / SEA_MONTHS_FULL) * seaMonths72);
    subs.push([LEADERSHIP_SUBWEIGHTS.L1, L1], [LEADERSHIP_SUBWEIGHTS.L3, L3]);
  }
  if (psr.awards) {
    // An award is worth what the award is worth. `verified_in_ompf` is a box the
    // Sailor ticks themselves, so halving unverified awards did not measure
    // verification — it measured willingness to tick. The OMPF reminder lives
    // unscored in ReadinessReport.confirmInOmpf.
    const awardPts = psr.awards
      .filter((aw) => monthsBefore(aw.date_awarded, T) <= AWARD_LOOKBACK_MONTHS)
      .reduce((a, aw) => a + AWARD_POINTS[aw.level], 0);
    L2 = Math.min(100, awardPts);
    subs.push([LEADERSHIP_SUBWEIGHTS.L2, L2]);
  }
  const a = subs.reduce((x, [w]) => x + w, 0);
  if (a === 0) {
    return { S: 0, conf: 0, L1, seaMonths72, detail: { no_data: true, L1, L2, L3, seaMonths72 } };
  }
  const S = subs.reduce((x, [w, s]) => x + w * s, 0) / a;
  return { S, conf: a, L1, seaMonths72, detail: { L1, L2, L3, seaMonths72, availableSubweight: a } };
}

// FACTOR 3 — Professional development vs LaDR (§7). 'na' rows renormalize
// (not applicable ≠ unknown); 'unanswered' rows lower conf_D only; unverified
// met items count at 0.5. Also returns per-category ratios (precept) and the
// answered/applicable counts (completeness).
//
// v2: the aggregation is lifted verbatim into aggregateLadr so it can be re-run
// with one row flipped — that is how unmet[].factorLocalPoints is a recompute
// rather than an estimate. The arithmetic is unchanged.
type LadrAgg = {
  S: number;
  conf: number;
  ratios: Partial<Record<LadrCategory, number>>;
  ratioDetail: Detail;
  answered: number;
  applicable: number;
  wSum: number;
  noData: boolean;
};

function aggregateLadr(items: LadrItemInput[], emphasisMult: number): LadrAgg {
  const perCat: Partial<Record<LadrCategory, { met: number; answered: number }>> = {};
  let applicable = 0;
  let answered = 0;
  for (const it of items) {
    if (it.status === "na") continue;
    const c = (perCat[it.category] ??= { met: 0, answered: 0 });
    applicable++;
    if (it.status === "unanswered") continue;
    // v1.5: board-emphasis items (E7+ advancement considerations, or E7+-only
    // milestones for an E7+ target) count ×emphasisMult within their category.
    const w = it.board_emphasis ? emphasisMult : 1;
    c.answered += w;
    answered++;
    // Met is met. `verified_in_ompf` is self-ticked (see scoreLeadership) — it is
    // an honesty axis, not a verification one, and it is reported unscored by
    // ReadinessReport.confirmInOmpf.
    if (it.status === "met") c.met += w;
  }
  const ratios: Partial<Record<LadrCategory, number>> = {};
  const ratioDetail: Detail = {};
  let wSum = 0;
  let sSum = 0;
  for (const cat of Object.keys(LADR_CATEGORY_WEIGHTS) as LadrCategory[]) {
    const c = perCat[cat];
    if (!c || c.answered === 0) continue; // zero answered → dropped, weights renormalize
    const ratio = c.met / c.answered;
    ratios[cat] = ratio;
    ratioDetail[`ratio_${cat}`] = ratio;
    wSum += LADR_CATEGORY_WEIGHTS[cat];
    sSum += LADR_CATEGORY_WEIGHTS[cat] * ratio;
  }
  if (wSum === 0) {
    return { S: 0, conf: 0, ratios, ratioDetail, answered, applicable, wSum: 0, noData: true };
  }
  return {
    S: (100 * sSum) / wSum,
    conf: answered / applicable,
    ratios, ratioDetail, answered, applicable, wSum, noData: false,
  };
}

function scoreLadr(items: LadrItemInput[], emphasisMult: number): FactorScore & {
  ratios: Partial<Record<LadrCategory, number>>;
  answered: number;
  applicable: number;
  unmet: LadrUnmet[];
} {
  const base = aggregateLadr(items, emphasisMult);

  // v2: stop discarding identity. factorLocalPoints is the exact change to THIS
  // factor's 0–100 score when the row alone flips to met+verified.
  // ponytail: O(n²) — one re-aggregation per unmet row, n = applicable rows
  // (curated ratings run 20–30, so ~900 trivial iterations). If a rating ever
  // ships hundreds of rows, memoize per category instead of re-walking all.
  const unmet: LadrUnmet[] = [];
  items.forEach((it, i) => {
    if (it.status !== "not_met" && it.status !== "unanswered") return;
    const flipped = items.slice();
    flipped[i] = { ...it, status: "met" };
    unmet.push({
      milestone_id: it.milestone_id,
      item: it.item ?? "",
      category: it.category,
      factorLocalPoints: aggregateLadr(flipped, emphasisMult).S - base.S,
      board_emphasis: it.board_emphasis === true,
    });
  });

  const detail: Detail = base.noData
    ? { no_data: true, answered: base.answered, applicable: base.applicable, wSum: 0 }
    : { ...base.ratioDetail, answered: base.answered, applicable: base.applicable, wSum: base.wSum };
  return {
    S: base.S,
    conf: base.conf,
    ratios: base.ratios,
    answered: base.answered,
    applicable: base.applicable,
    unmet,
    detail,
  };
}

// FACTOR 4 — Continuity (§7). Window is the half-open day interval
// (windowStart, windowEnd] of at most 1826 days; periods cover both endpoints
// inclusive.
//
// TWO coverage numbers, deliberately:
//
//   detail.coverage      coveredDays / 1826 — how much of the FIVE-YEAR WINDOW is
//                        documented. Unchanged meaning. It is what readiness.ts
//                        grades the area on ("APEX holds 3 of the 5 window years"
//                        is not the same claim as holding all of them) and what
//                        the completeness continuity95 item tests.
//   detail.spanCoverage  coveredDays / observedDays — how much of the span APEX
//                        can actually SEE is documented. This is what S_C grades.
//
// S_C moved to the second one because the first was charging a three-year Sailor
// twice for time they had not yet served: coverage 1096/1826 = 0.60 AND a 15-point
// leading-gap penalty, S_C = 45 for a record with nothing missing from it. The
// §17-6 advisory already refused to call the pre-first-report span a break — "a
// 3-year Sailor has no break" — and a graded penalty that contradicts the advisory
// printed beside it is the defect, not the advisory. APEX cannot know when the
// member made E-5; the earliest report they entered is the earliest date it has
// any basis to call a period documented. gapCount now counts the same GENUINE
// breaks (internal + trailing) the advisory counts, so the two cannot disagree.
//
// What the span reading gives away — "one recent report, therefore perfect
// continuity" — is paid for by conf_C, which is min(1, observedDays/1826) instead
// of a flat 1. A one-year span reports S_C 100 at conf 0.20 and carries a fifth of
// the factor's weight into the composite. Same shape as conf_P = min(1, N/3): "we
// have only seen part of the window" belongs on the confidence axis, not forged
// into a deficiency. No usable evals at all is the §7 item-8 zero-data case —
// S 0, conf 0, no_data — never a graded 0 the Sailor has to out-run.
function scoreContinuity(evals: RubricEvalInput[], T: string, gapDays: number): FactorScore & { coverage: number } {
  if (evals.length === 0)
    return {
      S: 0,
      conf: 0,
      coverage: 0,
      detail: {
        no_data: true, coverage: 0, spanCoverage: 0,
        coveredDays: 0, observedDays: 0, gapCount: 0, recordGapCount: 0,
      },
    };
  const tDay = dayNum(T);
  const latestTo = evals.map((e) => e.period_to).sort().at(-1);
  const graceEndDay = tDay - CONTINUITY_GRACE_DAYS;
  const winEndDay = Math.min(tDay, Math.max(latestTo ? dayNum(latestTo) : graceEndDay, graceEndDay));
  // A malformed period_from yields NaN, and NaN would propagate through
  // Math.max into every day comparison below; fall back to the full window.
  const froms = evals.map((e) => dayNum(e.period_from)).filter((d) => !Number.isNaN(d));
  const fullStartDay = winEndDay - CONTINUITY_WINDOW_DAYS;
  // excluded boundary day: the first in-window day is winStartDay + 1
  const winStartDay = froms.length ? Math.max(fullStartDay, Math.min(...froms) - 1) : fullStartDay;
  const observedDays = Math.max(0, winEndDay - winStartDay);

  const clipped = evals
    .map(
      (e) =>
        [Math.max(dayNum(e.period_from), winStartDay + 1), Math.min(dayNum(e.period_to), winEndDay)] as [
          number,
          number,
        ],
    )
    .filter(([f, t]) => f <= t)
    .sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const [f, t] of clipped) {
    const last = merged[merged.length - 1];
    if (last && f <= last[1] + 1) last[1] = Math.max(last[1], t);
    else merged.push([f, t]);
  }

  const coveredDays = merged.reduce((a, [f, t]) => a + (t - f + 1), 0);
  const coverage = Math.min(1, coveredDays / CONTINUITY_WINDOW_DAYS);
  const spanCoverage = observedDays > 0 ? Math.min(1, coveredDays / observedDays) : 0;

  // Genuine reporting breaks only: internal (between two reports) and trailing
  // (after the last one). The leading span cannot be a break — see the header.
  let gapCount = 0;
  let cursor = winStartDay; // boundary: first in-window day is cursor + 1
  let seenReport = false;
  for (const [f, t] of merged) {
    if (seenReport && f - cursor - 1 > gapDays) gapCount++;
    seenReport = true;
    cursor = Math.max(cursor, t);
  }
  if (seenReport && winEndDay - cursor > gapDays) gapCount++;

  const S = clamp(100 * spanCoverage - CONTINUITY_GAP_PENALTY * gapCount, 0, 100);
  return {
    S,
    conf: Math.min(1, observedDays / CONTINUITY_WINDOW_DAYS),
    coverage,
    detail: {
      windowStart: isoOf(winStartDay),
      windowEnd: isoOf(winEndDay),
      observedDays,
      coverage,
      spanCoverage,
      coveredDays,
      gapCount,
      // Kept as a distinct key because RubricResult.continuityGap and the §17-6
      // advisory read it; it is now the same count the graded penalty uses.
      recordGapCount: gapCount,
    },
  };
}

// FACTOR 5 — Record completeness (§7). Presence, not quality; conf_R = 1 (it
// measures missingness itself, so it is never uncertain about its own subject).
// NOT part of the readiness verdict — see VERDICT_FACTORS. It is reported as an
// area and it is what the coverage headline is made of.
//
// `unverifiedCount` is still reported in `detail` and is still UNSCORED: it is
// the population ReadinessReport.confirmInOmpf lists.
function scoreCompleteness(
  psr: PsrSection,
  ladrItems: LadrItemInput[],
  coverage: number,
  ladrAnswered: number,
  ladrApplicable: number,
): FactorScore {
  const unverifiedCount =
    (psr.awards ?? []).filter((a) => !a.verified_in_ompf).length +
    ladrItems.filter((it) => it.status === "met" && !it.verified_in_ompf).length;
  const items = {
    continuity95: coverage >= 0.95 ? COMPLETENESS_POINTS.continuity95 : 0,
    psrEntered: psr.entered ? COMPLETENESS_POINTS.psrEntered : 0,
    // Presence, like necs/education: an entered-but-empty section counts, an
    // unfilled (null) one does not. It used to be the verified/total ratio.
    awards: psr.awards ? COMPLETENESS_POINTS.awards : 0,
    necs: psr.necs ? COMPLETENESS_POINTS.necs : 0,
    education: psr.education ? COMPLETENESS_POINTS.education : 0,
    pfa3: (psr.pfa?.length ?? 0) >= 3 ? COMPLETENESS_POINTS.pfa3 : 0,
    ladr90:
      ladrApplicable > 0 && ladrAnswered / ladrApplicable >= 0.9 ? COMPLETENESS_POINTS.ladr90 : 0,
  };
  const S = (100 * Object.values(items).reduce((a, b) => a + b, 0)) / COMPLETENESS_MAX;
  return { S, conf: 1, detail: { ...items, unverifiedCount } };
}

// FACTOR 6 — Precept alignment (§7). One computable indicator per flag.
//
// An indicator whose underlying data is ABSENT now returns null and is dropped —
// the surviving indicators are averaged among themselves and conf_X is the share
// of flags that could be computed. It used to return 0 for missing data at a flat
// conf_X = 1, which is the founding defect written down as policy: a Sailor whose
// rating has no LaDR loaded scored `warfighting: 0` and was charged the full
// precept weight for it. `mean()` of the available halves handles the paired
// indicators the same way (education, technical_expertise) rather than halving a
// present ratio against an absent one.
//
// The tours-derived indicators key off L1 === null, which is exactly
// scoreLeadership's "tours section not entered" signal.
function scorePrecept(
  flags: PreceptFlag[],
  ctx: { ratios: Partial<Record<LadrCategory, number>>; L1: number | null; seaMonths72: number },
): FactorScore {
  const mean = (xs: Array<number | undefined>): number | null => {
    const present = xs.filter((x): x is number => x != null);
    return present.length === 0 ? null : present.reduce((a, b) => a + b, 0) / present.length;
  };
  const indicator: Record<PreceptFlag, () => number | null> = {
    warfighting: () => ctx.ratios.qual_warfare ?? null,
    leadership_positions: () => (ctx.L1 == null ? null : ctx.L1 / 100),
    education: () => mean([ctx.ratios.education_degree, ctx.ratios.credential]),
    sea_duty: () => (ctx.L1 == null ? null : Math.min(1, ctx.seaMonths72 / SEA_MONTHS_FULL)),
    technical_expertise: () => mean([ctx.ratios.nec_opportunity, ctx.ratios.qual_rate_specific]),
  };
  const detail: Detail = {};
  let sum = 0;
  let n = 0;
  for (const f of flags) {
    const v = indicator[f]();
    detail[f] = v;
    if (v != null) {
      sum += v;
      n++;
    }
  }
  if (n === 0) return { S: 0, conf: 0, detail: { ...detail, no_data: true } };
  return { S: (100 * sum) / n, conf: n / flags.length, detail };
}

// ---------------------------------------------------------------------------
// Composite
// ---------------------------------------------------------------------------

/**
 * The engine. Pure: no Date.now(), no randomness, no I/O.
 *
 * WITHHOLDING — the limit of what any scoring rule can do, stated once here.
 *
 * Every input is self-entered. A Sailor who deletes a section removes the
 * evidence that it was weak, and the score computed from what is left is higher.
 * That cannot be fixed arithmetically, and the reason is a two-line proof: let f
 * be the score and D' ⊂ D a record with a section removed. "Absence must never
 * lower the score" is f(D') ≥ f(D) for every D; "absence must never raise it" is
 * f(D') ≤ f(D). Both at once force f(D') = f(D) for every removal — a function
 * that ignores its input. The two halves are not jointly satisfiable by anything
 * that scores anything.
 *
 * So the defence is not arithmetic, it is refusing to score. Measured on this
 * engine, with the gate doing its job:
 *
 *   blanking a weak tours section   49.1 → 63.2 raw, but coverage 1.00 → 0.78
 *                                   and leadership conf 0.30 < AREA_EVIDENCE_FLOOR,
 *                                   so readiness.ts emits NO number.
 *   deleting a declining report     35.7 → 49.0, still scored. Not closable:
 *                                   APEX cannot know about a report you did not
 *                                   type, and performance grades the reports it
 *                                   has. Pre-existing; this arithmetic widens it.
 *   omitting an NJP / PFA failure    24.1 → 49.1 at coverage 1.0000 both ways.
 *                                   The largest of the three, entirely invisible
 *                                   to coverage, and unchanged from the previous
 *                                   engine — adverse material has no "section
 *                                   entered" flag to be missing.
 *
 * The only real remedy is corroboration APEX does not have (an OMPF feed). Until
 * then the honest posture is: never render a score without its coverage beside
 * it, and refuse to render one at all while a verdict factor is half-blind.
 */
export function scoreBoardConfidence(
  inputs: RubricInputs,
  config: RubricConfig = DEFAULT_RUBRIC_CONFIG,
): RubricResult {
  const T = inputs.boardDate;
  const warnings: string[] = [];

  // Defensive: weights are normalized to sum 100 so a hand-edited config row
  // cannot silently inflate or deflate the scale. A zero (or negative) sum —
  // e.g. an operator blanks the weights jsonb — would otherwise score everyone
  // 0 silently; fall back to the spec defaults and warn instead.
  const wSumCfg = (Object.values(config.weights) as number[]).reduce((a, b) => a + b, 0);
  let W: Record<FactorKey, number>;
  if (wSumCfg > 0) {
    W = { ...config.weights };
    if (Math.abs(wSumCfg - 100) > 1e-9)
      for (const k of Object.keys(W) as FactorKey[]) W[k] = (W[k] / wSumCfg) * 100;
  } else {
    W = { ...FACTOR_WEIGHTS };
    warnings.push(
      "Configured rubric weights summed to zero — the default factor weights were used for this analysis.",
    );
  }

  // v1.1 review fix: a period_to after T would earn recency weight > 1 —
  // future-dated reports are excluded from ALL factors, continuity included.
  const evals = inputs.evals.filter((e) => monthsBefore(e.period_to, T) >= 0);
  const futureCount = inputs.evals.length - evals.length;
  if (futureCount > 0)
    warnings.push(
      `Excluded ${futureCount} report${futureCount === 1 ? "" : "s"} dated after the board date.`,
    );

  // v1.1 review fix: dateless awards/tours cannot be placed in any lookback
  // window — exclude them from scoring rather than let NaN comparisons decide.
  //
  // A section the filter EMPTIES is returned as null, not as []. The two mean
  // opposite things (types.ts: "null = section never filled ≠ empty list"): [] is
  // "I have no awards", which scoreLeadership correctly reads as L2 = 0 at full
  // confidence, while a section whose every row was thrown out for a missing date
  // is data APEX could not place, not an absence of achievements. Returning []
  // there scored "no data" as "nothing good found" — a record whose tours all
  // lacked dates read S_L 10.2 at conf 1.00 instead of dropping L1/L3 and
  // reporting conf 0.30.
  let dateless = 0;
  const keepDated = <E,>(arr: E[] | null, ok: (x: E) => boolean): E[] | null => {
    if (!arr) return null;
    const kept = arr.filter(ok);
    dateless += arr.length - kept.length;
    return kept.length === 0 && arr.length > 0 ? null : kept;
  };
  const psr: PsrSection = {
    ...inputs.psr,
    awards: keepDated(inputs.psr.awards, (a) => hasDate(a.date_awarded)),
    tours: keepDated(
      inputs.psr.tours,
      (t) => hasDate(t.start) && (t.end === null || hasDate(t.end)),
    ),
  };
  if (dateless > 0)
    warnings.push(
      `${dateless} ${dateless === 1 ? "entry" : "entries"} with missing dates ${dateless === 1 ? "was" : "were"} excluded from scoring — add dates in Record Entry.`,
    );

  const perf = scorePerformance(evals, T);
  const lead = scoreLeadership(psr, T);
  const dev = scoreLadr(inputs.ladr, config.board_emphasis_multiplier);
  const cont = scoreContinuity(evals, T, config.continuity_gap_days);
  const comp = scoreCompleteness(psr, inputs.ladr, cont.coverage, dev.answered, dev.applicable);

  // EXCLUSIONS from the verdict, and the ONE redistribution mechanism.
  //   - development and completeness are excluded always — see VERDICT_FACTORS.
  //   - precept is excluded when no flags are configured, which is an ADMIN
  //     omission (a Sailor can never cause it).
  // The surviving weights are scaled ×100/(100 − excluded) so they sum to 100.
  // The scale cancels out of `final` — a weighted MEAN is invariant under a
  // common factor on its weights — but it is load-bearing for
  // ReadinessReport.coverage, which is Σ(weight·conf)/100 over these same
  // effective weights and must stay on a [0,1] scale.
  const preceptIncluded = inputs.preceptFlags.length > 0;
  const inVerdict = (k: FactorKey): boolean =>
    VERDICT_FACTORS.has(k) && (k !== "precept" || preceptIncluded);
  const excludedWeight = (Object.keys(W) as FactorKey[])
    .filter((k) => !inVerdict(k))
    .reduce((a, k) => a + W[k], 0);
  const scale = 100 / Math.max(1e-9, 100 - excludedWeight);
  const prec: FactorScore = preceptIncluded
    ? scorePrecept(inputs.preceptFlags, { ratios: dev.ratios, L1: lead.L1, seaMonths72: lead.seaMonths72 })
    : { S: 0, conf: 1, detail: { excluded: true } };

  const factor = (key: FactorKey, f: FactorScore): FactorResult => {
    const weight = inVerdict(key) ? W[key] * scale : 0;
    return {
      key,
      weight,
      score: f.S,
      confidence: f.conf,
      contribution: (weight / 100) * f.S * f.conf,
      detail: f.detail,
    };
  };

  const factors: FactorResult[] = [
    factor("performance", perf),
    factor("leadership", lead),
    factor("development", dev),
    factor("continuity", cont),
    factor("completeness", comp),
    factor("precept", prec),
  ];

  // THE COMPOSITE. Σ(w·conf·S) / Σ(w·conf) — a confidence-weighted MEAN of the
  // factor scores, not a sum against a fixed denominator of 100.
  //
  // The fixed denominator was the founding defect. It made conf_f = 0 ("APEX
  // cannot see this") arithmetically identical to S_f = 0 with conf_f = 1 ("APEX
  // looked and it is bad"): both contributed nothing while the factor's full
  // weight stayed in the denominator, so every point APEX could not observe was
  // charged to the Sailor as a point they had failed to earn. Six Early Promotes
  // with empty tabs scored 45.0 "Not competitive"; a record with no LaDR loaded
  // at all scored BELOW the same record with every roadmap row answered and
  // failed. Dividing by Σ(w·conf) drops unmeasured factors out of both sides, so
  // absence moves the score nowhere and only lands on the coverage axis
  // (ReadinessReport.coverage.measured, which is this denominator over 100).
  //
  // `contribution` keeps its published meaning — (weight/100)·S·conf — so the
  // per-factor display stays in [0, weight]; the identity is
  // final = Σcontribution / coverage − A.
  const denom = factors.reduce((a, f) => a + f.weight * f.confidence, 0);
  if (denom <= 0)
    warnings.push(
      "APEX has nothing entered for any area it scores, so there is no overall score for this record.",
    );
  const raw = denom <= 0 ? 0 : (100 * factors.reduce((a, f) => a + f.contribution, 0)) / denom;

  // Adverse adjustment A: 15 per adverse item (cap 30) + 10 for any PFA failure
  // within 36 months of T (INCLUSIVE bound — exactly 36 months is inside).
  // v1.1 review fix: a failure WITHOUT a date is counted as recent (conservative
  // — never inflate) with a warning, instead of NaN silently skipping the penalty.
  const pfaCycles = psr.pfa ?? [];
  const datelessFail = pfaCycles.some((p) => p.result === "fail" && !hasDate(p.date));
  if (datelessFail)
    warnings.push(
      "A PFA failure without a date was counted as recent — add the date to confirm the 36-month window.",
    );
  const pfaFail =
    datelessFail ||
    pfaCycles.some(
      (p) =>
        p.result === "fail" &&
        hasDate(p.date) &&
        monthsBefore(p.date, T) <= PFA_FAIL_LOOKBACK_MONTHS,
    );
  const adverseAdjustment =
    Math.min(ADVERSE_CAP, ADVERSE_PER_ITEM * psr.adverse.length) +
    (pfaFail ? PFA_FAIL_PENALTY : 0);

  const final = round1HalfAway(clamp(raw - adverseAdjustment, 0, 100));

  // v1.5: continuity is GRADED (already reflected in the continuity factor),
  // never a hard zero — this tool does not decide selection. A detected reporting
  // gap raises an advisory that states the governing rule rather than inverting it.
  //
  // BUPERSINST 1610.10H para 17-6, verbatim: "Missing FITREPs, CHIEFEVALs, or EVALs
  // do not disqualify a member before a selection board, but missing reports can
  // make the work of the board more difficult. As a minimum, a member should attempt
  // to obtain any missing report covering significant duty in the grades of E-5 or
  // above within the past 5 years."
  //
  // Verified against the LIVE current revision, not the stale bundled copy in
  // my_tools/: BUPERSINST 1610.10H CH-2 from MyNavyHR, para 17-6 at Encl (2) p. 17-2.
  // CH-2's transmittal revises "enclosure 2, page 3-1 through 3-2a and 3-6 through
  // 3-7a" — chapter 3 only — and p. 17-2 still carries the unrevised 30 Jul 2025
  // footer, so chapter 17 is untouched by CH-2 and this citation is current.
  //
  // TIMESTAMP, NOT A CHECK — MyNavyHR re-posts this file and every byte-level
  // identifier below rots. Do not treat a mismatch as evidence of anything.
  //   fetched 2026-07-29: 173 pp., ModDate 27 May 2026, sha256 ec644362…
  //   re-posted by 2026-07-30: 174 pp., ModDate  1 Jun 2026, sha256 5e71ca59…
  // Chapter 17 is identical in both. The CH-2 transmittal itself is signed 26 May
  // 2026 (an earlier note here said 27 May — that was the PDF ModDate, not the
  // signature date).
  //
  // The FY-27 precept agrees from the board's side (App A 7.a): a gap is "a period of
  // undocumented performance", and "if there is missing information in the record,
  // board members shall evaluate the record with what is available" (App A 7).
  //
  // Both remedies carry requirements the earlier copy compressed away, and a Sailor
  // who follows a compressed version gets the submission bounced:
  //   17-6a  the copy must display ALL required signatures, initials and dates, AND
  //          go in with a signed cover letter requesting the duplicate report be
  //          filed in the official record. A bare copy is not a submission.
  //   17-6b  the letter must say WHY the report could not be obtained and supply what
  //          would have appeared in blocks 1-19 and 22-26. Accepted only to fill a gap
  //          in REGULAR report continuity; may not evaluate the member's own
  //          performance or carry a self-recommendation.
  // See docs/navy-reference.md §3.7. Advisory only; it does not alter the score.
  const recordGapCount = Number(cont.detail.recordGapCount ?? 0);
  const continuityGap = recordGapCount > 0;
  const continuityAdvisory = continuityGap
    ? `${recordGapCount} gap${recordGapCount === 1 ? "" : "s"} in reporting continuity (a missing period longer than ${config.continuity_gap_days} days) ${recordGapCount === 1 ? "was" : "were"} detected in the record. Missing FITREPs, CHIEFEVALs, or EVALs do NOT disqualify you before a selection board (BUPERSINST 1610.10H para 17-6) — but a gap is a period of undocumented performance, and the board evaluates the record with what is available. At a minimum, try to recover any missing report covering significant duty in the grades of E-5 or above within the past 5 years: send PERS-32 a copy of the original that displays all required signatures, initials and dates, together with a signed cover letter asking that the duplicate report be filed in your official record (para 17-6a); or, if the report cannot be obtained, send PERS-32 a one-page letter in lieu of the report explaining why it could not be obtained and supplying what would have appeared in blocks 1-19 and 22-26 (para 17-6b, Exhibit 17-4 — accepted only to fill a gap in Regular report continuity, and it may not evaluate your own performance or recommend you for promotion). Verify your reporting continuity on BOL and NSIPS.`
    : null;
  if (continuityAdvisory) warnings.push(continuityAdvisory);

  const { vote, label } = bandFor(final);
  return {
    final,
    band: vote,
    bandLabel: label,
    factors,
    adverseAdjustment,
    warnings,
    continuityGap,
    continuityAdvisory,
    ladrUnmet: dev.unmet,
  };
}

// ---------------------------------------------------------------------------
// v2 — the action plan (pure; it reports, it does not re-score)
// ---------------------------------------------------------------------------

/**
 * The composite on its full-float scale — Σ(w·conf·S)/Σ(w·conf) − A, before the
 * [0,100] clamp and the terminal rounding. Nothing in the scoring path uses it;
 * it exists for service.ts's assertTripleMatches, which needs a fingerprint
 * sensitive enough to catch "this RubricResult was not scored from these inputs
 * under this config". `final` is rounded to one decimal and would let a near-miss
 * through.
 */
export function compositeRaw(r: RubricResult): number {
  let num = 0;
  let den = 0;
  for (const f of r.factors) {
    num += f.weight * f.confidence * f.score;
    den += f.weight * f.confidence;
  }
  return (den <= 0 ? 0 : num / den) - r.adverseAdjustment;
}

/**
 * Only real improvements. There is deliberately NO `award_verify` / `ladr_verify`
 * candidate: `verified_in_ompf` is a self-ticked box (RecordEntryForm), so it is
 * an HONESTY axis, not a verification axis. Scoring it inverted correct doctrine
 * (a board sees only your OMPF) into an integrity penalty — ticking every box and
 * changing nothing else was worth 9.0 composite points on a measured record,
 * while disclosing honestly ("met, not yet in OMPF") cost them. It no longer
 * scores anywhere: UNVERIFIED_MULT and the esrFlags term are gone. Confirming an
 * OMPF entry stays in the plan as an unscored reminder — ReadinessReport.confirmInOmpf.
 */
export type BandDeltaKind =
  | "ladr_answer"    // an unanswered LaDR row → answered "met"
  | "ladr_meet";     // a not_met LaDR row → met

export interface BandDelta {
  id: string;                  // stable within a run: "ladr:<uuid>:meet"
  kind: BandDeltaKind;
  // Both narrowed from the wider forward-looking contract: every candidate is a
  // LaDR row, so `FactorKey` and `string | null` described ranges that cannot
  // occur. Widen again when non-LaDR candidates return (P1b).
  area: "development";
  label: string;               // LaDR milestone text
  milestoneId: string;
  /**
   * Marginal points on the DEVELOPMENT AREA's own 0–100 scale — the exact change
   * in S_D when this one row flips to met, re-aggregated rather than estimated
   * (scoreLadr → LadrUnmet.marginal_points).
   *
   * It is deliberately NOT a composite delta any more. Development carries no
   * weight in the verdict (VERDICT_FACTORS), so the composite delta of a LaDR
   * flip is now ~0 for every row and every plan would ship EMPTY — readiness.ts
   * keeps only `delta > 0`. Ranking on the residue (the completeness ladr90 step
   * and the precept indicators) would rank the plan by side effects. The area's
   * own scale is the honest unit: these are development actions, ranked by how
   * much they move development.
   *
   * May be NEGATIVE — flipping a row can pull a light category into wSum and dilute
   * a heavier one. readiness.ts filters those out; "do this, lose 0.24 points" is
   * not advice.
   *
   * NOTE for the reader of readiness.ts: ReadinessAction.worth is this number, and
   * that field's comment still says "marginal composite points". It is only ever
   * sorted and filtered `> 0`, never rendered, so the ordering is correct — but
   * the comment is stale and belongs to whoever owns readiness.ts next.
   */
  delta: number;
}

/**
 * The ranked action plan. Every candidate is already priced by the base scoring
 * run — scoreLadr re-aggregates the LaDR once per unmet row and hands back
 * `RubricResult.ladrUnmet` — so this reads that out and sorts it.
 *
 * It used to re-score the ENTIRE rubric once per candidate to measure a composite
 * delta, which needed a 60-candidate cap and a dilution-aware `stakeOf` heuristic
 * to decide what the cap was allowed to drop. All three are gone with the thing
 * they served. `inputs` supplies the answered/not-answered distinction (the two
 * kinds give different advice); `config` is unused now that nothing is re-scored,
 * and is kept only so callers do not have to change.
 */
export function bandDeltas(
  result: RubricResult,
  inputs: RubricInputs,
  _config: RubricConfig,
): BandDelta[] {
  const statusOf = new Map(inputs.ladr.map((i) => [i.milestone_id, i.status]));
  return (result.ladrUnmet ?? [])
    .map((u) => {
      // "answer" is a checklist row that has never been touched; "meet" is one the
      // Sailor has explicitly marked not met. Same flip, different advice.
      const unanswered = statusOf.get(u.milestone_id) === "unanswered";
      return {
        id: `ladr:${u.milestone_id}:${unanswered ? "answer" : "meet"}`,
        kind: (unanswered ? "ladr_answer" : "ladr_meet") as BandDeltaKind,
        area: "development" as const,
        label: u.item || u.milestone_id,
        milestoneId: u.milestone_id,
        delta: u.factorLocalPoints,
      };
    })
    .sort((a, b) => b.delta - a.delta);
}
