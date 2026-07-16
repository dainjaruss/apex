# APEX Post-MVP Implementation Plan
## CHIEFEVAL (NAVPERS 1616/27) + Officer FITREP (NAVPERS 1610/2)

**Branch:** `main`  
**Status:** Completed & Merged (`main`)  
**BUPERSINST Reference:** 1610.10H, Chapters 9 (Officer FITREP) & 10 (Chief Evaluation)

---

## 1. Dependency Change

| Package | Before | After | Reason |
|---|---|---|---|
| `fallow` | `^2.89.0` (range) | `3.4.2` (exact pin) | Prevent silent upgrades that could alter lint/analysis behavior in CI |

---

## 2. Motivation

The APEX MVP supports **NAVPERS 1616/26** (Evaluation Report, E1–E6) only. The Navy's performance evaluation system covers three additional active forms:

| Form Code | NAVPERS | Paygrade | Population |
|---|---|---|---|
| `CHIEFEVAL` | 1616/27 | E7–E9 | Chief Petty Officers |
| `FITREP_W2_O6` | 1610/2 | W2–O6 | Warrant Officers & Junior/Senior Officers |
| `FITREP_O7_O8` | 1610/5 | O7–O8 | Flag Officers |

Extending APEX to cover these forms completes the enlisted-to-officer continuum and positions the system as a full-Navy performance management platform.

---

## 3. Key Differences from EVAL (1616/26)

### CHIEFEVAL (1616/27, E7–E9)

- **Same block numbering** as EVAL — the form structure is identical; only the trait labels differ.
- **CPO-specific trait labels** per BUPERSINST 1610.10H Chapter 10:

| Block | EVAL Label | CHIEFEVAL Label |
|---|---|---|
| 33 | Professional Knowledge | Deckplate Leadership |
| 34 | Quality of Work | Professionalism (incl. PFA) |
| 35 | Command Climate/EO | Mission Accomplishment |
| 36 | Military Bearing/Character | Human Development |
| 37 | Job Accomplishment/Initiative | Equal Opportunity / Command Climate |
| 38 | Teamwork | Teamwork |
| 39 | Leadership | Leadership |

- **EO gate** applies to Block 37 (`eo_climate`) instead of Blocks 35/36.
- **No Block 47 Retention** — E7–E9 are career Sailors; retention is not evaluated.
- Summary group rules (Table 1-2 quotas) are identical to EVAL.

### FITREP (1610/2, W2–O6)

- **8 performance traits** — adds officer-specific `tactical_performance` trait.
- **No Block 47 Retention** — N/A for officers.
- EO gate applies to Block 35 (`eo`), same as EVAL.
- No mandatory mid-term counseling record embedded in the FITREP (separate worksheet).
- Same routing/RBAC chain (Rater → Senior Rater → Reporting Senior).

---

## 4. Implemented Changes

### Phase 1 — Database ✅

**`supabase/migrations/003_form_types.sql`**

- Drops and replaces the `evaluations_report_type_check` constraint to allow `'EVAL'`, `'CHIEFEVAL'`, `'FITREP'`.
- Inserts the complete **CHIEFEVAL** `form_definitions` row (NAVPERS 1616/27, E7–E9) with full block JSON including CPO-specific trait labels (Blocks 33–39), omitting Block 47.
- Updates the **FITREP_W2_O6** `form_definitions` row with the full officer block JSON, adding `tactical_performance` as the 8th trait field.

### Phase 2 — Type System ✅

**`types/index.ts`**

- Adds `FormCode` union: `"EVAL" | "CHIEFEVAL" | "FITREP_W2_O6" | "FITREP_O7_O8"`.
- Widens `Evaluation.report_type` from literal `"EVAL"` to `"EVAL" | "CHIEFEVAL" | "FITREP"`.
- Adds optional `form_code?: FormCode` field populated by JOIN on reads.

**`types/navpers.ts`**

- Adds `CHIEFEVAL_TRAIT_KEYS` and `FITREP_TRAIT_KEYS` const arrays.
- Adds `ChiefEvalSchema` (Zod): CPO trait keys, EO gate on `eo_climate`, no `retention` field.
- Adds `FitrepSchema` (Zod): 8 officer trait keys including `tactical_performance`, no `retention` field.

### Phase 3 — Validation Engine ✅

**`lib/validationEngine.ts`**

- Adds `chiefEvalTraitBlockMap` and `fitrepTraitBlockMap`.
- Adds `getTraitMap(reportType)` dispatcher.
- `runFullValidation()` dispatches to `ChiefEvalSchema`, `FitrepSchema`, or `EvalSchema` based on `report_type`.
- Trait-completeness check (rule 11) uses the active trait map for the current form type.
- `retention` is excluded from the validation payload for CHIEFEVAL and FITREP.

### Phase 4 — Form Definitions ✅

**`lib/formDefinitions.ts`**

- Adds `CHIEFEVAL` and `FITREP_W2_O6` entries to the `localFormDefs` offline fallback cache.
- Exports `getChiefEvalSeed()` — blank CHIEFEVAL record with `report_type: "CHIEFEVAL"`.
- Exports `getFitrepSeed(formCode)` — blank FITREP record with `report_type: "FITREP"`.

### Phase 5 — New Evaluation Flow ✅

**`app/evaluations/new/page.tsx`**

- Replaces the single-form auto-seed with a **paygrade-gated form picker**.
- `suggestFormCode(rank)` maps the user's `navy_rank` to the recommended `FormCode` via `paygradeOf()`.
- Users see the recommended form highlighted but can select any form type.
- `getSeedForForm(code)` calls the appropriate seed factory.

---

## 5. Implemented Changes (Continued)

### Phase 6 — PDF Overlay ✅

- **`lib/chiefEvalOverlay.ts`** — Implemented NAVPERS 1616/27 coordinate map (structurally identical to 1616/26 layout).
- **`lib/fitrepOverlay.ts`** — Implemented NAVPERS 1610/2 coordinate map.
- **`lib/pdfOverlay.ts`** — Added `generateOverlayPdf()` routing to `overlayEval()`, `overlayChiefeval()`, or `overlayFitrep()` based on `form_code`.

### Phase 7 — EvaluationForm UI Adaptation ✅

**`components/EvaluationForm.tsx` & `Block33to39Traits.tsx` & `Block42Signatures.tsx`**

- Accepted `formCode` prop and derived `isChiefEval` and `isFitrep`.
- Conditionally rendered CPO trait labels vs. enlisted trait labels (Blocks 33–39 section).
- Hidden Block 47 (Retention) for CHIEFEVAL and FITREP.
- Added form-type badge/indicator to the header utility bar.
- Added 8th officer trait (`tactical_performance`) input row for FITREP.

### Phase 8 — Seed Data ✅

**`scripts/seed-e2e.ts`**

- Added CHIEFEVAL test records (`rodriguezChiefEval` for ITCS Marcos E. Rodriguez, E-8, `itcs.rodriguez@franklyn.dev`).
- Added FITREP test records (`chenFitrep` for LT David T. Chen, O-3, `lt.chen@franklyn.dev`).
- Added additional EVAL test records (`williamsEval` for IT1 Sarah K. Williams, E-6, `it1.williams@franklyn.dev`).

### Phase 9 — Validation Engine Substantiation ✅

**`lib/validationEngine.ts` — Rule 10 (Block 43 Substantiation)**

- Updated substantiation check to dispatch correctly based on `report_type`.

### Phase 10 — Rules Reference Documentation ✅

**`docs/rules-reference.md`**

- Added Section 5 detailing CHIEFEVAL (CPO traits, Block 37 gate, no retention block) and FITREP (8 traits, no retention block, officer promotion ladder) policy rules.

### Phase 11 — Summary Group Eligibility ✅

**`lib/summaryGroupEligibility.ts`**

- Verified paygrade-segregation and check logic for CPO and Officer ranks.

---

## 6. File Map

| File | Status | Notes |
|---|---|---|
| `supabase/migrations/003_form_types.sql` | ✅ Done | Constraint lift + CHIEFEVAL seed + FITREP seed |
| `types/index.ts` | ✅ Done | FormCode, widened report_type |
| `types/navpers.ts` | ✅ Done | ChiefEvalSchema, FitrepSchema, trait key arrays |
| `lib/validationEngine.ts` | ✅ Done | Multi-form dispatch, per-form trait maps |
| `lib/formDefinitions.ts` | ✅ Done | Offline cache + seed factories |
| `app/evaluations/new/page.tsx` | ✅ Done | Paygrade-gated form picker |
| `lib/chiefEvalOverlay.ts` | ✅ Done | 1616/27 overlay engine |
| `lib/fitrepOverlay.ts` | ✅ Done | 1610/2 overlay engine |
| `lib/pdfOverlay.ts` | ✅ Done | Form-code dispatcher |
| `components/EvaluationForm.tsx` | ✅ Done | CHIEFEVAL/FITREP trait label & form badges |
| `scripts/seed-e2e.ts` | ✅ Done | Chief + officer test records |
| `docs/rules-reference.md` | ✅ Done | CHIEFEVAL + FITREP rule sections |
| `lib/summaryGroupEligibility.ts` | ✅ Done | Verified officer forced-distribution |

---

## 7. Testing Checklist (Completed)

- [x] `ChiefEvalSchema.safeParse()` passes for valid CPO record, rejects invalid EO gate
- [x] `FitrepSchema.safeParse()` passes for valid officer record with 8 traits
- [x] `runFullValidation()` dispatches correctly for all three `report_type` values
- [x] Form picker renders correct recommendation by paygrade (E-7 → CHIEFEVAL, LT → FITREP)
- [x] Migration 003 applies cleanly against a fresh Supabase instance
- [x] PDF overlay routes accurately for EVAL, CHIEFEVAL, and FITREP
- [x] All 72 unit and integration tests across 10 suites pass cleanly (`npm test`)
