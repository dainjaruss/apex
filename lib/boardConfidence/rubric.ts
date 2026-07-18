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
  PreceptFlag,
  PromotionRec,
  PsrSection,
  RubricEvalInput,
  RubricInputs,
  RubricResult,
} from "@/lib/boardConfidence/types";

// ---------------------------------------------------------------------------
// Constants (spec §4.2, exact values)
// ---------------------------------------------------------------------------

export const HALF_LIFE_MONTHS = 24;
export const SEA_MULT = 1.25;
export const LOOKBACK_MONTHS = 72;
export const UNVERIFIED_MULT = 0.5;
export const REC_POINTS: Record<Exclude<PromotionRec, "NOB">, number> = {
  "Early Promote": 100, "Must Promote": 80, "Promotable": 50,
  "Progressing": 25, "Significant Problems": 0,
};
export const FACTOR_WEIGHTS: Record<FactorKey, number> = {
  performance: 40, leadership: 15, development: 15,
  continuity: 10, completeness: 10, precept: 10,
};
// v1.5: operator-tunable parameters. Defaults reproduce spec §7 with the
// continuity hard gate ON (any gap in the 60-month window ⇒ NOT SELECTION
// READY, confidence 0 — a board cannot brief an unexplained gap).
export const DEFAULT_RUBRIC_CONFIG: RubricConfig = {
  weights: { ...FACTOR_WEIGHTS },
  continuity_hard_gate: true,
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
export const CONTINUITY_WINDOW_DAYS = 1826;    // 60 months
export const CONTINUITY_GRACE_DAYS = 365;
export const CONTINUITY_GAP_DAYS_DEFAULT = 90;
export const CONTINUITY_GAP_PENALTY = 15;
export const COMPLETENESS_POINTS = {           // sum = 100 (§7 Factor 5)
  continuity95: 20, psrEntered: 15, awards: 15, necs: 10,
  education: 10, pfa3: 10, ladr90: 10, esrFlags: 10,
} as const;
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
    const comps = [e.summary_group_average, e.rsca].filter((x): x is number => x != null);
    let s: number;
    let w: number;
    if (comps.length > 0) {
      s = clamp(50 + P2_SLOPE * (e.trait_average - Math.max(...comps)), 0, 100);
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

  // P4 — EP breakout scarcity; requires a summary-group distribution on ≥1 eval.
  let P4: number | null = null;
  if (obs.some((e) => e.ep_count != null && e.group_size != null)) {
    P4 =
      (100 *
        obs.reduce((a, e, i) => {
          let s = 0;
          if (e.promotion_recommendation === "Early Promote" && e.ep_count != null && e.group_size != null) {
            s = 1 - (e.ep_count - 1) / Math.max(1, e.group_size - 1);
          }
          return a + r[i] * s;
        }, 0)) /
      sumR;
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
    const awardPts = psr.awards
      .filter((aw) => monthsBefore(aw.date_awarded, T) <= AWARD_LOOKBACK_MONTHS)
      .reduce((a, aw) => a + AWARD_POINTS[aw.level] * (aw.verified_in_ompf ? 1 : UNVERIFIED_MULT), 0);
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
function scoreLadr(items: LadrItemInput[], emphasisMult: number): FactorScore & {
  ratios: Partial<Record<LadrCategory, number>>;
  answered: number;
  applicable: number;
} {
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
    if (it.status === "met") c.met += (it.verified_in_ompf ? 1 : UNVERIFIED_MULT) * w;
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
    return {
      S: 0, conf: 0, ratios, answered, applicable,
      detail: { no_data: true, answered, applicable, wSum: 0 },
    };
  }
  const S = (100 * sSum) / wSum;
  const conf = answered / applicable;
  return { S, conf, ratios, answered, applicable, detail: { ...ratioDetail, answered, applicable, wSum } };
}

// FACTOR 4 — Continuity (§7). Window is the half-open day interval
// (windowStart, windowEnd] of exactly 1826 days; periods cover both endpoints
// inclusive. Uncovered runs > 90 days (leading/trailing included) each cost 15.
// conf_C = 1 always — absence of evals IS the signal continuity measures.
function scoreContinuity(evals: RubricEvalInput[], T: string, gapDays: number): FactorScore & { coverage: number } {
  const tDay = dayNum(T);
  const latestTo = evals.map((e) => e.period_to).sort().at(-1);
  const graceEndDay = tDay - CONTINUITY_GRACE_DAYS;
  const winEndDay = Math.min(tDay, Math.max(latestTo ? dayNum(latestTo) : graceEndDay, graceEndDay));
  const winStartDay = winEndDay - CONTINUITY_WINDOW_DAYS; // excluded boundary day

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

  let gapCount = 0;
  let cursor = winStartDay; // boundary: first in-window day is cursor + 1
  for (const [f, t] of merged) {
    if (f - cursor - 1 > gapDays) gapCount++;
    cursor = Math.max(cursor, t);
  }
  if (winEndDay - cursor > gapDays) gapCount++;

  const S = clamp(100 * coverage - CONTINUITY_GAP_PENALTY * gapCount, 0, 100);
  return {
    S,
    conf: 1,
    coverage,
    detail: {
      windowStart: isoOf(winStartDay),
      windowEnd: isoOf(winEndDay),
      coverage,
      coveredDays,
      gapCount,
    },
  };
}

// FACTOR 5 — Record completeness (§7). Presence, not quality; conf_R = 1 (it
// measures missingness itself). unverifiedCount = "in ESR but not closed out to
// OMPF" flags: unverified award entries + unverified met LaDR items (§7 item 6
// names exactly the met/award entries as the UNVERIFIED_MULT population).
function scoreCompleteness(
  psr: PsrSection,
  ladrItems: LadrItemInput[],
  coverage: number,
  ladrAnswered: number,
  ladrApplicable: number,
): FactorScore {
  const awards = psr.awards ?? [];
  const unverifiedCount =
    awards.filter((a) => !a.verified_in_ompf).length +
    ladrItems.filter((it) => it.status === "met" && !it.verified_in_ompf).length;
  const items = {
    continuity95: coverage >= 0.95 ? COMPLETENESS_POINTS.continuity95 : 0,
    psrEntered: psr.entered ? COMPLETENESS_POINTS.psrEntered : 0,
    awards:
      awards.length > 0
        ? Math.round(
            (COMPLETENESS_POINTS.awards * awards.filter((a) => a.verified_in_ompf).length) / awards.length,
          )
        : 0,
    necs: psr.necs ? COMPLETENESS_POINTS.necs : 0,
    education: psr.education ? COMPLETENESS_POINTS.education : 0,
    pfa3: (psr.pfa?.length ?? 0) >= 3 ? COMPLETENESS_POINTS.pfa3 : 0,
    ladr90:
      ladrApplicable > 0 && ladrAnswered / ladrApplicable >= 0.9 ? COMPLETENESS_POINTS.ladr90 : 0,
    esrFlags: Math.round(COMPLETENESS_POINTS.esrFlags * (1 - Math.min(1, unverifiedCount / 5))),
  };
  const S = Object.values(items).reduce((a, b) => a + b, 0);
  return { S, conf: 1, detail: { ...items, unverifiedCount } };
}

// FACTOR 6 — Precept alignment (§7). Fixed computable indicator per flag;
// unavailable underlying data → indicator 0 (never fabricate). conf_X = 1.
function scorePrecept(
  flags: PreceptFlag[],
  ctx: { ratios: Partial<Record<LadrCategory, number>>; L1: number | null; seaMonths72: number },
): FactorScore {
  const indicator: Record<PreceptFlag, () => number> = {
    warfighting: () => ctx.ratios.qual_warfare ?? 0,
    leadership_positions: () => (ctx.L1 ?? 0) / 100,
    education: () => ((ctx.ratios.education_degree ?? 0) + (ctx.ratios.credential ?? 0)) / 2,
    sea_duty: () => Math.min(1, ctx.seaMonths72 / SEA_MONTHS_FULL),
    technical_expertise: () =>
      ((ctx.ratios.nec_opportunity ?? 0) + (ctx.ratios.qual_rate_specific ?? 0)) / 2,
  };
  const detail: Detail = {};
  let sum = 0;
  for (const f of flags) {
    const v = indicator[f]();
    detail[f] = v;
    sum += v;
  }
  return { S: (100 * sum) / flags.length, conf: 1, detail };
}

// ---------------------------------------------------------------------------
// Composite
// ---------------------------------------------------------------------------

/** The engine. Pure: no Date.now(), no randomness, no I/O. */
export function scoreBoardConfidence(
  inputs: RubricInputs,
  config: RubricConfig = DEFAULT_RUBRIC_CONFIG,
): RubricResult {
  // Defensive: weights are normalized to sum 100 so a hand-edited config row
  // cannot silently inflate or deflate the scale.
  const wSumCfg = (Object.values(config.weights) as number[]).reduce((a, b) => a + b, 0);
  const W: Record<FactorKey, number> = { ...config.weights };
  if (wSumCfg > 0 && Math.abs(wSumCfg - 100) > 1e-9) {
    for (const k of Object.keys(W) as FactorKey[]) W[k] = (W[k] / wSumCfg) * 100;
  }
  const T = inputs.boardDate;
  const warnings: string[] = [];

  // v1.1 review fix: a period_to after T would earn recency weight > 1 —
  // future-dated reports are excluded from ALL factors, continuity included.
  const evals = inputs.evals.filter((e) => monthsBefore(e.period_to, T) >= 0);
  const futureCount = inputs.evals.length - evals.length;
  if (futureCount > 0)
    warnings.push(`Excluded ${futureCount} reports dated after the board date.`);

  // v1.1 review fix: dateless awards/tours cannot be placed in any lookback
  // window — exclude them from scoring rather than let NaN comparisons decide.
  let dateless = 0;
  const keepDated = <E,>(arr: E[] | null, ok: (x: E) => boolean): E[] | null => {
    if (!arr) return null;
    const kept = arr.filter(ok);
    dateless += arr.length - kept.length;
    return kept;
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
      `${dateless} entries with missing dates were excluded from scoring — add dates in Record Entry.`,
    );

  const perf = scorePerformance(evals, T);
  const lead = scoreLeadership(psr, T);
  const dev = scoreLadr(inputs.ladr, config.board_emphasis_multiplier);
  const cont = scoreContinuity(evals, T, config.continuity_gap_days);
  const comp = scoreCompleteness(psr, inputs.ladr, cont.coverage, dev.answered, dev.applicable);

  // Zero precept flags is an ADMIN omission: the factor is excluded and the
  // other five weights redistribute ×100/90 — the only weight redistribution.
  const preceptIncluded = inputs.preceptFlags.length > 0;
  const scale = preceptIncluded ? 1 : 100 / Math.max(1e-9, 100 - W.precept);
  const prec: FactorScore = preceptIncluded
    ? scorePrecept(inputs.preceptFlags, { ratios: dev.ratios, L1: lead.L1, seaMonths72: lead.seaMonths72 })
    : { S: 0, conf: 1, detail: { excluded: true } };

  const factor = (key: FactorKey, weight: number, f: FactorScore): FactorResult => ({
    key,
    weight,
    score: f.S,
    confidence: f.conf,
    contribution: (weight / 100) * f.S * f.conf,
    detail: f.detail,
  });

  const factors: FactorResult[] = [
    factor("performance", W.performance * scale, perf),
    factor("leadership", W.leadership * scale, lead),
    factor("development", W.development * scale, dev),
    factor("continuity", W.continuity * scale, cont),
    factor("completeness", W.completeness * scale, comp),
    factor("precept", preceptIncluded ? W.precept : 0, prec),
  ];

  const raw = factors.reduce((a, f) => a + f.contribution, 0);

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

  const ungated = round1HalfAway(clamp(raw - adverseAdjustment, 0, 100));

  // v1.5 continuity hard gate: an unexplained gap in the 60-month window makes
  // the record unbriefable — NOT SELECTION READY regardless of everything else.
  const gapCount = Number(cont.detail.gapCount ?? 0);
  const gated = config.continuity_hard_gate && gapCount > 0;
  if (gated)
    warnings.push(
      `NOT SELECTION READY: ${gapCount} continuity gap${gapCount === 1 ? "" : "s"} longer than ${config.continuity_gap_days} days in the 60-month window. Close the gap to restore the underlying score of ${ungated.toFixed(1)}.`,
    );

  const final = gated ? 0 : ungated;
  const { vote, label } = bandFor(final);
  return {
    final,
    band: vote,
    bandLabel: gated ? "Not selection ready — continuity gap" : label,
    factors,
    adverseAdjustment,
    warnings,
    notSelectionReady: gated,
    gateReason: gated
      ? `Continuity gap: ${gapCount} uncovered period${gapCount === 1 ? "" : "s"} longer than ${config.continuity_gap_days} days within the 60-month window.`
      : null,
    underlyingFinal: ungated,
  };
}
