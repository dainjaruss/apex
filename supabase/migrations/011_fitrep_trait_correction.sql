-- 011_fitrep_trait_correction.sql
--
-- Corrects the FITREP_W2_O6 form_definitions row, which carried EIGHT performance
-- traits: the seven EVAL (NAVPERS 1616/26) traits at Blocks 33-39 plus an invented
-- eighth trait at the fabricated block number "39.1".
--
-- Source of truth: public/fitrepBlank.pdf — NAVPERS 1610/2 (REV 05-2025), "FITNESS
-- REPORT & COUNSELING RECORD (W2-O6)" — transcribed from its text layer with
-- `pdftotext -layout` and cross-checked against the rendered page. The form prints
-- SEVEN traits and there is no Block 39.1.
--
--   was (EVAL traits + invented 8th)      is (printed on NAVPERS 1610/2)
--   33 Professional Knowledge             33 PROFESSIONAL EXPERTISE
--   34 Quality of Work                    34 COMMAND OR ORGANIZATIONAL CLIMATE
--   35 Command or Org Climate/EO          35 MILITARY BEARING/CHARACTER
--   36 Military Bearing / Character       36 TEAMWORK
--   37 Personal Job Accomplishment/Init   37 MISSION ACCOMPLISHMENT AND INITIATIVE
--   38 Teamwork                           38 LEADERSHIP
--   39 Leadership                         39 TACTICAL PERFORMANCE
--   39.1 Tactical Performance             (no such block)
--
-- Tactical Performance is a real trait at Block 39, not an extra row appended to the
-- enlisted table. "Quality of Work" is an EVAL trait (1616/26 Block 34) and appears
-- nowhere on 1610/2 — it is the row that leaves.
--
-- The 3.0 advancement gate moves from Block 35 to Block 34, following the trait it is
-- attached to: BUPERSINST 1610.10H Encl (2) ch. 1, p. 1-16 — "Command or Organizational
-- Climate and Equal Opportunity (FITREP/EVAL) ... must be evaluated as 3.0 or higher to
-- maintain eligibility for advancement and receive a recommendation of Promotable."
-- (The literal string "Equal Opportunity" does not appear on 1610/2; the form prints the
-- trait as "COMMAND OR ORGANIZATIONAL CLIMATE". The instruction's longer name is kept in
-- the note so the gate stays traceable to its citation.)
--
-- The `::numeric` cast on `number` below is load-bearing: at the time this migration
-- runs the array still contains the non-integer block "39.1", so `::int` would abort.


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Form definition: rewrite Blocks 33-39, drop the fabricated 39.1 element.
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE public.form_definitions f
SET blocks = jsonb_set(
  f.blocks,
  '{blocks}',
  (
    SELECT jsonb_agg(
             CASE WHEN c.corrected IS NULL THEN b.elem ELSE b.elem || c.corrected END
             ORDER BY b.ord
           )
    FROM jsonb_array_elements(f.blocks -> 'blocks') WITH ORDINALITY AS b(elem, ord)
    LEFT JOIN (
      VALUES
        (33, $j${"name":"Professional Expertise","label":"Professional Expertise",
                 "note":"As printed on NAVPERS 1610/2: professional knowledge, proficiency, and qualifications."}$j$::jsonb),
        (34, $j${"name":"Command or Organizational Climate","label":"Command or Organizational Climate",
                 "note":"3.0 or higher required for a Promotable-or-higher recommendation (BUPERSINST 1610.10H Encl (2) ch. 1, p. 1-16, \"Command or Organizational Climate and Equal Opportunity (FITREP/EVAL)\"). As printed on NAVPERS 1610/2: contributions to growth and development, human worth, community. Form footnote: a 2.0 in this block must be specifically substantiated in comments."}$j$::jsonb),
        (35, $j${"name":"Military Bearing / Character","label":"Military Bearing / Character",
                 "note":"As printed on NAVPERS 1610/2: appearance, conduct, physical fitness, adherence to Navy Core Values."}$j$::jsonb),
        (36, $j${"name":"Teamwork","label":"Teamwork",
                 "note":"As printed on NAVPERS 1610/2: contributions toward team building and team results."}$j$::jsonb),
        (37, $j${"name":"Mission Accomplishment and Initiative","label":"Mission Accomplishment and Initiative",
                 "note":"As printed on NAVPERS 1610/2: taking initiative, planning/prioritizing, achieving mission."}$j$::jsonb),
        (38, $j${"name":"Leadership","label":"Leadership",
                 "note":"As printed on NAVPERS 1610/2: organizing, motivating and developing others to accomplish goals."}$j$::jsonb),
        (39, $j${"name":"Tactical Performance","label":"Tactical Performance","field":"tactical_performance",
                 "note":"Printed on NAVPERS 1610/2 as \"TACTICAL PERFORMANCE: (Warfare qualified officers only) Basic and tactical employment of weapons systems\". Block 39 carries its own NOB box on the form — an officer who is not warfare qualified is marked NOB and the trait is excluded from the individual trait average."}$j$::jsonb)
    ) AS c(num, corrected)
      ON (b.elem ->> 'number')::numeric = c.num
    -- Drop the fabricated Block 39.1 row entirely.
    WHERE (b.elem ->> 'number') IS DISTINCT FROM '39.1'
  )
)
-- (`jsonb_typeof` rather than the `?` existence operator: `?` is a bind placeholder
--  in several drivers, and this file should be safe to run through any of them.)
WHERE f.form_code = 'FITREP_W2_O6'
  AND jsonb_typeof(f.blocks -> 'blocks') = 'array';


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Legacy stored grades.
--
-- Officer records drafted against the old eight-row table hold a `work` grade — a
-- grade for a trait NAVPERS 1610/2 does not have. There is no correct block to move
-- it to, so it is removed; nothing else is touched, because every other stored key is
-- semantic (`teamwork` still means teamwork) and only the block NUMBER printed beside
-- it changed.
--
-- Removing it changes the individual trait average (the divisor drops from 8 to 7), so
-- the stored `trait_average` is nulled rather than silently recomputed: the report
-- shows "—" until it is reopened and the average is recomputed from the seven real
-- traits. A visible gap beats a number that quietly changed under a signed report.
-- Each affected evaluation also gets an audit row, which the report's Audit tab
-- already renders.
--
-- Idempotent, and rows are selected by KEY SHAPE (`jsonb_exists(trait_grades,'work')`)
-- rather than by date — a second run matches nothing.
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.audit_logs (evaluation_id, user_id, action, details)
SELECT
  e.id,
  NULL,
  'DOCTRINE_CORRECTION',
  jsonb_build_object(
    'migration',        '011_fitrep_trait_correction',
    'reason',           'NAVPERS 1610/2 (REV 05-2025) prints seven traits at Blocks 33-39 and has no "Quality of Work" trait. The grade recorded against it has been removed.',
    'removed_trait',    'work',
    'removed_grade',    e.trait_grades -> 'work',
    'previous_trait_average', to_jsonb(e.trait_average),
    'trait_average_action',   'cleared — recomputed over the seven 1610/2 traits when the report is next opened'
  )
FROM public.evaluations e
WHERE e.report_type = 'FITREP'
  AND jsonb_exists(e.trait_grades, 'work');

UPDATE public.evaluations e
SET trait_grades  = e.trait_grades - 'work',
    trait_average = NULL
WHERE e.report_type = 'FITREP'
  AND jsonb_exists(e.trait_grades, 'work');
