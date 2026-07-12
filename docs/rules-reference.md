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
