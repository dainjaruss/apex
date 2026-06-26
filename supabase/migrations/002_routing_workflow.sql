-- Migration 002: Summary Groups + Custodian Routing Workflow
--
-- Adds promotion-recommendation summary groups, multi-hop custodian routing
-- (sailor -> rater -> senior rater -> reporting senior -> admin), participant-scoped
-- debrief corrections, and a reporting-senior signature lock. Custody transitions are
-- enforced by server-side service-role routes; RLS governs visibility + the sailor's
-- own draft edits + the hard signature lock.

-- 1. Summary Groups -----------------------------------------------------------
create table if not exists public.summary_groups (
    id uuid default gen_random_uuid() primary key,
    name text not null,
    reporting_senior_id uuid references public.profiles(id) not null,
    period_to date not null,            -- shared ending date
    grade_rate text not null,           -- shared paygrade
    promotion_status text not null,     -- shared promotion status
    command_employment text not null,   -- shared command employment (block 28)
    report_type text not null default 'EVAL' check (report_type = 'EVAL'),
    status text not null default 'open' check (status in ('open','closed')),
    created_by uuid references public.profiles(id) not null,
    created_at timestamptz default now() not null,
    -- one logical group per RS + ending date + paygrade + promotion status + report type
    unique (reporting_senior_id, period_to, grade_rate, promotion_status, report_type)
);

alter table public.summary_groups enable row level security;

-- 2. Evaluation custody columns ----------------------------------------------
alter table public.evaluations
    add column if not exists summary_group_id   uuid references public.summary_groups(id),
    add column if not exists current_holder_id  uuid references public.profiles(id),
    add column if not exists previous_holder_id uuid references public.profiles(id),
    add column if not exists routing_stage text not null default 'sailor'
        check (routing_stage in ('sailor','rater','senior_rater','reporting_senior','admin','debrief','locked')),
    add column if not exists participants uuid[] not null default '{}',
    add column if not exists signature_locked boolean not null default false;

create index if not exists idx_evaluations_summary_group on public.evaluations (summary_group_id);
create index if not exists idx_evaluations_current_holder on public.evaluations (current_holder_id);

-- Back-fill legacy rows so custody is consistent (runs before the trigger below exists).
update public.evaluations set
    current_holder_id = coalesce(
        case when status = 'ready_for_review' then reviewer_id end,
        created_by),
    routing_stage = case
        when status in ('completed','archived') then 'locked'
        when status = 'ready_for_review' then 'rater'
        else 'sailor' end,
    signature_locked = (status in ('completed','archived')),
    participants = array_remove(array[created_by, reviewer_id], null)
 where current_holder_id is null;

-- 3. Summary-group field inheritance trigger ---------------------------------
create or replace function public.enforce_summary_group_fields()
returns trigger as $$
declare g public.summary_groups%rowtype;
begin
    if new.summary_group_id is null then
        return new;
    end if;
    select * into g from public.summary_groups where id = new.summary_group_id;
    if not found then
        raise exception 'summary group % not found', new.summary_group_id;
    end if;
    if g.status = 'closed'
       and (tg_op = 'INSERT' or old.summary_group_id is distinct from new.summary_group_id) then
        raise exception 'summary group is closed to new members';
    end if;
    -- Inherit the five BUPERSINST-fixed shared fields (copy-on-write).
    new.period_to        := g.period_to;
    new.grade_rate       := g.grade_rate;
    new.promotion_status := g.promotion_status;
    new.report_type      := g.report_type;
    new.block_values     := jsonb_set(coalesce(new.block_values, '{}'::jsonb),
                                      '{command_achievements}', to_jsonb(g.command_employment), true);
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_enforce_summary_group on public.evaluations;
create trigger trg_enforce_summary_group
    before insert or update on public.evaluations
    for each row execute function public.enforce_summary_group_fields();

-- 4. Oversight helper (Reporting Senior / Admin) -----------------------------
create or replace function public.has_oversight(uid uuid)
returns boolean as $$
    select exists (
        select 1 from public.profiles
         where id = uid
           and (preferred_role in ('Reporting Senior','Admin')
             or 'Reporting Senior' = any(assigned_roles)
             or 'Admin' = any(assigned_roles))
    );
$$ language sql stable security definer;

-- 5. RLS rewrite for custody-based access ------------------------------------
-- Visibility follows the participant set (everyone who has held it) + creator + oversight.
-- Direct browser UPDATE is limited to the current holder of an unlocked eval (covers the
-- sailor editing their draft); all custody transitions go through service-role routes.
drop policy if exists "Allow creators to read own evaluations" on public.evaluations;
drop policy if exists "Allow creators and reviewers to update evaluations" on public.evaluations;

create policy "eval_select_custody" on public.evaluations for select to authenticated
using (
        auth.uid() = any(participants)
     or auth.uid() = created_by
     or public.has_oversight(auth.uid())
);

create policy "eval_update_custody" on public.evaluations for update to authenticated
using (
        not signature_locked
    and auth.uid() = current_holder_id
)
with check (
        not signature_locked
    and auth.uid() = current_holder_id
);

-- 6. Summary-group RLS --------------------------------------------------------
-- All authenticated members may read groups (to select one); only oversight may create/close.
create policy "sg_select_all" on public.summary_groups for select to authenticated
    using (true);

create policy "sg_insert_priv" on public.summary_groups for insert to authenticated
    with check (public.has_oversight(auth.uid()));

create policy "sg_update_priv" on public.summary_groups for update to authenticated
    using (public.has_oversight(auth.uid()) or created_by = auth.uid());
