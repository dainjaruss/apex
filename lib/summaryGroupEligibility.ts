// lib/summaryGroupEligibility.ts
//
// BUPERSINST 1610.10H summary-group membership.
//
// "A summary group consists of all reports that share all the characteristics in the
// following tables" — Encl (2), ch. 1, "EVAL BLOCK 46 / FITREP BLOCK 43 / CHIEFEVAL
// BLOCK 48 SUMMARY", p. 1-18. The tables are 1-4 (ENLISTED, E-1 through E-9, p. 1-22)
// and 1-3 (OFFICERS, W-1 through O-6, p. 1-19).
//
// Table 1-4, verbatim — group enlisted reports that share all of:
//
//   Blk 2  Rate                 "Group by current paygrade, regardless of rating."
//   Blk 5  Duty/Competitive     "For enlisted, group ACT and TAR together, group INACT,
//          Status                AT/ADOS separately."
//   Blk 6  UIC                  "If reporting seniors have more than one UIC, but desire to
//                                group all enlisted personnel together, they may do so. If
//                                multiple summary groups, Block 6 should match the primary
//                                UIC of the reporting senior in block 26."
//   Blk 8  Promotion Status     "Group by promotion status."
//   Blk 15 To                   "Group by ending date of report."
//   Blk 17-18 Type of Report    "Group by type of report."
//   Blk 21 Billet               "Group by entry in this block."
//   Blk 22 Reporting Senior     "Group by reporting senior."
//   Blk 45EV/48CE Promotion Rec "Must have Observed promotion recommendation."
//
// Table 1-3, verbatim, differs in four ways — group officer reports that share all of:
//
//   Blk 2  Grade/Rate           "Group by grade worn on report ending date."
//   Blk 3  Designator           "Group by competitive designator category (see below)."
//   Blk 5  Duty/Competitive     "Group by box marked in Block 5."
//          Status
//   Blk 8  Promotion Status     "Group by promotion status."
//   Blk 15 To                   "Group by ending date of report."
//   Blk 17-19 Type of Report    "Group by type of report."
//   Blk 21 Billet Subcategory   "Group by entry in this block."
//   Blk 22 Reporting Senior     "Group by reporting senior. (…)"
//   Blk 42 Promotion Rec        "Must have Observed promotion recommendation."
//
// i.e. officers add Block 3, take Block 19 into the type-of-report span, have NO Block 6
// UIC row at all, and do NOT merge ACT with TAR — p. 1-19 note: "Active, TAR, and INACT
// officers are separated in different summary groups by the entry in block 5."
//
// NOT MODELLED — Block 3 Designator, and this fails open for officer groups. The
// discriminator is the competitive CATEGORY, not the literal designator: pp. 1-19..1-21
// map e.g. "Unrestricted Line (URL) — URL 11xx/13xx/19xx" to one category, so guarding on
// the literal four digits would split 1110 from 1310 and produce FALSE REJECTIONS, which is
// worse than the current omission. The category list cannot be applied from Block 3 alone
// either: 61xx appears under both "Reserve Limited Duty Officer/Warrant Officer — Officer
// (Line) (61xx/62xx/63xx/64xx)" and "Active Limited Duty Officer — Surface (61xx)", and the
// instruction does not state the rule that picks between them (Block 5 is the obvious
// candidate; it is not written down). Encoding a guess would be an invented Navy rule.
// Consequence: two officer summary groups that differ ONLY by competitive category are
// indistinguishable to this module, so an officer may be offered a group they do not belong
// in. lib/forcedDistribution.ts has a separate, unrelated Block 3 gap (the LDO / non-LDO
// O-1/O-2 split); it is not closed by a column here, because that check needs the MEMBER's
// designator — already on evaluations.designator — not the group's.
//
// Verified 2026-07-31 against the LIVE BUPERSINST 1610.10H CH-2 (26 May 2026), fetched from
// MyNavyHR with the app's own undici client (curl 403s there), sha256 5e71ca59…dc9058: the
// text of Tables 1-3 and 1-4 is identical to the bundled CH-1 copy at
// my_tools/BUPERSINST 1610.10.pdf. Block 5's four boxes and Block 21's label are read from
// the blank forms in public/ (NAVPERS 1616/26, 1616/27, 1610/2), which outrank both.

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
  // Optional only because a caller may not have assembled them; both real call sites now do
  // (`components/EvaluationForm.tsx` from form state, `components/Reviewer/ReviewPanel.tsx`
  // from the whole Evaluation). An eval that omits them is treated as a blank Block 5 /
  // Block 21, which matches only a group that states the same.
  duty_status?: string | null;
  block_values?: {
    reporting_senior_dod_id?: string;
    billet_subcategory?: string;
  };
};

export type SummaryGroupWithRs = SummaryGroup & {
  reporting_senior_dod_id?: string | null;
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
 * Block 5 and Block 21 are UNCONDITIONAL in both tables and are enforced unconditionally
 * here — `null` means the group's reporting senior never stated the value, which is only
 * possible for a group created before migration 012 added the columns. Those rows keep
 * today's behaviour (unrestricted) rather than rejecting every member on data nobody
 * entered; every group the app can now create states both.
 *
 * Block 6 UIC is different and is NOT a bug: Table 1-4 makes it permissive ("they may do
 * so"), and Table 1-3 has no Block 6 row, so an unset UIC genuinely means "not splitting by
 * UIC" — for enlisted because the instruction allows it, for officers because there is
 * nothing to split by.
 *
 * ponytail: pre-012 rows stay unrestricted on Block 5/21 forever. Upgrade path is a
 * reporting-senior-facing "state Block 5/21 for this legacy group" edit, not a backfill —
 * inferring the value from current members would invent a rule the instruction lacks.
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

  // Block 6 UIC — permissive by Table 1-4, absent from Table 1-3. Empty means "not
  // splitting by UIC", so truthiness (not `!= null`) is the correct test here.
  if (group.uic && norm(ev.uic) !== norm(group.uic)) return false;

  // Block 5 Duty/Competitive Status (Table 1-4 enlisted / Table 1-3 officer).
  if (
    group.duty_status != null &&
    dutyStatusBucket(ev.duty_status, evRt) !==
      dutyStatusBucket(group.duty_status, gRt)
  )
    return false;

  // Block 21 Billet — "Group by entry in this block." The forms print "(if any)", so a
  // stated-blank entry ('') is itself an entry and groups only with blank; `!= null`, not
  // truthiness, is what keeps that distinct from an unstated pre-012 group (null).
  if (
    group.billet_subcategory != null &&
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
  // Block 5 and Block 21 are shown because two groups may now differ ONLY by those, and a
  // reporting senior picking from a list has to be able to tell them apart.
  return (
    `${g.name} · ${g.grade_rate}` +
    `${g.uic ? ` · UIC ${g.uic}` : ""}` +
    `${g.duty_status ? ` · ${g.duty_status}` : ""}` +
    `${g.billet_subcategory ? ` · Billet ${g.billet_subcategory}` : ""}` +
    ` · ${g.promotion_status} · ends ${g.period_to}`
  );
}
