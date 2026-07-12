// lib/summaryGroupEligibility.ts
//
// BUPERSINST 1610.10H summary-group membership: enlisted promotion-recommendation
// groups combine members in the same paygrade (regardless of rating) and same
// promotion status who receive the same type of report from the same reporting
// senior on the same ending date — with UIC as a further breakout.

import { Evaluation, SummaryGroup } from "@/types";
import { samePaygrade } from "./paygrade";

export type EvalForSummaryGroup = Pick<
  Evaluation,
  | "grade_rate"
  | "promotion_status"
  | "period_to"
  | "report_type"
  | "uic"
  | "summary_group_id"
> & {
  block_values?: { reporting_senior_dod_id?: string };
};

export type SummaryGroupWithRs = SummaryGroup & {
  reporting_senior_dod_id?: string | null;
};

const norm = (s?: string | null) => (s ?? "").trim();
const normDate = (d?: string | null) => (d ? d.slice(0, 10) : "");

/**
 * True when an evaluation may join (or remain in) the given summary group.
 * An already-attached group is always eligible so the member can detach it.
 */
export function isEvalEligibleForSummaryGroup(
  ev: EvalForSummaryGroup,
  group: SummaryGroupWithRs,
): boolean {
  if (ev.summary_group_id && group.id === ev.summary_group_id) return true;
  if (group.status === "closed") return false;

  if (!samePaygrade(ev.grade_rate, group.grade_rate)) return false;
  if (norm(ev.promotion_status) !== norm(group.promotion_status)) return false;

  const evRt = norm(ev.report_type) || "EVAL";
  const gRt = norm(group.report_type) || "EVAL";
  if (evRt !== gRt) return false;

  if (normDate(ev.period_to) !== normDate(group.period_to)) return false;

  if (group.uic && norm(ev.uic) !== norm(group.uic)) return false;

  const evRs = norm(ev.block_values?.reporting_senior_dod_id);
  const gRs = norm(group.reporting_senior_dod_id);
  if (evRs && gRs && evRs !== gRs) return false;

  return true;
}

/** Open groups (plus the eval's current attachment) that match BUPERS eligibility. */
export function visibleSummaryGroupsForEval(
  ev: EvalForSummaryGroup,
  groups: SummaryGroupWithRs[],
): SummaryGroupWithRs[] {
  const eligible = groups.filter((g) => isEvalEligibleForSummaryGroup(ev, g));
  const currentId = ev.summary_group_id;
  const attached = currentId ? groups.find((g) => g.id === currentId) : null;
  if (attached && !eligible.some((g) => g.id === attached.id)) {
    return [attached, ...eligible];
  }
  return eligible;
}

export function describeSummaryGroup(g: SummaryGroup): string {
  return `${g.name} · ${g.grade_rate}${g.uic ? ` · UIC ${g.uic}` : ""} · ${g.promotion_status} · ends ${g.period_to}`;
}
