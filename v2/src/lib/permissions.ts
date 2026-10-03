// src/lib/permissions.ts
//
// Role-Based Access Control (RBAC) & BUPERSINST 1610.10H Visibility Rules.
// Summary groups, RSCA forecasting, and forced distribution quotas belong
// exclusively to Command Leadership (Reporting Senior and Admin).

import { Profile } from "@/types";

/**
 * Whether a user may create, edit, close, or manage summary groups and RSCA ledgers.
 * In accordance with BUPERSINST 1610.10H, summary groups and forced distribution
 * quotas are exclusively managed by the Reporting Senior (or delegated Admin / Triad).
 * Sailors and intermediate Raters do not create or manage summary groups.
 */
export function canManageSummaryGroups(profile?: Profile | null): boolean {
  if (!profile) return false;
  return profile.preferred_role === "Reporting Senior" || profile.preferred_role === "Admin";
}

/**
 * Who may view the Summary Group Average (Block 50a / Block 46a).
 * Reviewers (Rater, Senior Rater, Reporting Senior, Admin) may view it during review.
 * The evaluated Sailor does not see live cohort averages until the evaluation
 * is finalized (completed, locked, or debrief stage).
 */
export function canViewSummaryAverage(
  profile?: Profile | null,
  evalStatus?: string,
  routingStage?: string,
): boolean {
  if (!profile) return false;
  if (profile.preferred_role !== "Sailor") return true;
  return (
    evalStatus === "completed" ||
    evalStatus === "archived" ||
    routingStage === "debrief" ||
    routingStage === "locked"
  );
}

/**
 * Whether the user can edit summary group assignments directly on an evaluation.
 */
export function canAssignSummaryGroup(profile?: Profile | null): boolean {
  if (!profile) return false;
  return profile.preferred_role === "Reporting Senior" || profile.preferred_role === "Admin";
}
