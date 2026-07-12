# APEX — Milestone Status Update

## Advanced Performance Evaluation eXchange

**Course:** CIS Capstone  
**Document type:** Software Standards, Progress Report (PDF Sections A & B)  
**Team:** _[Insert team member names]_  
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

| Directory              | Purpose                                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| `app/`                 | Pages, layouts, and API route handlers                                    |
| `components/`          | Reusable UI (form blocks, reviewer panel, signature pad)                  |
| `lib/`                 | Business logic (validation, permissions, routing, PDF, Supabase services) |
| `types/`               | Shared TypeScript models and Zod schemas                                  |
| `supabase/migrations/` | Versioned database schema                                                 |
| `tests/`               | Unit, integration, and E2E tests                                          |
| `docs/`                | Rule mappings and milestone documentation                                 |

**Coding conventions.** Each major source file begins with a header comment describing its purpose. Business rules live in `lib/` rather than in React components so they can be unit-tested independently. NAVPERS field validation is centralized in `types/navpers.ts` (Zod) and `lib/validationEngine.ts`. Navy guideline text is stored in `lib/bupersGuidelines.json` and surfaced inline in the form via `GuidelinesVisibilityContext`.

**Static analysis.** We run ESLint (`npm run lint`) to enforce code quality, flag dead code, and maintain clean syntax. Rule-to-code traceability is documented in `docs/rules-reference.md`, which maps each BUPERS block rule to its enforcement location.

**Why this helps.** Separating validation, permissions, and UI makes the system easier to extend when EVALMAN policies change. A developer can update a Zod rule or permission map without rewriting entire React components.

---

## A2. Security Practices

**Authentication.** User identity is managed by Supabase Auth (email and password). Sessions are handled through the Supabase SSR client; protected pages redirect unauthenticated users to `/login`.

**Authorization (RBAC).** Role-based access control is defined in `lib/permissions.ts`. Roles include Sailor, Rater, Senior Rater, Reporting Senior, and Admin. Each role maps to allowed actions (create/edit eval, route, sign specific blocks, manage summary groups, view audit logs, etc.). UI components call `hasPermission()` before rendering sensitive controls; server routes re-check permissions before writes.

**Database security (RLS).** All Postgres tables use Row Level Security. Evaluations are visible to their creator, current custodian, routing participants, and oversight roles (Reporting Senior, Admin). Updates are restricted so users cannot hand custody to another person directly from the browser—custody transitions go through validated API routes.

**Server-side enforcement.** Sensitive operations bypass client-only RLS using a service-role Supabase client on the server, but only after authorization checks:

| API Route                   | Purpose                                                    |
| --------------------------- | ---------------------------------------------------------- |
| `/api/eval-route`           | Route forward, recycle, begin debrief                      |
| `/api/eval-lock`            | Lock/unlock signature state                                |
| `/api/eval-correct`         | Debrief minor corrections (allowlisted fields)             |
| `/api/eval-finalize`        | Finalize locked eval for export                            |
| `/api/sign`                 | Apply digital signatures to blocks                         |
| `/api/summary-group-attach` | Attach eval to summary group (BUPERS eligibility enforced) |
| `/api/summary-average`      | Block 50a group average (visibility-gated)                 |
| `/api/summary-distribution` | Block 46 forced distribution (visibility-gated)            |
| `/api/pdf`                  | Generate NAVPERS PDF                                       |

**Input validation.** All evaluation payloads are validated with Zod schemas before save. API routes validate required fields, routing stage, and custody before applying updates. Summary group attachment validates paygrade, promotion status, ending date, report type, UIC, and reporting senior per BUPERSINST 1610.10H.

**Password and secrets handling.** Passwords are hashed by Supabase Auth; plaintext passwords are never stored in application code. Environment variables (`NEXT_PUBLIC_SUPABASE_URL`, anon key, service role key) live in `.env.local`, which is gitignored. `.env.example` documents required variables without secrets. The service role key is used only in server-side API routes and seed scripts.

**PII policy.** APEX uses synthetic 10-digit DoD IDs for development and testing. Social Security Numbers are not collected or stored. Block 27 stores DoD ID in lieu of SSN per APEX PII policy.

**Why this helps.** Defense in depth—RLS plus server routes plus Zod—reduces the risk that a manipulated browser request could route an eval incorrectly, attach to the wrong summary group, or sign on behalf of another role.

---

## A3. Database Design Standards

**Platform.** Supabase (managed Postgres) with SQL migrations in `supabase/migrations/`.

**Core tables.**

| Table              | Role                                                    |
| ------------------ | ------------------------------------------------------- |
| `profiles`         | User identity, Navy rank, UIC, preferred role           |
| `evaluations`      | NAVPERS eval payload, custody, routing stage            |
| `summary_groups`   | Promotion-recommendation groups (shared BUPERS fields)  |
| `audit_logs`       | Immutable workflow event history                        |
| `review_approvals` | Recycle/return comments and approval status             |
| `form_definitions` | Form metadata                                           |
| `commands`         | UIC lookup (optional; denormalized on profiles for MVP) |

**Design principles.**

- **Normalization:** Eval data stored in `evaluations`; user data in `profiles`; group metadata in `summary_groups`.
- **Constraints:** CHECK constraints on UIC length, routing stages, trait grade enums, and report types.
- **Referential integrity:** Foreign keys from evaluations to profiles and summary groups.
- **Uniqueness:** Summary groups are unique per reporting senior + ending date + paygrade + promotion status + report type.
- **Triggers:** `enforce_summary_group_fields()` copies shared group fields onto member evals when a summary group is attached.
- **Indexing:** Indexes on `summary_group_id` and `current_holder_id` for dashboard and routing queries.

**Migration workflow.** Schema changes are applied via numbered migration files (001 initial schema, 002 routing workflow and summary groups). Migrations are applied to the cloud Supabase project with the Supabase CLI.

### Normalization analysis

We evaluated each table against First, Second, and Third Normal Form (1NF/2NF/3NF) and Boyce-Codd Normal Form (BCNF). The **relational core is in 3NF, and most tables reach BCNF.** Where we deviate, the deviation is deliberate, documented in the migration, and justified by Postgres capabilities or a BUPERS domain rule.

| Table              | Primary key | Highest strict NF  | Notes                                             |
| ------------------ | ----------- | ------------------ | ------------------------------------------------- |
| `commands`         | `uic`       | BCNF               | Clean UIC → command-name lookup                   |
| `review_approvals` | `id`        | BCNF               | Atomic columns; FKs to eval + reviewer            |
| `summary_groups`   | `id`        | BCNF               | Atomic; real composite candidate key via `UNIQUE` |
| `profiles`         | `id`        | 1NF/3NF deviations | `assigned_roles` array; denormalized `command`    |
| `evaluations`      | `id`        | 1NF/3NF deviations | JSONB + array columns; derived + inherited fields |
| `form_definitions` | `id`        | 1NF deviation      | `blocks` JSONB holds the declarative form spec    |
| `audit_logs`       | `id`        | 1NF deviation      | `details` JSONB event payload                     |

**1NF — intentional non-atomic columns.** Strict 1NF requires every attribute to be single-valued. We intentionally use Postgres array and JSONB columns where a rigid relational layout would add complexity without value:

- `form_definitions.blocks` (JSONB) stores the full declarative block spec. Each NAVPERS form (EVAL, CHIEFEVAL, two FITREP variants) has a different block set; modeling this relationally would require a sprawling entity-attribute-value schema. JSONB lets the validation engine read one versioned document.
- `evaluations.trait_grades` and `block_values` (JSONB) hold the flexible, form-driven answer set; `career_recommendations` and `participants` are short bounded lists; `profiles.assigned_roles` is a small role set. `audit_logs.details` stores per-event context.

These are a conscious 1NF trade-off in favor of schema flexibility and fewer joins, which Postgres supports natively (including GIN indexing and constraints on JSONB/arrays).

**2NF — fully satisfied.** Every table uses a single-column key (a surrogate `uuid id`, or the natural `commands.uic`). With no composite primary keys, partial-key dependencies cannot exist, so all tables that satisfy 1NF automatically satisfy 2NF.

**3NF — three documented denormalizations.** The following transitive dependencies are stored on purpose:

1. **`profiles.command`** — a display name that depends on `uic` (via `commands`). Kept denormalized for fast reads without a join during the MVP, as noted in the column comment.
2. **`evaluations.trait_average`** — a value derived from `trait_grades`, stored for convenient sorting/printing rather than recomputed on every read.
3. **Summary-group shared fields** — when an eval is attached to a summary group, the `enforce_summary_group_fields()` trigger copies `period_to`, `grade_rate`, `promotion_status`, `report_type`, and `command_employment` onto the eval. This is not mere caching: BUPERSINST 1610.10H requires these five fields to be **frozen and identical** across a summary group, so the copy-on-write trigger enforces a domain invariant at the database layer.

**Path to strict 3NF (future work).** If full textbook normalization is required, we would: drop `profiles.command` and resolve names through `commands` (restoring the UIC foreign key); compute `trait_average` in a view; and split the array columns into child tables (`profile_roles`, `evaluation_participants`, `evaluation_career_recommendations`). We have deferred this because the current design measurably reduces join complexity and the denormalizations are guarded by constraints and triggers.

**Why this helps.** A clear schema with RLS and triggers keeps BUPERS “shared field” rules enforced at the database layer, not only in the UI. Documenting where and why we deviate from strict normal form shows the trade-offs were deliberate engineering decisions, not oversights.

---

## A4. Error Handling and Logging Policies

**Client-side errors.** Form validation errors appear inline next to fields and in the Validation Results modal. API failures display user-readable messages parsed from `{ error: string }` JSON responses. Network failures during save or route operations show in the Review Workflow panel without silent failure.

**Server-side errors.** API routes use consistent HTTP status codes:

| Code | Meaning                                                             |
| ---- | ------------------------------------------------------------------- |
| 400  | Invalid input or BUPERS eligibility failure                         |
| 401  | Not authenticated                                                   |
| 403  | Authenticated but not authorized (wrong role or not current holder) |
| 404  | Eval or user not found                                              |
| 409  | Conflict (locked eval, invalid routing stage)                       |
| 500  | Unexpected server error                                             |

Unexpected exceptions are logged to the server console with `console.error`; internal stack traces are not returned to the client.

**Audit logging.** Significant workflow events are written to `audit_logs`: route forward, recycle, debrief start, signature applied, summary group attached, finalize. Each entry records `evaluation_id`, `user_id`, `action`, and JSON `details`. Audit logs support accountability and debugging without exposing PII in application logs.

**Why this helps.** Structured errors and audit trails make it possible to diagnose routing disputes and demonstrate compliance during capstone review or future operational use.

---

## A5. Testing Plan and Quality Assurance Practices

**Testing pyramid.**

| Layer       | Tool                           | Current status                                 |
| ----------- | ------------------------------ | ---------------------------------------------- |
| Unit        | Vitest                         | 158 tests across 19 files                      |
| Integration | Vitest + React Testing Library | Form, login, validation, workflow panels       |
| End-to-end  | Playwright                     | Full routing chain, recycle, dashboard custody |

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
- Feature work on branches; merge to main after tests pass _(adjust if your team uses a different flow)_

**Collaboration.** _[Insert your team’s practice: pair programming, PR review, division of components/lib/tests, etc.]_

**Why this helps.** Version history documents project evolution for capstone grading and future maintenance.

---

## A8. AI Usage Policy

**Permitted uses.**

- Researching BUPERSINST 1610.10H requirements and mapping them to validation rules
- Generating boilerplate tests, TypeScript types, and documentation drafts
- Debugging assistance for Supabase RLS, Playwright, and Next.js API routes
- Code review suggestions (ESLint, Cursor Agent)

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

# Section B — Project Progress Report (Through Week 5)

This progress report reflects the cumulative state of APEX through the Week 5 milestone. Per the eight-week plan, Weeks 1–5 deliver the project foundation, the EVAL data-entry pipeline, and the BUPERS validation engine — the core value of the system. PDF export, the pre-signature review workflow, and deployment are scheduled for Weeks 6–8 and appear under Planned Next Steps.

## B1. Features and Functionality Completed (Weeks 1–5)

The following are implemented and tested as of Week 5:

1. **Project foundation (Week 2)** — Next.js 14 (App Router), TypeScript strict mode, Tailwind, and the Vitest test harness. Landing page and session-aware route-protection middleware are in place.
2. **Database schema and Row Level Security (Week 3)** — Supabase Postgres with `profiles`, `evaluations`, `form_definitions`, `audit_logs`, and `review_approvals` tables, a seeded EVAL (NAVPERS 1616/26) form definition, and RLS policies scoping data to the owning user.
3. **Authentication and role model (Week 3)** — Registration and login with Navy profile fields (rank, UIC, command, preferred role). The five roles (Sailor, Rater, Senior Rater, Reporting Senior, Admin) are defined; sessions are handled through the Supabase SSR client.
4. **Profile and dashboard (Week 3)** — Profile view/edit and a dashboard that lists the signed-in user's evaluations.
5. **EVAL form data entry (Week 4)** — Multi-step NAVPERS 1616/26 form mapped to the correct block numbers: administrative blocks, Block 1 (Name), Blocks 33–39 (seven performance traits with X-marking and NOB handling), and Block 43 (Comments).
6. **Draft persistence (Week 4)** — Local autosave plus an explicit “Save Evaluation Draft” to Supabase (`saveDraft`, `loadById`).
7. **Live in-form validation with inline BUPERS guidance (Week 4)** — Real-time Zod validation and context-aware EVALMAN guideline text shown next to each field.
8. **Comment-fit / overflow validation (Week 4)** — The proposal's highest-value feature: Block 43 narrative is measured against the physical comment box at 10- and 12-pitch using a shared Courier wrap algorithm, preventing the most common PERS-32 rejection.
9. **Trait scoring and computed average (Weeks 4–5)** — Trait standards panel for Blocks 33–39 and the Block 40 individual trait average (NOB excluded), computed in-app.
10. **Validation engine and final pre-export pass (Week 5)** — `runFullValidation` applies the EVALMAN-cited rule set (required-field formatting, valid trait grades, promotion-recommendation enum, and the Climate-EO / Military Bearing 2.0 promotion gate) and surfaces results in the Validation Results modal. Evaluation status transitions (draft → ready_for_review) are wired.
11. **Rules-reference documentation (Week 5)** — `docs/rules-reference.md` maps each validation rule to its BUPERSINST 1610.10H citation and its enforcement location in code.
12. **Automated testing** — Over 70 unit and integration tests cover the Week 1–5 scope, including 35 validation-engine cases, 5 comment-fit cases, trait-average and trait-standard tests, and auth/login/form integration tests.

## B2. Features Currently Under Development

- Finalizing the Week 5 validation rule coverage and error messaging
- Preparing the Week 6 PDF render against the measured 1616/26 layout
- Documentation and demo preparation for the Week 5 milestone

## B3. Challenges Encountered

| Challenge                            | Impact                                          | Resolution                                                                                                |
| ------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| BUPERS rule complexity               | Many interdependent block rules                 | Central Zod schema + validation engine + rules-reference doc                                              |
| Comment-box dimensions not published | Comment-fit accuracy at risk                    | Measured the rendered official 1616/26 box; shared wrap algorithm cited to NAVFIT98A 10/12-pitch capacity |
| Promotion-recommendation gating      | 2.0 EO/Character must bar "Promotable+"         | Encoded as an explicit, cited rule in the validation engine                                               |
| RLS vs. legitimate reads             | Early policies blocked valid profile/eval reads | Tuned per-table RLS policies scoped to the owning user                                                    |
| Trait average with NOB               | "Not Observed" traits must be excluded          | Average computed over graded traits only, with unit tests                                                 |

## B4. Changes to the Original Project Plan

- **All 1616/26 blocks implemented:** The plan allowed deferring some Blocks 9–32; the full administrative block set is now entered, with values beyond the core set carried in `block_values` (jsonb).
- **Inline guideline system added:** A context-aware BUPERS guideline panel was added alongside live validation to improve drafting accuracy — beyond the originally planned error list.
- **Data-model corrections:** Minor schema fixes from the proposal draft (column naming, computed trait average) were applied in migration 001.

## B5. Blockers and Assistance Needed

| Item                                   | Status        | Notes                                                                          |
| -------------------------------------- | ------------- | ------------------------------------------------------------------------------ |
| Official 1616/26 dimensions            | Resolved      | Box and trait grid measured from the rendered form (gating dependency cleared) |
| Hosting/deployment target              | Open          | Local dev + Supabase cloud today; Vercel planned for Week 8                    |
| Instructor feedback on deferred blocks | If applicable | Confirm which Blocks 9–32 edge cases must be enforced vs. documented           |

## B6. Planned Next Steps (Weeks 6–8)

1. **Week 6 — PDF pipeline:** High-fidelity NAVPERS 1616/26 PDF generation, live document preview, and an export page gated on a passing full validation.
2. **Week 7 — Pre-signature review workflow:** Internal approve / return-for-correction flow and surfacing of the audit log / review history.
3. **Week 8 — Finalization:** Deploy to Vercel, finalize `README.md`, expand automated coverage toward ≥80%, and complete UI/UX polish and responsiveness.
4. **Designed-for roadmap (post-MVP):** CHIEFEVAL and FITREP form definitions, summary-group computation (Blocks 46 / 50a), and digital signature capture remain documented roadmap extensions enabled by the `form_definitions` architecture.

---

_End of Sections A & B. Continue with Section C (screenshots) using `02-screenshot-capture-list.md` and architecture figure from `04-architecture-diagram.md`._
