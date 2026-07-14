# APEX Post-MVP Implementation Plan
## CHIEFEVAL (NAVPERS 1616/27) + Officer FITREP (NAVPERS 1610/2)

**Branch:** `feat/chiefeval-fitrep`  
**Status:** In Development  
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

## 5. Remaining Work (Not Yet Implemented)

### Phase 6 — PDF Overlay (Priority: High)

The current `lib/pdfOverlay.ts` targets the NAVPERS 1616/26 blank only. CHIEFEVAL and FITREP require form-specific overlay renderers:

- **`lib/chiefEvalOverlay.ts`** — NAVPERS 1616/27 coordinate map (structurally identical to 1616/26; same coordinate grid, different printed trait labels on the blank). Requires the official 1616/27 blank PDF added to `public/forms/`.
- **`lib/fitrepOverlay.ts`** — NAVPERS 1610/2 coordinate map (different physical layout from 1616/26; new coordinate reverse-engineering required against the 1610/2 blank). Requires the official 1610/2 blank PDF added to `public/forms/`.
- **`lib/pdfOverlay.ts`** — Add dispatcher: `generateOverlayPdf()` routes to the correct overlay function by `form_code`.

**Blockers:** Official blank PDFs (NAVPERS 1616/27, NAVPERS 1610/2 Rev. 05-2025) must be added to `public/forms/` before overlay coordinates can be calibrated.

### Phase 7 — EvaluationForm UI Adaptation (Priority: High)

**`components/EvaluationForm.tsx`**

- Accept `formCode` prop (or derive from `initialData.report_type`).
- Conditionally render CPO trait labels vs. enlisted trait labels (Blocks 33–39 section).
- Hide Block 47 (Retention) for CHIEFEVAL and FITREP.
- Add a form-type badge/indicator to the form header.
- The 8th officer trait (`tactical_performance`) needs a new trait input row for FITREP.

### Phase 8 — Seed Data (Priority: Medium)

**`scripts/seed-e2e.ts`**

- Add 2–3 CHIEFEVAL test records for the existing Chief users (e.g., `rater.it@franklyn.dev` — ITC Alan Ray, E-7).
- Add 1–2 FITREP test records for the Reporting Senior users (e.g., `co.enterprise@franklyn.dev` — CDR Carl Jones, O-5).

### Phase 9 — Validation Engine Substantiation (Priority: Medium)

**`lib/validationEngine.ts` — Rule 10 (Block 43 Substantiation)**

- The current substantiation check reads from `traitBlockMap` (EVAL-only).
- Must be updated to use `activeTraitMap` so that CHIEFEVAL's `eo_climate` key triggers the correct substantiation warning when graded 2.0.

### Phase 10 — Rules Reference Documentation (Priority: Low)

**`docs/rules-reference.md`**

- Add a CHIEFEVAL section documenting the CPO-specific block rules and EO gate (Block 37).
- Add a FITREP section documenting the 8-trait layout and officer-specific policy constraints.

### Phase 11 — Summary Group Eligibility (Priority: Medium)

**`lib/summaryGroupEligibility.ts`**

- CHIEFEVAL summary groups are paygrade-segregated the same as EVAL (E-7, E-8, E-9 each form their own group).
- Verify that the existing `paygradeOf()` utility and the `enforce_summary_group_fields()` DB trigger handle CHIEFEVAL grades (`ITC`, `ITCS`, `ITCM`) correctly.
- FITREP: Officers do not use summary groups the same way; forced-distribution quotas apply differently. Review BUPERSINST 1610.10H Table 1-2 officer columns and add a `checkFitrepForcedDistribution()` variant if needed.

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
| `lib/chiefEvalOverlay.ts` | ⏳ Pending | Needs 1616/27 blank PDF |
| `lib/fitrepOverlay.ts` | ⏳ Pending | Needs 1610/2 blank PDF |
| `lib/pdfOverlay.ts` | ⏳ Pending | Add form-code dispatcher |
| `components/EvaluationForm.tsx` | ⏳ Pending | CHIEFEVAL/FITREP trait label rendering |
| `scripts/seed-e2e.ts` | ⏳ Pending | Chief + officer test records |
| `docs/rules-reference.md` | ⏳ Pending | CHIEFEVAL + FITREP rule sections |
| `lib/summaryGroupEligibility.ts` | ⏳ Pending | Review officer forced-distribution |

---

## 7. Testing Checklist (Pre-Merge)

- [ ] `ChiefEvalSchema.safeParse()` passes for valid CPO record, rejects invalid EO gate
- [ ] `FitrepSchema.safeParse()` passes for valid officer record with 8 traits
- [ ] `runFullValidation()` dispatches correctly for all three `report_type` values
- [ ] Form picker renders correct recommendation by paygrade (E-7 → CHIEFEVAL, LT → FITREP)
- [ ] Migration 003 applies cleanly against a fresh Supabase instance
- [ ] Export flow returns 501/not-yet-implemented for CHIEFEVAL/FITREP until PDF overlay is ready
- [ ] Existing EVAL Playwright tests still pass
