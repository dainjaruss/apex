// src/lib/sessionTransfer.ts
//
// Session Persistence & Pack-and-Route Module.
// Enables saving the entire APEX workspace to a single file (.apex) that can be
// kept on OneDrive, Flank Speed Teams, or shared drive, and loaded back anytime.

import { db } from "./db";
import { Evaluation, SummaryGroup, ContinuityRecord, RscaHistoricalRecord, Profile } from "@/types";

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
  notes?: string;
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
 * Exports a single evaluation draft into a portable transfer file for routing.
 */
export async function exportSingleEvalTransfer(evaluationId: string): Promise<void> {
  const evaluation = await db.evaluations.get(evaluationId);
  if (!evaluation) throw new Error("Evaluation not found");

  const pkg: ApexTransferPackage = {
    format: "APEX_EVAL_TRANSFER",
    version: "2.0.0",
    exportedAt: new Date().toISOString(),
    evaluation,
  };

  const jsonString = JSON.stringify(pkg, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const cleanName = (evaluation.member_name || "EVAL").replace(/[^a-zA-Z0-9]/g, "_");
  const a = document.createElement("a");
  a.href = url;
  a.download = `ROUTE_${cleanName}_${evaluation.period_to}.apex.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
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

  pkg.evaluation.updated_at = new Date().toISOString();
  await db.evaluations.put(pkg.evaluation);
  return pkg.evaluation;
}
