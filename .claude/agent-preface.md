# APEX AGENT GROUND RULES — read before writing any code, every task.

## 0 — Orient before you touch anything
- Read `CLAUDE.md` and `docs/ai-workforce/orchestrator.md`. Pick up, don't restart.
- `git fetch && git status`. Local `main` goes stale silently here — never branch without
  fetching. The shared `/srv/apex` tree must be clean; if it holds work that isn't yours, STOP
  and surface it.

## 1 — Branch before editing. Always.
- `git checkout main && git pull --ff-only && git checkout -b <type>/<slug>`.
- Never edit loose in the shared tree. Two writers at once → each in its own worktree.
- Return the tree to `main` when you pause or finish.

## 2 — While coding
- **Probe, don't infer.** Settle any environment, egress, or hosted-schema claim with a direct
  probe (curl the route, query the DB, read the built artifact) — never by reading a config file.
- **Never invent Navy doctrine.** Trace every domain claim to a source in this repo or a cited
  public instruction. No invented instruction numbers, board procedure, or advancement rules.
- **Never let missing data render as a bad score.** "Unknown" and "weak" are different messages
  and must stay visually and structurally distinct.
- Server-only modules lazy-import heavy deps (`undici`, `unpdf`) inside the function that uses
  them — a top-level import breaks the vitest/jsdom run.
- Secrets never reach stdout, argv, a committed file, or the transcript.
- Uploaded documents are parsed in memory and never persisted. Prove it with a test.

## 3 — Before EVERY commit: the index check
- `git status --short` and READ it. `git add <yourfile> && git commit` still sweeps anything
  already staged into your commit. Stage explicitly by path, confirm, then commit.

## 4 — Every PR ships FOUR artifacts. No code-only PRs.
- **code** + **tests** (must fail if the change is reverted) + **docs** (the `docs/` page that
  describes the surface you touched) + a **demo-verify step** in the PR body naming what a human
  must click to confirm it.
- New user-facing page → nav entry **and** a nav test.
- UI change → `npm run a11y` clean.
- Migration → number strictly above `main`'s max, idempotent, paired with the code that assumes
  it, and flagged as a founder-gated hosted-schema step.
- Local gates green before push: `npm run verify` (test:all + build).

## 5 — You PROPOSE; the founder disposes.
- Open an advise-first PR. Do NOT merge, `--admin`, deploy production, apply a hosted migration,
  or change the normative disclaimer text. Prepare the exact command and hand it over.
- Tests green ≠ the demo works. Name the demo-verify step; that is the closure gate.

## 6 — Report honestly.
- Surface problems immediately; don't apologize, keep working. If you skipped a gate or couldn't
  run a probe, say so. Never report a gate you didn't execute as passed.
- Label findings **confirmed / likely / uncertain / not-a-bug**, and distinguish **defect** from
  **design-limit** from **presentation**.
