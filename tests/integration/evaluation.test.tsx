// tests/integration/evaluation.test.tsx
//
// Comprehensive unit/integration tests for the evaluation drafts workflow,
// including live Zod rules validation, Courier-box overflow, creation, and view/edit pages.
//

import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { render, screen, fireEvent, waitFor, renderHook } from '@testing-library/react'

// Set mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock-supabase.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'mock-supabase-anon-key'

const mockPush = vi.fn()
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useParams: () => ({ id: 'mock-eval-id' })
}))

// Mock Supabase client
const mockDataStore = {
  profile: {
    id: 'test-user-id',
    first_name: 'FRANKLYN',
    last_name: 'DAIN',
    middle_initial: 'A',
    dod_id: '1234567890',
    navy_rank: 'PO2',
    command: 'USS NEVERSAIL',
    uic: '00241',
  },
  evaluation: {
    id: 'mock-eval-id',
    created_by: 'test-user-id',
    form_definition_id: 'EVAL',
    report_type: 'EVAL',
    member_name: 'DAIN, FRANKLYN A',
    dod_id: '1234567890',
    grade_rate: 'PO2',
    designator: '1110',
    period_from: '2025-01-01',
    period_to: '2025-12-31',
    duty_status: 'ACDU',
    uic: '00241',
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
    comments: 'EXCELLENT PO2. HIGHLY RECOMMENDED FOR PROMOTION.',
    career_recommendations: ['NAVY RECRUITER'],
    promotion_recommendation: 'Must Promote',
    retention: 'Recommended',
    status: 'draft',
    block_values: {
      physical_readiness: 'P/P',
      reporting_senior_name: 'SENIOR, IM A',
      reporting_senior_grade: 'CDR',
      reporting_senior_uic: '00241',
      reporting_senior_title: 'COMMANDING OFFICER',
      date_counseled: '25JAN15',
    }
  }
}

vi.mock('@/lib/supabaseClient', () => {
  return {
    createBrowserClient: () => ({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: async () => {
              if (table === 'profiles') {
                return { data: mockDataStore.profile, error: null }
              }
              if (table === 'evaluations') {
                return { data: mockDataStore.evaluation, error: null }
              }
              return { data: null, error: new Error('Not found') }
            },
            order: () => Promise.resolve({ data: [], error: null })
          })
        })
      })
    })
  }
})

vi.mock('@/lib/auth', () => ({
  getSession: vi.fn().mockResolvedValue({ user: { id: 'test-user-id' } }),
  getSessionUserId: vi.fn().mockResolvedValue('test-user-id'),
}))

vi.mock('@/lib/evaluationService', () => ({
  loadById: vi.fn().mockImplementation(async () => mockDataStore.evaluation),
  saveDraft: vi.fn().mockImplementation(async () => mockDataStore.evaluation),
}))

// Imports under test
import { useLiveValidation } from '@/hooks/useLiveValidation'
import NewEvaluationPage from '@/app/evaluations/new/page'
import EditEvaluationPage from '@/app/evaluations/[id]/edit/page'
import ViewEvaluationPage from '@/app/evaluations/[id]/page'
import { checkCommentFit } from '@/lib/commentFit'

describe('Evaluation Forms & Live Navy Rules Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })


  it('should validate name formatting and cycle periods correctly in useLiveValidation hook', () => {
    const invalidEvalData = {
      ...mockDataStore.evaluation,
      member_name: 'Invalid Name format', // Must be LAST, FIRST MI
      period_from: '2025-12-31',
      period_to: '2025-01-01', // Out of bounds
    } as any

    const { result } = renderHook(() => useLiveValidation(invalidEvalData))
    expect(result.current.isValid).toBe(false)
    
    const nameErr = result.current.issues.find(i => i.field === 'member_name')
    expect(nameErr?.message).toContain('LAST, FIRST MI')

    const dateErr = result.current.issues.find(i => i.field === 'period_to')
    expect(dateErr?.message).toContain('Period To cannot be before Period From')
  })


  it('should restrict promotion recommendations if EO or Bearing trait grade is 2.0 or lower', () => {
    const poorEoEvalData = {
      ...mockDataStore.evaluation,
      trait_grades: {
        ...mockDataStore.evaluation.trait_grades,
        eo: '2.0', // limits recommendation
      },
      promotion_recommendation: 'Early Promote',
    } as any

    const { result } = renderHook(() => useLiveValidation(poorEoEvalData))
    expect(result.current.isValid).toBe(false)
    
    const promoIssue = result.current.issues.find(i => i.field === 'promotion_recommendation')
    expect(promoIssue?.message).toContain('limits the promotion recommendation')
  })


  it('should check Courier comments text bounds and detect box overflow capacity', () => {
    // 10-pitch text with a paragraph of 20 lines (exceeds the 18 max limit)
    const longText = Array(20).fill('THIS IS A MONOSPACE COMMENT LINE THAT FITS THE 10-PITCH WIDTH LIMIT.').join('\n')
    const fitResult = checkCommentFit(longText, '10')
    expect(fitResult.fit).toBe(false)
    expect(fitResult.linesUsed).toBe(20)

    const normalText = 'SHORT AND SWEET DRAFT.'
    const fitResultNormal = checkCommentFit(normalText, '12')
    expect(fitResultNormal.fit).toBe(true)
    expect(fitResultNormal.linesUsed).toBe(1)
  })

  it('should render NewEvaluationPage with prefilled user profile values', async () => {
    render(<NewEvaluationPage />)
    await waitFor(() => {
      expect(screen.getByText(/Draft New Evaluation/i)).toBeDefined()
    })
    expect(screen.getByText(/APEX/i)).toBeDefined()
  })

  it('should render ViewEvaluationPage showing evaluation status, trait ratings, and comments', async () => {
    render(<ViewEvaluationPage />)
    await waitFor(() => {
      expect(screen.getByText(/EXCELLENT PO2. HIGHLY RECOMMENDED FOR PROMOTION./i)).toBeDefined()
    })
    expect(screen.getAllByText(/Must Promote/i).length).toBeGreaterThan(0)
  })

  it('should render EditEvaluationPage and enable saving changes', async () => {
    render(<EditEvaluationPage />)
    await waitFor(() => {
      expect(screen.getByText(/Edit Evaluation Draft/i)).toBeDefined()
    })
    
    const saveButton = screen.getByRole('button', { name: /Save Evaluation Draft/i })
    expect(saveButton).toBeDefined()
    fireEvent.click(saveButton)
  })
})
