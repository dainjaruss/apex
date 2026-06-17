// tests/integration/workflow.test.tsx
//
// Integration tests for the ReviewPanel workflow component.
//

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ReviewPanel from '@/components/Reviewer/ReviewPanel'
import { Evaluation, Profile } from '@/types'

// Mock evaluation services
vi.mock('@/lib/evaluationService', () => ({
  submitForReview: vi.fn().mockResolvedValue({ status: 'ready_for_review' }),
  approveEvaluation: vi.fn().mockResolvedValue({ status: 'completed' }),
  returnForCorrection: vi.fn().mockResolvedValue({ status: 'draft' }),
  fetchReviewApprovals: vi.fn().mockResolvedValue([
    {
      id: 'approval-1',
      approval_status: 'returned',
      reviewer_comments: 'Please fix block 43 comment length.',
      created_at: new Date().toISOString(),
      profiles: {
        first_name: 'Alan',
        last_name: 'Smith',
        preferred_role: 'Reporting Senior'
      }
    }
  ])
}))

vi.mock('@/lib/supabaseClient', () => ({
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({
        neq: () => Promise.resolve({
          data: [
            { id: 'reviewer-id-1', first_name: 'Alan', last_name: 'Smith', preferred_role: 'Reporting Senior', assigned_roles: [] }
          ],
          error: null
        })
      })
    })
  })
}))

const mockDraftEvaluation: Evaluation = {
  id: 'test-eval-id-1',
  created_by: 'creator-user-id',
  form_definition_id: 'EVAL',
  report_type: 'EVAL',
  member_name: 'DOE, JOHN A',
  dod_id: '1234567890',
  grade_rate: 'PO2',
  period_from: '2025-01-01',
  period_to: '2025-12-31',
  uic: '12345',
  ship_station: 'USS NEVERSAIL',
  comments: 'GOOD JOB.',
  career_recommendations: [],
  promotion_recommendation: 'Promotable',
  retention: 'Recommended',
  status: 'draft',
  block_values: {}
}

const mockCreatorProfile: Profile = {
  id: 'creator-user-id',
  first_name: 'John',
  last_name: 'Sailor',
  preferred_role: 'Sailor',
  assigned_roles: ['Sailor']
}

const mockReviewerProfile: Profile = {
  id: 'reviewer-user-id',
  first_name: 'Alan',
  last_name: 'Smith',
  preferred_role: 'Reporting Senior',
  assigned_roles: ['Reporting Senior']
}

describe('APEX ReviewPanel Integration Tests', () => {
  const onWorkflowActionMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render reviewer selection list and submit button when in draft status and viewed by creator', async () => {
    render(
      <ReviewPanel
        evaluation={mockDraftEvaluation}
        currentUser={mockCreatorProfile}
        onWorkflowAction={onWorkflowActionMock}
      />
    )

    // Check header
    expect(screen.getByText(/Review Action Center/i)).toBeDefined()

    // Wait for the async reviewers dropdown to load
    const combobox = await screen.findByRole('combobox')
    expect(combobox).toBeDefined()
    expect(screen.getAllByText(/Smith, Alan/i).length).toBeGreaterThanOrEqual(1)

    // Submit button should be enabled
    const submitBtn = screen.getByRole('button', { name: /Submit Evaluation for Review/i })
    expect(submitBtn).toBeDefined()
    
    // Trigger submission
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(onWorkflowActionMock).toHaveBeenCalled()
    })
  })

  it('should render review actions (Approve & Return) when ready_for_review and viewed by assigned reviewer', async () => {
    const readyEval: Evaluation = {
      ...mockDraftEvaluation,
      status: 'ready_for_review',
      reviewer_id: 'reviewer-user-id'
    }

    render(
      <ReviewPanel
        evaluation={readyEval}
        currentUser={mockReviewerProfile}
        onWorkflowAction={onWorkflowActionMock}
      />
    )

    expect(screen.getByText(/READY FOR REVIEW/i)).toBeDefined()
    expect(screen.getByPlaceholderText(/Enter feedback or corrections/i)).toBeDefined()

    const approveBtn = screen.getByRole('button', { name: /Approve & Complete/i })
    const returnBtn = screen.getByRole('button', { name: /Return for Correction/i })

    expect(approveBtn).toBeDefined()
    expect(returnBtn).toBeDefined()

    // Try approving
    fireEvent.click(approveBtn)

    await waitFor(() => {
      expect(onWorkflowActionMock).toHaveBeenCalled()
    })
  })

  it('should display history list of previous returns/approvals', async () => {
    render(
      <ReviewPanel
        evaluation={mockDraftEvaluation}
        currentUser={mockCreatorProfile}
        onWorkflowAction={onWorkflowActionMock}
      />
    )

    // Wait for history elements to load
    const historyHeader = await screen.findByText(/Review Feedback History/i)
    expect(historyHeader).toBeDefined()

    expect(screen.getAllByText(/Smith, Alan/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Please fix block 43 comment length/i)).toBeDefined()
  })
})
