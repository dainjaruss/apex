# Block 43 Narrative Coach

**Status:** v1 · `POST /api/eval-coach` · `lib/evalCoach/coach.ts` · UI lives in
`components/blocks/Block43Comments.tsx`

The coach answers exactly one question, once per graded trait:

> **Does this narrative substantiate the trait grade it accompanies?**

It is the first AI surface on the screen where Sailors actually write. Before it, a Sailor
composing Block 43 got a line counter (`line 19 of 18`) and nothing else.

---

## 1. What it is not

| | |
|---|---|
| **It never produces a trait grade.** | Not a number, not a direction, not "this reads like a 5.0". The grades are the human's and are already set. |
| **It never writes or proposes Block 45.** | Or 46, or any other block. Block 43 only. |
| **It never writes the narrative for you.** | Suggestions name *what is missing* (the metric, the scope, the outcome). Drafting is `POST /api/brag-sheet/autofill`'s job, not this one. |
| **It never stores anything.** | See §5. |
| **It never blocks you.** | An unconfigured or failing model hides or reports itself; the field keeps working exactly as it did before. |

---

## 2. Inputs

The route takes the draft the user is **currently typing**. `components/EvaluationForm.tsx`
autosaves to `localStorage`, not to the database, so the live narrative does not exist
server-side and cannot be read from a row.

```jsonc
POST /api/eval-coach
{
  "report_type": "EVAL" | "CHIEFEVAL" | "FITREP",
  "pitch": "10" | "12",
  "comments": "…",                     // ≤ 5000 chars
  "trait_grades": { "knowledge": "4.0", … },
  "consent": true                      // required; see §5
}
```

Everything else is derived **server-side** from that, so none of it can be spoofed by the
caller and none of it is a second copy of a rule that already lives in the repo:

| Payload field | Source | Note |
|---|---|---|
| `traits[].anchors` **or** `.standards` | `lib/traitStandards.ts` (`TRAIT_STANDARDS_LOOKUP`) | EVAL/FITREP print per-grade anchor columns; CHIEFEVAL prints one bullet list and no columns (#26). Exactly one shape per trait; a trait with neither is skipped rather than judged against an invented yardstick |
| `traits[].title`, `.definition` | `lib/traitStandards.ts` | |
| `traits[].block` | `lib/validationEngine.ts` (`getTraitMap`) | **not** the merged lookup — see below |
| `traits[].grade_meaning` | `lib/traitStandards.ts` (`GRADE_SCALE_NOTE`) | |
| `substantiation_note` | `lib/traitStandards.ts` (`getSubstantiationNote`) | per report type |
| `budget` | `lib/commentFit.ts` (`checkCommentFit`) | see the warning below |
| `issues` | `lib/validationEngine.ts` (`runFullValidation`) | read-only |
| `sentences` | `splitSentences(comments)` | `[{ id, text }]` — explicit ids, never positional |

**Trait resolution is deliberately shallow.** Traits are looked up by the draft's own grade
keys; a key the standards table does not know is **skipped, never guessed at**. The CHIEFEVAL
trait-key rename (#26) therefore degraded to "that trait is not coached" instead of emitting
anchors from the wrong trait. NOB traits are skipped — an unobserved trait has nothing to
substantiate.

**Block numbers come from `getTraitMap(report_type)`, not from `TRAIT_STANDARDS_LOOKUP`.**
That lookup flattens all three forms into one record, so its `block` field collides wherever
the forms disagree: on FITREP it reports Block 39 for both `leadership` (really 38) and
`tactical_performance`, which rendered two cards headed "39" on the same screen. `getTraitMap`
is the only report-type-aware trait→block mapping in the repo; anything printing a block
number beside a trait must resolve it there.

**The rules engine is the rule authority.** `narrativeIssues()` runs `runFullValidation` over
a stub carrying only the narrative, the grades and the pitch, then keeps only the findings
whose field is `comments` or `trait_grades.*` — so the Block 43 substantiation rule reaching
the model is *the shipped rule*, not a paraphrase of it maintained here.

> ⚠️ **`budget` is a measurement, not a citation.** The line-count / 90-CPL / 84-CPL geometry
> is APEX-measured from the printed form; those figures appear nowhere in BUPERSINST 1610.10H.
> The system prompt says so explicitly and forbids attributing them to any publication. Do
> not "fix" this by adding an instruction citation.
>
> ⚠️ **`budget.max_lines` is per form.** 17 on an EVAL at 10-pitch, **8** on a CHIEFEVAL, 19
> on a FITREP (`getCommentCapacity`). It used to be a flat 18 for every report type, which
> meant the coach — a feature whose entire value is that it understands the form — was
> telling a Chief to fill ten lines of NAVPERS 1616/27 that do not exist on the printed page.
> Never reintroduce a constant here.

---

## 3. Output contract

```jsonc
200 {
  "findings": [
    {
      "trait": "knowledge",              // a key from the payload's traits
      "block": 33,
      "title": "Professional Knowledge",
      "grade": "4.0",                    // echoed from the human's draft, never generated
      "verdict": "substantiated" | "partial" | "unsupported",
      "evidence": "…" | null,            // the Sailor's OWN sentence, resolved by id
      "rationale": "…",                  // citation-checked, citation stripped
      "suggestion": "…" | null           // null when it failed a gate
    }
  ],
  "notes": ["…"],                        // narrative-level, same gates
  "unassessed": [                        // every graded trait with no finding — never silent
    { "trait": "teamwork", "block": 38, "title": "Teamwork", "grade": "4.0" }
  ],
  "dropped": 0,                          // items the gates removed — surfaced, never hidden
  "model": "claude-opus-5",
  "budget": { "chars_per_line": 90, "max_lines": 17, "lines_used": 8, "fits": true }
}
```

Failure modes, all soft:

| Status | When | UI |
|---|---|---|
| `503` | server has no model configured | the whole coach surface is hidden (`GET` probe) |
| `502` | model errored or returned unparseable output | one muted line; the narrative is untouched |
| `429` | more than 2 concurrent runs in this process | same |
| `400` | bad body, `consent` missing/false, or a trait-grade value over 8 chars | same |
| `401` | not signed in | same |

`200` with `findings: []` and one note is the deterministic answer when the narrative is
empty or no trait is graded — no model call is made at all.

---

## 4. The invariant, and where it is enforced

> **The coach never generates or suggests a trait grade, and never writes Block 45.**

The prompt says so. The prompt is not the enforcement. Three mechanisms are — and they are
**not equally strong**, so read the strength claims literally:

1. **Schema — absolute.** `CoachOutputSchema` has no field a grade or a promotion
   recommendation can travel in, and Zod's default strip semantics discard
   `suggested_grade`, `trait_grades`, `block_45`, `promotion_recommendation` and anything
   else the model volunteers — unread. This closes the **field** form of both halves
   completely.
2. **Prose guard — pattern-matching, not a proof.** A schema cannot see "this reads like a
   5.0" inside a rationale *string*, so `suggestsGradeOrRecommendation()` deletes free text
   that recommends a grade ("should be a 3.0", "consider a 5.0", "raise the mark") or strays
   into Block 45 (any mention of the block, "promotion recommendation", "PROMOTE AHEAD OF
   PEERS", the category names). A rationale that trips it drops the whole finding; a
   suggestion that trips it is nulled. It stays narrow deliberately — *mentioning* a grade is
   the point of the feature ("the 5.0 you set in Block 39 is not substantiated" must
   survive), and a Sailor's own 2.0 is labelled "Progressing" on the printed scale.
   **It matches known phrasings; it cannot prove the absence of grade or promotion advice in
   free text.** An unanticipated construction reaches the user. It is a backstop over a
   prompt that refuses these requests — adversarial probing (instruction injection,
   questions, fake-JSON, a words-not-numbers end-run, a direct Block 45 request) was refused
   at the prompt layer in every trial, twice explicitly.
   *Do not restate this mechanism as a guarantee.* Until this was corrected, the module
   header, this section and a test title all claimed "enforced in three places" for a Block
   45 half that had **no prose guard at all** — only the schema, which never sees free text.
3. **Evidence is never model text — absolute.** The model returns a **sentence id**; the
   server substitutes the Sailor's own sentence. A quotation cannot be fabricated because the
   model never supplies one.

### Citation-or-delete

Ported from `lib/boardConfidence/narrative.ts`. Every `rationale`, `suggestion` and note must
**end** with a bracket group of payload paths — `sentences.<id>`, `traits.<key>`,
`issues.<i>`, `budget`, `substantiation_note` — and **every** path in it must resolve or the
item is deleted. Two properties are deliberate, and both are load-bearing:

- **Only the trailing group counts.** Navy prose carries bracketed NEC/CIN codes
  (`Information Systems Technician [NEC 742A]`); a global strip would eat them.
- **Every path must resolve.** One valid citation must not launder a fabricated claim beside
  it (`"…and won three awards. [sentences.0, awards.fabricated]"` → deleted).

A finding is also dropped when its trait is not one of the graded traits (no inventing
traits), when it is a duplicate of a trait already reported, or when it claims
`substantiated` while pointing at no sentence. `dropped` reports the count to the user.

### Sentence ids are published, never implied

`sentences` is `[{ id, text }]`, not a bare string array. It was a bare array once, with the
prompt saying "the index is the id" — and across 31 live runs the model renumbered from 1
about half the time, citing `sentences.5` against a 5-sentence narrative. Every such citation
failed to resolve, the gate deleted the whole finding, and **1–2 of 3 traits vanished from the
panel with nothing saying they had been suppressed.** The same responses got the separate
`evidence_sentence` integer right, 0-based, every time: the model reads an explicit number
reliably and guesses at an implicit one. State the id.

### Nothing graded goes unaccounted for

`applyCoachGate` reconciles findings against `payload.traits` and returns `unassessed` for
every graded trait the model skipped or the gates dropped. The panel renders those as **"Not
assessed this run — no conclusion either way"**. Without it, a panel showing two cards where
three traits were graded reads as "the third one is fine", which is the one thing a
substantiation check must never imply.

---

## 5. Privacy posture

**Nothing is persisted. By construction, not by policy.** The route never constructs a
Supabase admin client — the only database call in the whole path is the auth lookup that
identifies the caller. There is no table, no audit row, no `last_coaching` column, and no
draft write. `tests/unit/evalCoach.test.ts` asserts `createAdminClient` is never called on a
successful run.

**What leaves the server:** the Block 43 narrative text itself and the trait grades, plus the
repo's own anchor/budget/rule tables. Nothing else — no member name field, no DoD ID, no
admin blocks, no prior reports. (The narrative usually names the member in its own text;
that is the Sailor's writing, and it is the thing being reviewed.)

**Consent** is server-enforced as a required `consent: true` on the request that carries the
text, and the UI shows a first-use disclosure before it ever sets it. This differs from
board-confidence (`member_board_records.consented_at`) and brag-sheet
(`brag_sheets.consented_at`), which gate on a **stored** consent timestamp — and the
difference is honest rather than incidental: those routes read a server-side row belonging to
the user, so a stored consent record is both possible and necessary. This route owns no row
and reads none. The material act being consented to is "send *this* text to a model", and
that text arrives in the same request. A stored flag here would be ceremony over a payload
the caller already chose to send.

**Authorization** is authentication. There is no owner check, because there is no
server-side object to own: the caller supplies their own working text and receives coaching
on it. A caller cannot reach anyone else's narrative through this route, because the route
reads no narrative. Auth is required so the endpoint is not an open model proxy, and the
in-process concurrency cap (2) matches the other AI routes.

---

## 6. Configuration

Shares one AI config surface with board-confidence and brag-sheet autofill
(`lib/aiProvider.ts`) — a server configured for one has it for all three:

```
BOARD_NARRATIVE_BASE_URL   # direct: any OpenAI-compatible endpoint
BOARD_NARRATIVE_API_KEY    # omit for keyless local endpoints
BOARD_NARRATIVE_MODEL      # native model id (direct) or "provider/model" (gateway)
```

No key ⇒ `GET /api/eval-coach` returns `{ available: false }` and the surface never renders.

> **Schema note for direct endpoints:** `evidence_sentence` is `z.number()`, not
> `z.number().int()`. Zod v4 emits safe-integer `minimum`/`maximum` for `.int()`, and the
> live endpoint rejects the entire request with *"For 'integer' type, properties maximum,
> minimum are not supported"*. `applyCoachGate` truncates and bounds-checks the id, which is
> the check that actually matters.
>
> This class of failure is invisible to mocked tests — the feature is simply dead against the
> real endpoint while every suite stays green. `tests/unit/evalCoach.test.ts` now converts
> `CoachOutputSchema` with `z.toJSONSchema` and asserts no numeric bounds survive, which
> catches it with no network. **Worth running against any structured-output schema in this
> repo.**

---

## 7. Demo

1. `npm run db:seed`
2. Sign in as `sailor@franklyn.dev`.
3. Open the seeded **DOE, JOHN A** EVAL (or any draft) → wizard section **3. Narrative &
   Comments**.
4. **Review my narrative** → accept the first-use disclosure.

The seeded draft is one sentence — `PO2 DOE HAS PERFORMED OUTSTANDING DUTIES THROUGHOUT THIS
CYCLE.` — against seven 4.0 grades, so the honest answer is seven `unsupported` findings,
each naming what the trait's own anchors want and what the sentence fails to provide.
