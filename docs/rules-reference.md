# APEX Rules Reference Guide

## NAVPERS 1616/26 Enlisted Evaluation Rules Mapping

This document provides mapping, policy details, and reference citations for every Navy guideline validated by the APEX Evaluation Engine. Most rules are based on **BUPERSINST 1610.10H (EVALMAN)**; advancement and selection-board rules are **BUPERSINST 1430.16** — see [§0.3](#03-when-143016-governs-not-161010h).

---

## 0. Citation conventions and sources of record

### 0.1 How to cite the EVALMAN — and a correction

Earlier revisions of this file cited block rules as *"Chapter 1, Section 1-45"*, *"Section 1-33"*, and so on. **Those paragraph numbers do not exist.** The number after the dash was the NAVPERS **block** number, not a paragraph number.

The block instructions live in **Enclosure (2), chapter 1**, which contains exactly four paragraphs:

> `1-1. Purpose.` · `1-2. Instructions for Specific Blocks.` · `1-3. Preparing the Summary Letter.` · `1-4. Submission/Mailing Procedures.`

Every per-block rule sits under **para 1-2**, under a heading naming the block (e.g. `EVAL BLOCK 45 / [FITREP/CHIEFEVAL] BLOCK 48`), on Enclosure (2) pages `1-1` through `1-22`. Note also that *chapter 1 of the basic instruction* is titled "BASIC GUIDE FOR COMPLETING, PROCESSING, AND MAILING REPORTS" — it is not a block-instruction chapter in its own right.

**Correct form:** `BUPERSINST 1610.10H, Encl (2), ch. 1, para 1-2, "EVAL BLOCK <n>", p. 1-<pp>`.

All citations below have been rewritten to that form. Where a page number is given it was read off the extracted text layer of the instruction PDF.

### 0.2 Source editions of record

| Document | Edition | Note |
|---|---|---|
| BUPERSINST 1610.10H (EVALMAN) | **CH-2, 26 May 2026** | Current. Fetched from MyNavyHR 2026-07-29. |
| Bundled copy `my_tools/BUPERSINST 1610.10.pdf` | **CH-1, 16 Dec 2025** | ⚠️ **One change transmittal behind.** |
| BUPERSINST 1430.16 (Advancement Manual) | 1430.16H, 21 Jan 2026 | Governs advancement + the selection board. |

⚠️ **The bundled PDF is stale.** It carries Change Transmittal 1 (16 Dec 2025); the current instruction is **CH-2, 26 May 2026**. Re-download before treating the bundled file as the citation of record.

**What CH-2 actually changed.** CH-2's transmittal reads *"Revised enclosure 2, page 3-1 through 3-2a and 3-6 through 3-7a"* — i.e. **chapter 3 (Regular Reports) only**.

<details>
<summary>How this was verified (re-run this rather than trusting the claim)</summary>

Fetched 2026-07-29 with the app's own client — `undici` plus a browser `User-Agent`, as in `lib/boardConfidence/preceptFetch.ts`. **`curl` with a User-Agent alone gets a 403 from `mynavyhr.navy.mil`; the shipped fetch path gets a 200.** Source: `https://www.mynavyhr.navy.mil/Portals/55/Reference/Instructions/BUPERS/BUPERSINST%201610.10.pdf` — **174 pp., ModDate 1 Jun 2026, sha256 `5e71ca59…dc9058`**. That hash is a *timestamp of what was posted that day*, not a check: MyNavyHR re-posts the file (a previous fetch on the same day returned 173 pp., ModDate 27 May 2026), so a mismatch means "re-posted", not "tampered".

Comparison method: `pdftotext -layout` on both copies, split into pages, keyed by each page's own printed `<page> Enclosure (n)` footer, whitespace-normalized, compared page-for-page. 154 pages carry a matching label in both.

- **Substantive differences are confined to Encl (2) ch. 3** — pages `3-1`, `3-2`, `3-6`, `3-7`, plus `3-2a` and `3-7a` which exist only in CH-2. Exactly what the transmittal says.
- Eleven other pages differ **only by OCR noise** — both files are Adobe Paper Capture scans, so e.g. p. 1-16 renders the block heading `[FITREP/CHIEFEVAL]` as `IFITREP/CHIEFEVALI` in the bundled copy and drops it in the live one. Same underlying text, different scan.
- So **"byte-identical" is the wrong word** and was wrong before: the two PDFs differ in page count, page size, and OCR output. The accurate claim is *textually identical outside Encl (2) ch. 3*.
</details>

Consequences:

- Every citation in this file (Encl (1) para 13a, Encl (2) ch. 1 block rules, ch. 13 comments guidance, Tables 1-2/1-3/1-4) is textually identical in CH-1 and CH-2, so the bundled PDF remains accurate *for these rules*.
- Anything touching **report continuity, periodic-report requirements, or Regular-report periods** must use CH-2, not the bundled copy.

### 0.3 When 1430.16 governs, not 1610.10H

APEX cites 1610.10H throughout, but 1610.10H governs only **how a report is written**. It does **not** govern advancement or the selection board. Cite **BUPERSINST 1430.16** for:

| Topic | Instruction |
|---|---|
| Advancement eligibility, exam cycles, PMA computation | 1430.16, ch. 2–3 (PMA conversion table: para 308) |
| **Selection-board mechanics, what the board reads** | **1430.16, ch. 11** |
| Recording/priority of advancement recommendations | 1430.16 |
| Writing the report, trait grades, forced distribution, summary groups | 1610.10H |

The Block 45 → PMA conversion (Early Promote 4.0, Must Promote 3.8, Promotable 3.6, Progressing 3.4, Significant Problems 2.0) is **1430.16 para 308**, not 1610.10H. So is the rule that a Block 43 RSCA differing from NSIPS must yield to the **NSIPS ESR value** (1430.16 para 308 note 1).

---

## 1. Identity & Administrative Rules (Block 1 - 8)

### Block 1: Member Name

- **Rule:** Name must not be blank and must be formatted exactly as `LAST, FIRST MI` (spaces and suffixes allowed, no double commas).
- **Citation:** BUPERSINST 1610.10H, Encl (2), ch. 1, para 1-2, "BLOCK 1 NAME", p. 1-1.
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.member_name` regex validation).

### Block 2: Grade/Rate

- **Rule:** Grade/Rate must be provided, must match the rating worn on the report ending date, and must contain only letters and numbers (no special characters or spaces).
- **Citation:** BUPERSINST 1610.10H, Encl (2), ch. 1, para 1-2, "BLOCK 2 GRADE/RATE", p. 1-1 — "Enter the grade or rate the Service member is actually wearing on the ending date of the report."
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.grade_rate` regex validation).

### Block 4: DoD ID / SSN

- **Rule:** DoD ID must be exactly 10 digits. APEX restricts records to synthetic/test data and strictly prohibits PII (SSNs).
- **Citation:** BUPERSINST 1610.10H, Encl (2), ch. 1, para 1-2, "BLOCK 4", p. 1-2. (The 10-digit DoD ID in lieu of SSN is APEX's own PII policy, not an instruction requirement.)
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.dod_id` regex validation).

### Block 5: Duty/Competitive Status

- **Rule:** Duty Status is required and must match one of the standard Navy designations: T`, `TAR`, `INACT`, or `AT/ADOS`.
- **Citation:** BUPERSINST 1610.10H, Encl (2), ch. 1, para 1-2, "BLOCK 5 DUTY STATUS", p. 1-2. Block 5 is also a **summary-group discriminator** — Table 1-4: "For enlisted, group ACT and TAR together, group INACT, AT/ADOS separately."
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.duty_status` min length check).

### Block 6: UIC

- **Rule:** UIC must be exactly 5 alphanumeric characters.
- **Citation:** BUPERSINST 1610.10H, Encl (2), ch. 1, para 1-2, "BLOCK 6 UIC", p. 1-2.
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.uic` length restriction).

### Block 8: Promotion Status

- **Rule:** Status must be one of: `Regular`, `Frocked`, `Selected`, or `Spot`.
- **Citation:** BUPERSINST 1610.10H, Encl (2), ch. 1, para 1-2, "BLOCK 8 PROMOTION STATUS", p. 1-3.
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.promotion_status` min length check).

---

## 2. Chronological & Context Rules (Block 14 - 32)

### Blocks 14-15: Period of Report

- **Rule:** Period To (`period_to`) must not fall before Period From (`period_from`). Date fields must follow the ISO-8601 (`YYYY-MM-DD`) format locally.
- **Citation:** BUPERSINST 1610.10H, Encl (2), ch. 1, para 1-2, "BLOCKS 14-15 PERIOD OF REPORT", p. 1-4. (ISO-8601 storage is an APEX convention; the form prints YYMMMDD.)
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.superRefine` bounds evaluation).

### Block 30: Date Counseled

- **Rule:** Date Counseled must follow the official Navy date format `YYMMMDD` (e.g. `25JAN15`) or match standard counseling exceptions (`NOT REQ`, `NOT PERF`).
- **Citation:** BUPERSINST 1610.10H, Encl (2), ch. 1, para 1-2, "BLOCK 30 DATE COUNSELED", p. 1-13.
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.superRefine` regex testing).

---

## 3. Trait Ratings & Promotion Rules (Block 33 - 47)

### Block 33 - 39: Trait Performance Ratings

- **Rule:** Each of the 7 performance traits must contain a rating of `1.0`, `2.0`, `3.0`, `4.0`, `5.0`, or `NOB` (Not Observed).
- **Citation:** BUPERSINST 1610.10H, Encl (2), ch. 1, para 1-2, "BLOCKS 33-39 PERFORMANCE TRAITS", pp. 1-13 to 1-15.
- **Code Enforcement:** `types/navpers.ts` (`EvalSchema.trait_grades` enum enforcement).

### Block 40: Individual Trait Average

- **Rule:** The Individual Trait Average is dynamically calculated as the sum of all numeric trait grades divided by the number of graded traits. Trait ratings marked as `NOB` are excluded from the calculation.
- **Citation:** BUPERSINST 1610.10H, Encl (2), ch. 1, para 1-2, "EVAL BLOCK 40 INDIVIDUAL TRAIT AVERAGE", p. 1-15.
- **Code Enforcement:** `components/blocks/Block33to39Traits/Block33to39Traits.tsx` (Dynamic compute helper).

### Block 45: Promotion Recommendation Gating Rules

The Navy enforces strict policy restrictions on promotion recommendations based on individual trait performance:

The controlling paragraph, quoted verbatim so it can be checked:

> "A Promotable promotion recommendation allows **up to two traits, excluding Character or Equal Opportunity** to be assessed as Progressing (2.0) and still maintain an overall evaluation and promotion recommendation of Promotable. This means a member who receives one or two 2.0 trait grades cannot receive a promotion recommendation higher than Promotable. Command or Organizational Climate and Equal Opportunity (FITREP/EVAL) and Accountability (CHIEFEVAL) must be evaluated as **3.0 or higher** to maintain eligibility for advancement and receive a recommendation of Promotable. A recommendation of **Must Promote or Early Promote may not be assigned with any trait assessed as 2.0**. A **Promotable or higher recommendation may not be assigned with any trait graded 1.0**."

1.  **Rule (Trait Grade 1.0):** A grade of `1.0` in _any_ performance trait limits the final promotion recommendation to `Progressing` or `Significant Problems` (bars Promotable, Must Promote, or Early Promote).
2.  **Rule (Trait Grade 2.0 — cap):** One or two `2.0` grades cap the recommendation at `Promotable` (bar Must Promote and Early Promote).
3.  **Rule (Three or more 2.0s — bar).** ⚠️ *Previously missing from this document and from the code.* "Up to two traits … and still maintain … Promotable" means a **third** `2.0` bars `Promotable` outright, leaving only `Progressing` or `Significant Problems`. The p. 1-16 quote above is the whole basis, and is sufficient on its own.
4.  **Rule (Command Climate / EO and Character — single-mark bar):** A grade of `2.0` or lower in _Command Climate/EO_ or in _Military Bearing/**Character**_ limits the recommendation to `Progressing` or `Significant Problems`. This is the "excluding Character or Equal Opportunity" carve-out in rule 3: those two traits are barred at **one** 2.0, not three. Blocks are form-specific — EVAL: EO 35 / Character 36; FITREP: EO 34 / Character 35; CHIEFEVAL: **Accountability 37** (there is no separately-named EO trait on the CHIEFEVAL).
5.  **Rule (EO Minimum 3.0):** The _Command Climate/EO_ grade (CHIEFEVAL: _Accountability_) must be `3.0` or higher to receive a recommendation of `Promotable`, `Must Promote`, or `Early Promote`.

- **Citation:** BUPERSINST 1610.10H, Encl (2), ch. 1, para 1-2, "EVAL BLOCK 45 / [FITREP/CHIEFEVAL] BLOCK 48", pp. 1-16 to 1-17.
  - ⚠️ **Do not cite Encl (2) para 6-3 (p. 6-1) for rule 3.** It uses the same "three 2.0 trait grades" wording, but scoped to *"An Observed report with an 'NOB' promotion recommendation"* — a case rule 3 excludes. `lib/validationEngine.ts` says the same.
  - ⚠️ The previous citation, *"Chapter 1, Section 1-45 & EVALMAN Chapter 13"*, was wrong on both halves: **there is no paragraph 1-45** (see [§0.1](#01-how-to-cite-the-evalman--and-a-correction)), and chapter 13 is "Guidance for Comments" — it carries no promotion-recommendation gate.
- **Code Enforcement:** rules 1, 2, 4, 5 in `types/navpers.ts` (`refinePromotionRecommendation`); rule 3 in `lib/validationEngine.ts` (rule 12).

---

## 4. Monospace Comments Narrative (Block 43)

### Block 43: Comments on Performance

- **Rule:** Comment text must fit strictly within the physical boundaries of the comments block **on the form actually being written**. The block number and its capacity are both per form — the line count is *not* a shared constant:

  | Form | Comments block | 10-pitch (90 CPL) | 12-pitch (84 CPL) |
  |---|---|---|---|
  | NAVPERS 1616/26 (EVAL) | 43 | **17 lines** | **15 lines** |
  | NAVPERS 1616/27 (CHIEFEVAL) | 40 | **8 lines** | **7 lines** |
  | NAVPERS 1610/2 (FITREP) | 41 | **19 lines** | **18 lines** |

  - **10-Pitch:** Max 90 characters per line (CPL).
  - **12-Pitch:** Max 84 characters per line (CPL).
  - Continuation sheets are not accepted.
  - ⚠️ APEX previously enforced a flat **18 lines on all three forms**. 18 was the EVAL's figure and was wrong even there. On a CHIEFEVAL it is more than double the printed block, so an 18-line narrative passed validation, the reporting senior signed, and the printed 1616/27 showed 8 lines with no marker. Capacity now resolves through `getCommentCapacity(reportType, pitch)`; nothing may hardcode a line count.
- **Provenance — read this before citing the numbers.** The three figures have two different sources, and only one of them is the instruction:

  | Element | Source | Status |
  |---|---|---|
  | The 10-pitch / 12-pitch concept | **BUPERSINST 1610.10H, Encl (2), para 13-2a(1)**, p. 13-1, verbatim: *"NAVFIT98A reports with 10- or 12-pitch will still be accepted."* | ✅ Verified in the instruction |
  | No continuation sheets | **Encl (1), para 13a "Basic 'Do's and Don'ts.'"**, p. 9, verbatim: *"Continuation sheets and enclosures are not allowed, except…"* (the exceptions are member statements, flag endorsements, civilian/foreign letter reports, letter-extensions, and classified letter-supplements). Encl (2) states the same rule in **different wording** at para **13-2b(1)**, p. 13-2: *"Continuation sheets will not be accepted. Limit comments to the space on the form."* | ✅ Verified in the instruction |
  | **The per-form line counts · 90 CPL · 84 CPL** | ⚠️ **APEX's own measured constraint.** Measured off the blank forms in `public/`: each comment block's printed bounding rules are read out of that PDF's own content stream (all three forms stroke at 0.72 pt, so the box interior is the rule centreline ±0.36), together with the lowest **ink** of the instruction header the form prints inside the block. Capacity is then the number of lines whose **real ink** — the outline bounding boxes of the embedded `public/fonts/CourierPrime-Regular.ttf`, `+0.6909 em` above the baseline (backtick) and `−0.2002 em` below (`y`, `g`, `j`) — stays inside that clear region at the form's rendered size and leading, with line 1 clear of the header. **Not** the font's declared descender: that runs 0.2–0.4 pt optimistic on every form, and on the EVAL it was the difference between a positive and a negative margin. Full derivation for all three forms is in the `COMMENT_CAPACITY` comment in `lib/commentFit.ts`; `tests/unit/commentCapacity.test.ts` re-checks it by rendering real PDFs and reading the baselines back. | ❌ **Not in the instruction** |

  ⚠️ The previous citation attributed all three numbers to "Chapter 13". **They appear nowhere in the 171-page instruction** — targeted greps for `18 lines`, `90`/`84 characters`, `characters per line`, and `Courier` return a single hit, the pitch sentence quoted above. **The constraint is sound and must not be removed** — it is what makes the rendered PDF match the printed form — but it is an APEX measurement, not doctrine. Do not present it to a user as an instruction requirement. The blank forms in `public/` outrank this document: if they disagree, re-measure.
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

- **Trait keys (Blocks 33–39),** transcribed from `public/chiefEvalBlank.pdf` (REV 05-2025) — form categories COMPETENCY 33–34, CHARACTER 35–37, CULTURE 38–39:

  | Block | Trait | Key |
  |---|---|---|
  | 33 | Technical Mastery | `technical_mastery` |
  | 34 | Institutional Expertise | `institutional_expertise` |
  | 35 | Professionalism | `professionalism` |
  | 36 | Integrity | `integrity` |
  | 37 | **Accountability** (3.0 gate) | `accountability` |
  | 38 | Deckplate Leadership | `deckplate_leadership` |
  | 39 | Team Effectiveness | `team_effectiveness` |

  See `CHIEFEVAL_TRAIT_KEYS` and `chiefEvalTraitBlockMap`. **The string "Equal Opportunity" appears nowhere on 1616/27** — that is the instruction's wording for the FITREP/EVAL trait, not a CHIEFEVAL trait name (navy-reference §3.1).
- **Promotion gates:** Same 1.0 / 2.0 / Must-Early caps as EVAL, but the 3.0 advancement gate applies to **`accountability` (Block 37)** — 1610.10H Encl (2) ch. 1, p. 1-16: *"Command or Organizational Climate and Equal Opportunity (FITREP/EVAL) and **Accountability (CHIEFEVAL)** must be evaluated as 3.0 or higher…"*. There is no separate Bearing trait on CHIEFEVAL (`ChiefEvalSchema` + `refinePromotionRecommendation`).
- **Retention (Block 47):** Omitted from schema, UI (`Block42Signatures`), and validation payload.
- **Block 43 / 40 substantiation (1616/27 REV 05-2025 footnote):** **Every** 1.0 **and every** 2.0 in Blocks 33–39 must be substantiated in comments (stricter than enlisted EVAL). Implemented in `validationEngine.ts` rule 10.
- **Inline BUPERS:** `lib/bupersGuidelines.json` includes `trait_grades.*` keys for all CPO traits; trait anchor panels use `TRAIT_STANDARDS_LOOKUP` in `lib/traitStandards.ts`.
- **Tests:** `tests/unit/validationEngine.chiefFitrep.test.ts`, `tests/unit/navyDoctrinePins.test.ts` (pins the seven traits, their block numbers, and every consumer)

### Officer FITREP (NAVPERS 1610/2, Paygrade W2–O6)

- **Trait blocks: the FITREP has SEVEN, not eight.** ⚠️ This document previously said "Seven enlisted-style traits plus `tactical_performance` (**8 total**)". **That is wrong.** NAVPERS 1610/2 REV 05-2025 prints seven trait blocks, 33–39, and their labels are *not* the EVAL's:

  | Blk | FITREP (1610/2) | EVAL (1616/26) — for contrast |
  |---|---|---|
  | 33 | PROFESSIONAL EXPERTISE | PROFESSIONAL KNOWLEDGE |
  | 34 | **COMMAND OR ORGANIZATIONAL CLIMATE** | QUALITY OF WORK |
  | 35 | MILITARY BEARING/CHARACTER | **COMMAND OR ORGANIZATIONAL CLIMATE** |
  | 36 | TEAMWORK | MILITARY BEARING/CHARACTER |
  | 37 | MISSION ACCOMPLISHMENT | PERSONAL JOB ACCOMPLISHMENT/INITIATIVE |
  | 38 | LEADERSHIP | TEAMWORK |
  | 39 | TACTICAL PERFORMANCE | LEADERSHIP |

  `tactical_performance` is **Block 39**, the seventh trait — not an "8th trait" bolted onto the EVAL's seven. The block map in `lib/validationEngine.ts` (`fitrepTraitBlockMap`) has the seven block numbers right.

  🔴 **Known open defect — APEX still carries the 8-trait assumption in code.** `FITREP_TRAIT_KEYS` (`types/navpers.ts`) lists **eight** keys because it keeps a legacy `work` key alongside `eo`, and `fitrepTraitBlockMap` maps **both to Block 34**. Consequences, none of them fixed here:
  - `components/blocks/Block33to39Traits/Block33to39Traits.tsx` renders **8** trait inputs for a FITREP, labelled with the **EVAL's** trait names and block numbers, plus "Tactical Performance (Officer 8th Trait)".
  - `computeTraitAverage` (`lib/traitAverage.ts`) therefore divides an officer's Block 40 trait average by **8**, double-counting Block 34.
  - `validationEngine.ts` rule 11 demands a grade for the phantom `work` trait on every FITREP.
  - `lib/fitrepOverlay.ts:147` comments `tactical_performance` as the "Officer 8th trait".

  Fixing this spans `types/navpers.ts`, `lib/traitAverage.ts`, `lib/traitStandards.ts`, `lib/fitrepOverlay.ts`, `lib/navfit98/constants.ts` and the trait component, so it is tracked here rather than patched piecemeal. **Until it is fixed, APEX's officer FITREP trait average is not the form's trait average.**
- **EO/climate block:** substantiation references **Block 34** (`fitrepTraitBlockMap.eo = 34`).
- **Block 3 designator:** Required **four-digit** officer designator (`FitrepSchema` / `refineOfficerDesignator`). Empty designator does not produce an enlisted-style warning.
- **Promotion gates:** EO (**Block 34** label in messages) and Bearing/Character (**Block 35**) both gate Promotable-or-higher, matching Chapter 9 policy (`refinePromotionRecommendation` with `bearingKey: "bearing"`).
- **Retention (Block 47):** Omitted (same as CHIEFEVAL).
- **Block 43 substantiation (1610/2 footnote):** 1.0 marks, **three or more** 2.0 marks, and any **2.0 in Block 34** (climate/EO) — same pattern as EVAL but with officer block numbers in messages.
- **Narrative limits:** Monospace dual-pitch (10-pitch 90 CPL / 12-pitch 84 CPL) via `checkCommentFit`, with the line count resolved per form by `getCommentCapacity`. 1610/2 Block 41 holds **19 lines at 10-pitch, 18 at 12-pitch** — not the EVAL's 17/15 and not the CHIEFEVAL's 8/7. APEX-measured, see [§4 provenance](#block-43-comments-on-performance).
- **Tests:** `tests/unit/validationEngine.chiefFitrep.test.ts`

### UI behavior (parity with EVAL)

- `useLiveValidation` / `useFinalValidation` call `runFullValidation` on every change / Verify Rules.
- `EvaluationForm` shows errors only on touched+blurred fields until Save/Verify (`revealAllErrors`).
- Summary group attach preserves `report_type` (no longer forced to `EVAL`).
- `ValidationResultsModal` groups issues by block category with BUPERSINST 1610.10H subtitle.

---

## 6. Summary Groups & Forced Distribution (Blocks 45–46)

### 6.1 Summary-group membership — Table 1-4 (enlisted), Table 1-3 (officer)

⚠️ **Table 1-3 is the OFFICER table (W-1 through O-6); Table 1-4 is the ENLISTED table (E-1 through E-9).** Code and docs previously cited 1-3 for the enlisted NOB-exclusion rule; that was wrong. Both tables carry the same NOB sentence, so the rule was right and the citation was not.

Enlisted reports group together only when **all** of these match (Table 1-4, p. 1-22):

| Blk | Label | Remark (verbatim) |
|---|---|---|
| 2 | Rate | "Group by current paygrade, regardless of rating." |
| **5** | **Duty/Competitive Status** | **"For enlisted, group ACT and TAR together, group INACT, AT/ADOS separately."** |
| 6 | UIC | RSs with several UICs may group together; else Block 6 matches the RS's primary UIC in Block 26 |
| 8 | Promotion Status | "Group by promotion status." |
| 15 | To | "Group by ending date of report." |
| 17-18 | Type of Report | "Group by type of report." |
| **21** | **Billet** | **"Group by entry in this block."** |
| 22 | Reporting Senior | "Group by reporting senior." |
| 45EV / 48CE | Promotion Recommendation | "Must have Observed promotion recommendation. **Do not include NOB promotion recommendations in a summary group.**" |

Officers (Table 1-3, p. 1-19) additionally group by **Block 3 designator** (competitive-designator category) and group **strictly by the Block 5 box marked** — *"Active, TAR, and INACT officers are separated in different summary groups by the entry in block 5"* — i.e. **no ACT/TAR merge for officers.**

- **Code Enforcement:** `lib/summaryGroupEligibility.ts` (`isEvalEligibleForSummaryGroup`, `dutyStatusBucket`).
- **Migration 012** added the three missing columns — `uic`, `duty_status`, `billet_subcategory` — that migration 002 never defined, so the guards written for them could not fire. Blocks 5 and 21 are now enforced **unconditionally**, as both tables state them. The create-group form (`app/summary-groups/page.tsx`) collects all three, and the migration also widened the group uniqueness constraint to include them — without that, a reporting senior with both ACT and INACT E-5s for one period could not create the second group the guard now requires.
- **Block 21 is never blank.** Encl (2) ch. 1, **p. 1-7**, BLOCK 21: *"Select or enter the billet subcategory code, if authorized, or enter **"NA."** **Do not leave blank.**"* Table 1-1 (p. 1-8) defines `NA` as *"Subcategories not used. (Should appear in most reports.)"* The form's *"(if any)"* qualifies whether a subcategory **applies**, not whether the block may be empty — a blank Block 21 is a form defect, not a grouping bucket. `types/navpers.ts` already enforced this with `.min(1)`; migration 012 adds the matching `<> ''` check and the create-group form offers no blank option, because a group holding `''` would be one **nothing could ever join**.
- **Block 6 UIC stays conditional, and that is the instruction, not a gap.** Table 1-4's remark is permissive — *"If reporting seniors have more than one UIC, but desire to group all enlisted personnel together, they may do so"* — and Table 1-3 has **no Block 6 row at all**. An unset UIC means "not splitting by UIC."
- **Pre-012 rows:** the 12 groups already on the hosted database have `null` Block 5 / Block 21 and remain unrestricted on both, because their reporting senior never stated either value. Backfilling from current members was rejected — a group's Block 5/21 is the RS's declaration of what the group is *for*, and inferring it from whoever is in it would invent a rule the instruction does not contain.
- ⚠️ **Block 3 designator is still not modelled, and fails open for officer groups.** The discriminator is the competitive **category**, not the literal designator (pp. 1-19..1-21 map `11xx/13xx/19xx` to one URL category), so guarding on the four digits would split 1110 from 1310 and cause **false rejections**. The category list also cannot be applied from Block 3 alone: `61xx` appears under both *"Reserve Limited Duty Officer/Warrant Officer — Officer (Line) (61xx/62xx/63xx/64xx)"* and *"Active Limited Duty Officer — Surface (61xx)"*, and the instruction never states the rule that picks between them. Consequence: two officer groups differing only by competitive category are indistinguishable, so an officer may be offered a group they do not belong in. This is **not** the same gap as §6.2's LDO/non-LDO O-1/O-2 fail-open, which needs the *member's* designator (already on `evaluations.designator`), not the group's.

### 6.2 Forced distribution — Table 1-2

Encl (2), ch. 1, para 1-2, p. 1-17, verbatim:

> "**Early Promote** (all paygrades except non-LDO O-1 and O-2…). – **Twenty percent** of each summary group (rounded up to nearest whole number)."
>
> "**Early Promote and Must Promote Combined** (percent of summary group, rounded up to nearest whole number): E1-E4 – No limit · E5-E6 – 60% · E7-E9 – 50% · W1-W2 – No limit · W3-W5 – 50% · LDO O1-O2 – No limit · O3 – 60% · O4 – 50% · O5-O6 – 40%"

| Band | EP cap | EP+MP combined cap |
|---|---|---|
| E1–E4 | 20% | **No limit** |
| E5–E6 | 20% | **60%** |
| **E7–E9** | 20% | **50%** |
| W1–W2 | 20% | **No limit** |
| W3–W5 | 20% | **50%** |
| LDO O1–O2 | 20% | **No limit** |
| O3 | 20% | **60%** |
| O4 | 20% | **50%** |
| O5–O6 | 20% | **40%** |

- `EP max = ceil(0.20 · N)`; `MP max = ceil(cap · N) − ceil(0.20 · N)`; `N` = observed (non-NOB) group size. This reproduces all 30 rows of Table 1-2 — asserted row-by-row in `tests/unit/forcedDistribution.test.ts`.
- **Note 1 (p. 1-18), the one genuine special case:** *"All summary groups of two can receive one Early Promote and Must Promote."* At `N=2` the 50% and 40% tiers otherwise yield a combined max of 1.
- **Note 2's** Must-Promote declines at N=6/16/26 in the 50% tier need no special case; they fall out of the arithmetic.
- **Promotable is never capped.** The p. 1-17 "Upper Limits" section quoted above sets ceilings on *Early Promote* and on *Early Promote + Must Promote Combined* only — Promotable appears in neither, for any band. (Do **not** cite Table 1-2's "No Limit" cell for this: that column is headed `Promotable / O1-O2 (ALL EXCEPT LDO)`, so the cell is the non-LDO O-1/O-2 entry, not a general statement.)
- **Not modelled, and this gap fails OPEN:** the LDO / non-LDO O-1/O-2 split. Non-LDO O-1/O-2 *"are prohibited from receiving a promotion recommendation higher than Promotable"* (p. 1-16, note 2) — Table 1-2 accordingly lists them under the Promotable column only and omits them from the Early Promote column header (`E1-E9 / LDO O1-O2 / W1-W5 / O3-O6`). Distinguishing them needs the Block 3 designator, which `checkForcedDistribution` is not given, so O-1/O-2 are treated as the LDO case: **a non-LDO ENS/LTJG summary group is handed `earlyPromoteMax = ceil(0.2N)` and is reported compliant while taking Early Promote and Must Promote marks the instruction prohibits outright.** A deliberate false negative — guessing the designator would produce false rejections — that closes only when the caller passes Block 3 down.
- **Code Enforcement:** `lib/forcedDistribution.ts` (`COMBINED_CAP_BY_PAYGRADE`, `checkForcedDistribution`).

