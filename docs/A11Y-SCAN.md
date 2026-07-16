# Automated accessibility scans (axe)

Stop running Lighthouse page-by-page. Use **axe** (same engine family as Lighthouse a11y) across all key routes in one command.

## Quick start (local dev on :3000)

With your dev server already running:

```bash
A11Y_BASE_URL=http://127.0.0.1:3000 A11Y_NO_SERVER=1 npm run a11y
```

## Full scan (Playwright starts dev server on :3099)

```bash
npm run a11y
```

Requires for **authenticated** routes:

- `.env.local` with Supabase keys
- `tests/fixtures/e2e-ids.json` from `npm run db:seed`  
  **or** set `A11Y_USER_EMAIL` / `A11Y_USER_PASSWORD` (default stress CO: `co.enterprise@franklyn.dev` / `NavyEval!2026`)

Public-only (no login):

```bash
A11Y_SKIP_AUTH=1 npm run a11y
```

## What it checks

- Routes: `/`, `/login`, `/register`, plus (when auth is available) `/dashboard`, `/evaluations/new` (picker), **EVAL / CHIEFEVAL / FITREP** wizard after picker (`tests/a11y/form-wizard.spec.ts`), `/summary-groups`, one seeded `/evaluations/[id]`
- **Light and dark** theme per route (`next-themes` + consent modal dismissed)
- WCAG **2.0 / 2.1 AA** rules via `@axe-core/playwright`, including **color-contrast**
- Fails on **serious** and **critical** violations only (ignores minor noise)

## Reports

| Output | Path |
|--------|------|
| Terminal | failing rule id, help text, selectors |
| HTML report | `reports/a11y/html/index.html` |
| JSON | `reports/a11y/results.json` |

Open HTML after a run:

```bash
npx playwright show-report reports/a11y/html
```

## Tuning

Fix tokens/classes in `app/globals.css` (see `docs/DESIGN-TOKENS.md`), re-run `npm run a11y`.

Optional env:

| Variable | Purpose |
|----------|---------|
| `A11Y_BASE_URL` | Scan existing server (e.g. `http://localhost:3000`) |
| `A11Y_NO_SERVER=1` | Do not start `next dev` |
| `A11Y_SKIP_AUTH=1` | Public routes only |
| `A11Y_USER_EMAIL` / `A11Y_USER_PASSWORD` | Login for auth routes |

## CI

`npm run a11y:ci` uses port 3099 and does not reuse an existing server. Wire into GitHub Actions when Supabase + seed secrets are available for auth routes; until then use `A11Y_SKIP_AUTH=1` in CI for public pages.