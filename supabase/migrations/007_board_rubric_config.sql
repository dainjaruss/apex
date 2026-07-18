-- 007_board_rubric_config.sql
--
-- v1.5: operator-tunable Board Confidence rubric parameters, so the model can
-- be adjusted to reflect board emphasis without a code change.
--   007:1  board_rubric_config — single active row read at analysis time; the
--          active config is snapshotted into every board_analyses.input.meta
--          for reproducibility, so tuning never rewrites past runs.
--   007:2  Seed row: spec §7 defaults. Continuity is GRADED (never a hard
--          zero); a missing reporting period > continuity_gap_days (90) raises
--          a disqualification advisory. board_emphasis_multiplier 2 (LaDR
--          "Considerations for advancement" E7+ items count double in
--          Professional Development).
--
-- Writes are service-role only (profiles roles are self-asserted, so no
-- client-side admin write path exists — tune via the Supabase dashboard/SQL,
-- documented in docs/BOARD-CONFIDENCE.md).

create table if not exists public.board_rubric_config (
    id uuid default gen_random_uuid() primary key,
    label text not null default 'default',
    weights jsonb not null default '{"performance":40,"leadership":15,"development":15,"continuity":10,"completeness":10,"precept":10}'::jsonb,
    continuity_gap_days smallint not null default 90 check (continuity_gap_days between 1 and 365),
    board_emphasis_multiplier numeric(3,1) not null default 2.0 check (board_emphasis_multiplier between 1 and 5),
    active boolean not null default false,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

-- exactly one active config
create unique index if not exists uq_board_rubric_config_active
    on public.board_rubric_config (active) where active;

alter table public.board_rubric_config enable row level security;

-- readable by any signed-in user (the tuning is displayed for transparency);
-- no insert/update/delete policies — writes are service-role only.
drop policy if exists brc_select_authenticated on public.board_rubric_config;
create policy brc_select_authenticated on public.board_rubric_config
    for select to authenticated using (true);

insert into public.board_rubric_config (label, active)
select 'default', true
where not exists (select 1 from public.board_rubric_config where active);

-- 007:3  Reconcile databases whose board tables were created from an EARLIER
-- 004 (the tables use `create table if not exists`, so later column/constraint
-- additions never reach an existing table — editing 004 only helps fresh
-- installs). Each statement below is idempotent.
--
-- (a) Re-issue the ladr_milestones category check with the v1.5 category.
alter table public.ladr_milestones
    drop constraint if exists ladr_milestones_category_check;
alter table public.ladr_milestones
    add constraint ladr_milestones_category_check check (category in (
        'career_milestone','skill_training_required','skill_training_recommended',
        'nec_opportunity','pme_required','pme_recommended','qual_watchstanding',
        'qual_warfare','qual_rate_specific','credential','education_degree',
        'billet_recommended','advancement_consideration'));

-- (b) The v1.1/v1.2 informed-consent column. A DB created from the original
-- 004 lacks it, and the analyze route + consent modal both require it — without
-- this column PostgREST raises "Could not find the 'consented_at' column".
alter table public.member_board_records
    add column if not exists consented_at timestamptz;

-- Nudge PostgREST to reload its schema cache after the DDL above.
notify pgrst, 'reload schema';
