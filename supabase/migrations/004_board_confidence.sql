-- Migration 004: Board Confidence Analyzer
--
-- Adds versioned LaDR reference data, board precept emphasis flags, per-member
-- structured PSR/ESR record entry, persisted analysis runs, and a private
-- storage bucket for optional record attachments.
--
-- 004:1  ladr_documents      — one row per rating + paygrade-range + annual issue (never mutated)
-- 004:2  ladr_milestones     — checklist items per LaDR document
-- 004:3  board_precepts      — board-cycle emphasis flags (at most one active)
-- 004:4  member_board_records— per-user structured PSR/ESR entry (RLS owner-only)
-- 004:5  board_analyses      — immutable analysis run snapshots (RLS owner-only read)
-- 004:6  storage bucket 'board-docs' — private, owner-folder-only
-- 004:7  idx_evaluations_created_by — per-member history query support (see spec §2)

-- 1. LaDR documents (versioned reference data) --------------------------------
create table if not exists public.ladr_documents (
    id uuid default gen_random_uuid() primary key,
    rating_abbrev text not null,                 -- 'IT', 'BM', ...
    rating_name text not null,                   -- 'Information Systems Technician'
    paygrade_range text not null default 'E1-E9'
        check (paygrade_range in ('E1','E4','E5','E6','E7','E8','E9','E1-E9')),
    version text not null,                       -- LaDR cover month+year, e.g. 'July 2026'
    effective_date date not null,                -- first of the cover month
    source_url text not null,                    -- e.g. https://www.cool.osd.mil/usn/LaDR/it_e1_e9.pdf
    source_hash text,                            -- sha256 of the source PDF when known
    created_at timestamptz default now() not null,
    unique (rating_abbrev, paygrade_range, effective_date)
);

alter table public.ladr_documents enable row level security;

drop policy if exists ladr_docs_select_all on public.ladr_documents;
create policy ladr_docs_select_all on public.ladr_documents
    for select to authenticated using (true);
-- writes: service-role seed script only (no insert/update policies).

-- 2. LaDR milestones ----------------------------------------------------------
create table if not exists public.ladr_milestones (
    id uuid default gen_random_uuid() primary key,
    ladr_document_id uuid references public.ladr_documents(id) on delete cascade not null,
    category text not null check (category in (
        'career_milestone','skill_training_required','skill_training_recommended',
        'nec_opportunity','pme_required','pme_recommended','qual_watchstanding',
        'qual_warfare','qual_rate_specific','credential','education_degree',
        'billet_recommended')),
    item text not null,                          -- display name, e.g. 'CompTIA Security+'
    item_code text,                              -- CIN / NAVEDTRA PQS / NEC code / cert id, null if none
    applies_to_paygrades smallint[] not null,    -- paygrades where the LaDR lists it, e.g. '{4}' or '{1,2,3}'
    detail jsonb default '{}'::jsonb not null,   -- {location, course_length, certifying_agency, notes, source}
    sort_order integer not null default 0,
    created_at timestamptz default now() not null
);

create index if not exists idx_ladr_milestones_document
    on public.ladr_milestones (ladr_document_id);

alter table public.ladr_milestones enable row level security;

drop policy if exists ladr_milestones_select_all on public.ladr_milestones;
create policy ladr_milestones_select_all on public.ladr_milestones
    for select to authenticated using (true);

-- 3. Board precepts -----------------------------------------------------------
create table if not exists public.board_precepts (
    id uuid default gen_random_uuid() primary key,
    cycle text not null unique,                  -- 'FY27 Active-Duty E7'
    title text not null,
    emphasis_flags jsonb not null default '{}'::jsonb,
        -- boolean keys, exactly: warfighting, leadership_positions, education,
        -- sea_duty, technical_expertise (spec §7 Factor 6)
    source_url text,
    active boolean not null default false,
    created_at timestamptz default now() not null
);

-- at most one active precept system-wide
create unique index if not exists idx_board_precepts_one_active
    on public.board_precepts (active) where active;

alter table public.board_precepts enable row level security;

drop policy if exists precepts_select_all on public.board_precepts;
create policy precepts_select_all on public.board_precepts
    for select to authenticated using (true);
-- writes: service-role seed script only in v1 (admin UI out of scope).

-- 4. Member board records (structured PSR/ESR entry) --------------------------
create table if not exists public.member_board_records (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.profiles(id) not null unique,
    rating_abbrev text,                          -- selects which LaDR loads, e.g. 'IT'
    target_paygrade smallint check (target_paygrade between 2 and 9),
    psr_entered boolean not null default false,  -- user attests the PSR section is filled in
    awards jsonb not null default '[]'::jsonb,       -- AwardEntry[]      (spec §4.1)
    necs jsonb not null default '[]'::jsonb,         -- NecEntry[]
    quals jsonb not null default '[]'::jsonb,        -- free-form QualEntry[] (non-LaDR extras)
    education jsonb not null default '[]'::jsonb,    -- EducationEntry[]
    pfa_history jsonb not null default '[]'::jsonb,  -- PfaCycle[]
    tours jsonb not null default '[]'::jsonb,        -- TourEntry[]
    adverse jsonb not null default '[]'::jsonb,      -- AdverseEntry[]
    eval_context jsonb not null default '{}'::jsonb, -- {"<period_to>": {"rsca": 4.12, "sea_duty": true}}
    ladr_checklist jsonb not null default '{}'::jsonb,
        -- {"<ladr_milestone_id>": {"status": "met"|"not_met"|"na"|"unanswered",
        --                          "verified_in_ompf": bool}}
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

create or replace function public.touch_member_board_record()
returns trigger as $$
begin
    new.updated_at := now();
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_touch_member_board_record on public.member_board_records;
create trigger trg_touch_member_board_record
    before update on public.member_board_records
    for each row execute function public.touch_member_board_record();

alter table public.member_board_records enable row level security;

drop policy if exists mbr_select_own on public.member_board_records;
create policy mbr_select_own on public.member_board_records
    for select to authenticated using (user_id = auth.uid());

drop policy if exists mbr_insert_own on public.member_board_records;
create policy mbr_insert_own on public.member_board_records
    for insert to authenticated with check (user_id = auth.uid());

drop policy if exists mbr_update_own on public.member_board_records;
create policy mbr_update_own on public.member_board_records
    for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists mbr_delete_own on public.member_board_records;
create policy mbr_delete_own on public.member_board_records
    for delete to authenticated using (user_id = auth.uid());

-- 5. Board analyses (run snapshots) -------------------------------------------
create table if not exists public.board_analyses (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.profiles(id) not null,  -- the analyzed Sailor
    board_date date not null,                              -- T (rubric input e)
    input jsonb not null,          -- full RubricInputs snapshot + disclaimer + warnings + meta
    factor_scores jsonb not null,  -- FactorResult[] (score, confidence, contribution, detail)
    overall_score numeric(4,1) not null
        check (overall_score >= 0 and overall_score <= 100),
    band smallint not null check (band in (0, 25, 50, 75, 100)),
    narrative jsonb not null,      -- {strengths[], gaps[], recommendations[], factor_commentary{}}
    narrative_source text not null check (narrative_source in ('model','fallback')),
    model text,                    -- 'claude-opus-4-8' when narrative_source='model', else null
    created_by uuid references auth.users not null,        -- who ran it (owner or Admin)
    created_at timestamptz default now() not null
);

create index if not exists idx_board_analyses_user
    on public.board_analyses (user_id);

alter table public.board_analyses enable row level security;

drop policy if exists ba_select_own on public.board_analyses;
create policy ba_select_own on public.board_analyses
    for select to authenticated using (user_id = auth.uid());
-- inserts happen only through the service-role API route (no insert policy).

-- 6. Storage bucket for optional ESR/PSR PDF attachments -----------------------
-- First bucket in this project (evaluations.pdf_storage_path is a dead column;
-- nothing else uses Storage). Private; each user may only touch objects under a
-- folder named with their own auth uid: board-docs/<auth.uid()>/<filename>.
--
-- Deploy caution (004:6): `create policy ... on storage.objects` requires
-- ownership of storage.objects. It applies cleanly on the local Supabase CLI
-- stack (superuser), but on current hosted Supabase projects the `postgres`
-- role does not own storage.objects, so `db push` of the 004:6 statements can
-- fail with `must be owner of table objects`. Fallback: create the
-- 'board-docs' bucket and the identical owner-folder policy through the
-- dashboard (Storage -> Policies) and skip the 004:6 statements in the pushed
-- migration -- the policy definition below remains the normative content
-- either way.
insert into storage.buckets (id, name, public)
    values ('board-docs', 'board-docs', false)
    on conflict (id) do nothing;

drop policy if exists board_docs_owner_rw on storage.objects;
create policy board_docs_owner_rw on storage.objects
    for all to authenticated
    using (
        bucket_id = 'board-docs'
        and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
        bucket_id = 'board-docs'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- 7. Per-member eval history index --------------------------------------------
create index if not exists idx_evaluations_created_by
    on public.evaluations (created_by);
