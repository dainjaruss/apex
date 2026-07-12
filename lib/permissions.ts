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
  | 'sign_block_49'   // Senior Rater signature
  | 'sign_block_50'   // Reporting Senior signature
  | 'sign_block_51'   // Member (Individual Evaluated) signature
  | 'sign_block_52'   // Regular Reporting Senior signature (Concurrent Report)
  | 'export_pdf'
  | 'view_audit_log'
  | 'manage_users'
  | 'view_all_evaluations'
  | 'route_evaluation'        // hand custody to the next person in the chain (contextual: current holder)
  | 'manage_summary_groups'   // create/close promotion-recommendation summary groups
  | 'debrief_evaluation'      // begin debrief + open minor corrections
// NOTE: Block 48 on the NAVPERS 1616/26 is the Reporting Senior *address* (a text
// field), not a signature — so it has no sign_block_48 action.

/**
 * Static role-to-action permission map.
 * Admins inherit all permissions.
 */
const ROLE_PERMISSIONS: Record<Role, Action[]> = {
  Sailor: [
    'create_evaluation',
    'edit_evaluation',
    'view_evaluation',
    'route_evaluation',
    'submit_for_review',
    'sign_block_51',
    'export_pdf',
  ],
  Rater: [
    'create_evaluation',
    'edit_evaluation',
    'view_evaluation',
    'route_evaluation',
    'submit_for_review',
    'approve_evaluation',
    'return_evaluation',
    'sign_block_42',
    'sign_block_51',
    'export_pdf',
    'view_audit_log',
  ],
  'Senior Rater': [
    'create_evaluation',
    'edit_evaluation',
    'view_evaluation',
    'route_evaluation',
    'submit_for_review',
    'approve_evaluation',
    'return_evaluation',
    'sign_block_42',
    'sign_block_49',
    'sign_block_51',
    'export_pdf',
    'view_audit_log',
  ],
  'Reporting Senior': [
    'create_evaluation',
    'edit_evaluation',
    'view_evaluation',
    'route_evaluation',
    'submit_for_review',
    'approve_evaluation',
    'return_evaluation',
    'sign_block_42',
    'sign_block_49',
    'sign_block_50',
    'sign_block_51',
    'sign_block_52',
    'export_pdf',
    'view_audit_log',
    'view_all_evaluations',
    'manage_summary_groups',
    'debrief_evaluation',
  ],
  Admin: [
    'create_evaluation',
    'edit_evaluation',
    'delete_evaluation',
    'view_evaluation',
    'route_evaluation',
    'submit_for_review',
    'approve_evaluation',
    'return_evaluation',
    'sign_block_42',
    'sign_block_49',
    'sign_block_50',
    'sign_block_51',
    'sign_block_52',
    'export_pdf',
    'view_audit_log',
    'manage_users',
    'view_all_evaluations',
    'manage_summary_groups',
    'debrief_evaluation',
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

  // Admin bypasses contextual checks — except browser edits, where RLS
  // (eval_update_custody) only lets the current holder write, so the custody
  // gate below applies to everyone including Admin.
  if (role === 'Admin' && action !== 'edit_evaluation') return true

  // Contextual checks for specific actions
  if (evaluation) {
    switch (action) {
      case 'edit_evaluation':
        // Mirrors RLS eval_update_custody: only the current holder of an
        // unlocked, active eval may edit (in draft, the creator holds custody).
        if (evaluation.signature_locked || evaluation.status === 'completed' || evaluation.status === 'archived') {
          return false
        }
        return evaluation.current_holder_id === user.id

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

      case 'route_evaluation':
        // Only the current custodian may route the eval onward, and not once locked.
        return evaluation.current_holder_id === user.id && !evaluation.signature_locked

      case 'sign_block_51':
        // Member (Individual Evaluated) signature — only the evaluation subject (creator in our model)
        return evaluation.created_by === user.id

      case 'sign_block_42':
      case 'sign_block_49':
      case 'sign_block_50':
      case 'sign_block_52':
        // Rater / Senior Rater / Reporting Senior signatures — must be the assigned reviewer
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
    'sign_block_42', 'sign_block_49', 'sign_block_50', 'sign_block_51', 'sign_block_52',
    'export_pdf', 'view_audit_log',
  ]
  return allActions.filter(action => canPerformAction(user, action, evaluation))
}

/**
 * Maps each signable NAVPERS block number to the RBAC action that governs it.
 * Block 48 is the Reporting Senior address (not a signature) and is absent.
 * Module-private — consumed only by canPerformAction below.
 */
const SIGN_ACTION_BY_BLOCK: Record<number, Action> = {
  32: 'sign_block_51', // Signature of Individual Counseled — the evaluated member
  42: 'sign_block_42', // Rater
  49: 'sign_block_49', // Senior Rater
  50: 'sign_block_50', // Reporting Senior
  51: 'sign_block_51', // Individual Evaluated (member)
  52: 'sign_block_52', // Regular Reporting Senior (Concurrent Report)
}

/**
 * Server- and client-safe (React-free) check for whether a user may sign a given
 * signature block. Single source of truth for the report-screen signing flow.
 *
 * Member blocks (32 Individual Counseled, 51 Individual Evaluated) require the
 * evaluated member (created_by) or an Admin. Reviewer-chain blocks (42/49/50/52)
 * require only that the signer holds the role — the schema carries a single
 * reviewer_id, so role possession (not reviewer assignment) gates the chain.
 */
export function canSignBlock(user: Profile, block: number, evaluation: Evaluation): boolean {
  const action = SIGN_ACTION_BY_BLOCK[block]
  if (!action) return false
  const role = user.preferred_role as Role
  if (!hasPermission(role, action)) return false
  if (block === 32 || block === 51) {
    return evaluation.created_by === user.id || role === 'Admin'
  }
  return true
}

/**
 * Whether a user may create/close summary groups. Reporting Senior and Admin have it
 * by role; any other user can be granted it by adding 'GroupManager' to assigned_roles
 * (so an Admin can delegate without changing the user's primary role).
 */
export function canManageSummaryGroups(user: Profile): boolean {
  if (hasPermission(user.preferred_role, 'manage_summary_groups')) return true
  return (user.assigned_roles || []).includes('GroupManager')
}

/**
 * Who may SEE the summary group average (Block 50a). Reviewers — the rating chain, i.e. anyone who
 * can approve an evaluation (Rater / Senior Rater / Reporting Senior / Admin) — may always see it.
 * The evaluated member (a Sailor) must NOT see it while the report is still being drafted or
 * reviewed; they see it only once the report is finalized (signed/locked or completed), where it
 * is part of the official NAVPERS record they receive.
 */
export function canViewSummaryAverage(
  role: Role | string | undefined,
  evaluation?: { signature_locked?: boolean | null; routing_stage?: string | null; status?: string | null },
): boolean {
  if (role && hasPermission(role, 'approve_evaluation')) return true
  const ev = evaluation || {}
  return !!ev.signature_locked || ev.routing_stage === 'locked' || ev.status === 'completed' || ev.status === 'archived'
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
