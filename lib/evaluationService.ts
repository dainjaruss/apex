// lib/evaluationService.ts
//
// DB Service layer for querying and persisting EVAL records in Supabase.
//

import { createBrowserClient } from './supabaseClient'
import { Evaluation } from '../types'

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

  const query = evalData.id
    ? supabase.from('evaluations').update(payload).eq('id', evalData.id)
    : supabase.from('evaluations').insert([payload])

  const { data, error } = await query.select().single()
  if (error) {
    console.error('saveDraft DB operation failed:', error.message)
    throw new Error(error.message)
  }
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
