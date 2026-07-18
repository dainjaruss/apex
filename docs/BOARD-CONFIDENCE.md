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
  the results view shows a prominent advisory: a real selection board can treat
  **any** gap in the record — even a single day — as disqualifying. Verify your
  continuity on BOL and NSIPS.
- **Upload-driven entry (v1.5):** on the Record Entry tab, "Extract to
  record" parses an uploaded ESR/PSR/OMPF document in memory and pre-fills
  awards, NECs, education, and PFA cycles as editable, unverified rows — in
  lieu of manual entry. Nothing is scored until you review and save.
- **Identity model:** a run scores the caller's own finalized evaluations
  (`created_by` = subject, with a DoD-ID cross-check). Routes are owner-only.

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
2. Seed LaDR data and the example precept:
   ```sh
   npx tsx scripts/seed-ladr.ts
   ```
   Ships IT (transcribed from the real July 2026 Navy COOL LaDR), BM and HM.
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
     BOARD_NARRATIVE_MODEL=anthropic/claude-opus-4.8 # or xai/grok-4.5, etc.
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

A curated seed and a fetched document for the same LaDR issue share the same
`(rating, version)` key, so whichever lands first wins and the other reports
"already current".

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
   emphasis flags. (`scripts/seed-ladr.ts` still seeds the shipped **modeled**
   FY27 precept; `set-precept.ts` is the path for a real, version-controlled one.)

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
- CPO boards vote slates by rating panel rather than per-record confidence
  scores — the banding is an explicitly labeled approximation.
