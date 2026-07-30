// lib/evalCoach/coach.ts
//
// The Block 43 narrative coach: does this narrative substantiate the trait
// grades it accompanies?
//
// Pure module — runEvalCoach takes an INJECTED callModel and never touches the
// network itself (unit-testable without "ai" mocks). Everything the model sees
// is derived server-side from the caller's own draft: the anchors come from
// lib/traitStandards.ts, the budget from lib/commentFit.ts, and the rule
// findings from lib/validationEngine.ts. Nothing is read from or written to the
// database — see docs/EVAL-COACH.md.
//
// THE HARD INVARIANT: the coach never generates or suggests a trait grade, and
// never writes Block 45. It assesses the narrative against grades a human has
// already set. What actually enforces that, stated precisely:
//   1. STRUCTURE (absolute). CoachOutputSchema has no grade field and no Block
//      45 field, and Zod's default strip semantics discard any the model emits
//      — trait_grades, suggested_grade, block_45, promotion_recommendation —
//      unread. This closes the FIELD form of both halves completely.
//   2. PROSE (pattern-matched, not absolute). A schema cannot see "this reads
//      like a 5.0" inside a rationale string, so
//      suggestsGradeOrRecommendation() deletes free text that recommends a
//      grade or a Block 45 category. It matches known phrasings over a prompt
//      that refuses such requests; an unanticipated construction reaches the
//      user. Do not describe this as a guarantee.
//   3. EVIDENCE (absolute). The model returns a SENTENCE ID and the server
//      substitutes the Sailor's own sentence, so a quotation cannot be
//      fabricated.

import { generateText, Output } from "ai";
import { z } from "zod";
import type { AiEnvConfig, ResolvedAiModel } from "@/lib/aiProvider";
import { checkCommentFit } from "@/lib/commentFit";
import {
  GRADE_SCALE_NOTE,
  getSubstantiationNote,
  TRAIT_STANDARDS_LOOKUP,
} from "@/lib/traitStandards";
import { getTraitMap, runFullValidation } from "@/lib/validationEngine";
import type { Evaluation, ValidationIssue } from "@/types";

// Same env vars as board-confidence and brag-sheet autofill (one AI config
// surface, lib/aiProvider.ts) — a server with AI configured has it for all three.
export const COACH_AI_ENV: AiEnvConfig = {
  baseUrlVar: "BOARD_NARRATIVE_BASE_URL",
  apiKeyVar: "BOARD_NARRATIVE_API_KEY",
  modelVar: "BOARD_NARRATIVE_MODEL",
  name: "eval-coach",
};

export const COACH_TIMEOUT_MS = 45_000;

/** Model output failed the schema parse — the route answers 502 and the screen
 *  degrades to its normal behaviour. */
export class CoachModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CoachModelError";
  }
}

// ── Request / payload ────────────────────────────────────────────────────────

export interface CoachRequest {
  report_type: "EVAL" | "CHIEFEVAL" | "FITREP";
  pitch: "10" | "12";
  comments: string;
  trait_grades: Record<string, string | undefined>;
}

export interface CoachPayloadTrait {
  key: string;
  block: number;
  title: string;
  definition: string;
  grade: string;
  grade_meaning: string;
  // EVAL (1616/26) and FITREP (1610/2) print per-grade anchor columns;
  // CHIEFEVAL (1616/27) prints ONE bullet list per trait and no columns. Post
  // #26 the standards table models that difference, so exactly one of these is
  // present per trait. Emitting `anchors: std.anchors` unconditionally would
  // have serialized `undefined` for every CHIEFEVAL trait — JSON.stringify
  // drops the key — and silently handed the model a trait with no standards at
  // all to judge against.
  anchors?: Record<string, string[]>;
  standards?: string[];
}

/** One addressable unit of the narrative. The `id` is explicit for a reason —
 *  see splitSentences. */
export interface CoachSentence {
  id: number;
  text: string;
}

export interface CoachPayload {
  report_type: string;
  budget: {
    chars_per_line: number;
    max_lines: number;
    lines_used: number;
    fits: boolean;
  };
  sentences: CoachSentence[];
  traits: CoachPayloadTrait[];
  issues: ValidationIssue[];
  substantiation_note: string;
}

/**
 * Split the narrative into addressable units. Navy narratives are half prose and
 * half bullet lines, so split on newlines first and only then on sentence
 * terminators — a bullet with no period is still one addressable unit.
 *
 * Each unit carries an EXPLICIT `id`. This used to be a bare string array whose
 * position was the id, and the prompt said so ("the index is the id") — but
 * nothing in the JSON said so, and across 31 live runs the model inferred
 * 1-based ids about half the time: rationales cited `sentences.5` against a
 * 5-sentence narrative where the valid ids are 0-4. Every such citation failed
 * to resolve and applyCoachGate deleted the whole finding, so a Sailor could
 * lose two of three traits with nothing on screen saying anything had been
 * suppressed. Tellingly, the separate `evidence_sentence` INTEGER was correct
 * (0-based) in the same responses — the model reads an explicit number reliably
 * and guesses at an implicit one. So state the id.
 */
export function splitSentences(text: string): CoachSentence[] {
  return text
    .split(/\r?\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/))
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text, id) => ({ id, text }));
}

/**
 * The rule findings that belong to this screen. runFullValidation needs a whole
 * Evaluation, and a draft that carries only a narrative and grades fails every
 * admin-block rule — so the stub is filtered down to the two field families
 * Block 43 is answerable for. That keeps the coach on the repo's own rules
 * (notably the Block 43 substantiation rule, validationEngine step 10) instead
 * of a second copy of them living here.
 */
export function narrativeIssues(req: CoachRequest): ValidationIssue[] {
  const stub = {
    form_definition_id: "",
    report_type: req.report_type,
    member_name: "",
    dod_id: "",
    grade_rate: "",
    period_from: "",
    period_to: "",
    duty_status: "",
    uic: "",
    ship_station: "",
    promotion_status: "",
    trait_grades: req.trait_grades,
    comments: req.comments,
    career_recommendations: [],
    promotion_recommendation: "",
    retention: "",
    status: "draft",
    block_values: { comment_pitch: req.pitch },
  } as Evaluation;
  const result = runFullValidation(stub);
  return [...result.errors, ...result.warnings].filter(
    (i) => i.field === "comments" || (i.field ?? "").startsWith("trait_grades"),
  );
}

/**
 * The model payload. Traits are resolved through TRAIT_STANDARDS_LOOKUP by the
 * draft's own grade keys — deliberately shallow coupling to that table: a key
 * it does not know is skipped rather than guessed at, so the inbound CHIEFEVAL
 * trait-key rename (#26) degrades to "that trait is not coached" instead of
 * emitting anchors from the wrong trait. NOB is skipped: an unobserved trait
 * has nothing to substantiate.
 */
export function coachPayload(req: CoachRequest): CoachPayload {
  const fit = checkCommentFit(req.comments, req.pitch);
  // Block numbers come from the report-type-aware map, never from the merged
  // standards lookup: on FITREP that lookup reports Block 39 for BOTH
  // `leadership` (really 38) and `tactical_performance`, which rendered two
  // cards headed "39" on the same screen.
  const blocks = getTraitMap(req.report_type);
  const traits: CoachPayloadTrait[] = [];
  for (const [key, grade] of Object.entries(req.trait_grades)) {
    const std = TRAIT_STANDARDS_LOOKUP[key];
    if (!std || !grade || grade === "NOB") continue;
    // A trait this form does not print is not coached. There is deliberately NO
    // fallback to std.block: that field comes from the merged lookup this
    // function just refused to trust, and falling back to it reintroduces the
    // exact collision — a stale client can still send `work` on a FITREP (the
    // route's z.record accepts any key), and the EVAL entry's block 34 would
    // then sit beside `eo`, also 34. No block number, no card.
    if (blocks[key] === undefined) continue;
    // A trait with neither anchors nor standards has nothing to judge against;
    // coaching it would be the model inventing the yardstick.
    if (!std.anchors && !std.standards?.length) continue;
    traits.push({
      key,
      block: blocks[key],
      title: std.title,
      definition: std.definition,
      grade,
      grade_meaning: GRADE_SCALE_NOTE[grade] ?? "",
      ...(std.anchors ? { anchors: std.anchors } : { standards: std.standards }),
    });
  }
  return {
    report_type: req.report_type,
    budget: {
      chars_per_line: fit.charsPerLine,
      max_lines: fit.maxLines,
      lines_used: fit.linesUsed,
      fits: fit.fit,
    },
    sentences: splitSentences(req.comments),
    traits,
    issues: narrativeIssues(req),
    substantiation_note: getSubstantiationNote(req.report_type),
  };
}

// ── Output schema ────────────────────────────────────────────────────────────
// Default strip semantics are the point: a model that emits "suggested_grade"
// or "block_45" alongside these keys has them discarded before anything reads
// the object. There is no field here a grade could travel in.

const FindingSchema = z.object({
  trait: z.string(),
  verdict: z.enum(["substantiated", "partial", "unsupported"]),
  // NOT z.number().int(): zod v4 emits safe-integer minimum/maximum for .int(),
  // and the live endpoint rejects the whole request with "For 'integer' type,
  // properties maximum, minimum are not supported". applyCoachGate truncates
  // and bounds-checks the index anyway, which is the check that matters.
  evidence_sentence: z.number().nullable(),
  rationale: z.string(),
  suggestion: z.string(),
});

export const CoachOutputSchema = z.object({
  findings: z.array(FindingSchema),
  narrative_notes: z.array(z.string()),
});
export type CoachOutput = z.infer<typeof CoachOutputSchema>;

export interface CoachFinding {
  trait: string;
  block: number;
  title: string;
  grade: string;
  verdict: "substantiated" | "partial" | "unsupported";
  /** The Sailor's own sentence, looked up server-side by index. */
  evidence: string | null;
  rationale: string;
  suggestion: string | null;
}

/** A graded trait the run produced no finding for — because the model skipped it
 *  or every candidate finding failed a gate. Reported so a suppressed trait is
 *  visible instead of silently missing from the panel. */
export interface UnassessedTrait {
  trait: string;
  block: number;
  title: string;
  grade: string;
}

export interface CoachResult {
  findings: CoachFinding[];
  notes: string[];
  /** Every graded trait not covered by `findings`. */
  unassessed: UnassessedTrait[];
  /** How many model items the gates removed — surfaced, never hidden. */
  dropped: number;
}

// ── Citation-or-delete ───────────────────────────────────────────────────────
// Ported from lib/boardConfidence/narrative.ts (its TRAILING_CITATION_RE block,
// read before writing this). Same two deliberate properties: only the TRAILING
// bracket group is treated as a citation, so bracketed NEC/CIN codes inside
// Navy prose survive intact; and EVERY path in that group must resolve, so one
// valid citation cannot launder a fabricated claim beside it. Copied rather
// than imported because that module is typed to the readiness Narrative and is
// owned by another workstream.

const TRAILING_CITATION_RE = /\s*\[([^\]]+)\]\s*\.?\s*$/;

/** Every path a model may legitimately cite for this narrative. Sentence paths
 *  are built from the explicit `id` the payload carries, not from array
 *  position — the two agree, and the point is that only one of them is a
 *  contract the model can actually see. */
export function citationPaths(payload: CoachPayload): Set<string> {
  const paths = new Set<string>(["budget", "substantiation_note"]);
  for (const s of payload.sentences) paths.add(`sentences.${s.id}`);
  for (const t of payload.traits) paths.add(`traits.${t.key}`);
  payload.issues.forEach((_, i) => paths.add(`issues.${i}`));
  return paths;
}

/** The item text with its citation stripped, or null when it is unciteable. */
function checkCitation(text: string, valid: Set<string>): string | null {
  const m = text.match(TRAILING_CITATION_RE);
  if (!m || m.index === undefined) return null;
  const cited = m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (cited.length === 0 || !cited.every((c) => valid.has(c))) return null;
  const kept = text.slice(0, m.index).trim();
  return kept.length > 0 ? kept : null;
}

// ── Prose guard (invariant enforcement #2) ──────────────────────────────────
// A BACKSTOP, not a proof. It matches the phrasings a model actually reaches
// for; an unanticipated construction gets through, which is why the prompt
// refuses these requests up front and why the claim is stated as
// pattern-matching everywhere it appears.
//
// Narrow on purpose. "The 5.0 in Block 39 is not substantiated" is exactly the
// finding this feature exists to produce, so mentioning a grade is fine and
// only the recommending forms are removed. False negatives are recoverable (a
// human reads the prose); false positives delete the useful output.
const GRADE_ADVICE_RES: RegExp[] = [
  /\bshould\s+(?:be|have been|receive|get)\b[^.]{0,40}\b(?:[1-5]\.0|NOB)\b/i,
  /\b(?:consider|recommend|recommending|suggest|suggesting)\b[^.]{0,40}\b(?:[1-5]\.0|NOB)\b/i,
  /\b(?:raise|lower|reduce|increase|downgrade|upgrade|revise|adjust|change)\b[^.]{0,30}\b(?:grade|mark|score|rating)\b/i,
  /\b(?:[1-5]\.0|NOB)\b\s+(?:is|would be|seems|feels)\s+(?:more\s+)?(?:appropriate|justified|warranted|defensible|supportable|accurate)\b/i,
  /\b(?:mark|grade|score)\s+(?:it|this|the trait|him|her|them)\s+(?:a\s+)?(?:[1-5]\.0|NOB)\b/i,
  /\breads?\s+like\s+(?:a\s+)?(?:[1-5]\.0|NOB)\b/i,
];

// Block 45 is the other half of the invariant and had no prose guard at all —
// only the schema, which can strip a `block_45` KEY but never sees a promotion
// recommendation written into a rationale. The coach has no business in Block
// 45 in any form, so any mention of the block is dropped outright, and the five
// category names are dropped in recommending forms only (a Sailor's own "2.0
// (Progressing)" mark must still be discussable).
const BLOCK_45_RES: RegExp[] = [
  /\bblocks?\s*4[56]\b/i,
  /\bpromotion recommendation\b/i,
  /\bpromote (?:ahead of peers|now)\b/i,
  // The multi-word categories are never legitimate coach vocabulary — Block 43
  // substantiation has no reason to name one — so they go regardless of framing.
  /\b(?:Early Promote|Must Promote|Significant Problems)\b/i,
  // "Promotable" is also an ordinary adjective, so it needs a recommending frame.
  /\b(?:should|would|recommend|recommending|suggest|suggesting|consider|support|supports|deserves?|warrants?|merits?|earns?|justifies)\b[^.]{0,40}\bPromotable\b/i,
  /\bPromotable\b[^.]{0,30}\b(?:is|would be|seems)\s+(?:more\s+)?(?:appropriate|justified|warranted|defensible|supportable|accurate)\b/i,
];

/**
 * True when the text recommends a trait grade or strays into Block 45.
 *
 * Pattern-matching, deliberately. It cannot prove the absence of grade or
 * promotion advice in free text — it removes the constructions we have seen and
 * the ones adversarial probing produced.
 */
export function suggestsGradeOrRecommendation(text: string): boolean {
  return [...GRADE_ADVICE_RES, ...BLOCK_45_RES].some((re) => re.test(text));
}

/**
 * Citation-or-delete plus the grade guard, over one parsed model output.
 *
 * A finding is DROPPED when: its trait is not one of the graded traits in the
 * payload (no inventing traits), its rationale is unciteable, its rationale
 * recommends a grade, or it claims support ("substantiated") while pointing at
 * no sentence — a claim of support with nothing to point at is not a finding.
 * A suggestion that fails either gate is nulled and the finding survives on its
 * rationale. One finding per trait: the first that survives wins.
 */
export function applyCoachGate(
  out: CoachOutput,
  payload: CoachPayload,
): CoachResult {
  const valid = citationPaths(payload);
  const byKey = new Map(payload.traits.map((t) => [t.key, t]));
  const seen = new Set<string>();
  const findings: CoachFinding[] = [];
  let dropped = 0;

  for (const f of out.findings) {
    const trait = byKey.get(f.trait);
    if (!trait || seen.has(f.trait)) {
      dropped++;
      continue;
    }
    const rationale = checkCitation(f.rationale, valid);
    if (!rationale || suggestsGradeOrRecommendation(rationale)) {
      dropped++;
      continue;
    }
    // Evidence is the Sailor's own sentence, resolved by the id the payload
    // published — the model never supplies the text, so it cannot invent a
    // quotation.
    const i = f.evidence_sentence === null ? null : Math.trunc(f.evidence_sentence);
    const evidence =
      i === null ? null : (payload.sentences.find((s) => s.id === i)?.text ?? null);
    if (f.verdict === "substantiated" && evidence === null) {
      dropped++;
      continue;
    }
    const suggestionText = checkCitation(f.suggestion, valid);
    const suggestion =
      suggestionText && !suggestsGradeOrRecommendation(suggestionText)
        ? suggestionText
        : null;
    // `dropped` is what the footer reports as removed, so it must count only
    // what was actually there to remove. z.string() accepts "", and an absent
    // suggestion used to be counted as a removal — three clean findings with
    // empty suggestions read as "3 uncited or duplicate items removed".
    if (!suggestion && f.suggestion.trim()) dropped++;

    seen.add(f.trait);
    findings.push({
      trait: f.trait,
      block: trait.block,
      title: trait.title,
      grade: trait.grade,
      verdict: f.verdict,
      evidence,
      rationale,
      suggestion,
    });
  }

  const notes: string[] = [];
  for (const n of out.narrative_notes) {
    const kept = checkCitation(n, valid);
    if (kept && !suggestsGradeOrRecommendation(kept)) notes.push(kept);
    else dropped++;
  }

  // Reconcile against what was actually asked about. A trait the model skipped
  // or the gates removed must show as unassessed, not vanish: a panel with two
  // cards where three traits were graded reads as "the other one is fine".
  const unassessed: UnassessedTrait[] = payload.traits
    .filter((t) => !seen.has(t.key))
    .map((t) => ({
      trait: t.key,
      block: t.block,
      title: t.title,
      grade: t.grade,
    }));

  return { findings, notes, unassessed, dropped };
}

// ── Model call ───────────────────────────────────────────────────────────────

/** The generateText wrapper the route injects. Exported so the call-shape test
 *  can drive it with "ai" mocked; runEvalCoach never calls generateText itself.
 *  No sampling parameters are sent (repo convention). */
export function buildCallModel(
  resolved: ResolvedAiModel,
): (prompt: string) => Promise<unknown> {
  return async (prompt: string) => {
    const { output } = await generateText({
      model: resolved.model,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(COACH_TIMEOUT_MS),
      system: COACH_SYSTEM_PROMPT,
      prompt,
      output: Output.object({ schema: CoachOutputSchema }),
    });
    return output;
  };
}

export const EMPTY_NARRATIVE_NOTE =
  "Write your Block 43 narrative first — the coach checks what you have written against the grades you set.";
export const NO_GRADES_NOTE =
  "Grade the performance traits first — the coach checks whether your narrative substantiates the grades you set.";

/**
 * Full run. Returns deterministically (no model call, no network) when there is
 * nothing to coach. Throws CoachModelError when the model output will not parse
 * — the route turns that into a 502 and the screen keeps working.
 */
export async function runEvalCoach(
  req: CoachRequest,
  callModel: (prompt: string) => Promise<unknown>,
): Promise<CoachResult & { payload: CoachPayload }> {
  const payload = coachPayload(req);
  const empty = (note: string) => ({
    payload,
    findings: [],
    notes: [note],
    unassessed: [],
    dropped: 0,
  });
  if (payload.sentences.length === 0) return empty(EMPTY_NARRATIVE_NOTE);
  if (payload.traits.length === 0) return empty(NO_GRADES_NOTE);

  const parsed = CoachOutputSchema.safeParse(
    await callModel(JSON.stringify(payload)),
  );
  if (!parsed.success) throw new CoachModelError(parsed.error.message);
  return { payload, ...applyCoachGate(parsed.data, payload) };
}

// ── System prompt ────────────────────────────────────────────────────────────

export const COACH_SYSTEM_PROMPT = `You are the APEX Block 43 Narrative Coach. A U.S. Navy Sailor or reporting senior
has written a performance narrative and has already set the performance-trait
grades that go with it. You answer exactly one question, once per trait: does
this narrative substantiate that grade?

INPUT — one JSON object:
{ report_type, budget, sentences, traits, issues, substantiation_note }
- sentences: the narrative split into units, each { "id": <number>, "text": ... }.
  USE THE id FIELD. Ids start at 0. Never count positions yourself and never
  renumber from 1 — a citation to an id that is not in the payload is deleted
  along with everything attached to it.
- traits: one entry per GRADED trait — key, block number, title, definition, the
  grade the human assigned, and what that grade means on the scale. The printed
  performance standards come in one of two shapes, because the forms differ:
  "anchors" (EVAL and FITREP: separate bullet lists for the 1.0, 3.0 and 5.0
  columns) or "standards" (CHIEFEVAL: one bullet list, no per-grade columns).
  Judge against whichever the trait carries. Never invent the other shape, and
  never infer per-grade wording for a form that does not print it.
- issues: what APEX's rules engine already found for this narrative and these
  grades.
- budget: the physical size of the block — characters per line, maximum lines,
  lines used. These figures are MEASURED BY APEX from the printed form. They are
  not a quotation from an instruction: never attribute them to BUPERSINST or to
  any publication.
- substantiation_note: the substantiation wording printed on this form.

ABSOLUTE RULES
1. NEVER state, suggest, recommend, imply or hint at a trait grade. Not a
   number, not a direction ("higher", "raise this", "reads like a 5.0"). The
   grades are human judgment and are already set; your job is to say whether the
   WRITING supports them. Text that recommends a grade is machine-detected and
   deleted.
2. NEVER write, propose, name or hint at a Block 45 promotion recommendation
   ("Early Promote", "Must Promote", "Promotable", "Progressing", "Significant
   Problems", "PROMOTE AHEAD OF PEERS"), and never comment on Block 46 or any
   block other than 43. If asked for one, refuse in the rationale and cite
   normally.
3. Ground everything in the payload. The anchors in traits[].anchors are the
   only performance standards you may use. If a rule is not in this payload it
   does not exist for you — do not recall Navy policy from memory, and do not
   cite instructions, chapters, or paragraph numbers.
4. CITE. Every rationale, every suggestion, and every narrative_note must END
   with the payload paths it rests on, in square brackets. Valid paths are
   exactly: sentences.<id> (the id FIELD of that sentence), traits.<key>,
   issues.<i>, budget, substantiation_note. Example: "Nothing here names what
   you produced or the standard you held it to. [traits.work, sentences.2]".
   Citations are machine-checked after you respond and any item citing a path
   that does not resolve is DELETED — a claim you cannot cite is a claim you
   lose, and the Sailor loses the whole finding with it.
5. Do not quote the narrative. To point at a sentence set evidence_sentence to
   its id; APEX inserts the Sailor's own text. Use null when no sentence
   supports the trait.

HOW TO JUDGE
- substantiated: one specific sentence gives a concrete, verifiable action or
  result that matches this trait's printed standards at the level the human
  graded. A low grade is substantiated by evidence of the SHORTFALL, not by
  evidence of good work.
- partial: the narrative touches the trait but stays generic, unquantified, or
  carries less weight than the grade claims.
- unsupported: no sentence addresses this trait at all, or what is there works
  against the grade.
A superlative is not substantiation. "OUTSTANDING PERFORMER" states a
conclusion; "REBUILT THE WATCHBILL FOR 42 SAILORS, CLOSING A 3-MONTH
CERTIFICATION GAP" is evidence.

WRITE FOR THE SAILOR
Second person, plain language, no jargon, and no engine field names in the prose
— the bracketed citation is the only place a path may appear. rationale: one or
two sentences saying exactly what is or is not there. suggestion: one concrete
direction naming what to add — the metric, the scope, the outcome, the standard
met — never a finished sentence to paste in, and never a number, award,
qualification, system or event that is not already in the narrative.

narrative_notes: at most three notes about the narrative as a whole — space used
against the budget, an issues[] entry to act on, an unmet substantiation
requirement. Same citation rule.

OUTPUT — one JSON object only, no markdown fences, no prose before or after:
{
  "findings": [
    { "trait": "<key from traits>", "verdict": "substantiated" | "partial" |
      "unsupported", "evidence_sentence": <a sentence id, or null>,
      "rationale": "... [traits.<key>, sentences.<id>]",
      "suggestion": "... [traits.<key>]" }
  ],
  "narrative_notes": ["... [budget]"]
}
Emit exactly one finding for EVERY trait in traits, in payload order. A trait you
omit is shown to the Sailor as unassessed.`;
