// src/types/index.ts
//
// Core TypeScript models for evaluation reports, profiles, validation states,
// and the new Continuity and RSCA modules.

export type RoutingStage =
  | "sailor"
  | "rater"
  | "senior_rater"
  | "reporting_senior"
  | "admin"
  | "debrief"
  | "locked";

export type FormCode = "EVAL" | "CHIEFEVAL" | "FITREP_W2_O6" | "FITREP_O7_O8";

export interface SummaryGroup {
  id: string;
  name: string;
  reporting_senior_name: string;
  reporting_senior_dod_id?: string;
  period_to: string; // ending date YYYY-MM-DD
  grade_rate: string; // paygrade
  promotion_status: string;
  command_employment?: string;
  uic?: string | null;
  duty_status?: string | null;
  billet_subcategory?: string | null;
  report_type: "EVAL" | "CHIEFEVAL" | "FITREP";
  status: "open" | "closed";
  member_ids: string[];
  /** Set when the reporting senior closes the group. Debrief copies use these, not the live pool. */
  frozen_average?: number | null;
  frozen_distribution?: { [category: string]: number } | null;
  frozen_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

/** A person registered in the command workspace. The id is their workspace address. */
export interface RosterEntry {
  id: string;
  holder_name: string;
  holder_role: "Sailor" | "Rater" | "Senior Rater" | "Reporting Senior";
}

export interface CustodyRecord {
  id: string;
  stage: RoutingStage;
  action: "created" | "forwarded" | "returned" | "signed" | "debriefed";
  from_name: string;
  to_name: string;
  to_email?: string;
  transitioned_at: string;
  notes?: string;
}

export interface Evaluation {
  id: string;
  form_definition_id?: string;
  form_code?: FormCode;
  report_type: "EVAL" | "CHIEFEVAL" | "FITREP";
  member_name: string;
  dod_id: string;
  grade_rate: string;
  designator?: string;
  period_from: string; // YYYY-MM-DD
  period_to: string; // YYYY-MM-DD
  duty_status: "ACT" | "TAR" | "INACT" | "AT/ADOS" | string;
  uic: string;
  ship_station: string;
  promotion_status: "Regular" | "Frocked" | "Selected" | "Spot" | string;
  trait_grades: Record<string, string | undefined>;
  trait_average?: number;
  summary_group_average?: number | null;
  summary_group_distribution?: { [category: string]: number } | null;
  comments: string;
  career_recommendations: string[];
  promotion_recommendation:
    | "Significant Problems"
    | "Progressing"
    | "Promotable"
    | "Must Promote"
    | "Early Promote"
    | "NOB"
    | string;
  retention: "Recommended" | "Not Recommended" | string;
  status: "draft" | "ready_for_review" | "completed" | "archived";
  routing_stage?: RoutingStage;
  current_holder_name?: string;
  current_holder_role?: string;
  current_holder_email?: string;
  return_notes?: string;
  custody_chain?: CustodyRecord[];
  // Report custody. The token is also kept in this browser. A different
  // computer that opens the file can see the holder, and cannot save until
  // the holder releases the report or 24 hours pass with no save.
  lock_holder_name?: string | null;
  lock_token?: string | null;
  lock_ratchet?: string | null;
  lock_activity_at?: string | null;
  summary_group_id?: string | null;
  /** Workspace that exported this report. The debrief copy is addressed back to it. */
  source_workspace_id?: string;
  /** True only after a debrief copy is imported. Member screens use this, not the live pool. */
  ranking_released?: boolean;
  block_values: {
    physical_readiness?: string;
    billet_subcategory?: string;
    reporting_senior_name?: string;
    reporting_senior_grade?: string;
    reporting_senior_designator?: string;
    reporting_senior_title?: string;
    reporting_senior_uic?: string;
    reporting_senior_dod_id?: string;
    reporting_senior_date_signed?: string;
    reporting_senior_address?: string;
    date_counseled?: string;
    counselor?: string;
    individual_counseled_signature?: string;
    concurrent_rs_signature?: string;
    command_achievements?: string;
    primary_duty_abbrev?: string;
    primary_duties?: string;
    qualifications?: string;
    comment_pitch?: string;
    comment_pitch_v?: number;
    date_reported?: string;
    periodic?: boolean;
    detachment_individual?: boolean;
    promotion_frocking?: boolean;
    special?: boolean;
    not_observed?: boolean;
    regular_report?: boolean;
    concurrent_report?: boolean;
    [key: string]: any;
  };
  created_at: string;
  updated_at: string;
}

// ── Continuity & Gap Tracking Record ──
export interface ContinuityRecord {
  id: string;
  member_dod_id: string;
  member_name: string;
  period_from: string; // YYYY-MM-DD
  period_to: string; // YYYY-MM-DD
  report_type: "EVAL" | "CHIEFEVAL" | "FITREP";
  occasion: "Periodic" | "Detachment" | "Promotion" | "Special";
  promotion_recommendation: string;
  individual_trait_avg?: number;
  rsca?: number;
  reporting_senior_name?: string;
  uic?: string;
  status: "verified" | "unverified" | "gap_memo_generated";
  notes?: string;
}

// ── Reporting Senior RSCA Ledger ──
export interface RscaHistoricalRecord {
  id: string;
  reporting_senior_name: string;
  reporting_senior_dod_id: string;
  paygrade: string; // E5, E6, E7, O3, etc.
  historical_total_marks: number;
  historical_report_count: number;
  calculated_rsca: number;
  last_updated: string;
}

// ── Brag Sheet Accomplishments ──
export interface BragSheetItem {
  id: string;
  category: "Primary Duty" | "Collateral Duty" | "Command Impact" | "Qualifications" | "Community/Off-Duty";
  description: string;
  action?: string;
  result?: string;
  impact?: string;
  metrics?: string;
  date_achieved?: string;
}

export interface BragSheet {
  id: string;
  member_dod_id: string;
  member_name: string;
  cycle_year: string;
  items: BragSheetItem[];
  updated_at: string;
}

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  middle_initial?: string;
  dod_id: string;
  email?: string;
  navy_rank: string;
  rate?: string;
  uic: string;
  ship_station: string;
  preferred_role: "Sailor" | "Rater" | "Senior Rater" | "Reporting Senior" | "Admin";
}

export interface ValidationIssue {
  field?: string;
  block?: number;
  message: string;
  severity?: "error" | "warning";
}

export interface ValidationResult {
  success: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
