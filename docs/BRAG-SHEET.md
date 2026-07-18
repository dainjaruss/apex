# Brag Sheet + AI Auto-Fill

A structured, year-round accomplishment collector modeled on the fleet-standard
"Enlisted Evaluation Report Input Sheet", plus an optional AI auto-fill that
turns it into a grounded, citation-carrying draft of an evaluation's narrative
blocks. Full implementation spec:
[`docs/specs/brag-sheet.md`](specs/brag-sheet.md) (v1.0 — the normative
template, DDL, prompt, pipeline, and API contracts live there).

> **UNOFFICIAL DRAFTING AID.** AI-generated text is a proposal drafted from the
> member's own brag sheet entries — it is not an official evaluation, has not
> been reviewed by the chain of command, and may contain errors. Trait grades
> (Blocks 33–39) and the promotion recommendation (Block 45) are **never
> generated**: they are human judgments reserved to the reporting senior.
> Never enter classified information in a brag sheet.

## Filling the sheet

`/brag-sheet` (any signed-in role — it is the Sailor's own tool). Create one
sheet per eval period (report type gated to your paygrade, period from/to).
The editor is an accordion of 11 sections — admin data, duties, job
information, supervision & leadership, individual accomplishments,
qualifications/awards/education, off-duty, PRIMS/PFA cycles, future goals,
counseling record, and additional items — each labeled with the NAVPERS blocks
it feeds (~80% funnels into Block 43). Edits autosave (debounced). Field rules
are enforced inline exactly as final validation will: 29A abbreviation ≤14
chars, Block 41 career recommendations 2 × 20 chars, counselor ≤22 chars, PFA
results P/B/F/M/W/N with a live Block 20 code, exactly one most-significant
primary duty, and a passive "no metric" hint on bullets without numbers.

## Downloads

- **PDF** — branded, client-side (`brag-sheet-<period_to>.pdf`, "APEX Brag
  Sheet v1.0 – Powered by APEX", Courier Prime, footer disclaimer on every
  page). This is a worksheet, not a NAVPERS form.
- **JSON** — the full sheet row, pretty-printed (`brag-sheet-<period_to>.json`).
  Re-importable: the import validates against the template schema and asks for
  confirmation before replacing the current sheet's contents.

## Uploads (prior evals / PRIMS)

Drop a prior-eval or PRIMS PDF on the page. Its text is extracted **entirely
in memory** on the server (`POST /api/brag-sheet/extract`) and offered back as
per-field suggestions — admin fields, duties, quals, PFA cycles, bullets —
that merge into the editor only when you click Accept on each one. The file is
read in your browser session only and is **never stored**: there is no storage
bucket for this feature, and no code path writes an uploaded byte to disk,
Supabase storage, or logs. Uploads are capped at 10 MB; unreadable or
image-only scans return a plain "couldn't read" message. As with any document
handling, prefer redacting sensitive identifiers (SSN/DoD ID) from PDFs before
uploading — extraction only suggests text back to you, but the habit costs
nothing.

## AI auto-fill flow

1. **Availability probe** — the Generate button only appears when the server
   has an AI provider configured (`GET /api/brag-sheet/autofill`). Keyless
   servers answer 503; there is no canned fallback draft.
2. **Consent gate** — a first-use modal records `brag_sheets.consented_at`;
   the route refuses with 403 until it is set. Declining keeps the brag sheet
   fully usable — only AI drafting is disabled.
3. **Assembly (server, owner-only)** — your sheet + summaries of up to 5 prior
   finalized APEX evaluations (owner cross-checked by DoD ID) + your LaDR
   milestone status. Your DoD ID is deleted from the payload before it is
   serialized to the model.
4. **Generation** — one model call (plus at most one parse retry and one
   overflow retry — hard cap 3 calls) drafts Blocks 28, 29A, 29B, 41, 43, and
   44 (EVAL only). Block 20 is deterministic — computed from your PFA rows and
   overwritten server-side; the model can never alter a PFA code.
5. **Pipeline** — every generated item must cite a payload source that
   actually resolves ("citation-or-delete"; failures are shown struck-through,
   never silently kept). Fit is checked with the exact `lib/commentFit.ts`
   machinery the form, validation engine, and PDF share; an overflowing block
   gets one automatic retry with concrete feedback, then comes back flagged
   with a truncation preview — the server never trims text. The result is
   dry-run validated with `runFullValidation` so you see what final validation
   will say before applying anything.
6. **Audit, fail-closed** — no draft is released unless a `BRAG_AUTOFILL_RUN`
   audit row (payload hash, model id, overflow/citation/missing-info counts —
   no PII) inserts.

## Review semantics

The review panel is side-by-side: brag source left, generated text right.

- **Per-block cards** with citation chips (click to scroll/highlight the cited
  source row in the editor), fit meters (lines used / max at the block's CPL;
  char counters for 29A and 41), and **Accept / Edit / Reject** per block.
  Block 20 is read-only ("computed from your PFA rows").
- **Overflowing blocks cannot be accepted** — regenerate shorter or edit
  manually with a live fit check.
- **Missing-info list** — things the model needed but your sheet lacks, each
  with a go-to-field link. Fill them in and regenerate.
- **Promotion advisory is display-only** — recommendation + rationale +
  citations, headed "ADVISORY ONLY — not written to the form". No control
  exists to copy it into Block 45.
- **Create draft** — enabled once ≥1 block is accepted and nothing accepted
  overflows. Applies **only** the blocks you accepted over the standard report
  seed via the existing draft-save path, then opens the new evaluation.
  No server code path ever writes generated text into an evaluations row, and
  no disclaimer/watermark text enters the form — the audit log is the
  provenance record.

## Environment

AI configuration is the **shared provider surface** in `lib/aiProvider.ts` —
the same `BOARD_NARRATIVE_*` variables the Board Confidence Analyzer uses (one
config block for both features; see the Setup section of
[`docs/BOARD-CONFIDENCE.md`](BOARD-CONFIDENCE.md) for worked examples of both
modes):

| Variable | Required | Purpose |
|---|---|---|
| `BOARD_NARRATIVE_BASE_URL` | optional | direct mode: any OpenAI-compatible endpoint (takes precedence) |
| `BOARD_NARRATIVE_API_KEY` | optional | direct-mode key (omit for keyless local endpoints, e.g. Ollama) |
| `BOARD_NARRATIVE_MODEL` | optional | native id (direct) or `provider/model` (gateway); default `anthropic/claude-opus-4.8` |
| `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` | optional | gateway-mode auth |

With no AI configuration, the brag sheet, PDF, JSON, and PDF extraction all
work — only Generate is hidden. Apply migration
`supabase/migrations/006_brag_sheet.sql` (owner-only RLS, no storage bucket).

## Privacy model

- **Uploads are never persisted** — processed in request memory and
  garbage-collected; no bucket, no disk, no logs (hard invariant, tested).
- **What reaches the AI:** your brag sheet content (minus DoD ID), prior-eval
  summaries, and LaDR checklist status — only after explicit recorded consent,
  and only to the operator-configured provider. Review that provider's
  data-use terms.
- **Owner-only everywhere:** `brag_sheets` RLS is owner-only; the autofill
  route authorizes by session ownership, never by self-asserted roles.
- **Fail-closed audit:** every generation run writes a `BRAG_AUTOFILL_RUN`
  audit row or the run's result is withdrawn.
- **No AI provenance in the form:** applied drafts contain only text you
  individually accepted; trait grades and Block 45 stay human-only.
