# APEX production readiness

Last updated: 2026-07-16 (post enterprise UI merge, PR #6).

## Deploy target

- **Production URL:** https://apex-navy-eval.vercel.app
- **Frontend:** Vercel project `apex-navy-eval` (linked; auto-deploy from `main`)
- **Backend:** Supabase (Auth, Postgres, RLS, Storage)

Production env vars are already configured on Vercel. Re-check only when rotating keys or cloning the project.

## Environment variables (reference)

Vercel **Production** (and Preview for e2e against preview):

| Variable                        | Required     | Notes                                       |
| ------------------------------- | ------------ | ------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | Yes          | Project URL                                 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes          | Public anon key                             |
| `SUPABASE_SERVICE_ROLE_KEY`     | Yes (server) | API routes that sign, route, lock, finalize |

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

- Middleware redirects unauthenticated users from `/dashboard`, `/profile`, `/evaluations`, `/admin`, `/summary-groups`, `/board-confidence`, `/brag-sheet`
- Admin UI additionally gated by `RoleGuard` / permissions
- Response headers: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (see `next.config.mjs`)
- Never commit `SUPABASE_SERVICE_ROLE_KEY` or `.env.local`

### Profile roles and PII (migration 009)

`preferred_role` and `assigned_roles` decide who may sign a Reporting Senior block
and lock a report, so they are **granted, never self-declared**:

- `authenticated` holds **no** table-level `UPDATE` on `public.profiles`; only the
  identity columns (`first_name`, `last_name`, `middle_initial`, `dod_id`, `uic`,
  `navy_rank`, `command`) are granted back. Naming either role column in an
  `UPDATE` payload — even unchanged — fails the whole statement with `42501`.
- `public.handle_new_user()` ignores `raw_user_meta_data->>'preferred_role'` and
  pins every new account to `Sailor`. Registration no longer offers a role picker.
- **Changing a role is a service-role operation** (SQL editor or a service-key
  script). There is deliberately no in-app path; `/admin` shows the roster
  read-only and says so. A real admin role-assignment UI needs a server-side
  authority check on a role the holder cannot grant themselves — not built yet.

Profile reads are own-row only. Cross-user lookups go through
`public.profiles_directory`, a four-column view (`id`, `first_name`, `last_name`,
`preferred_role`) granted `SELECT` to `authenticated`. It is intentionally a
**security-definer view** (`security_invoker` left off) so it can see past the
own-row policy; Supabase's linter flags this and the flag is expected. `dod_id`,
`email`, `uic` and `command` must never be added to it. The view definition ends in
`offset 0`, which is load-bearing: it makes the view non-auto-updatable, so it can
never become a write path around the column privileges even if someone re-grants
`ALL` on it. Do not remove it.

Applying 009 to a project is a manual step — see the migration header.

`tests/integration/profilesRlsLockdown.test.ts` proves the above against a real
`postgres:17` container (applies `001..009`, asserts privilege state). It **skips**
when Docker is unavailable rather than failing — a green `npm run verify` on a
machine without Docker does not mean those checks ran.

### Signing authority

`canSignBlock` (`lib/permissions.ts`) is the only authorization on the server
signing path: `app/api/sign/route.ts` → `authorizeSigner` → `applySignature`, which
writes with the **service-role** client and bypasses RLS. Reviewer-chain blocks
(42/49/50/52) require **both** that the signer's role permits the block **and** that
they belong to that report's chain (`reviewer_id`, `current_holder_id`, or
`participants[]`), and they can never be signed by the report's `created_by` — with
no Admin bypass. Member blocks (32/51) remain `created_by`-or-Admin.

`DetailsTab` takes a `canSign` predicate so it hides buttons the server would
reject, but that is an affordance only — `/api/sign` re-checks and its 403 names
which condition failed. `canPerformAction` is looser than `canSignBlock` and is
UI-only; unifying them is a follow-up (see the `ponytail:` note in
`lib/permissions.ts`).

### Seeding custody

`participants[]` is what makes a report signable: it is seeded as `[creator]` on
insert (`lib/evaluationService.ts` `saveDraft`) and appended to by
`app/api/eval-route/route.ts`. The column defaults to `'{}'` and has no INSERT
trigger, so anything that writes evaluations directly must build it correctly.

Seed scripts call `participantsThrough()` (`lib/routing.ts`) instead of writing
the array literally — it reproduces the accumulated prefix the routing API
produces for a given stage. Writing a literal is how the CHIEFEVAL/FITREP
showcase records ended up **signable by nobody**: self-authored with
`participants: [author]`, and a reviewer block can never be signed by the
report's own subject.

`npm run db:seed` fails loudly if any showcase record has a block with no
possible signer on the roster, and `tests/unit/seedChainSignable.test.ts` walks
42 → 49 → 51 → 50 over the same custody shape.

Since migration 009 the seed scripts must also set `preferred_role` explicitly
after `auth.admin.createUser` — `handle_new_user` no longer honours the role in
signup metadata, so a fresh seed would otherwise produce nothing but Sailors.

## CI

GitHub Actions workflow `.github/workflows/verify.yml` runs `npm run verify` on pushes and PRs to `main`.

## Known follow-ups (non-blocking)

- Chart palette hex in `AnalyticsDashboard` (intentional data-viz colors)
- `global-error.tsx` uses minimal inline styles (root layout unavailable)
- Optional: error reporting service (Sentry, etc.) not wired yet
- `npm audit` may report transitive issues in Next 14; plan a major Next upgrade separately

## Rollback

- Vercel: promote previous production deployment
- Git: revert merge commit on `main` and redeploy
