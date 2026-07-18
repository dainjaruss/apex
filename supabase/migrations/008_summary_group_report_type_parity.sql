-- supabase/migrations/008_summary_group_report_type_parity.sql
-- CHIEFEVAL/FITREP parity for summary groups.
--
-- Background (found in the 2026-07-18 schema audit): report_type was lifted
-- from EVAL-only to {EVAL, CHIEFEVAL, FITREP} for `evaluations` (003) and
-- `brag_sheets` (006), but `summary_groups` was left at the 002 MVP restriction
-- `report_type = 'EVAL'`. The app, however, creates CHIEFEVAL/FITREP
-- evaluations (lib/formDefinitions.ts) and segregates summary groups by report
-- type (lib/summaryGroupEligibility.ts matches ev.report_type to
-- group.report_type), so a non-EVAL eval cannot be placed in a summary group —
-- the insert is rejected by this check. Bring it to parity with the sibling
-- tables. Idempotent (drop-if-exists then add).

alter table public.summary_groups
  drop constraint if exists summary_groups_report_type_check;

alter table public.summary_groups
  add constraint summary_groups_report_type_check
  check (report_type in ('EVAL', 'CHIEFEVAL', 'FITREP'));
