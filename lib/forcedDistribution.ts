// lib/forcedDistribution.ts
//
// Block 46 (promotion-recommendation SUMMARY) tally + the EVALMAN forced-distribution caps.
//
// Block 46 (NAVPERS 1616/26): "Enter the number in this Service member's summary group who has
// received each promotion recommendation." Only the FIVE observed categories are counted — per
// BUPERSINST 1610.10H **Table 1-4** (the ENLISTED summary-group table; Table 1-3 is the OFFICER
// table), verbatim: "Must have Observed promotion recommendation. Do not include NOB promotion
// recommendations in a summary group." So NOB is never a count (the form's NOB cell is a fixed X).
//
// Forced distribution — BUPERSINST 1610.10H, Encl (2), ch. 1, para 1-2, p. 1-17, verbatim:
//
//   "Early Promote (all paygrades except non-LDO O-1 and O-2. See note 2 above). – Twenty
//    percent of each summary group (rounded up to nearest whole number)."
//
//   "Early Promote and Must Promote Combined (percent of summary group, rounded up to nearest
//    whole number):
//      E1-E4 – No limit    LDO O1-O2 – No limit    O3 – 60%
//      E5-E6 – 60%         W1-W2 – No limit        O4 – 50%
//      E7-E9 – 50%         W3-W5 – 50%             O5-O6 – 40%"
//
// Table 1-2 Note 1 (p. 1-18): "All summary groups of two can receive one Early Promote and Must
// Promote." — the only case the percentage arithmetic does not already produce (the 50% and 40%
// tiers yield a combined max of 1 at N=2).
//
// Promotable is NOT capped (Table 1-2's Promotable column reads "No Limit").
// N = the OBSERVED (non-NOB) summary-group size.
//
// The two inequalities reproduce all 30 rows of Table 1-2 exactly: EP max = ceil(0.20·N) and
// MP max = combined − EP. Note 2's MP declines at N=6/16/26 in the 50% tier fall out of the
// arithmetic; no special case is needed. "Must Promote recommendations may be increased by one
// for each Early Promote quota not used" is likewise captured by checking the combined total.
//
// Verified 2026-07-29 against BUPERSINST 1610.10H CH-2 (26 May 2026), fetched from MyNavyHR.
// CH-2 revised only Encl (2) pp. 3-1..3-2a and 3-6..3-7a (chapter 3); pp. 1-16..1-22 — the
// Block 45/46 gates, the forced-distribution limits, and Tables 1-2/1-3/1-4 — are byte-identical
// to the bundled CH-1 copy at my_tools/BUPERSINST 1610.10.pdf.

import { paygradeOf } from "./paygrade";

/**
 * EP+MP combined cap as a fraction of the summary group, keyed by canonical paygrade.
 * `null` = the instruction states "No limit" for that band. Transcribed verbatim from the
 * p. 1-17 table quoted above.
 *
 * Not modelled: the instruction splits O-1/O-2 by designator — LDO O1-O2 get "No limit" on the
 * combined cap and are eligible for Early Promote, while NON-LDO O-1/O-2 may not be recommended
 * higher than Promotable at all ("Ensign and lieutenant junior grade FITREPs for designators,
 * other than LDO (6XXX), are prohibited from receiving a promotion recommendation higher than
 * Promotable." — p. 1-16, note 2). Splitting them needs the Block 3 designator, which this
 * function is not given, so O-1/O-2 are treated as the LDO case and the non-LDO prohibition is
 * left explicitly unchecked rather than guessed at.
 */
const COMBINED_CAP_BY_PAYGRADE: Record<string, number | null> = {
  "E-1": null,
  "E-2": null,
  "E-3": null,
  "E-4": null,
  "E-5": 0.6,
  "E-6": 0.6,
  "E-7": 0.5,
  "E-8": 0.5,
  "E-9": 0.5,
  "W-1": null,
  "W-2": null,
  "W-3": 0.5,
  "W-4": 0.5,
  "W-5": 0.5,
  "O-1": null, // LDO reading — see note above
  "O-2": null, // LDO reading — see note above
  "O-3": 0.6,
  "O-4": 0.5,
  "O-5": 0.4,
  "O-6": 0.4,
};

export const OBSERVED_RECS = [
  "Significant Problems",
  "Progressing",
  "Promotable",
  "Must Promote",
  "Early Promote",
] as const;

export type ObservedRec = (typeof OBSERVED_RECS)[number];
export type RecDistribution = Record<ObservedRec, number>;

export function emptyDistribution(): RecDistribution {
  return {
    "Significant Problems": 0,
    Progressing: 0,
    Promotable: 0,
    "Must Promote": 0,
    "Early Promote": 0,
  };
}

/** Count a list of promotion_recommendation values into the 5 observed categories (NOB/blank excluded). */
export function tallyRecommendations(recs: Array<string | null | undefined>): {
  distribution: RecDistribution;
  observedCount: number;
} {
  const distribution = emptyDistribution();
  for (const r of recs) {
    if (r && (OBSERVED_RECS as readonly string[]).includes(r))
      distribution[r as ObservedRec]++;
  }
  const observedCount = OBSERVED_RECS.reduce((s, k) => s + distribution[k], 0);
  return { distribution, observedCount };
}

export interface ForcedDistributionViolation {
  category: "Early Promote" | "Must Promote (combined)";
  count: number;
  max: number;
  message: string;
}

export interface ForcedDistributionResult {
  distribution: RecDistribution;
  observedCount: number;
  paygrade: string | null;
  /** The band's combined cap as a fraction (0.6 / 0.5 / 0.4), or null for "No limit"/unknown grade. */
  combinedCapPct: number | null;
  earlyPromoteMax: number;
  /** EP+MP combined cap for this paygrade band; null when the band has no combined limit. */
  combinedMax: number | null;
  violations: ForcedDistributionViolation[];
  compliant: boolean;
}

/**
 * Apply the EVALMAN forced-distribution caps to a summary-group distribution. `grade` may be a rate
 * code ("PO1"), an explicit paygrade ("E-6"), etc. — it is normalized via paygradeOf().
 */
export function checkForcedDistribution(
  distribution: RecDistribution,
  grade?: string | null,
): ForcedDistributionResult {
  const observedCount = OBSERVED_RECS.reduce((s, k) => s + distribution[k], 0);
  const paygrade = paygradeOf(grade);
  // An unresolvable grade/rate yields no band, so no combined cap is asserted — we do not
  // guess a quota for a paygrade we could not identify.
  const combinedCapPct = paygrade
    ? (COMBINED_CAP_BY_PAYGRADE[paygrade] ?? null)
    : null;
  const ep = distribution["Early Promote"];
  const mp = distribution["Must Promote"];

  const earlyPromoteMax =
    observedCount > 0 ? Math.ceil(observedCount * 0.2) : 0;
  const combinedMax =
    combinedCapPct == null
      ? null
      : observedCount === 2
        ? 2 // Table 1-2 Note 1 — one Early Promote AND one Must Promote
        : Math.ceil(observedCount * combinedCapPct);

  const violations: ForcedDistributionViolation[] = [];
  if (ep > earlyPromoteMax) {
    violations.push({
      category: "Early Promote",
      count: ep,
      max: earlyPromoteMax,
      message: `Early Promote (${ep}) exceeds the limit of ${earlyPromoteMax} for a summary group of ${observedCount} (≤20%, BUPERSINST 1610.10H Table 1-2).`,
    });
  }
  if (combinedMax != null && ep + mp > combinedMax) {
    violations.push({
      category: "Must Promote (combined)",
      count: ep + mp,
      max: combinedMax,
      message: `Early Promote + Must Promote (${ep + mp}) exceeds the combined limit of ${combinedMax} for a ${paygrade} summary group of ${observedCount} (≤${Math.round(combinedCapPct! * 100)}%, BUPERSINST 1610.10H Table 1-2).`,
    });
  }

  return {
    distribution,
    observedCount,
    paygrade,
    combinedCapPct,
    earlyPromoteMax,
    combinedMax,
    violations,
    compliant: violations.length === 0,
  };
}
