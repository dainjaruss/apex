// src/lib/sharepointService.ts
//
// SharePoint List & REST API Integration for APEX v2 on DON Forge.
// Supports bidirectional sync to SharePoint Custom Lists and automated email
// notifications via SP.Utilities.Utility.SendEmail with seamless Pack & Route fallback.

import { Evaluation } from "@/types";

export interface SharePointConfig {
  enabled: boolean;
  siteUrl: string;
  listName: string;
  autoSync: boolean;
  emailNotify: boolean;
  lastSyncAt?: string;
}

const STORAGE_KEY = "apex_v2_sharepoint_config";

export const DEFAULT_SP_CONFIG: SharePointConfig = {
  enabled: false,
  siteUrl: "https://flankers.navy.mil/teams/DIV1",
  listName: "APEX_Evaluations",
  autoSync: false,
  emailNotify: true,
};

export function getSharePointConfig(): SharePointConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SP_CONFIG;
    return { ...DEFAULT_SP_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SP_CONFIG;
  }
}

export function saveSharePointConfig(config: SharePointConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch (e) {
    console.error("Failed to save SharePoint configuration:", e);
  }
}

/**
 * Tests connection to the SharePoint List via REST API.
 */
export async function testSharePointConnection(
  config: SharePointConfig
): Promise<{ success: boolean; message: string; itemCount?: number }> {
  if (!config.siteUrl || !config.listName) {
    return { success: false, message: "Site URL and List Name are required." };
  }

  const cleanUrl = config.siteUrl.replace(/\/+$/, "");
  const endpoint = `${cleanUrl}/_api/web/lists/getbytitle('${encodeURIComponent(
    config.listName
  )}')/items?$select=Id,Title&$top=5`;

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json;odata=verbose",
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          success: false,
          message: `List '${config.listName}' was not found on SharePoint site ${cleanUrl}. Please create the list or verify the name.`,
        };
      }
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          message: "Access Denied / Authentication Required for SharePoint site. Ensure your CAC session is active in this browser.",
        };
      }
      return {
        success: false,
        message: `SharePoint returned HTTP ${response.status}: ${response.statusText}`,
      };
    }

    const data = await response.json();
    const count = data?.d?.results?.length ?? 0;
    return {
      success: true,
      message: `Successfully connected to SharePoint List '${config.listName}'! Found ${count} existing items.`,
      itemCount: count,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Unable to reach SharePoint endpoint directly (${err.message || "Network/CORS restriction"}). You can still use the Pack & Route (.apex.json) fallback for 100% offline routing.`,
    };
  }
}

/**
 * Sends an email notification using SharePoint's SP.Utilities.Utility.SendEmail endpoint.
 */
export async function sendSharePointEmail(
  config: SharePointConfig,
  toEmail: string,
  subject: string,
  body: string
): Promise<{ success: boolean; message: string }> {
  if (!config.enabled || !config.siteUrl) {
    return { success: false, message: "SharePoint integration is not enabled." };
  }

  const cleanUrl = config.siteUrl.replace(/\/+$/, "");
  const endpoint = `${cleanUrl}/_api/SP.Utilities.Utility.SendEmail`;

  // Format body as HTML paragraph for SharePoint mail utility
  const htmlBody = body.replace(/\n/g, "<br/>");

  const payload = {
    properties: {
      __metadata: { type: "SP.Utilities.EmailProperties" },
      To: { results: [toEmail] },
      Subject: subject,
      Body: htmlBody,
    },
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json;odata=verbose",
        "Content-Type": "application/json;odata=verbose",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        success: false,
        message: `SharePoint Email Utility returned HTTP ${response.status}.`,
      };
    }

    return {
      success: true,
      message: `Official notification email dispatched via SharePoint to ${toEmail}.`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `SharePoint email call failed: ${err.message}. Fallback to Outlook mailto link.`,
    };
  }
}

/**
 * Syncs an evaluation to the designated SharePoint List.
 */
export async function syncEvaluationToSharePoint(
  evaluation: Evaluation,
  config: SharePointConfig
): Promise<{ success: boolean; message: string }> {
  if (!config.enabled || !config.siteUrl || !config.listName) {
    return { success: false, message: "SharePoint integration is disabled or not configured." };
  }

  const cleanUrl = config.siteUrl.replace(/\/+$/, "");
  const endpoint = `${cleanUrl}/_api/web/lists/getbytitle('${encodeURIComponent(
    config.listName
  )}')/items`;

  const itemPayload = {
    Title: `${evaluation.member_name} - ${evaluation.grade_rate} (${evaluation.period_to})`,
    ApexId: evaluation.id,
    MemberName: evaluation.member_name,
    RatePaygrade: evaluation.grade_rate,
    DodId: evaluation.dod_id,
    ReportType: evaluation.report_type,
    PeriodEnding: evaluation.period_to,
    RoutingStage: evaluation.routing_stage || "sailor",
    CurrentCustodian: evaluation.current_holder_name || evaluation.member_name,
    CurrentRole: evaluation.current_holder_role || "Sailor",
    PromotionRec: evaluation.promotion_recommendation || "",
    TraitAverage: evaluation.trait_average ? evaluation.trait_average.toFixed(2) : "",
    EvaluationJson: JSON.stringify(evaluation),
    UpdatedIso: new Date().toISOString(),
  };

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json;odata=verbose",
        "Content-Type": "application/json;odata=verbose",
      },
      body: JSON.stringify(itemPayload),
    });

    if (!response.ok) {
      return {
        success: false,
        message: `SharePoint List sync failed (HTTP ${response.status}: ${response.statusText}).`,
      };
    }

    // Update last sync timestamp
    saveSharePointConfig({
      ...config,
      lastSyncAt: new Date().toISOString(),
    });

    return {
      success: true,
      message: `Evaluation for ${evaluation.member_name} successfully synchronized to SharePoint List '${config.listName}'!`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Could not reach SharePoint (${err.message}). Evaluation remains safe in local IndexedDB. Use Pack & Route fallback to transfer.`,
    };
  }
}
