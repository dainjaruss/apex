// lib/bragSheetService.ts
//
// Browser service for the Brag Sheet: sheet CRUD (RLS owner-only), AI-use
// consent, the extract/autofill route calls, and the client-side apply-to-draft
// flow through the EXISTING evaluation creation path (saveDraft). Spec §4.8/§5.3.

import { createBrowserClient } from "./supabaseClient";
import type { Evaluation } from "@/types";
import { saveDraft } from "@/lib/evaluationService";
import {
  getChiefEvalSeed,
  getEvalSeed,
  getFitrepSeed,
} from "@/lib/formDefinitions";
import { collapsePfa, emptyBragSheetData } from "@/lib/bragSheet/template";
import { BRAG_SHEET_VERSION } from "@/lib/bragSheet/types";
import type { AutofillResponse, BragSheet } from "@/lib/bragSheet/types";
import type { BragExtractSuggestions } from "@/lib/bragSheet/extract";

const supabase = createBrowserClient();

async function postRoute(url: string, body: Record<string, any>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

/** The caller's brag sheets, newest period first (RLS-scoped anyway). */
export const listMyBragSheets = async (userId: string): Promise<BragSheet[]> => {
  const { data, error } = await supabase
    .from("brag_sheets")
    .select("*")
    .eq("user_id", userId)
    .order("period_to", { ascending: false });
  if (error) {
    console.error(`listMyBragSheets failed for ${userId}:`, error.message);
    throw new Error(error.message);
  }
  return (data || []) as BragSheet[];
};

/** One brag sheet by id, or null when absent/not visible. */
export const getBragSheet = async (id: string): Promise<BragSheet | null> => {
  const { data, error } = await supabase
    .from("brag_sheets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(`getBragSheet failed for ${id}:`, error.message);
    throw new Error(error.message);
  }
  return data as BragSheet | null;
};

/** New empty sheet for a reporting period (one row per eval cycle). */
export const createBragSheet = async (
  userId: string,
  init: Pick<BragSheet, "report_type" | "period_from" | "period_to">,
): Promise<BragSheet> => {
  const { data, error } = await supabase
    .from("brag_sheets")
    .insert({
      user_id: userId,
      ...init,
      template_version: BRAG_SHEET_VERSION,
      data: emptyBragSheetData(),
    })
    .select()
    .single();
  if (error) {
    console.error(`createBragSheet failed for ${userId}:`, error.message);
    throw new Error(error.message);
  }
  return data as BragSheet;
};

/** Patch a sheet (RLS owner-only). */
export const saveBragSheet = async (
  id: string,
  patch: Partial<
    Pick<
      BragSheet,
      | "data"
      | "status"
      | "period_from"
      | "period_to"
      | "report_type"
      | "evaluation_id"
      | "consented_at"
    >
  >,
): Promise<BragSheet> => {
  const { data, error } = await supabase
    .from("brag_sheets")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error(`saveBragSheet failed for ${id}:`, error.message);
    throw new Error(error.message);
  }
  return data as BragSheet;
};

/** Delete a sheet (RLS owner-only). */
export const deleteBragSheet = async (id: string): Promise<void> => {
  const { error } = await supabase.from("brag_sheets").delete().eq("id", id);
  if (error) {
    console.error(`deleteBragSheet failed for ${id}:`, error.message);
    throw new Error(error.message);
  }
};

/** Record AI-use consent (first-use modal) — the autofill route refuses 403 until set. */
export const recordAiConsent = async (id: string): Promise<BragSheet> =>
  saveBragSheet(id, { consented_at: new Date().toISOString() });

/** Upload a prior-EVAL/PRIMS PDF for in-memory extraction; nothing is persisted. */
export const extractBragPdf = async (
  file: File,
): Promise<BragExtractSuggestions> => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/brag-sheet/extract", {
    method: "POST",
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json as BragExtractSuggestions;
};

/** Run the audited server-side autofill; returns the reviewed-before-apply proposal. */
export const runBragAutofillRequest = async (body: {
  bragSheetId: string;
  pitch: "10" | "12";
}): Promise<AutofillResponse> =>
  (await postRoute("/api/brag-sheet/autofill", body)) as AutofillResponse;

/** Availability probe — keyless servers hide the Generate button (§1.2 item 9). */
export const getAutofillAvailability = async (): Promise<{
  available: boolean;
  model: string | null;
}> => {
  const res = await fetch("/api/brag-sheet/autofill");
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json as { available: boolean; model: string | null };
};

/* ── Apply to draft EVAL (spec §5.3 — client-side, no new route) ────────────── */

export interface AcceptedBlocks {
  // ONLY user-accepted (possibly user-edited) texts
  comments?: string;
  primary_duty_abbrev?: string;
  primary_duties?: string;
  command_achievements?: string;
  qualifications?: string; // EVAL only
  career_recommendations?: string[]; // ≤2 entries, trimmed + upcased, each ≤20 chars
}

// Normative (§5.3): MUST NOT set (saveDraft/system-owned): id, created_at,
// updated_at, created_by, current_holder_id, participants, routing_stage,
// trait_average, reviewer_id, summary_group_id, signature_locked,
// pdf_storage_path, any status other than the seed's "draft".
// trait_grades stays the seed's {} — always (invariant §1.2 item 2).
export const applyBragDraft = async (
  userId: string,
  sheet: BragSheet,
  accepted: AcceptedBlocks,
  pitch: "10" | "12",
): Promise<Evaluation> => {
  const seed =
    sheet.report_type === "CHIEFEVAL"
      ? getChiefEvalSeed()
      : sheet.report_type === "FITREP"
        ? getFitrepSeed() // "FITREP_W2_O6" default; O7/O8 create via /evaluations/new
        : getEvalSeed();
  const a = sheet.data.admin;

  const draft: Partial<Evaluation> = {
    // Seed getters return untyped literals ("draft" widens to string) — the
    // existing /evaluations/new call site types them `any` for the same reason.
    ...(seed as Partial<Evaluation>),
    member_name: (a.member_name ?? "").toUpperCase(),
    dod_id: a.dod_id ?? "",
    grade_rate: a.grade_rate ?? "",
    designator: a.designator ?? "",
    duty_status: a.duty_status ?? seed.duty_status,
    uic: a.uic && a.uic.length === 5 ? a.uic : "00000", // DB CHECK: 5 chars or '00000'
    ship_station: a.ship_station ?? "",
    period_from: sheet.period_from,
    period_to: sheet.period_to,
    comments: accepted.comments ?? "",
    career_recommendations:
      accepted.career_recommendations ?? seed.career_recommendations,
    // promotion_recommendation: seed default "Promotable" — the advisory is NEVER
    // copied (invariant §1.2 item 3). retention: seed handles per report type.
    block_values: {
      ...seed.block_values,
      comment_pitch: pitch,
      ...(a.date_reported ? { date_reported: a.date_reported } : {}),
      ...(accepted.primary_duty_abbrev
        ? { primary_duty_abbrev: accepted.primary_duty_abbrev }
        : {}),
      ...(accepted.primary_duties
        ? { primary_duties: accepted.primary_duties }
        : {}),
      ...(accepted.command_achievements
        ? { command_achievements: accepted.command_achievements }
        : {}),
      ...(sheet.report_type === "EVAL" && accepted.qualifications
        ? { qualifications: accepted.qualifications }
        : {}),
      // Block 20 — deterministic, from the sheet, never from accepted AI text:
      ...(sheet.data.pfa.length
        ? { physical_readiness: collapsePfa(sheet.data) }
        : {}),
      // Blocks 30/31 — deterministic pass-through, never AI-written:
      ...(sheet.data.counseling.date_counseled
        ? {
            date_counseled: sheet.data.counseling.date_counseled,
            counselor: sheet.data.counseling.counselor ?? "",
          }
        : {}),
    },
  };

  const saved = await saveDraft(userId, draft);
  await saveBragSheet(sheet.id!, {
    evaluation_id: saved.id,
    status: "submitted",
  });
  return saved;
};
