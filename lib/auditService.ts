// lib/auditService.ts
//
// DB Service layer for logging and retrieving evaluation lifecycle audit logs.
//

import { createBrowserClient } from './supabaseClient'

const supabase = createBrowserClient()

export interface AuditLog {
  id?: string;
  evaluation_id: string;
  user_id: string;
  action: string;
  details?: Record<string, any>;
  timestamp?: string;
}

/**
 * Inserts a new audit log entry for tracking report actions.
 */
export const logAction = async (
  evaluationId: string,
  userId: string,
  action: string,
  details: Record<string, any> = {}
) => {
  const { data, error } = await supabase
    .from('audit_logs')
    .insert([
      {
        evaluation_id: evaluationId,
        user_id: userId,
        action,
        details,
      },
    ])
    .select()
    .single()

  if (error) {
    console.error('logAction DB operation failed:', error.message)
  }
  return data
}

/**
 * Retrieves audit logs for a specific evaluation, including user profile details.
 */
export const fetchAuditLogs = async (evaluationId: string) => {
  const { data, error } = await supabase
    .from('audit_logs')
    .select(`
      id,
      evaluation_id,
      user_id,
      action,
      details,
      timestamp,
      profiles (
        first_name,
        last_name,
        preferred_role
      )
    `)
    .eq('evaluation_id', evaluationId)
    .order('timestamp', { ascending: false })

  if (error) {
    console.error(`fetchAuditLogs failed for evaluation ${evaluationId}:`, error.message)
    throw new Error(error.message)
  }
  return data
}
