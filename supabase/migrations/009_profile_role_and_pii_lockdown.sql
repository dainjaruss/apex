-- supabase/migrations/009_profile_role_and_pii_lockdown.sql
--
-- P0 security: role self-escalation + blanket profile PII exposure.
--
-- Idempotent. Safe to run against a project that already has 001-008 applied:
-- every statement is `drop ... if exists`, `create or replace`, or a
-- declarative grant/revoke.
--
-- ============================================================================
-- ORDERING CONSTRAINT (why parts A1/A2 must precede part B)
-- ============================================================================
-- Part B narrows profile SELECT to "your own row, plus a four-column directory
-- view for everyone". Any rule of the form "an oversight role may read more"
-- is worthless while roles are self-assertable: a Sailor would simply set
-- preferred_role = 'Admin' and read everything. Parts A1 and A2 remove both
-- self-assertion paths and therefore run first. Supabase applies a migration
-- file inside one transaction, so the two halves land together or not at all.
--
-- ============================================================================
-- PART A1 -- a user may not change their own preferred_role / assigned_roles
-- ============================================================================
-- Both columns are privilege-bearing:
--   * lib/permissions.ts canSignBlock() gates signature blocks 42/49/50/52 on
--     preferred_role alone (no ownership check), and block 50 sets
--     evaluations.signature_locked = true + routing_stage = 'locked'.
--   * lib/permissions.ts canManageSummaryGroups() grants on
--     assigned_roles @> '{GroupManager}'.
--   * public.has_oversight() (002) reads BOTH columns and drives the
--     evaluations SELECT policy.
--
-- 001 shipped:
--     create policy "Allow users to update own profile"
--       on public.profiles for update to authenticated using (auth.uid() = id);
-- No `with check`, no column restriction -- the row filter let a Sailor rewrite
-- their own role and then sign as the Reporting Senior.
--
-- MECHANISM: column-level UPDATE privileges, NOT a `before update` trigger.
--   1. Native and code-free. Column privileges are enforced by the executor
--      before RLS and before any trigger fires, so there is no trigger ordering,
--      `alter table ... disable trigger`, or SECURITY DEFINER path that slips
--      past them.
--   2. Fail-loud. A revoked column raises SQLSTATE 42501 and aborts the whole
--      statement. A trigger silently reverts the value, which hides caller bugs
--      and makes the UI report a successful save that did not happen.
--   3. A `with check` on the policy would need a subquery back against
--      public.profiles, which risks RLS recursion.
--
-- VERIFIED ON postgres:17 -- REVOKING THE COLUMNS ALONE IS A NO-OP.
-- Supabase grants `authenticated` table-level UPDATE on every public table by
-- default, and a table-level privilege already covers all columns; a
-- column-level revoke does not subtract from it. The table-level grant must be
-- revoked FIRST, and only the safe columns granted back. Probe result before
-- the table-level revoke: `update profiles set preferred_role='Admin'` -> UPDATE 1.
-- After: ERROR 42501 permission denied for table profiles.

revoke update on public.profiles from authenticated;

-- `anon` still held table-level SELECT/INSERT/UPDATE/DELETE from Supabase's
-- default grants (relacl `anon=ardDxtm`). Inert today because no RLS policy
-- names `anon`, but that makes the safety of the table depend on RLS never
-- regressing. Drop the privileges outright — `anon` has no business here.
revoke all on public.profiles from anon;

-- The safe set is exactly what lib/profileService.ts updateProfile() writes.
-- Deliberately excluded: id (identity), email (set from auth.users by the
-- signup trigger), created_at, preferred_role, assigned_roles.
grant update (
    first_name,
    last_name,
    middle_initial,
    dod_id,
    uic,
    navy_rank,
    command
) on public.profiles to authenticated;

-- `service_role` is unaffected (it keeps full UPDATE and bypasses RLS), so the
-- server routes in app/api/* that use createAdminClient() continue to work.
-- Role assignment is consequently service-role-only until a real admin trust
-- model exists. That is intentional: see the PR body.


-- ============================================================================
-- PART A2 -- the signup trigger must not accept a client-chosen role
-- ============================================================================
-- Not in the original defect list, but Part A1 is cosmetic without it.
-- public.handle_new_user() (001) is SECURITY DEFINER and copied
-- raw_user_meta_data->>'preferred_role' straight into public.profiles.
-- raw_user_meta_data is attacker-controlled: it is whatever the browser sent to
-- auth.signUp({ options: { data } }). An attacker who cannot UPDATE their role
-- would simply register a second account with preferred_role = 'Admin'.
--
-- Every new account now starts as 'Sailor' regardless of what the client sends.
-- The rest of the metadata (name, rank, UIC, command) is display data with no
-- privilege attached and is still honoured.

create or replace function public.handle_new_user()
returns trigger as $$
begin
    insert into public.profiles (
        id, first_name, last_name, middle_initial, dod_id, email,
        navy_rank, uic, command, preferred_role, assigned_roles
    )
    values (
        new.id,
        coalesce(new.raw_user_meta_data->>'first_name', 'New'),
        coalesce(new.raw_user_meta_data->>'last_name', 'Sailor'),
        new.raw_user_meta_data->>'middle_initial',
        new.raw_user_meta_data->>'dod_id',
        new.email,
        coalesce(new.raw_user_meta_data->>'navy_rank', 'SR'),
        new.raw_user_meta_data->>'uic',
        new.raw_user_meta_data->>'command',
        -- Hard-coded. raw_user_meta_data->>'preferred_role' is client-supplied
        -- and is deliberately ignored; roles are granted, never self-declared.
        'Sailor',
        ARRAY['Sailor']::text[]
    );
    return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;


-- ============================================================================
-- PART A3 -- pin search_path on the remaining SECURITY DEFINER functions
-- ============================================================================
-- None of the five definer functions in the 001-008 chain set search_path, so
-- each resolves unqualified names through whatever the caller's search_path is.
-- Not exploitable today (`authenticated` has no CREATE on schema public, so it
-- cannot shadow a table with a temp one), but it is standard hardening and it
-- silences Supabase's `function_search_path_mutable` linter.
--
-- `alter function` rather than `create or replace`: it is one line each and does
-- not duplicate five function bodies into this file, where they would silently
-- drift from the definitions in 002/004/006.
--
-- !! REPLAY CAVEAT -- `create or replace function` RESETS proconfig. Re-applying
-- 002, 004 or 006 out of band therefore silently strips search_path from the four
-- functions pinned below. (handle_new_user is redefined in part A2 above, so it
-- carries its own `set search_path` and survives a 001 replay.) This project has
-- a documented history of out-of-band replays: after replaying ANY earlier
-- migration against a live project, re-run 009. It is idempotent and self-healing.

alter function public.has_oversight(uuid)
    set search_path = public, pg_temp;
alter function public.enforce_summary_group_fields()
    set search_path = public, pg_temp;
alter function public.touch_member_board_record()
    set search_path = public, pg_temp;
alter function public.touch_brag_sheet()
    set search_path = public, pg_temp;


-- ============================================================================
-- PART B -- stop every authenticated user reading every DoD ID
-- ============================================================================
-- 001 shipped:
--     create policy "Allow public read of profiles"
--       on public.profiles for select to authenticated using (true);
-- so any signed-in account could `select * from profiles` and harvest the
-- dod_id (protected PII), email, rank, UIC and command of every user.
-- components/admin/AnalyticsDashboard.tsx did exactly that full-table select
-- behind a page gated only client-side on the (then self-asserted) role.

drop policy if exists "Allow public read of profiles" on public.profiles;
drop policy if exists "profiles_select_own" on public.profiles;

create policy "profiles_select_own"
    on public.profiles for select
    to authenticated
    using (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- public.profiles_directory -- the narrow, deliberately-broad read surface
-- ---------------------------------------------------------------------------
-- Four columns, chosen because they are what the genuine cross-user consumers
-- already asked for and nothing more:
--
--   id, first_name, last_name  -- naming a person in a picker or an audit row
--   preferred_role             -- filtering that picker to the required role
--
-- Consumers (all browser/anon-key clients):
--   components/Reviewer/ReviewPanel.tsx  -- "route to" picker, filtered by role
--   app/summary-groups/page.tsx          -- Reporting Senior picker
--   lib/auditService.ts                  -- attributes audit rows to a name
--   components/admin/AnalyticsDashboard.tsx -- headcount + role distribution
--   app/admin/page.tsx                   -- user roster
--
-- dod_id, email, navy_rank, uic and command are NOT exposed. Everyone in the
-- rating chain already knows each other's names and billets, so the residual
-- exposure is a name-and-role roster; the DoD ID is the piece that must not
-- leak, and it no longer does.
--
-- SECURITY MODEL -- security_invoker is deliberately LEFT OFF (the Postgres
-- default, i.e. the view runs as its owner, `postgres`). That is the entire
-- point: the owner is the profiles table owner and therefore bypasses the
-- table's RLS, which is what lets the view show all rows while the base table
-- shows only your own. Setting `security_invoker = true` would re-apply
-- profiles_select_own inside the view and collapse it to a single row
-- (measured: 2 rows -> 1 row), silently breaking every picker above.
-- Supabase's linter flags this as `security_definer_view`; it is expected here
-- and must not be "fixed".
-- ponytail: the trailing `offset 0` is LOAD-BEARING. Do not "clean it up".
-- Without it this view is simple enough to be auto-updatable, and because it is
-- security-definer an UPDATE through it runs as the owner — bypassing BOTH the
-- column privileges of part A1 and the row filter of profiles_select_own. Today
-- that is blocked only by the explicit `revoke all` below, which is one careless
-- edit away from vanishing: Postgres forbids CREATE OR REPLACE VIEW from
-- removing or renaming a column, so anyone changing the column list is forced
-- into DROP + CREATE, and Supabase's `alter default privileges` then re-grants
-- ALL on the freshly-created view. Demonstrated: after a drop/recreate with an
-- identical definition, `authenticated` rewrote another user's preferred_role
-- through the view — strictly worse than the original defect.
-- `offset 0` makes the view non-auto-updatable permanently (writes fail with
-- "cannot update view" even when granted ALL), and costs nothing on reads.
-- Upgrade path if this ever needs to be writable: an explicit INSTEAD OF trigger,
-- never auto-update.
create or replace view public.profiles_directory as
    select id, first_name, last_name, preferred_role
      from public.profiles
     offset 0;

revoke all on public.profiles_directory from anon, authenticated;
grant select on public.profiles_directory to authenticated;

comment on view public.profiles_directory is
    'Name-and-role roster readable by any authenticated user. Intentionally a '
    'security-definer view (security_invoker off) so it can see past the '
    'own-row RLS on public.profiles. Never add dod_id, email, uic or command '
    'here -- see migration 009.';
