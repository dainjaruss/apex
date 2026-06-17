// lib/evaluationService.ts
//
// DB Service layer for querying and persisting EVAL records in Supabase.
//

import { createBrowserClient } from './supabaseClient'
import { Evaluation } from '../types'
import { logAction } from './auditService'

const supabase = createBrowserClient()

/**
 * Saves a new evaluation draft or updates an existing draft.
 */
export const saveDraft = async (userId: string, evalData: Partial<Evaluation>) => {
  // Ensure the payload doesn't contain system fields if inserting
  const { created_at, updated_at, ...cleanedData } = evalData as any;
  
  const payload = {
    ...cleanedData,
    created_by: userId,
    updated_at: new Date().toISOString()
  }

  const isUpdate = !!evalData.id
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
 * Submits an evaluation for internal review.
 */
export const submitForReview = async (id: string, reviewerId: string, userId: string): Promise<Evaluation> => {
  const { data, error } = await supabase
    .from('evaluations')
    .update({
      status: 'ready_for_review',
      reviewer_id: reviewerId,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error(`submitForReview failed for ID ${id}:`, error.message)
    throw new Error(error.message)
  }

  // Insert review approval record in pending state
  const { error: revError } = await supabase
    .from('review_approvals')
    .insert([
      {
        evaluation_id: id,
        reviewer_id: reviewerId,
        approval_status: 'pending'
      }
    ])

  if (revError) {
    console.error(`Failed to insert pending review approval for evaluation ${id}:`, revError.message)
  }

  await logAction(id, userId, 'SUBMITTED_FOR_REVIEW', { reviewer_id: reviewerId })
  return data as Evaluation
}

/**
 * Returns an evaluation to draft status for correction.
 */
export const returnForCorrection = async (id: string, reviewerId: string, comments: string): Promise<Evaluation> => {
  const { data, error } = await supabase
    .from('evaluations')
    .update({
      status: 'draft',
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error(`returnForCorrection failed for ID ${id}:`, error.message)
    throw new Error(error.message)
  }

  // Insert returned review approval record
  const { error: revError } = await supabase
    .from('review_approvals')
    .insert([
      {
        evaluation_id: id,
        reviewer_id: reviewerId,
        approval_status: 'returned',
        reviewer_comments: comments
      }
    ])

  if (revError) {
    console.error(`Failed to insert returned review approval for evaluation ${id}:`, revError.message)
  }

  await logAction(id, reviewerId, 'RETURNED_FOR_CORRECTION', { comments })
  return data as Evaluation
}

/**
 * Approves an evaluation and marks it completed.
 */
export const approveEvaluation = async (id: string, reviewerId: string, comments: string = ''): Promise<Evaluation> => {
  const { data, error } = await supabase
    .from('evaluations')
    .update({
      status: 'completed',
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error(`approveEvaluation failed for ID ${id}:`, error.message)
    throw new Error(error.message)
  }

  // Insert approved review approval record
  const { error: revError } = await supabase
    .from('review_approvals')
    .insert([
      {
        evaluation_id: id,
        reviewer_id: reviewerId,
        approval_status: 'approved',
        reviewer_comments: comments
      }
    ])

  if (revError) {
    console.error(`Failed to insert approved review approval for evaluation ${id}:`, revError.message)
  }

  await logAction(id, reviewerId, 'REVIEW_APPROVED', { comments })
  return data as Evaluation
}

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
