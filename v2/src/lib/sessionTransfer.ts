// src/lib/sessionTransfer.ts
//
// Session Persistence & Pack-and-Route Module.
// Enables saving the entire APEX workspace to a single file (.apex) that can be
// kept on OneDrive, Flank Speed Teams, or shared drive, and loaded back anytime.

import { db } from "./db";
import { Evaluation, SummaryGroup, ContinuityRecord, RscaHistoricalRecord, Profile } from "@/types";
import { readWorkspaceIdentity } from "./workspaceSession";
import {
  copyForRelease,
  defaultRelease,
  transferRefusal,
  workspaceCardFor,
  type ReportRelease,
} from "./workspaceScope";

export interface ApexWorkspaceFile {
  format: "APEX_WORKSPACE_V2";
  version: "2.0.0";
  exportedAt: string;
  evaluations: Evaluation[];
  summaryGroups: SummaryGroup[];
  continuityRecords: ContinuityRecord[];
  rscaRecords: RscaHistoricalRecord[];
  profile?: Profile;
}

export interface ApexTransferPackage {
  format: "APEX_EVAL_TRANSFER";
  version: "2.0.0";
  exportedAt: string;
  evaluation: Evaluation;
  /** Report ratchet at the time this copy was made. A merge refuses the copy when the workspace report has moved on. */
  base_ratchet?: string;
  notes?: string;
  /** Workspace this file may be imported into. Absent on a legacy copy. */
  addressed_to?: string;
  /** Workspace that exported this file. */
  from_workspace_id?: string;
  /** draft and review omit ranking. debrief is the sailor's first copy of it. */
  release?: ReportRelease;
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Exports the entire browser database to a downloadable .apex file.
 * The user can save this to OneDrive/Desktop to resume on another computer or next week.
 */
export async function exportWorkspaceToFile(fileNamePrefix = "APEX_Workspace"): Promise<void> {
  const evaluations = await db.evaluations.toArray();
  const summaryGroups = await db.summary_groups.toArray();
  const continuityRecords = await db.continuity_records.toArray();
  const rscaRecords = await db.rsca_records.toArray();
  const profiles = await db.profiles.toArray();

  const workspaceData: ApexWorkspaceFile = {
    format: "APEX_WORKSPACE_V2",
    version: "2.0.0",
    exportedAt: new Date().toISOString(),
    evaluations,
    summaryGroups,
    continuityRecords,
    rscaRecords,
    profile: profiles[0],
  };

  const jsonString = JSON.stringify(workspaceData, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const dateStr = new Date().toISOString().split("T")[0];
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileNamePrefix}_${dateStr}.apex`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Imports a .apex workspace file back into IndexedDB.
 */
export async function importWorkspaceFromFile(file: File): Promise<{
  evalCount: number;
  groupCount: number;
  continuityCount: number;
  rscaCount: number;
}> {
  const text = await file.text();
  const data = JSON.parse(text) as ApexWorkspaceFile;

  if (data.format !== "APEX_WORKSPACE_V2") {
    throw new Error("Invalid workspace file format. Expected APEX_WORKSPACE_V2.");
  }

  await db.transaction("rw", [db.evaluations, db.summary_groups, db.continuity_records, db.rsca_records, db.profiles], async () => {
    if (data.evaluations?.length) {
      await db.evaluations.bulkPut(data.evaluations);
    }
    if (data.summaryGroups?.length) {
      await db.summary_groups.bulkPut(data.summaryGroups);
    }
    if (data.continuityRecords?.length) {
      await db.continuity_records.bulkPut(data.continuityRecords);
    }
    if (data.rscaRecords?.length) {
      await db.rsca_records.bulkPut(data.rscaRecords);
    }
    if (data.profile) {
      await db.profiles.put(data.profile);
    }
  });

  return {
    evalCount: data.evaluations?.length || 0,
    groupCount: data.summaryGroups?.length || 0,
    continuityCount: data.continuityRecords?.length || 0,
    rscaCount: data.rscaRecords?.length || 0,
  };
}

/**
 * Builds one report file. Draft and review copies omit ranking. A debrief copy keeps it.
 * Passing no release, which happens when this browser has no workspace identity, leaves the
 * report unchanged so older callers keep working.
 */
export async function buildEvalTransferPackage(
  evaluationId: string,
  options?: { release?: ReportRelease; addressedTo?: string },
): Promise<ApexTransferPackage> {
  const evaluation = await db.evaluations.get(evaluationId);
  if (!evaluation) throw new Error("Evaluation not found");
  const identity = readWorkspaceIdentity();
  const release = options?.release ?? (identity ? defaultRelease(identity.scope) : undefined);
  const carried = release ? copyForRelease(evaluation, release) : evaluation;

  return {
    format: "APEX_EVAL_TRANSFER",
    version: "2.0.0",
    exportedAt: new Date().toISOString(),
    evaluation: carried,
    base_ratchet: evaluation.lock_ratchet ?? "",
    from_workspace_id: identity?.workspaceId,
    addressed_to: options?.addressedTo,
    release,
  };
}

/**
 * Exports a single evaluation draft into a portable transfer file for routing.
 */
export async function exportSingleEvalTransfer(
  evaluationId: string,
  options?: { release?: ReportRelease; addressedTo?: string },
): Promise<void> {
  const pkg = await buildEvalTransferPackage(evaluationId, options);
  const cleanName = (pkg.evaluation.member_name || "EVAL").replace(/[^a-zA-Z0-9]/g, "_");
  const suffix = pkg.release === "debrief" ? "DEBRIEF" : "ROUTE";
  downloadJson(`${suffix}_${cleanName}_${pkg.evaluation.period_to}.apex.json`, pkg);
}

export function downloadTransferPackage(pkg: ApexTransferPackage): void {
  const cleanName = (pkg.evaluation.member_name || "EVAL").replace(/[^a-zA-Z0-9]/g, "_");
  const suffix = pkg.release === "debrief" ? "DEBRIEF" : "ROUTE";
  downloadJson(`${suffix}_${cleanName}_${pkg.evaluation.period_to}.apex.json`, pkg);
}

export function downloadWorkspaceCard(): void {
  const identity = readWorkspaceIdentity();
  if (!identity) throw new Error("Choose a workspace scope before exporting a card.");
  const safeName = identity.holderName.replace(/[^a-zA-Z0-9]/g, "_");
  downloadJson(`CARD_${safeName}.apex.json`, workspaceCardFor(identity));
}

/**
 * Imports a routed evaluation draft into the local database.
 */
export async function importSingleEvalTransfer(file: File): Promise<Evaluation> {
  const text = await file.text();
  const pkg = JSON.parse(text) as ApexTransferPackage;

  if (pkg.format !== "APEX_EVAL_TRANSFER" || !pkg.evaluation) {
    throw new Error("Invalid transfer file format. Expected APEX_EVAL_TRANSFER.");
  }

  const identity = readWorkspaceIdentity();
  const refusal = transferRefusal(pkg, identity);
  if (refusal) throw new Error(refusal);

  const local = await db.evaluations.get(pkg.evaluation.id);
  if (
    local &&
    pkg.base_ratchet !== undefined &&
    (local.lock_ratchet ?? "") !== pkg.base_ratchet
  ) {
    throw new Error(
      "This report changed after that copy was made. Ask the workspace holder for a new copy.",
    );
  }

  const evaluation: Evaluation = {
    ...pkg.evaluation,
    updated_at: new Date().toISOString(),
  };
  if (pkg.from_workspace_id && identity?.scope === "command") {
    evaluation.source_workspace_id = pkg.from_workspace_id;
  }
  if (pkg.release === "debrief") {
    evaluation.ranking_released = true;
  }
  await db.evaluations.put(evaluation);
  return evaluation;
}
