// lib/bragSheet/types.ts — APEX Brag Sheet v1.0
// One JSONB payload (brag_sheets.data). snake_case mirrors the repo's DB-JSONB
// convention (types/index.ts, lib/boardConfidence/types.ts). Every field is
// annotated "feeds:" with the NAVPERS block it supplies. Block numbers use the
// enlisted 1616/26 numbering the whole repo keys on (comments = "Block 43" etc.);
// on CHIEFEVAL/FITREP the same *field names* land on Block 40/41 — the aliasing
// lives in lib/bupersGuidelines.json, not here.
// Reuses: PRIMARY_DUTY_ABBREV_MAX, CAREER_REC_MAX/SLOTS, COUNSELOR_MAX
// (types/navpers.ts via lib/commentFit.ts); LadrCategory/LadrStatus
// (lib/boardConfidence/types.ts).

import type { LadrCategory, LadrStatus } from "@/lib/boardConfidence/types";
import type { CommentFitResult } from "@/lib/commentFit";
import type { ValidationResult } from "@/types";
import { PROMOTION_RECOMMENDATIONS } from "@/types/navpers";

export const BRAG_SHEET_VERSION = "1.0" as const;

// §1.1 normative disclaimers, verbatim.
export const BRAG_AI_DISCLAIMER =
  "UNOFFICIAL DRAFTING AID. AI-generated text is a proposal drafted from your own " +
  "brag sheet entries — it is not an official evaluation, has not been reviewed by " +
  "your chain of command, and may contain errors. Review every line before use. " +
  "Trait grades (Blocks 33–39) and the promotion recommendation (Block 45) are never " +
  "generated: they are human judgments reserved to the reporting senior. Never enter " +
  "classified information in a brag sheet.";

export const BRAG_PDF_FOOTER =
  "APEX Brag Sheet v1.0 — Powered by APEX · Unofficial worksheet, not a NAVPERS form " +
  "· Contains member-entered data only — verify before use in an official report";

/** DB row (table: brag_sheets). data is the JSONB template payload below. */
export interface BragSheet {
  id?: string;
  user_id: string;
  evaluation_id?: string | null;        // set once linked to a draft Evaluation
  report_type: "EVAL" | "CHIEFEVAL" | "FITREP";
  period_from: string;                  // ISO — feeds Block 14
  period_to: string;                    // ISO — feeds Block 15
  template_version: typeof BRAG_SHEET_VERSION;
  data: BragSheetData;                  // JSONB
  status: "draft" | "submitted";
  consented_at?: string | null;         // AI-use consent timestamp (autofill 403 gate)
  last_autofill?: AutofillResponse | null; // most recent proposal (service-role write)
  created_at?: string;
  updated_at?: string;
}

export interface BragSheetData {
  admin: BragAdmin;
  duties: BragDuty[];                   // repeating rows
  job: BragJob;
  leadership: BragLeadership;
  accomplishments: BragAccomplishment[];// repeating rows
  qualifications: BragQualifications;
  off_duty: BragOffDuty;
  pfa: BragPfaCycle[];                  // repeating rows, oldest → newest
  goals: BragGoals;
  counseling: BragCounseling;
  additional: string;                   // "other items for consideration" — feeds Block 43
}

/** Section 1 — ADMIN. Prefilled from Profile + prior eval where possible; all editable. */
export interface BragAdmin {
  member_name?: string;                 // feeds Block 1 (LAST, FIRST MI)
  grade_rate?: string;                  // feeds Block 2
  designator?: string;                  // feeds Block 3 (warfare quals / 4-digit officer desig)
  dod_id?: string;                      // feeds Block 4 (10-digit DoD ID — APEX PII policy)
  duty_status?: "ACT" | "TAR" | "INACT" | "AT/ADOS"; // feeds Block 5
  uic?: string;                         // feeds Block 6
  ship_station?: string;                // feeds Block 7
  date_reported?: string;               // ISO — feeds Block 9
  prior_report_end?: string;            // ISO — Block 14 must be the day after (period seed)
  date_of_rate?: string;                // ISO — no block; advancement-eligibility context for
                                        // the Block 45 promotion ADVISORY only
  periods_unavailable: { start: string; end: string; reason: string }[];
                                        // feeds Block 29B "periods not available for duty"
}

/** One accomplishment bullet — the atomic unit the auto-fill cites. */
export interface BragBullet {
  text: string;                         // what happened (action + result, member's words)
  metrics?: string;                     // quantified impact: "$1.2M", "12 Sailors", "98.2% uptime"
                                        // absent metrics ⇒ auto-fill emits a missing-info flag
}

/** Section 2 — DUTIES (repeating). */
export interface BragDuty {
  title: string;                        // feeds Block 29B "TITLE-<months>" list
  kind: "primary" | "collateral" | "watchstanding" | "temadd";
                                        // orders Block 29B: primary → collateral → watchstanding;
                                        // temadd rows feed the 29B TEMADD/where-when-why note
  months_assigned: number;              // feeds Block 29B months suffix
  is_most_significant?: boolean;        // exactly one primary row — leads Block 29B, names 29A
  abbrev?: string;                      // ≤14 chars (PRIMARY_DUTY_ABBREV_MAX) — feeds Block 29A
  bullets: BragBullet[];                // per-duty accomplishments — feed Block 43
}

/** Section 3 — JOB INFORMATION. */
export interface BragJob {
  responsibilities: string;             // principal activities/scope — feeds Block 43 opener and
                                        // the optional Block 29B job-scope statement
  equipment: string[];                  // equipment operated/qualified on — feeds Block 43; Block 44
  customers: string;                    // customers/commands served — feeds Block 43
  classified_material?: string;         // responsibility level (unclassified wording) — Block 43
  team_contributions: BragBullet[];     // contributions to team/command results — feed Block 43;
                                        // command-level items (deployments, unit awards) feed Block 28
}

/** Section 4 — SUPERVISION & LEADERSHIP. */
export interface BragLeadership {
  supervised_military: number;          // feeds Block 43 scope line ("LED 14 SAILORS...")
  supervised_civilian: number;          // feeds Block 43
  supervised_via_subordinates: number;  // feeds Block 43
  equipment_value?: string;             // "$" figure of gear responsible for — feeds Block 43
  budget_managed?: string;              // feeds Block 43
  instructor_roles: BragBullet[];       // feeds Block 43 (instructor performance)
  mentoring: BragBullet[];              // counseling/mentoring given — feeds Block 43; substantiates
                                        // CHIEFEVAL human_development / EVAL leadership traits
  retention_efforts: BragBullet[];      // feeds Block 43; results inform Block 47 retention (EVAL only)
}

/** Section 5 — INDIVIDUAL ACCOMPLISHMENTS (repeating), not tied to a single duty. */
export interface BragAccomplishment extends BragBullet {
  trait_hint?: string;                  // optional key from the active form's trait set
                                        // (TRAIT_KEYS / CHIEFEVAL_TRAIT_KEYS / FITREP_TRAIT_KEYS,
                                        // types/navpers.ts) — routes the bullet as SUBSTANTIATION
                                        // for that trait in Block 43. Never generates a grade.
                                        // NOTE: TRAIT_KEYS (types/navpers.ts:11) is currently
                                        // module-private; this feature adds `export` to it (§11).
                                        // Do NOT substitute lib/traitAverage.ts TRAIT_KEYS — that
                                        // is a cross-form superset (enlisted+CPO+officer), wrong
                                        // for the EVAL trait-hint select.
}

/** Section 6 — QUALIFICATIONS / AWARDS / EDUCATION (completed THIS period only). */
export interface BragQualifications {
  quals: { title: string; date: string }[];       // warfare/watch/rate quals — feed Block 44
                                                  // (EVAL) or Block 43 (CHIEFEVAL/FITREP);
                                                  // watch quals also feed Block 29B
  education: { title: string; date: string; credit_hours?: number }[];
                                                  // courses/degrees/certs — feed Block 44 / 43
  awards: { title: string; date: string }[];      // personal awards, LOC/LOA — feed Block 44 / 43
}

/** Section 7 — OFF-DUTY. */
export interface BragOffDuty {
  education: BragBullet[];              // off-duty education — feeds Block 44 / 43
  community: BragBullet[];              // volunteer/civic — feeds Block 44 / 43
  navy_pr: BragBullet[];                // voluntary Navy public relations — feeds Block 43
  civilian_employment?: string;         // reservists — feeds Block 43 context
}

/** Section 8 — PRIMS/PFA (repeating, oldest → newest).
 *  Deterministic collapse: data.pfa.map(c => c.result).join("") === Block 20
 *  physical_readiness (schema regex ^[PBFMWN]+$, types/navpers.ts). Never model-generated. */
export interface BragPfaCycle {
  cycle: string;                        // "25-1" — feeds the Block 29B cycle note
  result: "P" | "B" | "F" | "M" | "W" | "N"; // feeds Block 20 (one letter per cycle, in order)
  prt_category?: "Outstanding" | "Excellent" | "Good" | "Satisfactory" | "Probationary";
  prt_score?: number;                   // feed the Block 29B note ("25-1:P/PRT OUTSTANDING/95")
  bca?: "within" | "not_within" | "waived";
  medically_waived?: boolean;
  notes?: string;                       // Bad Day / alternate cardio — feeds Block 29B note;
                                        // a "B" result REQUIRES a Block 29 comment (10.10H)
}

/** Section 9 — FUTURE GOALS. */
export interface BragGoals {
  career_recommendations: string[];     // ≤CAREER_REC_SLOTS (2) entries, ≤CAREER_REC_MAX (20)
                                        // chars each — feed Block 41 verbatim
  desired_duties: string;               // desired next duties/schools — raw material for Block 41
                                        // and the Block 43 closing line
  goals_statement?: string;             // long-term goals — advisory context only, no block
}

/** Section 10 — COUNSELING RECORD. */
export interface BragCounseling {
  date_counseled?: string;              // ISO date | "NOT REQ" | "NOT PERF" — feeds Block 30
  counselor?: string;                   // ≤COUNSELOR_MAX (22) chars — feeds Block 31
}

// ── AI auto-fill I/O contract (route: POST /api/brag-sheet/autofill) ─────────
// All shapes Zod-mirrored (repo convention); model output is parsed with Zod's
// default strip semantics — unknown keys (especially trait_grades) are discarded.

// ── INPUT ────────────────────────────────────────────────────────────────────
export interface AutofillRequest {
  report_type: "EVAL" | "CHIEFEVAL" | "FITREP";
  period_from: string;                   // ISO — the eval period being drafted
  period_to: string;
  pitch: "10" | "12";                    // Block 43 Courier pitch: 90 or 84 CPL (checkCommentFit)
  brag: BragSheetData;                   // the full brag sheet payload (see template)
  prior_evals: PriorEvalSummary[];       // continuity + Block 44 dedupe source
  ladr: LadrMilestoneStatus[];           // member's LaDR checklist status
}

export interface PriorEvalSummary {
  period_to: string;                     // ISO — citation key: prior_evals[<period_to>]
  report_type: "EVAL" | "CHIEFEVAL" | "FITREP";
  promotion_recommendation: string;      // Block 45 history — advisory trend input
  trait_average: number | null;
  comments: string;                      // full prior Block 43 (context/continuity, never copied)
  qualifications?: string;               // prior Block 44 — "do not repeat" dedupe source
  primary_duties?: string;               // prior Block 29B — duty-continuity context
}

export interface LadrMilestoneStatus {   // from member_board_records.ladr_checklist joined to
  milestone_id: string;                  // ladr_milestones (lib/boardConfidence/types.ts)
  category: LadrCategory;                // citation key: ladr.<category>[<milestone_id>]
  item: string;                          // milestone text, e.g. "ESWS qualification"
  status: LadrStatus;                    // met | not_met | na | unanswered
}

// Server-computed, appended to the model payload (NOT client input). Single source
// of truth: derived from lib/commentFit.ts constants so prompt and validator
// cannot drift.
//   comments:        { chars_per_line: pitch==="10"?90:84, max_lines: 18, target_lines: 17 }
//   primary_duties:  getPrimaryDutiesFieldFit(report_type)  → 91 CPL × 3 (EVAL) / 4
//                    (CHIEFEVAL/FITREP), first_line_lead: 20
//   primary_duty_abbrev: { max_chars: PRIMARY_DUTY_ABBREV_MAX }        // 14
//   command_achievements: FIELD_FIT.command_achievements               // 91 × 3
//   qualifications:  FIELD_FIT.qualifications (EVAL only)              // 91 × 2
//   career_recommendations: { slots: CAREER_REC_SLOTS, max_chars: CAREER_REC_MAX } // 2 × 20
// Plus: physical_readiness (string) = brag.pfa.map(c => c.result).join("") — computed
// server-side, echoed by the model, re-asserted by the server after generation.

// ── OUTPUT (what the model must emit; what the route returns after validation) ─
export interface GeneratedItem {
  text: string;                          // one bullet/segment of the block
  sources: string[];                     // ≥1 citation, JSON paths into AutofillRequest:
                                         //   "brag.duties[2].bullets[0]"
                                         //   "brag.leadership.retention_efforts[1].metrics"
                                         //   "prior_evals[2025-03-15].comments"
                                         //   "ladr.qual_warfare[<milestone_id>]"
}

export interface GeneratedBlock {
  text: string;                          // full block text, ready for the form field
  items: GeneratedItem[];                // per-segment provenance; concatenation ≈ text
}

export interface MissingInfoFlag {
  block: 20 | 28 | 29 | 30 | 41 | 43 | 44 | 45;
  field: string | null;                  // request path the gap concerns, e.g. "brag.duties[0].bullets[1].metrics"
  message: string;                       // "Bullet has no quantified metric — written without numbers; add one for board impact"
}

export interface PromotionAdvisory {
  advisory_only: true;                   // literal true — UI must render the disclaimer and
                                         // NEVER write recommendation into the Evaluation
  recommendation: (typeof PROMOTION_RECOMMENDATIONS)[number];
  rationale: string;                     // evidence-based, cites its sources
  sources: string[];                     // same citation grammar
}

export interface AutofillModelOutput {   // exactly what the model emits (Zod parse, §4.6)
  blocks: {
    comments: GeneratedBlock;                              // → Evaluation.comments (Block 43)
    primary_duty_abbrev: GeneratedBlock;                   // → block_values.primary_duty_abbrev (29A)
    primary_duties: GeneratedBlock;                        // → block_values.primary_duties (29B)
    command_achievements: GeneratedBlock;                  // → block_values.command_achievements (28)
    qualifications?: GeneratedBlock;                       // → block_values.qualifications (44) — EVAL only
    career_recommendations: GeneratedBlock & { entries: string[] }; // → Evaluation.career_recommendations (41)
    physical_readiness: GeneratedBlock;                    // → block_values.physical_readiness (20) — echo only
  };
  missing_info: MissingInfoFlag[];
  promotion_advisory: PromotionAdvisory;
  // trait_grades: intentionally ABSENT from the schema. The parse strips any the
  // model emits. Trait grading is human judgment — Blocks 33–39 are never generated.
}

export interface BlockFitReport {        // per narrative block, attached by the server
  fit: CommentFitResult;                 // from checkCommentFit / measureTextFit
  overflow: boolean;                     // !fit.fit — NEVER silently truncated
  truncation_preview: string | null;     // overflow only: wrappedLines.slice(0, maxLines).join("\n")
  dropped_lines: string[];               // overflow only: wrappedLines.slice(maxLines)
}

export interface AutofillResponse extends AutofillModelOutput {
  fit_reports: {                         // keys mirror blocks
    comments: BlockFitReport;
    primary_duty_abbrev: BlockFitReport; // 29A — measureTextFit(text, 14, 1), §7 step 4;
                                         // without this slot an over-limit abbrev could be
                                         // accepted past the §5.3/§6 no-overflow apply gate
    primary_duties: BlockFitReport;
    command_achievements: BlockFitReport;
    qualifications?: BlockFitReport;
  };
  citation_failures: { block: string; text: string; bad_sources: string[] }[];
                                         // items stripped because a source path did not resolve
  dry_run: ValidationResult;             // runFullValidation() over the merged draft
  model: string | null;                  // resolved model id (aiProvider convention)
}
