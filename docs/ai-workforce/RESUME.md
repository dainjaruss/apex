# Resume state — 2026-07-30

## Merged to main (12)

| PR | What |
|----|------|
| #22 | LaDR "Considerations for advancement" transcription (80 rows) |
| #24 | Evidence gating on scored inputs + renderable narrative |
| #25 | Forced distribution E7–E9 + officers; per-block 2.0 count; citation corrections |
| #26 | Three invented/inverted Navy claims corrected; migration 010 |
| #27 | Retracted "any gap disqualifies" claim removed at the render boundary |
| #28 | Workforce docs + `docs/navy-reference.md` |
| #29 | Block 43 AI eval coach |
| #30 | profiles-RLS container flake fixed at its root |
| #31 | LaDR substance rendered in the checklist |
| #32 | Officer FITREP trait table → NAVPERS 1610/2; migration 011 |
| #33 | a11y gate no longer scans another worktree's app |
| #34 | CHIEFEVAL grades are numerals in cells, not X marks in columns |

## Hosted database — all steps done and verified

- **`board_analyses` cleared** (6 rows, all carrying the retracted "vote slates" disclaimer).
- **Migration 010 applied.** CHIEFEVAL `form_definitions`: 49 blocks with a gapped tail → **52,
  contiguous 1–52**; blocks 33–39 now the seven printed on 1616/27. 4 legacy rows purged.
- **Migration 011 applied.** FITREP row: EVAL trait names + fabricated `39.1` → the seven printed on
  1610/2. **6 records** had a phantom `work` grade removed, averages nulled, **6 audit rows** written
  preserving the removed grade and prior average.
- **LaDR seeded.** 53 auto-extracted milestones → **184 across 4 documents, 80 advancement
  considerations, all 80 carrying `notes` and `tier`.** `board_precepts` deliberately **0** — the
  seed split (#31) keeps the modeled `active: true` precept out, which is what makes #23's readiness
  fix hold. One casualty as predicted: `NELD-03`, an auto-extraction artifact absent from the real LaDR.
- Migration 009 (role escalation + DoD-ID exposure) still applied.

## Open — all work committed and pushed; a monthly spend limit stopped the agents

| PR | Branch / worktree | Where it stopped |
|----|-------------------|------------------|
| #23 | `feat/readiness-ui` @ `c610726` (`/srv/apex-p1-ui`) | All required items done and rebased. **Confirmation review died mid-run** at *"Confirmed a residual gap. Now the two Precept mutants."* — a residual gap it had not yet described. Re-run the confirmation. |
| #36 | `fix/comment-fit-per-form` @ `3ff1cc6` (`/srv/apex-p1-commentfit`) | **Rebased already.** Died at *"REQUIRED 1 — I need to measure the EVAL 17th line myself."* Four required items outstanding: settle EVAL 10-pitch (reviewer proved the form holds **17**, not 16, three ways); finish the CHIEFEVAL composition now #34 has landed; `docs/specs/brag-sheet.md:898-899` still exports `COMMENTS_MAX_LINES = 18`; `lib/commentFit.ts:176` false claim about the fallback. |
| #37 | `fix/rubric-arithmetic` @ `740734c` (`/srv/apex-p2-rubric`) | Complete and pushed. **Adversarial review never started** — all four lenses died on the spend limit before their first tool call. Re-run: `Workflow({scriptPath: "…/workflows/scripts/review-rubric-arithmetic-wf_03045b60-f83.js", resumeFromRunId: "wf_03045b60-f83"})`. |
| — | `fix/citation-semantic-gate` (`/srv/apex-p1-citationsem`) | **Never started** — worktree is at `main`, no commits. Brief is in the transcript. |

## The three biggest findings

**1. Every CHIEFEVAL PDF was a defaced form.** 1616/27 has **no grade checkbox grid** — a 300 dpi
census found 12 checkboxes on page 1 (header only) and 2 on page 2. Each trait is a numeric cell
pre-printed `0.0`. Main stamped X marks into the comments column: **0 of 7 grades in a box, 149 ink
blobs overprinting the form**, comments printed across Block 39's descriptions, four ISO dates below
the footer. #34: **7/7 in box, 0 blobs.**

**Root cause of the whole overlay family:** `lib/pdfOverlay.ts:286-296` wraps the EVAL overlay in a
page `translate(13, -11)`, so EVAL constants live in **pre-translate** space. `fitrepOverlay.ts` and
`chiefEvalOverlay.ts` both **import `pushGraphicsState` and `translate` and never call either** —
inherited the constants, dropped the calibration. Consequence: 1610/2 page 1 is 1616/26 page 1
shifted by exactly **(+1.9, +10.8)**, verified on five landmark clusters.

**2. `checkCommentFit` reports 18 lines for every form.** That is 1616/26's number. CHIEFEVAL Block
40 physically holds **8** at 10-pitch, 7 at 12-pitch. Validation returns `fit: true, maxLines: 18`,
the PDF renders 8, and 10 lines vanish from a signed record with no marker. Now AI-amplified:
`coach.ts:179` feeds `max_lines` into the model prompt as "the physical size of the block".
In build on `fix/comment-fit-per-form`.

**3. Brag Sheet autofill never worked in direct mode.** `Output.object()` resolves via `asSchema()`
with `useReferences: false`, so zod inlines a full copy of the block/item shapes into all seven keys.
`useReferences: true` → 3778 B → 2358 B, semantics byte-identical after dereferencing. **The schema
fix alone still fails 100%** — a full autofill is ~12k output tokens at 105–184 s against a 60 s
timeout.

## Still open, ranked

1. **`overall_score` is invisible, not fixed.** A strong record still computes **46.8 / band 25 /
   "Not competitive"** — `development` (a Navy COOL checklist) and `leadership` contribute
   full-confidence zeros. #23 removed the output surface; the arithmetic is untouched and persists.
   P2 rubric work.
2. `summary_groups` missing `uic`, `duty_status`, `billet_subcategory` — 3 of 9 Table 1-4
   discriminators never fire, including the Block 6 UIC guard that shipped as a feature. Fails open.
3. `rubric.ts` P2: `UNVERIFIED_MULT`/`esrFlags`, solo-group `P4 = 100`, `scoreLeadership` on an empty
   post-filter array.
4. `TRAIT_STANDARDS_LOOKUP` has no report-type dimension — officer rows render EVAL descriptor prose.
5. FITREP overlay page 1 is a deletion plus `translate(14.9, -0.2)`; page 2 needs ~15 fields measured.
6. Long field values overrun their cells and run off the CHIEFEVAL form (needs a truncation policy).
7. `bv.qualifications` is entered by CHIEFEVAL authors and rendered nowhere (1616/27 puts them in Block 40).
8. Generated PDFs are untagged, so screen readers read `0.0` then `4.0` per trait.
9. Pre-existing a11y: `.apex-wizard-nav-btn--done` 3.76:1; `.apex-narrative-gutter` 10px at 2.46:1.
10. ~38 remaining `docs/navy-reference.md` §8 items.

## Traps confirmed the hard way

- **Probe the shipped function.** curl 403s where undici succeeds.
- **Check the file on `main`, not a worktree.** I reported a fabricated-trait defect in `seed-e2e.ts`
  from `/srv/apex`, which sits on a branch predating the epic. #32 had already fixed it.
- **Verify finding *attribution*.** 9 of 10 adversarially-checked findings on #29 were refuted — real
  symptom, wrong owner.
- **Vacuous tests, five times**: an a11y fixture routing to the legacy component; a scan hitting an
  empty state; a "stray `work` grade" test that never added the key; a coach a11y test skipping green
  whenever the feature was hidden; and an authenticated a11y suite skipping entirely because a
  gitignored fixture was missing. The fifth reported **green on every CI run**.
- **A byte budget is the wrong guard for schema size** — counterexamples both ways (3699 B accepts,
  2426 B rejects). The provider's real limit was "40 parameters with type arrays or anyOf".
- `z.number().int()` makes Zod v4 emit safe-integer bounds the provider rejects.
