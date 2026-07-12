# Course Project Milestone 5 — Progress Reflection

## Section A — Executive Summary

APEX (Advanced Performance Evaluation eXchange) is a web-based system that digitizes the Navy's NAVPERS 1616/26 enlisted evaluation workflow. Since the Week 5 milestone the project has delivered four major capability increments — high-fidelity PDF overlay rendering, a multi-hop custodian routing and review workflow, canvas-based signature capture with credential verification, and a Role-Based Access Control (RBAC) permission engine with an Admin panel — bringing APEX from a validated data-entry tool to a near-complete evaluation lifecycle platform. The codebase has grown from roughly 12,400 lines across 46 files at the initial commit to over 29,500 lines across 142 changed files, backed by 161 automated test cases (158 Vitest unit/integration tests plus three Playwright end-to-end specs). The project remains on schedule for the final capstone submission.

## Section B — Project Progress Report

### B1. Features and Functionality Completed

The following capabilities have been implemented and tested since the Week 5 submission. Each entry references the specific source modules so that progress can be verified in the repository.

1. **High-Fidelity PDF Overlay Rendering (Week 6).** Rather than filling AcroForm fields, APEX loads the official NAVPERS 1616/26 Rev. 05-2025 blank as a background and draws all evaluation data on top using measured PDF-coordinate positions (`lib/pdfOverlay.ts`, 397 lines). Every block — identity rows, duty-status checkboxes, trait-grade X-marks, narrative fields (Blocks 28, 29, 43, 44), promotion recommendation, and the reporting-senior address — is rendered in Courier at the correct pitch so that the printed output matches the on-screen preview character-for-character. The system embeds CourierPrime via `@pdf-lib/fontkit` and applies per-page rigid-shift translations to compensate for the centered 05-2025 template layout. A Next.js API route (`app/api/pdf/route.ts`) streams the rendered PDF to the browser, and the `PDFPreview` component provides a real-time embedded preview.

2. **Multi-Hop Custodian Routing and Review Workflow (Week 7).** The evaluation now flows through a five-stage chain of command: Sailor → Rater → Senior Rater → Reporting Senior → Admin. The `ReviewPanel` component (`components/Reviewer/ReviewPanel.tsx`, 264 lines) renders stage-aware actions — route forward, recycle for correction (with mandatory comments), begin debrief, and minor-correction editing. Custody transitions are enforced server-side through service-role API routes (`app/api/eval-route`, `app/api/eval-correct`, `app/api/eval-lock`), so the browser client can never bypass chain-of-command ordering. A Supabase migration (`002_routing_workflow.sql`, 132 lines) added `current_holder_id`, `previous_holder_id`, `routing_stage`, `participants[]`, and `signature_locked` columns to the `evaluations` table, with custody-scoped RLS policies replacing the earlier creator-only policies. A feedback timeline in the ReviewPanel visualizes the full recycle and approval history for audit transparency.

3. **Canvas-Based Signature Capture and Credential-Verified Sign-Off (Week 8).** The `SignaturePad` component (`components/SignaturePad.tsx`, 276 lines) provides an HTML5 Canvas drawing surface with high-DPI support, mouse and touch input, typed-name entry, and a legal consent checkbox. Before any signature is persisted, the signer must re-authenticate through the `/api/sign` route, which calls `lib/signing.ts` to verify credentials against Supabase Auth using a dedicated verifier client. On success, the signature image (base64 PNG), typed name, and date are stored in `block_values`, and an `SIGNATURE_APPLIED` audit-log entry is written. The Reporting Senior's Block 50 signature automatically sets `signature_locked = true` and transitions the routing stage to `locked`, preventing further edits — the same behavior as the official form's sign-and-seal workflow.

4. **RBAC Permission Engine and Admin Panel (Week 9).** A centralized permission engine (`lib/permissions.ts`, 275 lines) defines 20 discrete actions (e.g., `create_evaluation`, `sign_block_42`, `manage_summary_groups`, `debrief_evaluation`) mapped to five roles: Sailor, Rater, Senior Rater, Reporting Senior, and Admin. Each action is checked at both the static-role level (`hasPermission`) and the contextual-evaluation level (`canPerformAction`), which adds ownership, assignment, and custody guards. Specialized functions (`canSignBlock`, `canManageSummaryGroups`, `canViewSummaryAverage`) enforce signature-block access and summary-group visibility per BUPERSINST 1610.10H. The `RoleGuard` component wraps protected UI sections, and the Admin panel (`app/admin/page.tsx`, 210 lines) exposes a searchable user-management table where an administrator can reassign roles across the chain of command.

5. **Summary Groups and Forced Distribution (Weeks 5–6).** Promotion-recommendation summary groups are now fully operational. The `summaryGroupService.ts` (143 lines) handles CRUD, and `summaryGroupEligibility.ts` (69 lines) enforces the BUPERS membership rules — same paygrade, promotion status, ending date, reporting senior, and report type. `forcedDistribution.ts` (102 lines) implements the EVALMAN Table 1-2 caps: Early Promote ≤ ceil(20% × N) for all enlisted, and an additional EP + Must Promote ≤ ceil(60% × N) combined cap for E-5/E-6 grades. The `getSummaryGroupAverage` function pools trait grades across all group members (NOB-excluded) to compute the Block 50a figure, and a Supabase trigger (`enforce_summary_group_fields()`) automatically inherits the five BUPERSINST-fixed shared fields when an evaluation joins a group.

6. **Audit Trail Service.** Every meaningful lifecycle event — draft creation, status changes, review submissions, recycled corrections, and applied signatures — is recorded in the `audit_logs` table via `lib/auditService.ts` (75 lines). Logs are enriched with the acting user's profile and surfaced in the `AuditTab` component on the report detail screen.

7. **Expanded Validation Engine.** The engine (`lib/validationEngine.ts`) grew from 178 to 329 lines to cover cross-field rules that Zod schemas alone cannot express: multi-select occasion/type-of-report validation (Blocks 10–13, 16–18), fixed-width narrative overflow for Blocks 28, 29B, 44, and 48 (using the same `wrapTextToWidth` algorithm as the canvas preview and the PDF renderer), starred billet subcategory ↔ Block 29 consistency, and the Block 43 substantiation requirement for 1.0 marks, three-or-more 2.0 marks, and 2.0 in EO.

### B2. Features Currently Under Development

- **Cloud Deployment.** Configuring environment variables and build scripts for a Vercel production deployment. The local development stack (Next.js dev server + Supabase cloud) is stable; the remaining work is the Vercel project setup and CI integration.
- **Playwright E2E Coverage.** Three end-to-end specs are scaffolded (`tests/e2e/`): a full evaluation workflow, a recycle-and-return flow, and a dashboard-routing test. These require a seeded E2E database (`scripts/seed-e2e.ts`, 181 lines) and are being stabilized against the live Supabase instance.
- **Demonstration Materials.** Preparing the script and recording environment for the 6–8 minute capstone demonstration video.

### B3. Challenges Encountered

| Challenge                             | Impact                                                                                                                         | Resolution                                                                                                                                                                                                                                                                                          |
| :------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **PDF coordinate calibration**        | The official 05-2025 blank shifts all form graphics right and down vs. the prior version, misaligning every overlay field.     | Measured per-page rigid-shift offsets (+13/−11 on page 1, +12/−14 on page 2) and applied them via `pushGraphicsState()` / `translate()` in pdf-lib, wrapping the entire overlay layer so no individual coordinate needed re-editing.                                                                |
| **Signature credential verification** | Allowing a user to sign using only their session token would not provide the non-repudiation the Navy requires.                | Created a dedicated Supabase verifier client (`createCredentialVerifierClient`) so the `/api/sign` route re-authenticates the signer with email + password before persisting any signature, then writes an audit log.                                                                               |
| **RLS vs. custody routing**           | The original creator-only RLS policies blocked legitimate reads by reviewers further up the chain.                             | Rewrote evaluation RLS in migration 002 to use a `participants[]` array (everyone who has held the eval) plus an `has_oversight()` helper function, and restricted browser-side UPDATE to the current holder of an unlocked eval. All custody transitions are delegated to service-role API routes. |
| **Forced distribution edge cases**    | E-5/E-6 grades have a combined EP + MP cap that E-1–E-4 grades do not, and `paygradeOf()` must normalize free-text rate codes. | Built a standalone `paygrade.ts` (62 lines) normalizer with 69 unit tests, and separated the combined-cap branch with an `isE5E6` flag so the rule only fires when applicable.                                                                                                                      |
| **Test suite isolation**              | Running all 158 tests simultaneously caused Supabase client initialization errors and vitest worker timeouts.                  | Scoped the default vitest include to milestone-specific test suites via `vitest.config.ts`, and added a shared `tests/setup.ts` that stubs the Supabase client before any test file loads.                                                                                                          |

### B4. Changes to the Original Project Plan

The original plan deferred signature capture and RBAC to optional "post-MVP" extensions. Both have now been fully implemented ahead of the final milestone, strengthening the application's alignment with the real-world NAVPERS workflow. The summary-group and forced-distribution features were added to the Week 5–6 scope when it became clear that the PDF renderer needed Block 46/50a data to produce a complete form. No features from the original plan have been dropped.

### B5. Blockers and Assistance Needed

| Item                      | Status      | Notes                                                                                                                              |
| :------------------------ | :---------- | :--------------------------------------------------------------------------------------------------------------------------------- |
| Final Deployment (Vercel) | In Progress | Build succeeds locally; configuring Vercel environment variables and edge-function compatibility. No instructor assistance needed. |
| Playwright E2E on CI      | Open        | E2E tests run locally against a seeded Supabase project; wiring them into a CI pipeline (GitHub Actions) is planned for Week 8.    |

### B6. Planned Next Steps (Week 8 — Finalization)

1. **Feature Freeze and Final Regression.** Lock the feature set and execute a full regression pass across all 158 test cases plus the three Playwright E2E specs.
2. **Vercel Production Deployment.** Complete the cloud deployment so the application is accessible at a public URL for the final demonstration.
3. **README and Developer Documentation.** Finalize the project README with setup instructions, architecture overview, and the `docs/rules-reference.md` mapping every validation rule to its BUPERSINST 1610.10H citation.
4. **Capstone Demonstration Video.** Record the 6–8 minute walkthrough covering authentication, evaluation creation, validation, PDF preview, the routing/review workflow, signature capture, and the admin panel.
5. **Final Deliverables.** Submit the progress reflection PDF, the demonstration video, and the deployed application URL.

## Section C — User Interface Design

### C1. Main screens of the application (new since Week 5)

The updated interface now provides clear visual feedback at every stage of the evaluation lifecycle.

**Figure 1** shows the Review Workflow panel. The stage indicator, action buttons, and historical timeline together give users immediate situational awareness while enforcing custody rules—an intentional design that reduces training time and errors.
_(Insert Figure 1 screenshot here: Review Workflow panel showing stage indicator, action buttons, and historical timeline)_

**Figure 2** illustrates the SignaturePad component in use, with its canvas, typed-name field, consent checkbox, and re-authentication prompt. This screen was deliberately kept simple yet legally explicit to match the weight of the official signing process.
_(Insert Figure 2 screenshot here: SignaturePad component showing canvas, typed-name field, consent checkbox, and re-authentication modal)_

**Figure 3** presents the embedded PDF preview. Evaluation data appears overlaid on the exact NAVPERS 1616/26 (Rev. 05-2025) layout, allowing instant visual validation before export.
_(Insert Figure 3 screenshot here: Embedded PDF preview showing evaluation data overlaid on official NAVPERS 1616/26 form)_

**Figure 4** displays the Admin user-management table with searchable rows and role-assignment controls, giving administrators efficient oversight of the entire chain of command.
_(Insert Figure 4 screenshot here: Admin user-management table showing searchable rows and role-assignment controls)_

**Figure 5** captures the Summary Groups interface, where reporting seniors can create groups, apply eligibility filters, and view forced-distribution compliance indicators drawn directly from official tables.
_(Insert Figure 5 screenshot here: Summary Groups interface showing group creation, eligibility filters, and Table 1-2 forced-distribution indicators)_
