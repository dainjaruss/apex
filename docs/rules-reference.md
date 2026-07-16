# APEX Rules Reference Guide

## NAVPERS 1616/26 Enlisted Evaluation Rules Mapping

This document provides mapping, policy details, and reference citations for every Navy guideline validated by the APEX Evaluation Engine. All rules are based on **BUPERSINST 1610.10H (EVALMAN)**.

---

## 1. Identity & Administrative Rules (Block 1 - 8)

### Block 1: Member Name

- **Rule:** Name must not be blank and must be formatted exactly as `LAST, FIRST MI` (spaces and suffixes allowed, no double commas).
- **Citation:** BUPERSINST 1610.10H, Chapter 1, Section 1-1 (Instructions for Block 1).
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.member_name` regex validation).

### Block 2: Grade/Rate

- **Rule:** Grade/Rate must be provided, must match the rating worn on the report ending date, and must contain only letters and numbers (no special characters or spaces).
- **Citation:** BUPERSINST 1610.10H, Chapter 1, Section 1-2 (Instructions for Block 2).
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.grade_rate` regex validation).

### Block 4: DoD ID / SSN

- **Rule:** DoD ID must be exactly 10 digits. APEX restricts records to synthetic/test data and strictly prohibits PII (SSNs).
- **Citation:** BUPERSINST 1610.10H, Chapter 1, Section 1-4.
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.dod_id` regex validation).

### Block 5: Duty/Competitive Status

- **Rule:** Duty Status is required and must match one of the standard Navy designations: T`, `TAR`, `INACT`, or `AT/ADOS`.
- **Citation:** BUPERSINST 1610.10H, Chapter 1, Section 1-5.
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.duty_status` min length check).

### Block 6: UIC

- **Rule:** UIC must be exactly 5 alphanumeric characters.
- **Citation:** BUPERSINST 1610.10H, Chapter 1, Section 1-6.
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.uic` length restriction).

### Block 8: Promotion Status

- **Rule:** Status must be one of: `Regular`, `Frocked`, `Selected`, or `Spot`.
- **Citation:** BUPERSINST 1610.10H, Chapter 1, Section 1-8.
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.promotion_status` min length check).

---

## 2. Chronological & Context Rules (Block 14 - 32)

### Block 14/15: Period of Report

- **Rule:** Period To (`period_to`) must not fall before Period From (`period_from`). Date fields must follow the ISO-8601 (`YYYY-MM-DD`) format locally.
- **Citation:** BUPERSINST 1610.10H, Chapter 1, Section 1-14/15.
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.superRefine` bounds evaluation).

### Block 30: Date Counseled

- **Rule:** Date Counseled must follow the official Navy date format `YYMMMDD` (e.g. `25JAN15`) or match standard counseling exceptions (`NOT REQ`, `NOT PERF`).
- **Citation:** BUPERSINST 1610.10H, Chapter 1, Section 1-30.
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.superRefine` regex testing).

---

## 3. Trait Ratings & Promotion Rules (Block 33 - 47)

### Block 33 - 39: Trait Performance Ratings

- **Rule:** Each of the 7 performance traits must contain a rating of `1.0`, `2.0`, `3.0`, `4.0`, `5.0`, or `NOB` (Not Observed).
- **Citation:** BUPERSINST 1610.10H, Chapter 1, Section 1-33.
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.trait_grades` enum enforcement).

### Block 40: Individual Trait Average

- **Rule:** The Individual Trait Average is dynamically calculated as the sum of all numeric trait grades divided by the number of graded traits. Trait ratings marked as `NOB` are excluded from the calculation.
- **Citation:** BUPERSINST 1610.10H, Chapter 1, Section 1-40.
- **Code Enforcement:** `components/blocks/Block33to39Traits/Block33to39Traits.tsx` (Dynamic compute helper).

### Block 45: Promotion Recommendation Gating Rules

The Navy enforces strict policy restrictions on promotion recommendations based on individual trait performance:

1.  **Rule (Trait Grade 1.0):** A grade of `1.0` in _any_ performance trait limits the final promotion recommendation to `Progressing` or `Significant Problems` (bars Promotable, Must Promote, or Early Promote).
2.  **Rule (Trait Grade 2.0):** A grade of `2.0` in _any_ performance trait limits the final promotion recommendation to `Promotable` or lower (bars Must Promote or Early Promote).
3.  **Rule (Command Climate / EO):** A grade of `2.0` or lower in _Command Climate/EO_ (Block 35) or _Military Bearing/Character_ (Block 36) limits the final promotion recommendation to `Progressing` or `Significant Problems`.
4.  **Rule (EO Minimum 3.0):** The _Command Climate/EO_ grade must be `3.0` or higher to receive a recommendation of `Promotable`, `Must Promote`, or `Early Promote`.

- **Citation:** BUPERSINST 1610.10H, Chapter 1, Section 1-45 & EVALMAN Chapter 13.
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.superRefine` conditional assertions).

---

## 4. Monospace Comments Narrative (Block 43)

### Block 43: Comments on Performance

- **Rule:** Comment text must fit strictly within the physical boundaries of Block 43 on the NAVPERS 1616/26 sheet. Using a monospace Courier New font, the capacity is capped at exactly **18 lines** under:
  - **10-Pitch:** Max 90 characters per line (CPL).
  - **12-Pitch:** Max 84 characters per line (CPL).
  - Continuation sheets are not accepted.
- **Citation:** BUPERSINST 1610.10H, Chapter 13.
- **Code Enforcement:** `lib/commentFit.ts` (Monospace text wrapper and limit check).

---

## 5. NAVPERS 1616/27 (CHIEFEVAL) & NAVPERS 1610/2 (FITREP) Policy Mapping

Both forms use the **same validation pipeline** as EVAL: `runFullValidation()` in `lib/validationEngine.ts` dispatches to `ChiefEvalSchema` or `FitrepSchema` in `types/navpers.ts`, then applies shared cross-field rules (occasion/type, narrative fit, summary billet warnings, trait completeness, and form-specific Block 43 substantiation).

### Shared administrative rules (Blocks 1–32)

| Rule | CHIEFEVAL / FITREP enforcement |
|------|--------------------------------|
| Blocks 1–8 identity | Same Zod field rules and block-tagged messages as `EvalSchema` |
| Block 9 Date Reported | ISO date, valid calendar, not in the future (`refineDateReported`) |
| Blocks 14–15 period order | Period To ≥ Period From |
| Block 20 PFA codes | `PBFMWN` only, oldest-to-most-recent |
| Block 21 billet subcategory | Table 1-1 codes; starred ↔ Block 29 warning |
| Blocks 22–27 reporting senior | RS name/grade/title/UIC/DoD ID; Block 24 designator pattern |
| Blocks 28–29 narratives | `FIELD_FIT` line wrap (same canvas/PDF algorithm as EVAL) |
| Blocks 30–31 counseling | ISO / YYMMMDD / `NOT REQ` / `NOT PERF`; counselor max 22 chars |
| Blocks 10–13 / 16–18 | Occasion and type multi-select (same engine rules as EVAL) |

### CHIEFEVAL (NAVPERS 1616/27, Paygrade E7–E9)

- **Trait keys (Blocks 33–39):** `deckplate_leadership`, `professionalism`, `mission_accomplishment`, `human_development`, `eo_climate`, `teamwork`, `leadership` — see `CHIEFEVAL_TRAIT_KEYS` and `chiefEvalTraitBlockMap`.
- **Promotion gates:** Same 1.0 / 2.0 / Must-Early caps as EVAL, but EO gate applies only to **`eo_climate` (Block 37)** — there is no separate Bearing trait on CHIEFEVAL (`ChiefEvalSchema` + `refinePromotionRecommendation`).
- **Retention (Block 47):** Omitted from schema, UI (`Block42Signatures`), and validation payload.
- **Block 43 / 40 substantiation (1616/27 REV 05-2025 footnote):** **Every** 1.0 **and every** 2.0 in Blocks 33–39 must be substantiated in comments (stricter than enlisted EVAL). Implemented in `validationEngine.ts` rule 10.
- **Inline BUPERS:** `lib/bupersGuidelines.json` includes `trait_grades.*` keys for all CPO traits; trait anchor panels use `TRAIT_STANDARDS_LOOKUP` in `lib/traitStandards.ts`.
- **Tests:** `tests/unit/validationEngine.chiefFitrep.test.ts`

### Officer FITREP (NAVPERS 1610/2, Paygrade W2–O6)

- **Trait keys:** Seven enlisted-style traits plus **`tactical_performance`** (8 total). Block map follows 1610/2 REV 05-2025: EO/climate substantiation references **Block 34** (`fitrepTraitBlockMap.eo = 34`).
- **Block 3 designator:** Required **four-digit** officer designator (`FitrepSchema` / `refineOfficerDesignator`). Empty designator does not produce an enlisted-style warning.
- **Promotion gates:** EO (**Block 34** label in messages) and Bearing/Character (**Block 35**) both gate Promotable-or-higher, matching Chapter 9 policy (`refinePromotionRecommendation` with `bearingKey: "bearing"`).
- **Retention (Block 47):** Omitted (same as CHIEFEVAL).
- **Block 43 substantiation (1610/2 footnote):** 1.0 marks, **three or more** 2.0 marks, and any **2.0 in Block 34** (climate/EO) — same pattern as EVAL but with officer block numbers in messages.
- **Narrative limits:** Monospace 18-line dual-pitch (10-pitch 90 CPL / 12-pitch 84 CPL) via `checkCommentFit` (all report types).
- **Tests:** `tests/unit/validationEngine.chiefFitrep.test.ts`

### UI behavior (parity with EVAL)

- `useLiveValidation` / `useFinalValidation` call `runFullValidation` on every change / Verify Rules.
- `EvaluationForm` shows errors only on touched+blurred fields until Save/Verify (`revealAllErrors`).
- Summary group attach preserves `report_type` (no longer forced to `EVAL`).
- `ValidationResultsModal` groups issues by block category with BUPERSINST 1610.10H subtitle.

