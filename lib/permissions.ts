// lib/permissions.ts
//
// Centralized RBAC permission engine for APEX.
// Defines what each role can do across evaluation lifecycle actions.
//

import { Evaluation, Profile } from '@/types'

export type Role = 'Sailor' | 'Rater' | 'Senior Rater' | 'Reporting Senior' | 'Admin'

export type Action =
  | 'create_evaluation'
  | 'edit_evaluation'
  | 'delete_evaluation'
  | 'view_evaluation'
  | 'submit_for_review'
  | 'approve_evaluation'
  | 'return_evaluation'
  | 'sign_block_42'   // Rater signature
  | 'sign_block_48'   // Senior Rater signature
  | 'sign_block_49'   // Member signature
  | 'sign_block_50'   // Reporting Senior signature
  | 'export_pdf'
  | 'view_audit_log'
  | 'manage_users'
  | 'view_all_evaluations'

/**
 * Static role-to-action permission map.
 * Admins inherit all permissions.
 */
const ROLE_PERMISSIONS: Record<Role, Action[]> = {
  Sailor: [
    'create_evaluation',
    'edit_evaluation',
    'view_evaluation',
    'submit_for_review',
    'sign_block_49',
    'export_pdf',
  ],
  Rater: [
    'create_evaluation',
    'edit_evaluation',
    'view_evaluation',
    'submit_for_review',
    'approve_evaluation',
    'return_evaluation',
    'sign_block_42',
    'sign_block_49',
    'export_pdf',
    'view_audit_log',
  ],
  'Senior Rater': [
    'create_evaluation',
    'edit_evaluation',
    'view_evaluation',
    'submit_for_review',
    'approve_evaluation',
    'return_evaluation',
    'sign_block_42',
    'sign_block_48',
    'sign_block_49',
    'export_pdf',
    'view_audit_log',
  ],
  'Reporting Senior': [
    'create_evaluation',
    'edit_evaluation',
    'view_evaluation',
    'submit_for_review',
    'approve_evaluation',
    'return_evaluation',
    'sign_block_42',
    'sign_block_48',
    'sign_block_49',
    'sign_block_50',
    'export_pdf',
    'view_audit_log',
    'view_all_evaluations',
  ],
  Admin: [
    'create_evaluation',
    'edit_evaluation',
    'delete_evaluation',
    'view_evaluation',
    'submit_for_review',
    'approve_evaluation',
    'return_evaluation',
    'sign_block_42',
    'sign_block_48',
    'sign_block_49',
    'sign_block_50',
    'export_pdf',
    'view_audit_log',
    'manage_users',
    'view_all_evaluations',
  ],
}

/**
 * Check if a role has a specific static permission.
 */
export function hasPermission(role: Role | string, action: Action): boolean {
  const perms = ROLE_PERMISSIONS[role as Role]
  if (!perms) return false
  return perms.includes(action)
}

/**
 * Check if a user can perform an action on a specific evaluation.
 * Adds contextual checks (ownership, assignment) on top of static role permissions.
 */
export function canPerformAction(user: Profile, action: Action, evaluation?: Evaluation): boolean {
  const role = user.preferred_role as Role

  // Static permission check first
  if (!hasPermission(role, action)) return false

  // Admin bypasses contextual checks
  if (role === 'Admin') return true

  // Contextual checks for specific actions
  if (evaluation) {
    switch (action) {
      case 'edit_evaluation':
        // Only the creator can edit, and only when in draft status
        return evaluation.created_by === user.id && evaluation.status === 'draft'

      case 'submit_for_review':
        // Only the creator can submit, and only from draft
        return evaluation.created_by === user.id && evaluation.status === 'draft'

      case 'approve_evaluation':
      case 'return_evaluation':
        // Only the assigned reviewer can approve/return, and only when ready_for_review
        return evaluation.reviewer_id === user.id && evaluation.status === 'ready_for_review'

      case 'delete_evaluation':
        // Only the creator can delete, and only when still in draft
        return evaluation.created_by === user.id && evaluation.status === 'draft'

      case 'export_pdf':
        // Anyone with view access can export
        return evaluation.created_by === user.id ||
               evaluation.reviewer_id === user.id ||
               hasPermission(role, 'view_all_evaluations')

      case 'sign_block_49':
        // Member signature — only the evaluation subject (creator in our model)
        return evaluation.created_by === user.id

      case 'sign_block_42':
      case 'sign_block_48':
      case 'sign_block_50':
        // Reviewer/Senior signatures — must be the assigned reviewer
        return evaluation.reviewer_id === user.id ||
               hasPermission(role, 'view_all_evaluations')

      default:
        return true
    }
  }

  return true
}

/**
 * Returns all actions a user can perform on a given evaluation.
 */
export function getAvailableActions(user: Profile, evaluation: Evaluation): Action[] {
  const allActions: Action[] = [
    'edit_evaluation', 'delete_evaluation', 'view_evaluation',
    'submit_for_review', 'approve_evaluation', 'return_evaluation',
    'sign_block_42', 'sign_block_48', 'sign_block_49', 'sign_block_50',
    'export_pdf', 'view_audit_log',
  ]
  return allActions.filter(action => canPerformAction(user, action, evaluation))
}

/**
 * Gets a human-readable description of a role's capabilities.
 */
export function getRoleDescription(role: Role): string {
  const descriptions: Record<Role, string> = {
    Sailor: 'Create and manage your own evaluation reports. Sign as the evaluated member.',
    Rater: 'Rate subordinates, sign as Rater, and review submitted evaluations.',
    'Senior Rater': 'Oversee evaluations as Senior Rater with approval and return authority.',
    'Reporting Senior': 'Full review chain authority including final sign-off and oversight of all evaluations.',
    Admin: 'System administrator with unrestricted access to all evaluations, users, and settings.',
  }
  return descriptions[role] || 'Unknown role.'
}
