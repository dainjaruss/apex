# APEX production readiness

Last updated: 2026-07-16 (post enterprise UI merge, PR #6).

## Deploy target

- **Frontend:** Vercel (`apex-navy-eval` or linked project)
- **Backend:** Supabase (Auth, Postgres, RLS, Storage)

## Required environment variables

Set in Vercel **Production** (and Preview if you run e2e against preview):

| Variable | Required | Notes |
|----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes (server) | API routes that sign, route, lock, finalize |

Local development: copy `.env.example` → `.env.local` and fill keys.

Builds succeed without public Supabase env (placeholder client for static prerender), but **runtime auth and data require real keys**.

## Quality gate (before every deploy)

```bash
npm run verify          # full vitest (160) + production build
npm run verify:e2e      # above + Playwright (needs .env.local + tests/fixtures/e2e-ids.json)
```

Seed E2E fixtures: `npm run db:seed` (uses `E2E_TEST_PASSWORD` in `.env.local`).

## Post-deploy smoke

1. `GET /api/health` → `{ "ok": true, "supabasePublicEnv": true }`
2. Sign in → dashboard loads, theme toggle works
3. Open an eval you hold → Edit visible only when custody allows
4. Mobile width → queue table scrolls; Admin tab visible for admins

## Security notes

- Middleware redirects unauthenticated users from `/dashboard`, `/profile`, `/evaluations`, `/admin`, `/summary-groups`
- Admin UI additionally gated by `RoleGuard` / permissions
- Response headers: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (see `next.config.mjs`)
- Never commit `SUPABASE_SERVICE_ROLE_KEY` or `.env.local`

## Known follow-ups (non-blocking)

- Chart palette hex in `AnalyticsDashboard` (intentional data-viz colors)
- `global-error.tsx` uses minimal inline styles (root layout unavailable)
- Optional: error reporting service (Sentry, etc.) not wired yet

## Rollback

- Vercel: promote previous production deployment
- Git: revert merge commit on `main` and redeploy