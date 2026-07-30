# APEX — agent ground rules

**Before starting any work, read [`docs/ai-workforce/orchestrator.md`](docs/ai-workforce/orchestrator.md)** —
the standing orchestrator/agent playbook (pickup protocol, dispatch economics, quality gates,
review-chain integrity). It is short and mandatory; the rules below are the always-on subset.

## What APEX is

A Next.js 14 + Supabase web app that digitizes the U.S. Navy enlisted evaluation workflow
(BUPERSINST 1610.10H / EVALMAN, NAVPERS 1616/26). It began as a Florida Tech CIS 5898 capstone.
**Navy leadership now wants to see an improved demo** — which means senior people who have
actually sat on selection boards will read the output. Domain credibility outranks feature count:
a plausible-sounding claim that a CMC knows is wrong costs more than a missing feature.

## Non-negotiables

- **Never invent Navy doctrine.** Every domain claim traces to a source in this repo
  (`docs/rules-reference.md`, `lib/bupersGuidelines.ts`, the seeded LaDR data, the spec) or to a
  cited public instruction. Unsourced instruction numbers, made-up board procedure, and invented
  advancement rules are the single worst defect class in this codebase — they are invisible to
  `tsc` and fatal in front of the audience.
- **Never claim to predict a board.** This tool is a self-assessment aid. The disclaimer text in
  `lib/boardConfidence/types.ts` is normative and rendered verbatim; do not soften it or route
  around it.
- **Honest uncertainty over false precision.** Say "we don't have this data" — never let missing
  data render as a low score. Conflating *weak* with *unknown* is the defect that motivated the
  v2 rethink; do not reintroduce it anywhere.
- **Roles are self-asserted.** `profiles.role` is user-settable, so the server can NEVER trust it
  for authorization. Owner-only RLS + `created_by` checks are the only real authz. System-wide
  config (rubric, precept) is service-role-only by design — do not build an in-app admin UI for it.
- **Uploads are never persisted.** ESR/PSR/OMPF and precept PDFs are parsed in memory and
  discarded. Any new upload path inherits this invariant and proves it with a test.
- **Branch before editing; return to `main` between tasks.** One git-writing agent at a time in
  `/srv/apex`; parallel writers get their own worktree.
- **Every user-facing page ships with a nav entry and a nav test.** *A shipped feature nobody can
  reach is not shipped — Brag Sheet and Board Confidence both had to be retrofitted (PR #14).*
- **Schema changes are migrations, applied to the hosted project.** Never edit hosted schema
  out-of-band, and never rely on `create ... if not exists` to paper over drift. *A missing
  `consented_at` column reached production and surfaced as a PostgREST schema-cache error.*
- **Server-only modules lazy-import their heavy deps** (`undici`, `unpdf`) inside the function
  that needs them. *Top-level `undici` broke the whole vitest run on jsdom's CacheStorage.*
- **Green means green.** The suite is fully green on `main`; any red suite is a real regression,
  never pre-existing debt. `npm run verify` (test:all + build) before every push.
