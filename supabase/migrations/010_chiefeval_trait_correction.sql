-- 010_chiefeval_trait_correction.sql
--
-- Corrects the CHIEFEVAL form_definitions row, whose Blocks 33-39 carried five
-- FABRICATED performance traits. Not one block number matched a correct label.
--
-- Source of truth: public/chiefEvalBlank.pdf — NAVPERS 1616/27 (REV 05-2025),
-- "EVALUATION & COUNSELING RECORD (E7-E9)" — transcribed from its text layer with
-- `pdftotext -layout`. Cross-checked against docs/navy-reference.md §3.1, which
-- agrees on all seven labels and block numbers.
--
--   was (invented)                        is (printed on the form)
--   33 Deckplate Leadership               33 TECHNICAL MASTERY        (COMPETENCY)
--   34 Professionalism (incl. PFA)        34 INSTITUTIONAL EXPERTISE  (COMPETENCY)
--   35 Mission Accomplishment             35 PROFESSIONALISM          (CHARACTER)
--   36 Human Development                  36 INTEGRITY                (CHARACTER)
--   37 Equal Opportunity/Command Climate  37 ACCOUNTABILITY           (CHARACTER)
--   38 Teamwork                           38 DECKPLATE LEADERSHIP     (CULTURE)
--   39 Leadership                         39 TEAM EFFECTIVENESS       (CULTURE)
--
-- The 3.0 advancement gate stays on Block 37 (right number all along, wrong label):
-- BUPERSINST 1610.10H Encl (2) ch. 1, p. 1-16 — "Command or Organizational Climate
-- and Equal Opportunity (FITREP/EVAL) and Accountability (CHIEFEVAL) must be
-- evaluated as 3.0 or higher to maintain eligibility for advancement and receive a
-- recommendation of Promotable." The string "EQUAL OPPORTUNITY" appears nowhere on
-- 1616/27.
--
-- Rewrites only the seven trait objects, matched by their "number" key, and leaves
-- every other block in the row untouched.

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
        (33, $j${"name":"Technical Mastery","label":"Technical Mastery","category":"Competency",
                 "note":"As printed on NAVPERS 1616/27: technical expert in rating and community; uses technical knowledge and experience to produce well trained teams able to execute the command mission with excellence; applies knowledge, skills, and abilities to meet any mission."}$j$::jsonb),
        (34, $j${"name":"Institutional Expertise","label":"Institutional Expertise","category":"Competency",
                 "note":"As printed on NAVPERS 1616/27: understands how unit mission supports the naval mission and the National Military Strategy; recognizes when to engage to ensure mission success; knows and teaches customs and traditions, understands naval history."}$j$::jsonb),
        (35, $j${"name":"Professionalism","label":"Professionalism","category":"Character",
                 "note":"As printed on NAVPERS 1616/27: promotes the attributes that define the Profession of Arms; success measured by Sailors' achievements; conduct in alignment with Core Values; actively teaches, upholds, and enforces standards; role model for GOAD."}$j$::jsonb),
        (36, $j${"name":"Integrity","label":"Integrity","category":"Character",
                 "note":"As printed on NAVPERS 1616/27: abides by an uncompromising code of integrity; takes full responsibility for actions; sets a positive tone and builds trust."}$j$::jsonb),
        (37, $j${"name":"Accountability","label":"Accountability","category":"Character",
                 "note":"3.0 or higher required for a Promotable-or-higher recommendation (BUPERSINST 1610.10H Encl (2) ch. 1, p. 1-16). As printed on NAVPERS 1616/27: mission-focused, accountable for outcomes; learning mindset, providing command solutions; holds self and peers accountable; actively self-assesses and has a strong commitment to self correction."}$j$::jsonb),
        (38, $j${"name":"Deckplate Leadership","label":"Deckplate Leadership","category":"Culture",
                 "note":"As printed on NAVPERS 1616/27: visible, sets the tone; understands personnel programs and policies; builds credible combat teams; honors and rewards team members; drives Sailors to be better."}$j$::jsonb),
        (39, $j${"name":"Team Effectiveness","label":"Team Effectiveness","category":"Culture",
                 "note":"As printed on NAVPERS 1616/27: proactive leader invested in all Sailors; anticipates problems, overcomes challenges, delivers best outcomes; innovates at the lowest level possible; behavior and performance are key factors in the attainment of team successes, the personal development of all team members."}$j$::jsonb)
    ) AS c(num, corrected)
      ON (b.elem ->> 'number')::numeric = c.num
  )
)
-- (`jsonb_typeof` rather than the `?` existence operator: `?` is a bind placeholder
--  in several drivers, and this file should be safe to run through any of them.)
WHERE f.form_code = 'CHIEFEVAL'
  AND jsonb_typeof(f.blocks -> 'blocks') = 'array';
