// lib/boardConfidence/types.ts
//
// Pinned contracts for the Board Confidence Analyzer (spec §4.1, verbatim).
// Field names are snake_case where they mirror DB JSONB payloads (repo
// convention, types/index.ts). BOARD_DISCLAIMER is the §1.1 normative text and
// must be rendered on the page, on every results view, and stored verbatim in
// every board_analyses row.

import type { Narrative } from "@/lib/boardConfidence/narrative";

export const BOARD_DISCLAIMER =
  "UNOFFICIAL TOOL — NOT A SELECTION BOARD. The APEX Board Confidence Analyzer is " +
  "a self-assessment aid. It is not affiliated with, endorsed by, or predictive of any " +
  "U.S. Navy selection board, Navy Personnel Command, or BUPERS process. Scores are " +
  "computed by a fixed, published rubric modeled on the officer-brief confidence vote " +
  "bands (100/75/50/25/0); enlisted (CPO) selection boards score records by rating " +
  "panel and vote slates, so this model is an approximation, not actual board " +
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
  | "billet_recommended";

export type LadrStatus = "met" | "not_met" | "na" | "unanswered";

export interface LadrItemInput {       // one APPLICABLE checklist row (already filtered, §3 rule)
  milestone_id: string;
  category: LadrCategory;
  status: LadrStatus;
  verified_in_ompf: boolean;           // meaningful only when status === "met"
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
