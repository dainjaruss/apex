# APEX — Record Readiness epic: handoff

Written at the close of a 25-PR epic (#22–#46). Read `RESUME.md` beside this for the terse
state table; this file is the reasoning, the traps, and how to keep going.

---

## 1. What this was

The founder's complaint, verbatim: the record review *"isn't very useful"*, the LaDR
*"does not really give the users any true meaning as to how ready their record is"*, the app should
*"lean heavily on AI features"* which were *"currently not implemented"*, and the whole thing was
*"a Grok AI implementation which is half baked"*.

The audience is Navy leadership who write and read these reports for a living. That single fact set
the priority order for the entire epic: **a confidently wrong domain claim is fatal here in a way a
missing feature is not.** Everything below follows from it.

---

## 2. The root cause, and why it was not what it looked like

`lib/boardConfidence/rubric.ts` summed `contribution = (weight/100)·S·conf` against a **fixed
denominator of 100**, never `Σ(weight·conf)`. So `conf=0` ("APEX has no data") was numerically
identical to `S=0, conf=1` ("the record is weak").

Measured on the original code:

| record | score | band |
|---|---|---|
| 6× Early Promote, empty tabs | 45.0 | "Not competitive" |
| 5× Promotable, fully entered | 57.2 | "Crunch" |
| empty record | 1.0 | "Drop-from-consideration risk" |

The strong record scored *below* the mediocre one because it had entered less. That is the whole
complaint in three rows.

**But fixing the arithmetic was not sufficient, and this is the part worth internalising.** Once the
composite became a confidence-weighted mean, absence became *symmetric* — deleting a weak section
could now **raise** the score. Blanking the tours section was worth +17.8 points and cleared the
coverage floor. That is the same defect with the sign flipped.

The invariant I first wrote was unsatisfiable, and a builder proved it in two lines: *"absence must
never lower"* is `f(D') ≥ f(D)`, *"absence must never raise"* is `f(D') ≤ f(D)`, and both together
force a function that ignores its input. **The correct invariant is about gating, not monotonicity:
don't score what you can't see.** `AREA_EVIDENCE_FLOOR` at 0.50 is that gate.

Even then it does not fully close. The gate reads **factors**; the exploit removes **sub-components**.
Any floor in (0.30, 0.70] splits leadership's two sections; past 0.70 it rejects an unlinked summary
group. And `rsca` was gainable by +12.20 points with **no confidence change at all** — which proves
no threshold on `conf` can ever be the mechanism. `rsca` was therefore deleted from scoring.

**Where it ended:** the composite is 72.7% performance + 27.3% leadership and renders nowhere.
`development`, `completeness` and `continuity` are computed and shown but contribute 0. The honest
description, which is in the PR: *the product is coverage plus the ranked plan; the 0–100 number is
a residue that needed to stop lying, not the part that helps.*

---

## 3. The doctrine problem was larger than the scoring problem

APEX shipped Navy claims that the governing instruction contradicts. Confirmed and retired:

- **"Enlisted boards vote slates"** in the disclaimer. PERS-803's brief says records are briefed and
  voted **individually** — and the spec cited that very document as "Verified".
- **The continuity advisory** said any gap can disqualify. BUPERSINST 1610.10H **para 17-6** says
  verbatim that missing reports *"do not disqualify"*, and supplies remedies (17-6a PERS-32
  duplicate, 17-6b letter in lieu) that APEX withheld.
- **The CHIEFEVAL trait table** was five invented traits with invented 1.0/3.0/5.0 anchors. The real
  form prints seven and **no anchor columns at all**.
- **`tactical_performance`'s anchors** — the one entry in the codebase that was supposedly
  officer-specific — appear nowhere on any of the three forms.
- **"18 lines"** comment capacity, wrong on all three forms, while `bupersGuidelines.json` had held
  the right number for a month and a spec had logged the conflict and **resolved it in favour of the
  unmeasured value**.

### Source precedence — this is the rule that mattered most

1. **The blank forms in `public/`.** They outrank the instruction, the research doc, and any brief.
   The fabricated CHIEFEVAL table survived every prior review because nobody opened the PDF already
   sitting in the repo.
2. **The live BUPERSINST 1610.10H** from MyNavyHR. CH-2's transmittal revises **chapter 3 only** —
   verified from the transmittal text, not inferred.
3. `docs/navy-reference.md` — research output, not scripture. **§9 is explicitly unverified and must
   never be cited.**

Corollary learned the hard way: on p. 1-7 the block *header* reads `BILLET SUBCATEGORY (IF ANY)`
while the *body* says `"Do not leave blank."` **The body wins.** A builder over-read the header and
shipped a group nothing could join.

---

## 4. What shipped

Grouped by theme rather than listed by number.

**Security (demo-blocking, live on hosted).** Any authenticated user could read every DoD ID; any
Sailor could set their own `preferred_role` and sign their own Block 50. Migration **009** revoked
table-level UPDATE (a column revoke alone is a no-op while the table grant stands — measured),
hard-coded `'Sailor'` in the signup trigger, pinned `search_path` on five SECURITY DEFINER
functions, and narrowed SELECT to own-row with a four-column `profiles_directory` view. The trailing
`offset 0` in that view is **load-bearing** — it makes the view non-auto-updatable permanently.

**The readiness screen.** Coverage first, then a ranked plan. Missing data renders as "Not entered"
with a one-click remedy, never as a failing. Completeness is no longer graded at all — it joins
`coverage.missing` instead, because the banner directly above promises *"Nothing below is a grade on
what you have not entered."*

**Two AI features that had never run.** `resolveAiModel` returned null on every run in the repo's
history — both features had only ever used keyless fallbacks. The eval coach reads a Block 43
narrative against the printed trait standards and says which sentence carries which trait; it is
forbidden by schema from generating a grade or Block 45. Brag Sheet autofill was rejected outright
by the provider (compiled grammar too large — seven inlined copies of the block schema) and, once
that was fixed, still failed 100% of the time on a 60 s timeout against a 120–143 s generation.

**Every trait table and capacity now matches its printed form** — in code, in `form_definitions`, in
stored grades, in the PDF overlays, and in the descriptor prose.

**The PDF overlays were never measured.** `fitrepOverlay.ts` and `chiefEvalOverlay.ts` shipped
byte-identical coordinate blocks across 77 lines — two different NAVPERS forms sharing one grid.
Consequences: every CHIEFEVAL printed **no grades at all** (1616/27 has no checkbox grid; grades are
numerals typed into cells pre-printed `0.0`), and every FITREP printed its comments **14.38 pt out in
the page margin**. Root cause: `pdfOverlay.ts` wraps the EVAL in a page `translate(13, -11)`, and the
other two files **import `pushGraphicsState`/`translate` and never call either**.

**Summary-group eligibility.** Three of nine Table 1-4 discriminators referenced columns the schema
did not have, so ~a third of the rules never executed. They failed *open*, which is why nobody
noticed. Migration **012** adds them — and widens a unique constraint that made a second group
differing only by Block 5 **impossible to create**, which would have deadlocked the new guards.

---

## 5. Hosted state and how to reproduce it

Supabase project `xbnwxiziqhcaxvztewqe`. Migrations 001–013 applied.

```
57 evaluations   47 seeded (deterministic v8 UUIDs) + 10 human-created, preserved
10 summary groups   all carrying real Block 5 / Block 21 values
184 LaDR milestones   80 with verbatim notes + tier
 0 board_precepts   deliberately
```

**`board_precepts` must stay 0.** `scripts/ladr-data/precept_fy27.ts` was a *modeled* precept with
`active: true` and `source_url: null`. Seeding it activates three fabricated emphasis flags — and the
readiness engine excludes an unsourced precept precisely so it stops contributing a full-confidence
zero. The seed coupling was removed; do not restore it.

**Seeds are idempotent now.** Identity is a deterministic v8 UUID hashed from
`(member_name, report_type, period_from, period_to)`; `gen_random_uuid()` only emits v4, so **the id
is the marker** — no `seed_key` column. Custody (`routing_stage`, `status`, `current_holder_id`) is
deliberately **excluded** from the key, which is what makes a re-seed *repair* a wrecked record
rather than insert a corrected twin beside it. The trade: in-progress demo state is silently
reverted by a re-seed.

**Order matters on deploy:** apply the migration **then** deploy the app. PostgREST returns
`PGRST204`/400 for unknown columns; the reverse order is safe.

---

## 6. Open work, ranked, with pointers

> **Updated 2026-08-14.** Items 1-3 of the original list shipped as #45/#48/#49/#50 — see §11 for
> what those were and what they cost. Renumbered against current `main` (`53db7a7`).

1. **CHIEFEVAL page 1 has no geometry test.** The last of the three forms with none. It shares
   `mark()` and the same pre-translate constant lineage as 1616/26 and 1610/2 — *both of which
   turned out to carry the identical two defects once a sweep existed*. Port
   `tests/unit/evalOverlayGeometry.test.ts`; the 1616/27 blank is `public/chiefEvalBlank.pdf`.
   Expect it to find something. Note 1616/27 **does** print Block 19 "Ops Cdr" (1616/26 does not),
   so the type row is four squares here, not three.
2. **FITREP page 2 — six frame-ledger entries remain**, and the whole signature-date row prints
   below the bottom rule, off the form. Page 1's half of that ledger in
   `tests/unit/fitrepTraitTable.test.ts` is now empty; page 2's is not.
3. **SGA is pooled from other users' self-entered evals without excluding the subject's own row**
   (`lib/boardConfidence/service.ts:206` — `.eq("summary_group_id", groupId)` and nothing else).
   +18.9 for a group of one; +25.4 with one stacked peer, at full coverage. It is the **sole**
   comparator since `rsca` was deleted. Re-verified still live on 2026-08-14.
4. **Block 12's UI label is not per-form.** `Block1Name.tsx:368` shows "12: Promotion/Frocking" on a
   FITREP and `DetailsTab.tsx:68` summarises it, but 1610/2 and 1616/27 print "Detachment of
   Reporting Senior" there — which is why `fitrepOverlay` correctly refuses to stamp it. The PDF is
   right and the screen is wrong.
5. **Brag Sheet Block 41's applied `entries` never pass the gate** (`lib/bragSheet/autofill.ts:801`),
   while the new ghost rows make that card *look* gated.
6. **Advisory withholding cause unresolved between two honest measurements** — one fixture provokes
   bare container roots, another placeholder rationales (12 of 36 runs). Both published. Grammar
   deliberately not widened without evidence of the cost.
7. **EVAL/CHIEFEVAL descriptor *prose* has no form-reading test.** That is *how* its typos came to
   be silently normalised — mutants on those tables survive the whole suite. Note #50 added a
   *geometry* sweep for 1616/26; the descriptor-text gap is separate and still open.
8. **Three copies of the form-id list have drifted**: `resolveReportType`, `Block42Signatures`,
   `EvaluationForm`.
9. **CI never runs a11y** (`verify.yml` has one step). The `style` attribute is on the guard's
   denylist and is genuinely perceivable — a suppressed score can render as a bar width. Generated
   PDFs are untagged, so assistive tech reads `0.0` then `4.0` per trait.
10. ~38 remaining `docs/navy-reference.md` §8 items.

### Carried forward from #50's review — disclosed, not fixed

- **Trait rows 2-5 of 1616/26 (24 checkbox squares) are unpinned.** The fixture grades one trait, so
  only row 1 can receive a mark. Rows 2-5 were verified correct by hand against the scan; nothing in
  the suite would notice if they drifted.
- **`text()` has no minimum size floor** (`lib/pdfOverlay.ts`), unlike `narrative()` which clamps at
  5. Block 22 has no `maxLength` in `Block1Admin.tsx`, so a 40-char name renders near 5.8 pt with
  nothing telling the user it shrank. Strictly better than the overflow it replaced; the fix belongs
  on the input, not the renderer.
- **Demo-verify, never eyeballed at print scale:** legibility of a Block 22 name shrunk to ~8.6 pt
  beside its 12 pt neighbours, and X-mark clearance against the printed box rules. The suite cannot
  see either. Do these before the demo, not before a merge.

---

## 7. Gotchas

**Environment**

- `curl` gets **403** from `mynavyhr.navy.mil`; **undici** with the `BROWSER_HEADERS` in
  `lib/preceptFetch.ts` gets 200. Probing a lookalike client produced one confident wrong root cause.
- `npm run a11y` starts its own dev server on a **path-derived port**. It used to default to 3099
  with `reuseExistingServer`, so a run in one worktree scanned *another worktree's app* — measured:
  26 tests "passing" against a different branch's build.
- The authenticated a11y suite needs `tests/fixtures/e2e-ids.json`, which is **gitignored**. It used
  to skip silently and report green; it now throws with remediation (`A11Y_SKIP_AUTH=1` to opt out).
- `next dev` will serve a **stale `.next`** after `npm run verify`. Two builders scanned the
  pre-change component without noticing.
- `gh pr edit --body` fails on this repo (deprecated projects-classic GraphQL field).
  `gh api -X PATCH repos/.../pulls/N` works.
- The Anthropic key in `.env.local` has a **credit balance** separate from the session limit. One
  reviewer got 25 of 40 live calls before exhaustion.

**Migrations**

- **Never re-run `003_form_types.sql`.** Its upsert replaces the entire `blocks` payload for
  CHIEFEVAL and separately updates FITREP — both rows that 010 and 011 have since corrected. A replay
  silently reverts both.
- `create or replace function` **resets `proconfig`**, so replaying 002/004/006 strips the
  `search_path` pins from 009. 009 is idempotent; re-run it after any out-of-band replay.
- Migration numbers are a **namespace**. Two parallel PRs both claimed `012`; disjoint *files* does
  not mean disjoint *numbers*.
- `NULLS NOT DISTINCT` is PG15+. Un-wrapped in a transaction on an older server, the file drops the
  old constraint, fails, and leaves the table with **no uniqueness constraint at all**.

**Tooling**

- Vitest cannot import the seed scripts (they build a client and run `main()` at module scope). The
  established idiom is to read the script **as text** — see `boardConfidenceService.test.ts:715`.
  Assert the **positive** form; a negative assertion is satisfied by a comment mentioning the string.
- `TEST_SCOPE=all` is required for suites in `RESERVED_AFTER_WEEK5`; plain `npm test` skips them.
- pdf-lib output is **non-deterministic run to run** — a PDF-hash equivalence check is misleading.
  Diff the drawn runs instead.

---

## 8. How the workforce ran

Ported from `/srv/paari`. The structural pieces, in order of how much they mattered:

1. **Reviewers hold no Write or Edit tools.** Nothing can approve its own work. This is enforced by
   the agent definitions in `.claude/agents/`, not by convention.
2. **Adversarial verifiers are told to *refute*, not confirm.** On one PR, **9 of 10** findings were
   refuted — almost all because the symptom was real but belonged to `main` or a sibling PR, not the
   branch under review. Without that pass, builders would have been sent to fix code they didn't own.
3. **Worktree isolation** (`/srv/apex-x-*`), one branch per thread. Watch for cross-worktree leakage
   anyway: a stray `node_modules/node_modules` symlink from another agent's process broke 19 tests in
   an unrelated tree.
4. **The orchestrator merges; builders and reviewers do not.**

Typical cycle: brief → build → independent review → fix round → confirmation → merge. Nearly every
round found something real. Several PRs went four or five rounds and each round earned its cost.

**Brief the reviewer with what the *builder* claimed**, and ask them to verify rather than re-derive
from scratch. Name the sibling PRs in flight and what they own — that alone would have prevented most
of the refuted findings.

---

## 9. The failure patterns

These recur. Expect them.

**A plausible sentence nobody re-checked.** A comment asserting a `translate()` that is imported and
never called misled three separate rounds — including once as a reason something *didn't* need
fixing. A spec logged a documented conflict and resolved it in favour of the unmeasured number.

**Thirteen vacuous tests.** A doctrine pin slicing from the first match to end-of-file, so it
validated the wrong record and stayed green through the entire life of the bug. A geometry suite
drawing only the letter `X`, so no descender reached the renderer and a **negative** margin reported
as +0.12. An assertion satisfied by a comment in the file it was reading. Another satisfied by static
template text before any value was interpolated. A tautology guarding the deletion of a safety gate.
A sentinel satisfied by the probe alphabet — in the very suite whose header named the previous one.

**Rules that did no work.** `isEvidenceLeaf` rejected numbers to block `.length` — already blocked one
level up by the own-enumerable walk. It only ever refused the Sailor's own data: harmless under
`some()`, catastrophic under `every()` (26–40% of generated content deleted).

**A mutation pin defending a defect.** `rec_cpl: 14` truncated career recommendations on a signed
evaluation because it was the only caller where `min(12, …)` bound, and two assertions cemented it.

**Fail-open guards produce no symptom.** Three dead eligibility discriminators, a Block 6 UIC guard
that shipped as a feature, `combinedMax` set only for E-5/E-6 so six of nine bands went unchecked.
None of these produced a wrong answer — only a missing one.

---

## 10. Rules that earned their place

- **Probe the shipped function**, not a lookalike. `curl` is evidence about `curl`.
- **Check the file on `main`, not in a worktree.** I reported a defect from a branch predating the
  whole epic.
- **Read the exit code of the thing you cite, and make sure it checks what you claim.** One agent
  reported "verify passed" from a `vitest` run, which does not typecheck; CI was red on a
  `Cannot find name` error.
- **Verify finding *attribution* before acting on it.** Ask "does this reproduce on `main`?" first.
- **Measure before fixing.** The one-word change requested for the autofill gate would have deleted a
  quarter of a Sailor's record.
- **Re-run the mutation campaign *after* the fix.** Before tells you what the old code pinned; after
  tells you whether your fix turned an assertion into a tautology. Three vacuous tests were caught
  this way, each by the builder who had just written them.
- **A mutation harness can lie.** One reported six false survivors from a kill-detection bug, caught
  by reproducing a mutant by hand.
- **Don't write down a number you didn't measure yourself.** Across three rounds on one PR, every
  wrong figure was one the builder generated rather than measured against the other engine. The
  single figure that survived four reviews unchanged was the one measured both ways and scoped to
  where it holds.
- **"I could not verify this" is a required answer** when it is the true one. An unverifiable claim
  marked verified is worse than an unmarked one.

---

## 11. Session log — 2026-08-14

**`main` is `53db7a7`. `npm run verify` green: 64 files, 1134 passed | 1 skipped, build clean.**
Verified on `main` after the merge, not assumed from the branch.

### Merged this session

| PR | What |
|----|------|
| #48 | 1610/2 page 1 — the missing offset. Not twenty wrong constants: **one missing translate**. `pdfOverlay` draws the EVAL inside `translate(13, −11)`; `fitrepOverlay` copied its constants and dropped it. Proven blank-to-blank: all seventeen page-1 rules differ by exactly +11.040, all seven verticals by +2.040. |
| #49 | Citation gate now checks the **subject** of an item's prose, not just the path it cites. Model emits `subject` as a structured field. |
| #50 | 1616/26 page 1 — the same two defects, on the form that originated them. Block 16 "Not Observed" drew 12.2 pt above its square (box printed **empty**); Blocks 22-27 had no column width, so a long RS name ran through Block 23 into Block 24. First geometry test this form has ever had. |

### PR #47 is still open

`chore/resume-final`, worktree `/srv/apex-flake`. Now also carries the v2 epic's binding-rules
revision, which had been sitting **uncommitted in a worktree, on no branch, in no PR** and existed
nowhere else — recovered before that worktree was deleted. One claim in it was stale (the
`LadrChecklist.tsx` "stored and invisible" note, closed by #31) and is marked rather than restated.

### /srv worktrees

25 of 26 `apex-*` worktrees removed (~24 GB). All were merged; verified by each PR's squash commit
being an ancestor of `main`, **not** by `git`'s ahead/behind, which is meaningless under squash
merges. Branches survive worktree removal — `git worktree add` recreates any of them.
`/srv/apex-flake` kept for #47.

### What the review chain caught on #50, and why it matters

The geometry was right on the first pass; both reviewers re-measured the blank and confirmed every
coordinate. **Three rounds were spent on the claims wrapped around it** — the class `tsc` and the
suite cannot see:

1. **Invented doctrine.** "Block 19 Ops Cdr is new in the REV 05-2025 forms" is unsourceable
   revision history — and all three blanks in `public/` *are* REV 05-2025, so this repo structurally
   cannot source it. Chasing it exposed **three in-repo comments about Block 19 that contradicted
   each other**, two wrong. Settled on the blanks' text layers: 1610/2 yes, 1616/27 yes, 1616/26 no.
2. **A self-graded mutation score.** The builder reported 11 of 11 killed; an independent 21-mutant
   set had **14 survive**. Self-scored mutation testing measures nothing — you write the mutants
   your test is already shaped to catch.
3. **The correction to the correction.** The follow-up comment claimed `rsWidths[2][3][4][5]` all
   survive; running them showed `[1]` survives (omitted) and `[3]` is killed (listed as alive).
   Cause: conflating *reachable by a real submission* with *pinned by the sweep*. Different axes.

The gatekeeper's own first re-run reported all six mutants surviving — its harness was line-anchored
and the comment had grown, so it edited a comment and mutated nothing. It caught that itself. **A
silently-failing mutation harness reports a perfect survivor set**, which is the same failure that
produced the 11/11.

Verdicts are posted as PR comments on #50, not left as builder prose — the gatekeeper refused to
count an unposted verdict as an audit trail.
