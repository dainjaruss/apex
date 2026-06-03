// lib/validationEngine.ts
//
// Core validation engine for executing complete, structured rules check
// on NAVPERS 1616/26 (EVAL) forms according to BUPERSINST 1610.10H.
//

import { Evaluation, ValidationIssue, ValidationResult } from '../types'
import { EvalSchema } from '../types/navpers'
import { checkCommentFit } from './commentFit'

// Static lookup table mapping field names to NAVPERS block numbers
const fieldBlockMap: Record<string, number> = {
  member_name: 1,
  grade_rate: 2,
  designator: 3,
  dod_id: 4,
  duty_status: 5,
  uic: 6,
  ship_station: 7,
  promotion_status: 8,
  period_from: 14,
  period_to: 15,
  physical_readiness: 20,
  billet_subcategory: 21,
  reporting_senior_name: 22,
  reporting_senior_grade: 23,
  reporting_senior_designator: 24,
  reporting_senior_title: 25,
  reporting_senior_uic: 26,
  command_achievements: 28,
  primary_duties: 29,
  date_counseled: 30,
  counselor: 31,
  career_recommendations: 41,
  comments: 43,
  promotion_recommendation: 45,
  retention: 47,
}

/**
 * Maps a Zod schema path string to the corresponding official NAVPERS 1616/26 block number.
 */
export function getBlockForField(field: string): number | undefined {
  if (field.startsWith('trait_grades')) {
    return 33
  }
  return fieldBlockMap[field]
}

/**
 * Runs complete validation checks against the evaluation record.
 */
// fallow-ignore-next-line complexity
export function runFullValidation(evalData: Evaluation): ValidationResult {
  const errors: ValidationIssue[] = []
  const warnings: ValidationIssue[] = []

  // 1. Map current evaluation object to the shape required by Zod schema
  const validationPayload = {
    member_name: evalData.member_name || '',
    grade_rate: evalData.grade_rate || '',
    designator: evalData.designator || '',
    dod_id: evalData.dod_id || '',
    duty_status: evalData.duty_status || '',
    uic: evalData.uic || '',
    ship_station: evalData.ship_station || '',
    promotion_status: evalData.promotion_status || '',
    period_from: evalData.period_from || '',
    period_to: evalData.period_to || '',
    physical_readiness: evalData.block_values?.physical_readiness || '',
    reporting_senior_name: evalData.block_values?.reporting_senior_name || '',
    reporting_senior_grade: evalData.block_values?.reporting_senior_grade || '',
    reporting_senior_designator: evalData.block_values?.reporting_senior_designator || '',
    reporting_senior_title: evalData.block_values?.reporting_senior_title || '',
    reporting_senior_uic: evalData.block_values?.reporting_senior_uic || '',
    command_achievements: evalData.block_values?.command_achievements || '',
    primary_duties: evalData.block_values?.primary_duties || '',
    date_counseled: evalData.block_values?.date_counseled || '',
    counselor: evalData.block_values?.counselor || '',
    trait_grades: {
      knowledge: evalData.trait_grades?.knowledge || '3.0',
      work: evalData.trait_grades?.work || '3.0',
      eo: evalData.trait_grades?.eo || '3.0',
      bearing: evalData.trait_grades?.bearing || '3.0',
      accomplishment: evalData.trait_grades?.accomplishment || '3.0',
      teamwork: evalData.trait_grades?.teamwork || '3.0',
      leadership: evalData.trait_grades?.leadership || '3.0',
    },
    comments: evalData.comments || '',
    career_recommendations: (evalData.career_recommendations || []).filter((r) => r !== ''),
    promotion_recommendation: evalData.promotion_recommendation || 'Promotable',
    retention: evalData.retention || 'Recommended',
  }

  // 2. Parse payload using the Zod schema
  const parsed = EvalSchema.safeParse(validationPayload)
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors
    Object.entries(fieldErrors).forEach(([field, messages]) => {
      if (messages && messages.length > 0) {
        errors.push({
          field,
          block: getBlockForField(field),
          message: messages[0],
          severity: 'error',
        })
      }
    })
  }

  // 3. Courier narrative comment fit/overflow check (Block 43)
  const pitch = evalData.block_values?.comment_pitch || '10'
  const fitResult = checkCommentFit(evalData.comments || '', pitch)
  if (!fitResult.fit) {
    errors.push({
      field: 'comments',
      block: 43,
      message: `Comment text exceeds maximum physical box capacity of ${fitResult.maxLines} lines (currently wrapped to ${fitResult.linesUsed} lines at ${pitch}-pitch).`,
      severity: 'error',
    })
  }

  // 4. Policy warnings / Soft Checks (e.g. blank optional fields or future reminders)
  // Let's check for optional but highly recommended fields to yield warnings
  if (!evalData.designator && evalData.report_type === 'EVAL') {
    warnings.push({
      field: 'designator',
      block: 3,
      message: 'Designator/Warfare Qual is empty. Ensure this is intentional.',
      severity: 'warning',
    })
  }

  if (!evalData.block_values?.billet_subcategory) {
    warnings.push({
      field: 'billet_subcategory',
      block: 21,
      message: 'Billet Subcategory (Block 21) is empty. Defaulting to NA is common practice.',
      severity: 'warning',
    })
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Formats a validation result into a readable plain-text report.
 */
export function generateErrorReport(result: ValidationResult): string {
  if (result.success && result.warnings.length === 0) {
    return '✓ Validation Complete: All rules satisfied. Ready for final export.'
  }

  const lines: string[] = []

  if (result.errors.length > 0) {
    lines.push(`=== Validation Errors (${result.errors.length}) ===`)
    result.errors.forEach((err) => {
      const blockStr = err.block ? `[Block ${err.block}]` : '[General]'
      lines.push(`  • ${blockStr} ${err.message}`)
    })
  }

  if (result.warnings.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push(`=== Validation Warnings (${result.warnings.length}) ===`)
    result.warnings.forEach((warn) => {
      const blockStr = warn.block ? `[Block ${warn.block}]` : '[General]'
      lines.push(`  • ${blockStr} ${warn.message}`)
    })
  }

  return lines.join('\n')
}
