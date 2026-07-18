// lib/bragSheet/autofill.ts
//
// AI auto-fill: the system prompt (verbatim, spec §4.6), the model payload,
// the generateText wrapper, and the §7 post-generation validation pipeline.
// Pure module — runAutofill takes an INJECTED callModel and never touches the
// network itself (unit-testable without "ai" mocks); budgets derive from
// lib/commentFit.ts constants so the prompt and the validator cannot drift;
// every generated item must survive citation resolution (citation-or-delete)
// before it reaches the user; trait grades are stripped unread; the promotion
// recommendation is advisory-only and never written to a form value.
// Spec: docs/specs/brag-sheet.md §4.6, §7

import { generateText, Output } from "ai";
import { z } from "zod";
import type { AiEnvConfig, ResolvedAiModel } from "@/lib/aiProvider";
import { collapsePfa } from "@/lib/bragSheet/template";
import type {
  AutofillModelOutput,
  AutofillRequest,
  AutofillResponse,
  BlockFitReport,
  BragSheetData,
  GeneratedItem,
  PriorEvalSummary,
} from "@/lib/bragSheet/types";
import {
  checkCommentFit,
  FIELD_FIT,
  getPrimaryDutiesFieldFit,
  measureTextFit,
  PRIMARY_DUTY_ABBREV_MAX,
} from "@/lib/commentFit";
import type { CommentFitResult } from "@/lib/commentFit";
import { runFullValidation } from "@/lib/validationEngine";
import type { Evaluation } from "@/types";
import {
  CAREER_REC_MAX,
  CAREER_REC_SLOTS,
  PROMOTION_RECOMMENDATIONS,
} from "@/types/navpers";

// Same env vars as board-confidence (one config surface, §4.1) — a server that
// has AI configured for one feature has it for both.
export const BRAG_AI_ENV: AiEnvConfig = {
  baseUrlVar: "BOARD_NARRATIVE_BASE_URL",
  apiKeyVar: "BOARD_NARRATIVE_API_KEY",
  modelVar: "BOARD_NARRATIVE_MODEL",
  name: "brag-autofill",
};

export const AUTOFILL_TIMEOUT_MS = 60_000;
export const COMMENTS_MAX_LINES = 18; // = checkCommentFit cap
export const COMMENTS_TARGET_LINES = 17;

/** Model output failed the schema parse twice (§7 step 1) — route answers 502. */
export class AutofillModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutofillModelError";
  }
}

// ── Zod mirrors (default strip semantics — unknown keys, trait_grades above
// all, are silently discarded; required keys/types/enums are enforced) ────────

const BragBulletSchema = z.object({
  text: z.string(),
  metrics: z.string().optional(),
});

export const BragSheetDataSchema: z.ZodType<BragSheetData> = z.object({
  admin: z.object({
    member_name: z.string().optional(),
    grade_rate: z.string().optional(),
    designator: z.string().optional(),
    dod_id: z.string().optional(),
    duty_status: z.enum(["ACT", "TAR", "INACT", "AT/ADOS"]).optional(),
    uic: z.string().optional(),
    ship_station: z.string().optional(),
    date_reported: z.string().optional(),
    prior_report_end: z.string().optional(),
    date_of_rate: z.string().optional(),
    periods_unavailable: z.array(
      z.object({ start: z.string(), end: z.string(), reason: z.string() }),
    ),
  }),
  duties: z.array(
    z.object({
      title: z.string(),
      kind: z.enum(["primary", "collateral", "watchstanding", "temadd"]),
      months_assigned: z.number(),
      is_most_significant: z.boolean().optional(),
      abbrev: z.string().optional(),
      bullets: z.array(BragBulletSchema),
    }),
  ),
  job: z.object({
    responsibilities: z.string(),
    equipment: z.array(z.string()),
    customers: z.string(),
    classified_material: z.string().optional(),
    team_contributions: z.array(BragBulletSchema),
  }),
  leadership: z.object({
    supervised_military: z.number(),
    supervised_civilian: z.number(),
    supervised_via_subordinates: z.number(),
    equipment_value: z.string().optional(),
    budget_managed: z.string().optional(),
    instructor_roles: z.array(BragBulletSchema),
    mentoring: z.array(BragBulletSchema),
    retention_efforts: z.array(BragBulletSchema),
  }),
  accomplishments: z.array(
    BragBulletSchema.extend({ trait_hint: z.string().optional() }),
  ),
  qualifications: z.object({
    quals: z.array(z.object({ title: z.string(), date: z.string() })),
    education: z.array(
      z.object({
        title: z.string(),
        date: z.string(),
        credit_hours: z.number().optional(),
      }),
    ),
    awards: z.array(z.object({ title: z.string(), date: z.string() })),
  }),
  off_duty: z.object({
    education: z.array(BragBulletSchema),
    community: z.array(BragBulletSchema),
    navy_pr: z.array(BragBulletSchema),
    civilian_employment: z.string().optional(),
  }),
  pfa: z.array(
    z.object({
      cycle: z.string(),
      result: z.enum(["P", "B", "F", "M", "W", "N"]),
      prt_category: z
        .enum(["Outstanding", "Excellent", "Good", "Satisfactory", "Probationary"])
        .optional(),
      prt_score: z.number().optional(),
      bca: z.enum(["within", "not_within", "waived"]).optional(),
      medically_waived: z.boolean().optional(),
      notes: z.string().optional(),
    }),
  ),
  goals: z.object({
    career_recommendations: z.array(z.string()),
    desired_duties: z.string(),
    goals_statement: z.string().optional(),
  }),
  counseling: z.object({
    date_counseled: z.string().optional(),
    counselor: z.string().optional(),
  }),
  additional: z.string(),
});

const GeneratedItemSchema = z.object({
  text: z.string(),
  sources: z.array(z.string()).min(1),
});

const GeneratedBlockSchema = z.object({
  text: z.string(),
  items: z.array(GeneratedItemSchema),
});

const MissingInfoFlagSchema = z.object({
  block: z.union([
    z.literal(20),
    z.literal(28),
    z.literal(29),
    z.literal(30),
    z.literal(41),
    z.literal(43),
    z.literal(44),
    z.literal(45),
  ]),
  field: z.string().nullable(),
  message: z.string(),
});

export const AutofillModelOutputSchema: z.ZodType<AutofillModelOutput> =
  z.object({
    blocks: z.object({
      comments: GeneratedBlockSchema,
      primary_duty_abbrev: GeneratedBlockSchema,
      primary_duties: GeneratedBlockSchema,
      command_achievements: GeneratedBlockSchema,
      qualifications: GeneratedBlockSchema.optional(),
      career_recommendations: GeneratedBlockSchema.extend({
        entries: z.array(z.string()),
      }),
      physical_readiness: GeneratedBlockSchema,
    }),
    missing_info: z.array(MissingInfoFlagSchema),
    promotion_advisory: z.object({
      advisory_only: z.literal(true),
      recommendation: z.enum(PROMOTION_RECOMMENDATIONS),
      rationale: z.string(),
      sources: z.array(z.string()),
    }),
  });

// ── Budgets (single source: lib/commentFit.ts constants) ─────────────────────

export interface AutofillBudgets {
  comments: { chars_per_line: number; max_lines: number; target_lines: number };
  primary_duties: {
    chars_per_line: number;
    max_lines: number;
    first_line_lead: number;
  };
  primary_duty_abbrev: { max_chars: number };
  command_achievements: { chars_per_line: number; max_lines: number };
  qualifications?: { chars_per_line: number; max_lines: number }; // EVAL only
  career_recommendations: { slots: number; max_chars: number };
}

export function computeBudgets(
  reportType: AutofillRequest["report_type"],
  pitch: "10" | "12",
): AutofillBudgets {
  const comments = checkCommentFit("", pitch); // 90/84 CPL × 18 lines
  const pd = getPrimaryDutiesFieldFit(reportType);
  const ca = FIELD_FIT.command_achievements;
  const quals = FIELD_FIT.qualifications;
  return {
    comments: {
      chars_per_line: comments.charsPerLine,
      max_lines: COMMENTS_MAX_LINES,
      target_lines: COMMENTS_TARGET_LINES,
    },
    primary_duties: {
      chars_per_line: pd.charsPerLine,
      max_lines: pd.maxLines,
      first_line_lead: pd.firstLineLead ?? 0,
    },
    primary_duty_abbrev: { max_chars: PRIMARY_DUTY_ABBREV_MAX },
    command_achievements: {
      chars_per_line: ca.charsPerLine,
      max_lines: ca.maxLines,
    },
    ...(reportType === "EVAL"
      ? {
          qualifications: {
            chars_per_line: quals.charsPerLine,
            max_lines: quals.maxLines,
          },
        }
      : {}),
    career_recommendations: { slots: CAREER_REC_SLOTS, max_chars: CAREER_REC_MAX },
  };
}

/** Model payload: { report_type, period_from, period_to, pitch, budgets,
 *  physical_readiness, brag, prior_evals, ladr }. NORMATIVE: deletes
 *  brag.admin.dod_id from the copy before returning (§1.2 item 10). */
export function buildAutofillPayload(
  req: AutofillRequest,
): Record<string, unknown> {
  const brag: BragSheetData = structuredClone(req.brag);
  delete brag.admin.dod_id; // the member's DoD ID never reaches the model
  return {
    report_type: req.report_type,
    period_from: req.period_from,
    period_to: req.period_to,
    pitch: req.pitch,
    budgets: computeBudgets(req.report_type, req.pitch),
    physical_readiness: collapsePfa(req.brag),
    brag,
    prior_evals: req.prior_evals,
    ladr: req.ladr,
  };
}

// ── Citation grammar (§4.6) ──────────────────────────────────────────────────

const nonEmpty = (v: unknown): boolean =>
  v !== undefined && v !== null && v !== "" && !(Array.isArray(v) && v.length === 0);

const PRIOR_EVAL_FIELDS: readonly string[] = [
  "comments",
  "qualifications",
  "primary_duties",
  "promotion_recommendation",
  "trait_average",
];

/** Resolve one citation path against the request. Resolvable forms:
 *  brag.<dotted path with [n] indices> (terminal value defined and non-empty;
 *  brag.admin.dod_id never resolves), prior_evals[<period_to>](.field)?, and
 *  ladr.<category>[<milestone_id>]. Anything else: unresolvable. */
export function resolveCitation(path: string, req: AutofillRequest): boolean {
  if (path.startsWith("brag.")) {
    // Stripped from the payload — a citation to it can never be evidence.
    if (path === "brag.admin.dod_id" || path.startsWith("brag.admin.dod_id."))
      return false;
    let cur: unknown = req.brag;
    for (const seg of path.slice("brag.".length).split(".")) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)((?:\[\d+\])*)$/.exec(seg);
      if (!m) return false;
      if (typeof cur !== "object" || cur === null) return false;
      cur = (cur as Record<string, unknown>)[m[1]];
      for (const idxMatch of Array.from(m[2].matchAll(/\[(\d+)\]/g))) {
        if (!Array.isArray(cur)) return false;
        cur = cur[Number(idxMatch[1])];
      }
    }
    return nonEmpty(cur);
  }

  const prior =
    /^prior_evals\[([^\]]+)\](?:\.([a-z_]+))?$/.exec(path);
  if (prior) {
    const summary = req.prior_evals.find((p) => p.period_to === prior[1]);
    if (!summary) return false;
    if (!prior[2]) return true;
    if (!PRIOR_EVAL_FIELDS.includes(prior[2])) return false;
    return nonEmpty(summary[prior[2] as keyof PriorEvalSummary]);
  }

  const ladr = /^ladr\.([^[\]]+)\[([^\]]+)\]$/.exec(path);
  if (ladr) {
    return req.ladr.some(
      (s) => s.category === ladr[1] && s.milestone_id === ladr[2],
    );
  }

  return false;
}

// ── Model call ───────────────────────────────────────────────────────────────

/** The generateText wrapper — service.ts builds the callModel it injects into
 *  runAutofill with this. Exported so the §9.5 call-shape test can drive it
 *  directly with "ai" mocked; runAutofill itself never calls generateText.
 *  No sampling parameters are ever sent (repo convention, tested). */
export function buildCallModel(
  resolved: ResolvedAiModel,
): (prompt: string) => Promise<unknown> {
  return async (prompt: string) => {
    const { output } = await generateText({
      model: resolved.model,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(AUTOFILL_TIMEOUT_MS),
      system: AUTOFILL_SYSTEM_PROMPT,
      prompt,
      output: Output.object({ schema: AutofillModelOutputSchema }),
    });
    return output;
  };
}

// ── §7 pipeline ──────────────────────────────────────────────────────────────

const BLOCK_NAMES = [
  "comments",
  "primary_duty_abbrev",
  "primary_duties",
  "command_achievements",
  "qualifications",
  "career_recommendations",
  "physical_readiness",
] as const;

/** Exact-substring removal of a stripped item's text from its block text,
 *  collapsing the doubled whitespace/newline left behind (§7 step 2). */
function removeSegment(text: string, segment: string): string {
  const idx = segment ? text.indexOf(segment) : -1;
  if (idx === -1) return text;
  let before = text.slice(0, idx);
  let after = text.slice(idx + segment.length);
  const beforeWs = /\s+$/.exec(before)?.[0] ?? "";
  const afterWs = /^\s+/.exec(after)?.[0] ?? "";
  if (beforeWs && afterWs) {
    before = before.slice(0, before.length - beforeWs.length);
    after = after.slice(afterWs.length);
    const joiner = (beforeWs + afterWs).includes("\n") ? "\n" : " ";
    return (before + joiner + after).trim();
  }
  return (before + after).trim();
}

interface PipelinePass {
  out: AutofillModelOutput;
  citation_failures: AutofillResponse["citation_failures"];
  fit_reports: AutofillResponse["fit_reports"];
  overflow_feedback: string[]; // empty ⇒ every block fits
}

/** §7 steps 2–4 over one parsed model output (mutates `out`, which is a fresh
 *  Zod-parsed tree). */
function validatePass(
  out: AutofillModelOutput,
  req: AutofillRequest,
): PipelinePass {
  // Step 2 — citation resolution (anti-fabrication gate, citation-or-delete).
  const citation_failures: AutofillResponse["citation_failures"] = [];
  for (const name of BLOCK_NAMES) {
    const block = out.blocks[name];
    if (!block) continue;
    const kept: GeneratedItem[] = [];
    for (const item of block.items) {
      if (item.sources.some((s) => resolveCitation(s, req))) {
        kept.push(item);
      } else {
        block.text = removeSegment(block.text, item.text);
        citation_failures.push({
          block: name,
          text: item.text,
          bad_sources: item.sources,
        });
      }
    }
    block.items = kept;
  }
  const advisory = out.promotion_advisory;
  if (!advisory.sources.some((s) => resolveCitation(s, req))) {
    advisory.rationale =
      "No cited evidence survived validation — advisory withheld.";
  }

  // Step 3 — deterministic Block 20: the server value always wins.
  const pfaCode = collapsePfa(req.brag);
  if (!/^[PBFMWN]*$/.test(pfaCode)) {
    throw new Error(`invalid Block 20 collapse "${pfaCode}"`);
  }
  out.blocks.physical_readiness.text = pfaCode;
  if (
    req.brag.pfa.some((c) => c.result === "B") &&
    !/\b\d{2}-[12]\b/.test(out.blocks.primary_duties.text)
  ) {
    out.missing_info.push({
      block: 29,
      field: "brag.pfa",
      message:
        "A Bad-Day/B cycle requires a PFA comment in Block 29 (BUPERSINST 1610.10H).",
    });
  }

  // Step 4 — career recommendations: trim + upcase, then slot/length caps;
  // violations drop the offending entry with a Block 41 flag.
  const rec = out.blocks.career_recommendations;
  const entries: string[] = [];
  for (const entry of rec.entries.map((e) => e.trim().toUpperCase())) {
    if (entries.length >= CAREER_REC_SLOTS) {
      out.missing_info.push({
        block: 41,
        field: "brag.goals.career_recommendations",
        message: `Block 41 allows at most ${CAREER_REC_SLOTS} career recommendations — "${entry}" dropped.`,
      });
    } else if (entry.length > CAREER_REC_MAX) {
      out.missing_info.push({
        block: 41,
        field: "brag.goals.career_recommendations",
        message: `Career recommendation "${entry}" exceeds ${CAREER_REC_MAX} characters including spaces (Block 41) — dropped.`,
      });
    } else {
      entries.push(entry);
    }
  }
  rec.entries = entries;

  // Step 4 — fit checks (lib/commentFit: the same wrap as screen + PDF).
  const pd = getPrimaryDutiesFieldFit(req.report_type);
  const ca = FIELD_FIT.command_achievements;
  const quals = FIELD_FIT.qualifications;
  const fits: Record<string, CommentFitResult> = {
    comments: checkCommentFit(out.blocks.comments.text, req.pitch),
    primary_duty_abbrev: measureTextFit(
      out.blocks.primary_duty_abbrev.text,
      PRIMARY_DUTY_ABBREV_MAX,
      1,
    ),
    primary_duties: measureTextFit(
      out.blocks.primary_duties.text,
      pd.charsPerLine,
      pd.maxLines,
      pd.firstLineLead ?? 0,
    ),
    command_achievements: measureTextFit(
      out.blocks.command_achievements.text,
      ca.charsPerLine,
      ca.maxLines,
    ),
    ...(req.report_type === "EVAL" && out.blocks.qualifications
      ? {
          qualifications: measureTextFit(
            out.blocks.qualifications.text,
            quals.charsPerLine,
            quals.maxLines,
          ),
        }
      : {}),
  };

  const toReport = (fit: CommentFitResult): BlockFitReport => ({
    fit,
    overflow: !fit.fit,
    truncation_preview: fit.fit
      ? null
      : fit.wrappedLines.slice(0, fit.maxLines).join("\n"),
    dropped_lines: fit.fit ? [] : fit.wrappedLines.slice(fit.maxLines),
  });

  const fit_reports: AutofillResponse["fit_reports"] = {
    comments: toReport(fits.comments),
    primary_duty_abbrev: toReport(fits.primary_duty_abbrev),
    primary_duties: toReport(fits.primary_duties),
    command_achievements: toReport(fits.command_achievements),
    ...(fits.qualifications
      ? { qualifications: toReport(fits.qualifications) }
      : {}),
  };

  // Step 5 input — concrete per-block feedback for the single overflow retry.
  const overflow_feedback = Object.entries(fits)
    .filter(([, f]) => !f.fit)
    .map(
      ([name, f]) =>
        `${name} used ${f.linesUsed}/${f.maxLines} lines at ${f.charsPerLine} CPL — cut ${f.linesUsed - f.maxLines} lines`,
    );

  return { out, citation_failures, fit_reports, overflow_feedback };
}

/** §7 step 6 — the would-be draft, merged inline with the §5.3 field mapping
 *  but WITHOUT the seed spread (lib/formDefinitions executes
 *  createBrowserClient() at module scope; the §4 import-safety rule bars that
 *  transitive import here). Seed-only defaults the inline draft lacks may
 *  surface as extra dry-run findings — acceptable; the authoritative gate
 *  remains submit-time runFullValidation on the real draft. */
function buildMergedDraft(
  req: AutofillRequest,
  out: AutofillModelOutput,
): Evaluation {
  const a = req.brag.admin;
  const blocks = out.blocks;
  return {
    form_definition_id: "",
    report_type: req.report_type,
    member_name: (a.member_name ?? "").toUpperCase(),
    dod_id: a.dod_id ?? "",
    grade_rate: a.grade_rate ?? "",
    designator: a.designator ?? "",
    period_from: req.period_from,
    period_to: req.period_to,
    duty_status: a.duty_status ?? "",
    uic: a.uic && a.uic.length === 5 ? a.uic : "00000", // DB CHECK: 5 chars or '00000'
    ship_station: a.ship_station ?? "",
    promotion_status: "",
    trait_grades: {}, // never generated (invariant §1.2 item 2)
    comments: blocks.comments.text,
    career_recommendations: blocks.career_recommendations.entries,
    promotion_recommendation: "Promotable", // seed default — the advisory is NEVER copied (§1.2 item 3)
    retention: "",
    status: "draft",
    block_values: {
      comment_pitch: req.pitch,
      ...(a.date_reported ? { date_reported: a.date_reported } : {}),
      ...(blocks.primary_duty_abbrev.text
        ? { primary_duty_abbrev: blocks.primary_duty_abbrev.text }
        : {}),
      ...(blocks.primary_duties.text
        ? { primary_duties: blocks.primary_duties.text }
        : {}),
      ...(blocks.command_achievements.text
        ? { command_achievements: blocks.command_achievements.text }
        : {}),
      ...(req.report_type === "EVAL" && blocks.qualifications?.text
        ? { qualifications: blocks.qualifications.text }
        : {}),
      // Block 20 — deterministic, from the sheet, never from generated text:
      ...(req.brag.pfa.length ? { physical_readiness: collapsePfa(req.brag) } : {}),
      // Blocks 30/31 — deterministic pass-through, never AI-written:
      ...(req.brag.counseling.date_counseled
        ? {
            date_counseled: req.brag.counseling.date_counseled,
            counselor: req.brag.counseling.counselor ?? "",
          }
        : {}),
    },
  };
}

/** Full pipeline (§7). Throws AutofillModelError (→ route 502) after a failed
 *  parse retry; never throws for overflow or citation failures. Total model
 *  calls per run ≤ 3 (initial + parse retry + overflow retry). */
export async function runAutofill(
  req: AutofillRequest,
  callModel: (prompt: string) => Promise<unknown>, // injected — unit-testable without "ai" mocks
): Promise<Omit<AutofillResponse, "model">> {
  const payload = buildAutofillPayload(req);
  let calls = 0;
  const call = (feedback: string[] | null): Promise<unknown> => {
    calls += 1;
    return callModel(
      JSON.stringify(feedback ? { ...payload, retry_feedback: feedback } : payload),
    );
  };

  // Step 1 — parse; one retry with the Zod error text appended as feedback.
  const parsePhase = async (
    feedback: string[] | null,
  ): Promise<AutofillModelOutput> => {
    let result = AutofillModelOutputSchema.safeParse(await call(feedback));
    if (!result.success && calls < 3) {
      result = AutofillModelOutputSchema.safeParse(
        await call([...(feedback ?? []), result.error.message]),
      );
    }
    if (!result.success) throw new AutofillModelError(result.error.message);
    return result.data;
  };

  // Steps 2–4.
  let pass = validatePass(await parsePhase(null), req);

  // Step 5 — overflow: ONE automatic retry with concrete feedback; the retry
  // output re-enters at step 1 and steps 2–4 re-run. Still overflowing ⇒
  // return anyway with overflow: true — the server NEVER silently truncates.
  if (pass.overflow_feedback.length > 0 && calls < 3) {
    pass = validatePass(await parsePhase(pass.overflow_feedback), req);
  }

  // Step 6 — dry-run runFullValidation over the merged would-be draft.
  const dry_run = runFullValidation(buildMergedDraft(req, pass.out));

  // Step 7 — promotion_advisory passes through for display only; nothing here
  // or in the apply flow writes it to Evaluation.promotion_recommendation.
  return {
    ...pass.out,
    fit_reports: pass.fit_reports,
    citation_failures: pass.citation_failures,
    dry_run,
  };
}

// ── System prompt (§4.6 — verbatim, no edits) ────────────────────────────────

export const AUTOFILL_SYSTEM_PROMPT = `You are the APEX EVAL Draft Assistant. You draft U.S. Navy performance evaluation
narrative blocks (NAVPERS 1616/26 EVAL, 1616/27 CHIEFEVAL, 1610/2 FITREP) from a
Sailor's brag sheet, prior evaluation summaries, and Learning and Development
Roadmap (LaDR) milestone status. You write drafts for a human reporting senior to
edit and sign — you are never the final author.

INPUT
You receive exactly one JSON object:
{ report_type, period_from, period_to, pitch, budgets, physical_readiness, brag,
  prior_evals, ladr }
- brag: the member's APEX Brag Sheet (sections: admin, duties, job, leadership,
  accomplishments, qualifications, off_duty, pfa, goals, counseling, additional).
- prior_evals: prior report summaries, each keyed by its period_to date.
- ladr: rating roadmap milestones with status met / not_met / na / unanswered.
- budgets: hard physical limits per block, measured from the printed forms. They
  are authoritative. Your output is machine-wrapped character-by-character in
  fixed-pitch Courier and rejected if it exceeds them — count characters, not words.
- physical_readiness: the Block 20 code string, precomputed from brag.pfa.

GROUNDING RULES (absolute — violations are machine-detected and discarded)
1. Every bullet, sentence, and entry you generate MUST carry at least one source
   citation in its "sources" array. A citation is a JSON path into the input:
     "brag.duties[2].bullets[0]"            (0-based array indices)
     "brag.leadership.retention_efforts[1].metrics"
     "prior_evals[2025-03-15].comments"     (keyed by that report's period_to)
     "ladr.qual_warfare[<milestone_id>]"    (category, then milestone_id)
   Citations are machine-resolved after you respond; any item whose paths do not
   resolve is deleted. Cite the narrowest path that supports the claim.
2. Never fabricate. Do not invent numbers, percentages, dollar figures, award
   names, qualification titles, dates, personnel counts, ship or program names.
   If the brag sheet gives no metric for an accomplishment, write the bullet
   without numbers and add a missing_info flag requesting the metric.
3. If a block needs information that is absent (no months on a duty, no PFA
   cycles, no career recommendation, no command-level achievements), do NOT
   guess. Emit the best text possible from what exists — or empty text — and add
   a missing_info flag naming the block and the exact payload path.
4. prior_evals are context only: use them for continuity phrasing and trend, and
   for deduplication. Never copy a prior sentence verbatim. Never list in Block
   44 anything already present in any prior_evals[].qualifications
   (BUPERSINST 1610.10H: "Do not repeat information from earlier reports").
5. LaDR items with status "met" may substantiate qualification and development
   claims. Items "not_met" may inform the promotion advisory rationale only —
   never as a negative Block 43 comment unless the brag sheet itself raises it.

STYLE (BUPERSINST 1610.10H, Chapter 13)
- Bullet format: ACTION — IMPACT — RESULT. Open with a strong verb, quantify the
  impact (numbers, %, $, hours saved, readiness gained), end with the "so what"
  for the command or Navy.
- No unsubstantiated superlatives. "SUPERB", "UNMATCHED", "#1 OF N" only when a
  cited fact backs the claim; otherwise open with the strongest cited
  accomplishment.
- EVAL and CHIEFEVAL comments: UPPERCASE (fleet Courier convention). FITREP:
  mixed case permitted.
- No classified information. No non-standard acronyms — spell out on first use.
  No prohibited comments: protected characteristics, unadjudicated allegations,
  marital status, or anything Chapter 13 bars.
- Promotion language convention: the closing line of comments must match the
  promotion advisory category exactly and never exceed it —
  Early Promote → "PROMOTE TO <next rate/grade> NOW!" / Must Promote → "PROMOTE
  AHEAD OF PEERS" / Promotable → positive, unaccelerated language / Progressing
  or below → developmental language, no promotion push.

BLOCK-BY-BLOCK (write to budgets; every value below is enforced after you respond)
- comments (Block 43): budgets.comments.chars_per_line (90 at 10-pitch, 84 at
  12-pitch) × 18 lines maximum. TARGET budgets.comments.target_lines (17) to
  leave the reporting senior editing room. Structure: one opener line
  establishing scope (personnel led, budget, equipment value — from
  brag.leadership), grouped accomplishment bullets prefixed "- ", one closing
  promotion-language line. Substantiate any trait_hint'd accomplishment
  explicitly (these back Blocks 33–39 marks the human will assign).
- primary_duty_abbrev (Block 29A): ≤ budgets.primary_duty_abbrev.max_chars (14)
  characters; abbreviation of the duty flagged is_most_significant.
- primary_duties (Block 29B): duty titles with months in order — most
  significant primary first, then other primary, collateral, watchstanding —
  formatted "TITLE-<months>; ". Append periods not available for duty
  (brag.admin.periods_unavailable, brag.duties kind "temadd") and PFA cycle
  notes from brag.pfa (e.g. "25-1:P/PRT OUTSTANDING/BCA WNL"). A Block 20 code
  of B REQUIRES a PFA comment here. Budget: 91 chars/line ×
  budgets.primary_duties.max_lines (3 on EVAL, 4 on CHIEFEVAL/FITREP); the
  FIRST line is budgets.primary_duties.first_line_lead (20) characters shorter
  because Block 29A shares it.
- command_achievements (Block 28): command employment and command-level awards
  only, from brag.job.team_contributions and brag context — operational/
  training/maintenance periods with months (unclassified). 91 chars × 3 lines.
  Nothing command-level provided → empty text + missing_info flag.
- qualifications (Block 44): ONLY when report_type is EVAL. Completed-this-
  period quals, courses with credit hours, degrees, personal awards, community
  involvement — 91 chars × 2 lines, no repeats from prior reports. For
  CHIEFEVAL and FITREP, omit this block entirely and fold the material into
  comments.
- career_recommendations (Block 41): up to 2 entries, each ≤ 20 characters
  INCLUDING spaces, drawn from brag.goals.career_recommendations and
  brag.goals.desired_duties. Nothing usable → entries ["NA"] plus a
  missing_info flag.
- physical_readiness (Block 20): echo the provided physical_readiness string
  verbatim. Never compute or alter it.

PROMOTION ADVISORY (advisory only — never a form value)
Emit promotion_advisory = { advisory_only: true, recommendation, rationale,
sources }. recommendation is one of: Significant Problems, Progressing,
Promotable, Must Promote, Early Promote, NOB. Base it only on cited evidence:
the trend across prior_evals (promotion_recommendation, trait_average),
sustained accomplishments in this brag sheet, and LaDR completion. The
rationale must cite its evidence and end with: "Advisory only — the reporting
senior selects Block 45."
You must NEVER generate trait grades (Blocks 33–39). They are human judgment;
any trait grade in your output is discarded unread.

OUTPUT FORMAT
Respond with ONLY one JSON object — no markdown fences, no prose before or
after — in exactly this shape:
{
  "blocks": {
    "comments":               { "text": "...", "items": [ { "text": "...", "sources": ["..."] } ] },
    "primary_duty_abbrev":    { "text": "...", "items": [ ... ] },
    "primary_duties":         { "text": "...", "items": [ ... ] },
    "command_achievements":   { "text": "...", "items": [ ... ] },
    "qualifications":         { "text": "...", "items": [ ... ] },
    "career_recommendations": { "text": "...", "entries": ["...", "..."], "items": [ ... ] },
    "physical_readiness":     { "text": "...", "items": [ ... ] }
  },
  "missing_info": [ { "block": 43, "field": "brag.duties[0].bullets[1].metrics", "message": "..." } ],
  "promotion_advisory": { "advisory_only": true, "recommendation": "...", "rationale": "...", "sources": ["..."] }
}
"items" must segment the block's text so every claim has its own sources.
If a block has nothing grounded to say, set its text to "" and flag it —
never pad, never invent.`;
