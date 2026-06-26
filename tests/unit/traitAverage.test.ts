import { describe, it, expect } from 'vitest'
import { computeTraitAverage, computeSummaryGroupAverage } from '../../lib/traitAverage'

describe('computeTraitAverage (Block 40)', () => {
  it('averages all seven graded traits', () => {
    const r = computeTraitAverage({
      knowledge: '4.0', work: '4.0', eo: '4.0', bearing: '4.0',
      accomplishment: '4.0', teamwork: '4.0', leadership: '4.0',
    })
    expect(r.average).toBe(4.0)
    expect(r.gradedCount).toBe(7)
  })

  it('excludes NOB traits from both the sum and the count', () => {
    // six 3.0s + one NOB -> 18 / 6 = 3.00, not 18 / 7
    const r = computeTraitAverage({
      knowledge: '3.0', work: '3.0', eo: '3.0', bearing: '3.0',
      accomplishment: '3.0', teamwork: '3.0', leadership: 'NOB',
    })
    expect(r.average).toBe(3.0)
    expect(r.gradedCount).toBe(6)
  })

  it('rounds to two decimals', () => {
    // 3.0,3.0,4.0,4.0,5.0,5.0,5.0 = 29 / 7 = 4.142857 -> 4.14
    const r = computeTraitAverage({
      knowledge: '3.0', work: '3.0', eo: '4.0', bearing: '4.0',
      accomplishment: '5.0', teamwork: '5.0', leadership: '5.0',
    })
    expect(r.average).toBe(4.14)
    expect(r.gradedCount).toBe(7)
  })

  it('returns a null average for a fully NOB / empty report', () => {
    expect(computeTraitAverage({
      knowledge: 'NOB', work: 'NOB', eo: 'NOB', bearing: 'NOB',
      accomplishment: 'NOB', teamwork: 'NOB', leadership: 'NOB',
    })).toEqual({ average: null, gradedCount: 0, gradedSum: 0 })
    expect(computeTraitAverage(undefined)).toEqual({ average: null, gradedCount: 0, gradedSum: 0 })
  })
})

// EVALMAN (Exhibit 1-2/1-6): the summary group average is a POOLED average — sum every
// graded trait grade across all reports, divide by the total number of graded traits —
// NOT an average of the members' individual averages.
describe('computeSummaryGroupAverage (Block 50 — pooled across the group)', () => {
  const sevenOf = (g: string) => ({
    knowledge: g, work: g, eo: g, bearing: g, accomplishment: g, teamwork: g, leadership: g,
  })

  it('pools all graded trait grades across members', () => {
    // member A: 7×4.0 (sum 28); member B: 7×2.0 (sum 14) -> 42 / 14 = 3.00
    const r = computeSummaryGroupAverage([sevenOf('4.0'), sevenOf('2.0')])
    expect(r.average).toBe(3.0)
    expect(r.memberCount).toBe(2)
    expect(r.gradedTraitCount).toBe(14)
  })

  it('weights members with more graded traits (differs from an average-of-averages)', () => {
    // A: 7×5.0 (sum 35, count 7); B: one 1.0 + six NOB (sum 1, count 1) -> 36 / 8 = 4.50
    // (an average-of-averages would wrongly give (5.0 + 1.0) / 2 = 3.00)
    const memberB = {
      knowledge: '1.0', work: 'NOB', eo: 'NOB', bearing: 'NOB',
      accomplishment: 'NOB', teamwork: 'NOB', leadership: 'NOB',
    }
    const r = computeSummaryGroupAverage([sevenOf('5.0'), memberB])
    expect(r.average).toBe(4.5)
    expect(r.gradedTraitCount).toBe(8)
    expect(r.memberCount).toBe(2)
  })

  it('excludes wholly-NOB reports from the group entirely', () => {
    const r = computeSummaryGroupAverage([sevenOf('4.0'), sevenOf('NOB')])
    expect(r.average).toBe(4.0) // only member A contributes
    expect(r.memberCount).toBe(1)
    expect(r.gradedTraitCount).toBe(7)
  })

  it('returns null when the group has no graded traits', () => {
    expect(computeSummaryGroupAverage([])).toEqual({ average: null, memberCount: 0, gradedTraitCount: 0 })
    expect(computeSummaryGroupAverage([null, undefined, sevenOf('NOB')]))
      .toEqual({ average: null, memberCount: 0, gradedTraitCount: 0 })
  })
})
