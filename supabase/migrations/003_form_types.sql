-- supabase/migrations/003_form_types.sql
-- APEX Post-MVP: Add CHIEFEVAL (E7–E9) and FITREP (W2–O6) report types.
--
-- Changes:
--   1. Lift the evaluations.report_type check constraint from 'EVAL'-only.
--   2. Populate the CHIEFEVAL (NAVPERS 1616/27) form definition with full block JSON.
--   3. Populate the FITREP_W2_O6 (NAVPERS 1610/2) form definition with full block JSON.
--   4. Add CHIEFEVAL seed to form_definitions (conflict-safe upsert).

-- ── 1. Lift the MVP-only report_type constraint ──────────────────────────────
-- The original constraint was: report_type = 'EVAL'  (added in 001_initial_schema.sql)
-- Postgres requires dropping the constraint by name. The name was auto-assigned
-- by the CHECK inline syntax; the canonical name is evaluations_report_type_check.
ALTER TABLE public.evaluations
  DROP CONSTRAINT IF EXISTS evaluations_report_type_check;

ALTER TABLE public.evaluations
  ADD CONSTRAINT evaluations_report_type_check
  CHECK (report_type IN ('EVAL', 'CHIEFEVAL', 'FITREP'));

-- ── 2. CHIEFEVAL (NAVPERS 1616/27) form definition ───────────────────────────
-- Block layout per BUPERSINST 1610.10H Chapter 10 (Chief Petty Officer Evaluation).
-- Structurally identical to 1616/26 (same block numbers, same routing/signature chain),
-- but trait labels are CPO-specific (Deckplate Leadership, Professionalism, etc.).
-- Block 47 (Retention) is N/A for E7–E9 career Sailors and is omitted.
INSERT INTO public.form_definitions (id, form_code, navpers_number, paygrade_range, blocks, active)
VALUES (
  'c1616270-cafe-4b08-9df2-5d8f28d8b4cd',
  'CHIEFEVAL',
  '1616/27',
  'E7-E9',
  '{
    "title": "Chief Evaluation Report and Counseling Record (E7-E9)",
    "revision": "05-2025",
    "source": "BUPERSINST 1610.10H, Chapter 10",
    "blocks": [
      {"number": 1,  "name": "Name",           "label": "Name (Last, First MI Suffix)",           "type": "text",      "required": true},
      {"number": 2,  "name": "Grade/Rate",      "label": "Grade/Rate",                             "type": "text",      "required": true},
      {"number": 3,  "name": "Designator",      "label": "Designator/NEC",                         "type": "text",      "required": false},
      {"number": 4,  "name": "DoD ID",          "label": "DoD ID Number",                          "type": "text",      "required": true,  "pattern": "^[0-9]{10}$"},
      {"number": 5,  "name": "Duty Status",     "label": "Duty/Competitive Status",                "type": "enum",      "required": true,  "options": ["ACT","TAR","INACT","AT/ADOS"]},
      {"number": 6,  "name": "UIC",             "label": "UIC",                                    "type": "text",      "required": true,  "maxLength": 5},
      {"number": 7,  "name": "Ship/Station",    "label": "Ship/Station",                           "type": "text",      "required": true},
      {"number": 8,  "name": "Promotion Status","label": "Promotion Status",                       "type": "enum",      "required": true,  "options": ["Regular","Frocked","Selected","Spot"]},
      {"number": 9,  "name": "Date Reported",   "label": "Date Reported Current Station/Vessel",   "type": "date",      "required": true,  "inputFormat": "YYYY-MM-DD", "displayFormat": "YYMMMDD", "constraint": "onOrBeforeToday"},
      {"number": 10, "name": "Periodic",        "label": "Periodic",                               "type": "checkbox",  "required": false},
      {"number": 11, "name": "Detachment of Individual","label": "Detachment of Individual",       "type": "checkbox",  "required": false},
      {"number": 12, "name": "Promotion/Frocking","label": "Promotion/Frocking",                   "type": "checkbox",  "required": false},
      {"number": 13, "name": "Special",         "label": "Special",                                "type": "checkbox",  "required": false},
      {"number": 14, "name": "Period From",     "label": "Period of Report: From",                 "type": "date",      "required": true,  "inputFormat": "YYYY-MM-DD", "displayFormat": "YYMMMDD"},
      {"number": 15, "name": "Period To",       "label": "Period of Report: To",                   "type": "date",      "required": true,  "inputFormat": "YYYY-MM-DD", "displayFormat": "YYMMMDD"},
      {"number": 16, "name": "Not Observed",    "label": "Not Observed",                           "type": "checkbox",  "required": false},
      {"number": 17, "name": "Regular Report",  "label": "Regular",                                "type": "checkbox",  "required": false},
      {"number": 18, "name": "Concurrent Report","label": "Concurrent",                            "type": "checkbox",  "required": false},
      {"number": 20, "name": "Physical Readiness","label": "Physical Readiness (PFA Results)",     "type": "text",      "required": true,  "note": "PFA cycle results (e.g., 25-1/25-2). CPO PFA scores are incorporated into the Professionalism trait (Block 34)."},
      {"number": 21, "name": "Billet Subcategory","label": "Billet Subcategory",                   "type": "enum",      "required": true,  "options": ["NA","BASIC","APPROVED","INDIV AUG","CO AFLOAT","CO ASHORE","OIC","SEA COMP","CRF","CANVASSER","RESIDENT","INTERN","INSTRUCTOR","STUDENT","RESAC1","RESAC6","SCREENED","SPECIAL01","SPECIAL02","SPECIAL03","SPECIAL04","SPECIAL05","SPECIAL06","SPECIAL07","SPECIAL08","SPECIAL09","SPECIAL10"]},
      {"number": 22, "name": "Reporting Senior Name",       "label": "Reporting Senior (Last, FI [MI])", "type": "text", "required": true},
      {"number": 23, "name": "Reporting Senior Grade",      "label": "RS Grade",                         "type": "text", "required": true},
      {"number": 24, "name": "Reporting Senior Designator", "label": "RS Designator",                    "type": "text", "required": false},
      {"number": 25, "name": "Reporting Senior Title",      "label": "RS Title",                         "type": "text", "required": true,  "maxLength": 14},
      {"number": 26, "name": "Reporting Senior UIC",        "label": "RS UIC",                           "type": "text", "required": true,  "maxLength": 5},
      {"number": 27, "name": "Reporting Senior DoD ID",     "label": "RS DoD ID Number",                 "type": "text", "required": true,  "pattern": "^[0-9]{10}$"},
      {"number": 28, "name": "Command Employment and Achievements","label": "Command Employment and Command Achievements","type": "textarea","required": true},
      {"number": 29, "name": "Primary/Collateral/Watchstanding Duties","label": "Primary/Collateral/Watchstanding Duties","type": "textarea","required": true,
        "sections": [
          {"ref": "29A","name": "Primary Duty Abbreviation","field": "primary_duty_abbrev","type": "text","required": false,"maxLength": 14},
          {"ref": "29B","name": "Duties Narrative","field": "primary_duties","type": "textarea","required": true,"charsPerLine": 91,"maxLines": 3}
        ]},
      {"number": 30, "name": "Date Counseled",   "label": "Date Counseled",                   "type": "text",      "required": true},
      {"number": 31, "name": "Counselor",         "label": "Counselor",                        "type": "text",      "required": true,  "maxLength": 22},
      {"number": 32, "name": "Signature of Individual Counseled","label": "Signature of Individual Counseled","type": "signature","required": false},
      {
        "number": 33,
        "name": "Deckplate Leadership",
        "label": "Deckplate Leadership",
        "type": "trait",
        "required": true,
        "scale": "1.0-5.0 or NOB",
        "note": "Evaluate CPO''s direct impact on Sailor performance, mentorship, and deckplate presence. BUPERSINST 1610.10H Ch. 10."
      },
      {
        "number": 34,
        "name": "Professionalism",
        "label": "Professionalism (incl. PFA)",
        "type": "trait",
        "required": true,
        "scale": "1.0-5.0 or NOB",
        "note": "Evaluate CPO''s military bearing, conduct, uniform standards, and Physical Fitness Assessment performance."
      },
      {
        "number": 35,
        "name": "Mission Accomplishment",
        "label": "Mission Accomplishment and Initiative",
        "type": "trait",
        "required": true,
        "scale": "1.0-5.0 or NOB",
        "note": "Evaluate the CPO''s contribution to departmental and command mission readiness."
      },
      {
        "number": 36,
        "name": "Human Development",
        "label": "Human Development",
        "type": "trait",
        "required": true,
        "scale": "1.0-5.0 or NOB",
        "note": "Evaluate the CPO''s commitment to developing subordinates'' professional and personal growth."
      },
      {
        "number": 37,
        "name": "Equal Opportunity/Command Climate",
        "label": "Equal Opportunity / Command Climate",
        "type": "trait",
        "required": true,
        "scale": "1.0-5.0 or NOB",
        "note": "3.0 or higher required for Promotable recommendation. 2.0 or lower limits recommendation to Progressing or Significant Problems. BUPERSINST 1610.10H Ch. 10."
      },
      {
        "number": 38,
        "name": "Teamwork",
        "label": "Teamwork",
        "type": "trait",
        "required": true,
        "scale": "1.0-5.0 or NOB",
        "note": "Rate CPO''s cooperation within the CPO Mess and across departments."
      },
      {
        "number": 39,
        "name": "Leadership",
        "label": "Leadership",
        "type": "trait",
        "required": true,
        "scale": "1.0-5.0 or NOB",
        "note": "Rate CPO''s ability to lead, motivate, and develop junior Sailors and peers."
      },
      {"number": 40, "name": "Individual Trait Average",    "label": "Individual Trait Average",              "type": "computed",  "required": false},
      {"number": 41, "name": "Career Recommendations",      "label": "Career Recommendations",                "type": "text",      "required": true,  "maxLength": 20, "maxItems": 2, "minItems": 1},
      {"number": 42, "name": "Signature of Rater",          "label": "Signature of Rater",                    "type": "signature", "required": true},
      {"number": 43, "name": "Comments on Performance",     "label": "Comments on Performance",               "type": "textarea",  "required": true,  "note": "18 lines max; 90 CPL at 10-pitch or 84 CPL at 12-pitch Courier. BUPERSINST 1610.10H Ch. 13."},
      {"number": 44, "name": "Qualifications/Achievements", "label": "Qualifications/Achievements",           "type": "textarea",  "required": false},
      {"number": 45, "name": "Promotion Recommendation",    "label": "Promotion Recommendation (Individual)", "type": "enum",      "required": true,  "options": ["Significant Problems","Progressing","Promotable","Must Promote","Early Promote","NOB"]},
      {"number": 46, "name": "Summary Group Tallies",       "label": "Summary Group Tallies",                 "type": "text",      "required": true},
      {"number": 48, "name": "Reporting Senior Address",    "label": "Reporting Senior Address",              "type": "text",      "required": false},
      {"number": 49, "name": "Signature of Senior Rater",  "label": "Signature of Senior Rater",             "type": "signature", "required": false},
      {"number": 50, "name": "Signature of Reporting Senior","label": "Signature of Reporting Senior",        "type": "signature", "required": true},
      {"number": 51, "name": "Signature of Individual Evaluated","label": "Signature of Individual Evaluated","type": "signature", "required": true}
    ]
  }'::jsonb,
  true
)
ON CONFLICT (form_code) DO UPDATE
  SET blocks = EXCLUDED.blocks, active = EXCLUDED.active;

-- ── 3. Update FITREP_W2_O6 with full officer block JSON ──────────────────────
-- NAVPERS 1610/2 (W2–O6) per BUPERSINST 1610.10H Chapter 9.
-- Officers have 8 performance traits and no Retention recommendation block.
UPDATE public.form_definitions
SET blocks = '{
  "title": "Fitness Report and Counseling Record (W2-O6)",
  "revision": "05-2025",
  "source": "BUPERSINST 1610.10H, Chapter 9",
  "blocks": [
    {"number": 1,  "name": "Name",            "label": "Name (Last, First MI Suffix)",         "type": "text",     "required": true},
    {"number": 2,  "name": "Grade",           "label": "Grade",                                "type": "text",     "required": true},
    {"number": 3,  "name": "Designator",      "label": "Designator",                           "type": "text",     "required": false},
    {"number": 4,  "name": "DoD ID",          "label": "DoD ID Number",                        "type": "text",     "required": true, "pattern": "^[0-9]{10}$"},
    {"number": 5,  "name": "Duty Status",     "label": "Duty/Competitive Status",              "type": "enum",     "required": true, "options": ["ACT","TAR","INACT","AT/ADOS"]},
    {"number": 6,  "name": "UIC",             "label": "UIC",                                  "type": "text",     "required": true, "maxLength": 5},
    {"number": 7,  "name": "Ship/Station",    "label": "Ship/Station",                         "type": "text",     "required": true},
    {"number": 8,  "name": "Promotion Status","label": "Promotion Status",                     "type": "enum",     "required": true, "options": ["Regular","Frocked","Selected","Spot"]},
    {"number": 9,  "name": "Date Reported",   "label": "Date Reported Current Station/Vessel", "type": "date",     "required": true, "inputFormat": "YYYY-MM-DD", "displayFormat": "YYMMMDD"},
    {"number": 10, "name": "Periodic",        "label": "Periodic",                             "type": "checkbox", "required": false},
    {"number": 11, "name": "Detachment of Individual","label": "Detachment of Individual",     "type": "checkbox", "required": false},
    {"number": 12, "name": "Promotion/Frocking","label": "Promotion/Frocking",                 "type": "checkbox", "required": false},
    {"number": 13, "name": "Special",         "label": "Special",                              "type": "checkbox", "required": false},
    {"number": 14, "name": "Period From",     "label": "Period of Report: From",               "type": "date",     "required": true},
    {"number": 15, "name": "Period To",       "label": "Period of Report: To",                 "type": "date",     "required": true},
    {"number": 16, "name": "Not Observed",    "label": "Not Observed",                         "type": "checkbox", "required": false},
    {"number": 17, "name": "Regular Report",  "label": "Regular",                              "type": "checkbox", "required": false},
    {"number": 18, "name": "Concurrent Report","label": "Concurrent",                          "type": "checkbox", "required": false},
    {"number": 20, "name": "Physical Readiness","label": "Physical Readiness",                 "type": "text",     "required": true},
    {"number": 21, "name": "Billet Subcategory","label": "Billet Subcategory",                 "type": "enum",     "required": true, "options": ["NA","BASIC","APPROVED","INDIV AUG","CO AFLOAT","CO ASHORE","OIC","SEA COMP","CRF","CANVASSER","RESIDENT","INTERN","INSTRUCTOR","STUDENT","SCREENED"]},
    {"number": 22, "name": "Reporting Senior Name",       "label": "Reporting Senior (Last, FI [MI])", "type": "text", "required": true},
    {"number": 23, "name": "Reporting Senior Grade",      "label": "RS Grade",                         "type": "text", "required": true},
    {"number": 24, "name": "Reporting Senior Designator", "label": "RS Designator",                    "type": "text", "required": false},
    {"number": 25, "name": "Reporting Senior Title",      "label": "RS Title",                         "type": "text", "required": true, "maxLength": 14},
    {"number": 26, "name": "Reporting Senior UIC",        "label": "RS UIC",                           "type": "text", "required": true, "maxLength": 5},
    {"number": 27, "name": "Reporting Senior DoD ID",     "label": "RS DoD ID Number",                 "type": "text", "required": true, "pattern": "^[0-9]{10}$"},
    {"number": 28, "name": "Command Employment and Achievements","label": "Command Employment and Achievements","type": "textarea","required": true},
    {"number": 29, "name": "Primary/Collateral/Watchstanding Duties","label": "Primary/Collateral/Watchstanding Duties","type": "textarea","required": true,
      "sections": [
        {"ref": "29A","field": "primary_duty_abbrev","type": "text","required": false,"maxLength": 14},
        {"ref": "29B","field": "primary_duties","type": "textarea","required": true,"charsPerLine": 91,"maxLines": 3}
      ]},
    {"number": 30, "name": "Date Counseled",  "label": "Date Counseled",   "type": "text",      "required": true},
    {"number": 31, "name": "Counselor",        "label": "Counselor",        "type": "text",      "required": true, "maxLength": 22},
    {"number": 32, "name": "Signature of Individual Counseled","label": "Signature of Individual Counseled","type": "signature","required": false},
    {
      "number": 33,
      "name": "Professional Knowledge",
      "label": "Professional Knowledge",
      "type": "trait",
      "required": true,
      "scale": "1.0-5.0 or NOB",
      "note": "Evaluate the officer''s technical knowledge and professional competence. BUPERSINST 1610.10H Ch. 9."
    },
    {
      "number": 34,
      "name": "Quality of Work",
      "label": "Quality of Work",
      "type": "trait",
      "required": true,
      "scale": "1.0-5.0 or NOB",
      "note": "Rate accuracy, thoroughness, and effectiveness of work product."
    },
    {
      "number": 35,
      "name": "Command or Organizational Climate/Equal Opportunity",
      "label": "Command or Organizational Climate / Equal Opportunity",
      "type": "trait",
      "required": true,
      "scale": "1.0-5.0 or NOB",
      "note": "3.0 or higher required for Promotable, Must Promote, or Early Promote. BUPERSINST 1610.10H Ch. 9."
    },
    {
      "number": 36,
      "name": "Military Bearing / Character",
      "label": "Military Bearing / Character",
      "type": "trait",
      "required": true,
      "scale": "1.0-5.0 or NOB",
      "note": "Evaluate military deportment, personal conduct, and individual readiness."
    },
    {
      "number": 37,
      "name": "Personal Job Accomplishment / Initiative",
      "label": "Personal Job Accomplishment / Initiative",
      "type": "trait",
      "required": true,
      "scale": "1.0-5.0 or NOB",
      "note": "Rate individual initiative and accomplishment of assigned duties."
    },
    {
      "number": 38,
      "name": "Teamwork",
      "label": "Teamwork",
      "type": "trait",
      "required": true,
      "scale": "1.0-5.0 or NOB"
    },
    {
      "number": 39,
      "name": "Leadership",
      "label": "Leadership",
      "type": "trait",
      "required": true,
      "scale": "1.0-5.0 or NOB",
      "note": "Evaluate the officer''s ability to lead, mentor, and develop subordinates."
    },
    {
      "number": 39.1,
      "name": "Tactical Performance",
      "label": "Tactical Performance",
      "type": "trait",
      "required": true,
      "scale": "1.0-5.0 or NOB",
      "note": "Officer-specific trait. Rate demonstrated tactical/operational proficiency. BUPERSINST 1610.10H Ch. 9.",
      "field": "tactical_performance"
    },
    {"number": 40, "name": "Individual Trait Average",    "label": "Individual Trait Average",              "type": "computed",  "required": false},
    {"number": 41, "name": "Career Recommendations",      "label": "Career Recommendations",                "type": "text",      "required": true, "maxLength": 20, "maxItems": 2, "minItems": 1},
    {"number": 42, "name": "Signature of Rater",          "label": "Signature of Rater",                    "type": "signature", "required": true},
    {"number": 43, "name": "Comments on Performance",     "label": "Comments on Performance",               "type": "textarea",  "required": true},
    {"number": 44, "name": "Qualifications/Achievements", "label": "Qualifications/Achievements",           "type": "textarea",  "required": false},
    {"number": 45, "name": "Promotion Recommendation",    "label": "Promotion Recommendation (Individual)", "type": "enum",      "required": true, "options": ["Significant Problems","Progressing","Promotable","Must Promote","Early Promote","NOB"]},
    {"number": 46, "name": "Summary Group Tallies",       "label": "Summary Group Tallies",                 "type": "text",      "required": true},
    {"number": 48, "name": "Reporting Senior Address",    "label": "Reporting Senior Address",              "type": "text",      "required": false},
    {"number": 49, "name": "Signature of Senior Rater",  "label": "Signature of Senior Rater",             "type": "signature", "required": false},
    {"number": 50, "name": "Signature of Reporting Senior","label": "Signature of Reporting Senior",        "type": "signature", "required": true},
    {"number": 51, "name": "Signature of Individual Evaluated","label": "Signature of Individual Evaluated","type": "signature", "required": true}
  ]
}'::jsonb
WHERE form_code = 'FITREP_W2_O6';
