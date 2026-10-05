// src/lib/routingService.ts
//
// Navy Evaluation Custody Routing & Email Notification Service for APEX v2.
// Implements the 5-Stage BUPERS Chain of Custody Pipeline with:
// 1. SharePoint Custom List synchronization & REST email dispatch.
// 2. Offline "Pack & Route" fallback (.apex.json custody packet + Outlook mailto).

import { Evaluation, RoutingStage, CustodyRecord, Profile } from "@/types";
import { db } from "./db";
import { exportSingleEvalTransfer } from "./sessionTransfer";
import {
  getSharePointConfig,
  syncEvaluationToSharePoint,
  sendSharePointEmail,
  SharePointConfig,
} from "./sharepointService";

export interface StageInfo {
  id: RoutingStage;
  label: string;
  role: Profile["preferred_role"];
  description: string;
  actionRequired: string;
}

export const ROUTING_STAGES: StageInfo[] = [
  {
    id: "sailor",
    label: "1. Sailor Draft",
    role: "Sailor",
    description: "Administrative details, Brag Sheet input, and narrative draft.",
    actionRequired: "Draft Blocks 1–32 & Block 43 comments, then forward to Rater.",
  },
  {
    id: "rater",
    label: "2. Rater Review",
    role: "Rater",
    description: "Trait grading (Blocks 33–39), bullet refinement, counseling date.",
    actionRequired: "Grade traits, refine narrative bullets, sign Block 32 counseling.",
  },
  {
    id: "senior_rater",
    label: "3. Senior Rater Review",
    role: "Senior Rater",
    description: "Division trait average calibration and peer ranking alignment.",
    actionRequired: "Review trait averages against departmental standards, sign Block 47.",
  },
  {
    id: "reporting_senior",
    label: "4. Reporting Senior",
    role: "Reporting Senior",
    description: "Block 45 promotion recommendations, RSCA calibration, and CO signature.",
    actionRequired: "Assign Table 1-1 quotas (EP/MP/P), verify RSCA shift, sign Block 50.",
  },
  {
    id: "debrief",
    label: "5. Debrief & Sign",
    role: "Sailor",
    description: "Member counseling debrief and Block 51 signature.",
    actionRequired: "Review finalized report with counselor and complete debrief signature.",
  },
  {
    id: "locked",
    label: "Completed / Locked",
    role: "Admin",
    description: "Finalized package ready for PERS-32 transmission.",
    actionRequired: "Archived. Ready for official command record / OMPF submission.",
  },
];

export const NEXT_STAGE_MAP: Record<RoutingStage, RoutingStage | null> = {
  sailor: "rater",
  rater: "senior_rater",
  senior_rater: "reporting_senior",
  reporting_senior: "debrief",
  debrief: "locked",
  locked: null,
  admin: "locked",
};

export const PREV_STAGE_MAP: Record<RoutingStage, RoutingStage | null> = {
  sailor: null,
  rater: "sailor",
  senior_rater: "rater",
  reporting_senior: "senior_rater",
  debrief: "reporting_senior",
  locked: null,
  admin: null,
};

export type HandoffMode = "PACK_AND_ROUTE" | "SHAREPOINT";

/**
 * Generates an official Navy notification email mailto link.
 */
export function generateRoutingEmailUrl(
  evaluation: Evaluation,
  action: "FORWARD" | "RETURN",
  toName: string,
  toEmail: string,
  notes: string,
  fromName: string,
  mode: HandoffMode = "PACK_AND_ROUTE",
  spConfig?: SharePointConfig
): { mailtoUrl: string; subject: string; bodyText: string } {
  const isReturn = action === "RETURN";
  const stageInfo = ROUTING_STAGES.find((s) => s.id === evaluation.routing_stage);
  const stageLabel = stageInfo?.label || "Next Stage";

  const subject = `[CUI] ${
    isReturn ? "ACTION REQUIRED (RETURNED FOR REWORK)" : "ACTION REQUIRED"
  }: NAVPERS ${evaluation.report_type} - ${evaluation.member_name} (${evaluation.grade_rate} ${evaluation.period_to})`;

  const methodInstructions =
    mode === "SHAREPOINT"
      ? `• Delivery Method: COMMAND SHAREPOINT LIST\n• Location: ${spConfig?.siteUrl || "Command Portal"} [List: ${spConfig?.listName || "APEX_Evaluations"}]\n• Instruction: Open APEX v2 on Forge to load and review the synchronized evaluation.`
      : `• Delivery Method: PACK & ROUTE FALLBACK (.apex.json Custody Packet)\n• Attached File: ROUTE_${(evaluation.member_name || "EVAL").replace(/[^a-zA-Z0-9]/g, "_")}_${evaluation.period_to}.apex.json\n• Instruction: Please find the attached .apex.json packet. Open APEX v2 in your browser, click 'Import Routed Draft', and load the file to continue your review.`;

  const bodyText = `CLASSIFICATION: CUI // FEDCON // PRIVACY SENSITIVE - 10 U.S.C. 130e
SUBJ: NAVY PERFORMANCE EVALUATION CUSTODY NOTIFICATION

Shipmate,

The following performance evaluation has transitioned in the APEX routing pipeline and requires your review/action per BUPERSINST 1610.10H:

• Member: ${evaluation.member_name}
• SSN: ${evaluation.dod_id || "blank"}
• Rate / Paygrade: ${evaluation.grade_rate}
• Form / Report Type: NAVPERS ${evaluation.report_type}
• Period Ending: ${evaluation.period_to}
• Routing Action: ${isReturn ? "RETURNED FOR REWORK" : "FORWARDED FOR REVIEW"}
• Action By: ${fromName}
• Current Stage: ${stageLabel}
• Required Action: ${stageInfo?.actionRequired || "Review report."}

${methodInstructions}

${notes ? `ROUTING NOTES / INSTRUCTIONS:\n"${notes}"\n\n` : ""}
APEX Forge Access:
https://forge.navy.mil/apex

Very Respectfully,
Command Performance Evaluation System
BUPERSINST 1610.10H Automated Chain of Custody`;

  const mailtoUrl = `mailto:${encodeURIComponent(toEmail)}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(bodyText)}`;

  return { mailtoUrl, subject, bodyText };
}

/**
 * Transitions evaluation to the next stage in the chain of custody.
 */
export async function forwardEvaluationCustody(
  evaluation: Evaluation,
  fromProfile: Profile,
  toHolderName: string,
  toHolderEmail: string,
  notes: string = ""
): Promise<Evaluation> {
  const currentStage = evaluation.routing_stage || "sailor";
  const nextStage = NEXT_STAGE_MAP[currentStage] || "locked";
  const targetStageInfo = ROUTING_STAGES.find((s) => s.id === nextStage);

  const record: CustodyRecord = {
    id: `custody-${Date.now()}`,
    stage: nextStage,
    action: nextStage === "locked" ? "signed" : "forwarded",
    from_name: `${fromProfile.last_name}, ${fromProfile.first_name}`,
    to_name: toHolderName,
    to_email: toHolderEmail,
    transitioned_at: new Date().toISOString(),
    notes,
  };

  const updated: Evaluation = {
    ...evaluation,
    routing_stage: nextStage,
    current_holder_name: toHolderName,
    current_holder_role: targetStageInfo?.role || "Rater",
    current_holder_email: toHolderEmail,
    return_notes: undefined,
    status: nextStage === "locked" ? "completed" : "ready_for_review",
    custody_chain: [...(evaluation.custody_chain || []), record],
    updated_at: new Date().toISOString(),
  };

  await db.evaluations.put(updated);
  return updated;
}

/**
 * Returns evaluation to the previous stage in the chain of custody with feedback notes.
 */
export async function returnEvaluationCustody(
  evaluation: Evaluation,
  fromProfile: Profile,
  toHolderName: string,
  toHolderEmail: string,
  reworkNotes: string
): Promise<Evaluation> {
  const currentStage = evaluation.routing_stage || "rater";
  const prevStage = PREV_STAGE_MAP[currentStage] || "sailor";
  const targetStageInfo = ROUTING_STAGES.find((s) => s.id === prevStage);

  const record: CustodyRecord = {
    id: `custody-${Date.now()}`,
    stage: prevStage,
    action: "returned",
    from_name: `${fromProfile.last_name}, ${fromProfile.first_name}`,
    to_name: toHolderName,
    to_email: toHolderEmail,
    transitioned_at: new Date().toISOString(),
    notes: reworkNotes,
  };

  const updated: Evaluation = {
    ...evaluation,
    routing_stage: prevStage,
    current_holder_name: toHolderName,
    current_holder_role: targetStageInfo?.role || "Sailor",
    current_holder_email: toHolderEmail,
    return_notes: reworkNotes,
    status: "draft",
    custody_chain: [...(evaluation.custody_chain || []), record],
    updated_at: new Date().toISOString(),
  };

  await db.evaluations.put(updated);
  return updated;
}

/**
 * Performs full handoff with chosen mode (SharePoint vs Pack & Route fallback),
 * updating custody, exporting file if fallback, and sending/triggering notification.
 */
export async function executeEvaluationHandoff(params: {
  evaluation: Evaluation;
  action: "FORWARD" | "RETURN";
  fromProfile: Profile;
  toHolderName: string;
  toHolderEmail: string;
  notes: string;
  mode: HandoffMode;
  sendEmail: boolean;
}): Promise<{
  updatedEvaluation: Evaluation;
  mailtoUrl?: string;
  sharePointResult?: { success: boolean; message: string };
}> {
  const {
    evaluation,
    action,
    fromProfile,
    toHolderName,
    toHolderEmail,
    notes,
    mode,
    sendEmail,
  } = params;

  // 1. Update local database record with custody transition
  const updated =
    action === "FORWARD"
      ? await forwardEvaluationCustody(evaluation, fromProfile, toHolderName, toHolderEmail, notes)
      : await returnEvaluationCustody(evaluation, fromProfile, toHolderName, toHolderEmail, notes);

  const spConfig = getSharePointConfig();
  let spResult: { success: boolean; message: string } | undefined;

  // 2. Handle Mode: SharePoint List Sync
  if (mode === "SHAREPOINT" && spConfig.enabled) {
    spResult = await syncEvaluationToSharePoint(updated, spConfig);
  }

  // 3. Handle Mode: Pack & Route Fallback
  if (mode === "PACK_AND_ROUTE") {
    // Automatically trigger browser download of custody packet
    await exportSingleEvalTransfer(updated.id);
  }

  // 4. Generate Email Notification (Outlook mailto + optional SharePoint email REST)
  const emailData = generateRoutingEmailUrl(
    updated,
    action,
    toHolderName,
    toHolderEmail,
    notes,
    `${fromProfile.last_name}, ${fromProfile.first_name}`,
    mode,
    spConfig
  );

  if (sendEmail && mode === "SHAREPOINT" && spConfig.enabled && spConfig.emailNotify && toHolderEmail) {
    // Try sending email via SharePoint utility in background
    sendSharePointEmail(spConfig, toHolderEmail, emailData.subject, emailData.bodyText).catch(
      (e) => console.warn("SharePoint email error:", e)
    );
  }

  return {
    updatedEvaluation: updated,
    mailtoUrl: sendEmail ? emailData.mailtoUrl : undefined,
    sharePointResult: spResult,
  };
}
