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
-- Step 1 rewrites only the seven trait objects, matched by their "number" key.
-- Step 2 purges trait grades stored against the old fabricated keys.
-- Step 3 corrects the rest of the CHIEFEVAL row, which carried the same class of
-- invented claim outside blocks 33-39.

-- ── 1. The seven performance traits ──────────────────────────────────────────

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


-- ── 2. Trait grades stored against the fabricated keys ───────────────────────
--
-- Step 1 fixes `form_definitions` only. Any CHIEFEVAL row in `evaluations`
-- written BEFORE the rename still holds grades under the old keys, and leaving
-- them costs a Sailor real marks with nothing raised anywhere:
--
--   deckplate_leadership   was Block 33, now reads as Block 38  (re-attributed)
--   professionalism        was Block 34, now reads as Block 35  (re-attributed)
--   mission_accomplishment  \  gone from lib/traitAverage.ts TRAIT_KEYS, so they
--   human_development        > are silently DROPPED from computeTraitAverage and
--   eo_climate              /  never stamped by lib/chiefEvalOverlay.ts
--   teamwork, leadership    survive in TRAIT_KEYS (they are EVAL keys) so they
--                           are still COUNTED, but chiefEvalTraitBlockMap no
--                           longer maps them and the overlay no longer stamps
--                           them
--
-- Net: a stored 4.43-over-7 average silently recomputes over FOUR keys and the
-- generated PDF loses three of seven marks. No warning, no error. The old traits
-- were fabricated so the grades were never meaningful — but a silent
-- recomputation is worse than a visible gap.
--
-- NULL rather than "flag the rows for re-entry". Why:
--
--   1. There is nothing to migrate TO. A grade given against "Human Development"
--      was never a grade against any trait NAVPERS 1616/27 prints. 33->38 and
--      34->35 only LOOK like renames: the standards text behind the old
--      `deckplate_leadership` and `professionalism` was fabricated too, so even
--      those two were not graded against the printed trait. Any mapping would be
--      a second fabrication stacked on the first.
--   2. Flagging needs machinery that does not exist — a marker column, a UI that
--      surfaces it, a re-entry workflow. Nulling reuses machinery that DOES
--      exist: an empty `trait_grades` renders as seven ungraded traits in
--      Block33to39Traits (which marks them required in the UI — note that
--      ChiefEvalSchema does NOT enforce this: types/navpers.ts makes all seven
--      `.optional()`, so `{}` validates clean; "required" is a UI property here,
--      not validation), Block 43 (Member Trait) prints blank, and
--      lib/boardConfidence/rubric.ts drops the row from the performance factor
--      instead of scoring a phantom. The gap is loud in every consumer without a
--      single new field. Nulling IS the flag.
--   3. `trait_average` goes with it because it is the only trusted-LOOKING copy
--      left. lib/boardConfidence/service.ts always recomputes from
--      `trait_grades` and never reads this column, so a stale 4.43 sitting next
--      to an empty `trait_grades` is a number with nothing behind it.
--
-- THE DURABLE FLAG IS THE EMPTY `trait_grades`, NOT THE NULL AVERAGE.
-- Block33to39Traits.tsx:110-113 syncs `trait_average: average ?? 0` in a mount
-- effect, so the NULL written here becomes 0 the first time anyone opens one of
-- these rows in the editor. Harmless to every score — service.ts and
-- summaryGroupService.ts both recompute from `trait_grades` and neither reads
-- the column — but it means reason 3 above buys consistency at rest, not a
-- lasting marker. Anything that wants to detect a purged row must look at
-- `trait_grades = '{}'`.
--
-- BLAST RADIUS, deliberate: lib/summaryGroupService.ts `getSummaryGroupAverage`
-- pools from `trait_grades` across the group, so a purged row stops contributing
-- and its summary group's pooled average — the Block 50a comparator every peer
-- in that group is measured against — moves. That is correct (the grades were
-- fabricated, so they were never a legitimate comparator), but it is not
-- confined to the purged row: peers see a different number after this runs.
--
-- Destructive, and authorised as such: every row is seeded test data and the
-- database can be reset. If that ever stops being true, copy the two columns out
-- before running this.
--
-- Legacy rows are detected by KEY SHAPE, never by date. None of the five keys
-- below can appear in a CHIEFEVAL row written after the rename: three were
-- dropped outright, and `teamwork`/`leadership` are EVAL keys that
-- ChiefEvalSchema's `z.object` strips from a CHIEFEVAL write.
--
-- Idempotent: after one run no CHIEFEVAL row carries any of the five, so a
-- second run matches nothing. (`->` ... IS NOT NULL rather than `?`/`?|`, for
-- the same driver-placeholder reason as above.)
--
-- Deliberately NOT covered: a legacy row holding ONLY `deckplate_leadership`
-- and/or `professionalism` is byte-identical in shape to a valid current row and
-- is left alone. Those two keys are also correct post-rename, so matching on
-- them would corrupt good data to clean up bad.

UPDATE public.evaluations
SET trait_grades  = '{}'::jsonb,
    trait_average = NULL
WHERE report_type = 'CHIEFEVAL'
  AND (   trait_grades -> 'mission_accomplishment' IS NOT NULL
       OR trait_grades -> 'human_development'      IS NOT NULL
       OR trait_grades -> 'eo_climate'             IS NOT NULL
       OR trait_grades -> 'teamwork'               IS NOT NULL
       OR trait_grades -> 'leadership'             IS NOT NULL);


-- ── 3. The rest of the CHIEFEVAL row ─────────────────────────────────────────
--
-- Blocks 33-39 were not the only invented content in this row. Swept the whole
-- of it against public/chiefEvalBlank.pdf (text layer) with BUPERSINST 1610.10H
-- Encl (2) ch. 1 — the block-by-block user's guide — as the secondary check.
--
-- Fabricated outright (the block does not exist on 1616/27):
--   12  "Promotion/Frocking"          -> the form prints DETACHMENT OF REPORTING SENIOR
--   42  "Signature of Rater"          -> EVAL 1616/26 block 42 only; the CHIEFEVAL has no rater block
--   44  "Qualifications/Achievements" -> EVAL 1616/26 block 44 only; on the CHIEFEVAL these go in block 40
--   49  "Signature of Senior Rater"   -> EVAL 1616/26 block 49 only
--
-- Right concept, wrong block number (the whole 40+ tail was off):
--   printed   40 Comments on Performance          was 43
--             41 Individual (promotion rec)       was 45
--             42 Summary Ranking                  was 46 ("Summary Group Tallies")
--             43 Member Trait (trait average)     was 40
--             44 RSCA                             absent
--             45 Group Summary                    absent
--             46 First Recommendation   \         was 41 ("Career Recommendations")
--             47 Second Recommendation  /
--             48 Summary Group Breakdown          absent
--             49 Signature of Individual Evaluated was 51
--             51 Reporting Senior Address         was 48
--             52 Regular RS on Concurrent Report  absent
--   (50 Signature of Reporting Senior was the one number in the tail that was right.)
--   19 "Ops Cdr" — a printed Type-of-Report checkbox — was missing entirely.
--
-- Wrong label:
--   2  "Grade/Rate" -> the form prints "Rating";  3 "Designator/NEC" -> "Designation"
--   9  invented "Current Station/Vessel";  20 invented "(PFA Results)"
--   29 word order did not match the printed block
--
-- Invented form claim (the one that survives even after step 1):
--   20 note: "CPO PFA scores are incorporated into the Professionalism trait
--   (Block 34)." Block 34 is INSTITUTIONAL EXPERTISE, and 1616/27 prints no PFA
--   content in ANY trait. The instruction's actual block 20 rule for a CHIEFEVAL
--   is a date+category dropdown per PFA/CFA (the "PPP" string is FITREP/EVAL
--   only) with the cycle ID in block 29. The only place the instruction ties the
--   PFA to a trait is three failures in 4 years -> minimal marks in
--   "Military Bearing/Professionalism", which it cites as CHIEFEVAL block 35 —
--   independently confirming step 1's renumbering.
--   (The sibling label "Professionalism (incl. PFA)" on block 34 is already
--   overwritten by step 1, which replaces that block's name/label/category/note.)
--
-- Left alone on purpose:
--   Blocks 4 and 27 say "DoD ID Number" where the form prints SSN. That is an
--   APEX-wide substitution, not a claim about the form (001_initial_schema.sql:93
--   — "Synthetic only (NO PII)"). Same choice in the EVAL and FITREP rows.
--
-- SOURCE CONFLICT, recorded rather than resolved: 1610.10H Encl (2) ch. 1 calls
-- the CHIEFEVAL individual promotion recommendation "block 48" — but it also
-- calls the summary group breakdown block 48, and 1616/27 plainly prints
-- "41. Individual" under PROMOTION RECOMMENDATION and "48. Summary Group
-- Breakdown". The printed form wins; the note on block 41 carries the conflict so
-- nobody "corrects" it back.
--
-- Idempotent: blocks 19 and >= 40 are dropped from the existing array and
-- re-supplied whole, so a second run reproduces the same array exactly.
--
-- (Bad data, not bad pixels: nothing in the app renders `form_definitions.blocks`
--  — EvaluationForm uses `form_definition_id` for routing only and
--  Block33to39Traits hardcodes its own trait list. Corrected anyway, because a
--  row that describes a Navy form must describe the Navy form.)

UPDATE public.form_definitions f
SET blocks = jsonb_set(
  f.blocks
    || jsonb_build_object(
         'title', 'EVALUATION & COUNSELING RECORD (E7-E9)',
         'source', 'NAVPERS 1616/27 (REV 05-2025), as printed. Block-by-block guidance: BUPERSINST 1610.10H Encl (2) ch. 1.'
       ),
  '{blocks}',
  (
    SELECT jsonb_agg(m.elem ORDER BY m.num)
    FROM (
      -- kept blocks 1-39, with the mislabelled ones patched in place
      SELECT (b.elem ->> 'number')::numeric AS num,
             CASE WHEN c.patch IS NULL THEN b.elem ELSE b.elem || c.patch END AS elem
      FROM jsonb_array_elements(f.blocks -> 'blocks') AS b(elem)
      LEFT JOIN (
        VALUES
          (2,  $p${"name":"Rating","label":"Rating"}$p$::jsonb),
          (3,  $p${"name":"Designation","label":"Designation"}$p$::jsonb),
          (9,  $p${"label":"Date Reported"}$p$::jsonb),
          (12, $p${"name":"Detachment of Reporting Senior","label":"Detachment of Reporting Senior"}$p$::jsonb),
          (20, $p${"label":"Physical Readiness",
                   "note":"CHIEFEVAL: select the date and category for each official PFA/CFA conducted in the reporting period (1610.10H Encl (2) ch. 1, BLOCK 20 — the \"PPP\" string format is FITREP/EVAL only); specific PFA cycle ID information goes in Block 29, not here. NAVPERS 1616/27 prints no PFA content in any performance trait."}$p$::jsonb),
          (29, $p${"name":"Primary/Watch-standing Duties/Collateral","label":"Primary/Watch-standing Duties/Collateral"}$p$::jsonb)
      ) AS c(n, patch) ON (b.elem ->> 'number')::numeric = c.n
      WHERE (b.elem ->> 'number')::numeric < 40
        AND (b.elem ->> 'number')::numeric <> 19

      UNION ALL

      -- block 19 and the whole 40-52 tail, transcribed from the printed form
      SELECT (t.elem ->> 'number')::numeric, t.elem
      FROM jsonb_array_elements($t$[
        {"number":19,"name":"Ops Cdr","label":"Operational Commander","type":"checkbox","required":false,
         "note":"Third Type of Report checkbox printed on 1616/27 beside 17 Regular and 18 Concurrent."},
        {"number":40,"name":"Comments on Performance","label":"Reporting Senior Comments on Performance","type":"textarea","required":true,
         "note":"Printed on the form: \"All 1.0 marks and 2.0 marks in Block 33-39 must be specifically substantiated in comments. Comments must be verifiable.\" 1616/27 prints no pitch/case sentence (the EVAL and FITREP do). Qualifications and achievements go in this block — the CHIEFEVAL has no separate block for them."},
        {"number":41,"name":"Individual","label":"Promotion Recommendation: Individual","type":"enum","required":true,
         "options":["NOB","Significant Problems","Progressing","Promotable","Must Promote","Early Promote"],
         "note":"1610.10H Encl (2) ch. 1 refers to this as CHIEFEVAL \"block 48\" — but it uses block 48 for the summary group breakdown as well, and 1616/27 prints \"41. Individual\" under PROMOTION RECOMMENDATION. The printed form governs."},
        {"number":42,"name":"Summary Ranking","label":"Summary Ranking (n of n)","type":"text","required":true,
         "note":"Every member's ranking (hard breakout) within their competitive group (1610.10H Encl (2) ch. 1, CHIEFEVAL BLOCK 42)."},
        {"number":43,"name":"Member Trait","label":"Member Trait (individual trait average)","type":"computed","required":false,
         "note":"The individual trait average. Printed as Block 40 on the EVAL; on 1616/27 it is Block 43, labelled \"Member Trait\"."},
        {"number":44,"name":"RSCA","label":"RSCA","type":"computed","required":false},
        {"number":45,"name":"Group Summary","label":"Group Summary","type":"computed","required":false},
        {"number":46,"name":"First Recommendation","label":"Career Milestone Recommendations: First","type":"text","required":true,"maxLength":20,
         "note":"Maximum 20 characters and spaces. Do not leave blank — enter \"NA\" or \"NONE\" if no recommendation is appropriate."},
        {"number":47,"name":"Second Recommendation","label":"Career Milestone Recommendations: Second","type":"text","required":false,"maxLength":20,
         "note":"Maximum 20 characters and spaces. Not required. 1616/27 has no Retention block; Retention is EVAL 1616/26 Block 47 only."},
        {"number":48,"name":"Summary Group Breakdown","label":"Summary Group Breakdown","type":"text","required":true,
         "note":"Count of the member's summary group holding each promotion recommendation, across the five printed columns."},
        {"number":49,"name":"Signature of Individual Evaluated","label":"Signature of Individual Evaluated","type":"signature","required":true,
         "note":"Printed on the form: \"I have seen this report, been apprised of my performance, and understand my right to submit a statement.\" plus the intend / do not intend to submit a statement boxes."},
        {"number":50,"name":"Signature of Reporting Senior","label":"Signature of Reporting Senior","type":"signature","required":true},
        {"number":51,"name":"Reporting Senior Address","label":"Reporting Senior Address","type":"text","required":false},
        {"number":52,"name":"Signature of Regular Reporting Senior on Concurrent Report","label":"Typed name, grade, command, UIC, and signature of Regular Reporting Senior on Concurrent Report","type":"signature","required":false}
      ]$t$::jsonb) AS t(elem)
    ) AS m
  )
)
WHERE f.form_code = 'CHIEFEVAL'
  AND jsonb_typeof(f.blocks -> 'blocks') = 'array';
