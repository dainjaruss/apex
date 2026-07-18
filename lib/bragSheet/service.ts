// lib/bragSheet/service.ts
//
// Server-side assembly + persistence for the Brag Sheet AI auto-fill. Used only
// by the autofill API route; ACCEPTS a Supabase admin client and never creates
// one, so the module stays import-safe under vitest with dummy env
// (board-confidence service.ts pattern). Spec §4.7.
//
// Identity model: prior evals are selected with created_by = userId, cross-
// checked against profiles.dod_id — mismatching rows are excluded, never fed to
// the model (board-confidence spec §2 rule).

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { computeTraitAverage } from "@/lib/traitAverage";
import { paygradeOf } from "@/lib/paygrade";
import { resolveAiModel } from "@/lib/aiProvider";
import { DEFAULT_NARRATIVE_MODEL } from "@/lib/boardConfidence/narrative";
import type { LadrStatus } from "@/lib/boardConfidence/types";
import {
  BRAG_AI_ENV,
  BragSheetDataSchema,
  buildAutofillPayload,
  buildCallModel,
  runAutofill,
} from "@/lib/bragSheet/autofill";
import type {
  AutofillRequest,
  AutofillResponse,
  BragSheet,
  LadrMilestoneStatus,
  PriorEvalSummary,
} from "@/lib/bragSheet/types";

// The same finalized condition the NAVFIT export and board-confidence assembly
// enforce, as a query-side .or() filter.
const FINALIZED_OR =
  "status.eq.completed,signature_locked.eq.true,routing_stage.eq.locked";

/** Keyless server (no direct endpoint, no gateway auth) — the route answers 503. */
export class AutofillUnavailableError extends Error {
  constructor() {
    super("AI drafting is not configured on this server.");
    this.name = "AutofillUnavailableError";
  }
}

export async function assembleAutofillRequest(
  admin: SupabaseClient,
  userId: string,
  sheet: BragSheet, // the already-fetched, already-authorized row
  pitch: "10" | "12",
): Promise<AutofillRequest> {
  // 1. Profile — supplies dod_id for the cross-check (step 3) and navy_rank for
  //    the LaDR target paygrade (step 4).
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error("Profile not found.");

  // 2. The stored payload, validated loudly — a corrupt row fails with 500
  //    rather than feeding the model garbage.
  const brag = BragSheetDataSchema.parse(sheet.data);

  // 3. Prior finalized evals (continuity + Block 44 dedupe source), newest
  //    first, with the dod_id cross-check.
  const { data: evalRows, error: evalError } = await admin
    .from("evaluations")
    .select("*")
    .eq("created_by", userId)
    .or(FINALIZED_OR)
    .lt("period_to", sheet.period_from)
    .order("period_to", { ascending: false })
    .limit(5);
  if (evalError) throw new Error(evalError.message);

  const profileDodId = (profile.dod_id ?? "").trim();
  const prior_evals: PriorEvalSummary[] = (evalRows ?? [])
    .filter((ev: any) => {
      const evDodId = (ev.dod_id ?? "").trim();
      // Exclude mismatching rows (board-confidence spec §2 cross-check).
      return !(profileDodId && evDodId && evDodId !== profileDodId);
    })
    .map(
      (ev: any): PriorEvalSummary => ({
        period_to: ev.period_to,
        report_type: ev.report_type,
        promotion_recommendation: ev.promotion_recommendation || "NOB",
        // The stored column is never trusted — always recomputed.
        trait_average: computeTraitAverage(ev.trait_grades).average,
        comments: ev.comments || "",
        qualifications: ev.block_values?.qualifications,
        primary_duties: ev.block_values?.primary_duties,
      }),
    );

  // 4. LaDR milestone status. No record / no rating / no document ⇒ [] — never
  //    fabricated. All categories included (evidence, not scoring — unlike the
  //    analyzer, which drops zero-weight categories).
  const { data: mbr, error: mbrError } = await admin
    .from("member_board_records")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (mbrError) throw new Error(mbrError.message);

  let ladr: LadrMilestoneStatus[] = [];
  if (mbr?.rating_abbrev) {
    let targetPaygrade: number | null = mbr.target_paygrade ?? null;
    if (targetPaygrade == null) {
      // Default: numeric part of the member's own paygrade + 1, clamped to 9
      // (board-confidence §4.4 step 2).
      const pg = paygradeOf(profile.navy_rank);
      const n = pg ? Number(pg.split("-")[1]) : NaN;
      targetPaygrade = Number.isFinite(n) ? Math.min(9, n + 1) : null;
    }

    const { data: doc, error: docError } = await admin
      .from("ladr_documents")
      .select("*")
      .eq("rating_abbrev", mbr.rating_abbrev)
      .eq("paygrade_range", "E1-E9")
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (docError) throw new Error(docError.message);

    if (doc) {
      const { data: milestones, error: msError } = await admin
        .from("ladr_milestones")
        .select("*")
        .eq("ladr_document_id", doc.id)
        .order("sort_order");
      if (msError) throw new Error(msError.message);
      const checklist = mbr.ladr_checklist ?? {};
      ladr = (milestones ?? [])
        .filter(
          (m: any) =>
            targetPaygrade != null &&
            // Applicability rule (board-confidence §3): min(applies_to) <= target.
            Math.min(...m.applies_to_paygrades) <= targetPaygrade,
        )
        .map(
          (m: any): LadrMilestoneStatus => ({
            milestone_id: m.id,
            category: m.category,
            item: m.item,
            status: (checklist[m.id]?.status ?? "unanswered") as LadrStatus,
          }),
        );
    }
  }

  // 5. The assembled request.
  return {
    report_type: sheet.report_type,
    period_from: sheet.period_from,
    period_to: sheet.period_to,
    pitch,
    brag,
    prior_evals,
    ladr,
  };
}

export async function runBragAutofill(
  admin: SupabaseClient,
  userId: string, // owner AND caller (route enforces equality)
  sheet: BragSheet,
  pitch: "10" | "12",
): Promise<AutofillResponse> {
  // 1. Assemble the request and the exact payload the model will see.
  const req = await assembleAutofillRequest(admin, userId, sheet, pitch);
  const payload = buildAutofillPayload(req);

  // 2. Resolve the model BEFORE any DB write — keyless ⇒ 503, never a canned draft.
  const resolved = resolveAiModel(BRAG_AI_ENV, DEFAULT_NARRATIVE_MODEL);
  if (!resolved) throw new AutofillUnavailableError();

  // 3. Full pipeline (§7). AutofillModelError propagates (route → 502).
  const result = await runAutofill(req, buildCallModel(resolved));

  // 4. Attach the resolved model id (aiProvider convention).
  const response: AutofillResponse = { ...result, model: resolved.modelId };

  // 5. Persist the proposal for the review panel.
  const { error: updateError } = await admin
    .from("brag_sheets")
    .update({ last_autofill: response })
    .eq("id", sheet.id);
  if (updateError) throw new Error(updateError.message);

  // 6. Fail-closed audit (board-confidence service.ts pattern) — generated draft
  //    text derived from a member's record is treated as record egress. The
  //    sha256 covers the PAYLOAD (post-dod_id-strip), so the audit row itself
  //    holds no PII beyond ids.
  const { error: auditError } = await admin.from("audit_logs").insert([
    {
      evaluation_id: null,
      user_id: userId,
      action: "BRAG_AUTOFILL_RUN",
      details: {
        brag_sheet_id: sheet.id,
        model: resolved.modelId,
        input_sha256: createHash("sha256")
          .update(JSON.stringify(payload))
          .digest("hex"),
        overflow_blocks: Object.entries(response.fit_reports)
          .filter(([, report]) => report?.overflow)
          .map(([key]) => key),
        citation_failure_count: response.citation_failures.length,
        missing_info_count: response.missing_info.length,
      },
    },
  ]);
  if (auditError) {
    console.error("brag autofill audit insert failed:", auditError);
    // Compensate: withdraw the unaudited proposal.
    const { error: compensateError } = await admin
      .from("brag_sheets")
      .update({ last_autofill: null })
      .eq("id", sheet.id);
    if (compensateError)
      console.error(
        `CRITICAL: unaudited last_autofill on brag_sheets row ${sheet.id} could not be nulled after the audit failure — manual cleanup required:`,
        compensateError,
      );
    throw new Error(
      "Auto-fill could not be recorded in the audit log; no draft was released.",
    );
  }

  // 7. The released proposal.
  return response;
}
