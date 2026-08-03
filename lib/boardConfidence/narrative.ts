// lib/boardConfidence/narrative.ts
//
// AI narrative (strengths / gaps / recommendations) for a board-confidence run.
// Model path uses AI SDK structured output through either a direct
// OpenAI-compatible endpoint or the Vercel AI Gateway; otherwise (and on ANY
// model failure) a deterministic fallback is returned, so the feature is fully
// functional keyless. Spec §4.3.
//
// v2 (P1a): this speaks the READINESS vocabulary, not the rubric's. It is built
// from ReadinessReport — areas with status and evidence tier, coverage, the
// ranked actions, months to the board — and it emits NO contributions, weights,
// factor scores, confidences or point totals. That is a hard requirement, not a
// style choice: the readiness layer suppresses the composite below its gates
// (readiness.ts), and the previous fallback printed "Contributed 33.5 of 40.0
// possible points" for all six factors, which sums straight back to the number
// being suppressed. Anything a reader can add up is a leak.
//
// Privacy (normative): the payload carries rubric-derived statuses, plain-language
// summaries, action text, and unmet LaDR milestone NAMES — the last of these is
// public Navy COOL roadmap text with no PII delta, and it is what makes the
// output specific rather than generic. No names, DoD IDs, eval comments, award
// titles, tour titles, or adverse entry details ever leave the server.

import { generateText, Output } from "ai";
import { z } from "zod";
import { resolveAiModel } from "@/lib/aiProvider";
import type { AreaStatus, ReadinessReport } from "@/lib/boardConfidence/readiness";
import type {
  FactorKey,
  PreceptFlag,
  RubricResult,
} from "@/lib/boardConfidence/types";

const AREA_ORDER = [
  "performance",
  "leadership",
  "development",
  "continuity",
  "completeness",
  "precept",
] as const;
/** Compile-time proof the list above names FactorKeys and nothing else. */
const _areaOrderIsFactorKeys: readonly FactorKey[] = AREA_ORDER;
void _areaOrderIsFactorKeys;

/**
 * What a strengths/gaps item may declare itself to be ABOUT.
 *
 * `record` is the honest escape, and it has to exist: live output is full of
 * legitimate items like "APEX could see five of the six areas of your record,
 * which is enough breadth to give you specific feedback" that are about the
 * record as a whole and name no area. Forcing an area on those would delete
 * them — which is exactly why requiring an area CITATION was rejected.
 */
export const SUBJECT_KEYS = [...AREA_ORDER, "record"] as const;
export type SubjectKey = (typeof SUBJECT_KEYS)[number];

/**
 * ONE strengths/gaps item as the MODEL emits it. `subject` is the field the gate
 * needed and never had: see the ceiling note on `agreementCheck`, which could
 * only ever check the area a citation POINTS AT, never the one the sentence is
 * ABOUT — so a claim about leadership citing `[monthsToBoard]` was invisible to
 * it however wrong it was.
 */
const ModelItemSchema = z.object({
  text: z.string(),
  subject: z.enum(SUBJECT_KEYS),
});

/**
 * The model's structured-output grammar. NOT the persisted shape.
 *
 * `subject` exists only to be checked; it is consumed by `applyCitationGate` and
 * never stored or rendered, so `GatedNarrative` — what the row carries and what
 * ResultsView reads — stays arrays of plain strings and no migration is needed.
 * Keeping the two apart is also what keeps `subject` out of the Sailor's view: it
 * is an assertion by the model about its own output, not a fact about the record.
 */
export const ModelNarrativeSchema = z.object({
  strengths: z.array(ModelItemSchema),
  gaps: z.array(ModelItemSchema),
  recommendations: z.array(z.string()),
  factor_commentary: z.object({
    performance: z.string(),
    leadership: z.string(),
    development: z.string(),
    continuity: z.string(),
    completeness: z.string(),
    precept: z.string(),
  }),
});
export type ModelNarrative = z.infer<typeof ModelNarrativeSchema>;

/** The gated, persisted, rendered shape. */
export const NarrativeSchema = z.object({
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  recommendations: z.array(z.string()),
  factor_commentary: ModelNarrativeSchema.shape.factor_commentary,
});
export type Narrative = z.infer<typeof NarrativeSchema>;

/**
 * What `applyCitationGate` returns, and what is persisted. `withheld` is NOT in
 * `NarrativeSchema` on purpose: that schema is the model's structured-output
 * grammar, and this is a fact about the gate, not something the model may
 * assert. Optional so rows written before this change (and hand-built fixtures)
 * still typecheck as narratives.
 */
export type GatedNarrative = Narrative & { withheld?: number };

// v1.3: provider-agnostic. Two independent paths — NEITHER requires hosting
// on (or any service from) Vercel:
//  1. DIRECT (self-host friendly, zero Vercel involvement):
//     BOARD_NARRATIVE_BASE_URL = any OpenAI-compatible endpoint (xAI
//     https://api.x.ai/v1, OpenRouter, Groq, a local Ollama, …) +
//     BOARD_NARRATIVE_API_KEY (omit for keyless local endpoints) +
//     BOARD_NARRATIVE_MODEL = that provider's NATIVE model id (e.g. grok-4).
//     Takes precedence when set.
//  2. GATEWAY (one key, many providers, price comparison): the Vercel AI
//     Gateway is a plain HTTPS API callable from any host —
//     BOARD_NARRATIVE_MODEL = "provider/model" string, auth via
//     AI_GATEWAY_API_KEY (or OIDC when deployed on Vercel).
//
// The default is the GATEWAY form, because that is the only path where a default
// can be meaningful: direct mode requires BOARD_NARRATIVE_BASE_URL, and a caller
// who has pointed that at xAI or a local Ollama needs their own native id
// anyway. Direct-mode callers on Anthropic must set BOARD_NARRATIVE_MODEL to the
// native id `claude-opus-5` (no provider prefix).
//
// NOTE the previous value "anthropic/claude-opus-4.8" could never resolve in
// either mode: Anthropic model ids are hyphenated and never contain a dot
// (`claude-opus-4-8`, `claude-opus-5`). It was a silent keyless-fallback trap.
export const DEFAULT_NARRATIVE_MODEL = "anthropic/claude-opus-5";

export const narrativeModelId = (): string =>
  process.env.BOARD_NARRATIVE_MODEL || DEFAULT_NARRATIVE_MODEL;

export interface NarrativeOutcome {
  narrative: GatedNarrative;
  source: "model" | "fallback";
  model: string | null; // the model id used when source === "model", else null
  // v1.1 review fix: why the fallback was used (null when source === "model") —
  // "no_key" = no credentials; "model_error" = model call failed/unparseable.
  fallbackReason: "no_key" | "model_error" | null;
}

/** Non-identifying context the service may pass alongside the readiness report. */
export interface NarrativeContext {
  preceptFlags?: PreceptFlag[];
  targetPaygrade?: number | null;
  ratingAbbrev?: string | null;
}

export const NARRATIVE_SYSTEM_PROMPT =
  "You write self-development feedback for APEX, an UNOFFICIAL U.S. Navy record " +
  "self-assessment tool. The user message is a JSON readiness report: how much of " +
  "the record APEX can see (coverage), one entry per area of the record with a " +
  "status and where the information came from, a ranked list of concrete actions, " +
  "the unmet milestones from the Sailor's rating roadmap by name, and how many " +
  "months remain before the board.\n\n" +
  "RULES.\n" +
  "1. Ground every statement in the payload. Never invent a milestone, " +
  "qualification, award, date or event that is not there.\n" +
  "2. CITE your grounding. Every strengths / gaps / recommendations item must end " +
  "with the payload path it derives from in square brackets. Valid paths are " +
  "exactly: coverage.measured, coverage.areasKnown, coverage.areasTotal, " +
  "monthsToBoard, areas.<key> (key is one of performance, leadership, " +
  "development, continuity, completeness, precept), coverage.missing.<key>, " +
  "actions.<id> using an id from the actions array, and unmet.<milestone_id> " +
  "using a milestone_id from the unmet array. Example: " +
  "\"Your reporting periods run without a break. [areas.continuity]\". " +
  "Citations are machine-checked after you respond and any item citing a path " +
  "that is not in the payload is DELETED, so a claim you cannot cite is a claim " +
  "you lose.\n" +
  "2b. The check also compares your claim to what the cited area SAYS, and " +
  "deletes an item that disagrees with it. A strengths item may cite an area " +
  "only if that area's status is strong or on_track; a gaps item only if it is " +
  "on_track or needs_attention. An area whose status is not_enough_entered may " +
  "not be cited by either list — see rule 4, it belongs in recommendations. If " +
  "an item cites more than one area, EVERY cited area must satisfy this, so do " +
  "not add a healthy area to a sentence that is about a weak one. " +
  "recommendations are not checked this way: any status may be cited there.\n" +
  "2c. Each strengths and gaps item is an OBJECT, not a string: `text` is the " +
  "sentence, ending in its bracketed citation exactly as rule 2 describes, and " +
  "`subject` names the area the sentence is ABOUT — one of performance, " +
  "leadership, development, continuity, completeness, precept, or \"record\" when " +
  "the sentence is about the record as a whole and no single area (its breadth of " +
  "coverage, the record overall). `subject` is machine-checked the same way the " +
  "citation is, and two ways: the subject area's status must satisfy rule 2b, and " +
  "if the item names an area as its subject then that area must be among the areas " +
  "it cites. So do not write about one area and cite another — naming leadership " +
  "as the subject while citing continuity deletes the item, and so does calling a " +
  "sentence about leadership a \"record\" sentence to get around rule 2b. Say what " +
  "the sentence is about and cite that. Months remaining is never what an item is " +
  "ABOUT in the gaps list: a board does not observe your timeline.\n" +
  "3. NEVER state, estimate, imply or reconstruct an overall score, a total, a " +
  "point value, a percentage of points, a weight, or a band. The payload " +
  "deliberately omits them. If scored is false, APEX has decided it cannot " +
  "responsibly score this record — say what is missing and what to do about it, " +
  "and do not hint at how the record would have scored.\n" +
  "4. 'not_enough_entered' means APEX has no data, NOT that the Sailor is weak. " +
  "Never present it as a deficiency or a criticism. It belongs in " +
  "recommendations (enter the data), never in gaps.\n" +
  "5. Everything in this payload is either entered by the Sailor or derived from " +
  "it. Nothing is verified against an OMPF. Do not describe any of it as " +
  "confirmed, official, or verified.\n" +
  "6. Name the specific milestone when you have it — 'Complete Information " +
  "Warfare (EIWS)' is useful, 'close your qualification gaps' is not.\n" +
  "7. This tool is not a selection board. Never predict board results or " +
  "selection outcomes.\n" +
  "8. Plain language. 2-5 items per list. Write to the Sailor, in the second " +
  "person. No engine internals, no field names, and no jargon in the prose " +
  "itself — the bracketed citation is the only place a path may appear.";

// ── Citation-or-delete (the brag-sheet anti-fabrication gate, §4.6) ──────────
// The old prompt demanded citations to paths like [performance.detail.P1] that
// were never in the serialized payload, so every citation was unresolvable and
// the whole mechanism was decorative. A bracket pointing at nothing reads as
// provenance and is worse than no bracket at all.

const CITATION_RE = /\[([^\]]+)\]/g;

/** Every path a model may legitimately cite for this report. */
export function citationPaths(payload: NarrativePayload): Set<string> {
  const paths = new Set<string>([
    "coverage.measured",
    "coverage.areasKnown",
    "coverage.areasTotal",
    "monthsToBoard",
  ]);
  for (const a of payload.areas) paths.add(`areas.${a.key}`);
  for (const m of payload.coverage.missing) paths.add(`coverage.missing.${m.area}`);
  for (const a of payload.actions) paths.add(`actions.${a.id}`);
  for (const u of payload.unmet) paths.add(`unmet.${u.milestone_id}`);
  return paths;
}

/**
 * Keep an item only if EVERY path in its trailing citation group resolves, and
 * strip only that trailing group — the citation proves grounding, it is not copy.
 * Returns null when the item is unciteable.
 *
 * Two things this deliberately does NOT do, both of which it used to:
 *
 * 1. It does not accept an item because *some* path resolves. One valid path
 *    laundered every fabricated claim beside it:
 *      "You failed your PFA and hold no warfare device.
 *       [areas.performance, awards.fabricated]"  → survived intact.
 *    The system prompt promises the model that an item citing a path not in the
 *    payload is deleted; enforcing anything weaker than that promise is an
 *    invitation to append one safe citation to a fabricated sentence.
 *
 * 2. It does not strip every bracketed span in the item. Navy roadmap text
 *    routinely carries bracketed NEC and CIN codes, so a global strip ate real
 *    content: `Complete "Advanced Network Analyst [NEC 742A]". [actions.x]`
 *    rendered as `Complete "Advanced Network Analyst ".` Only the trailing
 *    group is STRIPPED — the prompt requires the citation to end the item.
 *
 * WHICH BRACKETS TO STRIP AND WHICH TO CHECK ARE DIFFERENT QUESTIONS. Conflating
 * them left a bypass that turned the whole semantic gate off with one extra
 * bracket group:
 *
 *     deleted   Your leadership record stands out. [areas.leadership]
 *     SURVIVED  Your leadership record stands out. [areas.leadership] [monthsToBoard]
 *
 * Only the trailing group was examined, so the claim was judged against
 * `monthsToBoard` — which has no status and abstains — while the citation that
 * contradicted it was never read. `stripPathTokens` (ResultsView) then erased
 * the unchecked `[areas.leadership]` at display time, so the bracket the gate
 * ignored is exactly the one the UI deletes: the Sailor saw the bare sentence,
 * with `withheld === 0` and no note.
 *
 * FREQUENCY IS DISPUTED; the bypass is not. Review reported the live model
 * emitting this two-group form in 9 of 190 items unprompted. Re-measuring on 50
 * live records under main's prompt (392 strengths/gaps items, three seeds) found
 * it 0 times — 0 even by a naive any-second-bracket counter, and 0 across 49
 * `recommendations` items where the NEC/CIN codes live. The two measurements are
 * not reconcilable and the difference was not chased further; it does not change
 * the fix, because the bypass is reachable by construction and closing it costs
 * one extra regex pass. Do not quote either number as settled.
 *
 * So: STRIP the trailing group, CHECK every group. THREE questions, not one —
 * conflating any two of them has now caused a defect in this file:
 *
 *   which group is STRIPPED     the trailing one (the NEC/CIN reason)
 *   which groups are CHECKED    every citation group (the R1 bypass)
 *   must the item END in one    yes — an item whose trailing bracket is prose
 *                               is unciteable, exactly as on main
 *
 * The third was briefly lost: `groups.length === 0` asks "is there a citation
 * ANYWHERE", so with the citation mid-sentence and prose at the end,
 *
 *     "You hold a Bronze Star. [areas.continuity] [awards.fabricated]"
 *
 * was kept — `[awards.fabricated]` is out-of-family, so it was classified prose
 * and never validated, and the trailing strip then deleted it. On main this was
 * correctly dropped. Fixed by requiring the trailing match to BE a citation
 * group.
 */
const TRAILING_CITATION_RE = /\s*\[([^\]]+)\]\s*\.?\s*$/;

/**
 * Anchored to the four dotted families plus the one dotless path.
 *
 * KEEP IN SYNC with `PATH_TOKEN` (ResultsView), which strips exactly this set at
 * display time — a token this matches but that one does not renders raw to the
 * Sailor, which is how `:` (real action ids are `ladr:<id>:<verb>`) and
 * `monthsToBoard` were both leaking. `FOREIGN_PATH` below is deliberately NOT in
 * that set: an item carrying one is deleted outright, so it never reaches the UI.
 */
const PATH_SHAPED = /^(?:coverage|areas|actions|unmet)\.[\w.:-]+$|^monthsToBoard$/;

/**
 * Looks like an APEX path but names no known family: `awards.nam`, `psr.tours`,
 * `evals.2024`. Treated as a citation so it is VALIDATED and fails, rather than
 * waved through as prose — otherwise the module's central promise ("an item
 * citing a path not in the payload is deleted") is false for any out-of-family
 * prefix, and the raw token renders to the Sailor because the UI's stripper is
 * anchored to the known families too.
 *
 * Deliberately tighter than a generic `word.word`: at least two leading
 * lowercase chars and a non-dot after the dot. `[1610.10H]` (digit), `[NEC
 * 742A]` and `[CIN A-531-0009]` (spaces) and `[e.g., …]` (one char, trailing
 * dot) all stay prose. Checked against the shipped roadmaps: no seeded LaDR
 * item text contains a bracket at all, so the only bracketed prose here is what
 * the model writes.
 */
const FOREIGN_PATH = /^[a-z][a-z0-9]+\.[\w:-][\w.:-]*$/;

const isCitation = (toks: string[]) =>
  // `some`, not `every`: `[areas.performance, awards.fabricated]` must be read
  // as a citation so the fabricated half is caught, not waved through as prose.
  toks.length > 0 && toks.some((t) => PATH_SHAPED.test(t) || FOREIGN_PATH.test(t));

const tokensOf = (group: string) =>
  group
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

/** Every bracket group in the item that is a citation rather than prose. */
function citationGroups(text: string): string[][] {
  const groups: string[][] = [];
  const re = new RegExp(CITATION_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const toks = tokensOf(m[1]);
    if (isCitation(toks)) groups.push(toks);
  }
  return groups;
}

function checkCitation(
  text: string,
  valid: Set<string>,
  agrees: (cited: string[]) => boolean = () => true,
): string | null {
  const m = text.match(TRAILING_CITATION_RE);
  if (!m || m.index === undefined) return null; // no trailing bracket at all
  if (!isCitation(tokensOf(m[1]))) return null; // it ends in prose, not a citation
  for (const cited of citationGroups(text)) {
    if (!cited.every((c) => valid.has(c))) return null;
    if (!agrees(cited)) return null;
  }
  return text.slice(0, m.index).trim();
}

// ── The citation must AGREE, not merely resolve ─────────────────────────────
//
// `valid.has(path)` is a statement about the payload's shape and says nothing
// about what the payload SAYS. `citationPaths` registers `areas.<key>` for every
// area unconditionally, so `[areas.leadership]` resolved whatever leadership's
// status was — and
//
//     "Your leadership record stands out. [areas.leadership]"
//
// shipped intact with leadership at `needs_attention`, one viewport above its own
// card reading NEEDS ATTENTION. The bracket is the Sailor's provenance signal;
// pointing it at a source that says the opposite is worse than omitting it.
//
// Only `strengths` and `gaps` are checked. Membership in those two lists is
// itself a claim about the area — "What is working" / "What a board would
// notice" (ResultsView) — so it can contradict a status. `recommendations` and
// `factor_commentary` assert no valence: "Fill in your PSR" is equally true of a
// strong area and an empty one, so there is nothing for a status to disagree
// with, and gating them would delete correct advice.

/**
 * Area statuses each valence may cite. Read as: what must be true of the area
 * for this sentence to be honest in front of its own card.
 *
 * `not_enough_entered` is excluded from BOTH, for two different reasons, and
 * that asymmetry is the point — it is NOT `needs_attention` and is not treated
 * as it:
 *
 *  - out of `strengths` because APEX holds no data, so there is nothing to
 *    praise from. This is not "the area is weak"; it is "no claim is supported".
 *  - out of `gaps` because the coverage card at the top of the same screen
 *    promises, verbatim: "Nothing below is a grade on what you have not
 *    entered." An item under "What a board would notice" citing an area APEX
 *    cannot see breaks that promise in the Sailor's own viewport, and tells them
 *    a board will notice a deficiency that may not exist — the entered/weak
 *    conflation this epic was founded to remove.
 *
 * The distinction survives where it decides an outcome: a `gaps` item citing
 * `needs_attention` is KEPT (a grade on what IS entered, which the promise
 * permits and the amber card already asserts) while the same item citing
 * `not_enough_entered` is dropped. "Enter your PSR" is not lost — it is what
 * `recommendations` and the coverage card's `missing`/`howTo` are for, both of
 * which stay ungated.
 */
const AGREEING_STATUSES: Record<"strengths" | "gaps", ReadonlySet<AreaStatus>> = {
  strengths: new Set<AreaStatus>(["strong", "on_track"]),
  gaps: new Set<AreaStatus>(["on_track", "needs_attention"]),
};

/**
 * MULTI-PATH RULE: unanimity across every cited path that HAS a status; paths
 * that genuinely have none abstain.
 *
 * When two cited paths disagree, the item is dropped. The alternative — keep it
 * if ANY cited path agrees — re-opens, one level up, precisely the laundering
 * hole `every()` was introduced to close: append one healthy area to a sentence
 * about a weak one and the contradiction rides along. The Sailor reads the
 * bracket as "this is where the sentence comes from" and cannot tell which of
 * two listed sources it was actually built on, so every source named has to
 * support it for the bracket to mean what it is read to mean.
 *
 * THREE PATH FAMILIES CARRY A STATUS, not one. An earlier version of this
 * checked only `areas.<key>` and called everything else statusless, which
 * enforced the rule for one spelling and left it open for more natural ones:
 *
 *     deleted   gaps: …thin emphasis-area coverage. [areas.precept]
 *     SURVIVED  gaps: …thin emphasis-area coverage. [coverage.missing.precept]
 *     SURVIVED  strengths: Your development roadmap is fully answered. [actions.ladr:…]
 *
 *  - `coverage.missing.<key>` exists IFF that area is `not_enough_entered`
 *    (readiness.ts filters on exactly that), so it carries its area's status.
 *    It is looked up rather than hardcoded to `not_enough_entered`, so it stays
 *    correct if that filter ever widens.
 *  - `actions.<id>` ships `area: FactorKey` in the payload, so it carries that
 *    area's status.
 *  - `unmet.<milestone_id>`, `coverage.measured|areasKnown|areasTotal` and
 *    `monthsToBoard` really do have no area, and really do abstain.
 *
 * WHAT THIS RULE ALONE CANNOT SEE, and why `subject` exists. Checking the path an
 * item CITES says nothing about the subject the prose is ABOUT, so a misattributed
 * citation was invisible to it. Measured, not theorised: with leadership at
 * `needs_attention`, both
 *   "Your leadership record stands out. [monthsToBoard]"
 *   "Your leadership record stands out. [areas.continuity]"   (continuity strong)
 * survived, while the honestly-cited [areas.leadership] form was deleted — the gate
 * punished the one item that told the truth about where it came from. Live output
 * hit this for real: one screen carried "your remaining roadmap items are down to
 * two clearly named targets [unmet.m2-1]" under What is working and "most of the
 * milestones on your rating's roadmap are still open [areas.development]" under
 * What a board would notice, with `withheld === 0`.
 *
 * Requiring every strengths/gaps item to cite at least one area would close the
 * statusless-path half, and was REJECTED on evidence: live output is full of
 * legitimate items like "APEX could see five of the six areas of your record,
 * which is enough breadth to give you specific feedback" citing
 * `coverage.measured`, and that rule would delete them. So the subject moved into
 * the grammar instead — see `subjectCheck`.
 */
function agreementCheck(
  payload: NarrativePayload,
  valence: "strengths" | "gaps",
): (cited: string[]) => boolean {
  const { byArea, pathArea } = areaIndex(payload);
  const allowed = AGREEING_STATUSES[valence];
  return (cited) =>
    cited.every((c) => {
      const area = pathArea.get(c);
      if (area === undefined) return true; // genuinely statusless: abstains
      const s = byArea.get(area);
      return s === undefined || allowed.has(s as AreaStatus);
    });
}

/**
 * The area each citeable path speaks for. One map, because the status rule and
 * the subject rule need the SAME answer to "which area is this path about" — and
 * the first version of the status rule got it wrong for two of the three families
 * by hardcoding rather than looking up.
 *
 * A path whose area is not in `payload.areas` is omitted, so it abstains rather
 * than resolving to an undefined status. That is deliberate and matches the rest
 * of the file: the gate deletes on a proven contradiction, never on an absence.
 */
function areaIndex(payload: NarrativePayload) {
  const byArea = new Map(payload.areas.map((a) => [a.key, a.status]));
  const pathArea = new Map<string, FactorKey>();
  const put = (path: string, area: FactorKey) => {
    if (byArea.has(area)) pathArea.set(path, area);
  };
  for (const a of payload.areas) put(`areas.${a.key}`, a.key);
  for (const m of payload.coverage.missing) put(`coverage.missing.${m.area}`, m.area);
  for (const a of payload.actions) put(`actions.${a.id}`, a.area);
  return { byArea, pathArea };
}

/**
 * The subject rule: check the area the item SAYS it is about, not just the one it
 * points at. Two independent tests, both abstaining when the subject is `record`.
 *
 *   S1 STATUS      the subject area's status must satisfy AGREEING_STATUSES, the
 *                  same bar a cited area has to clear. S1 does nearly all the
 *                  work, because the shape that shipped is praise for a WEAK
 *                  area: "Your leadership record stands out. [monthsToBoard]"
 *                  and the same sentence citing `[areas.continuity]` are both
 *                  deleted by S1 alone once `subject` says leadership. Nothing
 *                  about the citation had to change for the gate to see them.
 *
 *   S2 COHERENCE   if the item cites ANY area-bearing path, the subject must be
 *                  among the areas those paths resolve to. S2 decides exactly the
 *                  case S1 cannot: BOTH areas healthy, so no status is wrong and
 *                  only the provenance is — a claim about continuity citing
 *                  completeness. It asks only whether the item is self-consistent,
 *                  so no language model judges prose here. Either the subject or
 *                  the citation is wrong, and either way the bracket the Sailor
 *                  reads as "this is where the sentence comes from" points
 *                  somewhere the sentence did not come from.
 *
 * S2 ABSTAINS WHEN NO AREA IS CITED, and that clause is load-bearing rather than
 * defensive. Dropping it turns S2 into "every strengths/gaps item naming an area
 * must cite that area" — which is the rule REJECTED above one step removed, and
 * it would delete an honest claim about a healthy area that cites a statusless
 * path. S1 already covers the unhealthy half of that case.
 *
 * ponytail: KNOWN CEILING, and it is narrower than the one it replaces rather
 * than gone.
 *
 * STATE THE RESIDUAL AS A CLASS, NOT AS ITS LAZIEST MEMBER. An earlier revision
 * of this note named only `subject: "record"`, which reads as though that one
 * dodge is the whole hole. It is not. The surviving class is:
 *
 *     any declared subject that is FALSE about the prose but healthy for its
 *     valence and consistent with its own citation
 *
 * `record` is merely the cheapest way to be in it — declaring a healthy AREA and
 * citing that same area works identically, whatever the sentence actually says.
 * Both forms are in the contradiction table in
 * tests/unit/boardConfidenceCitationSweep.test.ts, measured rather than assumed.
 *
 * What changed is the COST, and it is the same for every member of the class:
 * laundering now takes a deliberate second false statement in a field whose only
 * purpose is to be checked, rather than falling out of an incidentally convenient
 * citation. The field is the model's own assertion about its own output, so
 * nothing here can make it truthful. Closing it means matching prose to subject,
 * which is a language model judging a language model and can be wrong in the
 * direction that matters.
 *
 * Prompt rule 2c tells the model that calling an area sentence a "record"
 * sentence deletes the item. THAT IS UNBACKED — `subject === "record"` returns
 * true here unconditionally. It is a bluff, in the safe direction, and it is the
 * only thing discouraging the cheapest member of the class, so it stays; but this
 * file's own doctrine is that enforcing weaker than a promise is an invitation,
 * so the disagreement is written down rather than left for someone to discover.
 */
function subjectCheck(
  payload: NarrativePayload,
  valence: "strengths" | "gaps",
): (subject: SubjectKey, cited: string[]) => boolean {
  const { byArea, pathArea } = areaIndex(payload);
  const allowed = AGREEING_STATUSES[valence];
  return (subject, cited) => {
    if (subject === "record") return true; // claims no area: abstains
    const s = byArea.get(subject);
    if (s !== undefined && !allowed.has(s as AreaStatus)) return false; // S1
    const citedAreas = new Set(
      cited.map((c) => pathArea.get(c)).filter((a): a is FactorKey => !!a),
    );
    return citedAreas.size === 0 || citedAreas.has(subject); // S2
  };
}

/**
 * Drop unciteable and self-contradicting list items; fall back to the
 * deterministic text for any factor_commentary entry that cannot be cited (the
 * schema requires all six, so they cannot be deleted — but an unsupported one
 * must not be shown either).
 *
 * Reports `withheld`: how many `strengths` + `gaps` items were removed, for
 * either reason. A dropped item must not become a silent absence — an empty
 * "What is working" reads as "nothing good was found" when it means "we could
 * not verify these claims", and those are opposite messages. Only the two
 * rendered lists are counted, so the number always reconciles with the screen.
 *
 * `withheld: 0` IS NOT EVIDENCE THIS GATE WORKS. Once the system prompt states
 * the agreement rule (2b), the model largely stops emitting contradictions:
 * across live records with 2b in place, zero citation-detectable contradictions
 * appeared, so the gate never fired. Against main's prompt, on the same
 * generator, 11 of 20 records produced at least one. The prompt does the work in
 * the common case; the gate exists for the case where it does not. A run of
 * clean production traffic says the prompt is holding, and says nothing at all
 * about whether this function is correct — only the tests do that.
 */
export function applyCitationGate(
  narrative: ModelNarrative,
  payload: NarrativePayload,
  deterministic: Narrative,
): GatedNarrative {
  const valid = citationPaths(payload);

  const factor_commentary = { ...narrative.factor_commentary };
  for (const key of AREA_ORDER) {
    const kept = checkCitation(factor_commentary[key] ?? "", valid);
    factor_commentary[key] = kept ?? deterministic.factor_commentary[key];
  }

  /**
   * Both rules, in order: the citation must resolve and agree, and then the
   * declared subject must survive S1/S2. The subject test reads the union of
   * EVERY citation group, not just the trailing one — same reason the path rule
   * does (the R1 bypass above), so a second bracket cannot hide the area the
   * item really cites from the coherence test either.
   */
  const gated = (valence: "strengths" | "gaps") => {
    const agrees = agreementCheck(payload, valence);
    const subjectOk = subjectCheck(payload, valence);
    return narrative[valence]
      .map((item) => {
        const kept = checkCitation(item.text, valid, agrees);
        if (kept === null) return null;
        return subjectOk(item.subject, citationGroups(item.text).flat()) ? kept : null;
      })
      .filter((t): t is string => !!t);
  };

  const strengths = gated("strengths");
  const gaps = gated("gaps");

  return {
    strengths,
    gaps,
    // Ungated for valence on purpose (see above): "Fill in your PSR" is equally
    // true of a strong area and an empty one, so there is no subject rule here
    // either — and the schema keeps these plain strings for the same reason.
    recommendations: narrative.recommendations
      .map((t) => checkCitation(t, valid))
      .filter((t): t is string => !!t),
    factor_commentary,
    withheld:
      narrative.strengths.length -
      strengths.length +
      (narrative.gaps.length - gaps.length),
  };
}

// ── Payload ─────────────────────────────────────────────────────────────────

export interface NarrativePayload {
  scored: boolean;
  monthsToBoard: number;
  coverage: {
    measured: number;
    areasKnown: number;
    areasTotal: number;
    missing: Array<{ area: FactorKey; label: string; unlocks: string; howTo: string }>;
  };
  areas: Array<{
    key: FactorKey;
    label: string;
    status: string;
    evidence: string;
    summary: string;
  }>;
  actions: Array<{
    id: string;
    action: string;
    area: FactorKey;
    horizon: string;
    horizonBasis: string;
    blockedBy: string | null;
  }>;
  unmet: Array<{ milestone_id: string; item: string; category: string }>;
  unconfirmedInOmpfCount: number;
  preceptFlags: PreceptFlag[];
  targetPaygrade: number | null;
  ratingAbbrev: string | null;
}

/**
 * The model payload. Deliberately OMITS every number that could reconstruct the
 * composite: `areas[].detail` (contribution/weight/score/confidence) and
 * `actions[].worth` are dropped, and `score` becomes a bare boolean.
 */
export function narrativePayload(
  report: ReadinessReport,
  result: RubricResult,
  context?: NarrativeContext,
): NarrativePayload {
  return {
    scored: report.score !== null,
    monthsToBoard: report.monthsToBoard,
    coverage: {
      measured: report.coverage.measured,
      areasKnown: report.coverage.areasKnown,
      areasTotal: report.coverage.areasTotal,
      missing: report.coverage.missing,
    },
    areas: report.areas.map((a) => ({
      key: a.key,
      label: a.label,
      status: a.status,
      evidence: a.evidence,
      summary: a.summary,
    })),
    actions: report.actions.map((a) => ({
      id: a.id,
      action: a.action,
      area: a.area,
      horizon: a.horizon,
      horizonBasis: a.horizonBasis,
      blockedBy: a.blockedBy,
    })),
    // Public Navy COOL roadmap text, no PII delta. marginal_points is dropped:
    // it is a factor-local point value and the model must not see point values.
    unmet: (result.ladrUnmet ?? [])
      .filter((u) => u.item)
      .map((u) => ({ milestone_id: u.milestone_id, item: u.item, category: u.category })),
    unconfirmedInOmpfCount: report.confirmInOmpf?.count ?? 0,
    preceptFlags: context?.preceptFlags ?? [],
    targetPaygrade: context?.targetPaygrade ?? null,
    ratingAbbrev: context?.ratingAbbrev ?? null,
  };
}

// ── Deterministic fallback ──────────────────────────────────────────────────

const MAX_ITEMS = 5;

/** Interleave in order, so no one list can starve the others out of the cap. */
function roundRobin(...lists: string[][]): string[] {
  const out: string[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++)
    for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

/**
 * Deterministic readiness-derived text. No I/O, no clock, no engine internals,
 * and no number a reader could sum back into the suppressed composite — it is
 * assembled entirely from the readiness report's own plain-language strings.
 */
export function fallbackNarrative(
  report: ReadinessReport,
  warnings: string[] = [],
): Narrative {
  const strengths: string[] = [];
  const gaps: string[] = [];
  const factor_commentary = {} as Record<FactorKey, string>;

  for (const a of report.areas) {
    factor_commentary[a.key] = a.summary;
    if (a.status === "strong") strengths.push(`${a.label}: ${a.summary}`);
    // needs_attention ONLY. `not_enough_entered` is a data state, never a gap —
    // it is answered by the coverage.missing recommendations below.
    if (a.status === "needs_attention") gaps.push(`${a.label}: ${a.summary}`);
  }
  gaps.push(...warnings);

  // Round-robin, NOT concatenate-then-slice. Concatenating put every action
  // first, so a record with 5+ actions lost the coverage.missing guidance
  // entirely (measured: actions=8, missing=2 → zero howTo shown) — defeating
  // the routing of `not_enough_entered` into recommendations at exactly the
  // moment it matters most. A Sailor with an unfilled PSR and eight open
  // milestones was never told to fill in the PSR.
  const recommendations = roundRobin(
    report.actions.map((a) => a.action),
    report.coverage.missing.map((m) => m.howTo),
    report.confirmInOmpf ? [report.confirmInOmpf.note] : [],
  ).slice(0, MAX_ITEMS);

  return {
    strengths: strengths.slice(0, MAX_ITEMS),
    gaps: gaps.slice(0, MAX_ITEMS),
    recommendations,
    factor_commentary: factor_commentary as Narrative["factor_commentary"],
  };
}

// ── Model path ──────────────────────────────────────────────────────────────

/** Model path when credentials exist; otherwise returns fallbackNarrative(). */
export async function generateNarrative(
  report: ReadinessReport,
  result: RubricResult,
  context?: NarrativeContext,
): Promise<NarrativeOutcome> {
  const deterministic = fallbackNarrative(report, result.warnings);
  const fallbackOutcome = (
    fallbackReason: "no_key" | "model_error",
  ): NarrativeOutcome => ({
    narrative: deterministic,
    source: "fallback",
    model: null,
    fallbackReason,
  });

  // Keyless gate: no request constructed, no network touched. Resolution is
  // shared with brag-sheet autofill (lib/aiProvider.ts, spec §4.1).
  const resolved = resolveAiModel(
    {
      baseUrlVar: "BOARD_NARRATIVE_BASE_URL",
      apiKeyVar: "BOARD_NARRATIVE_API_KEY",
      modelVar: "BOARD_NARRATIVE_MODEL",
      name: "board-narrative",
    },
    DEFAULT_NARRATIVE_MODEL,
  );
  if (!resolved) return fallbackOutcome("no_key");

  try {
    const payload = narrativePayload(report, result, context);

    const { output } = await generateText({
      model: resolved.model,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(30_000),
      system: NARRATIVE_SYSTEM_PROMPT,
      prompt: JSON.stringify(payload),
      output: Output.object({ schema: ModelNarrativeSchema }),
    });

    if (!output) return fallbackOutcome("model_error");
    return {
      narrative: applyCitationGate(output, payload, deterministic),
      source: "model",
      model: resolved.modelId,
      fallbackReason: null,
    };
  } catch (err) {
    // The analyze route never fails because of the narrative.
    console.error("board narrative generation failed:", err);
    return fallbackOutcome("model_error");
  }
}
