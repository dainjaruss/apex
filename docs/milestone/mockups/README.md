# APEX UI Redesign Mockups

Reference mockups for the milestone submission. **Implemented direction: Mockup 3 (primary) + Mockup 2 (forms).**

| Mockup | Direction | Implemented in |
|--------|-----------|----------------|
| `03-refined-workflow.png` | **Sidebar + workflow** — cyan accents, tabbed eval view, Linear-style nav | `AppShell`, `ReportTabs`, eval `/evaluations/[id]` |
| `02-modern-wizard.png` | **Light-form wizard** — soft panels, step pills, high-contrast inputs | `apex-form-panel`, `lib/formStyles.ts`, eval wizard blocks |
| `01-high-contrast-dark.png` | Elevated dashboard cards, stat tiles, blue CTAs | `app/dashboard/page.tsx`, `apex-dashboard-*` CSS |

## Design tokens (see `app/globals.css`)

- **Mockup 3:** Cyan (`#22d3ee`) for nav, tabs, primary buttons; gold for section titles; charcoal sidebar
- **Mockup 2:** `--form-panel` / `--form-input-bg` for softer form sections inside the dark shell
