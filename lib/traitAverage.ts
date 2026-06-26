// lib/traitAverage.ts
//
// Authoritative trait-average math for NAVPERS 1616/26. Block 40 (individual trait
// average) and the summary group average (printed in the Block 50 cell) are how sailors
// get compared, so the calculation is centralized here and reused by the UI, the PDF
// renderer, and any server-side aggregation — never re-derived inline.

export const TRAIT_KEYS = [
  'knowledge',
  'work',
  'eo',
  'bearing',
  'accomplishment',
  'teamwork',
  'leadership',
] as const

export interface TraitAverageResult {
  average: number | null // null when no traits are graded (e.g. a fully NOB report)
  gradedCount: number // traits that counted toward the average
  gradedSum: number // sum of the graded trait scores (feeds the pooled group average)
}

// Round half-up to 2 decimals, matching the printed form's X.XX precision.
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

// Block 40: total of the graded trait scores divided by the number of graded traits. A
// trait left blank or marked NOB ("not observed") is excluded from BOTH the sum and the
// count (BUPERSINST 1610.10H).
export function computeTraitAverage(
  traitGrades: Record<string, string | undefined> | null | undefined,
): TraitAverageResult {
  const grades = traitGrades || {}
  let sum = 0
  let count = 0
  for (const key of TRAIT_KEYS) {
    const g = grades[key]
    if (!g || g.toUpperCase() === 'NOB') continue
    const v = parseFloat(g)
    if (!Number.isNaN(v)) {
      sum += v
      count++
    }
  }
  return count === 0
    ? { average: null, gradedCount: 0, gradedSum: 0 }
    : { average: round2(sum / count), gradedCount: count, gradedSum: sum }
}

export interface SummaryGroupAverageResult {
  average: number | null
  memberCount: number // members contributing at least one graded trait
  gradedTraitCount: number // total graded traits pooled across the group
}

// Summary group average (BUPERSINST 1610.10H, Exhibit 1-2 / 1-6): "sum all graded
// Individual Trait Grades (Blocks 33-39) and then divide by the number of graded
// Individual Traits." This is a POOLED average of every graded trait across every report
// in the group — NOT an average of the members' individual averages — so a member with
// more graded traits weighs proportionally more. NOB traits are excluded from both the
// sum and the count; a wholly-NOB report contributes nothing and is left blank.
export function computeSummaryGroupAverage(
  memberGrades: Array<Record<string, string | undefined> | null | undefined>,
): SummaryGroupAverageResult {
  let totalSum = 0
  let totalCount = 0
  let memberCount = 0
  for (const grades of memberGrades) {
    const { gradedSum, gradedCount } = computeTraitAverage(grades)
    if (gradedCount > 0) {
      totalSum += gradedSum
      totalCount += gradedCount
      memberCount++
    }
  }
  return totalCount === 0
    ? { average: null, memberCount: 0, gradedTraitCount: 0 }
    : { average: round2(totalSum / totalCount), memberCount, gradedTraitCount: totalCount }
}
