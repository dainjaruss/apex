# APEX — Milestone Status Update
## Advanced Performance Evaluation eXchange

**Course:** CIS Capstone  
**Document type:** Software Standards, Progress Report (PDF Sections A & B)  
**Team:** *[Insert team member names]*  
**Date:** June 2026  
**Version:** Milestone Status Update v1.0

---

> **How to use this file:** Copy each section below into Google Docs or Word. Add screenshots from `02-screenshot-capture-list.md` as Section C. Insert the architecture diagram from `04-architecture-diagram.md`. Export as a single 7–10 page PDF.

---

# Section A — Software Standards and Policies

APEX (Advanced Performance Evaluation eXchange) is a web application that digitizes the Navy enlisted performance evaluation workflow for NAVPERS 1616/26 forms. Because the system handles regulated military evaluation data and must conform to BUPERSINST 1610.10H (EVALMAN), we adopted explicit software standards early and enforce them through tooling, architecture, and testing. The policies below describe what we follow today and how each practice improves quality, maintainability, security, and reliability.

---

## A1. Design and Coding Standards

**Language and framework.** APEX is built with TypeScript (strict mode), Next.js 14 (App Router), React 18, and Tailwind CSS. TypeScript catches type errors at compile time; Next.js provides server and client rendering, API routes, and file-based routing; Tailwind keeps UI styling consistent across pages.

**Project structure.** Code is organized by responsibility:

| Directory | Purpose |
|-----------|---------|
| `app/` | Pages, layouts, and API route handlers |
| `components/` | Reusable UI (form blocks, reviewer panel, signature pad) |
| `lib/` | Business logic (validation, permissions, routing, PDF, Supabase services) |
| `types/` | Shared TypeScript models and Zod schemas |
| `supabase/migrations/` | Versioned database schema |
| `tests/` | Unit, integration, and E2E tests |
| `docs/` | Rule mappings and milestone documentation |

**Coding conventions.** Each major source file begins with a header comment describing its purpose. Business rules live in `lib/` rather than in React components so they can be unit-tested independently. NAVPERS field validation is centralized in `types/navpers.ts` (Zod) and `lib/validationEngine.ts`. Navy guideline text is stored in `lib/bupersGuidelines.json` and surfaced inline in the form via `GuidelinesVisibilityContext`.

**Static analysis.** We run ESLint (`npm run lint`) and Fallow (`.fallowrc.json`) to flag dead code, duplication, and complexity. Rule-to-code traceability is documented in `docs/rules-reference.md`, which maps each BUPERS block rule to its enforcement location.

**Why this helps.** Separating validation, permissions, and UI makes the system easier to extend when EVALMAN policies change. A developer can update a Zod rule or permission map without rewriting entire React components.

---

## A2. Security Practices

**Authentication.** User identity is managed by Supabase Auth (email and password). Sessions are handled through the Supabase SSR client; protected pages redirect unauthenticated users to `/login`.

**Authorization (RBAC).** Role-based access control is defined in `lib/permissions.ts`. Roles include Sailor, Rater, Senior Rater, Reporting Senior, and Admin. Each role maps to allowed actions (create/edit eval, route, sign specific blocks, manage summary groups, view audit logs, etc.). UI components call `hasPermission()` before rendering sensitive controls; server routes re-check permissions before writes.

**Database security (RLS).** All Postgres tables use Row Level Security. Evaluations are visible to their creator, current custodian, routing participants, and oversight roles (Reporting Senior, Admin). Updates are restricted so users cannot hand custody to another person directly from the browser—custody transitions go through validated API routes.

**Server-side enforcement.** Sensitive operations bypass client-only RLS using a service-role Supabase client on the server, but only after authorization checks:

| API Route | Purpose |
|-----------|---------|
| `/api/eval-route` | Route forward, recycle, begin debrief |
| `/api/eval-lock` | Lock/unlock signature state |
| `/api/eval-correct` | Debrief minor corrections (allowlisted fields) |
| `/api/eval-finalize` | Finalize locked eval for export |
| `/api/sign` | Apply digital signatures to blocks |
| `/api/summary-group-attach` | Attach eval to summary group (BUPERS eligibility enforced) |
| `/api/summary-average` | Block 50a group average (visibility-gated) |
| `/api/summary-distribution` | Block 46 forced distribution (visibility-gated) |
| `/api/pdf` | Generate NAVPERS PDF |

**Input validation.** All evaluation payloads are validated with Zod schemas before save. API routes validate required fields, routing stage, and custody before applying updates. Summary group attachment validates paygrade, promotion status, ending date, report type, UIC, and reporting senior per BUPERSINST 1610.10H.

**Password and secrets handling.** Passwords are hashed by Supabase Auth; plaintext passwords are never stored in application code. Environment variables (`NEXT_PUBLIC_SUPABASE_URL`, anon key, service role key) live in `.env.local`, which is gitignored. `.env.example` documents required variables without secrets. The service role key is used only in server-side API routes and seed scripts.

**PII policy.** APEX uses synthetic 10-digit DoD IDs for development and testing. Social Security Numbers are not collected or stored. Block 27 stores DoD ID in lieu of SSN per APEX PII policy.

**Why this helps.** Defense in depth—RLS plus server routes plus Zod—reduces the risk that a manipulated browser request could route an eval incorrectly, attach to the wrong summary group, or sign on behalf of another role.

---

## A3. Database Design Standards

**Platform.** Supabase (managed Postgres) with SQL migrations in `supabase/migrations/`.

**Core tables.**

| Table | Role |
|-------|------|
| `profiles` | User identity, Navy rank, UIC, preferred role |
| `evaluations` | NAVPERS eval payload, custody, routing stage |
| `summary_groups` | Promotion-recommendation groups (shared BUPERS fields) |
| `audit_logs` | Immutable workflow event history |
| `review_approvals` | Recycle/return comments and approval status |
| `form_definitions` | Form metadata |
| `commands` | UIC lookup (optional; denormalized on profiles for MVP) |

**Design principles.**

- **Normalization:** Eval data stored in `evaluations`; user data in `profiles`; group metadata in `summary_groups`.
- **Constraints:** CHECK constraints on UIC length, routing stages, trait grade enums, and report types.
- **Referential integrity:** Foreign keys from evaluations to profiles and summary groups.
- **Uniqueness:** Summary groups are unique per reporting senior + ending date + paygrade + promotion status + report type.
- **Triggers:** `enforce_summary_group_fields()` copies shared group fields onto member evals when a summary group is attached.
- **Indexing:** Indexes on `summary_group_id` and `current_holder_id` for dashboard and routing queries.

**Migration workflow.** Schema changes are applied via numbered migration files (001 initial schema, 002 routing workflow and summary groups). Migrations are applied to the cloud Supabase project with the Supabase CLI.

**Why this helps.** A clear schema with RLS and triggers keeps BUPERS “shared field” rules enforced at the database layer, not only in the UI.

---

## A4. Error Handling and Logging Policies

**Client-side errors.** Form validation errors appear inline next to fields and in the Validation Results modal. API failures display user-readable messages parsed from `{ error: string }` JSON responses. Network failures during save or route operations show in the Review Workflow panel without silent failure.

**Server-side errors.** API routes use consistent HTTP status codes:

| Code | Meaning |
|------|---------|
| 400 | Invalid input or BUPERS eligibility failure |
| 401 | Not authenticated |
| 403 | Authenticated but not authorized (wrong role or not current holder) |
| 404 | Eval or user not found |
| 409 | Conflict (locked eval, invalid routing stage) |
| 500 | Unexpected server error |

Unexpected exceptions are logged to the server console with `console.error`; internal stack traces are not returned to the client.

**Audit logging.** Significant workflow events are written to `audit_logs`: route forward, recycle, debrief start, signature applied, summary group attached, finalize. Each entry records `evaluation_id`, `user_id`, `action`, and JSON `details`. Audit logs support accountability and debugging without exposing PII in application logs.

**Why this helps.** Structured errors and audit trails make it possible to diagnose routing disputes and demonstrate compliance during capstone review or future operational use.

---

## A5. Testing Plan and Quality Assurance Practices

**Testing pyramid.**

| Layer | Tool | Current status |
|-------|------|----------------|
| Unit | Vitest | 158 tests across 19 files |
| Integration | Vitest + React Testing Library | Form, login, validation, workflow panels |
| End-to-end | Playwright | Full routing chain, recycle, dashboard custody |

**Unit test coverage areas.**

- Paygrade parsing and summary group eligibility (`paygrade.test.ts`, `summaryGroupEligibility.test.ts`)
- BUPERS validation engine and comment fit (`validationEngine.test.ts`, `commentFit.test.ts`)
- Trait average and summary group average (`traitAverage.test.ts`)
- Forced distribution / Block 46 (`forcedDistribution.test.ts`)
- RBAC permissions (`permissions.test.ts`)
- Auth helpers (`auth.test.ts`)

**Integration tests.** Exercise multi-component flows: evaluation form save, validation modal, routing panel visibility by stage, login page rendering.

**E2E tests.** Playwright specs run against a seeded Supabase cloud database:

- `full-eval-workflow.spec.ts` — route chain → debrief → sign → lock → export
- `eval-recycle.spec.ts` — recycle one step back with comments
- `dashboard-routing.spec.ts` — custody visibility rules

**Seed data.** `scripts/seed-e2e.ts` creates reproducible `@franklyn.dev` test users and BUPERS-valid eval fixtures. Credentials and eval IDs are written to `tests/fixtures/e2e-ids.json`.

**QA before milestones.** Run `npm run test` and `npm run test:e2e` before submission. Manual walkthroughs verify each role (Sailor through Reporting Senior) can complete their stage.

**Why this helps.** Automated tests protect complex BUPERS rules and routing logic from regressions as features are added.

---

## A6. Privacy and Data Protection Considerations

**Data minimization.** Profiles store only fields needed for eval workflow: name, rank, UIC, command, DoD ID (synthetic in dev), role.

**Access control.** Evaluations are not globally readable. RLS limits visibility to participants in the routing chain plus oversight roles. Summary group averages and peer distributions are hidden from sailors during draft; server routes enforce the same rule.

**Development vs. production.** E2E seed users use `@franklyn.dev` emails and shared test passwords documented in `.env.example`. No real sailor data is used in development.

**Third-party hosting.** Supabase cloud stores data with RLS as the primary access boundary. Service role credentials are restricted to server environments.

**Why this helps.** Aligns with military expectations for need-to-know access and reduces exposure of evaluation content to unauthorized roles.

---

## A7. Version Control and Source Code Management

**Repository.** Git repository with milestone-oriented commit history (Week 5–9 feature milestones visible in log).

**Practices.**

- Descriptive commit messages tied to features (e.g., routing workflow, PDF generation, summary groups)
- `.env.local` and secrets excluded via `.gitignore`
- `.env.example` committed for onboarding
- Feature work on branches; merge to main after tests pass *(adjust if your team uses a different flow)*

**Collaboration.** *[Insert your team’s practice: pair programming, PR review, division of components/lib/tests, etc.]*

**Why this helps.** Version history documents project evolution for capstone grading and future maintenance.

---

## A8. AI Usage Policy

**Permitted uses.**

- Researching BUPERSINST 1610.10H requirements and mapping them to validation rules
- Generating boilerplate tests, TypeScript types, and documentation drafts
- Debugging assistance for Supabase RLS, Playwright, and Next.js API routes
- Code review suggestions (Fallow, ESLint, Cursor Agent)

**Prohibited or restricted uses.**

- Committing AI-generated code without human review and test verification
- Using AI to process or store real sailor PII
- Bypassing validation or security checks at AI suggestion without understanding impact

**Team responsibility.** All team members review and understand code before merge. AI assists development; it does not replace design decisions, BUPERS interpretation accountability, or testing responsibility.

**Disclosure.** This milestone document and portions of the codebase were drafted with AI assistance and edited by the team per course policy.

**Why this helps.** Transparent AI policy demonstrates academic integrity while acknowledging modern development tooling.

---

## Standards Summary

Together, these standards ensure APEX remains **maintainable** (typed, modular code), **secure** (RLS, RBAC, server enforcement), **reliable** (158 automated tests, audit logs), and **compliant** (BUPERS validation at schema, engine, and UI layers). They directly support our goal: a system that catches administrative errors before signature and routes evaluations correctly through the chain of command.

---

# Section B — Project Progress Report

## B1. Features and Functionality Completed

The following major features are implemented and tested:

1. **User onboarding** — Registration and login with Navy profile fields (rank, UIC, command, role).
2. **Evaluation wizard** — Multi-step NAVPERS 1616/26 form: Admin (Blocks 1–32), Traits (33–39), Comments (40–47), Details/signatures.
3. **Real-time validation** — Inline BUPERS guidelines, live Zod validation, and on-demand full rules check modal.
4. **Draft persistence** — Local autosave plus explicit “Save Evaluation Draft” to Supabase.
5. **PDF generation** — Server-side NAVPERS PDF with preview and export gate (validation must pass).
6. **Custody routing workflow** — Sailor → Rater → Senior Rater → Reporting Senior → Debrief → Locked, with `current_holder_id` and `participants` tracking.
7. **Route forward and recycle** — Server-enforced via `/api/eval-route`; recycle requires correction comments.
8. **Digital signatures** — Canvas signature pad for Blocks 42, 49, 50, 51 (and 52 for concurrent reports).
9. **RBAC** — Permission engine and RoleGuard; Admin panel for user management.
10. **Audit logs and review history** — Workflow events and recycle feedback timeline.
11. **Summary groups** — Reporting Senior creates groups; members attach during draft or routing; DB trigger inherits shared fields.
12. **Block 50a group average and Block 46 forced distribution** — Computed with visibility rules; peers-only pool for draft form.
13. **Summary group eligibility enforcement** — BUPERS-aligned filtering in UI plus `/api/summary-group-attach`.
14. **Automated testing** — 158 unit/integration tests; Playwright E2E for full lifecycle.

## B2. Features Currently Under Development

- Final polish on Review Workflow UI and error messaging
- Additional E2E coverage for summary group attach edge cases
- Documentation and demo preparation for this milestone
- *[Add any in-progress items your team is actively working on]*

## B3. Challenges Encountered

| Challenge | Impact | Resolution |
|-----------|--------|------------|
| BUPERS rule complexity | Many interdependent block rules | Central Zod schema + validation engine + rules reference doc |
| RLS vs. server writes | Browser could not perform custody transitions | Service-role API routes with session-based caller verification |
| Summary group peer visibility | Sailors could not see peers for averages | Dedicated API routes with visibility gates |
| Wrong summary group selection | Sailor could attach ineligible paygrade groups | Shared eligibility module + server attach route |
| PDF field alignment | Text overflow on official form layout | pdf-lib overlay tuning and comment fit engine |
| E2E test flakiness | RS dropdown reset on async load | Preserve user selection when profile list refreshes |

## B4. Changes to the Original Project Plan

- **Expanded scope:** Added full custody routing model (migration 002) beyond simple draft/submit.
- **Added summary groups:** Promotion recommendation pooling (Blocks 46, 50a) required by BUPERS comparison rules.
- **Server APIs:** Original plan assumed more client-side Supabase access; we added API routes wherever RLS blocked legitimate workflow transitions.
- **E2E infrastructure:** Added Playwright, cloud seed script, and `@franklyn.dev` test users for reproducible demos.

## B5. Blockers and Assistance Needed

| Item | Status | Notes |
|------|--------|-------|
| Production UIC/command lookup | Optional future work | MVP uses denormalized command on profile |
| Hosting/deployment target | *[Open / decided]* | Local dev + Supabase cloud; Vercel or similar TBD |
| Instructor feedback on debrief policy edge cases | *[If applicable]* | Minor correction allowlist is intentionally strict |
| *[Team-specific blocker]* | | |

## B6. Planned Next Steps

1. Complete milestone PDF and demonstration video.
2. Address remaining UI polish and any open E2E failures.
3. Final capstone feature freeze and regression test pass.
4. Prepare final presentation and deployment demo.
5. *[Add team-specific next milestones]*

---

*End of Sections A & B. Continue with Section C (screenshots) using `02-screenshot-capture-list.md` and architecture figure from `04-architecture-diagram.md`.*
