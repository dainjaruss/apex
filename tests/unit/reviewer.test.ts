// tests/unit/reviewer.test.ts
//
// Unit tests for evaluation workflow states, review approvals, and audit logs.
//

import { describe, it, expect, vi, beforeEach } from 'vitest'

// We will mock the database client
const mockInsert = vi.fn().mockReturnValue({
  select: vi.fn().mockReturnValue({
    single: vi.fn().mockResolvedValue({ data: { id: 'mock-audit-id' }, error: null })
  })
})

const mockUpdate = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { id: 'mock-eval-id', status: 'completed' }, error: null })
    })
  })
})

const mockSelect = vi.fn().mockReturnValue({
  eq: vi.fn().mockReturnValue({
    order: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'approval-1',
          approval_status: 'approved',
          reviewer_comments: 'Looks good!',
          created_at: new Date().toISOString()
        }
      ],
      error: null
    })
  })
})

vi.mock('@/lib/supabaseClient', () => {
  return {
    createBrowserClient: () => ({
      from: (table: string) => {
        if (table === 'audit_logs') {
          return {
            insert: mockInsert
          }
        }
        if (table === 'review_approvals') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
            select: mockSelect
          }
        }
        if (table === 'evaluations') {
          return {
            update: mockUpdate
          }
        }
        return {
          select: vi.fn().mockResolvedValue({ data: [], error: null })
        }
      }
    })
  }
})

import { approveEvaluation, returnForCorrection, submitForReview, fetchReviewApprovals } from '@/lib/evaluationService'
import { logAction, fetchAuditLogs } from '@/lib/auditService'

describe('APEX Reviewer & Audit Workflow Unit Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should write to audit logs via logAction', async () => {
    const res = await logAction('mock-eval-id', 'mock-user-id', 'TEST_ACTION', { info: 'details' })
    expect(mockInsert).toHaveBeenCalledWith([
      {
        evaluation_id: 'mock-eval-id',
        user_id: 'mock-user-id',
        action: 'TEST_ACTION',
        details: { info: 'details' }
      }
    ])
  })

  it('should change status to ready_for_review and log when submitted for review', async () => {
    // Setup update response for submission
    mockUpdate.mockReturnValueOnce({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'mock-eval-id', status: 'ready_for_review' }, error: null })
        })
      })
    })

    const res = await submitForReview('mock-eval-id', 'reviewer-id', 'creator-id')
    expect(res.status).toBe('ready_for_review')
    expect(mockInsert).toHaveBeenCalled()
  })

  it('should change status to completed when approved', async () => {
    // Setup update response for approval
    mockUpdate.mockReturnValueOnce({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'mock-eval-id', status: 'completed' }, error: null })
        })
      })
    })

    const res = await approveEvaluation('mock-eval-id', 'reviewer-id', 'Approved!')
    expect(res.status).toBe('completed')
  })

  it('should change status to draft when returned for correction', async () => {
    // Setup update response for returning
    mockUpdate.mockReturnValueOnce({
      eq: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'mock-eval-id', status: 'draft' }, error: null })
        })
      })
    })

    const res = await returnForCorrection('mock-eval-id', 'reviewer-id', 'Needs more description in block 43.')
    expect(res.status).toBe('draft')
  })

  it('should fetch review history approvals', async () => {
    const res = await fetchReviewApprovals('mock-eval-id')
    expect(res).toBeDefined()
    expect(res.length).toBe(1)
    expect(res[0].approval_status).toBe('approved')
  })
})
