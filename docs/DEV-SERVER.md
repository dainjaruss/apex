# Local dev server

## Styling suddenly missing (unstyled HTML)?

Usually the browser is still pointing at old `/_next/static/...` chunk URLs while the running `next dev` process has regenerated `.next` with new hashes.

**Common trigger:** running `npm run build` or `npm run verify` **while** `npm run dev` is still running on the same port. Both use `.next` — the build replaces it and the dev server keeps serving HTML that 404s on CSS/JS.

**Fix:**

```bash
# Stop dev (Ctrl+C), then:
npm run dev:fresh
# Or bind all interfaces on 3000:
rm -rf .next && npm run dev -- -H 0.0.0.0 -p 3000
```

Hard-refresh the browser (Ctrl+Shift+R).

## Stable workflows

| Goal | Command |
|------|---------|
| Day-to-day UI work | `npm run dev` (only this — no concurrent `build`) |
| Production-like check locally | `npm run preview` (build + `next start` on :3000) |
| CI parity | `npm run verify` (no dev server running) |

## CSS

All APEX styling lives in `app/globals.css` (Tailwind 3 + `apex-*` tokens). Do not run `build` against a live dev session on the same worktree.