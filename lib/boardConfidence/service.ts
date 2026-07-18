// lib/boardConfidence/service.ts
//
// Server-side assembly + persistence for the Board Confidence Analyzer. Used only
// by the API routes; ACCEPTS a Supabase admin client and never creates one, so the
// module stays import-safe under vitest with dummy env. Spec §4.4.
//
// Identity model (spec §2): a run selects the subject's evals with
// created_by = subjectUserId (documented v1 assumption), cross-checked against
// profiles.dod_id — mismatching rows are excluded with a warning, never scored.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeSummaryGroupAverage,
  computeTraitAverage,
} from "@/lib/traitAverage";
import { tallyRecommendations } from "@/lib/forcedDistribution";
import { paygradeOf } from "@/lib/paygrade";
import {
  DEFAULT_RUBRIC_CONFIG,
  REC_POINTS,
  scoreBoardConfidence,
} from "@/lib/boardConfidence/rubric";
import { generateNarrative } from "@/lib/boardConfidence/narrative";
import {
  BOARD_DISCLAIMER,
  type BoardAnalysisRow,
  type LadrCategory,
  type LadrItemInput,
  type RubricConfig,
  type LadrStatus,
  type MemberBoardRecord,
  type PreceptFlag,
  type PsrSection,
  type PromotionRec,
  type RubricEvalInput,
  type RubricInputs,
  type TourEntry,
} from "@/lib/boardConfidence/types";

// The same finalized condition the NAVFIT export enforces
// (app/api/export/navfit98/route.ts:50-59), as a query-side .or() filter.
const FINALIZED_OR =
  "status.eq.completed,signature_locked.eq.true,routing_stage.eq.locked";

const PRECEPT_FLAGS: PreceptFlag[] = [
  "warfighting",
  "leadership_positions",
  "education",
  "sea_duty",
  "technical_expertise",
];

// Informational-only LaDR categories — weight 0, never scored (spec §3).
const UNSCORED_CATEGORIES: LadrCategory[] = [
  "career_milestone",
  "billet_recommended",
];

export interface AssembledInputs {
  inputs: RubricInputs;
  meta: {
    subject_user_id: string;
    rating_abbrev: string | null;
    target_paygrade: number | null;
    ladr_document_id: string | null;
    ladr_version: string | null;
    precept_cycle: string | null;
    eval_count_total: number; // finalized rows found
    eval_count_excluded: number; // dod_id-mismatch exclusions (§2)
  };
  warnings: string[];
}

/** UTC-midnight day number for a YYYY-MM-DD string (same convention as the rubric). */
const utcDay = (iso: string): number => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
};

/** Sea-duty derivation fallback: period midpoint falls inside a sea-duty tour. */
const midpointOnSeaTour = (
  periodFrom: string,
  periodTo: string,
  tours: TourEntry[] | null,
): boolean => {
  if (!tours) return false;
  const mid = (utcDay(periodFrom) + utcDay(periodTo)) / 2;
  return tours.some(
    (t) =>
      t.sea_duty &&
      utcDay(t.start) <= mid &&
      (t.end === null || mid <= utcDay(t.end)),
  );
};

export async function assembleRubricInputs(
  admin: SupabaseClient,
  subjectUserId: string,
  boardDate: string,
): Promise<AssembledInputs> {
  const warnings: string[] = [];

  // 1. Subject profile.
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("id", subjectUserId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) throw new Error("Profile not found.");

  // 2. Member board record (structured PSR/ESR entry) — absent row is fine.
  const { data: mbrData, error: mbrError } = await admin
    .from("member_board_records")
    .select("*")
    .eq("user_id", subjectUserId)
    .maybeSingle();
  if (mbrError) throw new Error(mbrError.message);
  const mbr = (mbrData as MemberBoardRecord | null) ?? null;

  const ratingAbbrev = mbr?.rating_abbrev ?? null;
  let targetPaygrade = mbr?.target_paygrade ?? null;
  if (targetPaygrade == null) {
    // Default: numeric part of the member's own paygrade + 1, clamped to 9.
    const pg = paygradeOf(profile.navy_rank);
    const n = pg ? Number(pg.split("-")[1]) : NaN;
    targetPaygrade = Number.isFinite(n) ? Math.min(9, n + 1) : null;
  }

  // v1.1 review fix: the DB defaults every section to [] the moment a row
  // exists, so an empty list means "not entered" — it must not earn
  // completeness points. Map [] (and null) to null; adverse stays a list.
  const section = <E,>(x: E[] | null | undefined): E[] | null =>
    x && x.length ? x : null;
  const psr: PsrSection = mbr
    ? {
        entered: mbr.psr_entered,
        awards: section(mbr.awards),
        necs: section(mbr.necs),
        education: section(mbr.education),
        tours: section(mbr.tours),
        pfa: section(mbr.pfa_history),
        adverse: mbr.adverse ?? [],
      }
    : {
        entered: false,
        awards: null,
        necs: null,
        education: null,
        tours: null,
        pfa: null,
        adverse: [],
      };

  // 3. Finalized evals drafted by the subject (§2 created_by ≈ subject), with
  //    the dod_id cross-check.
  const { data: evalRows, error: evalError } = await admin
    .from("evaluations")
    .select("*")
    .eq("created_by", subjectUserId)
    .or(FINALIZED_OR);
  if (evalError) throw new Error(evalError.message);

  const profileDodId = (profile.dod_id ?? "").trim();
  let excludedCount = 0;
  const included = (evalRows ?? []).filter((ev: any) => {
    const evDodId = (ev.dod_id ?? "").trim();
    if (profileDodId && evDodId && evDodId !== profileDodId) {
      excludedCount++;
      warnings.push(
        `Excluded 1 report whose DoD ID does not match your profile (period ${ev.period_from}–${ev.period_to}).`,
      );
      return false;
    }
    return true;
  });

  // 5 (batched first). Summary-group context, one query per distinct group id.
  // Must use the admin client — RLS eval_select_custody hides peers (same reason
  // as app/api/summary-average/route.ts).
  const groupIds = Array.from(
    new Set(
      included
        .map((ev: any) => ev.summary_group_id)
        .filter((id: any): id is string => !!id),
    ),
  );
  const groupContext = new Map<
    string,
    { epCount: number; groupSize: number; sga: number | null }
  >();
  for (const groupId of groupIds) {
    const { data: peers, error: peersError } = await admin
      .from("evaluations")
      .select("promotion_recommendation, trait_grades")
      .eq("summary_group_id", groupId)
      .or(FINALIZED_OR);
    if (peersError) throw new Error(peersError.message);
    const tally = tallyRecommendations(
      (peers ?? []).map((p: any) => p.promotion_recommendation),
    );
    groupContext.set(groupId, {
      epCount: tally.distribution["Early Promote"],
      groupSize: tally.observedCount,
      sga: computeSummaryGroupAverage((peers ?? []).map((p: any) => p.trait_grades))
        .average,
    });
  }

  // 4. Per-eval rubric inputs: trait_average ALWAYS recomputed (the stored
  //    column is stale-prone by design, lib/pdfOverlay.ts:542); rsca/sea_duty
  //    from eval_context[period_to] with tour-overlap fallback.
  const evalContext = mbr?.eval_context ?? {};
  const evals: RubricEvalInput[] = included
    .map((ev: any): RubricEvalInput => {
      const ctx = evalContext[ev.period_to] ?? {};
      const group = ev.summary_group_id
        ? groupContext.get(ev.summary_group_id)
        : undefined;
      // v1.1 review fix: a null/empty/unknown recommendation maps to NOB
      // (excluded from Performance, still counts for Continuity coverage) —
      // never indexes REC_POINTS with an unknown key, never NaN (§7 item 8).
      const rawRec = ev.promotion_recommendation;
      const rec: PromotionRec =
        rawRec === "NOB" || (typeof rawRec === "string" && rawRec in REC_POINTS)
          ? (rawRec as PromotionRec)
          : "NOB";
      if (rec !== rawRec)
        warnings.push(
          `1 report has no promotion recommendation and was excluded from Performance scoring (period ${ev.period_from}–${ev.period_to}).`,
        );
      return {
        period_from: ev.period_from,
        period_to: ev.period_to,
        report_type: ev.report_type,
        promotion_recommendation: rec,
        trait_average: computeTraitAverage(ev.trait_grades).average,
        summary_group_average: group?.sga ?? null,
        rsca: ctx.rsca ?? null,
        sea_duty:
          ctx.sea_duty ??
          midpointOnSeaTour(ev.period_from, ev.period_to, psr.tours),
        ep_count: group ? group.epCount : null,
        group_size: group ? group.groupSize : null,
      };
    })
    .sort((a, b) => (a.period_to < b.period_to ? -1 : 1));

  // 6. LaDR: latest document for the rating, applicable milestones joined
  //    against the member's checklist. No rating / no document ⇒ [] (conf_D = 0
  //    by the rubric — never fabricated).
  let ladr: LadrItemInput[] = [];
  let ladrDocumentId: string | null = null;
  let ladrVersion: string | null = null;
  if (ratingAbbrev) {
    const { data: doc, error: docError } = await admin
      .from("ladr_documents")
      .select("*")
      .eq("rating_abbrev", ratingAbbrev)
      .eq("paygrade_range", "E1-E9")
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (docError) throw new Error(docError.message);
    if (doc) {
      ladrDocumentId = doc.id;
      ladrVersion = doc.version;
      const { data: milestones, error: msError } = await admin
        .from("ladr_milestones")
        .select("*")
        .eq("ladr_document_id", doc.id);
      if (msError) throw new Error(msError.message);
      const checklist = mbr?.ladr_checklist ?? {};
      ladr = (milestones ?? [])
        .filter(
          (m: any) =>
            !UNSCORED_CATEGORIES.includes(m.category) &&
            targetPaygrade != null &&
            // §3 applicability rule: min(applies_to_paygrades) <= target.
            Math.min(...m.applies_to_paygrades) <= targetPaygrade,
        )
        .map((m: any): LadrItemInput => {
          const entry = checklist[m.id] ?? {
            status: "unanswered" as LadrStatus,
            verified_in_ompf: false,
          };
          // v1.5 board emphasis: explicit "Considerations for advancement"
          // items (parser/seed flag), or milestones that exist only at E7+
          // while the member is targeting E7+.
          const board_emphasis =
            m.detail?.board_emphasis === true ||
            m.category === "advancement_consideration" ||
            (targetPaygrade != null &&
              targetPaygrade >= 7 &&
              m.applies_to_paygrades.length > 0 && // Math.min() of [] is Infinity
              Math.min(...m.applies_to_paygrades) >= 7);
          return {
            milestone_id: m.id,
            category: m.category,
            status: entry.status,
            verified_in_ompf: entry.verified_in_ompf,
            board_emphasis,
          };
        });
    }
  }

  // 7. Active precept (partial unique index guarantees ≤ 1). None ⇒ [] and the
  //    rubric excludes the factor (weights ×100/90).
  const { data: precept, error: preceptError } = await admin
    .from("board_precepts")
    .select("*")
    .eq("active", true)
    .maybeSingle();
  if (preceptError) throw new Error(preceptError.message);
  const preceptFlags: PreceptFlag[] = precept
    ? PRECEPT_FLAGS.filter((f) => precept.emphasis_flags?.[f] === true)
    : [];

  return {
    inputs: { boardDate, evals, psr, ladr, preceptFlags },
    meta: {
      subject_user_id: subjectUserId,
      rating_abbrev: ratingAbbrev,
      target_paygrade: targetPaygrade,
      ladr_document_id: ladrDocumentId,
      ladr_version: ladrVersion,
      precept_cycle: precept?.cycle ?? null,
      eval_count_total: (evalRows ?? []).length,
      eval_count_excluded: excludedCount,
    },
    warnings,
  };
}

/** v1.5: active tunable rubric parameters; absent/malformed row ⇒ defaults. */
export async function loadRubricConfig(
  admin: SupabaseClient,
): Promise<RubricConfig> {
  const { data, error } = await admin
    .from("board_rubric_config")
    .select("weights, continuity_hard_gate, continuity_gap_days, board_emphasis_multiplier")
    .eq("active", true)
    .maybeSingle();
  if (error || !data) return DEFAULT_RUBRIC_CONFIG;
  const w = data.weights ?? {};
  const num = (v: unknown, d: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : d;
  return {
    weights: {
      performance: num(w.performance, DEFAULT_RUBRIC_CONFIG.weights.performance),
      leadership: num(w.leadership, DEFAULT_RUBRIC_CONFIG.weights.leadership),
      development: num(w.development, DEFAULT_RUBRIC_CONFIG.weights.development),
      continuity: num(w.continuity, DEFAULT_RUBRIC_CONFIG.weights.continuity),
      completeness: num(w.completeness, DEFAULT_RUBRIC_CONFIG.weights.completeness),
      precept: num(w.precept, DEFAULT_RUBRIC_CONFIG.weights.precept),
    },
    continuity_hard_gate:
      typeof data.continuity_hard_gate === "boolean"
        ? data.continuity_hard_gate
        : DEFAULT_RUBRIC_CONFIG.continuity_hard_gate,
    continuity_gap_days: num(
      data.continuity_gap_days,
      DEFAULT_RUBRIC_CONFIG.continuity_gap_days,
    ),
    board_emphasis_multiplier: num(
      Number(data.board_emphasis_multiplier),
      DEFAULT_RUBRIC_CONFIG.board_emphasis_multiplier,
    ),
  };
}

export async function runBoardAnalysis(
  admin: SupabaseClient,
  subjectUserId: string,
  callerId: string,
  boardDate: string,
): Promise<BoardAnalysisRow> {
  // 1. Assemble → score (pure, under the ACTIVE tunable config, which is
  //    snapshotted into the run for reproducibility) → narrative.
  const assembled = await assembleRubricInputs(admin, subjectUserId, boardDate);
  const rubricConfig = await loadRubricConfig(admin);
  const result = scoreBoardConfidence(assembled.inputs, rubricConfig);
  const { narrative, source, model, fallbackReason } = await generateNarrative(result, {
    preceptFlags: assembled.inputs.preceptFlags,
    targetPaygrade: assembled.meta.target_paygrade,
    ratingAbbrev: assembled.meta.rating_abbrev,
  });

  // 2. Persist the immutable run snapshot.
  const { data: inserted, error: insertError } = await admin
    .from("board_analyses")
    .insert([
      {
        user_id: subjectUserId,
        board_date: boardDate,
        input: {
          ...assembled.inputs,
          disclaimer: BOARD_DISCLAIMER,
          warnings: result.warnings.concat(assembled.warnings),
          meta: {
            ...assembled.meta,
            // v1.5: snapshot the exact tuning + gate outcome used for this run.
            rubric_config: rubricConfig,
            not_selection_ready: result.notSelectionReady,
            gate_reason: result.gateReason,
            underlying_final: result.underlyingFinal,
          },
        },
        factor_scores: result.factors,
        overall_score: result.final,
        band: result.band,
        // v1.1 review fix: A is persisted — the UI must never re-derive it
        // (Σcontributions − overall is wrong when the final clamps to 0).
        adverse_adjustment: result.adverseAdjustment,
        narrative,
        narrative_source: source,
        narrative_fallback_reason: fallbackReason,
        model,
        created_by: callerId,
      },
    ])
    .select()
    .single();
  if (insertError || !inserted)
    throw new Error(insertError?.message || "Failed to persist analysis.");

  // 3. Fail-closed audit (navfit98 pattern, route.ts:94-113): derived career
  //    data about a member is record egress — it must not be released unaudited.
  const { error: auditError } = await admin.from("audit_logs").insert([
    {
      evaluation_id: null,
      user_id: callerId,
      action: "BOARD_ANALYSIS_RUN",
      details: {
        analysis_id: inserted.id,
        subject_user_id: subjectUserId,
        board_date: boardDate,
        overall_score: result.final,
        band: result.band,
        narrative_source: source,
      },
    },
  ]);
  if (auditError) {
    console.error("board analysis audit insert failed:", auditError);
    // v1.1 review fix: verify the compensating delete — if it ALSO fails, the
    // unaudited analysis row is orphaned and needs manual cleanup.
    const { error: deleteError } = await admin
      .from("board_analyses")
      .delete()
      .eq("id", inserted.id);
    if (deleteError)
      console.error(
        `CRITICAL: unaudited board_analyses row ${inserted.id} could not be deleted after the audit failure — orphaned analysis requires manual cleanup:`,
        deleteError,
      );
    throw new Error(
      "Analysis could not be recorded in the audit log; no result was released.",
    );
  }

  // 4. The inserted row, with id.
  return inserted as BoardAnalysisRow;
}
