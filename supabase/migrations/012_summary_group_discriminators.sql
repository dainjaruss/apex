-- supabase/migrations/012_summary_group_discriminators.sql
--
-- The summary-group discriminators the schema never stored.
--
-- BUPERSINST 1610.10H, Encl (2), ch. 1, "EVAL BLOCK 46 / FITREP BLOCK 43 / CHIEFEVAL
-- BLOCK 48 SUMMARY", p. 1-19: "A summary group consists of all reports that share all
-- the characteristics in the following tables." Those tables are 1-3 (officers, p. 1-19)
-- and 1-4 (enlisted, p. 1-22). Migration 002 stored five of the characteristics —
-- paygrade, promotion status, ending date, type of report, reporting senior — and
-- lib/summaryGroupEligibility.ts wrote guards for three more that had no column to
-- read, so they never fired. This adds the columns.
--
--   Blk 5  Duty/Competitive Status
--          Table 1-4, verbatim: "For enlisted, group ACT and TAR together, group
--          INACT, AT/ADOS separately."
--          Table 1-3, verbatim: "Group by box marked in Block 5." — plus the p. 1-20
--          note "Active, TAR, and INACT officers are separated in different summary
--          groups by the entry in block 5."
--          UNCONDITIONAL in both tables.
--
--   Blk 21 Billet Subcategory
--          Table 1-4 ("Billet") and Table 1-3 ("Billet Subcategory"), both verbatim:
--          "Group by entry in this block."
--          UNCONDITIONAL in both tables, and EVERY report has an entry — p. 1-7,
--          BLOCK 21: "Select or enter the billet subcategory code, if authorized, or
--          enter 'NA.' Do not leave blank." Table 1-1 (p. 1-8) defines NA as
--          "Subcategories not used. (Should appear in most reports.)" So a blank
--          Block 21 is a form defect, not a grouping bucket: '' is rejected below,
--          and only NULL (pre-012, never stated) is allowed.
--
--   Blk 6  UIC
--          Table 1-4, verbatim: "If reporting seniors have more than one UIC, but
--          desire to group all enlisted personnel together, they may do so. If
--          multiple summary groups, Block 6 should match the primary UIC of the
--          reporting senior in block 26."
--          PERMISSIVE, and enlisted only — Table 1-3 has no Block 6 row at all. This
--          is the one discriminator whose "only enforced when the group sets it"
--          shape is what the instruction actually says, not a gap.
--
-- Block 3 Designator (Table 1-3, officers: "Group by competitive designator
-- category") is deliberately NOT added — see lib/summaryGroupEligibility.ts for the
-- reason the category map is not faithfully derivable from Block 3 alone.
--
-- EXISTING ROWS: the 12 groups already on the hosted database predate these columns,
-- so their reporting senior never stated a Block 5 or Block 21. They are left NULL,
-- which the guards read as "not stated" and skip — exactly today's behaviour, so no
-- live group changes membership and no live group becomes invalid. Backfilling from
-- current members was rejected: a group's Block 5/21 is the reporting senior's
-- declaration of what the group is FOR, and inferring it from whoever happens to be
-- in it would invent a rule the instruction does not contain. New groups cannot be
-- created without both values (app/summary-groups/page.tsx requires them).
--
-- Idempotent: add column if not exists, drop-then-add for constraints (as in 008).
--
-- Wrapped in a transaction. Supabase applies each migration file in one already, but
-- `psql -f` does not: verified on postgres:14.23, where the old unique constraint drops,
-- the NULLS NOT DISTINCT statement then fails on syntax (PG15+ only), and the table is
-- left with NO uniqueness constraint at all — a full duplicate row inserts cleanly. Two
-- lines make any mid-file failure roll back, not just that one.

begin;

alter table public.summary_groups
    add column if not exists uic                text,
    add column if not exists duty_status        text,
    add column if not exists billet_subcategory text;

comment on column public.summary_groups.uic is
    'Block 6 UIC. Optional — Table 1-4 lets a reporting senior with several UICs group everyone together. NULL/empty = not restricting by UIC.';
comment on column public.summary_groups.duty_status is
    'Block 5 Duty/Competitive Status. NULL only on groups created before migration 012.';
comment on column public.summary_groups.billet_subcategory is
    'Block 21 Billet Subcategory. NULL only on pre-012 rows; never blank — p. 1-7 says enter NA, do not leave blank.';

-- Block 5 legal values: the four boxes printed on the blank forms in public/ —
-- NAVPERS 1616/26 and 1610/2 print "ACT | TAR | INACT | AT/ADSW/265", NAVPERS 1616/27
-- prints "ACT | TAR | INACT | AT/ADOS/265". APEX canonicalises the fourth to the
-- instruction's spelling, AT/ADOS (types/navpers.ts DUTY_STATUS_OPTIONS).
alter table public.summary_groups
    drop constraint if exists summary_groups_duty_status_check;
alter table public.summary_groups
    add constraint summary_groups_duty_status_check
    check (duty_status is null or duty_status in ('ACT', 'TAR', 'INACT', 'AT/ADOS'));

-- Mirrors the evaluations.uic check from 001.
alter table public.summary_groups
    drop constraint if exists summary_groups_uic_check;
alter table public.summary_groups
    add constraint summary_groups_uic_check
    check (uic is null or length(uic) = 5);

-- Block 21 is never blank (p. 1-7, quoted above), and types/navpers.ts already enforces
-- .min(1) on the eval side. A '' here would be a group NOTHING can join: every eval that
-- passes APEX's own schema has a non-empty code, so the guard would reject all of them.
alter table public.summary_groups
    drop constraint if exists summary_groups_billet_subcategory_check;
alter table public.summary_groups
    add constraint summary_groups_billet_subcategory_check
    check (billet_subcategory is null or billet_subcategory <> '');

-- The 002 uniqueness rule ("one logical group per RS + ending date + paygrade +
-- promotion status + report type") is now WRONG: a reporting senior with both ACT and
-- INACT E-5s for the same period needs two groups that differ only by Block 5, and
-- the old constraint made the second one impossible to create. Without this, the new
-- guards would reject evals with no way to build the group they belong in.
--
-- NULLS NOT DISTINCT (PG15+; hosted runs 17.6) because "not stated" is one bucket, not
-- infinitely many: two groups that are both silent on Block 5 with the same five original
-- characteristics ARE the same group. It also keeps ON CONFLICT working for rows with a
-- NULL uic, which scripts/seed-stress.ts relies on to be re-runnable.
--
-- Safe to add to the live table: the 002 constraint already guaranteed uniqueness on the
-- five-column prefix, so no existing pair of the 12 rows can collide on the superset.
alter table public.summary_groups
    drop constraint if exists summary_groups_reporting_senior_id_period_to_grade_rate_pro_key;
alter table public.summary_groups
    drop constraint if exists summary_groups_discriminators_key;
alter table public.summary_groups
    add constraint summary_groups_discriminators_key
    unique nulls not distinct
    (reporting_senior_id, period_to, grade_rate, promotion_status, report_type,
     duty_status, billet_subcategory, uic);

commit;
