# APEX — Advanced Performance Evaluation eXchange

APEX digitizes the U.S. Navy's enlisted performance evaluation workflow (NAVPERS 1616/26, Rev. 05-2025). It takes an evaluation from draft through a five-stage chain-of-command review, credential-verified digital signatures, and final lock — and renders the result onto the official form, character-for-character.

Built as the CIS 5898 capstone project by Dain Franklyn.

## Features

- **Block-accurate evaluation editor** — the form mirrors the official NAVPERS block numbering, with a live preview that wraps narrative text exactly as it will print (10/12-pitch Courier).
- **Validation engine** — cross-field rules from BUPERSINST 1610.10H (occasion-for-report combinations, narrative overflow, 1.0/2.0 trait substantiation, date consistency), each violation reported with its source rule (`lib/validationEngine.ts`).
- **Custody routing** — Sailor → Rater → Senior Rater → Reporting Senior → Admin, with recycle-for-correction, debrief, and a feedback timeline. Transitions are enforced server-side via service-role API routes; row-level security limits browser writes to the current custodian (`supabase/migrations/002_routing_workflow.sql`).
- **Digital signatures** — HTML5 canvas capture with typed-name and consent; signers re-authenticate against Supabase Auth before any signature is stored (`/api/sign`). The Reporting Senior's final signature locks the report.
- **RBAC** — 20 permission actions across 5 roles, checked statically (`hasPermission`) and contextually against custody (`canPerformAction`) in `lib/permissions.ts`, plus an admin user-management panel.
- **Summary groups & forced distribution** — pooled trait averages for Block 50a and EVALMAN Table 1-2 promotion-recommendation quotas (EP ≤ 20%; EP+MP ≤ 60% for E5/E6), with live quota tracking.
- **Official PDF output** — evaluation data is overlaid onto the official 05-2025 blank at measured coordinates using pdf-lib + embedded Courier Prime (`lib/pdfOverlay.ts`), streamed from `/api/pdf`.
- **Audit trail** — every lifecycle event (creation, routing, corrections, signatures) recorded in `audit_logs` and surfaced on the report screen.

## Stack

Next.js 14 (App Router) · React 18 · TypeScript · Supabase (Postgres, Auth, RLS) · Tailwind CSS · Zod · pdf-lib · Vitest · Playwright

## Getting started

```bash
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
npm run dev
```

Apply the migrations in `supabase/migrations/` (001 schema, 002 routing workflow) to your Supabase project, then optionally seed demo users and evaluations:

```bash
npm run db:seed          # E2E fixture users + evals (see docs/test-users-and-evals.md)
```

## Tests

```bash
npm test                 # core suite
npm run test:all         # full suite — 158 tests across 19 files
npm run test:e2e         # 3 Playwright specs (needs a seeded Supabase instance)
```

## Notes

- `/api/pdf` renders caller-supplied JSON onto the blank form and is unauthenticated by design — it holds no data of its own; all evaluation reads/writes go through RLS-guarded queries and service-role routes.
- Rule-to-instruction mapping lives in `docs/rules-reference.md`; validation excerpts come from `bupersGuidelines.json`.

