-- 007_board_rubric_config.sql
--
-- v1.5: operator-tunable Board Confidence rubric parameters, so the model can
-- be adjusted to reflect board emphasis without a code change.
--   007:1  board_rubric_config — single active row read at analysis time; the
--          active config is snapshotted into every board_analyses.input.meta
--          for reproducibility, so tuning never rewrites past runs.
--   007:2  Seed row: spec §7 defaults with the continuity HARD GATE ON (any
--          gap > 90 days in the 60-month window ⇒ NOT SELECTION READY,
--          confidence 0) and board-emphasis multiplier 2 (LaDR "Considerations
--          for advancement" E7+ items count double in Professional Development).
--
-- Writes are service-role only (profiles roles are self-asserted, so no
-- client-side admin write path exists — tune via the Supabase dashboard/SQL,
-- documented in docs/BOARD-CONFIDENCE.md).

create table if not exists public.board_rubric_config (
    id uuid default gen_random_uuid() primary key,
    label text not null default 'default',
    weights jsonb not null default '{"performance":40,"leadership":15,"development":15,"continuity":10,"completeness":10,"precept":10}'::jsonb,
    continuity_hard_gate boolean not null default true,
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

-- 007:3  Existing databases created before v1.5 carry 004's original category
-- check on ladr_milestones (created inside `create table if not exists`, so
-- editing 004 only helps fresh installs). Re-issue it with
-- 'advancement_consideration' included.
alter table public.ladr_milestones
    drop constraint if exists ladr_milestones_category_check;
alter table public.ladr_milestones
    add constraint ladr_milestones_category_check check (category in (
        'career_milestone','skill_training_required','skill_training_recommended',
        'nec_opportunity','pme_required','pme_recommended','qual_watchstanding',
        'qual_warfare','qual_rate_specific','credential','education_degree',
        'billet_recommended','advancement_consideration'));
