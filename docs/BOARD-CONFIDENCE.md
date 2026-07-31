# Record Readiness Review

> Displayed in-app as **"Record Readiness Review"** (v1.5). Internal
> identifiers — the `/board-confidence` route, `board_*` tables, and
> `boardConfidence*` modules — keep the original name for stability.

An **unofficial, educational** self-assessment tool that scores a Sailor's
record the way a selection-board recorder reads one, to help prepare for an
advancement board at any paygrade. Full implementation spec:
[`docs/specs/board-confidence-analyzer.md`](specs/board-confidence-analyzer.md)
(the normative rubric, DDL, and API contracts live there).

> **UNOFFICIAL TOOL — NOT A SELECTION BOARD.** Not affiliated with or endorsed
> by the U.S. Navy, MyNavy HR, or any selection board. Scores are computed by a
> fixed, published rubric modeled on the officer-brief confidence vote bands
> (100/75/50/25/0) and do not predict board results.

## How it works

```
evaluations (finalized, created_by = subject)──┐
member_board_records (PSR/ESR structured entry)─┤   assembleRubricInputs()      scoreBoardConfidence()
ladr_documents/ladr_milestones (versioned)──────┼──▶ lib/boardConfidence/  ──▶  deterministic 0–100 + 6
board_precepts (active cycle flags)─────────────┘        service.ts               factor breakdown
                                                                                     │
                                                                     numbers only ▼ (no PII)
                                                        generateNarrative() — Vercel AI SDK via the
                                                        AI Gateway (BOARD_NARRATIVE_MODEL: any
                                                        provider/model, e.g. anthropic/… or
                                                        xai/grok-…); Zod structured output;
                                                        deterministic fallback when no gateway
                                                        credentials exist or the model call fails
                                                                                     │
                                                                                     ▼
                                                        board_analyses row (input snapshot, factor
                                                        scores, narrative, disclaimer, audit row)
```

- **The score is 100% deterministic.** The AI never produces or influences the
  number — it only writes the strengths/gaps/recommendations narrative from the
  rubric's numeric output, with citation-style references to the payload fields
  it used. Spec §7 is the normative rubric; three worked examples are pinned by
  tests to the decimal.
- **Six factors** (default weights): Performance 40, Leadership/Impact 15,
  Professional Development vs LaDR 15, Continuity 10, Record Completeness 10,
  Precept Alignment 10. Missing data shrinks a factor's confidence (and thus
  its contribution) rather than being fabricated.
- **Board emphasis (v1.5):** the LaDR's "Considerations for advancement from
  E6 to E7 / E7 to E8 / E8 to E9" sections are ingested as
  `advancement_consideration` checklist items — the heaviest LaDR category —
  and every board-emphasis item counts double (tunable) inside its category.
- **Continuity advisory (v1.5):** continuity is a *graded* factor, never a
  hard zero — this tool does not decide selection. When a genuine reporting
  break is found (a missing period inside your record; the time before your
  first report is not counted, so a short but unbroken record is not flagged),
  the results view shows a prominent advisory stating **BUPERSINST 1610.10H
  para 17-6**: missing FITREPs, CHIEFEVALs, or EVALs **do not disqualify** a
  member before a selection board — but they make the board's work harder, and a
  gap reads as a period of *undocumented performance*. The advisory names the
  remedy: recover any missing report covering significant duty at **E-5 or above
  within the past 5 years**, either by sending a signed copy to PERS-32 (17-6a)
  or by submitting a one-page letter in lieu (17-6b). Verify your continuity on
  BOL and NSIPS.
- **Upload-driven entry (v1.5):** on the Record Entry tab, "Extract to
  record" parses an uploaded ESR/PSR/OMPF document in memory and pre-fills
  awards, NECs, education, and PFA cycles as editable, unverified rows — in
  lieu of manual entry. Nothing is scored until you review and save.
- **Identity model:** a run scores the caller's own finalized evaluations
  (`created_by` = subject, with a DoD-ID cross-check). Routes are owner-only.

## What the Results screen shows (v2)

**Coverage first, then a plan. There is usually no score, and that is the
point.**

The rubric sums `(weight/100)·S·conf` against fixed bands with no
renormalization by `Σ(weight·conf)`, so `conf = 0` ("APEX has no data") and
`S = 0` ("the record is weak") are numerically identical. Measured: six
consecutive **Early Promote** reports with the other tabs empty scored 40.5
*"Not competitive this cycle"*, five consecutive **Promotable** fully entered
scored 57.3 *"Crunch"*, and an empty record scored 1.0 *"Drop-from-consideration
risk"*. The readiness layer (`lib/boardConfidence/readiness.ts`, spec §14)
**suppresses the verdict** whenever the arithmetic cannot support one and ships
a ranked plan in its place. After the blind-spot gate that is the common path,
not an edge case.

The screen, top to bottom:

1. **The §1.1 disclaimer — once.** The page banner stands down on this tab so
   exactly one copy is ever on screen. (It previously rendered five times before
   the first actionable sentence.)
2. **Run controls.** Running **saves the Record Entry and LaDR tabs first** and
   aborts if the save is refused — the route scores the *saved* record, so a
   Sailor who types data and clicks Run must never be scored without it. The
   browser's "today" is sent as `asOf`; the engine reads no clock, and the route
   rejects a malformed value rather than letting it become `NaN`.
3. **Coverage.** *"APEX can see 4 of 6 areas of your record"*, a bar for
   `Σ(weight·conf)/100`, and the missing list. The bar is explicitly labelled as
   how much APEX can *see*, not how strong the record is.
4. **No score. Ever.** The 0–100 composite and its band **do not render**, and
   `scoreNote` — the engine's own plain-language reason, verbatim — renders in
   their place when the gates suppress. The gates catch the *thin* record, which
   is the case the epic set out to fix; what survives them is the case where the
   number is confidently **wrong**. A record with four straight *Must Promote*,
   trait averages above the summary group in every period, PSR entered and the
   LaDR fully answered cleared every gate at coverage 6 of 6, `measured = 1.000`
   and read *"44.5 / 100 — vote 25, Not competitive this cycle"* directly above
   two cards saying **On track**. Suppression cannot catch that, because nothing
   is missing. The composite stays computed and persisted — this is a render
   decision, not an engine change.
5. **"Do this next"** — the ranked plan. Missing areas come first as unlock
   steps ("Add your tours — unlocks leadership assessment"), then the scored
   actions from `bandDeltas`. Point values are never printed.
6. **"Confirm in your OMPF"** — the unscored list of entries ticked met/earned
   but not yet confirmed. Deliberately carries no worth: `verified_in_ompf` is a
   self-ticked box, so pricing it would penalise honest disclosure.
7. **"In plain terms"** — the AI narrative's *strengths* and *gaps*, and **only
   when it came from a model**. `recommendations` and `factor_commentary` are
   not rendered: since PR #24 the deterministic fallback is assembled from the
   strings this screen already shows (`factor_commentary[key] = area.summary`;
   `recommendations = roundRobin(actions.action, missing.howTo,
   confirmInOmpf.note)`), so rendering it would show a Sailor the same sentences
   twice in two different orders. A second, differently ordered list of what to
   do beside the ranked plan is the "two numbers for one item" failure in list
   form.
8. **Per-area detail** — status, plain-language summary, and `evidenceNote`
   inline (never a tooltip). It does not lead.
9. **Prior reviews** — run date, board date, coverage. No score or band column.

For a rating with no curated LaDR — **80 of 82 ratings**, the common case — the
screen leads with the one-click *Fetch official LaDR from Navy COOL* control and
says plainly that this is normal.

### Rules this screen is built on

- **`areas[].detail` never reaches the browser.** One `reduce` over
  `detail.contribution` reconstructs the suppressed score *and* its band exactly
  (measured 43.2 on a `score: null` report), so the server strips it at the
  boundary (`ClientReadinessReport`, `types.ts`). There is no "show the math"
  disclosure, and the narrative is not rendered here either — its deterministic
  per-factor commentary prints "Contributed 33.5 of 40.0 possible points" for
  all six factors, which sums straight back to the suppressed score. The
  narrative is still persisted on the row.
- **"Not entered" is a data state, never a deficiency.** `not_entered` is a
  dashed, muted, unranked card; `needs_attention` is a solid amber one. Never
  the same bar at different lengths, never one colour ramp at two saturations.
- **Record completeness is never graded.** Every one of its strings is a
  statement about entry volume, and the coverage card promises three cards above
  that "nothing below is a grade on what you have not entered" — so
  *"Record completeness — Needs attention — Large parts of your record are not
  entered yet"* printed the screen's own contradiction. The asymmetry was
  structural: the factor reports `conf = 1` whether or not anything is behind it,
  so the one purely data-entry measure was the one guaranteed to be graded rather
  than excluded, while development's absence rendered "Not entered". Below the
  `on_track` cut it is now `not_enough_entered` and joins `coverage.missing`, so
  the plan asks for the sections instead of marking the Sailor down for them.
- **Horizon groups on `horizonBasis`, not on `horizon`.** No seeded milestone
  carries `typical_months`, so today every meet-action lands in `next_cycle`
  with basis `unknown_duration`. That renders as one honest bucket — *"APEX does
  not know how long these take — start now"* — rather than telling a Sailor five
  months out that everything is next cycle. Buckets render only when non-empty.
- **An unsourced precept is treated as an absent one.** `assembleRubricInputs`
  populates `preceptFlags` only when the active precept carries a `source_url`.
  Otherwise the rubric excludes the factor and redistributes its weight ×100/90 —
  the path that already existed for "no precept at all". Without this, five
  hand-set booleans produced a **full-confidence zero over 10 weighted points**
  (`scorePrecept` emits 0 for an indicator whose inputs are absent, and
  `conf_precept` is 1 unconditionally), scoring a Sailor against doctrine this
  tool's own screen disclaims as *"entered by an APEX Admin and not taken from
  the board's convening order"*. Coverage cannot catch it: nothing is missing.
  The Precept tab agrees: with a row present but unsourced, its flag chips render
  as *"recorded, not scored"* rather than emerald, because branching on the row's
  mere existence made that tab contradict the Results tab in the same session.
  Note the copy distinction — *"not set up for your cycle"* is false for this
  state. An admin **did** set them up; APEX declined to trust them.

  `COVERAGE_FLOOR` is deliberately **not** rescaled. Excluding the precept maps
  coverage by `(m − 0.10) × 10/9`, so a record at 0.7675 becomes 0.7417 and loses
  its number with nothing about the Sailor changed. The floor is defined against
  *effective* (post-redistribution) weights, and the no-precept case has always
  been on that scale — rescaling would loosen the gate for every existing
  no-precept user instead.
- **A tool-configuration gap is not the Sailor's gap.** With no active precept
  the rubric drops the factor to weight 0 and coverage counts five areas; the
  screen drops the card rather than showing a sixth "Not entered".
- **Path-shaped tokens are stripped at display time.** The narrative's citation
  gate parses only the *trailing* bracket group, deliberately, so prose brackets
  survive — `Complete "Advanced Network Analyst [NEC 742A]"` keeps its NEC code,
  which matters now that 80 transcribed milestones carry bracketed NEC and CIN
  codes. The cost is that a path-shaped token in non-final position reaches the
  reader. It cannot launder a claim (the trailing group still gates the whole
  item), but it is ugly, so the display strips a `word.word` shape *inside*
  brackets — never all brackets, which would eat the codes the gate just worked
  to preserve.
- **`board_analyses.input.readiness`** (additive, jsonb, no migration) holds the
  run's report, snapshotted like the rest of the run so a prior review renders
  what it said at the time. Runs written before v2 show *"predates the readiness
  review — run it again"* and **no score**.

## Privacy, consent, and ethics

- **Explicit consent, server-enforced:** a first-use modal records
  `member_board_records.consented_at`; `POST /api/board-confidence/analyze`
  refuses to run without it.
- **What reaches the AI:** only rubric numbers, LaDR category completion
  ratios, precept flags, target paygrade, and the rating abbreviation. Never a
  name, DoD ID, award title, tour title, free text, or uploaded file content.
  The provider is operator-selected (direct OpenAI-compatible endpoint or
  the Vercel AI Gateway — see Setup);
  review the chosen provider's data-use terms — the payload contains no PII
  regardless.
- **Ephemeral uploads:** ESR/PSR/OMPF (field codes 30–38) documents can be
  uploaded as reference copies. Users are instructed to **redact PII before
  uploading** (a confirmation checkbox gates the upload), the files are never
  parsed or scored, and they are **destroyed at logout** (with a sweep at next
  login for sessions that ended without one, e.g. a closed browser).
- **No full-record logging:** server logs carry error metadata only.
- **RLS:** `member_board_records` and `board_analyses` are owner-only;
  analysis inserts are server-role only; every run writes a
  `BOARD_ANALYSIS_RUN` audit row (fail-closed — no audit, no analysis).
- **Disclaimer layers:** first-use consent modal, page banner, results banner,
  score-dial tooltip, persistent footer, and the verbatim disclaimer stored in
  every `board_analyses.input` payload.

## Setup

1. Apply migrations `004_board_confidence.sql` and `005_board_docs_storage.sql`
   (005 is the private storage bucket, split out because `storage.objects`
   ownership varies on hosted Supabase — the file header documents the
   dashboard fallback).
2. Seed LaDR data:
   ```sh
   npx tsx scripts/seed-ladr.ts
   ```
   Ships IT (transcribed from the real July 2026 Navy COOL LaDR), BM and HM.
   LaDR reference data only — see "Setting the board precept" for that. Note
   `seedRating` is delete-and-reinsert per document, so every milestone UUID
   changes and any document already stored under the same
   `(rating_abbrev, paygrade_range, effective_date)` key — the 004 unique
   constraint the upsert targets, `version` is **not** part of it — is
   **replaced in place**, not merged (the document row keeps its own UUID).
   Member checklists are remapped on `(category, item_code ?? item)`; entries
   that no longer match fall back to unanswered.
3. Optional AI narrative — provider-agnostic, two independent modes.
   **Neither requires hosting on Vercel** (the whole app runs self-hosted;
   only the NAVFIT `.accdb` export's JRE requirement drives hosting choice):
   - **Direct mode (zero Vercel services)** — any OpenAI-compatible endpoint;
     takes precedence when set:
     ```env
     BOARD_NARRATIVE_BASE_URL=https://api.x.ai/v1   # xAI/Grok; or OpenRouter,
                                                    # Groq, or a local Ollama
                                                    # (http://localhost:11434/v1)
     BOARD_NARRATIVE_API_KEY=...                    # omit for keyless local
     BOARD_NARRATIVE_MODEL=grok-4-fast              # the provider's NATIVE id
     ```
     OpenRouter (`https://openrouter.ai/api/v1`) is the best-price
     multi-provider option on this path — it routes across vendors including
     Anthropic and xAI.
   - **Gateway mode (one key, many providers, cost dashboard)** — the Vercel
     AI Gateway is a plain HTTPS API callable from any host:
     ```env
     AI_GATEWAY_API_KEY=...                          # or OIDC on Vercel deploys
     BOARD_NARRATIVE_MODEL=anthropic/claude-opus-5   # or xai/grok-4.5, etc.
     ```
     List models: `curl -s https://ai-gateway.vercel.sh/v1/models`.
   Without either configuration the analyzer produces a deterministic
   narrative — every feature still works.

## Maintaining the LaDR knowledge base

LaDRs are public PDFs on Navy COOL (`https://www.cool.osd.mil/usn/LaDR/{rating}_{paygrade}.pdf`,
reviewed annually; the cover month+year is the version key). Two ingestion
paths, both inserting a **new versioned row** per LaDR issue — never
overwriting (spec §10.3):

1. **On-demand fetch (v1.4)** — on the LaDR tab, selecting a rating with no
   stored document offers "Fetch official LaDR from Navy COOL": the server
   downloads the PDF (a dedicated TLS agent pins the site's public certificate
   chain — cool.osd.mil omits its intermediate; see
   `lib/boardConfidence/ladrCerts.ts`), extracts the text in memory (the PDF
   is never persisted), and stores conservatively parsed milestones flagged
   `auto_extracted` (the checklist shows a verify-against-the-source note).
   The rating dropdown itself lists the full static catalog
   (`lib/boardConfidence/ratings.ts`), so it works before anything is stored.
2. **Curated seed (higher fidelity)** — transcribe a rating's milestones into
   a `scripts/ladr-data/<rating>.ts` dataset (copy `it_e1_e9.ts` as the
   template), register it in `scripts/seed-ladr.ts`, and re-run the seed.
   Datasets not transcribed from the source PDF must carry
   `source: 'representative'`.

A curated seed and a fetched document for the same LaDR issue collide on the
same `(rating_abbrev, paygrade_range, effective_date)` unique key (004), so the
fetch reports "already current" and the seed upsert replaces the stored row's
milestones in place.

### What the checklist renders (v1.6)

`components/board/LadrChecklist.tsx` is presentation only — it changes no
scoring input — but it renders everything a transcribed row carries, because a
field stored and hidden is a field the Sailor cannot act on:

- **Paygrade block first, category second.** A block is `min(applies_to_paygrades)`,
  highest first, so the block that is the gate for the target leads and the
  earlier blocks read as history. Categories inside a block keep the
  `LADR_CATEGORY_WEIGHTS` order, informational (weight 0) last. Because the key
  is the *minimum*, an earlier block can still hold rows the LaDR lists at the
  target (IT's CANES PQS is `[4,5,6]` — block E-4, live at E-5), so the "behind
  you" gloss prints **only** when every row in the block stops short of the
  target. Getting that wrong tells a Sailor to stop working a current item.
- **Per-row disclosure** (native `<details>`) with `detail.notes` verbatim and
  untruncated, `detail.examples` as whole parentheticals (never split into
  per-code chips — a comma split mangles "Combat System Watch Officer (CSWO)"),
  and BM's `detail.group` assignment heading. A row whose `detail` carries none
  of these gets no trigger at all.
- **Tier headings** from `detail.tier`, in source order (Fully Qualified above
  Best Qualified — pinned by test, an inversion would read as "BQ instead of
  FQ"), with `detail.preamble` printed once under the first tier that carries
  it. Best Qualified is labelled as additive to Fully Qualified, not an
  alternative — IT prints that itself in its Best Qualified preamble, HM prints
  "Must meet preceding E7 FULLY QUALIFIED criteria" as an E8 row. BM's
  `unspecified` rows get **no** tier badge: its LaDR prints no split and one is
  not inferred.
- **Sea/shore once per card**, not once per row — it is a property of the step.
  `sea_shore_scope: "rating"` is not step-specific at all, so it is hoisted
  above the blocks and printed once for the whole checklist (HM's is 2,715
  characters and would otherwise repeat three times for an E-9 candidate).
- **Paygrade chip and board-emphasis badge per row**, the badge from
  `rubric.ts::isBoardEmphasis` — the same function `service.ts` scores from, so
  the UI cannot claim an emphasis the engine does not apply.

**Editorial text in the checklist — the complete list.** Everything else on
screen is the LaDR's own words. All three describe this page's layout, not Navy
doctrine:

1. The Best Qualified heading's "in addition to the Fully qualified list above
   — not instead of it", shown only when an FQ group is rendered above it.
2. The block glosses: "the gate for E-N", "first listed at E-N", and "first
   listed at E-N — behind you at E-N" (conditions above).
3. The subtitle's "grouped by the paygrade block the LaDR first lists them at".

**Scope.** `advancement_consideration` is the only category the transcription
gave `notes`, so disclosures exist for 22 of IT's 48 rows, 24 of BM's 39 and 34
of HM's 71. Everything else still renders flat, and a member targeting E-6 or
below sees no disclosure at all — that is the shape of the data, not a UI gap.
This closes the 30-weight section of the checklist, not the whole of it.

## Tuning the rubric (v1.5)

The `board_rubric_config` table (migration 007) holds the tunable rubric
parameters; the single `active` row is loaded for every run and snapshotted
into that run's `input.meta.rubric_config`, so past scores stay reproducible
after retuning. Columns:

- `weights` — per-factor weights (jsonb); normalized to sum 100 at run time.
  A zero/blank sum falls back to the default weights with a warning.
- `continuity_gap_days` (default `90`) — a missing reporting period longer than
  this is graded as a gap and raises the continuity advisory.
- `board_emphasis_multiplier` (default `2.0`) — how much extra weight
  board-emphasis LaDR items carry inside their category.

Because in-app roles are self-asserted, there is **no in-app admin UI**:
retune via the Supabase dashboard or service-role SQL — insert a new row with
your values and move the `active` flag to it (a partial unique index enforces
one active row). Defaults reproduce spec §7 exactly; the worked examples are
pinned by tests under the default config.

## Setting the board precept

The Precept Alignment factor (§7 Factor 6, 10% weight) scores a member's record
against the **active** board precept — the emphasis areas a selection board's
convening order names. With no active precept (a fresh install), the factor is
excluded and its weight redistributes across the other five; the UI says so.
That is a graceful degrade, not an error — load a precept to activate the factor.

Because the precept is system-wide config and in-app roles are self-asserted,
it is set **only** by whoever holds the service-role key (same trust model as
rubric tuning):

1. Edit `scripts/ladr-data/precept_current.ts` — set `cycle`, `title`, the real
   `emphasis_flags` (set `true` only for the areas the board's precept names),
   and `source_url` (the convening-order link, or `null` for a modeled precept).
2. `npm run seed:precept` — upserts on `cycle` and makes it the single active
   row. The script refuses to run on the unedited template or with zero
   emphasis flags. **This is the only path that writes a precept.** `seed-ladr.ts`
   used to activate the shipped **modeled** FY27 precept unconditionally, so
   loading LaDR milestones also published three fabricated emphasis flags to
   every user; that coupling is removed (v1.6).

**Fetch-to-reference (v1.6).** Precepts are published PDFs on MyNavyHR
([Flag boards](https://www.mynavyhr.navy.mil/Career-Management/Boards/Flag/Precepts/),
[CPO/enlisted boards](https://www.mynavyhr.navy.mil/Career-Management/Boards/Active-Duty-Enlisted/CPO-Selection-Boards/)).
The precept tab's **"Reference a published precept"** panel takes the PDF one of
two ways, both extracting text in memory (never persisted) and suggesting which
of the five flags the precept names — with the triggering quote:

- **Fetch by URL (primary)** — `POST /api/board-confidence/precept-fetch`
  downloads it server-side (host allow-listed to `mynavyhr.navy.mil` as an SSRF
  guard). **MyNavyHR is not blocked and never was.** It sits behind AkamaiGHost,
  which rejects requests that do not look like a browser navigation; the fetcher
  sends the full `BROWSER_HEADERS` set. Verified 2026-07-29 against the live
  FY-27 precept: 200, 235,468 bytes, 24,950 characters extracted.
- **Upload (fallback, v1.6.1)** — download the precept yourself and upload it
  (`POST /api/board-confidence/precept-extract`, same in-memory/no-persist
  invariants as record-extract). The browser already has the file, so the
  **server needs no outbound access** — for genuinely restricted networks
  (proxy/firewall/DoD IP filtering) where the runtime cannot reach MyNavyHR.

Because a precept is broad prose (not a clean checklist like the LaDR
"Considerations for advancement"), the suggestions are a **starting point you
confirm against the text**, never an auto-derived scoring input — verified on the
real FY-27 enlisted precept, which names none of the five areas. The panel then
emits the exact `precept_current.ts` values to apply via `npm run seed:precept`.
Both extract paths are read-only and open to any authenticated user (they read a
public document); activation stays the privileged service-role step above.

Equivalent one-off via the Supabase SQL editor:

```sql
insert into public.board_precepts (cycle, title, emphasis_flags, source_url, active)
values (
  'FY27 Active-Duty E7',                                  -- board cycle
  'FY27 CPO Selection Board emphasis',                    -- title
  '{"warfighting":true,"leadership_positions":true,"sea_duty":true,
    "education":false,"technical_expertise":false}'::jsonb,-- true = emphasized
  null,                                                    -- convening-order URL, or null
  true
)
on conflict (cycle) do update
  set title = excluded.title, emphasis_flags = excluded.emphasis_flags,
      source_url = excluded.source_url, active = true;
update public.board_precepts set active = false where cycle <> 'FY27 Active-Duty E7';
```

## Manual steps & known limits (v1)

- Migrations/seed must be applied to the hosted project (see Setup).
- Officer boards, OCR of scanned/image-only ESR/PSR PDFs (v1.5 extraction
  needs a text layer), pgvector embeddings, and leadership/multi-member views
  are out of scope (spec §12).
- Admin-on-behalf analysis is deferred: `profiles` roles are self-asserted in
  this app, so the server cannot trust them for cross-user access.
- CPO boards brief and vote each record individually within a rating panel, which
  groups several rating communities rather than one panel per rating (PERS-803
  example panels: Admin/Supply, Nuke/SPECWAR, Aviation, Surface Ops/Engineering,
  Submarine, Combat Systems/Info Warfare) — and scattergram the
  results; the Navy publishes no numeric vote scale for enlisted boards, so the
  banding is an explicitly labeled approximation borrowed from the officer brief.
