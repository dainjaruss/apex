# APEX Milestone — Demonstration Video Script (Through Week 5)

**Target length:** 5 minutes 30 seconds – 6 minutes 45 seconds (rubric requires **5–7 minutes**)  
**Format:** Screen recording with voiceover (Loom, OBS, or similar)  
**Resolution:** 1080p recommended  
**Browser:** Chrome or Firefox at 100% zoom, `http://localhost:3000`

> **Scope:** This is the **Week 5** milestone demo. It shows what is built and demonstrable now — authentication, the EVAL data-entry wizard, inline BUPERS guidance, comment-fit, and the validation engine. PDF export, the review/signature workflow, summary groups, and deployment are presented as the **Week 6–8 roadmap**, not demonstrated.

### Rubric coverage map (all five required elements)


| Required element                             | Segment(s)                                              |
| -------------------------------------------- | ------------------------------------------------------- |
| 1. Current state of the project              | Intro (0:00–0:50) + closing roadmap                     |
| 2. Features & functionality completed so far | 2:00–5:15 walkthrough                                   |
| 3. User interface walkthrough                | 2:00–5:15 (dashboard → form → comment-fit → validation) |
| 4. Standards & practices applied             | 0:50–2:00 (dedicated segment)                           |
| 5. Challenges & planned next steps           | 5:15–6:10                                               |


---

## Pre-Recording Setup

```bash
cd "/home/dainja/Desktop/CIS CAPSTONE"
npm run dev          # single instance — stop any other dev servers first
# Optional: npm run db:seed
npm run test         # optional: capture the green summary for B-roll
```

**Have these ready:**t-f

- Sailor login: `sailor@franklyn.dev` / `E2eTest!2026`
- Draft eval URL: `http://localhost:3000/evaluations/4d1228a5-f72f-473f-bf39-e8b79b5d52e5`
- Or a fresh form: `http://localhost:3000/evaluations/new`
- A paragraph of sample Block 43 text on the clipboard (for the commenit demo)

**Close:** Extra browser tabs, notifications, desktop clutter. Log in once before recording so the auth redirect doesn't interrupt the flow.

---

## Full Production Script (screen + click-through + narration; ~800 words)

> Each segment lists **SCREEN** (what the viewer sees), **ACTIONS** (exactly what to click, in order), and **NARRATION** (what to read). Keep the mouse on the element you’re naming.

---

### [0:00 – 0:50] INTRODUCTION & CURRENT STATE  *(rubric: current state)*

**SCREEN:** APEX landing page at `http://localhost:3000/` — hero text, “Sign In” / “Get Started” buttons, and the Bureau of Naval Personnel seal in the footer.

**ACTIONS:**

1. Start on the landing page, logged out.
2. Slowly scroll once from the hero down to the footer seal, then back to the top.
3. Hover (don’t click yet) over the “Sign In” button as you finish.

**NARRATION:**

> “Hello. This is my CIS Capstone **Week 5** milestone demonstration for **APEX** — the **Advanced Performance Evaluation eXchange**.
>
> APEX is a web application that digitizes the Navy enlisted performance evaluation process for the **NAVPERS 1616/26** form. Its core purpose is to catch administrative and policy errors **before** a report is signed and mailed, aligned with **BUPERSINST 1610.10H**, the governing instruction.
>
> Where the project stands today: the **foundation and core value are complete**. Users can register and sign in, draft a full 1616/26 evaluation with live policy guidance, run the **validation engine**, and check Block 43 **comment-fit** — the single feature that prevents the most common rejection at Navy Personnel Command. The technology stack is **Next.js**, **TypeScript**, **React**, and **Supabase** for authentication and a Postgres database with Row Level Security.”

---

### [0:50 – 2:00] STANDARDS AND PRACTICES  *(rubric: standards & practices)*

**SCREEN:** A quick cut to VS Code showing the project tree, then a terminal showing the green test summary.

**ACTIONS:**

1. Alt-tab (or cut) to VS Code. Show the folder tree expanded: `app/`, `components/`, `lib/`, `types/`, `supabase/migrations/`, `tests/`.
2. Click `lib/validationEngine.ts` for ~2 seconds, then `supabase/migrations/001_initial_schema.sql` for ~2 seconds (don’t read code — just show structure).
3. Cut to a terminal and run `npm run test`; let the green “Test Files / Tests passed” summary land on screen.

**NARRATION:**

> “Because this handles regulated military data, I adopted explicit standards early.
>
> **Design and coding standards:** TypeScript in strict mode, with folders that separate UI components, business logic, and shared types. Critically, the Navy business rules don’t live in the interface — they live in **Zod schemas** and a dedicated **validation engine** in the `lib` folder, so each rule can be tested and cited independently.
>
> **Security:** Authentication is handled by **Supabase Auth**; passwords are never stored in app code. There’s a **five-role model** — Sailor, Rater, Senior Rater, Reporting Senior, and Admin — and **Row Level Security** on every table, so users only ever read their own records. All input is validated with Zod before it’s saved.
>
> **Database standards:** A versioned SQL migration defines the schema with foreign keys and CHECK constraints, and the form structure itself is stored as data in a `form_definitions` table, so new form types extend the system without new code.
>
> **Testing and quality:** This milestone is backed by **over seventy automated tests** in Vitest — including **thirty-five for the validation engine** and a set for comment-fit — plus ESLint for static analysis.
>
> **Version control and AI usage:** Work is tracked in Git with milestone-based commits, and AI tools were used for boilerplate and review under human verification — with **synthetic data only**, never real Sailor PII.”

---

### [2:00 – 2:40] AUTHENTICATION & DASHBOARD  *(rubric: features + UI)*

**SCREEN:** The `/login` form, then the Sailor dashboard with the sidebar, stat tiles, and evaluation cards.

**ACTIONS:**

1. Navigate to `http://localhost:3000/login`.
2. Type the email `sailor@franklyn.dev`; type the password **off-camera or pre-filled** (do not show keystrokes).
3. Click **Sign In**. Land on `/dashboard`.
4. Move the mouse across the **sidebar nav**, then to the **stat tiles**, then hover the **“DOE, JOHN A”** evaluation card.
5. Click the **“DOE, JOHN A”** card (or its **Edit Draft** button) to open the evaluation.

**NARRATION:**

> “Now the walkthrough. I’ll sign in as **PO2 Doe**, a Sailor. Authentication runs through Supabase, and protected pages redirect to login when there’s no session.
>
> This is the **dashboard**. It lists the evaluations this user owns, each card showing the member, paygrade, reporting period, and a status badge. The layout is a clean, high-contrast Navy theme used consistently across the app. Let me open a draft.”

---

### [2:40 – 3:40] EVAL FORM — ADMIN & TRAITS  *(rubric: features + UI)*

**SCREEN:** The evaluation wizard. Top shows the step pills: **Admin & Command Info · Performance Traits · Narrative & Comments**. Admin step fields are visible with inline guidance panels.

**ACTIONS:**

1. With the eval open in edit mode, point to the **step pills** at the top.
2. On the **Admin & Command Info** step, click into **Block 1 (Name)** and **Grade/Rate**; pause so the **inline BUPERS guidance** panel for the focused field is visible.
3. If guidance isn’t showing, toggle **Field Guidelines** on (top utility bar).
4. Click the **Performance Traits** step pill.
5. Set a couple of trait grades in **Blocks 33–39** (e.g., 4.0, 3.0); point to the **Block 40 Individual Trait Average** updating.
6. Set one trait to **NOB** and show the average recalculates without it.

**NARRATION:**

> “The evaluation opens as a **multi-step wizard** mapped directly to the official 1616/26 block numbers.
>
> On the **Admin** step, every field carries inline **BUPERS guidance** pulled straight from the instruction, so the user understands each block as they fill it. The form validates in real time — formats, required fields, and value ranges are checked as I type.
>
> On the **Traits** step, I grade Blocks 33 through 39. Each trait is a value from one-point-oh to five-point-oh, or **Not Observed**. As I enter grades, the **Block 40 individual trait average** recalculates live and correctly **excludes** any Not-Observed traits, exactly as EVALMAN specifies.”

---

### [3:40 – 4:30] COMMENT-FIT (Block 43) — HIGHLIGHT  *(rubric: features + UI)*

**SCREEN:** The **Narrative & Comments** step — the Block 43 text area, the **10-Pitch (90 CPL) / 12-Pitch (84 CPL)** toggle, and the live line/character fit indicator.

**ACTIONS:**

1. Click the **Narrative & Comments** step pill.
2. Paste the prepared paragraph into the **Block 43** text area; let the **fit indicator** (lines used / capacity) update as it lands.
3. Keep pasting or hold a key to **overflow** the box — pause on the **red/overflow warning**.
4. Click the **12-Pitch (84 CPL)** toggle, then back to **10-Pitch (90 CPL)**, to show the limit changes with pitch.
5. Trim a sentence so it **fits again** — pause on the indicator returning to green.

**NARRATION:**

> “This is APEX’s highest-value feature: **comment-fit** on **Block 43**.
>
> The official form has a fixed-size comment box. At 10- or 12-pitch, there’s a hard limit on characters per line and total lines, and continuation sheets are **not** accepted by Navy Personnel Command. A narrative that overflows gets the whole report rejected.
>
> As I type — or paste — APEX measures the text against the **real box dimensions** and tells me live whether it fits. Watch the indicator when I exceed the limit: it flags the overflow immediately. I trim it, and it clears. That feedback turns a post-signature rejection into a five-second fix on screen.”

---

### [4:30 – 5:15] VALIDATION ENGINE  *(rubric: features + UI)*

**SCREEN:** The **Verify Rules** button, then the Validation Results modal listing block-level errors and warnings with citations.

**ACTIONS:**

1. (Optional, to produce an error) clear a required Admin field — e.g., blank out **Date Counseled** or a required trait.
2. Click **Verify Rules** (button reads **“Checking…”** briefly).
3. When the **Validation Results modal** opens, scroll slowly through the entries; hover one row to highlight its **BUPERSINST citation**.
4. Close the modal; fix the field you cleared and click **Verify Rules** again to show the list shrink (optional if time allows).

**NARRATION:**

> “Live checks guide drafting; the **full validation pass** is the final gate.
>
> The engine applies the EVALMAN-cited rule set: required administrative fields and their formats, valid trait grades and the computed average, the strict promotion-recommendation list, and policy gates — for example, a 2.0 in Equal Opportunity or Military Bearing **bars** a recommendation of ‘Promotable’ or higher.
>
> Each result appears as a block-level **error or warning with its BUPERSINST citation**, so the user knows what to fix and why. Every rule is also mapped to its source and code location in my `rules-reference` document — that traceability is part of the standards I mentioned earlier.”

---

### [5:15 – 6:10] CHALLENGES & NEXT STEPS  *(rubric: challenges & next steps)*

**SCREEN:** Return to the dashboard (or keep the green `npm run test` summary visible); end on the landing page or a simple title slide.

**ACTIONS:**

1. Navigate back to `/dashboard` so the viewer sees the populated, working app while you summarize.
2. As you list next steps, you may briefly hover the sidebar items that lead to reserved areas — but **do not click into** PDF export, routing, summary groups, or admin.
3. On the closing line, navigate to `/` (landing) or cut to your title/credits slide.

**NARRATION:**

> “A few **challenges**. First, the BUPERS rules are deeply interdependent — I addressed that with a single centralized validation engine instead of scattered checks. Second, the official comment-box dimensions aren’t published anywhere, so I measured them from the rendered form to make the comment-fit check accurate and defensible. Third, getting Row Level Security to allow legitimate reads while still protecting records took careful policy tuning.
>
> **Planned next steps**, by week: **Week 6** adds the high-fidelity NAVPERS **PDF export**, gated on a passing validation; **Week 7** adds the internal **review and routing workflow** with an audit trail; and **Week 8** covers **deployment**, expanding test coverage toward eighty percent, and final UI polish. Summary-group analytics and the CHIEFEVAL and FITREP form types are documented roadmap items that the form-definition architecture is already designed to accept.
>
> That’s the current state of APEX at Week 5 — a complete, validated EVAL drafting pipeline on a foundation built to extend. Thank you for watching.”

**[VISUAL: Return to landing or title slide]**

---

## Timing Guide


| Segment                 | Target | Cumulative     |
| ----------------------- | ------ | -------------- |
| Intro & current state   | 0:50   | 0:50           |
| Standards & practices   | 1:10   | 2:00           |
| Auth / dashboard        | 0:40   | 2:40           |
| Form: Admin / Traits    | 1:00   | 3:40           |
| Comment-fit (highlight) | 0:50   | 4:30           |
| Validation engine       | 0:45   | 5:15           |
| Challenges / next steps | 0:55   | 6:10           |
| **Total**               |        | **~5:30–6:45** |


**If running short of 5:00:** add a second validation example, or show inline guidance on another block, or display the `npm run test` run live.  
**If running long past 7:00:** trim the standards segment to ~50 seconds and tighten the form walkthrough.

---

## Recording Tips

1. **Rehearse once** with the script before recording; the standards segment is dense — practice it.
2. **Speak slowly** — demo pacing feels faster on playback.
3. **Mouse deliberately** — pause on each UI element you name.
4. **Do not read the password aloud** — say “my test account” instead.
5. **Comment-fit is the money shot** — make the overflow → fix moment clear and unhurried.
6. **Export video** as MP4; verify audio levels before upload.

---

## Optional B-Roll Shots (if editing)

- Terminal: `npm run test` → green summary (Week 5 suite)
- VS Code: quick glimpse of `lib/validationEngine.ts` or `lib/commentFit.ts` (2 seconds max)
- `docs/rules-reference.md` open briefly
- `supabase/migrations/001_initial_schema.sql` for the database-standards line

---

## Do NOT Demo in the Week 5 Video (reserved for later)

- PDF export / preview
- Route forward / recycle / review workflow
- Digital signature capture
- Summary groups, Block 46 / 50a distribution
- Admin panel

Mention these only as the **roadmap** in the closing segment.

---

*End of video script.*