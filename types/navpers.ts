// types/navpers.ts
//
// Zod schemas and validation rules for NAVPERS 1616/26.
//

import { z } from 'zod'

// fallow-ignore-next-line unused-export
export const TRAIT_KEYS = [
  'knowledge',
  'work',
  'eo',
  'bearing',
  'accomplishment',
  'teamwork',
  'leadership'
] as const;

// fallow-ignore-next-line unused-type
export type TraitGrade = '1.0' | '2.0' | '3.0' | '4.0' | '5.0' | 'NOB';

export const PROMOTION_RECOMMENDATIONS = [
  'Significant Problems',
  'Progressing',
  'Promotable',
  'Must Promote',
  'Early Promote',
  'NOB'
] as const;

export const RETENTION_OPTIONS = ['Recommended', 'Not Recommended'] as const;

export const DUTY_STATUS_OPTIONS = ['ACDU', 'TAR', 'INACT', 'AT/ADOS'] as const;

export const PROMOTION_STATUS_OPTIONS = ['Regular', 'Frocked', 'Selected', 'Spot'] as const;

// Helper to validate Navy dates in YYMMMDD format (e.g. 25JAN15)
// fallow-ignore-next-line unused-export
export const NAVY_DATE_REGEX = /^[0-9]{2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[0-9]{2}$/i;

export const EvalSchema = z.object({
  member_name: z
    .string()
    .min(1, 'Name is required (Block 1)')
    .regex(/^[^,]+,\s*[^,]+$/, 'Name must be in LAST, FIRST MI format (Block 1)'),

  grade_rate: z
    .string()
    .min(1, 'Grade/Rate is required (Block 2)'),

  designator: z
    .string()
    .optional(),

  dod_id: z
    .string()
    .regex(/^[0-9]{10}$/, 'DoD ID must be exactly 10 digits (Block 4)'),

  duty_status: z
    .string()
    .min(1, 'Duty status is required (Block 5)'),

  uic: z
    .string()
    .length(5, 'UIC must be exactly 5 characters (Block 6)'),

  ship_station: z
    .string()
    .min(1, 'Ship/Station is required (Block 7)'),

  promotion_status: z
    .string()
    .min(1, 'Promotion status is required (Block 8)'),

  period_from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Period From must be a valid date YYYY-MM-DD (Block 14)'),

  period_to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Period To must be a valid date YYYY-MM-DD (Block 15)'),

  physical_readiness: z
    .string()
    .min(1, 'Physical readiness cycle results are required (Block 20)'),

  billet_subcategory: z
    .string()
    .optional(),

  reporting_senior_name: z
    .string()
    .min(1, 'Reporting Senior name is required (Block 22)'),

  reporting_senior_grade: z
    .string()
    .min(1, 'Reporting Senior grade is required (Block 23)'),

  reporting_senior_designator: z
    .string()
    .optional(),

  reporting_senior_title: z
    .string()
    .min(1, 'Reporting Senior title is required (Block 25)'),

  reporting_senior_uic: z
    .string()
    .length(5, 'Reporting Senior UIC must be exactly 5 characters (Block 26)'),

  command_achievements: z
    .string()
    .min(1, 'Command Employment and achievements are required (Block 28)'),

  primary_duties: z
    .string()
    .min(1, 'Primary/Collateral/Watchstanding duties are required (Block 29)'),

  date_counseled: z
    .string()
    .min(1, 'Date Counseled is required (Block 30)'),

  counselor: z
    .string()
    .min(1, 'Counselor is required (Block 31)'),

  trait_grades: z.object({
    knowledge: z.enum(['1.0', '2.0', '3.0', '4.0', '5.0', 'NOB']),
    work: z.enum(['1.0', '2.0', '3.0', '4.0', '5.0', 'NOB']),
    eo: z.enum(['1.0', '2.0', '3.0', '4.0', '5.0', 'NOB']),
    bearing: z.enum(['1.0', '2.0', '3.0', '4.0', '5.0', 'NOB']),
    accomplishment: z.enum(['1.0', '2.0', '3.0', '4.0', '5.0', 'NOB']),
    teamwork: z.enum(['1.0', '2.0', '3.0', '4.0', '5.0', 'NOB']),
    leadership: z.enum(['1.0', '2.0', '3.0', '4.0', '5.0', 'NOB']),
  }),

  comments: z
    .string()
    .min(1, 'Comments on performance are required (Block 43)'),

  career_recommendations: z
    .array(z.string())
    .min(1, 'At least one career recommendation is required (Block 41)'),

  promotion_recommendation: z
    .enum(PROMOTION_RECOMMENDATIONS, {
      errorMap: () => ({ message: 'Invalid promotion recommendation (Block 45)' })
    }),

  retention: z
    .enum(RETENTION_OPTIONS, {
      errorMap: () => ({ message: 'Invalid retention recommendation (Block 47)' })
    }),
// fallow-ignore-next-line complexity
}).superRefine((data, ctx) => {
  // Validate period bounds
  const from = new Date(data.period_from);
  const to = new Date(data.period_to);
  if (!isNaN(from.getTime()) && !isNaN(to.getTime()) && from > to) {
    ctx.addIssue({
      path: ['period_to'],
      code: z.ZodIssueCode.custom,
      message: 'Period To cannot be before Period From (Block 14/15)',
    });
  }

  // Validate Date Counseled formatting
  const dcUpper = data.date_counseled.toUpperCase();
  if (dcUpper !== 'NOT REQ' && dcUpper !== 'NOT PERF' && !NAVY_DATE_REGEX.test(data.date_counseled)) {
    ctx.addIssue({
      path: ['date_counseled'],
      code: z.ZodIssueCode.custom,
      message: 'Date Counseled must be in YYMMMDD format, NOT REQ, or NOT PERF (Block 30)',
    });
  }

  // Trait rating promotion restriction policies
  const rec = data.promotion_recommendation;
  if (rec === 'NOB') return; // NOB bypasses standard trait checking

  const eoNum = parseFloat(data.trait_grades.eo);
  const bearingNum = parseFloat(data.trait_grades.bearing);

  const numericGrades = Object.values(data.trait_grades)
    .map(g => parseFloat(g))
    .filter(g => !isNaN(g));

  const has1 = numericGrades.some(g => g === 1.0);
  const has2 = numericGrades.some(g => g === 2.0);

  // 1. Grade of 1.0 in any trait -> recommendation must be Progressing or Significant Problems (below Promotable)
  if (has1 && ['Promotable', 'Must Promote', 'Early Promote'].includes(rec)) {
    ctx.addIssue({
      path: ['promotion_recommendation'],
      code: z.ZodIssueCode.custom,
      message: 'A trait grade of 1.0 limits the promotion recommendation to Progressing or Significant Problems.',
    });
  }

  // 2. Grade of 2.0 in any trait -> recommendation must be Promotable or lower (bars Must/Early Promote)
  if (has2 && ['Must Promote', 'Early Promote'].includes(rec)) {
    ctx.addIssue({
      path: ['promotion_recommendation'],
      code: z.ZodIssueCode.custom,
      message: 'A trait grade of 2.0 limits the promotion recommendation to Promotable or lower.',
    });
  }

  // 3. Grade of 2.0 or lower in EO (Block 35) or Bearing/Character (Block 36) -> bars Promotable or higher (requires Progressing or below)
  if ((eoNum <= 2.0 || bearingNum <= 2.0) && ['Promotable', 'Must Promote', 'Early Promote'].includes(rec)) {
    ctx.addIssue({
      path: ['promotion_recommendation'],
      code: z.ZodIssueCode.custom,
      message: 'A trait grade of 2.0 or lower in Command Climate/EO or Bearing/Character limits recommendation to Progressing or Significant Problems.',
    });
  }

  // 4. EO (Block 35) at < 3.0 -> member is ineligible for Promotable or higher (bars Promotable or higher)
  if (eoNum < 3.0 && ['Promotable', 'Must Promote', 'Early Promote'].includes(rec)) {
    ctx.addIssue({
      path: ['promotion_recommendation'],
      code: z.ZodIssueCode.custom,
      message: 'Command Climate/EO grade must be 3.0 or higher for Promotable, Must Promote, or Early Promote.',
    });
  }
});
