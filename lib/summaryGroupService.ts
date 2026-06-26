// lib/summaryGroupService.ts
//
// CRUD for promotion-recommendation summary groups. Inserts are gated by RLS
// (has_oversight); members may read all groups to pick one. Attaching a group to an
// eval lets the DB trigger inherit the five shared BUPERSINST fields.

import { createBrowserClient } from './supabaseClient'
import { SummaryGroup } from '@/types'
import { computeSummaryGroupAverage, SummaryGroupAverageResult } from './traitAverage'

const supabase = createBrowserClient()

export const createSummaryGroup = async (group: SummaryGroup, createdBy: string): Promise<SummaryGroup> => {
  const { data, error } = await supabase
    .from('summary_groups')
    .insert([{ ...group, created_by: createdBy }])
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data as SummaryGroup
}

export const listSummaryGroups = async (): Promise<SummaryGroup[]> => {
  const { data, error } = await supabase
    .from('summary_groups')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []) as SummaryGroup[]
}

export const listOpenGroups = async (): Promise<SummaryGroup[]> => {
  const { data, error } = await supabase
    .from('summary_groups')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []) as SummaryGroup[]
}

/** Open/close a group (closed = no new members may join). */
export const setGroupStatus = async (groupId: string, status: 'open' | 'closed') => {
  const { error } = await supabase.from('summary_groups').update({ status }).eq('id', groupId)
  if (error) throw new Error(error.message)
}

/** The evaluations that belong to a group (visible per RLS — oversight sees all). */
export const listEvalsInGroup = async (groupId: string) => {
  const { data, error } = await supabase
    .from('evaluations')
    .select('id, member_name, grade_rate, routing_stage')
    .eq('summary_group_id', groupId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

/**
 * Block 50 Summary Group Average: the pooled average of every graded trait grade across
 * all evaluations in the group (EVALMAN: sum all graded Blocks 33-39 grades ÷ number of
 * graded traits). Recomputed from each member's trait grades (authoritative, never
 * stale); NOB traits — and wholly-NOB reports — do not contribute.
 */
export const getSummaryGroupAverage = async (groupId: string): Promise<SummaryGroupAverageResult> => {
  const { data, error } = await supabase
    .from('evaluations')
    .select('id, trait_grades')
    .eq('summary_group_id', groupId)
  if (error) throw new Error(error.message)
  const memberGrades = (data || []).map((e: any) => e.trait_grades)
  return computeSummaryGroupAverage(memberGrades)
}

/** Attach (or detach with null) a summary group to an eval; the DB trigger inherits fields. */
export const attachSummaryGroup = async (evaluationId: string, groupId: string | null) => {
  const { error } = await supabase
    .from('evaluations')
    .update({ summary_group_id: groupId })
    .eq('id', evaluationId)
  if (error) throw new Error(error.message)
}
