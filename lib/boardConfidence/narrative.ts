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
import type { ReadinessReport } from "@/lib/boardConfidence/readiness";
import type {
  FactorKey,
  PreceptFlag,
  RubricResult,
} from "@/lib/boardConfidence/types";

export const NarrativeSchema = z.object({
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
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
export type Narrative = z.infer<typeof NarrativeSchema>;

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
  narrative: Narrative;
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

const AREA_ORDER: FactorKey[] = [
  "performance",
  "leadership",
  "development",
  "continuity",
  "completeness",
  "precept",
];

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
 * Keep an item only if it cites at least one real path, and strip the brackets
 * from what the Sailor reads — the citation proves grounding, it is not copy.
 * Returns null when the item cites nothing that resolves.
 */
function checkCitation(text: string, valid: Set<string>): string | null {
  const cited: string[] = [];
  for (const m of Array.from(text.match(CITATION_RE) ?? []))
    for (const part of m.slice(1, -1).split(",")) cited.push(part.trim());
  if (!cited.some((c) => valid.has(c))) return null;
  return text.replace(CITATION_RE, "").replace(/\s{2,}/g, " ").trim();
}

/**
 * Drop unciteable list items; fall back to the deterministic text for any
 * factor_commentary entry that cannot be cited (the schema requires all six, so
 * they cannot be deleted — but an unsupported one must not be shown either).
 */
export function applyCitationGate(
  narrative: Narrative,
  payload: NarrativePayload,
  deterministic: Narrative,
): Narrative {
  const valid = citationPaths(payload);
  const list = (items: string[]) =>
    items.map((t) => checkCitation(t, valid)).filter((t): t is string => !!t);

  const factor_commentary = { ...narrative.factor_commentary };
  for (const key of AREA_ORDER) {
    const kept = checkCitation(factor_commentary[key] ?? "", valid);
    factor_commentary[key] = kept ?? deterministic.factor_commentary[key];
  }

  return {
    strengths: list(narrative.strengths),
    gaps: list(narrative.gaps),
    recommendations: list(narrative.recommendations),
    factor_commentary,
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

  const recommendations = [
    ...report.actions.map((a) => a.action),
    ...report.coverage.missing.map((m) => m.howTo),
    ...(report.confirmInOmpf ? [report.confirmInOmpf.note] : []),
  ].slice(0, MAX_ITEMS);

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
      output: Output.object({ schema: NarrativeSchema }),
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
