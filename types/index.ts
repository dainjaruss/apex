// types/index.ts
//
// Core TypeScript models for evaluation reports, profiles, and validation states.
//

export type RoutingStage =
  | "sailor"
  | "rater"
  | "senior_rater"
  | "reporting_senior"
  | "admin"
  | "debrief"
  | "locked";

export interface SummaryGroup {
  id?: string;
  name: string;
  reporting_senior_id: string;
  period_to: string; // ending date YYYY-MM-DD
  grade_rate: string; // paygrade (regardless of rating)
  promotion_status: string;
  command_employment: string;
  uic?: string; // enlisted breakout dimension (BUPERSINST 1610.10H); optional until migration 003
  report_type?: "EVAL" | string;
  status?: "open" | "closed";
  created_by?: string;
  created_at?: string;
}

export interface Evaluation {
  id?: string;
  created_by?: string;
  form_definition_id: string;
  report_type: "EVAL";
  member_name: string;
  dod_id: string;
  grade_rate: string;
  designator?: string;
  period_from: string; // date string YYYY-MM-DD
  period_to: string; // date string YYYY-MM-DD
  duty_status: "ACT" | "TAR" | "INACT" | "AT/ADOS" | string;
  uic: string;
  ship_station: string;
  promotion_status: "Regular" | "Frocked" | "Selected" | "Spot" | string;
  trait_grades: {
    knowledge?: string; // '1.0' - '5.0' or 'NOB'
    work?: string;
    eo?: string;
    bearing?: string;
    accomplishment?: string;
    teamwork?: string;
    leadership?: string;
  };
  trait_average?: number;
  // Block 50 Summary Group Average — computed at render time from the member's summary
  // group (average of the members' individual trait averages). Transient: attached to the
  // PDF payload, not a stored column.
  summary_group_average?: number | null;
  // Block 46 promotion-recommendation summary — counts of the group's observed reports per
  // category. Transient (computed at render time), keyed by the 5 observed category names.
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
  reviewer_id?: string | null;
  // Custodian routing workflow (migration 002)
  summary_group_id?: string | null;
  current_holder_id?: string | null;
  previous_holder_id?: string | null;
  routing_stage?: RoutingStage;
  participants?: string[];
  signature_locked?: boolean;
  pdf_storage_path?: string | null;
  block_values: {
    physical_readiness?: string;
    reporting_senior_name?: string;
    reporting_senior_grade?: string;
    reporting_senior_designator?: string;
    reporting_senior_title?: string;
    reporting_senior_uic?: string;
    reporting_senior_dod_id?: string; // Block 27 (DoD ID in lieu of SSN — APEX PII policy, cf. Block 4)
    reporting_senior_date_signed?: string;
    reporting_senior_address?: string; // Block 48 (text — NOT a signature)
    date_counseled?: string; // Block 30
    counselor?: string; // Block 31
    individual_counseled_signature?: string; // Block 32 (optional — leave blank per EVALMAN)
    concurrent_rs_signature?: string; // Block 52 (Regular RS on Concurrent Report)
    command_achievements?: string; // Block 28 (narrative — 91 CPL × 3 lines)
    primary_duty_abbrev?: string; // Block 29A (most-significant primary duty abbreviation, <=14 chars)
    primary_duties?: string; // Block 29B (narrative — 91 CPL × 3 lines)
    qualifications?: string; // Block 44 (narrative — 91 CPL × 2 lines)
    date_reported?: string; // Block 9 (ISO yyyy-mm-dd)
    // Occasion for Report (Blocks 10-13) — multi-select; "Special" is exclusive
    periodic?: boolean; // Block 10
    detachment_individual?: boolean; // Block 11
    promotion_frocking?: boolean; // Block 12
    special?: boolean; // Block 13
    // Type of Report (Blocks 16-18) — multi-select
    not_observed?: boolean; // Block 16 (NOB)
    regular_report?: boolean; // Block 17
    concurrent_report?: boolean; // Block 18
    [key: string]: any;
  };
  created_at?: string;
  updated_at?: string;
}

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  middle_initial?: string;
  dod_id?: string;
  email?: string;
  navy_rank?: string;
  uic?: string;
  command?: string;
  preferred_role:
    "Sailor" | "Rater" | "Senior Rater" | "Reporting Senior" | "Admin";
  assigned_roles: string[];
  created_at?: string;
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
