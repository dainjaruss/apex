// lib/forcedDistribution.ts
//
// Block 46 (promotion-recommendation SUMMARY) tally + the EVALMAN forced-distribution caps.
//
// Block 46 (NAVPERS 1616/26): "Enter the number in this Service member's summary group who has
// received each promotion recommendation." Only the FIVE observed categories are counted — per
// BUPERSINST 1610.10H Table 1-3, "Do not include NOB promotion recommendations in a summary
// group," so NOB is never a count (the form's NOB cell is a fixed X).
//
// Forced distribution (BUPERSINST 1610.10H Enclosure (2), pp.1-16/1-17, Table 1-2):
//   • Early Promote ≤ ceil(0.20 · N)            — all E1–E6
//   • Early Promote + Must Promote ≤ ceil(0.60 · N) — E5–E6 ONLY (E1–E4 have no Must-Promote limit)
//   • Promotable is NOT capped for enlisted.
//   • N = the OBSERVED (non-NOB) summary-group size. "Round up to the nearest whole number."
// The two inequalities reproduce Table 1-2 exactly (MP max = combined − EP, and MP may rise by one
// for each unused EP quota — both captured by the combined cap).

import { paygradeOf } from "./paygrade";

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
  isE5E6: boolean;
  earlyPromoteMax: number;
  combinedMax: number | null; // EP+MP combined cap (E5–E6 only); null when no combined limit applies
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
  const isE5E6 = paygrade === "E-5" || paygrade === "E-6";
  const ep = distribution["Early Promote"];
  const mp = distribution["Must Promote"];

  const earlyPromoteMax =
    observedCount > 0 ? Math.ceil(observedCount * 0.2) : 0;
  const combinedMax = isE5E6
    ? observedCount > 0
      ? Math.ceil(observedCount * 0.6)
      : 0
    : null;

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
      message: `Early Promote + Must Promote (${ep + mp}) exceeds the combined limit of ${combinedMax} for an E5–E6 summary group of ${observedCount} (≤60%, BUPERSINST 1610.10H Table 1-2).`,
    });
  }

  return {
    distribution,
    observedCount,
    paygrade,
    isE5E6,
    earlyPromoteMax,
    combinedMax,
    violations,
    compliant: violations.length === 0,
  };
}
