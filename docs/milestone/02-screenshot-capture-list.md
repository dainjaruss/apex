# APEX Milestone — Screenshot Capture List

Use this checklist to capture **Section C** figures for the PDF. Target **8–10 screenshots** at **1440×900** or **1280×800** browser width. Hide browser devtools, bookmarks bar, and personal bookmarks for a clean capture.

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

| Role | Email | Password | User ID |
|------|-------|----------|---------|
| Sailor (PO2 Doe) | `sailor@franklyn.dev` | `E2eTest!2026` | `6596c08d-9639-4a35-acbb-371aa75aa86b` |
| Rater | `rater@franklyn.dev` | `E2eTest!2026` | `b8a5673d-26bb-449e-92da-8fe458fb459c` |
| Senior Rater | `seniorrater@franklyn.dev` | `E2eTest!2026` | `7d50e8a8-efa0-48fe-8bd6-84af3764c29a` |
| Reporting Senior | `reportingsenior@franklyn.dev` | `E2eTest!2026` | `05a3b63b-246f-4c8b-801e-943242cd61f7` |
| Admin | `admin@franklyn.dev` | `E2eTest!2026` | `1569739f-4b84-4232-b17f-73f28141570d` |

**Seeded evaluation IDs:**

| Eval | ID | Purpose |
|------|-----|---------|
| Routing (Sailor custody) | `4d1228a5-f72f-473f-bf39-e8b79b5d52e5` | DOE, JOHN A — at sailor stage |
| Recycle demo | `cd663594-d6b0-43bf-91c1-eb7e26d85b51` | DOE, JOHN A (RECYCLE) — at rater stage |

**Direct URLs (routing eval):**

- View: `http://localhost:3000/evaluations/4d1228a5-f72f-473f-bf39-e8b79b5d52e5`
- Edit: `http://localhost:3000/evaluations/4d1228a5-f72f-473f-bf39-e8b79b5d52e5/edit`
- Export: `http://localhost:3000/evaluations/4d1228a5-f72f-473f-bf39-e8b79b5d52e5/export`

---

## Capture Checklist

### Figure 1 — Landing Page
- [ ] **URL:** `http://localhost:3000/`
- [ ] **Login:** None (logged out)
- [ ] **Show:** APEX hero, “Advanced Performance Evaluation eXchange,” feature cards, Sign In / Get Started
- [ ] **Caption:** *Figure 1. APEX landing page introducing the NAVPERS 1616/26 evaluation platform and primary entry actions.*

---

### Figure 2 — Login
- [ ] **URL:** `http://localhost:3000/login`
- [ ] **Login:** None
- [ ] **Optional:** Pre-fill email `sailor@franklyn.dev` (do not show password in screenshot)
- [ ] **Caption:** *Figure 2. Login screen using Supabase Auth for secure session management.*

---

### Figure 3 — Dashboard (Sailor)
- [ ] **URL:** `http://localhost:3000/dashboard`
- [ ] **Login:** `sailor@franklyn.dev` / `E2eTest!2026`
- [ ] **Show:** Header with PO2 DOE, role badge, eval list including “DOE, JOHN A,” custody/routing indicators
- [ ] **Caption:** *Figure 3. Role-aware dashboard listing evaluations visible to the logged-in user based on custody and participation.*

---

### Figure 4 — Evaluation Wizard — Admin Step
- [ ] **URL:** `http://localhost:3000/evaluations/4d1228a5-f72f-473f-bf39-e8b79b5d52e5/edit`  
  OR `http://localhost:3000/evaluations/new`
- [ ] **Login:** `sailor@franklyn.dev`
- [ ] **Show:** Step indicator (Admin), Block 1–32 fields, optional Summary Group selector at top, guidelines visible
- [ ] **Caption:** *Figure 4. Multi-step evaluation wizard — Admin step with BUPERS field guidelines and optional summary group attachment.*

---

### Figure 5 — Evaluation Wizard — Traits Step
- [ ] **URL:** Same edit page, navigate to **Traits** step (step 2)
- [ ] **Login:** `sailor@franklyn.dev`
- [ ] **Show:** Blocks 33–39 trait grades, individual trait average (Block 40)
- [ ] **Caption:** *Figure 5. Trait grading step with live individual trait average calculation per EVALMAN Block 40.*

---

### Figure 6 — Validation Results Modal
- [ ] **URL:** Edit page, any step
- [ ] **Login:** `sailor@franklyn.dev`
- [ ] **Action:** Click **Verify** / validation trigger to open modal with errors/warnings OR temporarily clear a required field to show errors
- [ ] **Caption:** *Figure 6. On-demand BUPERS validation modal listing block-level errors and warnings before save or export.*

---

### Figure 7 — Review Workflow Tab (Routing)
- [ ] **URL:** `http://localhost:3000/evaluations/4d1228a5-f72f-473f-bf39-e8b79b5d52e5`
- [ ] **Login:** `sailor@franklyn.dev`
- [ ] **Tab:** **Review Workflow**
- [ ] **Show:** Summary Group picker (eligible groups only), Route Forward dropdown, current stage banner “Sailor (draft)”
- [ ] **Caption:** *Figure 7. Review Workflow panel — summary group attachment and route-forward controls for the current custodian.*

---

### Figure 8 — Recycle Workflow (Rater)
- [ ] **URL:** `http://localhost:3000/evaluations/cd663594-d6b0-43bf-91c1-eb7e26d85b51`
- [ ] **Login:** `rater@franklyn.dev`
- [ ] **Tab:** Review Workflow
- [ ] **Show:** Route forward + Recycle for correction textarea (optionally type sample comment, do not submit)
- [ ] **Caption:** *Figure 8. Rater-stage workflow showing route forward and recycle-for-correction with required comments.*

---

### Figure 9 — Digital Signature Pad
- [ ] **URL:** Eval view → **Details** tab (or edit Details step)
- [ ] **Login:** `rater@franklyn.dev` or appropriate signer for stage
- [ ] **Show:** Signature canvas for Block 42 (Rater) or Block 50 (Reporting Senior)
- [ ] **Tip:** Use an eval routed to the signing stage, or show pad UI without submitting
- [ ] **Caption:** *Figure 9. Canvas-based digital signature capture for NAVPERS signature blocks.*

---

### Figure 10 — PDF Export / Preview
- [ ] **URL:** `http://localhost:3000/evaluations/[id]/export` (locked/finalized eval preferred)  
  OR `http://localhost:3000/pdf-preview`
- [ ] **Login:** User with export permission
- [ ] **Show:** Generated NAVPERS PDF preview or download gate
- [ ] **Caption:** *Figure 10. PDF export screen producing a NAVPERS 1616/26-compliant evaluation document.*

---

### Figure 11 — Summary Groups (Reporting Senior)
- [ ] **URL:** `http://localhost:3000/summary-groups`
- [ ] **Login:** `reportingsenior@franklyn.dev`
- [ ] **Show:** Create group form, existing groups list, forced distribution / member counts if groups exist
- [ ] **Tip:** Create one open group first: PO2, Regular, period_to `2025-12-31`, grade_rate `PO2`
- [ ] **Caption:** *Figure 11. Summary Groups management for Reporting Seniors — group creation and promotion recommendation distribution.*

---

### Figure 12 — Admin Panel (Optional)
- [ ] **URL:** `http://localhost:3000/admin`
- [ ] **Login:** `admin@franklyn.dev`
- [ ] **Caption:** *Figure 12. Admin panel for user and role management.*

---

## Post-Capture Tips

1. **Naming:** Save as `fig01-landing.png`, `fig02-login.png`, etc.
2. **PDF layout:** One figure per page or two per page with caption below each.
3. **Consistency:** Same browser zoom (100%), same theme (dark navy).
4. **Redaction:** Ensure no real passwords appear in screenshots (mask if pre-filled).
5. **Seeded date:** Re-run `npm run db:seed` if eval IDs change; update URLs from fresh `tests/fixtures/e2e-ids.json`.

---

## Quick Role Switch Workflow (for capture session)

1. Sign out from dashboard (top right).
2. Sign in as next role.
3. Navigate to URL from table above.
4. Capture screenshot (Windows: Win+Shift+S / Mac: Cmd+Shift+4).

**Recommended capture order:** Figures 1–2 (logged out) → 3–7 (sailor) → 8–9 (rater) → 11 (RS) → 10 (export, if eval is far enough) → 12 (admin).
