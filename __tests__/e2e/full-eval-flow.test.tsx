// __tests__/e2e/full-eval-flow.test.tsx
//
// End-to-end simulated integration test for the full evaluation lifecycle:
// 1. Create a draft evaluation
// 2. Perform verification rules check
// 3. Edit evaluation to fix validation blockers
// 4. Submit for review to a Reporting Senior
// 5. Approve evaluation as the Reporting Senior
// 6. Finalize/Export the PDF and check the audit logs
//

import { describe, it, expect, vi } from 'vitest'
import { runFullValidation } from '@/lib/validationEngine'
import { submitForReview, approveEvaluation, updateStatus, saveDraft } from '@/lib/evaluationService'
import { logAction, fetchAuditLogs } from '@/lib/auditService'
import { Evaluation } from '@/types'

// Mock the supabase browser client
vi.mock('@/lib/supabaseClient', () => {
  let mockEvaluationsTable: any[] = []
  let mockAuditLogsTable: any[] = []
  let mockReviewApprovalsTable: any[] = []

  return {
    createBrowserClient: () => ({
      from: (table: string) => {
        return {
          insert: (payload: any[]) => {
            const added = payload.map(item => ({ ...item, id: `mock-${table}-id-${Math.random()}`, created_at: new Date().toISOString() }))
            if (table === 'audit_logs') mockAuditLogsTable.push(...added)
            if (table === 'evaluations') mockEvaluationsTable.push(...added)
            if (table === 'review_approvals') mockReviewApprovalsTable.push(...added)
            
            return {
              select: () => ({
                single: () => Promise.resolve({ data: added[0], error: null })
              })
            }
          },
          update: (payload: any) => {
            return {
              eq: (field: string, val: any) => {
                if (table === 'evaluations') {
                  mockEvaluationsTable = mockEvaluationsTable.map(item => 
                    item.id === val ? { ...item, ...payload, updated_at: new Date().toISOString() } : item
                  )
                }
                const updatedItem = mockEvaluationsTable.find(item => item.id === val) || { id: val, ...payload }
                return {
                  select: () => ({
                    single: () => Promise.resolve({ data: updatedItem, error: null })
                  })
                }
              }
            }
          },
          select: () => {
            let data: any[] = []
            if (table === 'audit_logs') data = mockAuditLogsTable
            if (table === 'evaluations') data = mockEvaluationsTable
            if (table === 'review_approvals') data = mockReviewApprovalsTable
            return {
              eq: () => ({
                order: () => Promise.resolve({ data, error: null })
              }),
              order: () => Promise.resolve({ data, error: null }),
              in: () => Promise.resolve({ data, error: null })
            }
          }
        }
      }
    })
  }
})

describe('APEX Full Evaluation Lifecycle E2E Integration Test', () => {
  it('should run the entire evaluation lifecycle successfully', async () => {
    const userId = 'user-sailor-123'
    const reviewerId = 'user-senior-456'

    // Step 1: Create a draft evaluation with some validation errors
    const initialReport: Partial<Evaluation> = {
      member_name: 'John Doe', // Invalid name format (must be LAST, FIRST MI)
      dod_id: '12345', // Invalid dod_id format (must be 10 digits)
      report_type: 'EVAL',
      form_definition_id: 'EVAL',
      status: 'draft',
      trait_grades: {
        knowledge: '3.0',
        work: '4.0',
        eo: '4.0',
        bearing: '4.0',
        accomplishment: '4.0',
        teamwork: '4.0',
        leadership: '4.0'
      }
    }

    const draftEval = await saveDraft(userId, initialReport)
    expect(draftEval.id).toBeDefined()
    expect(draftEval.status).toBe('draft')

    // Verify audit log for REPORT_CREATED is recorded
    const auditLogs1 = await fetchAuditLogs(draftEval.id)
    expect(auditLogs1.length).toBe(1)
    expect(auditLogs1[0].action).toBe('REPORT_CREATED')

    // Step 2: Run verification rules check and expect failures
    const validationResult1 = runFullValidation(draftEval)
    expect(validationResult1.success).toBe(false)
    expect(validationResult1.errors.length).toBeGreaterThanOrEqual(2)

    // Step 3: Correct the fields to fix the validation blockers and add all required NAVPERS fields
    const correctedReport: Evaluation = {
      id: draftEval.id,
      created_by: userId,
      form_definition_id: 'EVAL',
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
      comments: 'PO2 DOE HAS PERFORMED OUTSTANDING DUTIES THROUGHOUT THIS CYCLE.',
      career_recommendations: ['LPO'],
      promotion_recommendation: 'Must Promote',
      retention: 'Recommended',
      status: 'draft',
      block_values: {
        physical_readiness: 'PPP',
        date_reported: '2024-01-15',
        periodic: true,        // Block 10 — occasion
        regular_report: true,  // Block 17 — type
        reporting_senior_name: 'SMITH, A J',
        reporting_senior_grade: 'CDR',
        reporting_senior_designator: '1110',
        reporting_senior_title: 'CO',
        reporting_senior_uic: '12345',
        reporting_senior_dod_id: '0987654321',
        command_achievements: 'LEAD LPO',
        primary_duties: 'DIVISION LEAD',
        date_counseled: '25JAN15',
        counselor: 'SMITH, A J',
        comment_pitch: '10',
        billet_subcategory: 'NA',
      }
    }

    const updatedEval = await saveDraft(userId, correctedReport)
    expect(updatedEval.member_name).toBe('DOE, JOHN A')
    expect(updatedEval.dod_id).toBe('1234567890')

    // Verify audit log for REPORT_UPDATED is recorded
    const auditLogs2 = await fetchAuditLogs(updatedEval.id)
    expect(auditLogs2.some(log => log.action === 'REPORT_UPDATED')).toBe(true)

    // Run rules check again: should succeed
    const validationResult2 = runFullValidation(updatedEval)
    expect(validationResult2.success).toBe(true)
    expect(validationResult2.errors.length).toBe(0)

    // Step 4: Submit the evaluation for review
    const submittedEval = await submitForReview(updatedEval.id, reviewerId, userId)
    expect(submittedEval.status).toBe('ready_for_review')

    // Verify audit log is created for submission
    const auditLogs3 = await fetchAuditLogs(updatedEval.id)
    expect(auditLogs3.some(log => log.action === 'SUBMITTED_FOR_REVIEW')).toBe(true)

    // Step 5: Approve the evaluation as the Reporting Senior
    const approvedEval = await approveEvaluation(submittedEval.id, reviewerId, 'Excellent performance across all traits.')
    expect(approvedEval.status).toBe('completed')

    // Verify audit log is created for approval
    const auditLogs4 = await fetchAuditLogs(updatedEval.id)
    expect(auditLogs4.some(log => log.action === 'REVIEW_APPROVED')).toBe(true)

    // Step 6: Finalize status & simulate PDF export
    const finalizedEval = await updateStatus(approvedEval.id, 'completed', userId)
    expect(finalizedEval.status).toBe('completed')

    // Verify final audit logs
    const finalAuditLogs = await fetchAuditLogs(finalizedEval.id)
    expect(finalAuditLogs.some(log => log.action === 'STATUS_CHANGED')).toBe(true)
  })
})
