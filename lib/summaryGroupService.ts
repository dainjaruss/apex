// lib/summaryGroupService.ts
//
// CRUD for promotion-recommendation summary groups. Inserts are gated by RLS
// (has_oversight); members may read all groups to pick one. Attaching a group to an
// eval lets the DB trigger inherit the five shared BUPERSINST fields.

import { createBrowserClient } from './supabaseClient'
import { SummaryGroup } from '@/types'
import { computeSummaryGroupAverage, SummaryGroupAverageResult } from './traitAverage'
import { RecDistribution } from './forcedDistribution'

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

/**
 * Block 50a pooled average for an evaluation via the service-role route, which both bypasses RLS
 * (so peers are counted) and enforces who may see it (reviewers always; the member only once the
 * report is finalized). Pass excludeSelf for the PEERS-only pool — the draft form combines it live
 * with the member's in-progress grades. Omit it to pool the whole group (report / export screens).
 * Throws on 403 when the caller isn't permitted to see the value.
 */
export const fetchGroupAveragePool = async (
  evaluationId: string,
  excludeSelf?: boolean,
): Promise<SummaryGroupAverageResult> => {
  const res = await fetch('/api/summary-average', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evaluationId, excludeSelf }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Failed to fetch summary group average')
  return json as SummaryGroupAverageResult
}

/**
 * Block 46 distribution (counts per observed promotion-recommendation category) for an eval's
 * summary group, via the service-role route (RLS-bypassed + visibility-gated). Pass excludeSelf for
 * the peers-only tally so the draft form can add the member's live recommendation.
 */
export const fetchGroupDistribution = async (
  evaluationId: string,
  excludeSelf?: boolean,
): Promise<{ distribution: RecDistribution; observedCount: number }> => {
  const res = await fetch('/api/summary-distribution', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ evaluationId, excludeSelf }),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(json.error || 'Failed to fetch summary group distribution')
  return json as { distribution: RecDistribution; observedCount: number }
}

/**
 * Every member's promotion_recommendation in a group, read with the browser client. Used by the
 * Reporting Senior's summary-groups page, where RLS oversight already exposes all group members.
 */
export const getGroupRecommendations = async (groupId: string): Promise<string[]> => {
  const { data, error } = await supabase
    .from('evaluations')
    .select('promotion_recommendation')
    .eq('summary_group_id', groupId)
  if (error) throw new Error(error.message)
  return (data || []).map((e: any) => e.promotion_recommendation)
}

/** Attach (or detach with null) a summary group to an eval; the DB trigger inherits fields. */
export const attachSummaryGroup = async (evaluationId: string, groupId: string | null) => {
  const { error } = await supabase
    .from('evaluations')
    .update({ summary_group_id: groupId })
    .eq('id', evaluationId)
  if (error) throw new Error(error.message)
}
