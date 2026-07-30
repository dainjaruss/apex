# APEX AI Workforce — roster

Six roles, deliberately. Adapted from the Paari workforce (41 agents) down to what APEX actually
needs. The invariant that matters is not headcount — it is that **reviewers hold no write tools**,
so no shift can approve its own work.

| Agent | Model | Writes code? | Invoke for |
| --- | --- | --- | --- |
| `eng-feature-engineer` | inherit | **yes** | Implementing a verified brief. Own worktree when other writers are active. |
| `qa-test-engineer` | sonnet | **yes** (tests only) | Prove-it regression tests, coverage audits, empty/edge-state suites. |
| `eng-adversarial-reviewer` | opus | no | Independent correctness/architecture/security pass on every PR. |
| `navy-domain-reviewer` | opus | no | Any change rendering Navy-facing language, scoring, or advice. |
| `ux-a11y-reviewer` | sonnet | no | Any change to a page, form, or results view. |
| `eng-release-gatekeeper` | opus | no | Final check that the chain ran and the gates were executed. |

## The chain

```
brief ──▶ eng-feature-engineer ──▶ eng-adversarial-reviewer ─┐
              (+ qa-test-engineer)   navy-domain-reviewer ────┼──▶ eng-release-gatekeeper ──▶ founder merges
                                     ux-a11y-reviewer ────────┘
```

Reviewers run as **separate shifts** from the build. A subagent spawned by the builder does not
count as an independent review. The gatekeeper verifies gates by executing them, not by reading
the PR body. The founder merges — no agent does.

## Dispatch

Use the `Agent` tool with `subagent_type` set to the agent name. Parallel writers get
`isolation: "worktree"`. Reviewers can run concurrently with each other — they mutate nothing.

Every agent reads `.claude/agent-preface.md` and `CLAUDE.md` before starting;
`docs/ai-workforce/orchestrator.md` is the full playbook.

## Adding a role

Don't, unless a real task repeatedly has no owner. The Paari roster grew to 41 because every
new concern got an agent; most of them are invoked on demand and could have been a brief. Prefer
a sharper brief to a new agent file.
