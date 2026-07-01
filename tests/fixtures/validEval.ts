import { Evaluation } from '@/types'

export const FORM_DEFINITION_ID = 'e1616260-cafe-4b08-9df2-5d8f28d8b4cd'

/** BUPERS-valid EVAL payload shared by unit tests, seed script, and Playwright E2E. */
export function buildValidEval(overrides: Partial<Evaluation> = {}): Partial<Evaluation> {
  return {
    form_definition_id: FORM_DEFINITION_ID,
    report_type: 'EVAL',
    member_name: 'DOE, JOHN A',
    dod_id: '1234567890',
    grade_rate: 'PO2',
    designator: '1110',
    period_from: '2025-01-01',
    period_to: '2025-12-31',
    duty_status: 'ACT',
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
    trait_average: 4.0,
    comments: 'PO2 DOE HAS PERFORMED OUTSTANDING DUTIES THROUGHOUT THIS CYCLE.',
    career_recommendations: ['NAVY RECRUITER', 'LPO'],
    promotion_recommendation: 'Must Promote',
    retention: 'Recommended',
    status: 'draft',
    block_values: {
      physical_readiness: 'PPP',
      date_reported: '2024-01-15',
      periodic: true,
      regular_report: true,
      reporting_senior_name: 'JONES, C R',
      reporting_senior_grade: 'CDR',
      reporting_senior_designator: '1110',
      reporting_senior_title: 'CO',
      reporting_senior_uic: '12345',
      reporting_senior_dod_id: '0987654321',
      command_achievements: 'LEAD LPO',
      primary_duties: 'DIVISION LEAD',
      date_counseled: '25JAN15',
      counselor: 'JONES, C R',
      comment_pitch: '10',
      billet_subcategory: 'NA',
    },
    ...overrides,
  }
}
