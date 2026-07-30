// lib/boardConfidence/types.ts
//
// Pinned contracts for the Board Confidence Analyzer (spec §4.1, verbatim).
// Field names are snake_case where they mirror DB JSONB payloads (repo
// convention, types/index.ts). BOARD_DISCLAIMER is the §1.1 normative text and
// must be rendered on the page, on every results view, and stored verbatim in
// every board_analyses row.

import type { Narrative } from "@/lib/boardConfidence/narrative";

// NORMATIVE TEXT — founder-gated. Rendered on the page banner, every results view,
// the score-dial tooltip and the footer, and stored verbatim in every board_analyses
// row. Historical rows keep whatever text they were shown; they are never rewritten.
//
// The board-procedure clause is sourced, not paraphrased. PERS-803 Enlisted Selection
// Board Brief, "Board Process": "Members conduct initial independent review of each
// record. All records are then brought to tank for INDIVIDUAL briefing and voting.
// Records are then scattergrammed until selects and non-selects are determined."
// The word "slate" appears nowhere in the PERS-803 brief, the FY-27 enlisted precept,
// or either FY-27 convening order. The 100/75/50/25/0 confidence scale is published
// in the PERS-80 OFFICER brief only — no numeric vote scale is published for enlisted
// boards.
//
// "within a rating panel" alone read NARROWER than the source: PERS-803's own example
// panels each span SEVERAL rating communities (Admin/Supply, Nuke/SPECWAR, Aviation,
// Surface Ops/Engineering, Submarine, Combat Systems/Info Warfare), so a Navy reader
// could take it to mean one panel per rating. Widened to say what the brief shows.
// The gloss deliberately does NOT equate "panel" with "tank": §1.3 uses "panel" and
// "tank group" as adjacent distinct nouns (records are assigned within panels; the
// TANK GROUP votes to approve the recommended selects, by majority). Nothing in the
// disclaimer needs the word, so it does not assert the identity.
// See docs/navy-reference.md §1.3, §1.4 and §1.5.
export const BOARD_DISCLAIMER =
  "UNOFFICIAL TOOL — NOT A SELECTION BOARD. The APEX Record Readiness Review is " +
  "a self-assessment aid. It is not affiliated with, endorsed by, or predictive of any " +
  "U.S. Navy selection board, Navy Personnel Command, or BUPERS process. Scores are " +
  "computed by a fixed, published rubric modeled on the officer-brief confidence vote " +
  "bands (100/75/50/25/0), which the Navy publishes for officer boards only; enlisted " +
  "(CPO) selection boards brief and vote each record individually within a rating " +
  "panel (which groups several rating communities rather than one panel per " +
  "rating) and scattergram the results, and no numeric vote scale is published for " +
  "enlisted boards — so this model is an approximation, not actual board " +
  "procedure. Only your official record (OMPF, PSR, and a Letter to the Board) exists " +
  "to a real board. Verify your record on BOL and NSIPS, and consult your command " +
  "career counselor, before any board.";

export type BandVote = 0 | 25 | 50 | 75 | 100;

export type PromotionRec =
  | "Early Promote" | "Must Promote" | "Promotable"
  | "Progressing" | "Significant Problems" | "NOB";

export interface RubricEvalInput {
  period_from: string;              // YYYY-MM-DD
  period_to: string;                // YYYY-MM-DD
  report_type: "EVAL" | "CHIEFEVAL" | "FITREP";
  promotion_recommendation: PromotionRec;
  trait_average: number | null;     // ALWAYS recomputed via computeTraitAverage(trait_grades);
                                    // the stored evaluations.trait_average column is never trusted
  summary_group_average: number | null; // pooled SGA from peers (server-side), null if no group
  rsca: number | null;              // from member_board_records.eval_context[period_to].rsca
  sea_duty: boolean;                // eval_context override ?? tour-overlap derivation ?? false
  ep_count: number | null;          // 'Early Promote' count in the summary group (incl. this row)
  group_size: number | null;        // observed (non-NOB) N in the summary group
}

export type AwardLevel =
  | "personal_achievement"   // NAM-tier            -> 10 pts
  | "personal_commendation"  // NCM-tier            -> 20 pts
  | "msm_or_above"           // MSM and above       -> 30 pts
  | "unit";                  // unit/campaign award ->  4 pts

export interface AwardEntry  { title: string; level: AwardLevel; date_awarded: string; verified_in_ompf: boolean; }
export interface NecEntry    { code: string; title?: string; date_awarded?: string; verified_in_ompf: boolean; }
export interface QualEntry   { title: string; code?: string; date_completed?: string; verified_in_ompf: boolean; }
export interface EducationEntry { kind: "degree" | "jst_credit" | "course"; title: string; date?: string; verified_in_ompf: boolean; }
export interface PfaCycle    { cycle: string; date: string; result: "pass" | "fail" | "excused"; }
export interface TourEntry   { title: string; start: string; end: string | null; sea_duty: boolean; leadership: boolean; }
export interface AdverseEntry { kind: "page13" | "njp" | "court_memo" | "punitive_letter" | "civil_conviction" | "other"; date: string; note?: string; }

export interface PsrSection {
  entered: boolean;                  // member_board_records.psr_entered
  awards: AwardEntry[] | null;       // null = section never filled (≠ empty list)
  necs: NecEntry[] | null;
  education: EducationEntry[] | null;
  tours: TourEntry[] | null;
  pfa: PfaCycle[] | null;
  adverse: AdverseEntry[];           // always an array; default []
}

export type LadrCategory =
  | "career_milestone" | "skill_training_required" | "skill_training_recommended"
  | "nec_opportunity" | "pme_required" | "pme_recommended" | "qual_watchstanding"
  | "qual_warfare" | "qual_rate_specific" | "credential" | "education_degree"
  | "billet_recommended"
  // v1.5: the LaDR's "Considerations for advancement from E6 to E7 / E7 to E8 /
  // E8 to E9" sections — where the board's selection emphasis actually lives.
  | "advancement_consideration";

export type LadrStatus = "met" | "not_met" | "na" | "unanswered";

export interface LadrItemInput {       // one APPLICABLE checklist row (already filtered, §3 rule)
  milestone_id: string;
  category: LadrCategory;
  status: LadrStatus;
  verified_in_ompf: boolean;           // meaningful only when status === "met"
  // v1.5: true when the item carries the LaDR's board emphasis — a milestone
  // from the "Considerations for advancement" E7+ sections, or any item whose
  // applies_to_paygrades sits entirely at E7+ while the member targets E7+.
  // Emphasized items count ×board_emphasis_multiplier inside their category.
  board_emphasis?: boolean;
  // v2 readiness layer (ADDITIVE — never read by any scoring arithmetic).
  // ladr_milestones.item, so the plan can name the milestone instead of
  // emitting `ratio_qual_warfare: 0`. Optional: older persisted RubricInputs
  // snapshots in board_analyses.input predate it.
  item?: string;
  // ladr_milestones.detail.typical_months / .blocked_unless (jsonb, no
  // migration). Absent typical_months means "APEX does not know how long this
  // takes" — the readiness layer says so rather than guessing a duration.
  typical_months?: number | null;
  blocked_unless?: string | null;
}

/**
 * v2: one unmet LaDR row, with its identity intact. `marginal_points` is a TRUE
 * recompute of the development factor's own 0–100 score with this single row
 * flipped to met+verified — it is FACTOR-LOCAL, not composite points. Composite
 * worth comes from bandDeltas(), which re-scores the whole rubric per candidate.
 */
export interface LadrUnmet {
  milestone_id: string;
  item: string;                        // "" when the caller did not thread milestone text
  category: LadrCategory;
  marginal_points: number;
  board_emphasis: boolean;
}

export type PreceptFlag =
  | "warfighting" | "leadership_positions" | "education"
  | "sea_duty" | "technical_expertise";

export interface RubricInputs {
  boardDate: string;                   // T, YYYY-MM-DD — the ONLY time source (no clock reads)
  evals: RubricEvalInput[];
  psr: PsrSection;
  ladr: LadrItemInput[];
  preceptFlags: PreceptFlag[];
}

export type FactorKey =
  | "performance" | "leadership" | "development"
  | "continuity" | "completeness" | "precept";

export interface FactorResult {
  key: FactorKey;
  weight: number;                       // effective weight (after 100/90 redistribution if any)
  score: number;                        // S_f in [0,100], full float
  confidence: number;                   // conf_f in [0,1]
  contribution: number;                 // (weight/100) * score * confidence
  detail: Record<string, number | string | boolean | null>;
      // every intermediate the UI shows on expand — e.g. performance:
      // {P1, P2, P3, P4, declinePenalty, nObserved, availableSubweight, ...};
      // continuity: {windowStart, windowEnd, coverage, gapCount}; etc.
}

export interface RubricResult {
  final: number;                        // rounded to 1 decimal, half away from zero
  band: BandVote;                       // computed from the ROUNDED final (§7 bands)
  bandLabel: string;
  factors: FactorResult[];              // always 6 entries; excluded precept has weight 0,
                                        // detail.excluded = true
  adverseAdjustment: number;            // A
  warnings: string[];                   // e.g. dod_id-mismatch exclusions (§2)
  // v1.5: continuity is graded, not gated. A detected reporting gap (a missing
  // period > continuity_gap_days, excluding the pre-first-report span) sets
  // continuityGap and an advisory. The advisory states what BUPERSINST 1610.10H
  // para 17-6 actually says — missing reports DO NOT disqualify a member before a
  // selection board — and names the 17-6a/17-6b remedy. Advisory only; the score
  // is NOT forced to 0. See docs/navy-reference.md §3.7.
  continuityGap: boolean;
  continuityAdvisory: string | null;
  // v2 (ADDITIVE): scoreLadr already iterates every row and knows exactly which
  // are unmet; it used to discard that and emit only per-category ratios.
  // FactorResult.detail cannot hold an array, so the list rides on the result.
  // Optional so hand-built RubricResult literals (narrative fixtures, persisted
  // board_analyses rows written before v2) still typecheck; scoreBoardConfidence
  // always populates it.
  ladrUnmet?: LadrUnmet[];
}

// v1.5: operator-tunable rubric parameters (board_rubric_config table; the
// active row is snapshotted into every analysis for reproducibility). Defaults
// reproduce the spec §7 rubric with the continuity hard gate ON.
export interface RubricConfig {
  weights: Record<FactorKey, number>;   // normalized to sum 100 at run time
  continuity_gap_days: number;          // a missing period longer than this ⇒ advisory
  board_emphasis_multiplier: number;    // ×weight for board-emphasis LaDR items
}

export interface BoardAnalysisRow {     // mirror of public.board_analyses
  id?: string;
  user_id: string;
  board_date: string;
  input: RubricInputs & { disclaimer: string; warnings: string[]; meta: Record<string, unknown> };
  factor_scores: FactorResult[];
  overall_score: number;
  band: BandVote;
  adverse_adjustment: number;           // A, persisted (v1.1 review fix — never derived client-side)
  narrative: Narrative;                 // from narrative.ts
  narrative_source: "model" | "fallback";
  narrative_fallback_reason: "no_key" | "model_error" | null; // v1.1 review fix; null when source="model"
  model: string | null;
  created_by: string;
  created_at?: string;
}

export interface MemberBoardRecord {    // mirror of public.member_board_records
  id?: string;
  user_id: string;
  rating_abbrev: string | null;
  target_paygrade: number | null;
  psr_entered: boolean;
  awards: AwardEntry[];
  necs: NecEntry[];
  quals: QualEntry[];
  education: EducationEntry[];
  pfa_history: PfaCycle[];
  tours: TourEntry[];
  adverse: AdverseEntry[];
  eval_context: Record<string, { rsca?: number; sea_duty?: boolean }>;
  ladr_checklist: Record<string, { status: LadrStatus; verified_in_ompf: boolean }>;
  /** v1.1: informed-consent timestamp; the analyze route refuses to run while null. */
  consented_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface LadrDocument {
  id?: string; rating_abbrev: string; rating_name: string;
  paygrade_range: "E1"|"E4"|"E5"|"E6"|"E7"|"E8"|"E9"|"E1-E9";
  version: string; effective_date: string; source_url: string;
  source_hash?: string | null; created_at?: string;
}

export interface LadrMilestone {
  id?: string; ladr_document_id: string; category: LadrCategory;
  item: string; item_code: string | null; applies_to_paygrades: number[];
  detail: Record<string, unknown>; sort_order: number; created_at?: string;
}

export interface BoardPrecept {
  id?: string; cycle: string; title: string;
  emphasis_flags: Partial<Record<PreceptFlag, boolean>>;
  source_url?: string | null; active: boolean; created_at?: string;
}
