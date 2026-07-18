# NAVFIT 98A Export — Field-Mapping Specification

APEX evaluation → NAVFIT 98A Access database (.accdb, ACE 2007 format).

**Verified against**: `navfit-schema.json` + `navfit-rows.json` (mdb-reader/jackcess dumps of the golden `juniorEnlisted.accdb`, `/srv/apex/my_tools/navfit/juniorEnlisted.accdb`), the Access Documenter output (`rptobjects-doc.txt`), the NAVFIT98A v30 User's Manual, and the navfit99-js open-source reimplementation (block→column maps, radio-index encoding). APEX side verified against `/srv/apex/types/navpers.ts`, `/srv/apex/lib/validationEngine.ts`, `/srv/apex/lib/pdfOverlay.ts`, `/srv/apex/lib/signatures.ts`.

All column names below are copied verbatim from the golden schema (case-sensitive). Column counts: **Folders 71, Reports 126, Summary 6** (confirmed).

---

## 0. File-level construction

| Item | Value |
|---|---|
| File format | ACE 2007 `.accdb` (golden: AccessVersion 09.50, Version 12.0). Clone the golden table schemas **verbatim** — column names, types, char sizes, order — not the older navfit99-js shape (golden adds FirstName/MI/LastName/Suffix, RS name splits, Counseler splits, PhysicalReadiness2/Dt, RSAddress splits, RRS*, `Standards`, `IsValidated`). |
| Tables | Exactly three: `Folders`, `Reports`, `Summary`. |
| Indexes | One per table, named `PrimaryKey` (Primary, Unique, Required, Ascending): `Folders.FolderID`, `Reports.ReportID`, `Summary.ProfileName`. **No other indexes, no relationships/FKs.** |
| AutoNumber seeding | `FolderID` and `ReportID` are AutoNumber (Long) — the writer must supply explicit values: `FolderID = 1` (Root), `ReportID` sequential from 1. |
| Folder linkage | `Reports.Parent` (Short Text 12) = literal `"a "` + FolderID — golden value is `"a 1"` (lowercase `a`, one space). String match is the **only** linkage; a wrong value silently hides the report in NAVFIT (no error). |
| Batch support | One `.accdb` may carry one report or many (NAVFIT File > Import Data copies a selected folder plus all reports under it). APEX exports all reports under the single Root folder. |
| Text sizes | All "size" limits below are Access **character** sizes (mdb-reader's `size` is UTF-16 bytes = 2×). |

---

## 1. Reports table — all 126 columns

**APEX source** = field name in the canonical flattened payload produced by `runFullValidation` (`lib/validationEngine.ts:120-170`), which merges `evaluations` columns and `block_values` jsonb under Zod schema field names. Reuse that payload as mapper input.

**Encoding key**: `text(n)` = Short Text, n chars, write `""` (zero-length) not NULL when the golden-row pattern says so; `memo` = Long Text; `date` = Access Date With Time (OLE date, midnight); `bit` = Yes/No, **0 = No / -1 = Yes, never NULL**; `int16`/`int32` = Integer/Long; `dec(3,2)` = Decimal precision 3 scale 2.

**"Empty" column** = what to write when APEX has no value. Policy: reproduce the golden-row byte pattern — legacy (1998-era) text/memo fields get `""`, post-1998 split/addition fields get `NULL`, booleans get `0`.

| # | Column | Type (size) | APEX source | Transform | Req | Empty |
|---|--------|-------------|-------------|-----------|-----|-------|
| 0 | `Parent` | text(12) | — (generated) | `"a " + FolderID` of containing folder; single Root folder → always `"a 1"` | yes | — |
| 1 | `ReportID` | int32 AutoNumber PK | — (generated) | Sequential 1, 2, 3… per file | yes | — |
| 2 | `ReportType` | text(15) | `report_type` | `EVAL`→`"Eval"`, `FITREP`→`"FitRep"`, `CHIEFEVAL`→`"Chief"` (see §5) | yes | — |
| 3 | `FullName` | text(27) | `member_name` | Verbatim `LAST, FIRST MI` string; **must be ≤27** (validate, do not truncate silently) | yes | `""` |
| 4 | `FirstName` | text(27) | `member_name` | Parsed: text after first comma, minus trailing 1-char MI token (see §4.6) | no | `NULL` |
| 5 | `MI` | text(3) | `member_name` | Parsed: trailing whitespace-separated token of length 1 after the comma, else empty | no | `NULL` |
| 6 | `LastName` | text(27) | `member_name` | Parsed: text before first comma | no | `NULL` |
| 7 | `Suffix` | text(10) | — | APEX name regex captures no suffix — **leave NULL** | no | `NULL` |
| 8 | `Rate` | text(5) | `grade_rate` | Verbatim; validate ≤5 | yes | `""` |
| 9 | `Desig` | text(12) | `designator` | Verbatim (FITREP: 4-digit officer designator) | FITREP only | `""` |
| 10 | `SSN` | text(9) | — | **Leave NULL.** APEX stores 10-digit DoD ID (`dod_id`), no SSN; 10 digits do not fit 9 chars. See Gaps/§8. | no | `NULL` |
| 11 | `Active` | bit | `duty_status` | `-1` if `"ACT"`, else `0` | yes | `0` |
| 12 | `TAR` | bit | `duty_status` | `-1` if `"TAR"`, else `0` | yes | `0` |
| 13 | `Inactive` | bit | `duty_status` | `-1` if `"INACT"`, else `0` | yes | `0` |
| 14 | `ATADSW` | bit | `duty_status` | `-1` if `"AT/ADOS"`, else `0` (NAVFIT label AT/ADSW) | yes | `0` |
| 15 | `UIC` | text(5) | `uic` | Verbatim (APEX enforces exactly 5) | yes | `""` |
| 16 | `ShipStation` | text(18) | `ship_station` | Verbatim; **validate ≤18** (APEX has no cap) | yes | `""` |
| 17 | `PromotionStatus` | text(8) | `promotion_status` | Uppercase: `Regular`→`REGULAR`, `Frocked`→`FROCKED`, `Selected`→`SELECTED`, `Spot`→`SPOT` | yes | `""` |
| 18 | `DateReported` | date | `date_reported` | ISO `YYYY-MM-DD` → OLE date at midnight (§4.1) | yes | `NULL` |
| 19 | `Periodic` | bit | `periodic` | boolean → 0/-1 | ≥1 of 19–22 | `0` |
| 20 | `DetInd` | bit | `detachment_individual` | boolean → 0/-1 | " | `0` |
| 21 | `Frocking` | bit | `promotion_frocking` | boolean → 0/-1 | " | `0` |
| 22 | `Special` | bit | `special` | boolean → 0/-1 | " | `0` |
| 23 | `FromDate` | date | `period_from` | ISO → OLE date (§4.1) | yes | `NULL` |
| 24 | `ToDate` | date | `period_to` | ISO → OLE date (§4.1) | yes | `NULL` |
| 25 | `NOB` | bit | `not_observed` | boolean → 0/-1 | ≥1 of 25–27 | `0` |
| 26 | `Regular` | bit | `regular_report` | boolean → 0/-1 | " | `0` |
| 27 | `Concurrent` | bit | `concurrent_report` | boolean → 0/-1 | " | `0` |
| 28 | `OpsCdr` | bit | — | **Always `0`.** APEX has no Ops Cdr checkbox (no block 19 on current forms). | no | `0` |
| 29 | `PhysicalReadiness` | text(4) | `physical_readiness` | Verbatim PFA codes (`^[PBFMWN]+$`); **validate ≤4 chars** | no | `""` |
| 30 | `PhysicalReadiness2` | text(15) | — | **Leave NULL** — exact content NAVFIT expects is unobserved (open question §8) | no | `NULL` |
| 31 | `PhysicalReadinessDt` | date | — | **Leave NULL** — APEX has no PFA date field | no | `NULL` |
| 32 | `BilletSubcat` | text(10) | `billet_subcategory` | Verbatim option code (`NA`, `INDIV AUG`, `SPECIAL01`…); validate ≤10 | no | `""` |
| 33 | `RSLastName` | text(18) | `reporting_senior_name` | Parsed: text before first comma (§4.6) | no | `NULL` |
| 34 | `RSFI` | text(1) | `reporting_senior_name` | Parsed: first initial after comma | no | `NULL` |
| 35 | `RSMI` | text(3) | `reporting_senior_name` | Parsed: middle initial after comma, if present | no | `NULL` |
| 36 | `ReportingSenior` | text(18) | `reporting_senior_name` | Verbatim combined string; **validate ≤18** | yes | `""` |
| 37 | `RSGrade` | text(5) | `reporting_senior_grade` | Verbatim (APEX ≤5 alnum) | yes | `""` |
| 38 | `RSDesig` | text(5) | `reporting_senior_designator` | Verbatim (4-digit or `LTR`/`USAF`/`USA`/`USMC`/`USCG`/`USSF`/`USPH`/`NOAA` — all ≤5) | no | `""` |
| 39 | `RSTitle` | text(14) | `reporting_senior_title` | Verbatim (APEX ≤14) | yes | `""` |
| 40 | `RSUIC` | text(5) | `reporting_senior_uic` | Verbatim (APEX exactly 5) | yes | `""` |
| 41 | `RSSSN` | text(9) | — | **Leave NULL.** APEX has `reporting_senior_dod_id` (10 digits); does not fit. See Gaps. | no | `NULL` |
| 42 | `Achievements` | memo | `command_achievements` | Verbatim (form fit already enforced: 91 cpl × 3 lines) | yes | `""` |
| 43 | `PrimaryDuty` | text(14) | `primary_duty_abbrev` | Verbatim (APEX ≤14) | no | `""` |
| 44 | `Duties` | memo | `primary_duties` | Verbatim (91 cpl, 20-char first-line lead) | yes | `""` |
| 45 | `DateCounseled` | text(8) | `date_counseled` | ISO date → `YYMMMDD` (e.g. `25JUL17`); literals `NOT REQ` / `NOT PERF` / `YYMMMDD` pass through (§4.2 — display format flag) | yes | `""` |
| 46 | `Counseler` | text(20) | `counselor` | Verbatim; **validate ≤20** (APEX allows 22 — export must reject 21–22-char values) | yes | `""` |
| 47 | `CounselerLN` | text(20) | `counselor` | Parsed last name if the string contains a comma; else NULL | no | `NULL` |
| 48 | `CounselerFI` | text(1) | `counselor` | Parsed first initial, if parseable | no | `NULL` |
| 49 | `CounselerMI` | text(3) | `counselor` | Parsed middle initial, if parseable | no | `NULL` |
| 50 | `PROF` | int16 | `trait_grades` (per-type key, §4.3) | Grade string → int: `"1.0"`…`"5.0"` → 1…5; `"NOB"` → 0; absent → NULL | see §4.3 | `NULL` |
| 51–53 | `PROFDN1`, `PROFDN2`, `PROFDN3` | text(255) ea | — | **Leave NULL** — per-trait downgrade/justification lines, purpose unverified (open question) | no | `NULL` |
| 54 | `QUAL` | int16 | `trait_grades` (§4.3) | Same encoding as PROF | " | `NULL` |
| 55–57 | `QUALDN1`, `QUALDN2`, `QUALDN3` | text(255) ea | — | Leave NULL | no | `NULL` |
| 58 | `EO` | int16 | `trait_grades` (§4.3) | Same encoding | " | `NULL` |
| 59–61 | `EODN1`, `EODN2`, `EODN3` | text(255) ea | — | Leave NULL | no | `NULL` |
| 62 | `MIL` | int16 | `trait_grades` (§4.3) | Same encoding | " | `NULL` |
| 63–65 | `MILDN1`, `MILDN2`, `MILDN3` | text(255) ea | — | Leave NULL | no | `NULL` |
| 66 | `PA` | int16 | `trait_grades` (§4.3) | Same encoding | " | `NULL` |
| 67–69 | `PADN1`, `PADN2`, `PADN3` | text(255) ea | — | Leave NULL | no | `NULL` |
| 70 | `TEAM` | int16 | `trait_grades` (§4.3) | Same encoding | " | `NULL` |
| 71–73 | `TEAMDN1`, `TEAMDN2`, `TEAMDN3` | text(255) ea | — | Leave NULL | no | `NULL` |
| 74 | `LEAD` | int16 | `trait_grades` (§4.3) | Same encoding | " | `NULL` |
| 75–77 | `LEADDN1`, `LEADDN2`, `LEADDN3` | text(255) ea | — | Leave NULL | no | `NULL` |
| 78 | `MIS` | int16 | `trait_grades` (§4.3) | Same encoding; **EVAL: always NULL** | " | `NULL` |
| 79–81 | `MISDN1`, `MISDN2`, `MISDN3` | text(255) ea | — | Leave NULL | no | `NULL` |
| 82 | `TAC` | int16 | `trait_grades` (§4.3) | Same encoding; **EVAL: always NULL** | " | `NULL` |
| 83–85 | `TACDN1`, `TACDN2`, `TACDN3` | text(255) ea | — | Leave NULL | no | `NULL` |
| 86 | `RecommendA` | text(20) | `career_recommendations[0]` | Verbatim (APEX ≤20/slot) | ≥1 non-blank | `""` |
| 87 | `RecommendB` | text(20) | `career_recommendations[1]` | Verbatim | no | `""` |
| 88 | `Rater` | text(28) | `rater_signature` (typed name, block_values) | Verbatim; **validate ≤28** | no | `""` |
| 89 | `RaterDate` | date | `rater_signature_date` | ISO → OLE date (§4.1) | no | `NULL` |
| 90 | `CommentsPitch` | text(8) | `comment_pitch` (block_values) | `"10"` → `"10 POINT"`, `"12"` → `"12 POINT"` (12-point string unobserved — open question) | yes | `"10 POINT"` |
| 91 | `Comments` | memo | `comments` | Verbatim (18 lines × 90/84 cpl already enforced) | yes | `""` |
| 92 | `Qualifications` | memo | `qualifications` | Verbatim (91 cpl × 2 lines) | no | `""` |
| 93 | `PromotionRecom` | int16 | `promotion_recommendation` | Enum → code 0–5 (§4.4). **Write explicitly** (no schema default) | yes | `0` |
| 94 | `SummaryRank` | int32 | — | **Always `0`** (NAVFIT-internal ordering; schema default 0) | no | `0` |
| 95 | `SummarySP` | text(3) | `summary_group_distribution` | Count of "Significant Problems" in group, as **text** (§4.5) | no | `"0"` |
| 96 | `SummaryProg` | text(3) | `summary_group_distribution` | Count of "Progressing", as text | no | `"0"` |
| 97 | `SummaryProm` | text(3) | `summary_group_distribution` | Count of "Promotable", as text | no | `"0"` |
| 98 | `SummaryMP` | text(3) | `summary_group_distribution` | Count of "Must Promote", as text | no | `"0"` |
| 99 | `SummaryEP` | text(3) | `summary_group_distribution` | Count of "Early Promote", as text | no | `"0"` |
| 100 | `RetentionYes` | bit | `retention` (EVAL only) | `-1` if `"Recommended"`, else `0`. CHIEFEVAL/FITREP: always `0` | EVAL | `0` |
| 101 | `RetentionNo` | bit | `retention` (EVAL only) | `-1` if `"Not Recommended"`, else `0` | EVAL | `0` |
| 102 | `RSCA` | dec(3,2) | — | **Always `0.00`.** APEX does not track the Reporting Senior Cumulative Average (distinct from `summary_group_average`). See Gaps. | no | `0.00` |
| 103 | `RSAddress` | memo | `reporting_senior_address` (block_values) | Verbatim multi-line blob (30 cpl × 3 lines) | no | `""` |
| 104 | `RSAddress1` | text(30) | — | **Leave NULL** — APEX stores one blob; do not guess a line split | no | `NULL` |
| 105 | `RSAddress2` | text(30) | — | Leave NULL | no | `NULL` |
| 106 | `RSCity` | text(15) | — | Leave NULL | no | `NULL` |
| 107 | `RSState` | text(2) | — | Leave NULL | no | `NULL` |
| 108 | `RSZipCd` | text(9) | — | Leave NULL | no | `NULL` |
| 109 | `RSPhone` | text(10) | — | Leave NULL — no APEX field | no | `NULL` |
| 110 | `RSDSN` | text(7) | — | Leave NULL — no APEX field | no | `NULL` |
| 111 | `SeniorRater` | text(28) | `senior_rater_signature` (typed name) | Verbatim; validate ≤28 | no | `""` |
| 112 | `SeniorRaterDate` | date | `senior_rater_signature_date` | ISO → OLE date | no | `NULL` |
| 113 | `StatementYes` | bit | `member_statement_intent` (block_values) | Free-string intent: contains `NOT`/`DO NOT` (case-insensitive) → `0`; else contains `INTEND` → `-1`; unset → `0` (mirrors `pdfOverlay.ts:636-639`) | no | `0` |
| 114 | `StatementNo` | bit | `member_statement_intent` | Inverse of above: `NOT`/`DO NOT` → `-1`; else `0` | no | `0` |
| 115 | `RSInfo` | memo | `concurrent_rs_signature` (typed name) | Concurrent reports only: typed name/grade of Regular Reporting Senior (navfit99-js maps EVAL block 52 → `RSInfo`). Non-concurrent: `""` | no | `""` |
| 116 | `RRSFI` | text(1) | — | **Leave NULL** — APEX has no structured Regular-RS fields (Gaps) | no | `NULL` |
| 117 | `RRSMI` | text(3) | — | Leave NULL | no | `NULL` |
| 118 | `RRSLastName` | text(25) | — | Leave NULL | no | `NULL` |
| 119 | `RRSGrade` | text(5) | — | Leave NULL | no | `NULL` |
| 120 | `RRSCommand` | text(30) | — | Leave NULL | no | `NULL` |
| 121 | `RRSUIC` | text(5) | — | Leave NULL | no | `NULL` |
| 122 | `UserComments` | memo | — | Leave NULL (golden row is NULL, not `""`) | no | `NULL` |
| 123 | `Psswrd` | text(8) | — | **Always NULL. Never write a password.** (Plaintext, sensitive.) | no | `NULL` |
| 124 | `Standards` | text(30) | — | Leave NULL — purpose unverified (open question) | no | `NULL` |
| 125 | `IsValidated` | bit | — | **Write `0`.** Let NAVFIT 98A run its own validation post-import rather than pre-asserting it (deliberate; revisit if fleet feedback wants `-1`). | no | `0` |

Not exported (no NAVFIT column exists): `trait_average` (block 40 — NAVFIT computes), `summary_group_average` (block 50a), signature PNG images (`*_signature_data`), `reporting_senior_signature`/`_date` (block 50 is wet-signed; NAVFIT has no column), `member_signature`/`_date` (block 51 name/date), `individual_counseled_signature` (block 32), all APEX workflow columns (`status`, `routing_stage`, etc.).

---

## 2. Folders table — row construction

APEX writes **exactly one row**, byte-matching the golden Root row. Folders' 68 report-template columns stay empty — APEX does not use NAVFIT's folder-as-template or Auto Summary features.

| Column(s) | Value |
|---|---|
| `FolderName` | `"Root"` (or a caller-supplied batch label ≤50 chars, e.g. `"APEX Export 2026-07-17"`; golden uses `"Root"`) |
| `FolderID` | `1` (explicit AutoNumber seed) |
| `Parent` | `0` (int16; 0 = root) |
| All 17 Yes/No columns (`Active`, `TAR`, `Inactive`, `ATADSW`, `Periodic`, `DetInd`, `Frocking`, `Special`, `NOB`, `Regular`, `Concurrent`, `OpsCdr`, `RetentionYes`, `RetentionNo`, `StatementYes`, `StatementNo`, `AutoSummary`) | `0` (false) — bits can never be NULL |
| `PromotionRecom` | `0` (golden row stores it explicitly despite no schema default) |
| `SummarySP`, `SummaryProg`, `SummaryProm`, `SummaryMP`, `SummaryEP` | `NULL` (golden Folders row holds NULL here — the text `"0"` schema default applies only to NAVFIT-initiated inserts; do not "helpfully" write `"0"`) |
| Every other column (`FullName`, `Rate`, `Desig`, `SSN`, `UIC`, `ShipStation`, `PromotionStatus`, `DateReported`, `FromDate`, `ToDate`, `PhysicalReadiness`, `BilletSubcat`, `ReportingSenior`, `RSGrade`, `RSDesig`, `RSTitle`, `RSUIC`, `RSSSN`, `Achievements`, `PrimaryDuty`, `Duties`, `DateCounseled`, `Counseler`, `PROF`, `QUAL`, `EO`, `MIL`, `PA`, `TEAM`, `LEAD`, `MIS`, `TAC`, `RecommendA`, `RecommendB`, `Rater`, `RaterDate`, `CommentsPitch`, `Comments`, `Qualifications`, `RSAddress`, `SeniorRater`, `SeniorRaterDate`, `RSInfo`, `UserComments`, `Psswrd`) | `NULL` |

Optional future extension: one subfolder per summary group (max 6 levels; NAVFIT's Auto Summary treats one folder = one summary group). Not needed for v1 — reports carry their own Summary* counts.

---

## 3. Summary table — disposition

**Emit the table with the correct schema and zero rows.** The golden DB has 0 rows; NAVFIT only reads it for saved summary-letter profiles (NAVPERS 1616/25 transmittal), which APEX does not produce.

| Column | Type | Written |
|---|---|---|
| `ProfileName` | text(50), **PK (text, not AutoNumber)** | — no rows |
| `OnTimeYes`, `OnTimeNo` | bit | — |
| `ISICAddress` | memo | — |
| `EMail` | text(50) | — |
| `Phone` | text(10) | — |

---

## 4. Value transforms

### 4.1 Dates (`DateReported`, `FromDate`, `ToDate`, `RaterDate`, `SeniorRaterDate`)
APEX stores ISO `YYYY-MM-DD` strings (columns `period_from`/`period_to` are Postgres `date`; the rest live in `block_values`). Target: Access **Date With Time** = 8-byte OLE-automation double (days since 1899-12-30). Write date-only values with a **midnight (00:00:00) time component**, no timezone shift — parse the ISO date as year/month/day literals, never through a TZ-aware Date. (Jackcess: `LocalDateTime.of(y, m, d, 0, 0)`.) Do **not** apply the Navy `YYMMMDD` display format here — NAVFIT formats at print time.

### 4.2 `DateCounseled` — the one text date
`Short Text(8)`, not a date column. APEX `date_counseled` accepts ISO, `YYMMMDD`, `NOT REQ`, `NOT PERF`:
- ISO `YYYY-MM-DD` → format to `YYMMMDD` uppercase (e.g. `2025-07-17` → `25JUL17`) via the same rules as `formatNavpersDate` (`lib/pdfOverlay.ts:42-61`).
- `YYMMMDD` / `NOT REQ` / `NOT PERF` → pass through verbatim (all ≤8 chars).
- ⚠ NAVFIT's own display format for this field is unobserved (golden value is `""`) — see Open Questions.

### 4.3 Trait grades — value encoding and per-type column assignment
**Value encoding** (confirmed by navfit99-js radio-index storage: labels `["NOB","1","2","3","4","5"]`, stored value = label index):

| APEX `trait_grades` value | NAVFIT int16 |
|---|---|
| `"1.0"` … `"5.0"` | `1` … `5` (`parseInt`) |
| `"NOB"` | `0` |
| absent/blank (only legal when `not_observed`) | `NULL` |

**Column assignment differs per form** — NAVFIT renders block N of each form from a fixed Access column (navfit99-js `eval-detail.js` / `chief-detail.js` / `fitrep-detail.js` block maps). Map by **block number**, not by trait name:

| Block | EVAL (APEX key → column) | CHIEFEVAL (APEX key → column) | FITREP (APEX key → column) |
|---|---|---|---|
| 33 | `knowledge` → `PROF` | `deckplate_leadership` → `LEAD` | `knowledge` → `PROF` |
| 34 | `work` → `QUAL` | `professionalism` → `TAC` ⚠ | `eo` → `EO` |
| 35 | `eo` → `EO` | `mission_accomplishment` → `PROF` ⚠ | `bearing` → `MIL` |
| 36 | `bearing` → `MIL` | `human_development` → `MIS` ⚠ | `teamwork` → `TEAM` |
| 37 | `accomplishment` → `PA` | `eo_climate` → `EO` | `accomplishment` → `MIS` |
| 38 | `teamwork` → `TEAM` | `teamwork` → `TEAM` | `leadership` → `LEAD` |
| 39 | `leadership` → `LEAD` | `leadership` → `MIL` ⚠ | `tactical_performance` → `TAC` |
| unused | `MIS`, `TAC` → NULL | `QUAL`, `PA` → NULL | `QUAL`, `PA` → NULL |

⚠ **CHIEFEVAL caveat**: the column-per-block map comes from navfit99-js's Chief form, whose trait *labels* (Deckplate Leadership, Institutional/Technical Expertise, Professionalism, Loyalty, Character, Active Communication, Sense of Heritage) are an older 1616/27 revision than APEX's trait set. The positional mapping (block 33 stored in `LEAD`, 34 in `TAC`, 35 in `PROF`, 36 in `MIS`, 37 in `EO`, 38 in `TEAM`, 39 in `MIL`) is the best available evidence but **must be verified against a real NAVFIT 98A v30+ Chief report before shipping** (Open Question 2). EVAL and FITREP maps carry no such caveat — FITREP's map aligns column semantics and APEX keys exactly.

FITREP note: ignore the legacy `work` → 34 alias in `fitrepTraitBlockMap` (`validationEngine.ts:86-87`); export only the 8 canonical `FITREP_TRAIT_KEYS` (block 34 comes from `eo`).

### 4.4 Promotion recommendation codes
Radio-index encoding confirmed via navfit99-js (labels `["NOB","Significant Problems","Progressing","Promotable","Must Promote","Early Promote"]`):

| APEX `promotion_recommendation` | `PromotionRecom` |
|---|---|
| `"NOB"` | `0` |
| `"Significant Problems"` | `1` |
| `"Progressing"` | `2` |
| `"Promotable"` | `3` |
| `"Must Promote"` | `4` |
| `"Early Promote"` | `5` |

Always write explicitly — the column has **no schema default** (golden rows store 0 written by NAVFIT).

### 4.5 Summary group counts (`SummarySP` … `SummaryEP`)
Source: `summary_group_distribution` (**transient** — computed at export time from the evaluation's summary group via the same `fetchGroupDistribution` path the export page uses, gated by `canViewSummaryAverage`). Each category count is written as a **text string** (`"3"`, not `3`) into the matching Text(3) column: Significant Problems→`SummarySP`, Progressing→`SummaryProg`, Promotable→`SummaryProm`, Must Promote→`SummaryMP`, Early Promote→`SummaryEP`. NOB has no summary column. When no summary group exists or the viewer may not see the distribution: write `"0"` in all five (matches golden/schema default).

### 4.6 Checkbox encoding
Access Yes/No: **`0` = No, `-1` = Yes, NULL is impossible at the Jet level** — every bit column in every row must be written 0 or -1, never omitted/NULL. APEX booleans map directly; APEX single-choice enums (`duty_status`, `retention`, `member_statement_intent`) fan out to mutually-exclusive bit groups (rows 11–14, 100–101, 113–114 above).

### 4.7 Name parsing (combined → split fields)
- `member_name` (`LAST, FIRST MI`, regex-guaranteed one comma): `LastName` = trimmed text before the comma; remainder tokens after the comma: if the last token is a single letter → `MI`, remaining tokens joined → `FirstName`; else all → `FirstName`, `MI` NULL. `FullName` always gets the verbatim combined string. `Suffix` stays NULL (APEX regex admits no suffix).
- `reporting_senior_name` (`LASTNAME, FI [MI] [JR/SR/II–V]`): `RSLastName` = before comma; first token after comma (1 char) → `RSFI`; second single-letter token → `RSMI`; trailing suffix token is dropped from the splits (kept in the combined `ReportingSenior`).
- `counselor`: free string ≤20; populate `CounselerLN`/`CounselerFI`/`CounselerMI` only when it matches the same `LAST, FI MI` shape, else leave the splits NULL and rely on the combined `Counseler`.
- Write **both** the legacy combined field and the splits — NAVFIT's newer forms read the splits, older printing paths read the combined field.

---

## 5. Per-report-type differences

`ReportType` discriminator (Short Text 15): `"Eval"` byte-confirmed in the golden DB; `"FitRep"` and `"Chief"` from navfit99-js source (`//FitRep, Eval, Chief`) — exact casing matters, unverified against a real NAVFIT-produced officer/chief DB (Open Question 3).

| Aspect | EVAL | CHIEFEVAL | FITREP |
|---|---|---|---|
| `ReportType` | `"Eval"` | `"Chief"` | `"FitRep"` |
| APEX form | NAVPERS 1616/26 (E1–E6) | 1616/27 (E7–E9) | 1610/2 (W2–O6) |
| Trait columns used | `PROF QUAL EO MIL PA TEAM LEAD` (MIS/TAC NULL) | `LEAD TAC PROF MIS EO TEAM MIL` ⚠ (QUAL/PA NULL) | `PROF EO MIL TEAM MIS LEAD TAC` (QUAL/PA NULL) |
| `Desig` | optional | optional | **required** 4-digit officer designator |
| `RetentionYes`/`RetentionNo` | from `retention` | always `0`/`0` | always `0`/`0` |
| Substantiation rules (pre-export gate, already in `runFullValidation`) | per EVAL rules | every 1.0 and 2.0 substantiated in comments | 1.0s, three+ 2.0s, or 2.0 in block 34 |

Everything else (all remaining 100+ columns) maps identically across the three types.

---

## 6. Exporter validation rules

The exporter runs **server-side**, on the DB row (never a client-supplied body), after `runFullValidation` passes. On top of APEX validation it must enforce the NAVFIT-specific constraints APEX does not:

**Hard failures (reject export):**
1. `runFullValidation(payload).success === true` — re-run server-side.
2. Evaluation state: `status === 'completed'` (or at minimum `signature_locked` / `routing_stage === 'locked'`), matching the eval-finalize gate.
3. Length caps tighter than APEX's own: `member_name` ≤27 (`FullName`), `ship_station` ≤18 (`ShipStation`), `reporting_senior_name` ≤18 (`ReportingSenior`), `counselor` ≤20 (`Counseler` — APEX allows 22), `physical_readiness` ≤4 (`PhysicalReadiness` — APEX regex is unbounded), rater/senior-rater typed names ≤28, `career_recommendations[i]` ≤20, `grade_rate` ≤5, `billet_subcategory` ≤10, summary counts ≤3 digits (≤999). **Reject, never silently truncate** — a truncated official record is worse than no record.
4. Trait/NOB consistency: every trait for the report type is 1–5 or 0 (NOB); NULL traits only when `NOB` bit is -1 (mirrors validation rule 11).
5. Exactly one bit set in each exclusive group: duty status (11–14); statement intent both-zero allowed only when `member_statement_intent` unset; EVAL retention exactly one of `RetentionYes`/`RetentionNo`.

**Writer invariants (assert in code/tests):**
6. Every Yes/No column written 0 or -1 — never NULL (17 bit columns in Reports, 17 in Folders).
7. Summary counts written as text (`"0"`), `RSCA` as decimal `0.00`, `PromotionRecom`/`SummaryRank` written explicitly.
8. `Reports.Parent` exactly `"a " + FolderID` (with the space); every report's Parent resolves to an existing `FolderID` (dangling = silently invisible in NAVFIT).
9. `FolderID`/`ReportID` explicitly seeded, unique, ≥1.
10. Legacy-vs-new NULL pattern per the Empty column in §1 (golden-row fidelity).
11. `Psswrd` NULL in both tables; no `dod_id` written anywhere (see Gaps — prevents a 10-digit ID masquerading as an SSN).
12. Dates written as midnight OLE dates with no TZ shift.
13. Audit: insert `audit_logs` row (action `NAVFIT_EXPORTED`) per export, service-role client, like eval-finalize.

---

## 7. Gap list

**APEX fields with no NAVFIT column (not exported):**
- `dod_id` (block 4) and `reporting_senior_dod_id` (block 27) — NAVFIT has `SSN`/`RSSSN` Text(9); APEX 10-digit DoD IDs do not fit and are not SSNs. Blocks 4/27 arrive **blank** in NAVFIT; the command fills SSNs there. (Deliberate: writing DoD IDs into SSN fields would corrupt downstream BUPERS processing.)
- `trait_average` (block 40) — no column; NAVFIT recomputes.
- `summary_group_average` (block 50a) — no column.
- `reporting_senior_signature`, `reporting_senior_signature_date` (block 50) — no columns.
- `member_signature`, `member_signature_date` (block 51 signature itself; only intent maps to `StatementYes/No`).
- `individual_counseled_signature` (+`_data`, `_date`) (block 32) — no columns.
- All `*_signature_data` PNG images — NAVFIT stores no signature images.
- `designator` nuance: none — maps fine. `promotion_status` "Spot" fits.
- APEX workflow metadata (`status`, `routing_stage`, `participants`, `summary_group_id`, `reviewer_id`, `pdf_storage_path`, audit trail) — intentionally not represented.

**NAVFIT columns APEX cannot fill (left NULL/empty/zero):**
- `SSN`, `RSSSN` (see above), `Suffix`, `OpsCdr` (no block-19 concept in APEX), `PhysicalReadiness2`, `PhysicalReadinessDt`, all 27 `*DN1..3` trait lines, `RSCA` (RS cumulative average — APEX doesn't track it; 0.00), `RSAddress1/2`, `RSCity`, `RSState`, `RSZipCd` (unsplit blob only), `RSPhone`, `RSDSN`, `RRSFI`, `RRSMI`, `RRSLastName`, `RRSGrade`, `RRSCommand`, `RRSUIC` (Regular-RS-on-concurrent structured fields — APEX has only the typed `concurrent_rs_signature` name, mapped to `RSInfo`), `Standards`, `UserComments`, `Psswrd`, `SummaryRank`.

---

## 8. Open questions

1. **`DateCounseled` display format** — NAVFIT stores it as Text(8); golden value is `""`. Does NAVFIT expect `YYMMMDD`, `MM/DD/YY`, or something else? Spec says write `YYMMMDD`; verify by keying a counseling date into real NAVFIT 98A and dumping the row.
2. **CHIEFEVAL trait-column assignment** — positional map (33→`LEAD`, 34→`TAC`, 35→`PROF`, 36→`MIS`, 37→`EO`, 38→`TEAM`, 39→`MIL`) is inferred from navfit99-js's older Chief form; APEX's CHIEFEVAL trait names differ from that revision's labels. Verify against a Chief report created in NAVFIT 98A v30+ before shipping CHIEFEVAL export.
3. **`ReportType` casing for non-EVAL** — `"FitRep"`/`"Chief"` from navfit99-js only; confirm exact strings from a NAVFIT-produced officer/chief DB.
4. **Per-trait NOB = 0 vs NULL** — radio-index evidence says explicit NOB stores `0`; golden row (blank report) only shows NULL. Confirm a NAVFIT-graded NOB trait dumps as 0.
5. **`CommentsPitch` 12-point string** — `"10 POINT"` confirmed; is 12-pitch stored as `"12 POINT"`? Unobserved.
6. **`IsValidated`** — spec writes `0` (NAVFIT re-validates after import). If receiving commands complain about re-validating every imported report, flip to `-1` only for evals that passed `runFullValidation`.
7. **`PhysicalReadiness2`/`PhysicalReadinessDt`** — newer PFA fields' exact content (e.g. `P/P/P` extended codes, cycle date) unobserved; currently NULL. If NAVFIT v30+ reads block 20 from these instead of the legacy `PhysicalReadiness`, exported PFA data won't display — verify with a round-trip.
8. **SSN policy** — blocks 4/27 export blank. Confirm with stakeholders that receiving commands accept keying SSNs manually in NAVFIT (the alternative — carrying SSNs in APEX — contradicts the PII policy in `001_initial_schema.sql:93`).
9. **`Standards` (Text 30)** — late-addition column, purpose unknown; NULL until observed non-null in a real NAVFIT DB.
10. **`FolderName` label** — `"Root"` (golden) vs a descriptive batch label; either imports fine, pick a product preference.
