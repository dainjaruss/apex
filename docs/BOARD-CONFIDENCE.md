# Board Confidence Analyzer

An **unofficial, educational** self-assessment tool that scores a Sailor's
record the way a selection-board recorder reads one, for E-7+ (CPO and above)
board preparation. Full implementation spec:
[`docs/specs/board-confidence-analyzer.md`](specs/board-confidence-analyzer.md)
(v1.1 — the normative rubric, DDL, and API contracts live there).

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
                                                        generateNarrative() — claude-opus-4-8, Zod
                                                        structured output; deterministic fallback
                                                        when ANTHROPIC_API_KEY is absent or the
                                                        model call fails
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
  name, DoD ID, award title, tour title, free text, or file content. Anthropic
  does not train models on API data.
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
3. Optional AI narrative: set `ANTHROPIC_API_KEY` in the server environment.
   Without it the analyzer produces a deterministic narrative — every feature
   still works.

## Maintaining the LaDR knowledge base

LaDRs are public PDFs on Navy COOL (`https://www.cool.osd.mil/usn/LaDR/{rating}_{paygrade}.pdf`,
reviewed annually; the cover month+year is the version key). There is no bulk
API, so ingestion is deliberate: transcribe a rating's milestones into a
`scripts/ladr-data/<rating>.ts` dataset (copy `it_e1_e9.ts` as the template),
register it in `scripts/seed-ladr.ts`, and re-run the seed. Refreshes insert a
**new versioned row** per LaDR issue — never overwrite — and member checklists
remap by category + item code (spec §10.3). Datasets not transcribed from the
source PDF must carry `source: 'representative'`.

## Manual steps & known limits (v1)

- Migrations/seed must be applied to the hosted project (see Setup).
- Officer boards, automated LaDR PDF scraping, ESR/PSR OCR, pgvector
  embeddings, and leadership/multi-member views are out of scope (spec §12).
- Admin-on-behalf analysis is deferred: `profiles` roles are self-asserted in
  this app, so the server cannot trust them for cross-user access.
- CPO boards vote slates by rating panel rather than per-record confidence
  scores — the banding is an explicitly labeled approximation.
