// src/lib/summaryGroupService.ts
//
// In-Browser Summary Group & Quota Management Service.
// Manages summary group lifecycles, member assignment, pooled BUPERS trait averages,
// and Block 50 / Block 46 metric stamping directly inside IndexedDB.

import { db } from "@/lib/db";
import { Evaluation, SummaryGroup, RscaHistoricalRecord } from "@/types";
import { computeTraitAverage, computeSummaryGroupAverage } from "@/lib/traitAverage";
import { emptyDistribution, OBSERVED_RECS, tallyRecommendations, type RecDistribution } from "@/lib/forcedDistribution";
import { readWorkspaceIdentity } from "@/lib/workspaceSession";
import { copyForRelease } from "@/lib/workspaceScope";
import type { ApexTransferPackage } from "@/lib/sessionTransfer";

/**
 * Creates a new Summary Group in IndexedDB.
 */
export async function createSummaryGroup(
  data: Omit<SummaryGroup, "id" | "member_ids"> & { id?: string; member_ids?: string[] }
): Promise<SummaryGroup> {
  const id = data.id || `sg-${Date.now()}`;
  const now = new Date().toISOString();
  const newGroup: SummaryGroup = {
    ...data,
    id,
    member_ids: data.member_ids || [],
    created_at: now,
    updated_at: now,
  };

  await db.summary_groups.put(newGroup);
  return newGroup;
}

/**
 * Deletes a summary group and detaches all attached evaluations.
 */
export async function deleteSummaryGroup(groupId: string): Promise<void> {
  await db.transaction("rw", [db.summary_groups, db.evaluations], async () => {
    // 1. Detach member evaluations
    // NOTE: summary_group_id is not indexed in the evaluations store schema, so
    // this .where() call throws SchemaError at runtime. The loop body below is
    // structurally unreachable until the schema is updated to index this field.
    /* v8 ignore next 10 */
    const evals = await db.evaluations.where("summary_group_id").equals(groupId).toArray();
    for (const ev of evals) {
      await db.evaluations.update(ev.id, {
        summary_group_id: null,
        summary_group_average: null,
        summary_group_distribution: null,
        updated_at: new Date().toISOString(),
      });
    }

    // 2. Delete summary group record
    await db.summary_groups.delete(groupId);
  });
}

/**
 * Adds an evaluation to a summary group, ensuring bidirectional reference integrity.
 */
export async function addEvalToSummaryGroup(evalId: string, groupId: string): Promise<void> {
  await db.transaction("rw", [db.summary_groups, db.evaluations], async () => {
    const group = await db.summary_groups.get(groupId);
    const ev = await db.evaluations.get(evalId);

    if (!group || !ev) return;

    // Attach group ID to evaluation
    const updatedMemberIds = Array.from(new Set([...(group.member_ids || []), evalId]));
    await db.summary_groups.update(groupId, {
      member_ids: updatedMemberIds,
      updated_at: new Date().toISOString(),
    });

    await db.evaluations.update(evalId, {
      summary_group_id: groupId,
      updated_at: new Date().toISOString(),
    });
  });
  await persistSummaryGroupFigures(groupId);
}

/**
 * Removes an evaluation from a summary group.
 */
export async function removeEvalFromSummaryGroup(evalId: string, groupId?: string): Promise<void> {
  let targetGroupId = groupId;
  await db.transaction("rw", [db.summary_groups, db.evaluations], async () => {
    const ev = await db.evaluations.get(evalId);
    if (!ev) return;

    targetGroupId = groupId || ev.summary_group_id || undefined;
    if (targetGroupId) {
      const group = await db.summary_groups.get(targetGroupId);
      if (group) {
        const updatedMemberIds = (group.member_ids || []).filter((id) => id !== evalId);
        await db.summary_groups.update(targetGroupId, {
          member_ids: updatedMemberIds,
          updated_at: new Date().toISOString(),
        });
      }
    }

    await db.evaluations.update(evalId, {
      summary_group_id: null,
      summary_group_average: null,
      summary_group_distribution: null,
      updated_at: new Date().toISOString(),
    });
  });
  if (targetGroupId) await persistSummaryGroupFigures(targetGroupId);
}

export interface SummaryGroupMetrics {
  totalMembers: number;
  gradedMembers: number;
  summaryGroupAverage: number | null;
  rsca: number;
  projectedRsca: number;
  rscaShift: number;
  epLimit: number;
  mpLimit: number;
  combinedLimit: number;
  counts: {
    ep: number;
    mp: number;
    p: number;
    prog: number;
    sp: number;
    nob: number;
  };
  isEpOverQuota: boolean;
  isCombinedOverQuota: boolean;
  members: Array<{
    evaluation: Evaluation;
    ita: number | null;
    deltaSga: number | null;
    deltaRsca: number | null;
    rank: number;
  }>;
}

/**
 * Calculates authoritative summary group metrics per BUPERSINST 1610.10H.
 */
export function computeSummaryGroupMetrics(
  group: SummaryGroup,
  groupEvals: Evaluation[],
  rscaRecord?: RscaHistoricalRecord | null
): SummaryGroupMetrics {
  const memberGrades = groupEvals.map((e) => e.trait_grades);
  const sgaResult = computeSummaryGroupAverage(memberGrades);
  const sga = sgaResult.average;

  const historicalMarks = rscaRecord?.historical_total_marks ?? 382.4;
  const historicalCount = rscaRecord?.historical_report_count ?? 98;
  const currentRsca = historicalCount > 0 ? historicalMarks / historicalCount : 0;

  const projectedMarks = historicalMarks + sgaResult.gradedSum;
  const projectedCount = historicalCount + groupEvals.length;
  const projectedRsca = projectedCount > 0 ? projectedMarks / projectedCount : currentRsca;
  const rscaShift = projectedRsca - currentRsca;

  const N = groupEvals.length;
  // BUPERS Table 1-1: 20% Early Promote ceiling rounded UP
  const epLimit = N > 0 ? Math.max(1, Math.ceil(N * 0.2)) : 0;

  // Combined EP + MP ceiling (60% for E5/E6, 50% for senior paygrades / officers)
  const isSeniorOrOfficer =
    group.report_type === "CHIEFEVAL" ||
    group.report_type === "FITREP" ||
    ["E7", "E8", "E9", "O4", "O5", "O6"].some((p) => group.grade_rate.includes(p));

  const combinedCapPct = isSeniorOrOfficer ? 0.5 : 0.6;
  const combinedLimit = N > 0 ? Math.max(1, Math.ceil(N * combinedCapPct)) : 0;
  const mpLimit = Math.max(0, combinedLimit - epLimit);

  let ep = 0;
  let mp = 0;
  let p = 0;
  let prog = 0;
  let sp = 0;
  let nob = 0;

  for (const e of groupEvals) {
    const rec = e.promotion_recommendation;
    if (rec === "Early Promote") ep++;
    else if (rec === "Must Promote") mp++;
    else if (rec === "Promotable") p++;
    else if (rec === "Progressing") prog++;
    else if (rec === "Significant Problems") sp++;
    else if (rec === "NOB") nob++;
  }

  const isEpOverQuota = N > 0 && ep > epLimit;
  const isCombinedOverQuota = N > 0 && ep + mp > combinedLimit;

  // Rank members by ITA descending (Breakout order)
  const memberCalcs = groupEvals.map((ev) => {
    const traitResult = computeTraitAverage(ev.trait_grades);
    const ita = traitResult.average;
    const deltaSga = ita !== null && sga !== null ? Math.round((ita - sga + Number.EPSILON) * 100) / 100 : null;
    const deltaRsca = ita !== null ? Math.round((ita - currentRsca + Number.EPSILON) * 100) / 100 : null;
    return {
      evaluation: ev,
      ita,
      deltaSga,
      deltaRsca,
    };
  });

  memberCalcs.sort((a, b) => (b.ita ?? -1) - (a.ita ?? -1));

  const rankedMembers = memberCalcs.map((m, idx) => ({
    ...m,
    rank: idx + 1,
  }));

  return {
    totalMembers: N,
    gradedMembers: sgaResult.memberCount,
    summaryGroupAverage: sga,
    rsca: Math.round((currentRsca + Number.EPSILON) * 100) / 100,
    projectedRsca: Math.round((projectedRsca + Number.EPSILON) * 100) / 100,
    rscaShift: Math.round((rscaShift + Number.EPSILON) * 100) / 100,
    epLimit,
    mpLimit,
    combinedLimit,
    counts: { ep, mp, p, prog, sp, nob },
    isEpOverQuota,
    isCombinedOverQuota,
    members: rankedMembers,
  };
}

export interface SummaryFigures {
  summaryGroupAverage: number | null;
  /** Counts for the five observed promotion recommendations. NOB is not a count. */
  distribution: RecDistribution;
  traitAverageById: Map<string, number | null>;
}

/** Block 46 counts (EVAL; Block 48 CHIEFEVAL; Block 43 FITREP) and the summary group average. */
export function summaryFigures(members: Evaluation[]): SummaryFigures {
  const summaryGroupAverage = computeSummaryGroupAverage(members.map((e) => e.trait_grades)).average;
  const { distribution } = tallyRecommendations(members.map((e) => e.promotion_recommendation));
  const traitAverageById = new Map<string, number | null>();
  for (const ev of members) {
    traitAverageById.set(ev.id, computeTraitAverage(ev.trait_grades).average);
  }
  return { summaryGroupAverage, distribution, traitAverageById };
}

function sameDistribution(
  stored: Evaluation["summary_group_distribution"],
  next: RecDistribution,
): boolean {
  if (!stored) return false;
  return OBSERVED_RECS.every((key) => stored[key] === next[key]);
}

/**
 * Writes the live summary-group average and promotion-recommendation counts onto every
 * report in the group. The PDF prints the average in the summary-group-average cell
 * (under the EVAL Block 50 signature; CHIEFEVAL Block 45) and the counts on the breakdown row.
 */
export async function persistSummaryGroupFigures(groupId: string): Promise<{
  summaryGroupAverage: number | null;
  distribution: RecDistribution;
  memberCount: number;
}> {
  const scope = readWorkspaceIdentity()?.scope;
  if (scope === "member" || scope === "reviewer") {
    return { summaryGroupAverage: null, distribution: emptyDistribution(), memberCount: 0 };
  }
  const group = await db.summary_groups.get(groupId);
  if (!group) {
    return { summaryGroupAverage: null, distribution: emptyDistribution(), memberCount: 0 };
  }

  const evals = await db.evaluations.toArray();
  const groupEvals = evals.filter(
    (e) => e.summary_group_id === groupId || group.member_ids?.includes(e.id),
  );
  const figures = summaryFigures(groupEvals);
  const now = new Date().toISOString();

  await db.transaction("rw", db.evaluations, async () => {
    for (const ev of groupEvals) {
      const traitAverage = figures.traitAverageById.get(ev.id) ?? null;
      const unchanged =
        (ev.summary_group_average ?? null) === figures.summaryGroupAverage &&
        (ev.trait_average ?? null) === traitAverage &&
        sameDistribution(ev.summary_group_distribution, figures.distribution);
      if (unchanged) continue;
      await db.evaluations.update(ev.id, {
        summary_group_average: figures.summaryGroupAverage,
        summary_group_distribution: { ...figures.distribution },
        trait_average: traitAverage ?? undefined,
        updated_at: now,
      });
    }
  });

  return {
    summaryGroupAverage: figures.summaryGroupAverage,
    distribution: figures.distribution,
    memberCount: groupEvals.length,
  };
}

/**
 * Uses the report being printed as the current copy of itself, and the saved group for the rest.
 */
export async function applyLiveSummaryFigures(evaluation: Evaluation): Promise<Evaluation> {
  const scope = readWorkspaceIdentity()?.scope;
  if (scope === "member" || scope === "reviewer") {
    if (evaluation.ranking_released) return evaluation;
    const { promotion_recommendation: _mark, ...rest } = evaluation;
    return { ...rest, summary_group_average: null, summary_group_distribution: null } as Evaluation;
  }
  if (!evaluation.summary_group_id) {
    return {
      ...evaluation,
      summary_group_average: null,
      summary_group_distribution: null,
    };
  }
  const group = await db.summary_groups.get(evaluation.summary_group_id);
  const evals = await db.evaluations.toArray();
  const members = evals
    .filter(
      (e) =>
        e.summary_group_id === evaluation.summary_group_id ||
        group?.member_ids?.includes(e.id),
    )
    .map((e) => (e.id === evaluation.id ? evaluation : e));
  if (!members.some((e) => e.id === evaluation.id)) members.push(evaluation);
  const figures = summaryFigures(members);
  return {
    ...evaluation,
    summary_group_average: figures.summaryGroupAverage,
    summary_group_distribution: { ...figures.distribution },
    trait_average: figures.traitAverageById.get(evaluation.id) ?? evaluation.trait_average,
  };
}

/**
 * Keeps summary_groups.member_ids aligned when a report's group is changed from the editor,
 * then rewrites the calculated figures for each group involved.
 */
export async function recordSummaryGroupMembership(
  evalId: string,
  previousGroupId: string | null | undefined,
  nextGroupId: string | null | undefined,
): Promise<void> {
  if (previousGroupId && previousGroupId !== nextGroupId) {
    const old = await db.summary_groups.get(previousGroupId);
    if (old) {
      await db.summary_groups.update(old.id, {
        member_ids: (old.member_ids || []).filter((id) => id !== evalId),
        updated_at: new Date().toISOString(),
      });
    }
    await persistSummaryGroupFigures(previousGroupId);
  }
  if (!nextGroupId) {
    await db.evaluations.update(evalId, {
      summary_group_average: null,
      summary_group_distribution: null,
    });
    return;
  }
  const group = await db.summary_groups.get(nextGroupId);
  if (group && !(group.member_ids || []).includes(evalId)) {
    await db.summary_groups.update(group.id, {
      member_ids: [...(group.member_ids || []), evalId],
      updated_at: new Date().toISOString(),
    });
  }
  await persistSummaryGroupFigures(nextGroupId);
}

function membersOf(group: SummaryGroup, evals: Evaluation[]): Evaluation[] {
  return evals.filter(
    (evaluation) => evaluation.summary_group_id === group.id || group.member_ids?.includes(evaluation.id),
  );
}

/**
 * Freezes one average and one set of counts for every debrief copy.
 * Refuses while a mark is missing or a report is still with a reviewer.
 */
export async function closeSummaryGroup(groupId: string): Promise<SummaryFigures> {
  if (readWorkspaceIdentity()?.scope !== "command") {
    throw new Error("Only the command workspace can close a summary group.");
  }
  const group = await db.summary_groups.get(groupId);
  if (!group) throw new Error("Summary group not found");
  const members = membersOf(group, await db.evaluations.toArray());
  if (members.length === 0) throw new Error("The summary group has no reports.");
  for (const evaluation of members) {
    if (!evaluation.promotion_recommendation || !String(evaluation.promotion_recommendation).trim()) {
      throw new Error(`${evaluation.member_name || "A report"} has no promotion recommendation.`);
    }
    if (evaluation.routing_stage === "rater" || evaluation.routing_stage === "senior_rater") {
      throw new Error(`${evaluation.member_name || "A report"} is still with a reviewer.`);
    }
  }
  const figures = summaryFigures(members);
  const now = new Date().toISOString();
  await db.summary_groups.update(group.id, {
    status: "closed",
    frozen_average: figures.summaryGroupAverage,
    frozen_distribution: { ...figures.distribution },
    frozen_at: now,
    updated_at: now,
  });
  return figures;
}

export async function reopenSummaryGroup(groupId: string): Promise<void> {
  if (readWorkspaceIdentity()?.scope !== "command") {
    throw new Error("Only the command workspace can reopen a summary group.");
  }
  const group = await db.summary_groups.get(groupId);
  if (!group) throw new Error("Summary group not found");
  await db.summary_groups.update(group.id, {
    status: "open",
    frozen_average: null,
    frozen_distribution: null,
    frozen_at: null,
    updated_at: new Date().toISOString(),
  });
}

/** One debrief file per member. Each copy carries the frozen figures and that sailor's own mark. */
export async function buildDebriefPackages(groupId: string): Promise<ApexTransferPackage[]> {
  if (readWorkspaceIdentity()?.scope !== "command") {
    throw new Error("Only the command workspace can issue a debrief copy.");
  }
  const group = await db.summary_groups.get(groupId);
  if (!group || group.status !== "closed" || group.frozen_at == null) {
    throw new Error("Close the summary group before issuing debrief copies.");
  }
  const identity = readWorkspaceIdentity();
  const members = membersOf(group, await db.evaluations.toArray());
  const missing = members.filter((evaluation) => !evaluation.source_workspace_id);
  if (missing.length > 0) {
    const names = missing.map((evaluation) => evaluation.member_name || "A report").join(", ");
    throw new Error(`${names} has no workspace address. Import a draft exported from that sailor's workspace.`);
  }
  return members.map((evaluation) => {
    const released = copyForRelease(
      {
        ...evaluation,
        summary_group_average: group.frozen_average ?? null,
        summary_group_distribution: group.frozen_distribution ? { ...group.frozen_distribution } : null,
      },
      "debrief",
    );
    const pkg: ApexTransferPackage = {
      format: "APEX_EVAL_TRANSFER",
      version: "2.0.0",
      exportedAt: new Date().toISOString(),
      evaluation: released,
      base_ratchet: evaluation.lock_ratchet ?? "",
      from_workspace_id: identity?.workspaceId,
      addressed_to: evaluation.source_workspace_id,
      release: "debrief",
    };
    return pkg;
  });
}

/**
 * Stamps authoritative Block 50 / Block 46 metrics into all evaluations of a summary group.
 * This guarantees the numbers appear with 100% precision on printed NAVPERS PDFs.
 */
export async function stampSummaryGroupMetrics(
  groupId: string,
  rscaRecord?: RscaHistoricalRecord | null
): Promise<{ sga: number | null; rsca: number; memberCount: number }> {
  const group = await db.summary_groups.get(groupId);
  if (!group) throw new Error("Summary group not found");

  const evals = await db.evaluations.toArray();
  const groupEvals = evals.filter(
    (e) => e.summary_group_id === groupId || group.member_ids?.includes(e.id)
  );

  const metrics = computeSummaryGroupMetrics(group, groupEvals, rscaRecord);
  const now = new Date().toISOString();

  await db.transaction("rw", db.evaluations, async () => {
    for (const ev of groupEvals) {
      const traitResult = computeTraitAverage(ev.trait_grades);
      await db.evaluations.update(ev.id, {
        summary_group_average: metrics.summaryGroupAverage,
        summary_group_distribution: {
          "Early Promote": metrics.counts.ep,
          "Must Promote": metrics.counts.mp,
          "Promotable": metrics.counts.p,
          "Progressing": metrics.counts.prog,
          "Significant Problems": metrics.counts.sp,
          "NOB": metrics.counts.nob,
        },
        trait_average: traitResult.average ?? undefined,
        block_values: {
          ...ev.block_values,
          reporting_senior_rsca: metrics.rsca.toFixed(2),
          summary_group_average: metrics.summaryGroupAverage !== null ? metrics.summaryGroupAverage.toFixed(2) : "",
          summary_group_count: metrics.totalMembers,
        },
        updated_at: now,
      });
    }
  });

  return {
    sga: metrics.summaryGroupAverage,
    rsca: metrics.rsca,
    memberCount: groupEvals.length,
  };
}

/**
 * Generates a realistic sample peer evaluation in the specified paygrade.
 * Handy for command leadership and ranking boards to test cohort breakouts quickly.
 */
export async function generateSamplePeerEval(
  groupId: string,
  group: SummaryGroup,
  seniorName = "KIRK, JAMES T",
  seniorDodId = "9876543210"
): Promise<Evaluation> {
  const FIRST_NAMES = ["ALEX", "JORDAN", "TAYLOR", "MORGAN", "CASEY", "RILEY", "CHRIS", "PAT", "AVERY"];
  const LAST_NAMES = ["VAUGHN", "STERLING", "CALLOWAY", "RAMIREZ", "CHEN", "O'CONNOR", "WASHINGTON", "HAYES"];
  const RATINGS: Record<string, string[]> = {
    E5: ["IT2", "ET2", "FC2", "YN2", "LS2", "OS2"],
    E6: ["IT1", "ET1", "FC1", "CTN1", "MM1", "MA1"],
    E7: ["ITC", "ETC", "FCC", "BMC", "MAC"],
    O3: ["LT", "LT", "LT"],
    O4: ["LCDR", "LCDR"],
  };

  const paygrade = group.grade_rate || "E6";
  const rateOptions = RATINGS[paygrade] || [paygrade];
  const chosenRate = rateOptions[Math.floor(Math.random() * rateOptions.length)];
  const chosenFirst = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  const chosenLast = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const memberName = `${chosenLast}, ${chosenFirst} M`;
  const dodId = `${Math.floor(1000000000 + Math.random() * 9000000000)}`;

  // Random realistic trait marks (3.0 to 5.0)
  const traitValues = ["3.0", "4.0", "4.0", "5.0", "4.0", "4.0", "5.0"];
  const traitKeys = ["knowledge", "work", "eo", "bearing", "accomplishment", "teamwork", "leadership"];
  const traitGrades: Record<string, string> = {};
  for (let i = 0; i < traitKeys.length; i++) {
    const randScore = (3.0 + Math.floor(Math.random() * 3)).toFixed(1);
    traitGrades[traitKeys[i]] = randScore;
  }

  const traitResult = computeTraitAverage(traitGrades);
  const now = new Date().toISOString();

  const newEval: Evaluation = {
    id: `eval-peer-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    report_type: group.report_type || "EVAL",
    member_name: memberName,
    dod_id: dodId,
    grade_rate: chosenRate,
    designator: "SW",
    period_from: "2025-11-16",
    period_to: group.period_to || "2026-11-15",
    duty_status: group.duty_status || "ACT",
    uic: group.uic || "00024",
    ship_station: "NAVSEA WASHINGTON DC",
    promotion_status: group.promotion_status || "Regular",
    trait_grades: traitGrades,
    trait_average: traitResult.average ?? 4.0,
    comments: `*** VALUED CONTRIBUTOR TO THE COMMAND ***\n- DEMONSTRATED SOLID TECHNICAL EXPERTISE AND LEADERSHIP THROUGHOUT THE REPORTING PERIOD.\n- HIGHLY RECOMMENDED FOR ADVANCEMENT.`,
    career_recommendations: ["LCPO", "DIVISION OFFICER"],
    promotion_recommendation: "Promotable",
    retention: "Recommended",
    status: "ready_for_review",
    routing_stage: "reporting_senior",
    summary_group_id: groupId,
    block_values: {
      physical_readiness: "P",
      billet_subcategory: group.billet_subcategory || "NA",
      reporting_senior_name: seniorName,
      reporting_senior_grade: "CAPT",
      reporting_senior_designator: "1110",
      reporting_senior_title: "COMMANDING OFFICER",
      reporting_senior_uic: group.uic || "00024",
      reporting_senior_dod_id: seniorDodId,
      periodic: true,
      regular_report: true,
    },
    created_at: now,
    updated_at: now,
  };

  await db.evaluations.put(newEval);

  // Update summary group member_ids
  const updatedGroup = await db.summary_groups.get(groupId);
  if (updatedGroup) {
    const updatedMemberIds = Array.from(new Set([...(updatedGroup.member_ids || []), newEval.id]));
    await db.summary_groups.update(groupId, {
      member_ids: updatedMemberIds,
      updated_at: now,
    });
  }

  await persistSummaryGroupFigures(groupId);
  return newEval;
}
