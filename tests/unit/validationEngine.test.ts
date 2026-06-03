import { describe, it, expect } from 'vitest'
import { runFullValidation, generateErrorReport, getBlockForField } from '../../lib/validationEngine'
import { Evaluation } from '../../types'

const mockValidEvaluation: Evaluation = {
  id: 'test-eval-id',
  created_by: 'test-user-id',
  form_definition_id: 'EVAL',
  report_type: 'EVAL',
  member_name: 'DOE, JOHN A',
  dod_id: '1234567890',
  grade_rate: 'PO2',
  designator: '1110',
  period_from: '2025-01-01',
  period_to: '2025-12-31',
  duty_status: 'ACDU',
  uic: '12345',
  ship_station: 'USS NEVERSAIL',
  promotion_status: 'Regular',
  trait_grades: {
    knowledge: '4.0',
    work: '4.0',
    eo: '4.0',
    bearing: '4.0',
    accomplishment: '4.0',
    teamwork: '4.0',
    leadership: '4.0',
  },
  comments: 'PO2 DOE HAS PERFORMED OUTSTANDING DUTIES THROUGHOUT THIS CYCLE.',
  career_recommendations: ['NAVY RECRUITER', 'LPO'],
  promotion_recommendation: 'Must Promote',
  retention: 'Recommended',
  status: 'draft',
  block_values: {
    physical_readiness: 'P/P',
    reporting_senior_name: 'SMITH, ALAN J',
    reporting_senior_grade: 'CDR',
    reporting_senior_designator: '1110',
    reporting_senior_title: 'COMMANDING OFFICER',
    reporting_senior_uic: '12345',
    command_achievements: 'LEAD LPO',
    primary_duties: 'DIVISION LEAD',
    date_counseled: '25JAN15',
    counselor: 'SMITH, ALAN J',
    comment_pitch: '10',
    billet_subcategory: 'NA',
  }
}

describe('APEX Validation Engine Unit Tests', () => {
  it('should map form fields to their correct NAVPERS block numbers', () => {
    expect(getBlockForField('member_name')).toBe(1)
    expect(getBlockForField('dod_id')).toBe(4)
    expect(getBlockForField('comments')).toBe(43)
    expect(getBlockForField('promotion_recommendation')).toBe(45)
    expect(getBlockForField('non_existent_field')).toBeUndefined()
  })

  it('should pass validation for a perfectly formatted evaluation report', () => {
    const result = runFullValidation(mockValidEvaluation)
    expect(result.success).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('should flag errors for invalid administrative details', () => {
    const invalidAdmin = {
      ...mockValidEvaluation,
      member_name: 'John Doe', // Invalid format
      dod_id: '12345', // Must be 10 digits
      uic: 'ABC', // Must be 5 characters
    }

    const result = runFullValidation(invalidAdmin)
    expect(result.success).toBe(false)
    expect(result.errors.some(e => e.field === 'member_name')).toBe(true)
    expect(result.errors.some(e => e.field === 'dod_id')).toBe(true)
    expect(result.errors.some(e => e.field === 'uic')).toBe(true)
  })

  it('should restrict promotion recommendation if a trait grade is 1.0', () => {
    const poorTrait = {
      ...mockValidEvaluation,
      trait_grades: {
        ...mockValidEvaluation.trait_grades,
        work: '1.0',
      },
      promotion_recommendation: 'Must Promote', // Disallowed by 1.0 trait grade rules
    }

    const result = runFullValidation(poorTrait)
    expect(result.success).toBe(false)
    expect(result.errors.some(e => e.field === 'promotion_recommendation')).toBe(true)
  })

  it('should restrict promotion recommendation if Command Climate/EO is 2.0', () => {
    const poorClimate = {
      ...mockValidEvaluation,
      trait_grades: {
        ...mockValidEvaluation.trait_grades,
        eo: '2.0',
      },
      promotion_recommendation: 'Promotable', // Disallowed (limits to Progressing or lower)
    }

    const result = runFullValidation(poorClimate)
    expect(result.success).toBe(false)
    expect(result.errors.some(e => e.field === 'promotion_recommendation')).toBe(true)
  })

  it('should flag an error if Block 43 comments exceed physical monospace box capacity', () => {
    const overflowComments = {
      ...mockValidEvaluation,
      // 20 lines of comments exceeds the 18 line max box capacity
      comments: Array(20).fill('THIS LINE FITS WITHIN MONOSPACE WIDTH.').join('\n')
    }

    const result = runFullValidation(overflowComments)
    expect(result.success).toBe(false)
    expect(result.errors.some(e => e.field === 'comments')).toBe(true)
  })

  it('should trigger warnings for missing optional but recommended fields', () => {
    const missingOptional = {
      ...mockValidEvaluation,
      designator: '',
      block_values: {
        ...mockValidEvaluation.block_values,
        billet_subcategory: '',
      }
    }

    const result = runFullValidation(missingOptional)
    expect(result.success).toBe(true) // Success is true because they are warnings, not blocker errors
    expect(result.errors).toHaveLength(0)
    expect(result.warnings.some(w => w.field === 'designator')).toBe(true)
    expect(result.warnings.some(w => w.field === 'billet_subcategory')).toBe(true)
  })

  it('should output a clean text report from generateErrorReport', () => {
    const result = runFullValidation(mockValidEvaluation)
    const emptyReport = generateErrorReport(result)
    expect(emptyReport).toContain('Validation Complete')

    const badDataResult = runFullValidation({
      ...mockValidEvaluation,
      dod_id: '12345'
    })
    const errorReport = generateErrorReport(badDataResult)
    expect(errorReport).toContain('Validation Errors')
    expect(errorReport).toContain('Block 4')
  })
})
