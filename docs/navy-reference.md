# APEX Navy Reference

**Audience: AI agents building or reviewing APEX features.** Not Sailors. Not marketing copy.
**Compiled:** 2026-07-29, from five independently source-checked research lanes (150 checked facts).
**Instructions get revised.** Every edition below is the one actually opened on 2026-07-29. Re-verify
anything that will become user-facing language before shipping.

---

## 0. How to use this document

| Rule | Detail |
|---|---|
| **Cite by section** | Write `docs/navy-reference.md §4.2` in code comments, specs, and PR descriptions. Do not re-derive. |
| **Never state a domain fact not in here** | …unless you verified it yourself against a primary source, in which case **add it here** with its citation. |
| **Add, don't re-fetch** | If you had to open MyNavyHR to answer a question, the answer belongs in this file. |
| **§9 is quarantine** | Anything in §9 ("Unverified") must never be cited as fact, put in UI copy, or fed to an LLM as ground truth. |
| **§8 before you code** | "Where APEX is currently wrong" is the highest-value section. Read it before touching `lib/boardConfidence/*`. |
| **Precept > LaDR** | When a rating LaDR and the board precept disagree, the precept governs. The LaDR itself says so (§6.4). |

### Source editions of record

| Document | Edition seen | Reachable? |
|---|---|---|
| BUPERSINST 1610.10H (EVALMAN) | **CH-2, 26 May 2026** (composite PDF: unrevised pp. footer 30 Jul 2025; CH-1 pp. 16 Dec 2025) | Yes — fetched from publisher |
| BUPERSINST 1430.16H (Advancement Manual) | 21 Jan 2026 | Yes |
| MILPERSMAN 1070-080 | CH-87, 26 Jun 2024 | Yes |
| MILPERSMAN 1401-010 | 22 Aug 2002 | Yes (officer-scoped — see §9) |
| FY-27 Enlisted Precept | CNP ltr 28 Jan 2026 | Yes |
| FY-27 E7 / E8-E9 Convening Orders | 12 May 2026 / 30 Mar 2026 | Yes |
| NAVADMIN 075/26 (FY-27 CPO boards) | R 012013Z APR 26 | Yes |
| NAVADMIN 119/26 (FY-27 E8/E9 results) | R 201305Z MAY 26 | Yes |
| NAVADMIN 220/19, NAVADMIN 100/25 | 27 Sep 2019 / 2 May 2025 | Yes |
| PERS-803 Enlisted Selection Board Brief | Feb 2025 | Yes |
| PERS-80 Active-Duty Officer Promotion Brief | 2024 | Yes |
| OPNAVINST 1500.77A (LaDR) | 7 Apr 2017 | Yes (via secnav.navy.mil) |
| OPNAVINST 1414.9C / 1414.4E | 27 Jan 2022 / 20 Oct 2021 | Yes |
| Navy COOL LaDR index + rating PDFs | cover July 2026 | Yes |

### Network reality (verified 2026-07-29 — supersedes SHARED_CONTEXT)

**`mynavyhr.navy.mil` is NOT blocked.** It sits behind AkamaiGHost. A browser User-Agent **alone
returns 403**. So does UA + any *single* additional header. HTTP 200 requires the full browser
fingerprint together: `User-Agent` + `Accept` + `Accept-Language` + `Accept-Encoding` +
`Upgrade-Insecure-Requests: 1` + all four `Sec-Fetch-Dest/Mode/Site/User`. Independently reproduced
by three separate lanes. `WebFetch` cannot reach the host; curl with the full set can.

- `Portals/55/...` asset paths **require the `?ver=` query string**; the bare path 404s. Scrape the
  href from the listing page rather than constructing it.
- `.txt` NAVADMINs come back gzipped unless `--compressed` is sent — `gunzip -c` before `pdftotext`.
- `cool.osd.mil` needs a browser UA **and** `curl -k` (omits its TLS intermediate; this is what
  `lib/boardConfidence/ladrCerts.ts` pins around). Directory listings (`/usn/LaDR/`) 403; the index
  is `https://www.cool.osd.mil/usn/all_ladrs.html`. COOL returns **403, not 404**, for a missing PDF.
- `netc.navy.mil` — 403 with a browser UA, not reached. `npc.navy.mil` — does not resolve.

> **Consequence for the codebase:** `lib/boardConfidence/preceptFetch.ts:51-52` sends only
> `{ "User-Agent": BROWSER_UA }` and will always 403. One-line fix. See §8.

---

## 1. The board: how it actually works

### 1.1 Governing documents, in precedence order

| Doc | What it does | Scope |
|---|---|---|
| **Precept** (CNP letter) | Board conduct, record review, adverse info, RSCA comparison, impermissible considerations | **One per FY**, covers E7 + E8/E9, AC + RC |
| **Convening order** (CNP letter) | Convening date/place, membership, quotas, **and the FQ/BQ selection standard** | **One per paygrade group**, issued later |
| **Enlisted Career Paths (ECP)** | Rating-specific typical milestones; briefed by the panel's rating SME | Per rating; advisory only |
| **BUPERSINST 1430.16H ch. 11 / 13** | Eligibility, LTB rules, board mechanics, SEM | Standing instruction |

The enumerated scoring guidance lives in the **convening order**, not the precept. FY-27 precept
Appendix structure: A General Guidance, B Equal Opportunity, C Board Reports, D Oaths.
`FY27_Enlisted_Precept.pdf` header/contents; `FY27_AE7_ASB_Convening_Order.pdf` paras 1–3.

> `1430.16H para 1100`: "Enlisted selection boards parallel statutory selection boards to the maximum
> extent possible. Enlisted selection boards are guided by precepts and convening orders that contain
> board membership and quotas."

`1430.16H para 1104` also carries a **non-disclosure clause**: board proceedings and deliberations may
not be divulged. No public transcript of a board will ever exist to mine.

### 1.2 Fully Qualified vs Best Qualified — two sequential gates, not two tiers

**FQ is a disqualifying floor.** Convening order para 3.a, verbatim:

> "All candidates recommended for advancement must be fully qualified. That is, each candidate's
> qualifications, experience, and performance must clearly demonstrate that he or she would be capable
> of performing the duties of the next higher paygrade. **Candidates that do not meet that standard
> shall not be recommended for advancement.**"

Para 3.a(1) — FQ candidates demonstrate "a requisite level of leadership, technical expertise,
managerial and communication skills, integrity, commitment to the personal and professional
development of subordinates, resourcefulness in their assignments, and recognition of our Navy's
heritage." Para 3.a(2) adds adherence to Navy/DoW ethical standards and loyalty to Navy Core Values.

**BQ is a comparative standard applied only to the FQ pool.** Para 3.b:

> "Among the fully qualified candidates, you must recommend for advancement the best-qualified
> candidates within their respective competitive group."

**The six BQ considerations — this is the authoritative citable rubric:**

| # | Consideration |
|---|---|
| 3.b(1) | Scope and Impact of Leadership |
| 3.b(2) | Outcome Focused Leadership |
| 3.b(3) | Institutional and Technical Expertise |
| 3.b(4) | Special Qualifications |
| 3.b(5) | History of Assignments |
| 3.b(6) | Education and Professional Development |

"Warfighting" is **not** a top-level category — the phrase "unit warfighting readiness" appears inside
3.b(1) as a sub-theme. "Sea duty" is not a named category either.
*Source: FY27_AE7_ASB_Convening_Order.pdf paras 3.a–3.b; identical FQ language in the E8/E9 CO para 3.a.*

The precept uses the conjoined phrase ("best and fully qualified", App A 8.a) and the board's signed
certification uses both terms (App C para 1.c(6)).

### 1.3 How a record is decided

**Enlisted boards vote records INDIVIDUALLY.** PERS-803 "Board Process" slide, verbatim:

> "Members conduct initial independent review of each record. **All records are then brought to tank
> for individual briefing and voting.** Records are then scattergrammed until selects and non-selects
> are determined."

The word "slate" appears **nowhere** in the PERS-803 brief, the FY-27 precept, or either convening
order. `grep` returns zero hits.

The mechanism in the instruction (`1430.16H paras 1107b, 1108`):

1. Records **randomly assigned** within panels (PERS-803).
2. A panel member serving as **rating subject matter expert** briefs the panel using the **ECP**.
3. "Each candidate's record is reviewed by at least one different panel member and **given a score**."
4. "Once all records in a competitive group are reviewed and scored, the candidates are **arranged in
   score order and a 'crunch zone' is established**."
5. The panel deliberates the crunch zone. "The tank group votes to approve or disapprove the
   recommended selects and non-selects. **Fifty-one percent approval is required** to approve the
   recommended select list."
6. Written report signed by ≥2 panel members per competitive group goes to CHNAVPERS.

**The only officially stated enlisted decision rule** (precept App C para 1.c(6)): candidates are
recommended "in the opinion of the **majority of the members of the respective tank group**, fully
qualified and best qualified to meet the needs of the Navy."

> **APEX phrasing to use:** "enlisted boards independently review, then brief and vote each record
> individually within a rating panel ('tank') and scattergram the results; the panel scores records,
> orders them, and deliberates a crunch zone; selection is by majority of the respective tank group."

### 1.4 The officer analogy — where it holds and where it does not

The officer 100/75/50/25/0 scale **is** officially published, but **for officer boards only**.
PERS-80 brief, verbatim: "All members vote the record via a confidence factor (100, 75, 50, 25, 0)",
with grading criteria "100 or 'A' = Absolutely Select / 75 or 'B' = Probably Select / 50 or 'C' =
Maybe / 25 or 'D' = Probably Not / 0 or 'No' = Do Not Select"; "A 'Yes/No' vote is voted using only
'100' or '0'"; after briefing "a scattergram is displayed which shows the cumulative number of votes
at each confidence level."

| Element | Officer brief | Enlisted brief | Shared? |
|---|---|---|---|
| Independent member review of each record | ✅ | ✅ | **Yes** |
| Record briefed and voted in the "tank" | ✅ | ✅ | **Yes** |
| Results scattergrammed → selects/non-selects | ✅ | ✅ | **Yes** |
| Record **displayed and briefed by the reviewing member** | ✅ | ❌ | **No — officer only** |
| **Recorder** tallies and calls out votes | ✅ | ❌ | **No — officer only** (`grep -i "recorder"` on PERS-803 = 0 hits) |
| Published numeric confidence scale | ✅ | ❌ | **No — none published for enlisted** |
| Adverse info usable only if in the official record | ✅ FC-17 | ✅ FAQ #8 | Yes, different wording |

**Do not claim an enlisted recorder tallies votes.** That would be a fabricated detail in front of
people who have sat on boards.

### 1.5 Composition

| Role | Who | Source |
|---|---|---|
| **President** | **Flag officer** (RDML/RADM). Appointed by CNP, voting member of all tank groups, no authority to constrain members, may direct a second review of any record | Precept App A para 1; FY-27 E8/E9 roster ("P" markers on RADM Collins, RDML Burgess, RDML Stafford); FY-26 E7 roster ≥3 RDMLs |
| **Board SEA** | CMDCM / FORCM. President's advisor, voting member of all tank groups, raises issues, provides rating institutional expertise, conducts spot checks under the President's direction | Precept App A para 2; FY-27 E8/E9 roster (3 SEAs) |
| **Members** | CAPT/CDR/CWO and senior enlisted, marked "M" on rosters — **never "P"** | Rosters |
| **Recorders / Admin staff** | Convening-order enclosures (2) and (3) | Convening orders |

**Panels are by rating community.** PERS-803 example panels: Admin/Supply, Nuke/SPECWAR, Aviation,
Surface Ops/Engineering, Submarine, Combat Systems/Info Warfare. Membership is balanced across Source
Rating, Community, Component, Number of eligibles, Geographic Location, Special Qualifications, Prior
Board Experience.

**FY-27 Active E-9/E-8 Combined ran TWO PHASES with NINETEEN panels** (1A–1D, 2A–2C, 3A–3C, 4A–4C,
5A–5C, 6A–6C), board numbers #27210/27214/27235/27236. *(Not twelve — an earlier draft undercounted
and missed Phase 2 entirely.)*

Roster name lists in this document are **not exhaustive** — treat them as examples only.

### 1.6 Quotas — a ceiling, not a floor

> Convening order para 2: "The total number of candidates who may be recommended in each competitive
> group **shall not exceed** the quotas specified in enclosure (4). The … boards shall **only recommend
> up to the quota if the board determines that there are a sufficient number of fully qualified
> candidates**."

A strong record can still be a non-select. **A per-record score must never be presented as a selection
probability without the quota caveat.**

### 1.7 Post-board outcomes — three states

| State | Meaning |
|---|---|
| **Selectee** | On the results NAVADMIN |
| **Non-selectee** | Not selected this cycle |
| **Selection board hold** | Post-board review found adjudicated or pending substandard/adverse info (clearance issues, misconduct). "These selects are placed on hold, notified of their selection and hold status, who then provide additional information to CNP to decide whether to release the hold or permanently remove their selection" — "results in missing sequence numbers on NAVADMIN." |

*Sources: PERS-803 "Post Board Process"; 1430.16H paras 702.c(2), 702.d(2), 1111.*
**"Hold" is driven by clearance/misconduct adjudication, not record strength — never render it as a
low score.** CHNAVPERS approves all board recommendations; the NAVADMIN must be in the command's
possession before frocking.

### 1.8 Timeline (FY-27, worked example)

| Milestone | AC (E7) | RC (E7) | E8/E9 (Active) |
|---|---|---|---|
| Rating change deadline | 23 May 2026 | 2 May 2026 | — |
| **LTB deadline** | **11 Jun 2026, 2359 CST** | **21 May 2026, 2359 CST** | — |
| Board convenes | 22 Jun 2026, 0800, NPC Millington | 1 Jun 2026 | 30 Mar 2026, 0800 |
| Board adjourns | 17 Jul 2026 | 12 Jun 2026 | — |
| Results | — | — | NAVADMIN 119/26, 20 May 2026 |
| Terminal eligibility date | 1 Jan 2027 | | |
| TIR date | 1 Jan 2024 | | |

*Sources: NAVADMIN 075/26 paras 4, 5, 6.b, 6.c; FY27_AE7 CO para 1.a; FY27_AE89 CO para 1.a; NAVADMIN 119/26.*

**The 11-day gap between LTB deadline and convening is the actual last moment a Sailor can change what
the board sees.** E7 and E8/E9 run ~3 months apart — any countdown must branch on target paygrade.
The E8/E9 results NAVADMIN is titled "**LEGACY** ADVANCEMENT SELECTION BOARDS RESULTS"; SEM-screened
Sailors are announced **separately** (para 4), so results parsing must handle two message types.

**Never hardcode these dates.** They are per-cycle and set by the announcing NAVADMIN.

### 1.9 Eligibility gates (all hard, all pre-scoring)

| Gate | Rule | Source |
|---|---|---|
| **Profile sheet** | "The authoritative source to determine selection board eligibility is the profile sheet." PERS-803: "**No profile sheet = not being considered by the board**." A Sailor can receive a "BUPERS INVAL" profile sheet **without notification**. Verify via NEAS (`https://neas.ncdc.navy.mil`). | 1430.16H 1101a; PERS-803 Common Issues |
| **TIR** | 36 months for E6→E7, E7→E8, E8→E9 — **but Table 2-1 is scoped**: "Basic TIR requirements are shown in table 2-1 **for Sailors exempt from billet-based advancement (BBA)**." Do not present 36 months as universal without checking ch. 13. | 1430.16H para 201.a, Table 2-1 |
| **HYT** | "For E-7 through E-9 candidates, HYT date must be on or after the first day of the exam administration cycle or approved HYT waiver must be prior to the board convening." E-7: **1 September** of the exam year. E-8/E-9: **1 July** of the board year. | 1430.16H para 201.b |
| **Exam / SBE** | "There are two annual NWAE cycles for E-5 and E-6 candidates, one annual NWAE selection board eligible (SBE) cycle for E-7 candidates, and one annual **SBE (non-exam) cycle for E-8 and E-9** candidates." PMK-EE is a prerequisite to sit an NWAE/RKE for **E-5 through E-7 only**. Award points are **not** in the E-7 FMS computation. | 1430.16H paras 701, 615, 201.c, Note 3 |
| **Promotion recommendation** | "Any candidate with a most-recent evaluation with promotion recommendation of 'Significant Problems' or 'Progressing' **is not eligible** to participate in an NWAE, RKE, or selection board for advancement consideration to E-7 through E-9." Remedy: a later eval restoring the recommendation, **received before the convening date**. | 1430.16H paras 201f, 1101g |
| **Security clearance** | **38 ratings** — AC, AE, AG, AO, AT, AWF, AWO, AWR, AWS, AWV, AZ, CTI, CTM, CTR, CTT, CWT, EOD, ET, FC, FCA, GM, HT, IC, IS, IT, LN, MA, MC, MN, ND, OS, QM, RP, RW, SB, SO, STG, YN — plus **all nuclear and submarine ratings**. "No Determination Made" **counts as an unfavorable adjudication**. | NAVADMIN 075/26 para 6.f |
| **Nuclear / submarine** | Nuclear Sailors must hold NEC **N33Z**. Non-nuclear submarine Sailors designated "SG"/"SP" as of the convening date are **ineligible**. Submarine nuclear E-7 candidates need a supervisor NEC + qualified **EWS**; surface nuclear need supervisor NEC + **EWS or PPWS**. | NAVADMIN 075/26 6.g; 1430.16H para 203 |
| **Fleet reserve** | Sailors with approved fleet reserve requests are not considered. | NAVADMIN 075/26 para 6.e |
| **Eligibility persists** | Must be met and maintained "**through adjournment of the board**"; profile-sheet info "may change on a weekly basis". | NAVADMIN 075/26 para 6.a |

**APEX scores record QUALITY. It is not an eligibility determination and must never be presented as
one.** A Sailor with an INVAL profile sheet gets zero value from a readiness score — run the
deterministic gates first.

### 1.10 Cutoff rule

> `1430.16H para 1101`: "Candidates must meet the eligibility requirements outlined in chapter 2
> **prior to the scheduled board convening date or other date as prescribed via selection board
> NAVADMIN**. Requirements achieved after … will be considered late and will not make a candidate
> eligible for the regularly scheduled board or entitle a candidate to an enlisted special selection
> board."

The NAVADMIN can move the cutoff **earlier** than the convening date. Sort every action against a
user-entered board date and warn about this.

---

## 2. What the board reads

### 2.1 The record scope — verified, and it's APEX's strongest claim

> `1430.16H para 1105`: "Documents in official military personnel files (OMPF) **field codes 30
> through 38**, the **PSR**, and the candidate's **letter to the board (LTB)** are provided to
> selection boards."
>
> PERS-803 FAQ #2: "The selection board only considered items in my OMPF, PSR, and items in my Letter
> to the Board (LTB). **TRUE**."
>
> Precept App A para 7.f: "During deliberations, a candidate's **entire record** is available for
> review." PERS-803 FAQ #15 confirms.
>
> `1430.16H para 1107`: "A candidate's **entire history** of OMPF and PSR is available for review."

**There is no board lookback window.** Recency weighting is a defensible APEX heuristic but must not
be described as modeling what the board sees.

> **Note (1105):** "Documents submitted to the selection board are **not forwarded for inclusion in
> the OMPF**." An LTB repairs nothing permanently.

**Not used by the board:** PRIMS ("How is PRIMS used in the selection board process? **It is not.**"
FAQ #9). NSIPS ESR data only if in the OMPF or LTB (FAQ #10). Security clearance info not provided
except as documented in an eval narrative or a revocation Page 13 (FAQ #11).

### 2.2 OMPF field codes

| FC | Category | APEX relevance |
|---|---|---|
| 30 | Procurement (contracts, enlistment, reenlistment) | |
| 31 | Classification and assignment | |
| 32 | Administrative remarks (permanent-retention entries) | Page 13s |
| 33 | Separation and retirement | |
| 34 | Miscellaneous professional service history | |
| **35** | **Enlisted performance documents** (evals, FITREPs, member rebuttal, letters of explanation) | **A missing eval is FC 35** |
| **36** | **Training and education** (NAVPERS 1070/881, transcripts, school/corr-course certs) | **A missing school cert is FC 36** |
| **37** | **Decorations, medals, awards** (NAVPERS 1070/880, entitlement letters, **weapon qualification letters**) | **A missing award is FC 37** |
| **38** | **Adverse information** | |
| 39–45, 91, 99 | Emergency data, record changes, security clearances, security misc, medical (HIPAA), record requests, personal info, sexual offense accountability, misc/temporary | **Not routinely provided** — see §9 |

*Sources: MILPERSMAN 1070-080 CH-87 paras 3, 7 ("MHRRs in field codes 30 through 38 are provided to
selection boards"); MyNavyHR Selection Board Review page (9 enlisted categories, EMPRS).*
`RecordEntryForm.tsx:968` already says "field codes 30–38" — correct.

### 2.3 PSR

> `1610.10H para 17-4b`: "The PSR summarizes a Service member's professional and performance history…
> Selection boards use the PSR **with (not instead of)** the official digital record."

Three-part report on BOL: "professional history, performance history, and personal decorations"
(MyNavyHR user aid, 2 Nov 2022). Review annually and **at least 12 months** before a board.

**Exhibit 17-3 labeled callouts:** pay grade (blk 2), Duty Station (7), Primary Duty (29), Report Dates
(14 & 15), report length to nearest whole month, Reporting Senior name (22) / title (23) / rank,
Individual trait grades (33–39), **Individual trait average**, **Reporting Senior cumulative average**,
Promotion recommendation (43/46/48), PFA (20), Report Type (17–19).

**Two corrections that matter:**
- The **TRAITS band on the PSR is a histogram of trait counts by grade value (2/3/4/5)**, not the
  per-block grades. Verified arithmetically: 5 traits at 3.0 + 1 at 4.0 → IND 3.17.
- The labeled callout reads "**Summary group trait average**", not "distribution counts". The
  SP/PR/P/MP/EP counts *do* appear in the data rows — but do not attribute the phrase "distribution
  counts" to Exhibit 17-3 in demo copy.

**A clean PSR never substitutes for a missing OMPF image.** Hand-typed PSR data must not silently
satisfy a completeness check that really requires a filed document.

### 2.4 ESR — a data source, never a board document

> MyNavyHR user aid: "**IMPORTANT: Your ESR is NOT used in the Selection Board Review process**,
> although documents printed from your ESR and accepted into OMPF are viewed by Board members."
>
> "OMPF, ESR, and PSR are separate and distinct systems. **Never take for granted that information
> contained in one system is shared by the other two.**"

**Two routes from ESR to the board:**

1. **Reenlistment closeout** — a system-to-system NSIPS→OMPF upload. 30–60 days after reenlisting,
   these should appear: Honors and Awards → NAVPERS 1070/880; Training Summary → 1070/881; Member Data
   Summary → 1070/886; History of Assignment → 1070/605; Reenlistment Contract 1070/601; Permanent
   Page 13s 1070/613. **"Information not 'Verified' in ESR will not populate to the above documents."**
2. **LTB enclosure** — "You may take a **screenshot of the ESR page** and add as an enclosure to your
   Letter to the Board." This is the remedy for a Sailor with good ESR data who has not reenlisted.

**Three distinct states a single `verified_in_ompf` boolean collapses:** not in ESR at all / in ESR but
unverified / verified in ESR but never closed out to OMPF. Each has a different fix.

### 2.5 NDAWS and awards

> "BUPERS Online (BOL) Navy Department Awards Web Service (NDAWS) is the **authoritative source** for
> Navy Personal, Unit, Campaign, and Expeditionary medals data."

| Award tier | Managed in | By whom |
|---|---|---|
| Campaign, Expeditionary & Service (CE&S); Unit Decorations | **NSIPS ESR** | Command Admin / Personnel rep |
| **Navy Achievement Medal and higher** | **NDAWS** | Command NDAWS Administrator, NPC Awards Office, or DON Awards Office |

> "Awards must display as **GREEN 'Verified'** or will not print on NAVPERS 1070/880."
> "An award entered into NDAWS should reflect in ESR the following week."

**Remediation script (directly shippable):**
- "Your current command's NDAWS Administrator can add missing or correct awards issued by a previous
  command, referencing a copy of the **OPNAV 1650** and the issued/reissued certificate/citation."
- Wrong nth award → ask the awarding authority to **re-issue** the certificate/citation; if NDAWS is
  still wrong a week later, give the reissued copy to the command NDAWS Administrator.
- Documents entered via NDAWS **after May 2020** → NPC Awards Office.
- Unit-award discovery: NDAWS "**Search Awards**", command websites, message traffic.
- OSR/PSR award data corrections: **BUPERS 072** (`mill_p33awards@navy.mil`) only — **not** NDAWS
  Administrators, **not** the NPC Awards office.

**Real verification is a three-step chain:** right system for the tier → GREEN "Verified" → printed to
1070/880 and accepted into FC 37. Ask which step the Sailor actually confirmed.

### 2.6 The Letter to the Board (LTB)

**Hard rules (block on these):**

| Rule | Verbatim |
|---|---|
| Must originate from the candidate | "Communication to the board **must originate from the individual member** and must be accompanied under the candidate's signed LTB." (1106) |
| Must be signed | "An LTB must either be digitally-signed using the candidate's military identity certificate or have a hand-written signature. **Unsigned LTBs will not be presented to board members.**" (1106b) |
| No third-party correspondence | "Third party correspondence is any communication to the board which is not accompanied by a candidate's signed LTB and **will not be presented to the board**. **Commands are not authorized** to submit a message to NAVPERSCOM requesting information be presented to the board." (1106c) |
| Deadline is absolute | "Information received that is not under a signed LTB or not received at NAVPERSCOM by the deadline listed in the NAVADMIN **will not be presented to the board**." (1106d) |
| No classification markings | Attachments must be PDF and "must not contain classified information, including any markings regarding the same. LTBs and attachments containing such markings will not be presented to the board and **may subject the submitter to disciplinary action**." (NAVADMIN 220/19 6b) |

**Advisory rules (drafting heuristics — do NOT implement as hard validation errors):**

- "Candidates **should not** include items in the LTB that are already included in the OMPF or PSR
  unless the OMPF version is unreadable or the PSR is incorrect. Submitting an LTB to only state that
  the candidates OMPF and PSR have been verified and is correct **is not desired**." (1106a)
- "There is **no requirement** to submit LTBs to any board. LTBs should only be utilized to clarify
  official military records or to add information that is missing and/or not filed within official
  military records (e.g., letters of recommendations, missing evaluations, fitness reports, awards,
  etc.)." (NAVADMIN 220/19 para 7)
- Multiple LTBs are accepted; "**duplicate submissions … are discouraged**" (220/19 6c). Do not
  encourage regenerate-and-resend.
- An LTB is not required if the OMPF and PSR are up to date (PERS-803 FAQ #14).

> **The generative brief for an LTB drafter is the DIFF** between what the Sailor has and what is
> actually filed — which is exactly what APEX's gap analysis already computes.

**Format (1430.16H Figure 11-1):**

```
From: IT1(SW) Phillip S. Selectme, USN, XXX-XX-XXXX
To:   President, FY-XX Active/Reserve E-7/E-8/E-9 Selection Board #XXX
Subj: INFORMATION FOR CONSIDERATION BY THE SELECTION BOARD
Ref:  (a) NAVADMIN ____/___
Encl: (1) Item 1  (2) Item 2  (3) Item 3

1. Per reference (a), enclosures (1) through (3) are forwarded for consideration.
2. [factual statement of a discrepancy]
3. [corrective action already initiated — e.g. PERS-313 / PERS-32 engaged]

(Legal Signature)
```

**Rhetorical pattern = the style constraint:** state the discrepancy factually, then the corrective
action already initiated. No adjectives, no self-praise.

> ⚠️ **Figure 11-1 shows an SSN placeholder and is stale.** Current guidance requires the **10-digit
> DoD ID**: "All LTBs and each enclosure must contain the candidates full name and 10-digit Department
> of Defense Identification number" (NAVADMIN 100/25 para 7b); MyNavyHR: "you must use your full
> 10-digit DoD identification number (preferred)". **An LTB drafter that copies Figure 11-1 literally
> emits an SSN — a real privacy defect.**

**Submission:** ESSBD via MyNavy Portal (`https://www.mnp.navy.mil/group/my-record`) or BOL is
preferred and shows whether the letter was accepted. Fallback if ESSBD is unavailable: encrypted
e-mail to **`HRSCSELBOARD@us.navy.mil`**, DOD SAFE (`https://safe.apps.mil/`), or postal mail to
MyNavy Career Center / President, FY-XX Active-Duty [E7/E8/E9] Selection Board #[xxx] / 5720 Integrity
Drive / Bldg 768 Rm 302 / Millington TN 38055. "Certified or registered mail is not advised due to
delays in handling." "Please do not send communications with promotion selection boards to your
detailer or other PERS code." Cover letters must be signed wet or CAC with DoD ID displayed.

> The same MyNavyHR page contradicts itself — a footnote near the Sponsor link says to use
> `cscselboard@navy.mil` instead. The page body says `HRSCSELBOARD@us.navy.mil` five times; treat the
> footnote as stale.

**Deadlines are per-board.** Never hardcode. Baseline rule of thumb (NAVADMIN 220/19 6a): statutory
officer boards are **NLT 2359 CT, 10 days prior to convening**; "Generally, administrative boards will
follow, at a minimum, the statutory officer deadlines." Practical test: **if the board is not in the
ESSBD drop-down, the deadline has passed.**

**Documents are destroyed after the board.** `1610.10H para 17-9`: "Any documents submitted to a
selection board will be **shredded** upon completion of their respective board and will not become
part of their official record." Same paragraph: "Procedures for communicating with enlisted boards are
contained in the **NAVADMIN** announcing the E-7, E-8, and E-9 selection boards for each fiscal year."

### 2.7 Correction routing table

| Problem | Route to | Notes |
|---|---|---|
| Missing document not in OMPF | **Command / ESO → BOL eSubmission** | "MHRR will be submitted … using the 'eSubmission' application on BUPERS Online (BOL)." Mail is a fallback only. "Do not include letters of transmittal or explanation." (1070-080 4b, 4e) |
| Erroneously filed / clerical error / illegible / regulation-mandated correction | **PERS-313** | Requires name, SSN, **digital document identification number** (from OMPF Command View / My Record), detailed summary, documentary evidence. **"The burden of proof rests with the submitter … General allegations of error are inadequate."** (1070-080 5b, 5c) |
| Command-initiated OMPF correction | **BUPERS-072 → PERS-313** (sequential, not alternative) | Command verifies with BUPERS-072 and NSIPS; "BUPERS-072 will forward the change to PERS-313." (5d) |
| FITREP/CHIEFEVAL/EVAL vs PSR discrepancy | **PERS-32** | Letter with FROM/TO dates + RS name, marked PSR copy, report copy. **PERS-32 can correct administrative data only.** (1610.10H 17-5) |
| **RSCA / promotion recommendation / summary group average** | **NOT administratively correctable** | "A member **may not** request NAVPERSCOM to change any evaluative mark or comment or any administrative or evaluative data that would modify summary group averages, the reporting senior's cumulative average, or place the member in another promotion recommendation summary group." (17-5) → ch. 15 appeal or nothing. |
| PMA / RSCA PMA computation error | **NETPDC Records Administrator via NSIPS EAW PAC** | CO/OIC letter of correction + evals covering the whole period + (E-6/E-7) **RSCA PMA calculator**. Sample letter figure 3-2. (1430.16H 312d) |
| Award points (E-5/E-6 only) | **NETPDC via NSIPS EAW PAC** | CO/OIC letter + NAVPERS 1070/604, 1070/880, DD-214, 1070/613, certificates/citations. (312e) |
| Awards in NDAWS / ESR | **Command NDAWS Administrator** (NAM and higher) or **Command Admin** (CE&S, unit) | §2.5 |
| OSR/PSR award data | **BUPERS 072** | §2.5 |
| Selection board eligibility / INVAL profile sheet | **PERS-802** | Escalate after command/ESO. |
| Cycle record, ESVR, profile sheet | **NETPDC N321** | |
| Special Selection Board | **PERS-803** via the CO | §2.9 |
| Anything else substantive | **BCNR** (MILPERSMAN 1000-150) | **Never a before-the-board action.** |
| Everything, first stop | **Command ESO** | Designated in writing by the CO; responsible for "accuracy and completeness of Sailors' records (i.e., evaluations and awards posted to NSIPS, OMPF, NDAWS, PSR, etc.)" and is the liaison to NETPDC for corrections. (1430.16H 103a(6)(b), 103a(9)) |

**Contacts come from the cycle NAVADMIN, not the manual** (the manual's addresses are stale).
NAVADMIN 075/26 para 10: MNCC **(833) 330-6622** / `askmncc@us.navy.mil`; PERS-802 **(901) 874-4537** /
`NPC_enlisted_selbd_elig.fct@navy.mil`; NETPDC N321 **(850) 473-6148** /
`usn.pensacola.netpdc.mbx.netpdc-n321-discrepancies@us.navy.mil`.

**The ESO — not the career counselor — is the record liaison.** The career counselor is not named in
that role anywhere in 1430.16H.

### 2.8 Record access and review timing

| Item | Detail |
|---|---|
| **OMPF** | `https://www.bol.navy.mil` → "Official Military Personnel File (OMPF)-My Record". Requires a DoD level-3 PKI certificate and a BOL account. **"Download OMPF"** button yields the entire OMPF as individual PDFs in a single WinZip — this is the realistic way a Sailor produces the document set APEX's upload path wants. (1610.10H 17-4a) |
| **Prep sort** | "To prepare for an Enlisted Selection Board Review, **sort OMPF by Field Codes 30 through 38** and then verify the accuracy and completeness." |
| **Continuity** | BOL → CCA/FITREP/Eval Reports → **Performance Evaluation Continuity Report** (`https://www.bol.navy.mil/CCA/`). "You should see at least one performance report per year." |
| **Rejected evals** | "If the reports are rejected, a **numerical error code** should appear in the status block on the member's BOL continuity." Decoder: `https://www.mynavyhr.navy.mil/Career-Management/Performance-Evaluation/Error-Codes-Reasons/`. PERS-32: (901) 874-4881/4882/3313, DSN 882. |
| **180-day trap** | PERS-32 files an uncorrected rejected report "as is" if the command fails to respond to reject notification after 180 days. (Encl (1) para 21) |
| **Review deadline** | **"Complete this review at least 6 months prior to any board convening date to allow time to correct discrepancies."** (1610.10H 17-4) |
| **Recommended** | Review OMPF/ESR/PSR **annually and at least 12 months** before key career events (user aid). LaDR checklist: "every six months after promotion to Second Class … imperative that this is accomplished six months prior to a selection board." |
| **Verification cadence** | Candidates verify the profile sheet **continuously**; commands verify the ESVR **weekly through the projected board adjourn date** (1101a). ⚠️ Paras 702c(1)/702d(1) say "until the board **convening** date" — **use the longer adjourn cadence and cite 1101a.** Sailors can register for automatic profile-sheet update notifications on the MNP profile sheet page. |

### 2.9 Special Selection Boards — why acting before the LTB deadline matters

> `1430.16H 1112a(1)`: SSBs consider "individuals who were not properly considered … due to
> circumstances **beyond their control**. For example, being excluded from consideration …, considered
> … in the incorrect competitive category, or there was an administrative error that was not the direct
> or indirect result of the candidate's error, delay, or omission **and could not have been addressed
> via LTB**."
>
> `1112a(2)`: "Enlisted SSB eligibility terminates **2 years** after the regular board results are made
> public." (Only exception: a BCNR request filed within the 2-year window.) "Decisions made by DEP
> CHNAVPERS regarding eligibility are final."

**Anything that COULD have been fixed by an LTB is not SSB-eligible.** This is the strongest sourced
argument APEX has for acting before the LTB deadline. Requests go to **PERS-803 via the CO**
(figure 11-2).

---

## 3. The evaluation system

### 3.1 Forms and trait blocks — **as printed on the forms**

| Blk | EVAL (NAVPERS 1616/26, REV 05-2025) | CHIEFEVAL (1616/27, REV 05-2025) | FITREP (1610/2, REV 05-2025) |
|---|---|---|---|
| 33 | PROFESSIONAL KNOWLEDGE | TECHNICAL MASTERY *(COMPETENCY)* | PROFESSIONAL EXPERTISE |
| 34 | QUALITY OF WORK | INSTITUTIONAL EXPERTISE *(COMPETENCY)* | **COMMAND OR ORGANIZATIONAL CLIMATE** |
| 35 | **COMMAND OR ORGANIZATIONAL CLIMATE** | PROFESSIONALISM *(CHARACTER)* | MILITARY BEARING/CHARACTER |
| 36 | MILITARY BEARING/CHARACTER | INTEGRITY *(CHARACTER)* | TEAMWORK |
| 37 | PERSONAL JOB ACCOMPLISHMENT/INITIATIVE | **ACCOUNTABILITY** *(CHARACTER)* | MISSION ACCOMPLISHMENT |
| 38 | TEAMWORK | DECKPLATE LEADERSHIP *(CULTURE)* | LEADERSHIP |
| 39 | LEADERSHIP | TEAM EFFECTIVENESS *(CULTURE)* | TACTICAL PERFORMANCE |

*Sources: `/srv/apex/public/navpers-1616-26_2025.pdf`, `chiefEvalBlank.pdf`, `fitrepBlank.pdf` — block
by block from the text layer.* CHIEFEVAL title: "EVALUATION & COUNSELING RECORD (E7-E9)".

> ⚠️ **The string "EQUAL OPPORTUNITY" does not appear on any of the three forms.** `grep` returns zero
> hits. "Command or Organizational Climate/Equal Opportunity" is the **instruction's** wording. Use the
> form's label when claiming to match the form; use the instruction's when quoting the instruction.
> **The FITREP has seven trait blocks (33–39), not eight.**

### 3.2 The 3.0 gate

> "Command or Organizational Climate and Equal Opportunity (FITREP/EVAL) and **Accountability
> (CHIEFEVAL)** must be evaluated as **3.0 or higher** to maintain eligibility for advancement and
> receive a recommendation of Promotable." (1610.10H Encl (2) ch. 1, EVAL BLOCK 45 / FITREP-CHIEFEVAL
> BLOCK 48, p. 1-16)

On the CHIEFEVAL the gate attaches to **Block 37 = ACCOUNTABILITY**. There is no separately-named EO
trait on the E7–E9 form.

### 3.3 Promotion recommendation gates

> "A **Promotable** promotion recommendation allows **up to two traits, excluding Character or Equal
> Opportunity**, to be assessed as Progressing (2.0) and still maintain an overall evaluation and
> promotion recommendation of Promotable. This means a member who receives one or two 2.0 trait grades
> **cannot receive a promotion recommendation higher than Promotable**… A recommendation of **Must
> Promote or Early Promote may not be assigned with any trait assessed as 2.0**. A **Promotable or
> higher recommendation may not be assigned with any trait graded 1.0**."

**Therefore: three or more 2.0s bar Promotable outright**, and a 2.0 in **Character** (Military
Bearing/Character) bars Promotable just as an EO 2.0 does.

**Progressing lockout** (`16-2b`): "'Progressing' may not be marked if a 'Promotable' or higher
advancement recommendation is already in effect in the current grade, **even if the recommendation came
from a previous command**. If a mark of 'Progressing' is made in violation of this rule, the
advancement recommendation will continue in effect, but **the report must be returned to the reporting
senior for correction**." Withdrawal requires a Significant Problems report first.

**Block 45 → PMA conversion:** Early Promote 4.0, Must Promote 3.8, Promotable 3.6, Progressing 3.4,
Significant Problems 2.0. (1430.16H para 308)

**NOB rule** (`6-3`): "An Observed report with an 'NOB' promotion recommendation **cannot** be submitted
if the member receives a 1.0 in any trait, a single 2.0 or below in Command or Organizational
Climate/Equal Opportunity or Character, three 2.0 trait grades, or adverse information in the
comments." All traits graded on an NOB report **are** added to the RS cumulative average.

### 3.4 Forced distribution

> "**Early Promote** (all paygrades except non-LDO O-1 and O-2) – **Twenty percent** of each summary
> group (rounded up to nearest whole number)."

| Band | EP + MP combined cap (rounded up) |
|---|---|
| E1–E4 | No limit |
| **E5–E6** | **60%** |
| **E7–E9** | **50%** |
| W1–W2 | No limit |
| W3–W5 | 50% |
| LDO O1–O2 | No limit |
| O3 | 60% |
| O4 | 50% |
| O5–O6 | 40% |

Promotable is uncapped. "Must Promote recommendations may be increased by one for each Early Promote
quota not used." **"All summary groups of two can receive one Early Promote and one Must Promote."**
(1610.10H Encl (2) ch. 1, p. 1-17; Table 1-2 pp. 1-18/1-19)

**Arithmetic (independently re-derived across all 30 rows of Table 1-2):**
- `EP = ceil(0.2 * N)` reproduces the EP column exactly.
- `MP = ceil(cap * N) - ceil(0.2 * N)` reproduces the MP column exactly (N=4→2, N=10→4, N=26→10, N=30→12 for the 60% tier).
- **N=2 is a genuine special case** — the formula yields 0 MP for the 50% and 40% tiers but Note 1 grants 1.
- Note 2's MP declines at N=6/16/26 for the 50%-tier bands **fall out of the formula automatically** — no special case needed.
- Above N=30 the instruction gives worked arithmetic (42 E-6s: EP+MP = 42×0.6 = 25.2 → 26; EP = 42×0.2 = 8.4 → 9; MP = 26−9 = 17).

### 3.5 Summary group (enlisted) — Table 1-4

Reports group together only when **all** of these match: Block 2 Rate ("Group by current paygrade,
**regardless of rating**"); **Block 5 Duty/Competitive Status** ("For enlisted, group ACT and TAR
together, group INACT, AT/ADOS separately"); Block 6 UIC; Block 8 Promotion Status; Block 15 To
(ending date); Blocks 17-18 Type of Report; **Block 21 Billet** ("Group by entry in this block");
Block 22 Reporting Senior; Block 45EV/48CE Promotion Recommendation ("Must have Observed promotion
recommendation. **Do not include NOB promotion recommendations in a summary group**").

> **Table 1-4 is the ENLISTED table. Table 1-3 is the OFFICER table.**

**Anti-abuse** (`2-7`): delegation of reporting senior authority "must not be solely for the purpose of
reducing the summary-group size or increasing the promotion quotas."

### 3.6 RSCA

> Precept App A para 7.e: "The **Reporting Senior's Cumulative Average (RSCA)** is the reporting
> senior's historical trait average of all Sailors (active-duty and reserve) within a paygrade. Board
> members shall **compare the RSCA to the candidate's individual trait average** (as evaluated by that
> reporting senior) to determine the candidate's level of performance. Board members shall **also
> compare the individual trait average to the summary group** being reported."

**Two directed comparisons**: ITA vs RSCA, and ITA vs summary group. **APEX models the SECOND only.**
The first was removed from scoring in PR #37 and the sentence here previously said the opposite.

Why it was removed, and what that costs. `rsca` is typed by the Sailor into
`member_board_records.eval_context`, and as a scored input it created a withholding channel with **no
confidence signature at all** — measured on one record with the summary-group average present, typing
it honestly at 4.4 scored 60.6 while leaving it blank scored 71.4, with every factor confidence and
the coverage number identical. Nothing any gate reads changes, so no threshold can catch it; deleting
the input was the only complete fix. It penalised exactly the Sailors who filled it in.

What is lost is real and is the reason this note exists. **RSCA is the only axis that can see a
generous reporting senior.** The summary-group average is computed *within* a group, so an RS who
inflates everyone inflates the SGA too and the comparison cancels; RSCA spans every Sailor that RS has
graded and does not. Restoring it needs a source APEX does not have — the instruction publishes no
formula (see below) and there is no NSIPS or PSR feed — not a smaller coefficient.

**And the surviving axis is weaker than its label.** APEX's "summary group average" is pooled by
`service.ts` from other APEX users' self-entered finalized evals sharing a `summary_group_id`, and it
does **not exclude the subject's own row**. Measured at ITA 3.40: an honest group of 10 with SGA 4.00
scores 38.1; a group of one — only the subject, so SGA equals their own ITA — scores 57.0; a group of
two with one weak peer scores 63.5. That is +25.4 at full coverage, rendered as "compared to your
summary group". Pre-existing, and out of scope for #37 — but with RSCA gone the SGA carries the whole
comparison axis, so its provenance now matters more than it did.

**RSCA facts:**
- **No formula is published anywhere.** The EVALMAN never states how NAVPERSCOM computes it; the
  MyNavyHR RSCA page only explains how to request the report. `grep` across the full 173-page
  instruction confirms.
- **APEX must never compute RSCA from the evals it holds** — RSCA spans every report a reporting senior
  has ever written, and **Concurrent reports are excluded** (`4-7c`: the RS cumulative average "is not
  affected by Concurrent reports"; on a Concurrent/Regular endorsement it "is still based on the
  Concurrent reporting senior").
- **E-5/E-6 only:** "Reporting seniors must incorporate their post summary group (PSG) reporting senior
  cumulative average (RSCA) score for E-5 and E-6 evaluations into **block 43** (Comments on
  Performance). **This RSCA score will be on the last line of the comments.**" (`13-4g(5)`)
- Conflict rule: "In cases where the RSCA value documented in evaluation block 43 differs from the RSCA
  provided by NSIPS after an evaluation has been accepted and processed by PERS-32, ESOs must use the
  **NSIPS ESR RSCA value**" (1430.16H 308 Note 1).
- **A missing RSCA zeroes the RSCA PMA** and "will be considered a **discrepancy until resolved by the
  command**" — a high-value, command-fixable defect APEX can detect.
- Release is restricted: "A Reporting Senior's Cumulative Average **cannot be given to anyone other
  than the Reporting Senior** unless so stated in the Reporting Senior's request." A Sailor generally
  **cannot obtain their RS's RSCA report**. Legitimate Sailor-accessible sources: the PSR's **R/S CUM**
  column, and (E-5/E-6) the last line of Block 43.

### 3.7 Continuity of reports

> `3-2` (CH-2 text): "**The Regular report is the only report that provides continuity.** The Regular
> report must be continuous for all active and drilling reserve service, except for initial entry
> training… **Begin each Regular report on the day following the ending date of the previous report.**
> Regular reports, including letter extensions, **may not cover more than 15 months** without PERS-32
> approval."
>
> `17-2`: "Members are responsible for ensuring the continuity of their FITREP, CHIEFEVAL, or EVAL
> record."

**Sourced thresholds, replacing any heuristic:**
- A break = **any day not covered by a Regular report** (day-after-day-before rule).
- **Any single report period over 15 months is itself a defect** requiring PERS-32 approval.
- **Concurrent and Operational Commander reports do NOT plug a gap** — exclude them from coverage math.
  (A standalone **Concurrent** report **may legitimately exceed 15 months** — so the 15-month check must
  be report-type-aware.)
- **Letter extensions**: up to **3 months cumulative** (including terminal leave), and may not push the
  total period past 15 months; "may not change or add to the performance traits or grade/rate,
  comments, or promotion recommendation … but **may add to the duties performed and qualifications
  attained (block 29)**." (`3-3`)
- **Periodic omission** (`3-5a`): if an Observed Regular report ended ≤3 months prior, the Periodic may
  be omitted and the period rolls into the next Regular report.

**A gap DOES NOT DISQUALIFY.** `1610.10H para 17-6`, verbatim:

> "Missing FITREPs, CHIEFEVALs, or EVALs **do not disqualify** a member before a selection board, but
> missing reports can make the work of the board more difficult. **As a minimum, a member should attempt
> to obtain any missing report covering significant duty in the grades of E-5 or above within the past
> 5 years.**"

The precept says the same from the board side (App A 7.a): "any gap, regardless of its duration,
results in a **period of undocumented performance**" — absence of evidence, not a negative mark. And
7.b: breaks from **Career Intermission Program** or release from active/inactive duty "should be
considered as a natural part of a candidate's history of assignments and **shall not be viewed
negatively**. Board members shall evaluate these records in the same fashion as other candidates who do
not have a break in service." Precept App A 7 adds: "**If there is missing information in the record,
board members shall evaluate the record with what is available.**"

**Remediation** (`17-6a`, `17-6b`, Exhibit 17-4):
1. **Preferred:** send a copy of the original report to **PERS-32** — must display all required
   signatures, initials and dates, with a signed cover letter requesting it be filed.
2. **Fallback:** a **one-page letter** to PERS-32 explaining why the report could not be obtained,
   providing what should have appeared in **blocks 1-19 and 22-26**. "The letter may mention
   qualifications attained during the period, but it **may not evaluate or grade the member's own
   performance or include any self-recommendation** for assignment or promotion… Letters in lieu of
   Regular reports will be accepted **only if they fill a gap in Regular report continuity**. A letter
   in lieu of a Concurrent or Operational Commander report **will not be accepted**."

> **Both the LTB and the letter-in-lieu prohibit self-evaluation and self-recommendation. Any LLM
> drafting either will want to violate exactly that.** Put it in the system prompt AND in a
> post-generation check.

### 3.8 ⚠️ CH-2: periodic reports no longer required at the top of the ladder

> **NEW in CH-2 (26 May 2026), para 3-5b:** "Periodic (annual or semi-annual) Fitness Reports (FITREPs)
> and Evaluations (EVALs) are **no longer required** for members who have achieved the highest paygrade
> possible within their respective communities." — **E-9, CWO5 (W-5), and LDO serving in permanent grade
> of Captain (O-6)**. Commands "should not project a periodic report for eligible members."
> Detachment of Individual / Detachment of Reporting Senior reports **remain mandatory**.
>
> **Para 3-4a:** CMDCMs carrying the **8CMC NEC** who report directly to a flag or general officer
> "will no longer receive periodic or detachment of individual reports."

**Encl (1) Table 1 was not updated** — it still lists E-9 in April and O-6 in July. **Chapter 3
governs.** An E-9 with no April periodic has a **correct** record, not a gap. E-9s are exactly who an
E-9 board reviews.

### 3.9 Periodic report calendar (Encl (1) Table 1, effective through 31 Dec 2026)

> "FITREP ending dates are the **last day of the month** for all officers. CHIEFEVAL and enlisted EVAL
> ending date is the **15th day of the month**." (Tables at pp. 12 and **12a** — the instruction's own
> prose misstates this as "page 13".)

| Month | Officer | Enlisted |
|---|---|---|
| Jan | O-3 | |
| Feb | O-2 | |
| Mar | W-3/W-4/W-5 | E-5 |
| Apr | O-5 | E-9 *(but see §3.8)* |
| May | O-1 | |
| Jun | | E-4 |
| Jul | O-6 *(but see §3.8)* | E-1/E-2/E-3 |
| Sep | W-1/W-2 | **E-7 and E-8** |
| Oct | O-4 | |
| Nov | | **E-6 and E-8 (CMDCS)** |

**Table 1A, effective 1 Jan 2027:** O-6 moves 31 Jul → 31 Mar; O-5 moves 30 Apr → 30 Jun. All other
dates unchanged.

An E-7 report ending 15 Sep is **on-cycle**, not special.

### 3.10 Report types and occasions

**Special report occasions run a through m** (`3-9`, CH-2 pp. 3-5 to 3-7a):

| | Occasion |
|---|---|
| a(1) | Promotion-selection-board eligibility — **Officers and CPOs**, 3 months of significant duty under a new reporting senior |
| a(2) | Promotion-selection-board eligibility — **Enlisted E-6 only**; "may not be used to recompute a performance mark average score or to establish board eligibility" |
| b | Elimination of physical readiness deficiency |
| c | Appointment to officer status |
| d | Submission/withdrawal of advancement recommendation or establishing a PMA |
| e | Misconduct |
| f | Fleet-up certification |
| g | Reduction in rate |
| h | Detachment of Reporting Senior (E-1 through E-6) |
| i | **Superior performance Special FITREPs on officers are PROHIBITED** |
| j | **Superior Performance or Recommendation for Special Program — enlisted only — PERMITTED** |
| k | PERS-32 request |
| l | Completion of medical postgraduate internship/residency |
| m | Non-deployability / IMR deficit |

**Justification must be the opening sentence of the comments; "A report without this statement will be
returned for correction."** Special reports may **not** be submitted for command screening,
transfer/redesignation, or continuation boards.

> **Do not tell a Sailor a superior-performance Special report is impossible** — 3-9j expressly permits
> it for enlisted members. The prohibition (3-9i) is officer-only, and the E-6-only restriction applies
> **only** to the promotion-selection-board occasion in 3-9a(2); CPOs are covered by 3-9a(1).

**Special evals for NWAE cycles** (1430.16H 308b): "prepare a special evaluation if a member's ESR does
not contain an evaluation report in the correct pay grade or with an ending date during the period
specified in the current examination cycle NAVADMIN." End dates: **31 Dec** (Jan exam), **31 Jan**
(SELRES Feb), **28/29 Feb** (Mar), **31 Jul** (SELRES Aug), **31 Aug** (Sep). New "A" school graduates
with no in-grade eval get a one-time PMA/RSCA PMA of **3.60** for that cycle only.
⚠️ "For BBA RKE participation, special evaluations **may not** be used to establish initial eligibility
or manipulate PMAs, but a special evaluation **may** be used to **reestablish** advancement eligibility
previously withdrawn."

**Concurrent reports** (`4-2d`, `4-3`): trait-graded when the assignment exceeds **90 days** (except
DUINS); **10–90 days** may be an NOB report; **under 10 days** should be covered by a PIM (ch. 12).

**Rater / senior rater** (`2-6`): EVALs on E-6 and below "should contain the signatures of a rater and
senior rater. The signature of the reporting senior is required… The rater should be Navy CPO for E-5
and E-6 personnel… **Raters do not sign FITREPs or CHIEFEVALs on officers and CPOs.** For E-4 and below
personnel, the rater may be an E-6." **"The senior rater may be omitted where the reporting senior is
the rater's immediate supervisor"** — do not hard-require a senior rater on every EVAL.

### 3.11 Block 43 / narrative rules

**Substantiation (instruction, `13-4`):**
- "a. Specifically substantiate **all 1.0 grades** and when **three or more traits are evaluated 2.0**.
  **Correlate the comments by block number** to the performance trait being discussed. General comments
  on the remainder of the evaluative blocks are required."
- "b. Substantiation of grades **below 3.0 in Command or Organizational Climate/Equal Opportunity or
  character**." — **broader than the form footnote**: sub-3.0 in Military Bearing/**Character** also
  requires substantiation.
- "c. … Substantiate any promotion recommendation of **Significant Problems** and any recommendation
  against retention."

**Printed form footnotes (verbatim — APEX's three `SUBSTANTIATION_NOTE_*` strings reproduce these
correctly; leave them alone):**

| Form | Footnote |
|---|---|
| EVAL 1616/26 Blk 43 | "All 1.0 marks, three 2.0 marks, and **2.0 marks in Block 35** must be specifically substantiated in comments. Comments must be verifiable." + "**Font must be 10 or 12 pitch (10 or 12 point) only. Use upper and lower case.**" |
| FITREP 1610/2 Blk 41 | "All 1.0 marks, three 2.0 marks, and **2.0 marks in Block 34** …" + **the same** pitch/case sentence |
| CHIEFEVAL 1616/27 Blk 40 | "All 1.0 marks and **2.0 marks in Block 33-39** must be specifically substantiated in comments. Comments must be verifiable." *(no pitch/case sentence)* |

**"Use upper and lower case" is enforced nowhere in APEX — an ALL-CAPS narrative violates both the EVAL
and the FITREP.**

**Style rules (`13-2`):**
- "Be concise. Comment space is very limited. **Bullet style is preferred**."
- "**Do not make everyone sound alike. Selection boards may discount narratives assembled from a list of
  stock comments** used for everyone in the command." ← template-generated bullets are exactly this.
- "**Continuation sheets will not be accepted. Limit comments to the space on the form.**"
- Be consistent between trait marks, comments and summary-group breakdown. ← superlatives over a
  mediocre trait average trip this, and APEX already holds the trait grades to check it.
- Everyday language; specific, measurable, verifiable examples; ranking in the comments field is
  authorized; limit acronyms.

**Required comment — declining performance (`13-4c(8)`):**
> "A decline in performance is defined as receiving **lower grades on two or more performance traits in
> the same paygrade by the same reporting senior on subsequent reports**. Comments should justify the
> decline. (a) **A change in promotion recommendation caused by forced distribution is not considered a
> decline in performance or an adverse report** and comments should explain as such. (b) Removal from
> leadership positions should be noted and explained."

**Prohibited comments (`13-5`) — refusal list for `lib/aiProvider.ts`:** previous failure of selection;
submission or withdrawal of resignation under honorable circumstances; unconcluded judicial or
nonjudicial proceedings; non-punitive letters of caution; investigations and investigative reports;
marital status, spouse, or family members; medical reports or summaries **including pregnancy** — and
members are not to be given a less favorable report solely because of medical issues.
*(Heading and paragraph location verified; individual sub-items are official-source at paragraph level,
not re-quoted verbatim.)*

**5.0 marks:** EVAL block 42 / block 49 require a **written explanation of marks 1.0 and 5.0** to be
forwarded, but para 13-4 never mentions 5.0. **APEX should NOT raise a Block 43 validation error on an
unexplained 5.0.** `traitStandards.ts` already handles this correctly.

### 3.12 Decline in performance — the precept's two definitions (carve-outs are paragraph-specific)

| | Precept App A **7.c** — TRAIT GRADES | Precept App A **7.d** — PROMOTION RECOMMENDATION |
|---|---|---|
| **Definition** | "A decline in performance is a drop of **two or more evaluation trait grades** by the same reporting senior on subsequent reports within the same paygrade or promotion status." | "A decline in performance also occurs when there is a **drop in promotion recommendation** by the same reporting senior on subsequent reports within the same paygrade or promotion status." |
| **Carve-out 1** | "If the comments specifically state it is not a decline in performance, the report is not considered adverse." | "If comments clearly state it is caused by **forced distribution**, it is not considered a decline in performance or an adverse evaluation." |
| **Carve-out 2** | "A decline in trait grades due to a **transfer between a command's shore and sea components with the same reporting senior** is not in itself considered a decline in performance or an adverse report." | — |

> ⚠️ **The forced-distribution carve-out attaches ONLY to 7.d (promotion-recommendation drop).** APEX
> must not apply it to a pure trait-grade drop. Both declines share the same scoping: same reporting
> senior, subsequent reports, same paygrade or promotion status.

### 3.13 Adverse material

| Rule | Detail |
|---|---|
| **Referral** | Adverse reports must be referred to the member for a statement — EVAL block 51, FITREP block 46, CHIEFEVAL block 49. |
| **10 days** | "The member must provide the statement to the reporting senior **within 10 days** after seeing the report" (`17-8a`). RS may allow a short extension but must not delay the summary group. |
| **2 years** | A statement to the record "must be submitted **within 2 years** after the ending date of the report." |
| **Silence = declination** | A member declining must do so in writing; failure to respond "will be considered a declination … and the report will be filed in the official record." |
| **Permanent** | **There is no expiry on the adverse report itself.** APEX's `adverse_count` must never decay with age. |
| **Supplements (ch. 15)** | 2-year window, two-page letter-supplement limit; supplements "are the report of record and should disregard the evaluative information on the original report." SUPP report type is visible on the PSR. |

**The board's rule (precept App A 8):**

> **8.a** — for candidates recommended for selection "who have received disciplinary action or whose
> official military personnel file contains matters relating to conduct or performance of duty that was
> **documented within the past 5 years (regardless of the date the underlying matter occurred)**, every
> board member in that respective tank shall be briefed on the adverse information contained therein
> prior to the final board decision. **Board members must differentiate between discriminators and
> adverse information** during review and briefing."
>
> **8.b (recovery doctrine)** — "we do not embrace blind adherence to a zero-defect mentality… Where a
> candidate has performed exceptionally well in the time subsequent to a reportable incident, I consider
> the test to be substantially met. Taking into account the candidate's entire career performance, the
> severity of the incident and the candidate's performance after the reportable incident, **as well as
> the amount of time that has passed** since the incident, you shall determine if the candidate has
> **fully recovered**. You should not automatically discount any candidate who, except for a single
> incident, would otherwise be considered best and fully qualified."
>
> **8.c** — adverse information related **solely to COVID-19 vaccine refusal** may not be considered.

> **The 5-year window is keyed to when the matter was DOCUMENTED, not when it occurred.** Load-bearing
> for implementation. Time-since-incident and subsequent performance are **explicitly mitigating** — a
> rubric that permanently tanks a record for one old incident misrepresents official guidance.

---

## 4. The LaDR — what it is and, more importantly, what it is not

### 4.1 Governing instruction

**OPNAVINST 1500.77A**, "LEARNING AND DEVELOPMENT ROADMAP FOR ENLISTED SAILORS," CNO (N12), **7 Apr
2017**. Cancels OPNAVINST 1500.77.

> Para 5.a: "The LaDR[s] are a **comprehensive career guide** for enlisted personnel that lists
> learning and development objectives, and milestones for the completion of these objectives, by
> paygrade and rating."
>
> Para 5.b: "LaDRs will be used to: (1) align required skills with individual career goals; (2) aid
> recruiters …; (3) **provide Sailors a well-defined path to advancement**, complete with directions for
> using required and recommended resources; and (4) improve retention through career counseling and
> deck-plate leadership."
>
> Para 3: "LaDRs are valuable tools for counseling and must be used as leaders' guides…"
> Para 4 (Scope): LaDRs are "a valuable tool for **recruiting, advancement, and retention**."
>
> Para 8: "This instruction will automatically expire **5 years from its issuance date** unless
> reissued or canceled prior to the 5-year anniversary date, **or an extension has been granted**."
> Annual review assigned to CNO (**N1**).

⚠️ Nominal expiry **7 Apr 2022**. A reissue or extension may exist — see §9.

**Ownership:** **NETC** is executive agent — "manage the development, approval, and implementation of
all LaDRs" and "ensure annual reviews are conducted" (6.c). COMNAVPERSCOM coordinates (6.d(1)).
**Attribute LaDR content to NETC, not Navy COOL.** COOL is the distribution channel.
Cadence: "LaDRs will be reviewed **annually** and updated as required" (5.c).

### 4.2 The LaDR is NOT a board document

**OPNAVINST 1500.77A contains exactly ONE occurrence of the word "board" in four pages** — and it is
the **Career Development Board** (6.g(1): "Ensure Sailors appearing before the career development board
have their LaDRs reviewed"). Zero occurrences of "selection", "precept", or "promotion board".

**The document in the board room is the ECP, not the LaDR:**

> Precept para 3: "Reference (a) [Enlisted Career Paths] will be provided in the board spaces in
> conjunction with the precept and convening order, to inform board members of specific requirements to
> be qualified and typical career milestones of the candidates within each paygrade and rating. **It is
> not expected that every candidate will meet the typical career path and guidelines depicted in
> reference (a).**"
>
> `1430.16H 1107a`: "The information contained in the enlisted career paths **is not a substitute for
> the guidance contained in the convening order and specifically must not alter the selection criteria**
> contained in the board precept and convening order."

PERS-803: ECPs "Outline a normal career path and some 'best qualified' items for each rating", are
"Prepared by ECMs with Fleet senior enlisted input", "Approved by **Deputy Chief of Naval Personnel**",
and "Posted on the NPC website."

**The LaDR itself defers to the precept.** IT E7 LaDR Selection Board Checklist Step 4: "…and **review
previous selection board precepts**." BM SELRES E6→E7 opens: "**Reference the standards from the most
recent CPO selection board precept and convening orders.**"

> **APEX must not present LaDR "Best Qualified" items as board criteria, and must not gate on them.**
> Correct framing: "what your rating community says the board rewards," with the precept cited as
> governing. The LaDR is a **defensible public proxy for the ECP**, nothing more.

### 4.3 File taxonomy (Navy COOL)

Index: `https://www.cool.osd.mil/usn/all_ladrs.html` — **709 unique LaDR PDFs, 81 rating prefixes.**

| Suffix | Count | Notes |
|---|---|---|
| `_e1` | 68 | |
| `_e2` | 5 | awf, awo, awr, aws, awv |
| `_e3` | 3 | eod, mu, nd |
| `_e4` … `_e9` | 79–81 each | **`_e7` exists for all 81 prefixes** |
| `_e1_e9` | 68 | combined |
| `_e2_e9` | 5 | awf, awo, awr, aws, awv |
| `_e3_e9` | 3 | eod, mu, nd |
| `_e4_e9` | 3 | ln, sb, so (+ mmn_ss_elt, mmn_sw_elt) |
| `_e5_e9` | 2 | ncc, ncr |

Additional stems break any `{rating}_{variant}` assumption: nuclear (`emn_ss`, `emn_sw`, `etn_ss`,
`etn_sw`, `mmn_ss`, `mmn_sw`, `mmn_ss_elt`, `mmn_sw_elt`), PACT (`a_pact_e1_e3`, `e_pact_e1_e3`,
`s_pact_e1_e3`), and standalone OaRS files (`sb_oars.pdf`, `so_oars.pdf`, `csel.pdf`).

> ⚠️ **15 ratings have no `_e1_e9.pdf`. Eleven of them are in APEX's 82-rating catalog: AWF, AWO, AWR,
> AWS, AWV, EOD, LN, MU, ND, SB, SO.** Verified live: `nd_e1_e9.pdf`, `mu_e1_e9.pdf`, `eod_e1_e9.pdf`,
> `awf_e1_e9.pdf` all return **HTTP 403**. See §8.

### 4.4 Structure

**Front matter is replicated into every paygrade variant.** `it_e7.pdf` vs `it_e4.pdf`: first 1050
lines differ by **4 lines — all page footers**. Every "Considerations for advancement" block for
E6→E7, E7→E8 **and** E8→E9 appears in an E-4's LaDR.

> **"It appears in the LaDR" ≠ "it applies to this Sailor."** APEX must filter on the `E{n}` in the
> section header. `parseLadr` already does via `applies_to_paygrades=[target]`. Keep that.

**The combined `_e1_e9` file is NOT the same as `_e7`** — 28 differing lines in the first 1050,
because the combined file interleaves an "Occupational and Readiness Standards (OaRS) to E4" block.
COOL: "Occupational and Readiness Standards (OaRS) are provided as a section within the E1/E2/E3
LaDRs." `it_e1_e9.pdf` contains OaRS, NAVEDTRA 44053, and 5 PENALTY STATEMENT blocks; the real
`it_e7.pdf` contains **zero** occurrences of all three.

**E7+ files are structurally different from E1–E6 files:** `it_e7.pdf` has "SELECTION BOARD CHECKLIST
FOR CPO PROMOTION TO SCPO" and 6× "PROFESSIONAL MILITARY EDUCATION" and **no** "RECORD REVIEW
CHECKLIST"; `it_e4.pdf` has the RECORD REVIEW CHECKLIST instead. **The Navy itself draws the
exam-advancement (E1–E6) vs board-selection (E7–E9) line inside the LaDR.** APEX's Record Readiness
Review is only coherent for E7+ and should say so.

**Component count VARIES by rating — do not assume three:**

| Rating | Components | Advancement sections |
|---|---|---|
| IT, BM | Active, TAR, SELRES | 9 |
| **CTI** | **Active, SELRES only** (zero occurrences of "TAR") | **6** |
| **HM** | irregular — 3 heading capitalizations + a non-standard "**E6 to Master Chief**" transition | **10** |

**Per-component revision stamps differ from the cover date.** All four E7 LaDRs checked carry cover
"July 2026" while internal blocks read "Revised: May 2025", "April 2025", or "August 2025" depending on
rating and component. IT Active/TAR = May 2025, IT SELRES = August 2025.

**FQ/BQ vocabulary is NOT standardized:**

| Rating | Heading style |
|---|---|
| IT (Active) | `Fully Qualified Candidates:` / `Best Qualified Candidates:` |
| CTI (Active) | `Fully Qualified:` / `Best Qualified:` |
| HM (Active) | `FULLY QUALIFIED:` / `BEST QUALIFIED:` (all caps) |
| **BM (Active)** | **No FQ/BQ headings at all** — numbered `1. Sea Assignments:` / `2. Shore Assignments (all)` with per-ship-class sub-lists |
| BM/HM SELRES | "Highly competitive/most fully qualified candidates … have met many or all of the following milestones" |

**Any regex keyed to one spelling silently yields nothing for most ratings.**

### 4.5 FQ vs BQ inside the LaDR

> IT (Active): "**Best Qualified Candidates: will have demonstrated sustained superior performance in
> one or more of the following categories, as well as those from the Fully Qualified list.**"
> IT (SELRES): "Completion of the Advanced Leader Development Course and Professional Military
> Knowledge Eligibility Exam are prerequisites for the E7 Navy Wide Advancement Exam and completion is
> **required to constitute a fully qualified candidate**."
> BM (SELRES): "**Fully Qualified candidates for selection MUST meet the following** …"

**FQ items are GATES** (unmet ⇒ eligibility risk, surface before any score). **BQ items are
DIFFERENTIATORS** (unmet ⇒ reduced competitiveness). APEX currently renders every LaDR row as an
equal-weight met/not_met toggle, collapsing a hard prerequisite and a nice-to-have into one signal.

### 4.6 Community Notes — board weighting hints the parser never touches

| Note | Verbatim |
|---|---|
| IT Note 8 | Civilian certifications "should continue to be used as a determining factor at selection boards, particularly when a candidate is serving in a **billet without the requisite training**." |
| IT Note 9 | In-rating watch qualifications "shall be given 'best and fully qualified' consideration **before** those watch qualification that are considered more operationally focused and out of rating." |
| IT TAR Note 8 | "EIWS and other warfare qualifications should be viewed as a **noteworthy achievement** by Selection Boards." |
| IT SELRES Note 6 | Warfare qualifications "are **not required** but should be viewed as a noteworthy achievement." |

**In-rate quals > out-of-rate quals. A warfare qual is noteworthy but NOT required.** APEX must not
treat a missing warfare qualification as a hard deficiency for a Sailor at a command with no program.

### 4.7 The LaDR's own record-review checklist — what APEX automates

| Step | Content |
|---|---|
| 1 | "This should be accomplished **every six months** after promotion to Second Class. However, it is imperative that this is accomplished **six months prior to a selection board**." |
| 2.a | "Selection board packages provide candidates the opportunity to submit any documents **missing** from the sections of their records which are viewed by the selection boards. **MILPERSMAN 1070-080** specifies which documents … Any documents the member has verified as missing … may be submitted as a selection board package." |
| 2.b | BOL → "Navy Personnel Command Document Services" → Start Process → Selection Board and LTB; **ESSBD** is the submission channel. |
| 3 | Systems to reconcile: **BOL** (OMPF; PSR and ESR), **NSIPS** ESR (`https://nsips.nmci.navy.mil`), **ETJ** via My Navy Portal, **NDAWS** via BOL, **PRIMS** under MNP "Performance" tab. |
| 4 | "Review qualifications that your rating values or requires … **Read the applicable NAVADMIN** for additional dates and information, and **review previous selection board precepts**." |

**Terms of art: "selection board package", "LTB", "ESSBD".**

### 4.8 Sea/shore and geographic diversity

The LaDR carries rating-specific sea/shore flow (IT: "**48/36** for first Sea/Shore tour, and **36/36**
for second tour and beyond. A well-diversified history of assignments (i.e., CONUS and OCONUS) are
critical for advancement."). **Pull the ratio per rating from the LaDR; do not hardcode one number.**

**The precept says the same in the board's own binding voice (App A para 6) — prefer this citation:**
consecutive tours in one geographic location "should **not** be viewed negatively, provided the
candidate has progressed in billet complexity, professional development and leadership
responsibility," and success "in varied geographic locations, **particularly overseas**, should be
viewed positively." OCONUS/FDNF sea duty "are extremely arduous and shall warrant additional favorable
consideration"; for expeditionary/NSW, "retours and/or back-to-back tours shall not be viewed
negatively."

### 4.9 Billet-blocked items

The LaDR hedges every unavailable item, once per paygrade band:

> "Complete paygrade commensurate watch/job qualifications **when available by assignment** (e.g., CWO,
> ISWO...)"
> "Complete Enlisted Warfare Qualifications, **when available**..."

**This is official acknowledgement that a Sailor on the wrong platform cannot execute the item.** Mark
it **blocked**, do not score it as a personal shortfall.

### 4.10 Negative finding: no vote bands anywhere in the LaDR

Searching four rating LaDRs (IT, BM, HM, CTI — E7, cover July 2026) and OPNAVINST 1500.77A for
"confidence vote", "vote band", "100/75/50", "numeric score", "confidence band" returns **zero hits in
every file**. **The LaDR gives APEX no cover for the officer vote-band analogy.**

---

## 5. What a Sailor can actually do

### 5.1 Controlled vs imposed

| Sailor-controlled | Command / RS-controlled | Not controllable at all |
|---|---|---|
| Verify OMPF/PSR/ESR/NDAWS/ETJ | Eval narrative and trait marks | RSCA of the reporting senior |
| Submit an LTB (signed, by the deadline) | Promotion recommendation | Forced-distribution quota |
| ESR screenshot as an LTB enclosure | eSubmission of missing documents | Board quota per competitive group |
| Request a NDAWS correction | Special eval (3-9j) | The field of competitors |
| Send transcripts to JST OPS | PERS-32 letter in lieu | Panel composition |
| Complete PMK-EE / ELD / SEA | RSCA entry in Block 43 (a **missing** one is a command-fixable discrepancy) | |

### 5.2 Fixed-calendar deadlines (PMK-EE / ELD — Table 2-2)

| Cycle | PMK-EE by | ELD by |
|---|---|---|
| **E-7 AD/TAR, January exam** | **30 Nov (prior year)** | **31 Dec (prior year)** |
| E-5–E-7 SELRES, February | 31 Dec (prior year) | 31 Jan (same year) |
| E-5/E-6 AD/TAR, March | 31 Jan | 28/29 Feb |
| E-5/E-6 SELRES, August | 30 Jun | 31 Jul |
| E-5/E-6 AD/TAR, September | 31 Jul | 31 Aug |

**ELD courses (Table 2-3):** E-3/E-4 **FLDC**, E-5 **ILDC**, E-6 **ALDC**, E-7 **CPO-LDC**.

- "All ELD courses are meant to be attended **once a Sailor is wearing the applicable rate** and cannot
  be completed prior to being frocked or advanced."
- "There is **no pay grade requirement for completing PMK-EE** for E-5 through E-7 (e.g., an E-3 Sailor
  can complete PMK-EE for E-5 through E-7 at any time)."
- ELD is required to sit the NWAE/RKE for E-6 and E-7 and to be eligible for selection to E-8. It is
  **not** an E-5 eligibility requirement.
- Table 2-2 Note: refer to the **selection board NAVADMIN** for the CPO-LDC completion deadline for
  advancement to E-8.

*(Source: 1430.16H paras 201c, 201d, Tables 2-2 and 2-3.)*

**These are the cleanest "achievable before your board" vs "too late, next cycle" discriminators APEX
can implement.**

### 5.3 The two-destination rule — LTB and PERS-802 do not share documents

> **SEA / 8SEA (1430.16H para 201e):** "SEA Course completion is a prerequisite to be selection board
> eligible (SBE) for **E-9**. Sailors who have completed the course should verify their ESR has been
> updated with the **8SEA** NEC. If NEC 8SEA does not reflect in the ESR of an E-9 candidate, the
> requisite course completion certificate must be made available to [**PERS-802**] via e-mail **and** the
> board president via **letter to the board (LTB)**. **LTBs are not made available to PERS-802.**
> Failure to send … to PERS-802 **and** to the board president via LTB will result in a candidate being
> **not considered** by the selection board."
>
> **EP TIR waiver (NAVADMIN 075/26 para 6.c):** the evaluation "must either be in the member's OMPF or
> submitted to PERS-802 via email. If not in the member's OMPF, the evaluation **must also** be
> submitted to the board president via LTB… **Documents forwarded to PERS-802 are not made available to
> the board and LTBs are not made available to PERS-802.** Failure to provide the evaluation as detailed
> will result in a candidate being not considered by the board."

**Generalize: LTB content is invisible to PERS-802, and PERS-802 submissions are invisible to the
board. Any eligibility-proving document must go to both.**

### 5.4 Education

> "Sailors competing for advancement to the pay grades of **E-5 and E-6** will be awarded two points for
> an accredited associates degree and four points for an accredited baccalaureate degree or above…
> Education points for multiple degrees are not cumulative; four points is the maximum."
>
> "Sailors must ensure transcripts with degree information are forwarded **directly from their academic
> institution** to the Joint Service Transcript (**JST**) Operations (OPS) Center."
>
> "The JST OPS Center will also provide **electronic verification of degrees which will update the
> performance summary record, part 1** for use by the **E-7 through E-9 selection boards**."

*(1430.16H para 703; corrections via NSIPS EAW PAC + CO/OIC letter + JST transcript, para 314.)*

**At E-7+ a degree adds no points — it helps by appearing on PSR part 1 via JST.** Never show a degree
as adding score at E-7+. The actionable item is "have the registrar send the transcript **directly** to
JST OPS" — the Sailor cannot self-upload.

**Award points are E-5/E-6 only** — profile-sheet legend: "AW Award Points (**E-5 and E-6 only**)."
"Verify your award points" is meaningless for an E-7/E-8/E-9 candidate.

### 5.5 Warfare qualifications — no Navy-wide timeline

**OPNAVINST 1414.9C** lists **11 warfare programs** with named sponsors (aviation, diving,
expeditionary, EOD, fleet marine forces, information warfare, SEAL, Seabee combat, special warfare
combatant-craft crewman, submarine, surface). "Each warfare program sponsor will establish and maintain
an instruction that delineates strict prerequisites and formal procedures…" and sponsors "will
establish **specific qualification and re-qualifying timelines**."

**The ONE sourced concrete duration is Fleet Marine Force (OPNAVINST 1414.4E para 7b):** AD and FTS
E-4 to E-9 within **18 months of command check-in** (E-1 to E-3 within 24 months); SELRES E-1 to E-9
within 24 months; returning personnel "have **12 months** to complete requalification from date of
assignment" (7b(4)); and candidates must "Have **no Non-Judicial Punishment for 6 months** prior to the
formal oral examination."

> **Do NOT print a single duration for "earn your warfare pin."** 18 months is sourced only for FMF.
> Applying it to ESWS/EAWS/EIWS would be an invented fact. The clock runs from **command check-in**,
> not from the board date.

### 5.6 CIP and other timing rules

- **Career Intermission Program:** "Eligibility for the first available regularly scheduled selection
  board requires waived candidates' **return from CIP at least 1 month prior** to the selection board
  convening date." (1430.16H **709e** (E-7) / **709f** (E-8/E-9) — chapter **7**, not chapter 5.)
- **Rating change:** the one-month rating-change rule is **PERS-803 FAQ #12**, not the NAVADMIN. The
  NAVADMIN gives a rating-change **deadline date**.
- **MAP:** COs/OICs of quota-awarded commands may advance "eligible personnel in the pay grades of
  **E-3, E-4, and E-5**" (para 1000), with a 30-consecutive-day assignment requirement and all
  requirements except the NWAE (1003a-b). **MAP cannot produce an E-7.** Quota- and CO-driven ⇒
  imposed, not controlled.

---

## 6. SEM — the second stage APEX does not model

### 6.1 The boards are screens, not selections, for most AC ratings

> NAVADMIN 075/26 para 2: "Unless exempted…, **AC eligible candidates will participate in the Senior
> Enlisted Marketplace (SEM) screening board.** Exempted candidates will participate in enlisted
> advancement selection boards."
>
> `1430.16H 1306`: "The SEM is a **billet-based advancement** process which aligns Sailors screened for
> E-7, E-8, and E-9 into billets of the next higher pay grade… Sailors screened for E-7, E-8, and E-9
> can then **enter the marketplace to compete for orders** to a billet of the next higher pay grade."

The boards are formally "**Advancement Selection/Marketplace Screen (AS/MS)**" boards.

**Board numbers:** #335 SELRES, #336 TAR, **#360 AC SEM screen board**, **#361 AC SEM exempted
ratings**. *(This numbering is not new for FY-27 — the FY-26 E-7 roster header reads "FY-26 Boards
#26360/26361.")*

> **APEX's "selection board"/"selected" language is stale for the majority path.** For most AC ratings
> the board SCREENS you to compete in a marketplace; advancement follows from winning a billet.

### 6.2 Exemptions

> `1430.16H 1307`: "Sailors in the following ratings or programs are **exempt** from SEM: Command Senior
> Enlisted Leader Program, **Nuclear (EMN, ETN, MMN)**; personnel currently assigned within the
> **Enlisted Aide Program**; **Flag Writer Program**; **musician (MU) E-7 only**; **special warfare
> operators (SO)**; **special warfare boat operators (SB)**; and **Reserve Component (TAR and SELRES)**
> Sailors."

**For exempt Sailors, selection IS the terminal outcome.** APEX must branch post-board guidance on
rating/program.

### 6.3 The 30-month clock and alignment

| Rule | Detail |
|---|---|
| E-8/E-9 | "All Sailors successfully screened for E-8 and E-9 must align to a billet at the next higher pay grade within their eligibility window. If alignment … is not attained after **30 months**, a Sailor's screened status will **expire** and be detailed in their current pay grade at PRD." (1311) |
| Frocked CPOs | "Frocked CPOs who have not selected orders within **30 months** will be **direct-detailed** to a CPO billet. Non-nuclear submarine rating frocked CPOs who have not selected orders within **12-18 months** will be direct-detailed." (1311a-b) |
| No shortcut | "**Screened status does not authorize Sailors to bypass their established detailing window.**" |
| Frocking | E-6 Sailors screened for E-7 who complete CPO induction are frocked on or around **15 September** each year. |
| **Merit screen** | Up to **15%** of screened E-8/E-9 candidates (or at least one per competitive rating) may be designated **merit-screened** — **asterisk on the NAVADMIN** — giving added preference when applying for senior/master chief jobs. **No merit status for E-7.** (1312a(3); FY27 E8/E9 CO para 2.b) |

### 6.4 ARA windows and cost

| Item | Detail |
|---|---|
| ARA windows | "open **four times a year**, starting the day after detailer selections and closing the day after TYCOM requisition review in the months of **January, April, July, and October**." |
| CPO window | "open from **16 September** and will close at the end of NAVPERSCOM requisition scrub phase in **October** of each year." |
| Billet requirement | "a valid, funded, and vacant billet at the next higher pay grade or will become vacant within **6 months or less**." |
| Blockers | "Request may not be submitted for Sailors with orders or orders pending release. **Sailors within 12 months of PRD** (order negotiation window) must utilize the Detailing Marketplace." |
| Cost — sea duty | "Sailors must incur OBLISERV and **extend their PRD 36 months** from the alignment/advancement date" (non-nuclear submarine: 12 months from current PRD). |
| Cost — shore duty | 36 months beyond current PRD. |

*(1430.16H paras 1312b, 1312c.)* **The "within 12 months of PRD" rule is a genuine eligibility blocker
APEX can compute directly from a user-entered PRD.**

---

## 7. Terminology

| Term | Expansion | One-line definition |
|---|---|---|
| **8SEA** | (NEC) Senior Enlisted Academy | NEC posted on completing SEA; prerequisite for E-9 SBE |
| **ACOA** | Area of Contingency Operations Assignment | Exam-waiver-eligible deployment zone |
| **ALDC** | Advanced Leader Development Course | E-6 ELD course; required for E-7 NWAE and E-8 selection eligibility |
| **AR / ARA** | Advancement Request / Advancement Requisition Application | SEM path for aligning to a next-higher-paygrade billet |
| **AS/MS** | Advancement Selection / Marketplace Screen | Formal name of the FY-27 senior enlisted boards |
| **BBA** | Billet-Based Advancement | Advancement tied to winning a billet; SEM is the BBA construct |
| **BCNR** | Board for Correction of Naval Records | Last-resort record correction; never a before-the-board action |
| **BOL** | BUPERS Online | Portal for OMPF, PSR, ESR view, NDAWS, continuity report |
| **BQ** | Best Qualified | Comparative standard applied to the FQ pool; six named considerations |
| **CCA** | (BOL) FITREP/Eval Reports application | Where the Performance Evaluation Continuity Report lives |
| **CDCZ** | Combat Zone / Designated Combat Zone | Exam-waiver-eligible zone |
| **CHIEFEVAL** | Evaluation & Counseling Record (E7-E9) | NAVPERS 1616/27; seven traits, blocks 33–39 |
| **CIP** | Career Intermission Program | Break in service; **must not** be scored negatively |
| **CMDCM / FORCM** | Command / Force Master Chief | Board SEA is drawn from these |
| **CO** | Convening Order | Per-paygraded CNP letter carrying quotas and the FQ/BQ standard |
| **CPO-LDC** | CPO Leader Development Course | E-7 ELD course; required for E-8 selection |
| **DCNP** | Deputy Chief of Naval Personnel | Approves Enlisted Career Paths |
| **ECP** | Enlisted Career Paths | Rating-specific reference **actually used in the board room** |
| **ELD** | Enlisted Leader Development | FLDC/ILDC/ALDC/CPO-LDC course family |
| **EMPRS** | Electronic Military Personnel Records System | Where OMPF document images live; boards view via EMPRS |
| **ESO** | Educational Services Officer | Command record liaison; first stop for eval/award/PSR fixes |
| **ESR** | Electronic Service Record | NSIPS record. **NOT a board document** — only what closes out to OMPF, or an LTB screenshot |
| **ESSBD** | Electronic Submission of Selection Board Documents | Preferred LTB submission channel (MNP or BOL) |
| **ESVR** | Examination Status Verification Report | Command-side eligibility report; verify weekly |
| **ETJ** | Electronic Training Jacket | Training record via My Navy Portal |
| **EVAL** | Evaluation Report & Counseling Record (E1-E6) | NAVPERS 1616/26 |
| **EVALMAN** | BUPERSINST 1610.10 series | Navy Performance Evaluation System manual |
| **EWS / PPWS** | Engineering Watch Supervisor / Propulsion Plant Watch Supervisor | Nuclear E-7 board prerequisites |
| **FC** | Field Code | OMPF filing category; **30–38 are board-visible** |
| **FDNF** | Forward Deployed Naval Forces | OCONUS sea duty; "extremely arduous", warrants favorable consideration |
| **FITREP** | Fitness Report | NAVPERS 1610/2; officers; seven traits |
| **FLOC** | Flag Letter of Commendation | Award; see §9 |
| **FMS** | Final Multiple Score | Composite that sets the exam-cycle cut; **no award points for E-7** |
| **FQ** | Fully Qualified | Threshold gate — failing it **disqualifies** |
| **HYT** | High Year Tenure | Hard eligibility gate; anchor 1 Sep (E-7) / 1 Jul (E-8/E-9) |
| **IND / R/S CUM** | Individual average / Reporting Senior cumulative average | Adjacent PSR columns; the board's directed comparison |
| **ITA** | Individual Trait Average | Compared to RSCA and to the summary group |
| **JST** | Joint Service Transcript | Degree verification path onto PSR part 1 |
| **LaDR** | Learning and Development Roadmap | NETC career guide. **Not a board document** |
| **LDO** | Limited Duty Officer | |
| **LTB** | Letter to the Board | **Only** method to communicate with a board; candidate-signed, deadline-bound, shredded after |
| **MAP** | Meritorious Advancement Program | CO-driven; E-3/E-4/E-5 only |
| **MHRR** | Military Human Resource Record | The document class filed in the OMPF |
| **MNCC** | MyNavy Career Center | LTB fallback intake; (833) 330-6622 |
| **MNP** | MyNavy Portal | ESSBD, profile sheet, ETJ, PRIMS access |
| **NDAWS** | Navy Department Awards Web Service | **Authoritative source** for personal/unit/campaign/expeditionary medals |
| **NEAS** | Navy Enlisted Advancement System | `neas.ncdc.navy.mil` — profile sheet self-check |
| **NEC** | Navy Enlisted Classification | e.g. N33Z (nuclear), 8SEA, 8CMC |
| **NETC** | Naval Education and Training Command | **LaDR executive agent** |
| **NETPDC** | Naval Education and Training Professional Development Center | Owns cycle record, ESVR, profile sheets; N321 for discrepancies |
| **NJP** | Non-Judicial Punishment | |
| **NOB** | Not Observed | Promotion recommendation type; excluded from summary groups |
| **NSIPS** | Navy Standard Integrated Personnel System | Home of the ESR and the EAW PAC correction process |
| **NWAE** | Navy-Wide Advancement Exam | E-5/E-6 (two cycles/yr) and E-7 (one SBE cycle/yr). **E-8/E-9 have no exam** |
| **OaRS** | Occupational and Readiness Standards | Section inside E1/E2/E3 LaDRs only |
| **OBLISERV** | Obligated Service | Incurred on ARA sea-duty alignment |
| **OMPF** | Official Military Personnel File | Document images in EMPRS; FC 30–38 to the board |
| **OSR** | Officer Summary Record | Officer analogue of the PSR |
| **PERS-32** | NAVPERSCOM Performance Evaluation Division | Eval/PSR administrative corrections; missing-report filings |
| **PERS-313** | NAVPERSCOM Records Management Policy Branch | Erroneous/clerical OMPF corrections |
| **PERS-802** | Career Progression Eligibility Branch | Selection board eligibility |
| **PERS-803** | Enlisted Administrative Board Branch | Board conduct; SSB requests |
| **PIM** | Performance Information Memorandum | Covers assignments under 10 days |
| **PMA** | Performance Mark Average | Derived from promotion recommendations (EP 4.0 → SP 2.0) |
| **PMK-EE** | Professional Military Knowledge Eligibility Exam | Prerequisite for NWAE/RKE, E-5 through E-7 only |
| **PQS** | Personnel Qualification Standard | |
| **PRD** | Projected Rotation Date | Gates ARA eligibility (12-month rule) |
| **PRIMS** | Physical Readiness Information Management System | **Not used by the board** (FAQ #9) |
| **PSG** | Post Summary Group | Qualifier on the Block 43 RSCA entry |
| **PSR** | Performance Summary Record | Three-part BOL report; used **with, not instead of**, the OMPF |
| **RKE** | Rating Knowledge Exam | BBA-path exam |
| **RSCA** | Reporting Senior's Cumulative Average | RS's historical trait average within a paygrade. **No published formula** |
| **RS** | Reporting Senior | |
| **SBE** | Selection Board Eligible | Status that puts a candidate in front of the board |
| **SEA** | Senior Enlisted Academy / Senior Enlisted Advisor | Course (→ 8SEA NEC) **and** the board's senior enlisted member — disambiguate by context |
| **SELRES** | Selected Reserve | |
| **SEM** | Senior Enlisted Marketplace | Billet-based advancement construct; screen → marketplace → billet |
| **SME** | Subject Matter Expert | Panel member who briefs the rating using the ECP |
| **SSB** | Special Selection Board | 2-year window; **not available for anything an LTB could have fixed** |
| **TAR** | Training and Administration of the Reserve | Component; **exempt from SEM** |
| **TIR** | Time in Rate | 36 months E6→E7/E7→E8/E8→E9 — scoped to BBA-exempt Sailors |
| **Tank / tank group** | — | The deliberation body; selection is by **majority of the respective tank group** |
| **UIC** | Unit Identification Code | Summary group discriminator |

---

## 8. Where APEX is currently wrong

Aggregated from all five lanes. Repo paths are relative to `/srv/apex`. **The top three are user-visible
false statements about Navy process attributed to Navy sources.**

### 🔴 The three that matter most

**1. APEX tells every user that enlisted boards "vote slates." They do not.**

- **Where:** `lib/boardConfidence/types.ts:15-17` (`BOARD_DISCLAIMER`: "enlisted (CPO) selection boards
  score records by rating panel and vote slates"), and `docs/specs/board-confidence-analyzer.md:67`,
  which marks "slates voted vice individual records" as **Verified (PERS-803 brief)**.
- **Reality:** PERS-803 says "All records are then brought to tank for **individual** briefing and
  voting." The word "slate" appears nowhere in the brief, the precept, or either convening order (§1.3).
- **Blast radius:** rendered on every results view **and stored verbatim in every `board_analyses` row**.
- **Fix:** replace with the §1.3 phrasing. Re-check the spec's "Verified" table — a false claim
  attributed to Navy's own brief is the worst possible failure mode for this demo.

**2. APEX tells every user with a gap that a single day can disqualify them. The instruction says the
opposite, using the same word.**

- **Where:** `lib/boardConfidence/rubric.ts:590` ("A selection board can treat ANY gap in the record —
  even a single day — as enough to disqualify a candidate"), repeated at `rubric.ts:585-586` and
  `types.ts:126-128`.
- **Reality:** `1610.10H para 17-6`: "Missing FITREPs, CHIEFEVALs, or EVALs **do not disqualify** a
  member before a selection board, but missing reports can make the work of the board more difficult."
  The precept: a gap is "a period of **undocumented performance**", and boards "shall evaluate the record
  with what is available" (§3.7).
- **Fix:** use the instruction's framing; adopt its materiality threshold (**E-5 and above, past 5
  years**); attach the real remedy (PERS-32 duplicate, or letter-in-lieu per 17-6a/17-6b, Exhibit 17-4).

**3. `CHIEFEVAL_TRAIT_STANDARDS` is fabricated — not one block matches the real form.**

- **Where:** `lib/traitStandards.ts`. Five entries: `deckplate_leadership@33`, `professionalism@34`,
  `mission_accomplishment@35`, `human_development@36`, `eo_climate@37`.
- **Reality:** NAVPERS 1616/27 REV 05-2025 prints **seven**: 33 TECHNICAL MASTERY, 34 INSTITUTIONAL
  EXPERTISE, 35 PROFESSIONALISM, 36 INTEGRITY, 37 ACCOUNTABILITY, 38 DECKPLATE LEADERSHIP, 39 TEAM
  EFFECTIVENESS (§3.1). The 3.0 gate does land on Block 37 — right number, **wrong label**
  ("Accountability", not "Equal Opportunity / Command Climate").
- **Fix:** transcribe from `/srv/apex/public/chiefEvalBlank.pdf`, already in the repo.

### 🟠 Wrong claims in shipped docs and specs

| # | Where | Wrong | Right |
|---|---|---|---|
| 4 | `docs/specs/board-confidence-analyzer.md:67` | "CPO boards: CAPT president" — marked **Verified** | Presidents are **RDML/RADM**. CAPT/CDR/CWO appear as "M", never "P" (§1.5) |
| 5 | `docs/rules-reference.md:88` | Cites "BUPERSINST 1610.10H, Chapter 1, **Section 1-45**" | **No such paragraph.** Ch. 1 has 1-1…1-4. The "45" is the EVAL *block* number. Correct: Encl (2) ch. 1, "EVAL BLOCK 45 / FITREP-CHIEFEVAL BLOCK 48," p. 1-16 |
| 6 | `docs/rules-reference.md:97-101` | 18-line / 90-CPL / 84-CPL Block 43 geometry cited to "Chapter 13" | Those figures appear **nowhere** in the 173-page instruction (six targeted greps, zero hits). Re-cite to the NAVFIT98A artifact or label empirically derived |
| 7 | `docs/rules-reference.md` | "Seven enlisted-style traits plus tactical_performance (**8 total**)" | The FITREP has **seven** blocks (33–39) and its 33/36/37 differ from the EVAL's (§3.1) |
| 8 | `docs/rules-reference.md` rule #2 | Only says a 2.0 bars Must/Early Promote | **Three or more 2.0s bar Promotable outright**, and a 2.0 in **Character** bars Promotable too (§3.3) |
| 9 | `docs/specs/board-confidence-analyzer.md:72` | LaDR parser presented as generally verified | Say "**verified against the IT LaDR only**" — the shipped parser yields **0** advancement_consideration milestones for both CTI and HM |
| 10 | `docs/BOARD-CONFIDENCE.md:204` | Notes MyNavyHR as blocked from server contexts | **It is not blocked** — full browser header set returns 200 (§0) |
| 11 | Repo-wide | Cites only BUPERSINST 1610.10H; **zero** references to 1430.16 in any revision | 1430.16H **chapter 11** is the instruction that actually governs what a board reads. This is a gap, not a staleness bug |
| 12 | `/srv/apex/my_tools/BUPERSINST 1610.10.pdf` | One change transmittal stale | Current is **CH-2, 26 May 2026**. Re-download before treating it as the citation of record |

### 🟠 Logic defects

| # | Where | Defect |
|---|---|---|
| 13 | `lib/forcedDistribution.ts:89` | `combinedMax` is set only when paygrade is E-5/E-6. **Every E7–E9 CHIEFEVAL group and every officer group passes forced-distribution validation unconditionally.** E7–E9 cap is **50%** (§3.4). The `ceil(0.2N)` / `ceil(cap·N)−ceil(0.2N)` math is sound — don't touch it; just add the bands and the **N=2** special case |
| 14 | `lib/forcedDistribution.ts:7` | Cites "**Table 1-3**" for the NOB-exclusion rule. 1-3 is the **officer** table; enlisted is **Table 1-4** |
| 15 | `lib/summaryGroupEligibility.ts` | Omits **Block 5 duty status** and **Block 21 billet**, both group discriminators (§3.5). APEX already stores `duty_status` |
| 16 | Continuity logic | Uses an arbitrary **90-day** `continuity_gap_days`. Sourced rules: **any uncovered day** (day-after rule), **>15 months in one period is itself a defect**, and **Concurrent / Operational Commander reports do not plug a gap** (§3.7) |
| 17 | Continuity logic | **Flags compliant E-9 records as deficient.** CH-2 para 3-5b removed periodic reports entirely for **E-9, W-5, LDO O-6**, and 3-4a for **8CMC CMDCMs**. Encl (1) Table 1 was not updated; chapter 3 governs (§3.8). This misfires on exactly the population an E-9 board reviews |
| 18 | Continuity scoring | If it reduces score for a **CIP** or break-in-service gap it directly contradicts precept App A 7.b, which forbids viewing those negatively (§3.7) |
| 19 | Decline detection | If `lib/forcedDistribution.ts` suppresses a **pure trait-grade drop** on forced-distribution grounds, that is broader than the precept allows — the FD carve-out attaches **only** to a promotion-recommendation drop (precept 7.d), not to 7.c (§3.12) |
| 20 | `lib/boardConfidence/rubric.ts:280` | `verified_in_ompf` is a **self-ticked boolean** carrying a `UNVERIFIED_MULT` score swing. Real verification is a three-step chain with three different owners (§2.5) |
| 21 | `lib/boardConfidence/rubric.ts:279` | `AWARD_LOOKBACK_MONTHS` — the board sees the **entire history** (1430.16H 1107). Defensible as recency weighting; **must not** be described as modeling what the board sees |
| 22 | `lib/boardConfidence/rubric.ts:320-328` | Weights renormalize over answered categories only (`if (!c \|\| c.answered === 0) continue`), so a LaDR yielding **zero** `advancement_consideration` rows silently redistributes the heaviest weight (30, ×2 board emphasis) instead of flagging a gap. **Refuse to score, or badge as degraded**, when that category is absent for an E7+ candidate |
| 23 | `lib/boardConfidence/preceptFetch.ts:51-52` | Sends only `{ "User-Agent": BROWSER_UA }` → guaranteed 403. One-line fix: add the full header set (§0). *Not a demo-stopper* — the v1.6.1 upload path (commit `3ceb8dc`, `app/api/board-confidence/precept-extract/route.ts`) is a working fallback |
| 24 | `lib/boardConfidence/preceptFetch.ts:24-25` | `DEFAULT_PRECEPT_URL` points at the **precept**, but the enumerated FQ/BQ guidance lives in the **convening order**. The self-deprecating comment at :76-79 ("precept prose is broad … rarely maps cleanly") is a symptom of parsing the wrong document |
| 25 | `scripts/ladr-data/precept_current.ts` | The five `emphasis_flags` don't match the six official BQ considerations. "warfighting" and "sea_duty" are **not** named categories; "Outcome Focused Leadership", "Special Qualifications", "History of Assignments" are **missing** (§1.2) |

### 🟠 LaDR fetch/parse defects

| # | Where | Defect |
|---|---|---|
| 26 | `lib/boardConfidence/ladrFetch.ts:75` | Hardcodes `${rating}_e1_e9.pdf`. **Broken for 11 of APEX's 82 ratings** — AWF, AWO, AWR, AWS, AWV, EOD, LN, MU, ND, SB, SO — whose combined file uses `_e2_e9` / `_e3_e9` / `_e4_e9`. `isKnownRating` passes them, then the fetch fails. **Fetch `_e7.pdf` instead: it exists for all 81 prefixes and avoids the 185-page OaRS payload** (§4.3, §4.4) |
| 27 | `lib/boardConfidence/ladrFetch.ts:83` | Only maps **404** → `not_found`. COOL returns **403** for a missing PDF, so users see a generic `HTTP 403` error instead of "no LaDR published" |
| 28 | `lib/boardConfidence/ladrFetch.ts:241` | Guard requires the 30 chars after a header to match `/^[\s.]{0,10}1\.\s/`. Real sections routinely open with "NOTE:", a bullet, or "Fully Qualified:". Measured: **IT harvests 3 of 9 sections; CTI 0 of 6; HM and CTI produce 0 advancement_consideration and still return a valid-looking `ParsedLadr`** |
| 29 | `lib/boardConfidence/ladrFetch.ts` regex | **The "add an `i` flag" fix does not work** — tested: with `/i`, HM matches 6 headers and **zero** survive the "1." guard. HM also has 4 *singular* "Consideration for Advancement" headings and one "E6 to Master Chief" that matches no `E{n}→E{n+1}` pattern. Section-boundary logic needs rewriting, not patching |
| 30 | `lib/boardConfidence/ladrFetch.ts:249` | Split lookbehind `(?<=[.:•])` — BM's "2. Shore Assignments" is preceded by `"(SW)\n"`, ending in `)`. The split never fires and the whole 2500-char region becomes **one** milestone. *(This, not the byte cap, is why BM item 2 is lost — it sits at offset 2264, inside the cap.)* |
| 31 | `lib/boardConfidence/ladrFetch.ts:244` | Separate real defect: BM's true section is 3121 chars, `stopRe` fires at 3077, cap truncates ~577 chars of tail |
| 32 | `lib/boardConfidence/ladrFetch.ts:258, :271` | Emits **one milestone per section**, flattening every FQ/BQ bullet into `detail.notes` truncated at 1500 chars — **including PDF page furniture** ("…(e.g., CSTT, 3MTT, DCTT, etc…) **8 Revised: May 2025 IT CAREER PATH TRAINING A**"), persisted as board criteria and fed to the narrative LLM. Strip `\d+ Revised: <Month> <Year>` footers; decompose into one row per bullet, typed **gate vs differentiator** |
| 33 | `lib/boardConfidence/ladrFetch.ts:139-145` | Dedup key `${category}\|${item.toLowerCase()}` has **no component dimension**. Today Active/TAR/SELRES mixing is prevented only by accident (TAR/SELRES sections fail the guard). **Whoever loosens :241 must add a component tag in the same change** — and must not assume three components (**CTI has two**) or infer component from positional order |
| 34 | `lib/boardConfidence/ladrFetch.ts:126-135` | Synthesizes `effective_date='2026-07-01'` from the cover date. Invented precision — criteria carry **per-component "Revised:" stamps** months earlier (§4.4) |

### 🟡 Copy and framing fixes

| # | Where | Fix |
|---|---|---|
| 35 | `lib/boardConfidence/types.ts:17-18` | The disclaimer sentence "Only your official record (OMPF, PSR, and a Letter to the Board) exists to a real board" is **CORRECT** — now double-cited (precept App A 7; PERS-803 FAQ #2 "TRUE"; 1430.16H 1105). **Keep it.** Tighten "OMPF" → "**OMPF field codes 30–38**" and it becomes precisely true |
| 36 | `components/.../RecordEntryForm.tsx:3, :968` | "Structured PSR/ESR record entry" / "Upload your ESR export" — ESR as a **data source** is right; implying a board sees it is wrong. One-line copy fix, plus surface the ESR-screenshot-as-LTB-enclosure remedy (§2.4) |
| 37 | `components/.../RecordEntryForm.tsx:875` | "RSCA comes from your PSR **Part III**" — the user aid's ordering (professional / performance / decorations) puts RSCA in **Part II** and decorations in Part III. Flagged, not proven — see §9 |
| 38 | Trait label for CHIEFEVAL Block 37 | Labeled "Equal Opportunity / Command Climate". **That trait name does not exist on the CHIEFEVAL.** Relabel "**Accountability (Block 37)**"; keep the gate (§3.2) |
| 39 | Any "contact PERS-32 about your RSCA" advice | **That route is closed.** `1610.10H 17-5` forbids requesting a change to any data that would modify summary group averages, the RSCA, or the promotion recommendation group. Honest output: ch. 15 appeal or nothing (§2.7) |
| 40 | Score presentation | Never present a per-record score as a **selection probability** without the quota-ceiling caveat (§1.6) |
| 41 | "Selected" / "selection board" language | Stale for the **majority AC path** — most are **screened** into a marketplace, with a second billet stage and a 30-month clock APEX does not model (§6) |
| 42 | Band labels, `docs/specs/board-confidence-analyzer.md:580-584` | "Clearly at the top / Competitive / Crunch — middle band / Not competitive this cycle / Drop-from-consideration risk" could be swapped for the **official officer label set** (Absolutely Select / Probably Select / Maybe / Probably Not / Do Not Select) — citable and more credible, if the officer-scope caveat rides along (§1.4) |
| 43 | Officer/enlisted analogy copy | Narrow to the **three** documented shared elements. Do not claim an enlisted recorder tallies votes (§1.4) |
| 44 | LTB drafter | Must **not** copy Figure 11-1's SSN placeholder — use the 10-digit DoD ID (§2.6). Must **not** emit self-evaluation or self-recommendation (§3.7). Implement 1106a ("should not restate") as a **drafting heuristic**, not a hard validation error |
| 45 | Missing entirely | No modeling of: eligibility gates (§1.9), the quota ceiling (§1.6), the "hold" outcome state (§1.7), the summary-group comparison axis (§3.6), or SEM stage two (§6) |
| 46 | Rating expectations sourcing | APEX builds them from **COOL LaDRs**; the document in the board room is the **ECP**, approved by DCNP. LaDRs are a defensible public proxy — **APEX must not claim the board uses them**, and must honor the explicit hedge that milestones are typical paths, not requirements (§4.2) |

---

## 9. Unverified — do not cite as fact

Everything below either could not be sourced or was sourced to something that does not support it.
**Do not put any of it in UI copy, a spec, an LLM prompt, or a citation string.**

### Claims that failed source-check and were removed

| Claim | What was tried | Status |
|---|---|---|
| "Mailed LTBs: use a binder or paper clip, no staples, no folders or covers (everything is scanned into EMPRS)" | grep for staple/binder/paper clip/folder over both rendered text and raw HTML of the cited MyNavyHR page → **zero hits** | **DROPPED — no source.** Exactly the plausible-sounding-procedure failure mode this product cannot afford |
| OMPF "e-Submission Documents" tab shows Pending/Rejected status; Pending or Rejected means contacting the submitting personnel support organization | Not located in MILPERSMAN 1070-080 para 4b or the Personnel Records Review user aid | **UNVERIFIED.** The verified analogue is the **BOL continuity numerical error code** for rejected evals — do not conflate them |
| Flag Letter of Commendation citation must always be submitted to prove the FLOC went to an individual rather than a unit | 1430.16H para 312e lists required documents; no such sentence. May live in **table 3-1**, which was not read | **UNVERIFIED** |
| "Nuclear Sailors must nominally requalify within 6 months of reporting aboard a submarine or CVN" | Not found in 1430.16H text | **UNVERIFIED** |
| "Exam score has no bearing on the board's decision once SBE status is attained" | Sound **inference** from PERS-803 FAQ #2 (board sees only OMPF/PSR/LTB; the FMS/profile sheet is none of those). **No source states it** | **INFERENCE — do not present as a cited rule** |
| MILPERSMAN 1401-010 governs enlisted board correspondence | 1401-010 (22 Aug 2002) refers exclusively to "the officer" with officer-program examples; NAVADMIN 100/25 cites **NAVADMIN 220/19**, not 1401-010, for board communication | **UNVERIFIED for enlisted.** Use 1430.16H 1106c, which is enlisted-specific and 2026-dated. *(1401-010's protective purpose — no adverse material seen without the individual's knowledge — is useful framing, nothing more)* |
| "Narrative comments are not on the PSR" | Inference from absence in Exhibit 17-3, not a statement in the exhibit | **INFERENCE** |
| RSCA is on "PSR Part III" (`RecordEntryForm.tsx:875`) | The user aid's ordering (professional / performance / decorations) implies **Part II**. **No PSR with printed Part I/II/III labels was seen** | **FLAG, not assertion** |
| Medical (FC 43) / security (41) / emergency (39) are never board-visible | The MyNavyHR Selection Board Review page adds: "**If requested**, the following categories **may be provided** to boards for determination of medical status: Emergency Data; Personal Background Data; Record Changes; Security Clearances and Investigations." Placement suggests officer scope; the page does not say so | Say "**not routinely provided**", not "not provided" |

### Sources not reached

| Source | Why it matters | Status |
|---|---|---|
| **Enlisted Career Paths (ECP) PDFs** | The document actually in the board room (§4.2) | **Not located.** Four MyNavyHR paths returned 200 but were navigation-only DNN shells with zero document links; the Enlisted-Career-Admin index lists no ECP child. PERS-803 says only "Posted on the NPC website". **Do not hardcode an ECP URL on a guess** |
| **BUPERSINST 1070.27** | Named inside 1430.16H para 1105 as co-governing what reaches a board | **Never fetched.** Deepest unexamined source directly in scope |
| **SECNAVINST 1650.1 / SECNAV M-1650.1** (Awards Manual) | Award submission lead times; NDAWS correction procedure | **Not fetched.** Consequence: **there is no sourced lead time for an award submission through the chain**, and no sourced NDAWS correction procedure beyond the ESO's responsibility (1430.16H 103a(9)) and the user-aid TIPs in §2.5 |
| **NAVPERS 18068 (NEC manual)** | General NEC-change procedure | **Not fetched.** The NAVPERS 1221/6 "by direction signatures are not authorized" rule is scoped to the **nuclear N33Z NEC only** — do not generalize it |
| **"Enlisted Selection Board Brief"** linked from the MyNavyHR Active Duty Enlisted page | Closest public artifact to an actual board precept | Not retrieved (page says select "Cancel" if prompted for credentials) |
| **`netc.navy.mil`** | LaDR executive agent | **403 to curl with a browser UA.** Nothing here depends on it — OPNAVINST 1500.77A supplied the needed facts |
| **`npc.navy.mil`** | | Does not resolve in DNS |
| **web.archive.org NAVADMIN 075/26** | | No snapshot. ⚠️ The `id_` replay returns a **404 page that is itself ~142 KB** — a careless fetch produces a plausible-looking empty artifact. The real PDF is ~60 KB |
| **Table 3-1** (award point values) | | Not read |

### Questions research could not settle

| Question | State |
|---|---|
| **How is RSCA computed?** | **No formula is published anywhere.** The EVALMAN describes what feeds it, what does not (Concurrent reports), where it prints, and who may receive it — never the calculation. The MyNavyHR RSCA page only explains how to request the report. **APEX cannot derive RSCA. Hand-entry or parse-from-Block-43 are the only honest options** |
| **Is OPNAVINST 1500.77A still current?** | Nominal expiry **7 Apr 2022**. 1500.77B/1500.77C 302-redirect to the SECNAV homepage at the predictable path, but para 8 provides for reissue **or extension**, so a successor under a different path/number is plausible. **Treat "1500.77A is current" as unconfirmed, not established** |
| **Comment-block geometry (line count / 90 CPL / 84 CPL)** | Appears **nowhere** in the 173-page EVALMAN — six targeted greps ("18 lines", "characters per line", "90 charac", "84 charac", "monospace", "courier") returned zero hits. Empirically derived from the form's printable area or from NAVFIT98A. **Label it as such.** It is now measured directly off the blanks in `public/` — 600 dpi raster, real ink extents, both embeddable Couriers — and is **per form**: 1616/26 Block 43 = 17/15 lines, 1616/27 Block 40 = 8/7, 1610/2 Block 41 = 19/18 (10-pitch / 12-pitch). The single "18 lines" this row used to describe was the EVAL's figure applied to all three forms, and it was wrong on all three |
| **EVALMAN edition** | Direct publisher fetch on 2026-07-29 returned **CH-2, 26 May 2026** (173 pp., ModDate 27 May 2026). A shared scratchpad extraction carried footers reading "30 Jul 2025". CH-2 revised Encl (2) pp. 3-1–3-2a and 3-6–3-7a — the continuity and special-report pages. **Cite CH-2 for chapter 3.** If a discrepancy surfaces, re-download from the publisher |
| **Do the 15 alternate combined LaDR files return 200?** | Only confirmed that `_e1_e9` **403s** for nd/mu/eod/awf and that the alternate filenames are what COOL's index links. **Check before coding the fallback** — or sidestep it entirely by fetching `_e7.pdf` |
| **Do E8/E9 LaDR files follow the E7 pattern?** | `it_e8.pdf` fetched (200, 50 pp.) but not extracted or analyzed. **Unconfirmed** |
| **Newer revisions of OPNAVINST 1414.9C / 1414.4E?** | Not checked |
| **Durations for a PQS signature, an individual PME/NAVEDTRA course, or an associate degree** | **No source.** Any number in these categories is unsourced |
| **FY-27 board announcement for E8/E9 (as opposed to 075/26 for CPO)** | NAVADMIN 100/25 is FY-26. Re-check any date-sensitive claim against the correct FY message before shipping |
| **1430.16H internal conflict on verification cadence** | 1101a says weekly ESVR verification "through the projected board **adjourn** date"; 702c(1)/702d(1) say "until the board **convening** date". **Use adjourn (the safer, longer cadence) and cite 1101a.** Do not present both as one rule |

---

## 10. Provenance

Every primary PDF cited above was fetched directly from its stated publisher URL. Four decisive
documents were independently re-downloaded by a second lane and SHA-256-matched against the first
lane's artifacts, with byte-identical `pdftotext -layout` output:

| Document | SHA-256 (prefix) | Bytes |
|---|---|---|
| FY27_Enlisted_Precept.pdf | `e01a9ec5…` | 235,468 |
| FY27_AE7_ASB_Convening_Order.pdf | `4db18cca…` | 121,173 |
| ENLISTED_SELECTION_BOARD_BRIEF-21FEB2025Final.pdf | `934235bd…` | 2,173,126 |
| Active Promotion Brief_2024_P80B.pdf | `edf5a6d3…` | 1,759,762 |

The parser findings in §8 (items 26–34) were produced by **executing** the shipped
`lib/boardConfidence/parseLadr` against four real Navy COOL E7 LaDRs (IT, BM, CTI, HM), not by reading
the code. Table 1-2 (§3.4) was re-derived arithmetically across all 30 rows.

**Re-verify anything load-bearing before it becomes user-facing language.** Instructions get revised.
