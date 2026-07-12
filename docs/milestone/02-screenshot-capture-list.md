# APEX Milestone — Screenshot Capture List (Through Week 5)

Use this checklist to capture **Section C** figures for the PDF. This list is scoped to the **Week 5 milestone**: authentication, the EVAL data-entry wizard, live BUPERS guidance, comment-fit, and the validation engine. PDF export, the review/signature workflow, summary groups, and the admin panel are Week 6–8 features and are intentionally **not** captured here.

Target **8 screenshots** at **1440×900** or **1280×800** browser width. Hide browser devtools, bookmarks bar, and personal bookmarks for a clean capture.

---

## Prerequisites

```bash
cd "/home/dainja/Desktop/CIS CAPSTONE"
npm run dev                    # http://localhost:3000
npm run db:seed                # refresh test users if needed
```

**Base URL:** `http://localhost:3000`

---

## Test Credentials (from `tests/fixtures/e2e-ids.json`)

| Role             | Email                          | Password       | User ID                                |
| ---------------- | ------------------------------ | -------------- | -------------------------------------- |
| Sailor (PO2 Doe) | `sailor@franklyn.dev`          | `E2eTest!2026` | `6596c08d-9639-4a35-acbb-371aa75aa86b` |
| Rater            | `rater@franklyn.dev`           | `E2eTest!2026` | `b8a5673d-26bb-449e-92da-8fe458fb459c` |
| Senior Rater     | `seniorrater@franklyn.dev`     | `E2eTest!2026` | `7d50e8a8-efa0-48fe-8bd6-84af3764c29a` |
| Reporting Senior | `reportingsenior@franklyn.dev` | `E2eTest!2026` | `05a3b63b-246f-4c8b-801e-943242cd61f7` |
| Admin            | `admin@franklyn.dev`           | `E2eTest!2026` | `1569739f-4b84-4232-b17f-73f28141570d` |

> **Week 5 note:** Only the **Sailor** account is needed for this capture set. The other seeded roles exist for later milestones (review workflow, admin).

**Seeded evaluation ID (Week 5 capture):**

| Eval           | ID                                     | Purpose                                                     |
| -------------- | -------------------------------------- | ----------------------------------------------------------- |
| Draft (Sailor) | `4d1228a5-f72f-473f-bf39-e8b79b5d52e5` | DOE, JOHN A — editable draft for form / validation captures |

**Direct URLs (draft eval):**

- View: `http://localhost:3000/evaluations/4d1228a5-f72f-473f-bf39-e8b79b5d52e5`
- Edit: `http://localhost:3000/evaluations/4d1228a5-f72f-473f-bf39-e8b79b5d52e5/edit`
- New draft: `http://localhost:3000/evaluations/new`

---

## Capture Checklist

### Figure 1 — Landing Page

- [x] **URL:** `http://localhost:3000/`
- [x] **Login:** None (logged out)
- [x] **Show:** APEX hero, “Advanced Performance Evaluation eXchange,” feature cards, Sign In / Get Started
- [x] **Caption:** _Figure 1. APEX landing page introducing the NAVPERS 1616/26 evaluation platform and primary entry actions._

---

### Figure 2 — Login

- [x] **URL:** `http://localhost:3000/login`
- [x] **Login:** None
- [x] **Optional:** Pre-fill email `sailor@franklyn.dev` (do not show password in screenshot)
- [x] **Caption:** _Figure 2. Login screen using Supabase Auth for secure session management._

---

### Figure 3 — Dashboard (Sailor)

- [x] **URL:** `http://localhost:3000/dashboard`
- [x] **Login:** `sailor@franklyn.dev` / `E2eTest!2026`
- [x] **Show:** Header with PO2 DOE, role badge, eval list including “DOE, JOHN A,” custody/routing indicators
- [x] **Caption:** _Figure 3. Role-aware dashboard listing evaluations visible to the logged-in user based on custody and participation._

---

### Figure 3 — Register (Role Onboarding)

- [x] **URL:** `http://localhost:3000/register`
- [x] **Login:** None
- [x] **Show:** Navy profile fields (rank, UIC, command) and the preferred-role selector listing the five roles (Sailor, Rater, Senior Rater, Reporting Senior, Admin)
- [x] **Caption:** _Figure 3. Registration capturing Navy profile fields and the role model that scopes access throughout APEX._

---

### Figure 4 — Dashboard (Sailor)

- [x] **URL:** `http://localhost:3000/dashboard`
- [x] **Login:** `sailor@franklyn.dev` / `E2eTest!2026`
- [x] **Show:** Header with PO2 DOE and role badge, stat tiles, and the evaluation list including “DOE, JOHN A”
- [x] **Caption:** _Figure 4. Role-aware dashboard listing the signed-in user's evaluations._

---

### Figure 5 — Evaluation Wizard — Admin Step

- [x] **URL:** `http://localhost:3000/evaluations/4d1228a5-f72f-473f-bf39-e8b79b5d52e5/edit`  
      OR `http://localhost:3000/evaluations/new`
- [x] **Login:** `sailor@franklyn.dev`
- [x] **Show:** Step indicator (Admin), administrative blocks (Name, Grade/Rate, UIC, period, etc.), inline BUPERS field guidance visible
- [x] **Caption:** _Figure 5. Multi-step evaluation wizard — Admin step mapped to NAVPERS 1616/26 block numbers with inline BUPERS field guidance._

---

### Figure 6 — Evaluation Wizard — Traits Step (Blocks 33–40)

- [x] **URL:** Same edit page, navigate to the **Traits** step
- [x] **Login:** `sailor@franklyn.dev`
- [x] **Show:** Blocks 33–39 trait grades (X-marking / NOB) and the live Block 40 individual trait average
- [x] **Caption:** _Figure 6. Trait grading step with live Block 40 individual trait average (NOB excluded) per EVALMAN._

---

### Figure 7 — Comment-Fit Validation (Block 43)

- [x] **URL:** Same edit page, navigate to the **Comments** step
- [x] **Login:** `sailor@franklyn.dev`
- [x] **Action:** Type narrative into Block 43; toggle 10/12-pitch to show the live line/character fit indicator (optionally overflow it to show the warning)
- [x] **Show:** Block 43 comment box, pitch toggle, and the fit/overflow feedback
- [x] **Caption:** _Figure 7. Block 43 comment-fit validation at 10/12-pitch — APEX's highest-value check, preventing the most common PERS-32 rejection._

---

### Figure 8 — Validation Results Modal

- [x] **URL:** Edit page, any step
- [x] **Login:** `sailor@franklyn.dev`
- [x] **Action:** Trigger the full validation pass (or temporarily clear a required field) to open the modal with errors/warnings
- [x] **Show:** Block-level errors and warnings with BUPERSINST citations
- [x] **Caption:** _Figure 8. On-demand BUPERS validation engine results listing block-level errors and warnings before save._

---

### Figure 9 — Profile (Optional)

- [x] **URL:** `http://localhost:3000/profile`
- [x] **Login:** `sailor@franklyn.dev`
- [x] **Show:** Editable profile fields (rank, UIC, command, role)
- [x] **Caption:** _Figure 9. Member profile management._

---

## Reserved for Later Milestones (do NOT capture for Week 5)

These features exist in the codebase but are being held for Weeks 6–8 presentations, so exclude them from the Week 5 figure set:

- PDF export / preview (`/evaluations/:id/export`, `/pdf-preview`) — Week 6
- Review Workflow tab, route-forward, recycle-for-correction — Week 7
- Digital signature pad — later reveal
- Summary Groups (`/summary-groups`), Block 46 / 50a distribution — post-MVP reveal
- Admin panel (`/admin`) — later reveal

---

## Post-Capture Tips

1. **Naming:** Save as `fig01-landing.png`, `fig02-login.png`, etc.
2. **PDF layout:** One figure per page or two per page with caption below each.
3. **Consistency:** Same browser zoom (100%), same theme (dark navy).
4. **Redaction:** Ensure no real passwords appear in screenshots (mask if pre-filled).
5. **Seeded data:** Re-run `npm run db:seed` if the eval ID changes; update URLs from a fresh `tests/fixtures/e2e-ids.json`.

---

## Quick Capture Workflow (Week 5)

The entire Week 5 set is captured as **logged out** then **Sailor** — no role switching needed.

1. **Logged out:** Figures 1 (landing), 2 (login), 3 (register).
2. **Sign in as `sailor@franklyn.dev`.**
3. **Sailor:** Figure 4 (dashboard) → 5 (admin step) → 6 (traits) → 7 (comment-fit) → 8 (validation modal) → 9 (profile, optional).
4. Capture each (Windows: Win+Shift+S / Mac: Cmd+Shift+4).

**Minimum for the milestone:** Figures 1–8 (8 screenshots).
