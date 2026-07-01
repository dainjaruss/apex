// lib/evaluationService.ts
//
// DB Service layer for querying and persisting EVAL records in Supabase.
//

import { createBrowserClient } from './supabaseClient'
import { Evaluation } from '../types'
import { logAction } from './auditService'

const supabase = createBrowserClient()

async function postRoute(url: string, body: Record<string, any>) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Request failed')
  return json
}

/**
 * Saves a new evaluation draft or updates an existing draft.
 */
export const saveDraft = async (userId: string, evalData: Partial<Evaluation>) => {
  // Ensure the payload doesn't contain system fields if inserting
  const { created_at, updated_at, ...cleanedData } = evalData as any;
  
  const isUpdate = !!evalData.id
  const payload = {
    ...cleanedData,
    created_by: userId,
    updated_at: new Date().toISOString(),
    ...(isUpdate ? {} : {
      current_holder_id: userId,
      participants: [userId],
      routing_stage: 'sailor' as const,
    }),
  }

  const query = isUpdate
    ? supabase.from('evaluations').update(payload).eq('id', evalData.id)
    : supabase.from('evaluations').insert([payload])

  const { data, error } = await query.select().single()
  if (error) {
    console.error('saveDraft DB operation failed:', error.message)
    throw new Error(error.message)
  }

  // Log draft creation or update
  await logAction(
    data.id,
    userId,
    isUpdate ? 'REPORT_UPDATED' : 'REPORT_CREATED',
    { member_name: data.member_name }
  )

  return data as Evaluation
}

/**
 * Loads a single evaluation record by its UUID.
 */
export const loadById = async (id: string): Promise<Evaluation> => {
  const { data, error } = await supabase
    .from('evaluations')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    console.error(`loadById failed for ID ${id}:`, error.message)
    throw new Error(error.message)
  }
  return data as Evaluation
}

/**
 * Lists evaluations associated with a user (either drafted by them or assigned to them for review).
 */

// fallow-ignore-next-line unused-export
export const listByUser = async (userId: string): Promise<Evaluation[]> => {
  const { data, error } = await supabase
    .from('evaluations')
    .select('*')
    .or(`created_by.eq.${userId},reviewer_id.eq.${userId}`)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error(`listByUser failed for user ${userId}:`, error.message)
    throw new Error(error.message)
  }
  return (data || []) as Evaluation[]
}

/**
 * Deletes an evaluation draft.
 */

// fallow-ignore-next-line unused-export
export const deleteDraft = async (id: string): Promise<void> => {
  const { error } = await supabase
    .from('evaluations')
    .delete()
    .eq('id', id)

  if (error) {
    console.error(`deleteDraft failed for ID ${id}:`, error.message)
    throw new Error(error.message)
  }
}

/**
 * Updates the workflow status of an evaluation.
 */
export const updateStatus = async (id: string, status: string, userId?: string): Promise<Evaluation> => {
  if (status === 'completed' && !process.env.VITEST) {
    await postRoute('/api/eval-finalize', { evaluationId: id })
    return loadById(id)
  }

  const { data, error } = await supabase
    .from('evaluations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error(`updateStatus failed for ID ${id} to ${status}:`, error.message)
    throw new Error(error.message)
  }

  if (userId) {
    await logAction(id, userId, 'STATUS_CHANGED', { new_status: status })
  }

  return data as Evaluation
}

/**
 * Shared review-workflow transition: update the evaluation row, record a
 * review_approvals row, and write an audit log. submit / return / approve differ
 * only in the status set, the approval_status recorded, the audit action, and the
 * actor — so each is a thin wrapper over this helper.
 */
type ReviewTransition = {
  label: string                              // function name, for the error log
  evalUpdate: Record<string, unknown>        // fields to set on the evaluation
  approvalStatus: 'pending' | 'returned' | 'approved'
  reviewerComments?: string                  // omitted from the approval row when undefined
  action: string                             // audit action
  actor: string                              // userId passed to logAction
  meta?: Record<string, unknown>             // audit metadata
}

const applyReviewTransition = async (id: string, reviewerId: string, t: ReviewTransition): Promise<Evaluation> => {
  const { data, error } = await supabase
    .from('evaluations')
    .update({ ...t.evalUpdate, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error(`${t.label} failed for ID ${id}:`, error.message)
    throw new Error(error.message)
  }

  const approval = {
    evaluation_id: id,
    reviewer_id: reviewerId,
    approval_status: t.approvalStatus,
    ...(t.reviewerComments !== undefined ? { reviewer_comments: t.reviewerComments } : {})
  }

  const { error: revError } = await supabase.from('review_approvals').insert([approval])
  if (revError) {
    console.error(`Failed to insert ${t.approvalStatus} review approval for evaluation ${id}:`, revError.message)
  }

  await logAction(id, t.actor, t.action, t.meta)
  return data as Evaluation
}

/**
 * Submits an evaluation for internal review.
 */
export const submitForReview = (id: string, reviewerId: string, userId: string): Promise<Evaluation> =>
  applyReviewTransition(id, reviewerId, {
    label: 'submitForReview',
    evalUpdate: { status: 'ready_for_review', reviewer_id: reviewerId },
    approvalStatus: 'pending',
    action: 'SUBMITTED_FOR_REVIEW',
    actor: userId,
    meta: { reviewer_id: reviewerId }
  })

/**
 * Returns an evaluation to draft status for correction.
 */
export const returnForCorrection = (id: string, reviewerId: string, comments: string): Promise<Evaluation> =>
  applyReviewTransition(id, reviewerId, {
    label: 'returnForCorrection',
    evalUpdate: { status: 'draft' },
    approvalStatus: 'returned',
    reviewerComments: comments,
    action: 'RETURNED_FOR_CORRECTION',
    actor: reviewerId,
    meta: { comments }
  })

/**
 * Approves an evaluation and marks it completed.
 */
export const approveEvaluation = (id: string, reviewerId: string, comments: string = ''): Promise<Evaluation> =>
  applyReviewTransition(id, reviewerId, {
    label: 'approveEvaluation',
    evalUpdate: { status: 'completed' },
    approvalStatus: 'approved',
    reviewerComments: comments,
    action: 'REVIEW_APPROVED',
    actor: reviewerId,
    meta: { comments }
  })

/**
 * Retrieves the historical approvals and comments for an evaluation.
 */
export const fetchReviewApprovals = async (evaluationId: string) => {
  const { data, error } = await supabase
    .from('review_approvals')
    .select(`
      id,
      evaluation_id,
      reviewer_id,
      approval_status,
      reviewer_comments,
      created_at,
      profiles:reviewer_id (
        first_name,
        last_name,
        preferred_role
      )
    `)
    .eq('evaluation_id', evaluationId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error(`fetchReviewApprovals failed for evaluation ${evaluationId}:`, error.message)
    throw new Error(error.message)
  }
  return data
}

/* ── Custody routing (server-enforced via service-role routes) ─────────────── */

/** Hand custody to the next person in the chain. */
export const routeForward = (evaluationId: string, toUserId: string) =>
  postRoute('/api/eval-route', { evaluationId, action: 'route_forward', toUserId })

/** Recycle one step back to the previous holder (comments required). */
export const recycleForCorrection = (evaluationId: string, comments: string) =>
  postRoute('/api/eval-route', { evaluationId, action: 'recycle', comments })

/** Begin debrief at the reporting senior / admin stage (opens minor corrections). */
export const beginDebrief = (evaluationId: string) =>
  postRoute('/api/eval-route', { evaluationId, action: 'begin_debrief' })

/** Apply a minor (key-whitelisted) correction during debrief. */
export const applyMinorCorrection = (evaluationId: string, patch: Record<string, any>) =>
  postRoute('/api/eval-correct', { evaluationId, patch })

/** Lock / unlock the report (reporting senior / admin). */
export const setLock = (evaluationId: string, lock: boolean) =>
  postRoute('/api/eval-lock', { evaluationId, lock })
