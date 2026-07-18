# Board Confidence Analyzer

An **unofficial, educational** self-assessment tool that scores a Sailor's
record the way a selection-board recorder reads one, for E-7+ (CPO and above)
board preparation. Full implementation spec:
[`docs/specs/board-confidence-analyzer.md`](specs/board-confidence-analyzer.md)
(v1.3 — the normative rubric, DDL, and API contracts live there).

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
- **Six factors** (weights): Performance 40, Leadership/Impact 15,
  Professional Development vs LaDR 15, Continuity 10, Record Completeness 10,
  Precept Alignment 10. Missing data shrinks a factor's confidence (and thus
  its contribution) rather than being fabricated.
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

## Manual steps & known limits (v1)

- Migrations/seed must be applied to the hosted project (see Setup).
- Officer boards, automated LaDR PDF scraping, ESR/PSR OCR, pgvector
  embeddings, and leadership/multi-member views are out of scope (spec §12).
- Admin-on-behalf analysis is deferred: `profiles` roles are self-asserted in
  this app, so the server cannot trust them for cross-user access.
- CPO boards vote slates by rating panel rather than per-record confidence
  scores — the banding is an explicitly labeled approximation.
