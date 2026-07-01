import { describe, it, expect } from 'vitest'
import { isEvalEligibleForSummaryGroup, visibleSummaryGroupsForEval } from '@/lib/summaryGroupEligibility'
import { SummaryGroupWithRs } from '@/lib/summaryGroupEligibility'

const baseEval = {
  grade_rate: 'PO2',
  promotion_status: 'Regular',
  period_to: '2025-12-31',
  report_type: 'EVAL' as const,
  uic: '12345',
  summary_group_id: null as string | null,
  block_values: { reporting_senior_dod_id: '4567890123' },
}

const matchingGroup: SummaryGroupWithRs = {
  id: 'g1',
  name: 'E-5 Regular FY25',
  reporting_senior_id: 'rs-1',
  period_to: '2025-12-31',
  grade_rate: 'PO2',
  promotion_status: 'Regular',
  command_employment: 'LEAD LPO',
  report_type: 'EVAL',
  status: 'open',
  reporting_senior_dod_id: '4567890123',
}

describe('isEvalEligibleForSummaryGroup', () => {
  it('accepts a group that matches all BUPERS shared fields', () => {
    expect(isEvalEligibleForSummaryGroup(baseEval, matchingGroup)).toBe(true)
  })

  it('rejects a group for a different paygrade (PO2 vs PO1)', () => {
    expect(isEvalEligibleForSummaryGroup(baseEval, { ...matchingGroup, id: 'g2', grade_rate: 'PO1' })).toBe(false)
  })

  it('rejects a group with different promotion status', () => {
    expect(isEvalEligibleForSummaryGroup(baseEval, { ...matchingGroup, id: 'g3', promotion_status: 'Frocked' })).toBe(false)
  })

  it('rejects a group with a different ending date', () => {
    expect(isEvalEligibleForSummaryGroup(baseEval, { ...matchingGroup, id: 'g4', period_to: '2024-12-31' })).toBe(false)
  })

  it('rejects a group for a different reporting senior', () => {
    expect(isEvalEligibleForSummaryGroup(baseEval, { ...matchingGroup, id: 'g5', reporting_senior_dod_id: '9999999999' })).toBe(false)
  })

  it('rejects closed groups unless already attached', () => {
    expect(isEvalEligibleForSummaryGroup(baseEval, { ...matchingGroup, status: 'closed' })).toBe(false)
    expect(isEvalEligibleForSummaryGroup(
      { ...baseEval, summary_group_id: 'g1' },
      { ...matchingGroup, status: 'closed' },
    )).toBe(true)
  })

  it('filters UIC when the group specifies a breakout UIC', () => {
    expect(isEvalEligibleForSummaryGroup(baseEval, { ...matchingGroup, id: 'g6', uic: '12345' })).toBe(true)
    expect(isEvalEligibleForSummaryGroup(baseEval, { ...matchingGroup, id: 'g7', uic: '99999' })).toBe(false)
  })
})

describe('visibleSummaryGroupsForEval', () => {
  it('returns only eligible open groups for PO2 Doe', () => {
    const groups: SummaryGroupWithRs[] = [
      matchingGroup,
      { ...matchingGroup, id: 'g-wrong-pg', grade_rate: 'PO1' },
      { ...matchingGroup, id: 'g-wrong-date', period_to: '2024-12-31' },
    ]
    const visible = visibleSummaryGroupsForEval(baseEval, groups)
    expect(visible.map((g) => g.id)).toEqual(['g1'])
  })
})
