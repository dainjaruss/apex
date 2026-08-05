# Resume state — epic complete

**25 PRs merged (#22–#46). `main` verifies green: 63 files, 1110 tests, build clean.**
Four migrations applied to hosted and verified. Seeds converge instead of accumulating.

## What the founding complaint asked for, and where it landed

| Ask | State |
|---|---|
| "the review isn't very useful" | The 0–100 composite renders nowhere. Its arithmetic no longer scores self-attestation or roadmap completion as readiness. Coverage plus the ranked plan is the product. |
| "the LaDR gives no true meaning" | 184 milestones live on hosted, 80 with verbatim `notes` and `tier`. Fully Qualified renders before Best Qualified with the additive relationship in the source's own words. |
| "lean heavily on AI features" | Two shipped and working, neither of which functioned before: the Block 43 eval coach, and Brag Sheet autofill. Both bounded by what they can substantiate. |

## Hosted database

Migrations **009** (role escalation + DoD-ID exposure), **010** (CHIEFEVAL trait table),
**011** (FITREP trait table), **012** (summary-group discriminators), **013** (nullable score).

- 57 evaluations: 47 seeded (deterministic v8 UUIDs), 10 human-created and preserved.
- 10 summary groups, all carrying real Block 5 / Block 21 values. Zero stale.
- 184 LaDR milestones. `board_precepts` deliberately **0** — the seed split keeps the modeled
  precept out, which is what makes the readiness fix hold.

## Doctrine: every trait table now matches its printed form

CHIEFEVAL (1616/27) and FITREP (1610/2) corrected in code, in `form_definitions`, in stored
grades, in the PDF overlays, and in the descriptor prose. Comment capacity is measured per form
and per pitch (EVAL 17/14, CHIEFEVAL 8/6, FITREP 19/16 — the labels were inverted; 10-pitch is
12-point for a 0.6-em font). The pitch selector no longer offers a setting the form forbids.

**Fabrications found and retired:** the "vote slates" disclaimer; the inverted para 17-6 continuity
advisory; the five-trait CHIEFEVAL table; the `tactical_performance` anchors — the one entry that
was supposedly officer-specific; and the "18 lines" capacity that `bupersGuidelines.json` had
contradicted for a month.

## Open, ranked

1. **FITREP blocks 28/29 still print on top of the wrong boxes.** A vertical move needs `FIELD_FIT`,
   the validator, the coach budget and the brag budget to move together (`maxLines: 3` vs
   `b28_lines: 4`). Deferring is right; a half-move drops a line the editor promised.
2. **13 runs from 8 x-positions still print outside the FITREP frame**, each wrong on both axes
   (wrong cell, not a margin) so none is a constant swap. Pinned by a frame-sweep ledger — a new
   violation fails the build.
3. **The citation gate checks the path an item cites, never the subject its prose is about.**
   4 of 11 constructed contradictions still pass. Upgrade path: have the model emit the subject
   area as a structured field.
4. **Brag Sheet Block 41's applied `entries` never pass the gate at all**, while the new ghost rows
   make that card look gated.
5. **The advisory-withholding cause is unresolved between two honest measurements** — one fixture
   provokes bare container roots, another provokes placeholder rationales (12 of 36 runs). Both
   numbers published; grammar deliberately not widened without evidence of the cost.
6. **EVAL/CHIEFEVAL descriptor prose has no form-reading test**, which is how its typos came to be
   silently normalised. The real payload of that follow-up is the missing 1616/26 pin.
7. **Three copies of the form-id list have drifted** (`resolveReportType`, `Block42Signatures`,
   `EvaluationForm`).
8. CI never runs a11y. The `style` attribute is denied by the guard and is genuinely perceivable —
   a score can render as a bar width. Generated PDFs are untagged, so AT reads `0.0` then `4.0`.
9. **SGA is pooled from other users' self-entered evals without excluding the subject's own row**
   (+25.4 at full coverage), and is now the sole comparator since RSCA was deleted.
10. ~38 remaining `docs/navy-reference.md` §8 items.

## What this codebase's defects actually look like

**A plausible sentence nobody re-checked.** A comment asserting a `translate()` that is imported and
never called misled three separate rounds. A spec resolved a documented conflict *in favour of the
unmeasured number*. `bupersGuidelines.json` held the right capacity for a month while the code used
the wrong one.

**Thirteen vacuous tests.** A doctrine pin slicing to end-of-file and validating the wrong record.
A geometry suite drawing only the letter `X`, so no descender reached the renderer and a negative
margin reported as positive. An assertion satisfied by a comment in the file it was reading. Another
satisfied by static template text before any value was interpolated. A tautology guarding the
deletion of a safety gate. A sentinel satisfied by the probe alphabet, in the very suite whose
header named the previous one.

**Rules that did no work.** `isEvidenceLeaf` rejected numbers to block `.length` — already blocked
one level up. It only refused the Sailor's own data: harmless under `some()`, catastrophic under
`every()` (26–40% of generated content deleted).

**A mutation pin defending a defect.** `rec_cpl: 14` truncated career recommendations because it was
the only caller where `min(12, …)` bound, and two assertions cemented it.

## Rules that earned their place

- **Probe the shipped function.** `curl` 403s where undici succeeds.
- **Check the file on `main`, not a worktree.** Read the **exit code** of the thing you cite, and
  make sure it checks what you claim — one agent reported green from `vitest` alone, which does not
  typecheck.
- **Verify finding *attribution*.** 9 of 10 adversarially-checked findings on one PR were refuted:
  real symptom, wrong owner.
- **Measure before fixing.** The one-word fix requested for the autofill gate would have deleted a
  quarter of a Sailor's record.
- **Re-run mutation *after* the fix.** That is how the eleventh, twelfth and thirteenth vacuous tests
  were caught — each by the builder who had just written them.
- **Don't write down a number you didn't measure yourself.** The figure that survived four reviews
  unchanged was the only one measured against the other engine rather than generated alongside it.
- **A mutation harness can lie.** One reported six false survivors from a kill-detection bug; caught
  by reproducing a mutant by hand.
