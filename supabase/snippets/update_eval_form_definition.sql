-- Standalone snippet: update the EVAL (NAVPERS 1616/26) form_definitions.blocks JSON.
-- Safe to run in the Supabase SQL editor against an existing DB (idempotent upsert by form_code).
-- Extracted from migrations/001_initial_schema.sql on 2026-06-10.

insert into public.form_definitions (id, form_code, navpers_number, paygrade_range, blocks, active)
values (
    'e1616260-cafe-4b08-9df2-5d8f28d8b4cd',
    'EVAL',
    '1616/26',
    'E1-E6',
    '{
        "title": "Evaluation Report and Counseling Record (E1-E6)",
        "revision": "05-2025",
        "source": "BUPERSINST 1610.10H",
        "blocks": [
            {
                "number": 1,
                "name": "Name",
                "label": "Name (Last, First MI Suffix)",
                "type": "text",
                "required": true,
                "note": "Enter last name, first name, middle initial, and suffix (e.g., DAIN, FRANKLYN A JR)"
            },
            {
                "number": 2,
                "name": "Grade/Rate",
                "label": "Grade/Rate",
                "type": "text",
                "required": true,
                "note": "Enter current paygrade (e.g., SN, PO3, PO2, PO1)"
            },
            {
                "number": 3,
                "name": "Designator",
                "label": "Designator",
                "type": "text",
                "required": false,
                "note": "NEC or designator code; optional for most enlisted"
            },
            {
                "number": 4,
                "name": "DoD ID",
                "label": "DoD ID Number",
                "type": "text",
                "required": true,
                "pattern": "^[0-9]{10}$",
                "note": "10-digit DoD Identification Number"
            },
            {
                "number": 5,
                "name": "Duty Status",
                "label": "Duty/Competitive Status",
                "type": "enum",
                "required": true,
                "options": ["ACT", "TAR", "INACT", "AT/ADOS"],
                "note": "Active duty, Training and Administration of Reserves, Inactive duty, or Active Duty for Operational Support"
            },
            {
                "number": 6,
                "name": "UIC",
                "label": "UIC",
                "type": "text",
                "required": true,
                "maxLength": 5,
                "note": "5-character Unit Identification Code of the member''s command"
            },
            {
                "number": 7,
                "name": "Ship/Station",
                "label": "Ship/Station",
                "type": "text",
                "required": true,
                "note": "Name of the ship or shore station"
            },
            {
                "number": 8,
                "name": "Promotion Status",
                "label": "Promotion Status",
                "type": "enum",
                "required": true,
                "options": ["Regular", "Frocked", "Selected", "Spot"],
                "note": "Status at time of report"
            },
            {
                "number": 9,
                "name": "Date Reported",
                "label": "Date Reported Current Station/Vessel",
                "type": "date",
                "required": true,
                "inputFormat": "YYYY-MM-DD",
                "displayFormat": "YYMMMDD",
                "constraint": "onOrBeforeToday",
                "note": "Date member reported to current duty station. Must be a valid calendar date, today or earlier. Entered and stored as YYYY-MM-DD (same as Period From/To, blocks 14/15); printed on the rendered form in Navy YYMMMDD format (e.g., 24JAN15)."
            },
            {
                "number": 10,
                "name": "Periodic",
                "label": "Periodic",
                "type": "checkbox",
                "required": false,
                "note": "Check if this is a periodic (annual) report"
            },
            {
                "number": 11,
                "name": "Detachment of Individual",
                "label": "Detachment of Individual",
                "type": "checkbox",
                "required": false,
                "note": "Check if member is detaching from command"
            },
            {
                "number": 12,
                "name": "Promotion/Frocking",
                "label": "Promotion/Frocking",
                "type": "checkbox",
                "required": false,
                "note": "Check if this report is occasioned by the member''s promotion or frocking"
            },
            {
                "number": 13,
                "name": "Special",
                "label": "Special",
                "type": "checkbox",
                "required": false,
                "note": "Check for special reports (e.g., administrative)"
            },
            {
                "number": 14,
                "name": "Period From",
                "label": "Period of Report: From",
                "type": "date",
                "required": true,
                "inputFormat": "YYYY-MM-DD",
                "displayFormat": "YYMMMDD",
                "note": "Start date of the evaluation report period. Stored as YYYY-MM-DD; printed in Navy YYMMMDD format."
            },
            {
                "number": 15,
                "name": "Period To",
                "label": "Period of Report: To",
                "type": "date",
                "required": true,
                "inputFormat": "YYYY-MM-DD",
                "displayFormat": "YYMMMDD",
                "note": "End date of the evaluation report period. Stored as YYYY-MM-DD; printed in Navy YYMMMDD format. Must not precede Period From."
            },
            {
                "number": 16,
                "name": "Not Observed",
                "label": "Not Observed",
                "type": "checkbox",
                "required": false,
                "note": "Check if reporting senior had insufficient opportunity to observe. NOB report."
            },
            {
                "number": 17,
                "name": "Regular Report",
                "label": "Regular",
                "type": "checkbox",
                "required": false,
                "note": "Check if this is a Regular report (most common type)"
            },
            {
                "number": 18,
                "name": "Concurrent Report",
                "label": "Concurrent",
                "type": "checkbox",
                "required": false,
                "note": "Check if this is a Concurrent report. NOTE: the NAVPERS 1616/26 has no block 19; numbering goes 18 (Concurrent) -> 20 (Physical Readiness)."
            },
            {
                "number": 20,
                "name": "Physical Readiness",
                "label": "Physical Readiness",
                "type": "text",
                "required": true,
                "note": "Enter PFA cycle results (e.g., 25-1/25-2 or EXEMPT)"
            },
            {
                "number": 21,
                "name": "Billet Subcategory",
                "label": "Billet Subcategory",
                "type": "enum",
                "required": true,
                "options": [
                    "NA", "BASIC", "APPROVED", "INDIV AUG", "CO AFLOAT", "CO ASHORE", "OIC", "SEA COMP",
                    "CRF", "CANVASSER", "RESIDENT", "INTERN", "INSTRUCTOR", "STUDENT", "RESAC1", "RESAC6", "SCREENED",
                    "SPECIAL01", "SPECIAL02", "SPECIAL03", "SPECIAL04", "SPECIAL05", "SPECIAL06", "SPECIAL07",
                    "SPECIAL08", "SPECIAL09", "SPECIAL10", "SPECIAL11", "SPECIAL12", "SPECIAL13", "SPECIAL14",
                    "SPECIAL15", "SPECIAL16", "SPECIAL17", "SPECIAL18", "SPECIAL19", "SPECIAL20"
                ],
                "starredOptions": ["CRF", "CANVASSER", "RESIDENT", "INTERN", "STUDENT"],
                "note": "Required -- select NA if not used. Must be a valid code from BUPERSINST 1610.10H table 1-1. Starred codes (CRF, CANVASSER, RESIDENT, INTERN, STUDENT) should match an entry in Block 29. SPECIAL01-SPECIAL20 require PERS-32 approval."
            },
            {
                "number": 22,
                "name": "Reporting Senior Name",
                "label": "Reporting Senior (Last, First MI)",
                "type": "text",
                "required": true,
                "note": "Type last name, first name, and middle initial of reporting senior"
            },
            {
                "number": 23,
                "name": "Reporting Senior Grade",
                "label": "RS Grade",
                "type": "text",
                "required": true,
                "note": "Grade or rate of the reporting senior"
            },
            {
                "number": 24,
                "name": "Reporting Senior Designator",
                "label": "RS Designator",
                "type": "text",
                "required": false,
                "note": "Designator or NEC of the reporting senior"
            },
            {
                "number": 25,
                "name": "Reporting Senior Title",
                "label": "RS Title",
                "type": "text",
                "required": true,
                "note": "Official title of reporting senior (e.g., COMMANDING OFFICER)"
            },
            {
                "number": 26,
                "name": "Reporting Senior UIC",
                "label": "RS UIC",
                "type": "text",
                "required": true,
                "maxLength": 5,
                "note": "UIC of the reporting senior''s command (delegated reporting seniors use CO''s UIC)"
            },
            {
                "number": 27,
                "name": "Reporting Senior DoD ID",
                "label": "RS DoD ID Number",
                "type": "text",
                "required": true,
                "pattern": "^[0-9]{10}$",
                "note": "10-digit DoD Identification Number of the reporting senior (in lieu of SSN, per APEX PII policy; parallels member Block 4). The reporting senior''s signature date is captured with the Block 50 signature, not here."
            },
            {
                "number": 28,
                "name": "Command Employment and Achievements",
                "label": "Command Employment and Command Achievements",
                "type": "textarea",
                "required": true,
                "note": "Describe command employment and significant achievements during the report period"
            },
            {
                "number": 29,
                "name": "Primary/Collateral/Watchstanding Duties",
                "label": "Primary/Collateral/Watchstanding Duties",
                "type": "textarea",
                "required": true,
                "charsPerLine": 91,
                "maxLines": 3,
                "sections": [
                    {
                        "ref": "29A",
                        "name": "Primary Duty Abbreviation",
                        "field": "primary_duty_abbrev",
                        "type": "text",
                        "required": false,
                        "maxLength": 14,
                        "pattern": "^[A-Za-z0-9 /-]{0,14}$",
                        "note": "Most-significant primary duty abbreviation. Letters, numbers, and spaces only (slash/hyphen allowed), 14 characters max. Shares Block 29''s first printed line, so the 29B narrative''s first line holds ~20 fewer characters."
                    },
                    {
                        "ref": "29B",
                        "name": "Duties Narrative",
                        "field": "primary_duties",
                        "type": "textarea",
                        "required": true,
                        "charsPerLine": 91,
                        "maxLines": 3,
                        "firstLineLead": 20,
                        "note": "List primary duty, collateral duties, and watchstanding duties with months served. Include job scope statement for shore commands."
                    }
                ],
                "note": "Block 29 splits into the 29A abbreviation box and the 29B narrative, which share the first printed line of the block."
            },
            {
                "number": 30,
                "name": "Date Counseled",
                "label": "Date Counseled",
                "type": "text",
                "required": true,
                "note": "Enter mid-term counseling date in YYMMMDD format, or NOT REQ if date fell outside period, or NOT PERF if counseling was not conducted"
            },
            {
                "number": 31,
                "name": "Counselor",
                "label": "Counselor",
                "type": "text",
                "required": true,
                "note": "Type name of counselor from counseling worksheet. If NOT PERF in block 30, enter brief explanation here."
            },
            {
                "number": 32,
                "name": "Signature of Individual Counseled",
                "label": "Signature of Individual Counseled",
                "type": "signature",
                "required": false,
                "note": "Per BUPERSINST 1610.10H: leave blank. Reporting senior and member signatures in blocks 45/46/49/50 serve as verification."
            },
            {
                "number": 33,
                "name": "Professional Knowledge",
                "label": "Professional Knowledge",
                "type": "trait",
                "required": true,
                "scale": "1.0-5.0 or NOB",
                "note": "Rate the member''s professional knowledge and technical competence"
            },
            {
                "number": 34,
                "name": "Quality of Work",
                "label": "Quality of Work",
                "type": "trait",
                "required": true,
                "scale": "1.0-5.0 or NOB",
                "note": "Rate the quality, accuracy, and thoroughness of work output"
            },
            {
                "number": 35,
                "name": "Command or Organizational Climate/Equal Opportunity",
                "label": "Command or Organizational Climate/Equal Opportunity",
                "type": "trait",
                "required": true,
                "scale": "1.0-5.0 or NOB",
                "note": "3.0 or higher required for Promotable recommendation. Evaluate contribution to command climate, EO, and CNO retention/attrition goals."
            },
            {
                "number": 36,
                "name": "Military Bearing and Character",
                "label": "Military Bearing/Character",
                "type": "trait",
                "required": true,
                "scale": "1.0-5.0 or NOB",
                "note": "Do not grade 5.0 unless all standards are met. Includes IMR, deployability, and personal conduct."
            },
            {
                "number": 37,
                "name": "Personal Job Accomplishment/Initiative",
                "label": "Personal Job Accomplishment/Initiative",
                "type": "trait",
                "required": true,
                "scale": "1.0-5.0 or NOB",
                "note": "Rate individual initiative, drive, and accomplishment of assigned duties"
            },
            {
                "number": 38,
                "name": "Teamwork",
                "label": "Teamwork",
                "type": "trait",
                "required": true,
                "scale": "1.0-5.0 or NOB",
                "note": "Rate cooperation, communication, and contribution to team goals"
            },
            {
                "number": 39,
                "name": "Leadership",
                "label": "Leadership",
                "type": "trait",
                "required": true,
                "scale": "1.0-5.0 or NOB",
                "note": "Rate ability to lead, motivate, and develop subordinates"
            },
            {
                "number": 40,
                "name": "Individual Trait Average",
                "label": "Individual Trait Average",
                "type": "computed",
                "required": false,
                "note": "Computed average of trait grades in blocks 33-39. Calculated by the system; not manually entered."
            },
            {
                "number": 41,
                "name": "Career Recommendations",
                "label": "Career Recommendations",
                "type": "text",
                "required": true,
                "maxLength": 20,
                "maxItems": 2,
                "minItems": 1,
                "note": "Enter one or two career recommendations (max 20 characters and spaces each). The second is optional, but at least one is required — do not leave blank; enter NA or NONE if none applies. Based on performance; not binding on detailers."
            },
            {
                "number": 42,
                "name": "Signature of Rater",
                "label": "Signature of Rater",
                "type": "signature",
                "required": true,
                "note": "Type last name, initials, and grade/rate of rater. Obtain wet signature."
            },
            {
                "number": 43,
                "name": "Comments on Performance",
                "label": "Comments on Performance",
                "type": "textarea",
                "required": true,
                "note": "Narrative justifying trait grades and promotion recommendation. See BUPERSINST Ch. 13 for style, prohibited comments, and mandatory GRGB mention."
            },
            {
                "number": 44,
                "name": "Qualifications/Achievements",
                "label": "Qualifications/Achievements",
                "type": "textarea",
                "required": false,
                "note": "List courses, degrees, awards, qualifications, and community involvement completed during report period. Do not repeat from prior reports."
            },
            {
                "number": 45,
                "name": "Promotion Recommendation",
                "label": "Promotion Recommendation (Individual)",
                "type": "enum",
                "required": true,
                "options": [
                    "Significant Problems",
                    "Progressing",
                    "Promotable",
                    "Must Promote",
                    "Early Promote",
                    "NOB"
                ],
                "note": "Promotable requires EO >= 3.0 and no trait at 1.0. Must Promote/Early Promote require no trait at 2.0. NOB only for short periods with <= 3 traits graded."
            },
            {
                "number": 46,
                "name": "Summary Group Tallies",
                "label": "Summary (How Many in Reporting Senior Group Received Each Recommendation)",
                "type": "text",
                "required": true,
                "note": "Enter count of members in summary group receiving each promotion recommendation. Subject to Early Promote/Must Promote limits per BUPERSINST tables."
            },
            {
                "number": 47,
                "name": "Retention",
                "label": "Retention Recommendation",
                "type": "enum",
                "required": true,
                "options": ["Recommended", "Not Recommended"],
                "note": "For E-6 and below only. If report contains adverse matter, briefly explain retention recommendation in block 43."
            },
            {
                "number": 48,
                "name": "Reporting Senior Address",
                "label": "Reporting Senior Address",
                "type": "text",
                "required": false,
                "note": "Mailing address of the reporting senior''s command. This block is the RS address, NOT a signature."
            },
            {
                "number": 49,
                "name": "Signature of Senior Rater",
                "label": "Signature of Senior Rater",
                "type": "signature",
                "required": false,
                "note": "Senior Rater signs here. Required for E-6 and below per BUPERSINST 1610.10H; may be omitted if the reporting senior is the rater''s immediate supervisor."
            },
            {
                "number": 50,
                "name": "Signature of Reporting Senior",
                "label": "Signature of Reporting Senior",
                "type": "signature",
                "required": true,
                "note": "Required wet signature. Verifies accuracy of blocks 30 and 31."
            },
            {
                "number": 51,
                "name": "Signature of Individual Evaluated",
                "label": "Signature of Individual Evaluated",
                "type": "signature",
                "required": true,
                "note": "The evaluated member signs here (\"I have seen this report, been apprised of my performance...\"). For non-adverse reports where the member is unavailable, enter ''Certified Copy Provided''."
            },
            {
                "number": 52,
                "name": "Regular Reporting Senior on Concurrent Report",
                "label": "Regular RS Signature (Concurrent Only)",
                "type": "signature",
                "required": false,
                "note": "Required only for Concurrent reports. Regular reporting senior countersigns here."
            }
        ]
    }'::jsonb,
    true
)
on conflict (form_code) do update
set blocks = excluded.blocks, active = excluded.active;
