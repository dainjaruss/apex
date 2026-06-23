// tests/unit/permissions.test.ts
//
// Unit tests for the RBAC permission engine.
//

import { describe, it, expect } from 'vitest'
import { hasPermission, canPerformAction, getAvailableActions, getRoleDescription } from '@/lib/permissions'
import { Profile, Evaluation } from '@/types'

const mockEvaluation: Evaluation = {
  id: 'eval-1',
  created_by: 'sailor-1',
  reviewer_id: 'reviewer-1',
  form_definition_id: 'EVAL',
  report_type: 'EVAL',
  member_name: 'DOE, JOHN A',
  dod_id: '1234567890',
  grade_rate: 'PO2',
  period_from: '2025-01-01',
  period_to: '2025-12-31',
  uic: '12345',
  ship_station: 'USS TEST',
  comments: 'test',
  career_recommendations: [],
  promotion_recommendation: 'Promotable',
  retention: 'Recommended',
  status: 'draft',
  block_values: {},
  trait_grades: {},
}

const sailor: Profile = {
  id: 'sailor-1',
  first_name: 'John',
  last_name: 'Doe',
  preferred_role: 'Sailor',
  assigned_roles: ['Sailor'],
}

const rater: Profile = {
  id: 'rater-1',
  first_name: 'Jane',
  last_name: 'Smith',
  preferred_role: 'Rater',
  assigned_roles: ['Rater'],
}

const reportingSenior: Profile = {
  id: 'reviewer-1',
  first_name: 'Alan',
  last_name: 'Senior',
  preferred_role: 'Reporting Senior',
  assigned_roles: ['Reporting Senior'],
}

const admin: Profile = {
  id: 'admin-1',
  first_name: 'Admin',
  last_name: 'User',
  preferred_role: 'Admin',
  assigned_roles: ['Admin'],
}

describe('RBAC Permission Engine', () => {
  describe('hasPermission (static role checks)', () => {
    it('should allow Sailors to create evaluations', () => {
      expect(hasPermission('Sailor', 'create_evaluation')).toBe(true)
    })

    it('should not allow Sailors to manage users', () => {
      expect(hasPermission('Sailor', 'manage_users')).toBe(false)
    })

    it('should not allow Sailors to approve evaluations', () => {
      expect(hasPermission('Sailor', 'approve_evaluation')).toBe(false)
    })

    it('should allow Raters to approve evaluations', () => {
      expect(hasPermission('Rater', 'approve_evaluation')).toBe(true)
    })

    it('should allow Admins to manage users', () => {
      expect(hasPermission('Admin', 'manage_users')).toBe(true)
    })

    it('should allow Reporting Senior to view all evaluations', () => {
      expect(hasPermission('Reporting Senior', 'view_all_evaluations')).toBe(true)
    })

    it('should not allow Sailors to view all evaluations', () => {
      expect(hasPermission('Sailor', 'view_all_evaluations')).toBe(false)
    })

    it('should return false for unknown roles', () => {
      expect(hasPermission('UnknownRole', 'create_evaluation')).toBe(false)
    })
  })

  describe('canPerformAction (contextual checks)', () => {
    it('should allow the creator to edit their own draft evaluation', () => {
      expect(canPerformAction(sailor, 'edit_evaluation', mockEvaluation)).toBe(true)
    })

    it('should not allow a non-creator Sailor to edit the evaluation', () => {
      const otherSailor = { ...sailor, id: 'other-sailor' }
      expect(canPerformAction(otherSailor, 'edit_evaluation', mockEvaluation)).toBe(false)
    })

    it('should not allow editing a completed evaluation', () => {
      const completedEval = { ...mockEvaluation, status: 'completed' as const }
      expect(canPerformAction(sailor, 'edit_evaluation', completedEval)).toBe(false)
    })

    it('should allow the assigned reviewer to approve a ready_for_review evaluation', () => {
      const readyEval = { ...mockEvaluation, status: 'ready_for_review' as const }
      expect(canPerformAction(reportingSenior, 'approve_evaluation', readyEval)).toBe(true)
    })

    it('should not allow an unassigned reviewer to approve', () => {
      const readyEval = { ...mockEvaluation, status: 'ready_for_review' as const }
      expect(canPerformAction(rater, 'approve_evaluation', readyEval)).toBe(false)
    })

    it('should allow Admin to do anything regardless of ownership', () => {
      expect(canPerformAction(admin, 'edit_evaluation', mockEvaluation)).toBe(true)
      expect(canPerformAction(admin, 'approve_evaluation', mockEvaluation)).toBe(true)
      expect(canPerformAction(admin, 'delete_evaluation', mockEvaluation)).toBe(true)
    })

    it('should only allow the member to sign block 49', () => {
      expect(canPerformAction(sailor, 'sign_block_49', mockEvaluation)).toBe(true)
      const otherSailor = { ...sailor, id: 'other-sailor' }
      expect(canPerformAction(otherSailor, 'sign_block_49', mockEvaluation)).toBe(false)
    })
  })

  describe('getAvailableActions', () => {
    it('should return limited actions for a Sailor on their own draft', () => {
      const actions = getAvailableActions(sailor, mockEvaluation)
      expect(actions).toContain('edit_evaluation')
      expect(actions).toContain('submit_for_review')
      expect(actions).toContain('sign_block_49')
      expect(actions).not.toContain('approve_evaluation')
      expect(actions).not.toContain('manage_users')
    })

    it('should return all actions for Admin', () => {
      const actions = getAvailableActions(admin, mockEvaluation)
      expect(actions).toContain('edit_evaluation')
      expect(actions).toContain('approve_evaluation')
      expect(actions).toContain('delete_evaluation')
    })
  })

  describe('getRoleDescription', () => {
    it('should return a description for each known role', () => {
      expect(getRoleDescription('Sailor')).toContain('evaluation')
      expect(getRoleDescription('Admin')).toContain('unrestricted')
    })
  })
})
