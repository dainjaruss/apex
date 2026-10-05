# Spec: Scoped workspaces and debrief ranking

Status: **Approved and built** on 2026-10-05. The user said "build it." Working tree on `feat/sqlite-workspace`. Not committed.
Date: 2026-10-05. Target: APEX v2 Forge (`v2/`). The v1 server and its RLS stay as they are.

This spec is the build document for the visibility boundary discussed after the summary-group figures started writing themselves onto every report in one shared workspace. An implementer should be able to build from this document. It does not authorize a signature ceremony, accounts, or encryption. Those stay out until their own spec.

## Assumptions

These are the decisions this draft is written on. A correction here changes the spec before any code.

1. v2 stays a Forge page with no login server. The boundary is which file a person holds, not a password.
2. "Three scoped workspaces" means three scopes. A summary group produces one command workspace, one reviewer workspace per rater or senior rater, and one member workspace per sailor.
3. The reporting senior's command workspace is the only place that holds every report in the group, and the only place that computes the group figures while the group is open.
4. A sailor's ranking is comparative information. It is the summary group average, the five summary-breakdown counts, any comparison of this report's trait average with that group average, and the promotion recommendation the reporting senior assigned. It is not a rank number such as "3 of 12." This app does not compute or display a place-in-line.
5. The sailor's own trait grades and own trait average are not ranking. They stay on the member copy the whole time.
6. A reviewer does not receive the ranking. Calibration of the group stays in the command workspace. See Open Questions if a senior rater must see the aggregate before debrief.
7. The official average and the official counts are frozen when the reporting senior closes the summary group. Every debrief copy from that close carries the same figures. A partial pool is shown only inside the command workspace, with the count of reports in the pool, and is never copied onto a sailor's report.
8. Block numbers follow the helpers already in `v2/src/lib/traitStandards.ts` (`summaryGroupAverageLabel`, `summaryBreakdownLabel`). EVAL prints the counts in Block 46 and the average in the Summary Group Average cell under the Block 50 signature. CHIEFEVAL uses Block 48 and Block 45. FITREP uses Block 43 and its Summary Group Average cell. EVAL Block 45 remains the promotion mark.

## 1. What this feature is

A summary group contains several sailors. Each sailor works only their own report. The reporting senior works the whole group. The rater and the senior rater work the single reports routed to them.

The sailor does not see how they stand in the group until the reporting senior closes the group and returns a debrief copy. That copy is the first time the sailor's file contains the promotion mark, the summary breakdown, and the summary group average.

v1 enforced the same split in Postgres. `eval_select_custody` (`supabase/migrations/002_routing_workflow.sql`) returns a row only to its creator, its participants, or an oversight role the user cannot grant themselves. `/api/summary-average` and `/api/summary-distribution` return the aggregate and refuse it to the sailor until the report is finalized. They never return a peer's name, grades, or comments. v2 has no server in front of the file, so the same split is enforced by leaving the peer rows out of the sailor's file.

## 2. The three scopes

| Scope | Who holds the file | What the file contains |
|---|---|---|
| Member | One sailor | That sailor's reports only. No other sailor. No summary-group roster. |
| Reviewer | One rater, or one senior rater | The reports currently addressed to that person, one sailor each. No other sailors' reports. No summary group. |
| Command | The reporting senior | The roster, the summary groups, and every member report in those groups. |

A workspace file records its scope in the SQLite `meta` table (`v2/src/lib/workspaceSqlite.ts` already stores `format`, `version`, `file_ratchet`, and `exported_at`). Add:

| Meta key | Value |
|---|---|
| `scope` | `member`, `reviewer`, or `command` |
| `workspace_id` | Random id minted once, when the workspace is first saved |
| `holder_name` | The name printed for this person |
| `holder_role` | `Sailor`, `Rater`, `Senior Rater`, or `Reporting Senior` |

`workspace_id` is an address. It is not a secret. The file is still plaintext SQLite. Anyone who is given the file can read what is in it. The scope works because a member file never contains the other reports or the ranking.

Creating a workspace asks for the scope once. The header no longer offers a role switch that pretends this file is a different scope. Changing scope means creating a different workspace file.

The command roster is a list of people stored only in the command workspace: holder name, role, and `workspace_id` once that person has sent a workspace card. It has no passwords and no NMCI directory lookup.

### Workspace card

A new transfer format, separate from a report:

```json
{
  "format": "APEX_WORKSPACE_CARD",
  "version": "1",
  "workspace_id": "<id>",
  "holder_name": "FRANKLYN, DAIN A",
  "holder_role": "Sailor"
}
```

The card contains no report and no ranking. The command workspace imports it into the roster. Later report files are addressed to that `workspace_id`.

## 3. What each scope may see

### Member, before debrief

Visible: the sailor's identity blocks, trait grades, own trait average, narrative, career recommendations, qualifications, and counseling fields.

Hidden, and absent from the saved report, the exported report file, and the PDF:

- `summary_group_average`
- `summary_group_distribution`
- any "trait average versus the group" line
- `promotion_recommendation` (the reporting senior has not issued it to this copy)
- every other sailor's name, grades, comments, and marks
- the summary-group member list

A new member draft does not seed `promotion_recommendation` to Promotable. An empty mark is an unassigned mark. It must not look like a ranking decision.

The member PDF leaves the promotion mark, the summary breakdown, and the Summary Group Average cell blank.

### Member, at debrief

The debrief copy is a single report file addressed to that sailor's `workspace_id`. It adds only:

- the promotion recommendation the reporting senior assigned to this sailor
- the frozen five-category breakdown for the closed group
- the frozen summary group average
- the trait-average comparison against that frozen average

It still contains no other sailor's report. The five counts are the numbers the form prints. They do not name who received which mark.

### Reviewer

A reviewer sees the one report that was addressed to them: the sailor's grades, narrative, and own trait average. The ranking fields are omitted from that file the same way they are omitted from a member draft. The reviewer returns the report file to the command workspace without those fields.

### Command

The command workspace shows the live pool as it changes: the average, the five counts, each member's trait average, and each member's promotion mark. While the group is open, the screen states how many graded reports are in the pool. That partial figure is not written onto a member report and is not called the final average.

The reporting senior assigns each promotion mark here. Nobody else does.

Summary groups, the RSCA ledger, and quota display stay on this scope. A member or reviewer workspace does not open the RSCA screen.

The placeholder reporting-senior cumulative average (the historical 382.4 over 98 reports) is never written onto a report. That rule already stands.

## 4. Closing the group and issuing debrief

Debrief copies are issued only after the reporting senior closes the summary group. Close is refused while any member report in the group lacks a promotion recommendation, or while a member report is still out with a reviewer.

On close, the command workspace computes one pool from the member reports it holds:

- Summary group average: sum of graded trait marks divided by the count of graded trait marks. Blank traits and a NOB report contribute nothing. This is the existing `computeSummaryGroupAverage` rule.
- Breakdown: the five observed categories only. A NOB recommendation is not a sixth count. This is the existing `tallyRecommendations` rule.

Those two results are stored on the group as the frozen release. Every debrief copy issued from that close carries those same two results plus that sailor's own promotion mark.

Reopening a closed group clears the frozen release. Debrief copies already issued are not silently rewritten. A later close produces a new release, and a new debrief file must be sent if the figures changed. The member workspace accepts a newer debrief file for the same report only when its `base_ratchet` matches the report it holds, which is the rule `importSingleEvalTransfer` already uses.

Returning a report for rework before close does not add ranking fields to the member copy. The command workspace keeps the marks it has already assigned.

## 5. Report file

The single-report file stays `APEX_EVAL_TRANSFER` (`v2/src/lib/sessionTransfer.ts`). Add these fields:

| Field | Meaning |
|---|---|
| `addressed_to` | `workspace_id` of the workspace allowed to import this file |
| `release` | `draft`, `review`, or `debrief` |

Import refuses the file when `addressed_to` is present and does not match this workspace's `workspace_id`. The existing `base_ratchet` check stays: a stale copy does not overwrite a report that has moved on.

`release: "debrief"` is the only release allowed to carry `promotion_recommendation`, `summary_group_average`, and `summary_group_distribution`. Export for `draft` or `review` strips those three fields even if the source row has them. A member or reviewer workspace rejects a `draft` or `review` file that still contains them.

A debrief file is rejected by a reviewer workspace and by a command workspace. The command workspace already has the official copy. A draft or review file is rejected by a workspace whose scope is not the addressee's scope.

The Outlook draft remains a notice. The attachment, when the sender adds it, is the one report file. The command workspace file is never the attachment.

## 6. Custody along the chain

1. The sailor creates a member workspace, saves it, and exports a workspace card. The command workspace imports the card.
2. The sailor drafts the report and exports it with `release: "draft"`, addressed to the rater's `workspace_id` once the rater's card is on the roster. Until then it is addressed to the command workspace, which forwards it.
3. The rater imports it into the reviewer workspace, reviews that report, and exports it with `release: "review"`, addressed back to the command workspace.
4. The senior rater does the same, in their own reviewer workspace.
5. The command workspace places the report in the summary group. Membership, grades, and marks recompute the live pool inside that workspace only.
6. The reporting senior assigns the promotion mark and closes the group.
7. For each member, the command workspace exports one `release: "debrief"` file addressed to that sailor's `workspace_id`.
8. The sailor imports it. Step 4 of the editor and the PDF then show the mark, the breakdown, and the average.

The per-report custody lock (`lock_holder_name`, `lock_token`, `lock_ratchet`, 24-hour inactivity) stays inside whichever workspace currently holds the report. Save and release still clears that report's lock before export.

## 7. Screens

Member and reviewer workspaces:

- Evaluations lists only the reports in this file.
- The summary-group screen and the RSCA screen are absent.
- Step 4 does not render the summary group average, the breakdown, the promotion mark, or a trait-versus-group line until the open report arrived as a debrief release.
- Download Official PDF uses the report as stored. It does not recompute a pool from other rows, because the other rows are not there.

Command workspace:

- The summary-group screen shows the live pool and the member count.
- Close Group is the action that freezes the release.
- Issue Debrief Copy writes one `APEX_EVAL_TRANSFER` per member.
- The promotion mark is editable only here.

`persistSummaryGroupFigures` in `v2/src/lib/summaryGroupService.ts` currently writes the average, the distribution, and the trait average onto every member whenever the group changes. That write is limited to the command workspace, and the debrief export is the only path that copies the frozen average and distribution onto a file a sailor will open. A member workspace never calls it.

`applyLiveSummaryFigures` may fill the PDF from the report it was given. It must not reach into other reports on a member or reviewer workspace. On a command workspace it may keep using the live pool for the command's own PDF. A PDF handed to a sailor is printed from the debrief file, after the freeze, not from the live pool.

## 8. Commands

From `/srv/apex/v2`:

```
./node_modules/.bin/vitest run src/lib/sessionTransfer.test.ts src/lib/summaryGroupService.test.ts src/lib/workspaceSqlite.test.ts
./node_modules/.bin/vite --port 5174 --strictPort --host 127.0.0.1
```

Before a push, from `/srv/apex`:

```
TEST_SCOPE=all npm run verify
```

The v2 test surface is `http://127.0.0.1:5174/` with no login. The Next app on port 3011 is not the surface for this work.

## 9. Project structure

Changes stay in v2 unless a shared type is required.

| Path | Change |
|---|---|
| `v2/src/lib/workspaceSqlite.ts` | Persist `scope`, `workspace_id`, `holder_name`, `holder_role` in `meta`. |
| `v2/src/lib/sessionTransfer.ts` | `addressed_to`, `release`, strip ranking fields, reject a mismatched address. |
| `v2/src/lib/summaryGroupService.ts` | Command-only live pool. Freeze on close. Debrief copy builder. |
| `v2/src/components/evaluations/EvalEditor.tsx` | Hide ranking on a member or reviewer report that is not a debrief release. |
| `v2/src/components/evaluations/EvalList.tsx` | List only this workspace's reports. |
| `v2/src/components/rsca/RscaMatrix.tsx` | Mount only for `scope === "command"`. |
| `v2/src/App.tsx` | Scope chosen at workspace creation. No role switch that changes scope. |
| `v2/src/lib/*.test.ts` | The cases in Testing. |

No hosted Supabase migration. No change to `supabase/migrations/`. No new root dependency.

## 10. Code style

Follow the surrounding v2 modules. One function owns the strip, so export and import cannot drift:

```ts
const RANKING_FIELDS = [
  "promotion_recommendation",
  "summary_group_average",
  "summary_group_distribution",
] as const;

export function copyForRelease(
  evaluation: Evaluation,
  release: "draft" | "review" | "debrief",
): Evaluation {
  if (release === "debrief") return evaluation;
  const copy = { ...evaluation };
  for (const field of RANKING_FIELDS) delete copy[field];
  return copy;
}
```

Trait average stays on every copy. The comparison against the group average is a screen computation from `summary_group_average`, so stripping that field removes the comparison.

## 11. Testing

Vitest, under `v2/src/lib/`, with fake-indexeddb where the existing tests do.

- A member export with `release: "draft"` has no `promotion_recommendation`, no `summary_group_average`, and no `summary_group_distribution`. The trait average is still present.
- A `release: "review"` export strips the same three fields.
- A `release: "debrief"` export keeps all three, and the average and the distribution match the frozen group release.
- Two members of one closed group receive the same average and the same five counts.
- Close is refused when a member has no promotion mark.
- Import with a different `addressed_to` throws and leaves the local row unchanged.
- Import of `release: "debrief"` into a reviewer workspace is refused.
- A member workspace that calls the live-pool function does not read another report. The test fixture puts a second report in the database and asserts it is ignored.
- A PDF built from a draft report does not receive a computed average or distribution from a peer row.
- A debrief PDF prints the frozen average and the five counts.
- NOB stays out of the counts and out of the average, using the existing tally tests as the pattern.

Browser check on `http://127.0.0.1:5174/` after the screens change: a member workspace's step 4 shows the sailor's trait average and does not show the summary group average, the breakdown, or a promotion mark. After importing a debrief file, those three appear. Desktop 1400×900 and a 390×844 check of the same screen.

## 12. Boundaries

Always:

- Leave peer reports out of member and reviewer files. Hiding a row in the list is not the boundary.
- Use the existing average and tally functions. Do not invent a rank position.
- Keep EVAL Block 45 as the promotion mark. Do not put the average there.
- Strip ranking fields on every non-debrief export.
- Show a partial pool only in the command workspace, with the number of reports in it.

Ask first:

- Letting a reviewer see the frozen or live average.
- Encrypting the report file.
- Adding accounts or a server.
- Any schema change to the hosted Supabase project.

Never:

- Write the 382.4 / 98 placeholder onto a report.
- Restore SharePoint list sync.
- Put the command workspace file in the Outlook draft.
- Treat a self-selected role as permission to read another sailor's report.
- Show the sailor a promotion mark that was only a seed default.
- Claim the workspace file or the report file is encrypted.

## 13. Success criteria

- A sailor who holds only their member workspace cannot open another sailor's grades, comments, promotion mark, or the group average, because those bytes are not in the file.
- Before debrief, the sailor's editor, export, and PDF contain their own trait average and do not contain the promotion mark, the breakdown, or the summary group average.
- After the group is closed, each debrief file shows that sailor's mark, the same five counts, and the same average, and still no other sailor's report.
- A report file addressed to one workspace is refused by another.
- The command workspace can still compute the live pool and assign marks before close.

## 14. Decisions on the open questions

1. Reviewers do not see the group average or the five counts. Calibration stays in the command workspace. Attaching those two numbers to a review file is a later change, not this build.
2. A rater who rates several sailors uses one reviewer workspace and receives one report file per sailor.
