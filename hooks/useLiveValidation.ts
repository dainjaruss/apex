// hooks/useLiveValidation.ts
//
// Dynamic React hook executing live, in-form validation schema evaluations.
//

import { useState, useEffect } from 'react'
import { EvalSchema } from '@/types/navpers'
import { checkCommentFit } from '@/lib/commentFit'
import { Evaluation, ValidationIssue } from '@/types'

/**
 * Custom React hook that runs validation against an evaluation draft on change.
 */
// fallow-ignore-next-line complexity
export function useLiveValidation(evalData: Evaluation) {
  const [issues, setIssues] = useState<ValidationIssue[]>([])
  const [commentIssues, setCommentIssues] = useState<ValidationIssue[]>([])

  // fallow-ignore-next-line complexity
  useEffect(() => {
    if (!evalData) return;

    // Map the database state into a compliant shape for the Zod schema validation
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
      career_recommendations: (evalData.career_recommendations || []).filter(r => r !== ''),
      promotion_recommendation: evalData.promotion_recommendation || 'Promotable',
      retention: evalData.retention || 'Recommended',
    }

    const parsed = EvalSchema.safeParse(validationPayload)
    const newIssues: ValidationIssue[] = []

    if (!parsed.success) {
      // Map Zod errors to their respective field & block numbers
      const fieldErrors = parsed.error.flatten().fieldErrors
      
      // fallow-ignore-next-line complexity
      Object.entries(fieldErrors).forEach(([field, messages]) => {
        if (messages && messages.length > 0) {
          let blockNumber: number | undefined
          
          if (field === 'member_name') blockNumber = 1
          else if (field === 'grade_rate') blockNumber = 2
          else if (field === 'designator') blockNumber = 3
          else if (field === 'dod_id') blockNumber = 4
          else if (field === 'duty_status') blockNumber = 5
          else if (field === 'uic') blockNumber = 6
          else if (field === 'ship_station') blockNumber = 7
          else if (field === 'promotion_status') blockNumber = 8
          else if (field === 'period_from') blockNumber = 14
          else if (field === 'period_to') blockNumber = 15
          else if (field === 'physical_readiness') blockNumber = 20
          else if (field === 'reporting_senior_name') blockNumber = 22
          else if (field === 'reporting_senior_grade') blockNumber = 23
          else if (field === 'reporting_senior_designator') blockNumber = 24
          else if (field === 'reporting_senior_title') blockNumber = 25
          else if (field === 'reporting_senior_uic') blockNumber = 26
          else if (field === 'command_achievements') blockNumber = 28
          else if (field === 'primary_duties') blockNumber = 29
          else if (field === 'date_counseled') blockNumber = 30
          else if (field === 'counselor') blockNumber = 31
          else if (field.startsWith('trait_grades')) blockNumber = 33
          else if (field === 'career_recommendations') blockNumber = 41
          else if (field === 'comments') blockNumber = 43
          else if (field === 'promotion_recommendation') blockNumber = 45
          else if (field === 'retention') blockNumber = 47

          newIssues.push({
            field,
            block: blockNumber,
            message: messages[0]
          })
        }
      })
    }

    // 2. Courier comment box sizing overflow checks
    const pitch = evalData.block_values?.comment_pitch || '10'
    const fitResult = checkCommentFit(evalData.comments || '', pitch)
    const fitIssues: ValidationIssue[] = []
    
    if (!fitResult.fit) {
      fitIssues.push({
        field: 'comments',
        block: 43,
        message: `Comment text exceeds maximum physical box capacity of ${fitResult.maxLines} lines (currently wrapped to ${fitResult.linesUsed} lines at ${pitch}-pitch).`
      })
    }

    setIssues(newIssues)
    setCommentIssues(fitIssues)
  }, [evalData])

  const allIssues = [...issues, ...commentIssues]

  return {
    isValid: allIssues.length === 0,
    issues: allIssues,
    zodIssues: issues,
    commentIssues,
  }
}
