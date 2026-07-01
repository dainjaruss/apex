# APEX UI Redesign Mockups

Three design directions for improved **contrast** and a **modern** feel. These are reference mockups — not yet implemented in code.

| Mockup | Direction | Best for |
|--------|-----------|----------|
| `01-high-contrast-dark.png` | **Elevated dark dashboard** — brighter text, stronger card borders, clearer status badges | Dashboard, eval list, navigation |
| `02-modern-wizard.png` | **Light-form wizard** — high-contrast inputs on soft panels, clear step pills | Evaluation form (Admin → Details) |
| `03-refined-workflow.png` | **Sidebar + workflow** — Linear/Vercel-style layout, tabbed eval view | Review Workflow, routing, audit |

## Recommended hybrid implementation

1. **Global tokens** — Raise `--foreground` contrast; use `#e8eef4` body text and `#ffffff` headings on `#080f1f` background.
2. **Cards** — Replace low-opacity glass with `bg-[#121c32]` + `border border-white/10` + `shadow-lg shadow-black/20`.
3. **Forms** — Input backgrounds `#0f1729`, borders `#2a3a5c`, focus ring `#4d8fd4`; labels at `#c5d4e8` (not `#608bb3`).
4. **Primary actions** — Solid `#2563eb` → `#3b82f6` hover; secondary ghost with visible border.
5. **Layout** — Optional sidebar nav (mockup 03) for Dashboard / Evaluations / Summary Groups / Profile.

See milestone PDF Section C for current (pre-redesign) screenshots.
