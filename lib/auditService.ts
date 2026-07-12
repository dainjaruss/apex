// lib/auditService.ts
//
// DB Service layer for logging and retrieving evaluation lifecycle audit logs.
//

import { createBrowserClient } from "./supabaseClient";

const supabase = createBrowserClient();

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
  details: Record<string, any> = {},
) => {
  const { data, error } = await supabase
    .from("audit_logs")
    .insert([
      {
        evaluation_id: evaluationId,
        user_id: userId,
        action,
        details,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("logAction DB operation failed:", error.message);
  }
  return data;
};

/**
 * Retrieves audit logs for a specific evaluation, enriched with the acting user's
 * profile. We fetch profiles separately and merge rather than using a PostgREST embed,
 * because audit_logs.user_id references auth.users (not public.profiles), so there is no
 * direct relationship for the embed to resolve.
 */
export const fetchAuditLogs = async (evaluationId: string) => {
  const { data: logs, error } = await supabase
    .from("audit_logs")
    .select("id, evaluation_id, user_id, action, details, timestamp")
    .eq("evaluation_id", evaluationId)
    .order("timestamp", { ascending: false });

  if (error) {
    console.error(
      `fetchAuditLogs failed for evaluation ${evaluationId}:`,
      error.message,
    );
    throw new Error(error.message);
  }
  if (!logs || logs.length === 0) return [];

  const userIds = Array.from(
    new Set(logs.map((l) => l.user_id).filter(Boolean)),
  );
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, last_name, preferred_role")
    .in("id", userIds);

  const byId = new Map((profiles || []).map((p) => [p.id, p]));
  return logs.map((l) => ({ ...l, profiles: byId.get(l.user_id) || null }));
};
