-- Migration 006: Brag Sheet + AI Auto-Fill
--
-- One table. The ten template sections live in a single jsonb payload (data) —
-- sections version together and nothing queries inside bullets; split columns
-- only if reporting ever needs SQL over bullets (deliberate, see spec §3 notes).
--
-- 006:1  brag_sheets — per-user, per-eval-period brag sheet (RLS owner-only CRUD)
--
-- NORMATIVE (privacy): this feature has NO storage bucket. Uploaded prior-EVAL /
-- PRIMS PDFs are processed in-memory by the extract route and never persisted.
-- Do not add storage DDL here or in any later migration for this feature.

-- 1. Brag sheets ---------------------------------------------------------------
create table if not exists public.brag_sheets (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references public.profiles(id) not null,
    evaluation_id uuid references public.evaluations(id),  -- set once applied to a draft
    report_type text not null check (report_type in ('EVAL','CHIEFEVAL','FITREP')),
    period_from date not null,                              -- feeds Block 14
    period_to date not null,                                -- feeds Block 15
    template_version text not null default '1.0',           -- BRAG_SHEET_VERSION
    data jsonb not null default '{}'::jsonb,                -- BragSheetData (spec §4.2, the v1.0 template)
    status text not null default 'draft'
        check (status in ('draft','submitted')),
    -- AI-use consent (first-use modal, spec §6); the autofill route refuses 403
    -- while null. Declining keeps the brag sheet fully usable — only AI drafting
    -- is disabled.
    consented_at timestamptz,
    -- Most recent AutofillResponse (spec §4.2) — the reviewed-before-apply
    -- proposal. Written only by the service-role autofill route; nulled by the
    -- fail-closed audit compensation (spec §4.7). Never applied automatically.
    last_autofill jsonb,
    created_at timestamptz default now() not null,
    updated_at timestamptz default now() not null
);

create index if not exists idx_brag_sheets_user
    on public.brag_sheets (user_id);

create or replace function public.touch_brag_sheet()
returns trigger as $$
begin
    new.updated_at := now();
    return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_touch_brag_sheet on public.brag_sheets;
create trigger trg_touch_brag_sheet
    before update on public.brag_sheets
    for each row execute function public.touch_brag_sheet();

alter table public.brag_sheets enable row level security;

drop policy if exists brag_select_own on public.brag_sheets;
create policy brag_select_own on public.brag_sheets
    for select to authenticated using (user_id = auth.uid());

drop policy if exists brag_insert_own on public.brag_sheets;
create policy brag_insert_own on public.brag_sheets
    for insert to authenticated with check (user_id = auth.uid());

drop policy if exists brag_update_own on public.brag_sheets;
create policy brag_update_own on public.brag_sheets
    for update to authenticated
    using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists brag_delete_own on public.brag_sheets;
create policy brag_delete_own on public.brag_sheets
    for delete to authenticated using (user_id = auth.uid());
