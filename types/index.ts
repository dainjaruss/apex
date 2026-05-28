// types/index.ts
//
// Core TypeScript models for evaluation reports, profiles, and validation states.
//

export interface Evaluation {
  id?: string;
  created_by?: string;
  form_definition_id: string;
  report_type: 'EVAL';
  member_name: string;
  dod_id: string;
  grade_rate: string;
  designator?: string;
  period_from: string; // date string YYYY-MM-DD
  period_to: string; // date string YYYY-MM-DD
  duty_status: 'ACDU' | 'TAR' | 'INACT' | 'AT/ADOS' | string;
  uic: string;
  ship_station: string;
  promotion_status: 'Regular' | 'Frocked' | 'Selected' | 'Spot' | string;
  trait_grades: {
    knowledge: string; // '1.0' - '5.0' or 'NOB'
    work: string;
    eo: string;
    bearing: string;
    accomplishment: string;
    teamwork: string;
    leadership: string;
  };
  trait_average?: number;
  comments: string;
  career_recommendations: string[];
  promotion_recommendation: 'Significant Problems' | 'Progressing' | 'Promotable' | 'Must Promote' | 'Early Promote' | 'NOB' | string;
  retention: 'Recommended' | 'Not Recommended' | string;
  status: 'draft' | 'ready_for_review' | 'completed' | 'archived';
  reviewer_id?: string | null;
  pdf_storage_path?: string | null;
  block_values: {
    physical_readiness?: string;
    reporting_senior_name?: string;
    reporting_senior_grade?: string;
    reporting_senior_designator?: string;
    reporting_senior_title?: string;
    reporting_senior_uic?: string;
    reporting_senior_date_signed?: string;
    date_counseled?: string;
    counselor?: string;
    command_achievements?: string;
    primary_duties?: string;
    [key: string]: any;
  };
  created_at?: string;
  updated_at?: string;
}


// fallow-ignore-next-line unused-type
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
  preferred_role: 'Sailor' | 'Rater' | 'Senior Rater' | 'Reporting Senior' | 'Admin';
  assigned_roles: string[];
  created_at?: string;
}

export interface ValidationIssue {
  field?: string;
  block?: number;
  message: string;
}

// fallow-ignore-next-line unused-type
export interface ValidationResult {
  success: boolean;
  errors: ValidationIssue[];
}
