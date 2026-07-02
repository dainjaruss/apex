// tests/integration/validation.test.tsx
//
// Integration tests for the interactive validation check and modal.
//

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import EvaluationForm from '@/components/EvaluationForm'
import { Evaluation } from '@/types'

// Mock Router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
  usePathname: () => '/evaluations/new',
}))

const mockData: Evaluation = {
  id: 'test-eval-id',
  created_by: 'test-user-id',
  form_definition_id: 'EVAL',
  report_type: 'EVAL',
  member_name: 'Invalid Name format', // trigger error
  dod_id: '123', // trigger error
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
  comments: 'PO2 DOE HAS PERFORMED OUTSTANDING DUTIES.',
  career_recommendations: ['LPO'],
  promotion_recommendation: 'Must Promote',
  retention: 'Recommended',
  status: 'draft',
}

describe('EvaluationForm On-Demand Rules Check Integration Tests', () => {
  const onSaveMock = vi.fn()
  const onCancelMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not surface inline field errors by default (no red borders on load)', () => {
    render(
      <EvaluationForm
        initialData={mockData}
        onSave={onSaveMock}
        onCancel={onCancelMock}
        isSaving={false}
      />
    )

    // member_name is invalid, but on a fresh form its inline error must stay hidden
    // until the user leaves the field or runs Verify/Save.
    expect(screen.queryByText(/Name must be in LAST, FIRST MI format/i)).toBeNull()
  })

  it('should reveal inline field errors after Verify Rules is clicked', async () => {
    render(
      <EvaluationForm
        initialData={mockData}
        onSave={onSaveMock}
        onCancel={onCancelMock}
        isSaving={false}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /Verify Rules/i }))

    // Verify reveals everything: the inline field error now renders alongside the modal.
    await waitFor(() => {
      expect(screen.getAllByText(/Name must be in LAST, FIRST MI format/i).length).toBeGreaterThanOrEqual(2)
    }, { timeout: 1500 })
  })

  it('should display validation blockers in ValidationResultsModal when Verify Rules is clicked', async () => {
    render(
      <EvaluationForm
        initialData={mockData}
        onSave={onSaveMock}
        onCancel={onCancelMock}
        isSaving={false}
      />
    )

    // Initially modal is closed
    expect(screen.queryByText(/Validation Rules Check/i)).toBeNull()

    // Find and click "Verify Rules" button
    const verifyButton = screen.getByRole('button', { name: /Verify Rules/i })
    expect(verifyButton).toBeDefined()
    fireEvent.click(verifyButton)

    // Wait for the simulated async verification check
    await waitFor(() => {
      expect(screen.getByText(/Validation Rules Check/i)).toBeDefined()
    }, { timeout: 1500 })

    // Blocker list should show administrative errors
    expect(screen.getByText(/Validation Blocker Errors Detected/i)).toBeDefined()
    expect(screen.getAllByText(/Name must be in LAST, FIRST MI format/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/DoD ID must be exactly 10 digits/i).length).toBeGreaterThanOrEqual(1)

    // Close modal
    const closeButton = screen.getByRole('button', { name: /Close Results/i })
    fireEvent.click(closeButton)

    // Modal should be closed
    await waitFor(() => {
      expect(screen.queryByText(/Validation Rules Check/i)).toBeNull()
    })
  })
})
