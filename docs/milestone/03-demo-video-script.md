# APEX Milestone — Demonstration Video Script

**Target length:** 5 minutes 30 seconds – 6 minutes 30 seconds  
**Format:** Screen recording with voiceover (Loom, OBS, or similar)  
**Resolution:** 1080p recommended  
**Browser:** Chrome or Firefox at 100% zoom, `http://localhost:3000`

---

## Pre-Recording Setup

```bash
cd "/home/dainja/Desktop/CIS CAPSTONE"
npm run dev
# Optional: npm run db:seed
```

**Have these ready:**

- Sailor login: `sailor@franklyn.dev` / `E2eTest!2026`
- Rater login: `rater@franklyn.dev` / `E2eTest!2026`
- Reporting Senior: `reportingsenior@franklyn.dev` / `E2eTest!2026`
- Routing eval URL: `http://localhost:3000/evaluations/4d1228a5-f72f-473f-bf39-e8b79b5d52e5`

**Optional:** Pre-route a second eval through Rater/SR stages before recording so signature and export segments are faster.

**Close:** Extra browser tabs, notifications, desktop clutter.

---

## Full Narration Script (read naturally; ~650 words)

---

### [0:00 – 0:40] INTRODUCTION

**[VISUAL: Landing page `/`]**

> “Hello. This is our CIS Capstone milestone demonstration for **APEX** — the **Advanced Performance Evaluation eXchange**.
>
> APEX is a web application that digitizes the Navy enlisted performance evaluation process for **NAVPERS 1616/26** forms. Our goal is to catch administrative errors **before** signature, route evaluations correctly through the chain of command, and produce compliant PDF output aligned with **BUPERSINST 1610.10H**.
>
> The stack is **Next.js**, **TypeScript**, **React**, and **Supabase** for authentication and Postgres with Row Level Security.”

---

### [0:40 – 1:25] SOFTWARE STANDARDS (brief)

**[VISUAL: Scroll landing features OR briefly show dashboard, then optional terminal with test output]**

> “Before the demo, here are the standards we apply.
>
> **Design:** TypeScript strict mode, modular folders for components, business logic, and types. BUPERS rules live in Zod schemas and a dedicated validation engine — not scattered in UI code.
>
> **Security:** Supabase Auth for login, role-based permissions for Sailor through Admin, and Row Level Security on every table. Sensitive actions — routing, signing, summary group attach — go through **server API routes** that verify the caller before writing with a service role.
>
> **Testing:** We run **158 automated tests** with Vitest, plus Playwright end-to-end tests for the full routing workflow. Seed scripts give us reproducible demo users.
>
> These practices improve maintainability, security, and reliability for a regulated military workflow.”

---

### [1:25 – 2:20] SAILOR — DASHBOARD AND EVAL FORM

**[VISUAL: Login as sailor → dashboard → open eval edit]**

> “I’ll sign in as **PO2 Doe**, a Sailor.
>
> The **dashboard** shows only evaluations this user created or currently holds — custody is enforced in the database, not just hidden in the UI.
>
> Opening the evaluation launches a **four-step wizard**: Admin blocks, Traits, Comments, and Details with signatures.
>
> On the Admin step, inline **BUPERS guidelines** explain each field. The form validates in real time — for example, trait grades must be one-point-oh through five-point-oh or NOB, and promotion recommendations are gated by trait performance rules.
>
> On the Traits step, the **individual trait average** updates live per Block 40.
>
> I can run a full **Verify** check to see all block-level errors before saving.”

**[VISUAL: Click Verify if modal is ready; otherwise mention it verbally while on form]**

---

### [2:20 – 3:10] ROUTING WORKFLOW

**[VISUAL: Eval view → Review Workflow tab]**

> “On the **Review Workflow** tab, the Sailor — as current custodian — can optionally attach a **summary group**. Only groups matching BUPERS eligibility — same paygrade, promotion status, ending date, and reporting senior — appear in the list. Attachment is also enforced server-side.
>
> The Sailor selects the next recipient — typically the **Rater** — and clicks **Route Forward**. That transition is handled by our **`/api/eval-route`** endpoint, which confirms the caller is the current holder and the target has the correct role.
>
> Custody, routing stage, and participants are updated in the database, and the event is written to the **audit log**.”

**[VISUAL: Route forward to Rater if time permits; otherwise cut to pre-routed eval]**

---

### [3:10 – 4:00] RATER AND RECYCLE

**[VISUAL: Sign out → login as rater → open recycle eval OR routed eval]**

> “Signing in as the **Rater**, I see evaluations where I am the current holder.
>
> At the Rater stage, I can **sign Block 42**, route forward to the Senior Rater, or **recycle** the report one step back with mandatory correction comments — for example, if trait grades need adjustment.
>
> Recycle also goes through the server route so a user cannot send an eval backward without authorization and an audit trail.”

**[VISUAL: Show recycle textarea and comment field; optional route forward]**

---

### [4:00 – 4:50] REPORTING SENIOR — SUMMARY GROUPS AND PDF

**[VISUAL: Login as reportingsenior@franklyn.dev → summary-groups page]**

> “The **Reporting Senior** manages **summary groups** — the set of members in the same paygrade and promotion status who receive the same report type on the same ending date, per BUPERS.
>
> From this page, the RS creates groups and can review **forced distribution** tallies for Block 46 and **summary group averages** for Block 50a.
>
> After the chain completes and signatures are applied, the report can be **locked** and **exported** as a NAVPERS PDF generated on the server with pdf-lib.”

**[VISUAL: Summary groups page; then export or pdf-preview if available]**

---

### [4:50 – 5:40] CHALLENGES AND NEXT STEPS

**[VISUAL: Dashboard or terminal `npm run test` summary]**

> “**Challenges** we addressed include BUPERS rule complexity — solved with centralized validation — and Row Level Security blocking legitimate custody handoffs — solved with authenticated API routes.
>
> We also fixed summary group eligibility so a PO2 cannot attach to an E-6 group during routing.
>
> **Next steps** include final UI polish, full regression testing, and preparing our capstone final presentation and deployment plan.
>
> Thank you for watching our APEX milestone demonstration.”

**[VISUAL: Return to landing or team title slide]**

---

## Timing Guide

| Segment | Target | Cumulative |
|---------|--------|------------|
| Intro | 0:40 | 0:40 |
| Standards | 0:45 | 1:25 |
| Sailor / form | 0:55 | 2:20 |
| Routing | 0:50 | 3:10 |
| Rater / recycle | 0:50 | 4:00 |
| RS / PDF | 0:50 | 4:50 |
| Challenges / close | 0:50 | 5:40 |
| **Total** | | **~5:40–6:30** |

If running long, shorten the standards segment to 30 seconds. If running short, demonstrate one signature capture or the validation modal live.

---

## Recording Tips

1. **Rehearse once** with the script before recording.
2. **Speak slowly** — demo pacing feels faster on playback.
3. **Mouse deliberately** — pause on each UI element you name.
4. **Do not read passwords aloud** — say “test account” instead.
5. **If route forward fails live**, say “this transition is enforced server-side” and cut to a pre-routed eval — do not debug on camera.
6. **Export video** as MP4; verify audio levels before upload.

---

## Rubric Alignment (mention explicitly in video)

| Rubric criterion | Where covered |
|------------------|---------------|
| Software standards | 0:40–1:25 segment |
| Completed functionality | 1:25–4:50 walkthrough |
| UI design | All screen segments |
| Challenges & next steps | 4:50–5:40 segment |

---

## Optional B-Roll Shots (if editing)

- Terminal: `npm run test` → “158 passed”
- VS Code: quick glimpse of `lib/permissions.ts` or `validationEngine.ts` (2 seconds max)
- `docs/rules-reference.md` open briefly

---

*End of video script.*
