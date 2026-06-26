-- supabase/migrations/001_initial_schema.sql
-- APEX Navy EVAL Initial Schema
-- Designed by Dain Franklyn (CIS5898)
--
-- Schema revision notes:
--   Added public.commands table (UIC <-> Command Name cross-reference).
--   Seed data for commands will be provided separately once UIC roster is finalized.
--
-- Notes: Using standard Postgres extensions. Added an automatic trigger to sync 
-- Supabase auth.users with our public.profiles table so we don't have to manage profile creation 
-- manually in client-side code (which can fail if the user closes the browser too fast).

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Commands Cross-Reference Table (UIC <-> Command Name lookup)
-- This table is the single source of truth for command names.
-- Sailors pick their UIC on registration and the command name is resolved from here.
-- Seed data is added separately once the official UIC roster is finalized.
create table public.commands (
    uic text primary key check (length(uic) = 5),  -- 5-char Navy UIC (e.g. '12345')
    command_name text not null,                     -- Official command name (e.g. 'USS NEVERSAIL')
    command_type text,                              -- Optional: 'SHIP', 'SHORE', 'RESERVE', etc.
    region text,                                    -- Optional: geographic region or fleet
    active boolean default true not null,           -- Soft-delete: hide decommissioned commands
    created_at timestamptz default now() not null
);

-- Enable RLS on commands
alter table public.commands enable row level security;

-- All authenticated users can read the commands list (needed for registration dropdown)
create policy "Allow authenticated read of commands"
    on public.commands for select
    to authenticated
    using (active = true);

-- Only service-role / admin can manage commands (no self-service mutations)
create policy "Allow admin insert of commands"
    on public.commands for insert
    to service_role
    with check (true);

create policy "Allow admin update of commands"
    on public.commands for update
    to service_role
    using (true);

-- 2. Profiles Table (extends auth.users)
create table public.profiles (
    id uuid references auth.users on delete cascade primary key,
    first_name text not null,
    last_name text not null,
    middle_initial text,
    dod_id text unique check (length(dod_id) = 10),
    email text,
    navy_rank text,
    uic text, -- Temporarily removed FK to commands lookup for MVP. The  command to UIC cross-eference table is maintined by the Navy and did not add any meaningul value for the MVP.
    command text,   -- Denormalized display name; kept for quick reads without a join
    preferred_role text not null check (preferred_role in ('Sailor', 'Rater', 'Senior Rater', 'Reporting Senior', 'Admin')),
    assigned_roles text[] default '{"Sailor"}',
    created_at timestamptz default now() not null
);


-- Enable RLS on profiles
alter table public.profiles enable row level security;

-- 2. Form Definitions Table (declarative spec for NAVPERS forms)
create table public.form_definitions (
    id uuid default gen_random_uuid() primary key,
    -- FITREP has two distinct NAVPERS forms by paygrade, so we use specific codes:
    --   FITREP_W2_O6  ->  NAVPERS 1610/2  (W2-O6, rev. 05-2025)
    --   FITREP_O7_O8  ->  NAVPERS 1610/5  (O7-O8, rev. 06-2023)
    form_code text not null unique check (form_code in ('EVAL', 'CHIEFEVAL', 'FITREP_W2_O6', 'FITREP_O7_O8')),
    navpers_number text not null,
    paygrade_range text not null,
    blocks jsonb not null, -- declarative schema/constraints
    active boolean default true not null,
    created_at timestamptz default now() not null
);

-- Enable RLS on form definitions
alter table public.form_definitions enable row level security;

-- 3. Evaluations Table (holds individual reports)
create table public.evaluations (
    id uuid default gen_random_uuid() primary key,
    created_by uuid references auth.users not null,
    form_definition_id uuid references public.form_definitions not null,
    report_type text not null default 'EVAL' check (report_type = 'EVAL'), -- MVP restricts to EVAL
    member_name text not null,
    dod_id text, -- Synthetic only (NO PII)
    grade_rate text,
    designator text,
    period_from date not null,
    period_to date not null,
    duty_status text,
    uic text check (length(uic) = 5 or uic = '00000'), -- UIC validation (must be 5 chars)
    ship_station text,
    promotion_status text,
    trait_grades jsonb not null default '{}'::jsonb, -- trait key -> grade (1.0-5.0 or 'NOB')
    trait_average numeric(3,2), -- Computed dynamically in code/trigger
    comments text, -- Narrative (Block 43)
    career_recommendations text[] default '{}'::text[],
    promotion_recommendation text check (promotion_recommendation in ('Significant Problems', 'Progressing', 'Promotable', 'Must Promote', 'Early Promote', 'NOB')),
    retention text check (retention in ('Recommended', 'Not Recommended')),
    status text not null default 'draft' check (status in ('draft', 'ready_for_review', 'completed', 'archived')),
    reviewer_id uuid references public.profiles(id),
    pdf_storage_path text,
    block_values jsonb not null default '{}'::jsonb, -- catch-all for extra blocks
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

-- Enable RLS on evaluations
alter table public.evaluations enable row level security;

-- 4. Audit Logs Table
create table public.audit_logs (
    id uuid default gen_random_uuid() primary key,
    evaluation_id uuid references public.evaluations on delete cascade,
    user_id uuid references auth.users,
    action text not null,
    details jsonb default '{}'::jsonb not null,
    timestamp timestamptz default now() not null
);

-- Enable RLS on audit logs
alter table public.audit_logs enable row level security;

-- 5. Review Approvals Table
create table public.review_approvals (
    id uuid default gen_random_uuid() primary key,
    evaluation_id uuid references public.evaluations on delete cascade not null,
    reviewer_id uuid references public.profiles(id) not null,
    approval_status text not null check (approval_status in ('pending', 'approved', 'returned')),
    reviewer_comments text,
    created_at timestamptz default now() not null
);

-- Enable RLS on review approvals
alter table public.review_approvals enable row level security;


-- ==================== RLS POLICIES ====================

-- Profiles Policies
create policy "Allow public read of profiles"
    on public.profiles for select
    to authenticated
    using (true);

create policy "Allow users to update own profile"
    on public.profiles for update
    to authenticated
    using (auth.uid() = id);

-- Form Definitions Policies (Read for all authenticated, write for admin)
create policy "Allow authenticated read of form definitions"
    on public.form_definitions for select
    to authenticated
    using (active = true);

-- Evaluations Policies
create policy "Allow creators to read own evaluations"
    on public.evaluations for select
    to authenticated
    using (auth.uid() = created_by or auth.uid() = reviewer_id);

create policy "Allow creators to insert evaluations"
    on public.evaluations for insert
    to authenticated
    with check (auth.uid() = created_by);

create policy "Allow creators and reviewers to update evaluations"
    on public.evaluations for update
    to authenticated
    using (auth.uid() = created_by or auth.uid() = reviewer_id);

-- Audit Logs Policies (Admins or owners)
create policy "Allow access to audit logs"
    on public.audit_logs for select
    to authenticated
    using (true); -- Keep simple for prototype, can restrict by evaluation owner later

create policy "Allow insert of audit logs"
    on public.audit_logs for insert
    to authenticated
    with check (true);

-- Review Approvals Policies
create policy "Allow access to review approvals"
    on public.review_approvals for select
    to authenticated
    using (true);

create policy "Allow reviewers to insert/update approvals"
    on public.review_approvals for insert
    to authenticated
    with check (auth.uid() = reviewer_id);

create policy "Allow reviewers to update approvals"
    on public.review_approvals for update
    to authenticated
    using (auth.uid() = reviewer_id);


-- ==================== TRIGGERS & FUNCTIONS ====================

-- Function to handle profile creation on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (id, first_name, last_name, middle_initial, dod_id, email, navy_rank, uic, command, preferred_role, assigned_roles)
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'first_name', 'New'),
        coalesce(new.raw_user_meta_data->>'last_name', 'Sailor'),
        new.raw_user_meta_data->>'middle_initial',
        new.raw_user_meta_data->>'dod_id',
        new.email,
        coalesce(new.raw_user_meta_data->>'navy_rank', 'SR'),
        new.raw_user_meta_data->>'uic',              -- null ok if commands table not yet seeded
        new.raw_user_meta_data->>'command',          -- denormalized name fallback
        coalesce(new.raw_user_meta_data->>'preferred_role', 'Sailor'),
        -- Convert to a unique text array so if they chose 'Sailor', it doesn't double up
        ARRAY(SELECT DISTINCT UNNEST(ARRAY['Sailor', coalesce(new.raw_user_meta_data->>'preferred_role', 'Sailor')]))::text[]
    );
    return new;
end;
$$ language plpgsql security definer;

-- Trigger to sync auth.users with public.profiles
create or replace trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();


-- ==================== SEED DATA ====================

-- -- Seed NAVPERS 1616/26: Evaluation Report and Counseling Record (E1-E6) (Rev. 05-2025)
-- Block definitions sourced from BUPERSINST 1610.10H and the actual NAVPERS 1616/26 form.
-- This is the MVP form. All 52 blocks are defined below.
--
-- Block type key:
--   text        plain text input
--   date        YYMMMDD formatted date (e.g. 25JAN15)
--   enum        one of a fixed set of values (radio/select)
--   trait       numeric 1.0-5.0 or literal 'NOB'
--   textarea    multi-line narrative
--   computed    calculated by the system (read-only)
--   checkbox    boolean flag
--   signature   name typed + wet signature field (stored as text)
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

-- Seed NAVPERS 1610/2: Fitness Report & Counseling Record (W2-O6) (Rev. 05-2025)
-- Block layout is a skeleton placeholder -- full block definitions will be added
-- once the official form structure is transcribed from the NAVPERS form.
insert into public.form_definitions (id, form_code, navpers_number, paygrade_range, blocks, active)
values (
    'f1610020-cafe-4b08-9df2-5d8f28d8b4cd',
    'FITREP_W2_O6',
    '1610/2',
    'W2-O6',
    '{
        "title": "Fitness Report and Counseling Record (W2-O6)",
        "revision": "05-2025",
        "note": "Block definitions pending -- seed data will be added once form structure is confirmed.",
        "blocks": [
            {"number": 1, "name": "Name", "type": "text", "required": true},
            {"number": 2, "name": "Grade", "type": "text", "required": true},
            {"number": 3, "name": "Designator", "type": "text", "required": false},
            {"number": 4, "name": "DoD ID", "type": "text", "required": true, "pattern": "^[0-9]{10}$"},
            {"number": 5, "name": "Duty Status", "type": "text", "required": true},
            {"number": 6, "name": "UIC", "type": "text", "required": true, "length": 5},
            {"number": 7, "name": "Ship/Station", "type": "text", "required": true},
            {"number": 43, "name": "Comments on Performance", "type": "textarea", "required": true}
        ]
    }'::jsonb,
    true
)
on conflict (form_code) do update
set blocks = excluded.blocks, active = excluded.active;

-- Seed NAVPERS 1610/5: Fitness Report & Counseling Record (O7-O8) (Rev. 06-2023)
insert into public.form_definitions (id, form_code, navpers_number, paygrade_range, blocks, active)
values (
    'f1610050-cafe-4b08-9df2-5d8f28d8b4cd',
    'FITREP_O7_O8',
    '1610/5',
    'O7-O8',
    '{
        "title": "Fitness Report and Counseling Record (O7-O8)",
        "revision": "06-2023",
        "note": "Block definitions pending -- seed data will be added once form structure is confirmed.",
        "blocks": [
            {"number": 1, "name": "Name", "type": "text", "required": true},
            {"number": 2, "name": "Grade", "type": "text", "required": true},
            {"number": 3, "name": "Designator", "type": "text", "required": false},
            {"number": 4, "name": "DoD ID", "type": "text", "required": true, "pattern": "^[0-9]{10}$"},
            {"number": 5, "name": "Duty Status", "type": "text", "required": true},
            {"number": 6, "name": "UIC", "type": "text", "required": true, "length": 5},
            {"number": 7, "name": "Ship/Station", "type": "text", "required": true},
            {"number": 43, "name": "Comments on Performance", "type": "textarea", "required": true}
        ]
    }'::jsonb,
    true
)
on conflict (form_code) do update
set blocks = excluded.blocks, active = excluded.active;
