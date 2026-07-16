# APEX design tokens

All theme tuning should start in **`app/globals.css`** under `:root` (light) and `.dark`.

## Core surface tokens

| Token | Use |
|-------|-----|
| `--background`, `--foreground`, `--heading` | Page chrome |
| `--card`, `--card-elevated`, `--border*` | Panels, tables |
| `--form-panel`, `--form-input-bg`, `--input-border` | Eval form |
| `--primary`, `--primary-hover`, `--accent-cyan`, `--accent-gold` | Actions, emphasis |
| `--text-secondary` | Body/hero copy on `--background` (AA contrast) |
| `--hero-title-gradient`, `--hero-gold-gradient` | Landing H1 gradient text (theme-aware) |
| `--sidebar-brand-title`, `--sidebar-brand-tagline`, `--sidebar-section-label` | Navy sidebar & BUPERS panel |
| `--sidebar-brand-title-on-light`, `--sidebar-brand-tagline-on-light` | BUPERS panel on light cards (register/login/footer) |
| `--sidebar-profile-primary`, `--sidebar-profile-secondary` | Sidebar user rank/name + role (e.g. Reporting Senior) |
| `--page-subtitle-text`, `--table-header-text`, `--queue-tab-idle-text` | Dashboard subtitle, table `<th>`, queue tab buttons |
| `--badge-kicker-*`, `--navpers-pill-*`, `--form-kind-badge-*`, `--form-picker-*` | Page kicker badge, `/evaluations/new` form picker cards |
| `--report-*`, `.apex-report-*`, `.apex-narrative-viewer` | View draft/report (`/evaluations/[id]`) Form Details & audit |

## Auth & forms

| Token / class | Use |
|---------------|-----|
| `--link`, `--link-hover` | `.apex-link` |
| `--field-error-text`, `--field-invalid-*` | `.apex-text-field-error`, `.apex-input--invalid`, `.apex-select--invalid` |
| `--banner-error-*`, `--banner-success-*` | `.apex-banner-error`, `.apex-banner-success` |
| `--status-success-text` | `.apex-text-success` |
| `.apex-text-muted`, `.apex-text-subtle`, `.apex-text-secondary`, `.apex-text-accent` | Body copy — prefer over `style={{ color: ... }}` or `text-slate-*` |
| `.apex-auth-shell` | Full-page auth background (`var(--background)`) |

## Semantic tokens (badges, reference tips, danger)

Defined in the `Semantic tokens` block in `globals.css`:

- **Queue badges:** `--badge-draft-*`, `--badge-routing-*`, `--badge-reporting-senior-*`, `--badge-review-*`, `--badge-locked-*`
- **BUPERS reference sticky note:** `--reference-*` (background, accent, text, checklist)
- **Buttons:** `--danger-*`, `--success-solid*`, `--btn-dashboard-*`
- **Charts (admin analytics):** `--chart-stage-*`, `--chart-role-*`, `--chart-kpi-*`, `--chart-pipeline-*` — use `chartStageColor()` / `chartRoleColor()` from `lib/chartColors.ts`
- **Trait rows / grade pills:** `--trait-row-*`, `--trait-pill-*`, `--trait-anchor-*`
- **Validation modal:** `--alert-error-*`, `--alert-success-*`, `--validation-group-*`

Component classes map to these variables (e.g. `.apex-badge-reporting-senior`, `.apex-reference-tip`, `.apex-grade-pill--active`). Prefer adding a token + class over hardcoded hex in TSX.

## Tailwind

`tailwind.config.ts` maps `background`, `foreground`, `card`, etc. to the same CSS variables. Extend tokens in `globals.css` first, then wire into Tailwind `theme.extend.colors` if you need utility classes.