-- 013_board_analyses_nullable_score.sql
--
-- board_analyses.overall_score / .band become NULLABLE, so that "APEX has no
-- defensible number for this record" is a state the database can represent.
--
-- WHY. The readiness layer already refuses to show a composite when a scored
-- area is less than half observed, but the run row was written unconditionally,
-- so every suppressed run persisted a number the product had just decided not to
-- stand behind. For a record with nothing entered at all the composite is not
-- merely low, it is UNDEFINED — Sigma(weight*confidence) is 0 — and the engine
-- emitted 0, which the band table then reads as "Drop-from-consideration risk".
-- A fabricated 0 that scores as the worst possible outcome is the exact defect
-- this whole change set exists to remove, reproduced in the one place it
-- outlives the request.
--
-- Coverage is NOT duplicated into a column: it is already snapshotted at
-- input->'readiness'->'coverage'->>'measured' and ResultsView reads it back
-- from there. Adding a column would duplicate JSONB to make an indefensible
-- number look defensible. The fix is to stop writing the number instead.
--
-- service.ts writes both columns only when report.score !== null. Historical
-- rows keep whatever they were written with; nothing is backfilled, because a
-- prior run must render exactly what it said at the time.
--
-- The CHECK constraints are preserved for non-null values — a written score is
-- still 0..100 and a written band is still one of the five vote values.

alter table public.board_analyses
    alter column overall_score drop not null;

alter table public.board_analyses
    alter column band drop not null;

-- Recreate the range checks so they still bind on rows that DO carry a score.
-- (A NULL passes a CHECK in Postgres, so the original expressions remain
-- correct as written; they are restated here only because dropping NOT NULL on
-- a column whose check references it has bitten this repo before when a
-- migration was replayed out of band. Idempotent either way.)
alter table public.board_analyses
    drop constraint if exists board_analyses_overall_score_check;
alter table public.board_analyses
    add constraint board_analyses_overall_score_check
    check (overall_score is null or (overall_score >= 0 and overall_score <= 100));

alter table public.board_analyses
    drop constraint if exists board_analyses_band_check;
alter table public.board_analyses
    add constraint board_analyses_band_check
    check (band is null or band in (0, 25, 50, 75, 100));
