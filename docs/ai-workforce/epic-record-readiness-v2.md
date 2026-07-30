# Epic — Record Readiness Review v2, and the app around it

> Status: **proposed**, awaiting founder go/no-go on sequencing.
> Evidence: adversarially-verified audit, 12 agents, 6 lenses, 2026-07-29 — 65 findings
> confirmed, 3 likely, 2 refuted. Every claim below is anchored at `file:line` and was
> re-verified by the orchestrator before being written down.
> Founder decisions already made: (1) audience is **Navy leadership, improved demo**;
> (2) record content **may** reach a model under the Brag Sheet trust model;
> (3) the 0–100 composite score is **replaced** by a readiness plan.

---

## 1. The verdict — one root cause, three consequences

The founder's report was "the review isn't very useful." The audit locates a single
architectural cause, and it is not a bug — the engine faithfully implements a spec that asks
for the wrong thing.

**`rubric.ts:543` — `contribution = (weight/100) · S · conf`, summed over six factors and
compared against fixed bands, with no renormalization by `Σ(weight·conf)`.**

Because the denominator is always a full 100 while the achievable maximum silently varies per
user, a factor with `conf = 0` ("we have no data") contributes exactly what a factor with
`S = 0, conf = 1` ("your record is bad") contributes. **The score measures how much data APEX
holds, not how ready the record is.** The spec endorses this explicitly
(`docs/specs/board-confidence-analyzer.md:1075`, MISSING-DATA POLICY item 1), so this is a
design-limit to be redesigned, not a defect to be patched.

Two worked examples from the audit, both run through the live engine:

| | Record | Data entered | Result |
| --- | --- | --- | --- |
| **Sailor A** | 6 consecutive annual EVALs, **all Early Promote**, ITA 4.60, unbroken 5-year continuity | PSR/LaDR tabs never filled | **45.0 — "Not competitive this cycle"** |
| **Sailor B** | 5 annual EVALs, **all Promotable**, never once recommended above the middle, ITA 3.80 | every section filled | **57.2 — "Crunch — middle band"** |

A's promotion recommendations are two full grades higher on every single report and A's
performance factor scores B's by 2.0×. B outranks A by 12.2 points and a whole band. **The
entire inversion is data entry.** A brand-new user who has entered nothing scores **1.0 —
"Drop-from-consideration risk"**: the first thing the product says to a Sailor about their
career is a verdict it has no basis for.

### Consequence 1 — the number has no information content

Accounting the 100 points by provenance (`service.ts:135-160`): Leadership (15), Development
(15), Completeness (10) and Precept (10) come entirely from `member_board_records`, a
browser-written table every field of which the subject types. Performance (40) and Continuity
(10) come from `evaluations` rows selected `.eq("created_by", subjectUserId)` — reports the
subject drafted about themselves. **At minimum 50 of 100 points have no external anchor even
in principle; in a single-user install it is all 100**, because the only genuinely external
input (summary-group peer distribution, `service.ts:192-208`) requires the Sailor's peers to
also be APEX users.

Two inputs are worse than unverified — they are self-serving dials. `rsca` is typed by the
Sailor (`RecordEntryForm.tsx:885-895`) and is the comparator P2 scores against
(`rubric.ts:190`), so typing a *lower* RSCA raises the score. `verified_in_ompf` is a
self-ticked box that doubles the value of every award and every met LaDR item
(`rubric.ts:280, :314`). The tool launders the Sailor's own opinion of their record into an
authoritative band label rendered to one decimal place.

### Consequence 2 — the LaDR destroys exactly the information a Sailor could act on

`scoreLadr` (`rubric.ts:301-337`) iterates every milestone, knows precisely which are unmet,
and emits only per-category ratios. The Sailor asks "what do I do next?" and the tool answers
`ratio_qual_warfare: 0` — when it knows the row is "Information Warfare (EIWS)"
(`it_e1_e9.ts:141-146`). `detail.course` and `detail.notes`, the only genuinely actionable
content in the dataset, are stored and never rendered (`LadrChecklist.tsx:107-109`).

The v1.5 headline feature is **dead twice over**, and both were re-verified by hand:

- **The ×2 board-emphasis multiplier is algebraically a no-op** in the category it was built
  for. At `rubric.ts:311-314` the weight `w` is applied to both `c.met` and `c.answered`, so
  `ratio = met/answered` cancels it exactly. It has an effect only in a category holding a
  *mix* of emphasized and non-emphasized items — and `advancement_consideration` items are all
  board-emphasis by definition. An operator who sets `board_emphasis_multiplier = 5` gets
  identical scores for every Sailor, with no signal that the lever is inert.
- **`advancement_consideration` has zero rows in all three curated seeds.**
  `grep -c advancement_consideration scripts/ladr-data/*.ts` → `0` for IT, BM, and HM. The
  30-weight category — the heaviest in the table, and the one place a LaDR states what a board
  actually weighs — has no content. The weighting scheme's centrepiece never fires.

There is also **no time dimension anywhere**: the LaDR factor never sees the board date, so an
18-month associate degree and a 20-minute PQS signature are interchangeable. The tool cannot
answer the only question that matters eight weeks out — *what can I still fix in time?*

And 82 of 85 known ratings have no curated LaDR at all, costing a hard 0 of 15 development
points plus 10 completeness points with no redistribution: a flawless AT1 or YN1 is capped
around 84 and lands in "Competitive" instead of the top band purely because APEX lacks their
seed file.

### Consequence 3 — the AI is structurally incapable of saying anything useful, and usually does not run

`narrative.ts:234-243` sends the model six factor objects and three scalars. No milestone
names, no dates, no record text. The system prompt (`narrative.ts:82-84`) then orders the model
to cite payload paths **that do not exist in the serialized payload**, and orders it to "name
each LaDR category whose completion ratio is below 1.0" — when `rubric.ts:322` deletes exactly
those categories from the payload before it is built (`if (!c || c.answered === 0) continue`).
The model can only discuss ground the Sailor has already covered.

Worse: on the shipped configuration **the AI never runs at all**. No `BOARD_NARRATIVE_*` or
`AI_GATEWAY_API_KEY` appears in `.env.example` or `docs/PRODUCTION.md`, so `resolveAiModel`
returns null and every Sailor sees a subset of **nine hardcoded strings** from
`remediationsFor` (`narrative.ts:104-158`) — including "Close the highest-weight LaDR
milestones first: warfare qualification and required PME," shown identically to every Sailor in
every rating. **This surface is what "half baked" is describing.**

---

## 2. Demo blockers — outside the record review, and they end the conversation

Two findings would stop a Navy pilot regardless of how good the rest is. Both were
independently re-verified by the orchestrator against the migration and the code.

**A. Role self-escalation → forge your own Commanding Officer's signature.**
`001_initial_schema.sql` has `create policy "Allow users to update own profile" ... using
(auth.uid() = id)` — no `with check`, no column restriction. `app/profile/page.tsx:200-216`
offers "Reporting Senior (Commanding Officer)" and "Admin" in a plain `<select>`.
`permissions.ts:277-280` (`canSignBlock`) reads `user.preferred_role` and, for every block
except 32 and 51, returns on role alone with no ownership check. A Sailor drafts their own
eval, sets their role to Reporting Senior, signs Block 50 with their own password, and
`signing.ts:127-128` sets `signature_locked: true` + `routing_stage: "locked"`.

**B. Every authenticated user can read every DoD ID.**
`create policy "Allow public read of profiles" on public.profiles for select to authenticated
using (true)` — verbatim at `001_initial_schema.sql:149-152`. DoD ID, email, rank, and command
for every user. One test-account registration exposes the lot. That is a reportable PII spill.

**C. BUPERSINST validation is advisory at the exact moment it becomes permanent.**
`eval-finalize/route.ts:28-41` — sign, lock, and finalize never run `runFullValidation`. A
report carrying hard validation errors can be signed, locked, finalized, and exported. For a
product whose pitch is "real-time validation prevents formatting rejections," the pitch fails
at the one moment it matters.

---

## 3. The v2 design — three readouts, never multiplied together

The founder's call is to replace the composite score with a readiness plan. Concretely:

### 3.1 Record coverage (new, prominent, its own thing)

> **APEX can see 4 of 6 areas of your record.** Missing: your tours, your awards.

Computed as `Σ(weight·conf)/100`. This is the honest answer to "why does my score look bad,"
and it converts the current worst failure mode into the tool's most useful early screen. It is
never multiplied into a quality signal.

### 3.2 Per-area readiness, evidence-tiered

For each area with enough evidence, a plain-language status — **Strong / Adequate / Needs work
/ Not enough data** — with the evidence tier shown, because they are not the same claim:

- **Corroborated** — from finalized evaluations APEX holds.
- **Attested** — you told us. Marked visibly, everywhere.
- **Unknown** — we have nothing. Never rendered as a deficiency.

"Not enough data" is a first-class status with its own visual treatment, never a low bar.

### 3.3 The ranked action plan — this is the product

For each unmet item the engine already knows about: **what to do**, **what it is worth**,
**whether it is achievable before your board date**, and **what blocks it**. Sorted into
*achievable before {boardDate}* / *start now for the next cycle* / *blocked by current billet*,
using `T`, which the engine already has.

`scoreLadr` already iterates every item — it emits an `unmet: Array<{milestone_id, item,
category, marginal_points, board_emphasis}>` where `marginal_points` is the exact number of
points that item is worth. Paired with `bandDeltas(result, inputs)` — a pure function that
re-runs the affected sub-score with each input flipped — this answers "what would move me"
**with no model and no new data**, from information already in `RubricResult`.

### 3.4 What is retired

- The 0–100 composite as the headline. It survives behind a "show the math" disclosure, clearly
  labeled a rubric artifact, for the people who want it.
- One-decimal precision. A single self-reported checkbox moves the final by ~8 points and
  crosses band boundaries; reporting tenths on that input is false precision.
- **Band labels that claim board outcomes.** "Clearly at the top," and the spec's "profile of
  records swept up in the tentative-select motion on the first pass" (§7.1), are falsifiable
  claims about board behaviour that the model cannot support and that this audience will
  recognise instantly. Replaced with language describing the *input*: "strong across all
  measured areas."
- Scoring `auto_extracted` LaDR documents. Fidelity is currently inversely correlated with
  score — a rating whose PDF parsed into four generic rows reaches 100 by ticking four boxes,
  while a curated 26-item rating must genuinely close warfare quals, PQS, PME, certs and a
  degree. Auto-extracted items become reference-only until curated.

### 3.4b The output contract *(founder-approved layout: coverage first, then plan)*

The Results screen leads with coverage, then the ranked plan. Per-area status is available but
does not lead. Concretely, the engine gains a new return type alongside `RubricResult` — the
rubric stays pure and deterministic, it just stops being asked to emit a verdict:

```ts
export interface ReadinessReport {
  coverage: {
    measured: number;        // Σ(w·conf)/100 in [0,1] — the honest "how much can we see"
    areasKnown: number;      // factors above the evidence floor
    areasTotal: number;
    missing: Array<{         // drives "Missing: your tours, your awards"
      area: FactorKey;
      label: string;         // "your tours"
      unlocks: string;       // "leadership assessment"
      howTo: string;         // deep link to the section that fills it
    }>;
  };
  actions: Array<{           // THE PRODUCT — ranked, dated, sourced
    id: string;
    action: string;          // "Verify your Navy Achievement Medal in OMPF via NDAWS"
    area: FactorKey;
    worth: number;           // marginal points, from bandDeltas() — not a guess
    horizon: "before_board" | "next_cycle" | "blocked";
    blockedBy: string | null;// "requires a sea billet"
    source: { kind: "ladr_milestone" | "record_field" | "eval"; id: string };
  }>;
  areas: Array<{
    key: FactorKey;
    label: string;
    status: "strong" | "adequate" | "needs_work" | "insufficient_data";
    evidence: "corroborated" | "attested" | "unknown";
    summary: string;         // plain language. NO engine internals (P1, aP, wSum) reach the UI
    detail: FactorResult;    // behind "show the math"
  }>;
  boardDate: string;
  monthsToBoard: number;
  score: { value: number; band: BandVote; label: string } | null;
}
```

Binding rules on that contract:

- **`score` is `null` when `coverage.measured` is below the floor.** The UI then renders "Not
  enough of your record is entered to assess" plus the missing list — never a number, never a
  band. This is what kills the 1.0 "Drop-from-consideration risk" first impression.
- **`status: "insufficient_data"` is visually distinct from `"needs_work"`**, never a low bar on
  the same axis. Unknown is not a deficiency.
- **`evidence` is rendered on every area.** `"attested"` says "you told us" on the surface, not
  in a tooltip.
- **`worth` comes from `bandDeltas(result, inputs)`** — a new pure function in `rubric.ts` that
  re-runs the affected sub-score with each candidate input flipped and returns the true marginal
  points. No model, no new data, no estimate.
- **`horizon` is computed against `boardDate`** using `typical_months` / `blocked_unless` from
  `ladr_milestones.detail` (already jsonb — no migration).
- `scoreLadr` gains an `unmet: Array<{milestone_id, item, category, marginal_points,
  board_emphasis}>` output. It already iterates every item; it simply stops discarding identity.

### 3.5 The LaDR splits in two

- **Development plan** (unscored): item names, course codes, paygrade chips, the `detail.notes`
  prose, ranked and dated. What a Sailor hands their career counselor.
- **Board readiness** (scored, lightly): only what a board actually reads — evals, continuity,
  OMPF-verifiable awards/NECs/tours. The app's own disclaimer already says this
  (`types.ts:18-19`: "Only your official record (OMPF, PSR, and a Letter to the Board) exists
  to a real board"); the rubric contradicts it by sourcing ~18 of 100 "board readiness" points
  from self-checkboxes about a document no board sees.

### 3.6 AI gets three real jobs

Under the Brag Sheet trust model, written into the spec as a deliberate revision — DoD ID
stripped, uploads never persisted, owner-only, server-enforced consent, citation-or-delete on
output — staged by value-per-unit-risk:

1. **Eval narrative coach (Block 43)** — the largest miss in the app. Today a Sailor gets "line
   19 of 18" and nothing else. Every ingredient is already in the repo: `TRAIT_STANDARDS`,
   `commentFit`, `runFullValidation`. Does your narrative substantiate your trait grades?
   This is the screen Sailors actually spend time on, and it has no AI at all.
2. **Record analyst** — unmet LaDR item *names* (public Navy COOL text, zero PII delta), eval
   dates, the board date and months-to-board, and the adverse adjustment with its expiry.
   Produces the ranked plan in plain English, with citations validated before display.
3. **Precept interpreter** — precept prose → what *this* board rewards for *your* rating and
   paygrade, replacing five booleans set by whoever holds the service-role key.

Plus the unglamorous prerequisite: put `BOARD_NARRATIVE_*` and `AI_GATEWAY_API_KEY` in
`.env.example` and `docs/PRODUCTION.md` so the AI path is discoverable and actually on.

---

## 4. Phasing

Each phase is one coherent PR cluster. Review chain per §8 of the orchestrator playbook:
builder → independent adversarial review (+ domain review wherever Navy-facing language,
scoring, or advice changes) → gatekeeper → founder merges.

### Phase 0 — Demo blockers *(small, must land first)*
Role self-escalation; profiles DoD-ID exposure via a `profiles_directory` view; middleware
route coverage; and the honesty guard — suppress the band and headline number below a coverage
floor instead of telling a new user they are a "Drop-from-consideration risk."
**Owner:** `eng-feature-engineer` + `qa-test-engineer`. **Required:** `eng-adversarial-reviewer`.

### Phase 1 — Kill the false verdict
Separate coverage from quality; evidence tiers; retire outcome-claiming band labels; insufficient
-evidence state; `run()` awaits `save()` (today, unsaved edits are silently not scored —
`ResultsView.tsx:268-279`); stop scoring auto-extracted LaDRs; redistribute weight for factors
with no data, as the missing-precept path already does.
**Required:** `eng-adversarial-reviewer` + `navy-domain-reviewer` + `ux-a11y-reviewer`.

### Phase 2 — Make the LaDR actionable *(the founder's core complaint)*
`scoreLadr` emits unmet items with identity and marginal value; `bandDeltas()`; the ranked
action plan surface; render paygrade chips, `detail.course`, `detail.notes`; add
`typical_months` / `blocked_unless` to `ladr_milestones.detail` (already jsonb — no migration);
fix or drop the inert ×2 multiplier; **transcribe the "Considerations for advancement" sections
into the three curated seeds** — a data task, and per the audit "the single highest-value hour
available in this subsystem."
**Required:** `navy-domain-reviewer` (blocking) + `eng-adversarial-reviewer` + `ux-a11y-reviewer`.

### Phase 3 — Real AI
Spec revision to the Brag Sheet trust model; milestone names + dates + board date into the
payload; citation-or-delete validation ported from brag-sheet; the Block 43 eval coach; the
precept prose interpreter; `.env.example` + `docs/PRODUCTION.md`.
**Required:** all three reviewers.

### Phase 4 — App-wide
Hard-gate validation at lock/finalize; unify the duplicated record entry (brag sheet and record
review ask for the same awards, education, quals and PFA history in two 1000+ line forms backed
by two tables, and their two ESR parsers disagree); observability (there is none); command
scoping in the routing model; reconcile `HANDOFF.md` and `docs/plan/README.md`, which describe a
repo that no longer exists.

---

## 5. Deliberately not doing

- **Calibration.** All 72 numeric constants including the band thresholds are asserted; no
  calibration data exists and the schema has nowhere to collect any. The fix is to stop making
  outcome claims (§3.4), not to invent a validation study.
- **An in-app admin UI** for rubric or precept config. Roles are self-asserted; service-role
  remains the trust boundary. The Precept tab currently hands a Sailor a source-file path and an
  npm command — that is a *presentation* bug to fix, not a reason to build an admin console.
- **Officer boards, OCR of image-only PDFs, pgvector.** Still out of scope per spec §12.
