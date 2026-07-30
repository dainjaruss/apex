// lib/summaryGroupEligibility.ts
//
// BUPERSINST 1610.10H summary-group membership.
//
// The full discriminator list is Table 1-4 (ENLISTED, E-1 through E-9) — Table 1-3 is the
// OFFICER table. Table 1-4, verbatim, groups reports that share ALL of:
//
//   Blk 2  Rate                 "Group by current paygrade, regardless of rating."
//   Blk 5  Duty/Competitive     "For enlisted, group ACT and TAR together, group INACT,
//          Status                AT/ADOS separately."
//   Blk 6  UIC                  (reporting seniors with several UICs may group together)
//   Blk 8  Promotion Status     "Group by promotion status."
//   Blk 15 To                   "Group by ending date of report."
//   Blk 17-18 Type of Report    "Group by type of report."
//   Blk 21 Billet               "Group by entry in this block."
//   Blk 22 Reporting Senior     "Group by reporting senior."
//   Blk 45EV/48CE Promotion Rec "Must have Observed promotion recommendation."
//
// Table 1-3 (officers, W-1 through O-6) differs on Block 5: "Group by box marked in Block 5",
// with the note "Active, TAR, and INACT officers are separated in different summary groups by
// the entry in block 5" — i.e. NO ACT/TAR merge for officers. That is the only Block 5
// difference this module models; Block 3 designator (officer-only) is not modelled.
//
// Verified 2026-07-29 against BUPERSINST 1610.10H CH-2 (26 May 2026): CH-2 revised only
// Encl (2) chapter 3, so Tables 1-3/1-4 on pp. 1-19/1-22 are unchanged from the bundled copy.

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
  // Block 5 and Block 21 are optional because not every caller assembles them:
  // `components/EvaluationForm.tsx` builds its eval context from form state and supplies
  // neither, so the Block 5 / Block 21 discriminators cannot fire from that call site even
  // once groups carry the values. `components/Reviewer/ReviewPanel.tsx` passes a whole
  // Evaluation and does supply both.
  duty_status?: string | null;
  block_values?: {
    reporting_senior_dod_id?: string;
    billet_subcategory?: string;
  };
};

export type SummaryGroupWithRs = SummaryGroup & {
  reporting_senior_dod_id?: string | null;
  // Block 5 / Block 21 discriminators. Not yet columns on public.summary_groups — see the
  // note on isEvalEligibleForSummaryGroup below.
  duty_status?: string | null;
  billet_subcategory?: string | null;
};

const norm = (s?: string | null) => (s ?? "").trim();
const normDate = (d?: string | null) => (d ? d.slice(0, 10) : "");

/**
 * Block 5 bucket. Enlisted (EVAL / CHIEFEVAL) merge ACT and TAR into one group and keep INACT
 * and AT/ADOS separate (Table 1-4). Officers (FITREP) group strictly by the box marked
 * (Table 1-3), so the value is used as-is.
 */
export function dutyStatusBucket(
  dutyStatus?: string | null,
  reportType?: string | null,
): string {
  const s = norm(dutyStatus).toUpperCase();
  if (norm(reportType).toUpperCase() === "FITREP") return s;
  return s === "ACT" || s === "TAR" ? "ACT/TAR" : s;
}

/**
 * True when an evaluation may join (or remain in) the given summary group.
 * An already-attached group is always eligible so the member can detach it.
 *
 * ⚠️ Block 6 UIC, Block 5 duty status and Block 21 billet are only enforced when the GROUP
 * carries the value. `public.summary_groups` currently has columns for none of the three
 * (migration 002 defines name, reporting_senior_id, period_to, grade_rate, promotion_status,
 * command_employment, report_type, status), so all three discriminators are inert against
 * live data until a migration adds the columns and the create-group form collects them.
 * That was already true of `uic` before this change; the same guard shape is kept here rather
 * than inventing a second convention.
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

  // Block 5 Duty/Competitive Status (Table 1-4 enlisted / Table 1-3 officer).
  if (
    group.duty_status &&
    dutyStatusBucket(ev.duty_status, evRt) !==
      dutyStatusBucket(group.duty_status, gRt)
  )
    return false;

  // Block 21 Billet — "Group by entry in this block."
  if (
    group.billet_subcategory &&
    norm(ev.block_values?.billet_subcategory).toUpperCase() !==
      norm(group.billet_subcategory).toUpperCase()
  )
    return false;

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
