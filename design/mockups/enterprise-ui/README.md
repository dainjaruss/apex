# APEX Enterprise UI — Mockups (Epic)

**Branch:** `epic/enterprise-ui`  
**Worktree:** `/srv/apex-enterprise-ui`  
**Status:** Mockups only — no application code changes until you approve a direction.

## Purpose

Post-capstone move toward a **production-grade** evaluation workflow UI with:

- **Light and dark themes** (user-controlled, consistent tokens)
- **Operational density** — queue management, filters, tables, routing visibility
- **Evaluation workspace** — section navigation, validation summary, clear save/submit affordances
- **Responsive shell** — desktop sidebar + mobile-friendly primary actions

## How to review

```bash
cd /srv/apex-enterprise-ui/design/mockups/enterprise-ui
python3 -m http.server 8765
# open http://localhost:8765/
```

## Screens

| File | What it shows |
|------|----------------|
| `index.html` | Hub + design principles |
| `01-dashboard.html` | Command center: KPIs, filters, evaluation queue table |
| `02-evaluation-workspace.html` | In-progress FITREP edit with section nav + validation rail |
| `03-sign-in.html` | Auth entry (light/dark) aligned with app shell |

Use the **theme toggle** on each screen to compare modes.

## After approval

Pick a direction (or mix elements). Implementation continues on this branch/worktree — not on `main` until you sign off.