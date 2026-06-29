// tests/unit/forcedDistribution.test.ts
import { describe, it, expect } from 'vitest'
import {
  tallyRecommendations,
  checkForcedDistribution,
  emptyDistribution,
} from '@/lib/forcedDistribution'

describe('tallyRecommendations (Block 46 counts)', () => {
  it('counts the five observed categories and excludes NOB/blank', () => {
    const { distribution, observedCount } = tallyRecommendations([
      'Promotable', 'Promotable', 'Early Promote', 'Must Promote', 'NOB', null, undefined, '',
    ])
    expect(distribution['Promotable']).toBe(2)
    expect(distribution['Early Promote']).toBe(1)
    expect(distribution['Must Promote']).toBe(1)
    expect(observedCount).toBe(4) // the NOB / blanks do not count toward the summary group
  })

  it('starts from an all-zero distribution', () => {
    expect(emptyDistribution()).toEqual({
      'Significant Problems': 0, Progressing: 0, Promotable: 0, 'Must Promote': 0, 'Early Promote': 0,
    })
  })
})

describe('checkForcedDistribution — Early Promote ≤ 20% (all E1–E6, rounded up)', () => {
  const dist = (ep: number, mp = 0, observedFiller = 0) => ({
    'Significant Problems': 0, Progressing: observedFiller, Promotable: 0, 'Must Promote': mp, 'Early Promote': ep,
  })

  it('rounds the EP cap UP (3-person group allows 1 EP, not 0)', () => {
    // N=3 → ceil(0.20*3)=1
    expect(checkForcedDistribution(dist(1, 0, 2), 'PO1').earlyPromoteMax).toBe(1)
    expect(checkForcedDistribution(dist(1, 0, 2), 'PO1').compliant).toBe(true)
    expect(checkForcedDistribution(dist(2, 0, 1), 'PO1').compliant).toBe(false) // 2 EP in a group of 3
  })

  it('applies the EP cap to E1–E4 as well (rate SN = E-3)', () => {
    // N=5, EP max = ceil(1.0) = 1
    expect(checkForcedDistribution(dist(2, 0, 3), 'SN').compliant).toBe(false)
    expect(checkForcedDistribution(dist(1, 0, 4), 'SN').compliant).toBe(true)
  })
})

describe('checkForcedDistribution — EP+MP combined ≤ 60% (E5–E6 only)', () => {
  it('reproduces Table 1-2 maxima for E5–E6', () => {
    const cases: Array<[number, number, number]> = [
      // [observedCount, expectedEPmax, expectedCombinedMax]
      [1, 1, 1], [2, 1, 2], [3, 1, 2], [4, 1, 3], [5, 1, 3],
      [6, 2, 4], [10, 2, 6], [20, 4, 12], [30, 6, 18], [42, 9, 26],
    ]
    for (const [n, epMax, combinedMax] of cases) {
      const r = checkForcedDistribution(
        { 'Significant Problems': 0, Progressing: n, Promotable: 0, 'Must Promote': 0, 'Early Promote': 0 },
        'PO1', // E-6
      )
      expect(r.observedCount).toBe(n)
      expect(r.earlyPromoteMax).toBe(epMax)
      expect(r.combinedMax).toBe(combinedMax)
      // Table 1-2 Must-Promote max = combined − EP
      expect((r.combinedMax as number) - r.earlyPromoteMax).toBe(combinedMax - epMax)
    }
  })

  it('flags an over-cap combined EP+MP for E5–E6', () => {
    // N=5 → EP max 1, combined max 3. 1 EP + 3 MP = 4 > 3 → violation.
    const r = checkForcedDistribution(
      { 'Significant Problems': 0, Progressing: 1, Promotable: 0, 'Must Promote': 3, 'Early Promote': 1 },
      'PO1',
    )
    expect(r.compliant).toBe(false)
    expect(r.violations.some((v) => v.category === 'Must Promote (combined)')).toBe(true)
  })

  it('does NOT apply a Must-Promote/combined cap to E1–E4', () => {
    // E-4 (PO3) group of 5: 5 Must Promote is allowed (no MP limit); only EP is capped.
    const r = checkForcedDistribution(
      { 'Significant Problems': 0, Progressing: 0, Promotable: 0, 'Must Promote': 5, 'Early Promote': 0 },
      'PO3',
    )
    expect(r.isE5E6).toBe(false)
    expect(r.combinedMax).toBeNull()
    expect(r.compliant).toBe(true)
  })

  it('never caps Promotable (no enlisted Promotable limit)', () => {
    const r = checkForcedDistribution(
      { 'Significant Problems': 0, Progressing: 0, Promotable: 10, 'Must Promote': 0, 'Early Promote': 0 },
      'PO1',
    )
    expect(r.compliant).toBe(true)
  })
})
