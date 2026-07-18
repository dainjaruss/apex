// lib/boardConfidence/narrative.ts
//
// AI narrative (strengths / gaps / recommendations) for a board-confidence run.
// Model path uses AI SDK structured output through the Vercel AI Gateway
// (any provider — BOARD_NARRATIVE_MODEL env, e.g. anthropic/… or xai/grok-…);
// otherwise (and on ANY model failure) a deterministic rubric-derived fallback is
// returned, so the feature is fully functional keyless. Spec §4.3.
//
// Privacy (normative): the model payload is built ONLY from RubricResult numbers
// plus non-identifying context (precept flags, target paygrade, rating abbrev).
// No names, DoD IDs, eval comments, award titles, tour titles, or adverse entry
// details ever leave the server — the raw RubricInputs object is never passed in.

import { generateText, Output } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import type {
  FactorKey,
  FactorResult,
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
export const DEFAULT_NARRATIVE_MODEL = "anthropic/claude-opus-4.8";

export const narrativeModelId = (): string =>
  process.env.BOARD_NARRATIVE_MODEL || DEFAULT_NARRATIVE_MODEL;

export interface NarrativeOutcome {
  narrative: Narrative;
  source: "model" | "fallback";
  model: string | null; // the gateway model id used when source === "model", else null
  // v1.1 review fix: why the fallback was used (null when source === "model") —
  // "no_key" = no gateway credentials; "model_error" = model call failed/unparseable.
  fallbackReason: "no_key" | "model_error" | null;
}

/** Non-identifying context the service may pass alongside the rubric result. */
export interface NarrativeContext {
  preceptFlags?: PreceptFlag[];
  targetPaygrade?: number | null;
  ratingAbbrev?: string | null;
}

export const NARRATIVE_SYSTEM_PROMPT =
  "You generate self-development feedback for the APEX Board Confidence Analyzer, " +
  "an UNOFFICIAL U.S. Navy record self-assessment tool. The user message is a JSON " +
  "payload of deterministic rubric output: six factor results (key, weight, score, " +
  "confidence, contribution, detail — including per-category LaDR completion " +
  "ratios), the overall score with its confidence band, the adverse adjustment " +
  "amount, the active precept emphasis flags, and the member's target paygrade and " +
  "rating abbreviation. Ground every statement in those provided numbers; never " +
  "invent facts, milestones, or qualifications that are not in the payload. " +
  "CITE your grounding: every strengths/gaps/recommendations item must end with " +
  "the payload path(s) it derives from in square brackets, e.g. " +
  "[performance.detail.P1] or [development.detail.categories.qual_warfare]. A " +
  "statement you cannot cite to a payload field must not be made. The " +
  "factor_commentary.development entry must explicitly compare the record " +
  "against the rating's LaDR: name each LaDR category in the payload whose " +
  "completion ratio is below 1.0 and what completing it would change. Produce " +
  "2-5 items per list (strengths, gaps, recommendations). Phrase each " +
  "recommendation as a concrete record action (e.g. \"close out the eval gap\", " +
  "\"verify the award in OMPF via NDAWS\", \"answer the remaining LaDR checklist " +
  "items\"). This tool is not a selection board: never claim to predict board " +
  "results or selection outcomes.";

const FACTOR_LABELS: Record<FactorKey, string> = {
  performance: "Performance",
  leadership: "Leadership & Impact",
  development: "Professional Development (LaDR)",
  continuity: "Evaluation Continuity",
  completeness: "Record Completeness",
  precept: "Precept Alignment",
};

/** Fixed per-factor remediation strings, keyed on which detail fields are low. */
function remediationsFor(f: FactorResult): string[] {
  const out: string[] = [];
  const d = f.detail;
  switch (f.key) {
    case "performance":
      if (typeof d.declinePenalty === "number" && d.declinePenalty > 0)
        out.push(
          "Rebuild a consistent or improving promotion-recommendation trend — an unexplained declining recommendation reads as a negative to a board.",
        );
      if (f.confidence < 1)
        out.push(
          "Enter every finalized evaluation — fewer than three observed reports sharply reduces scoring confidence.",
        );
      break;
    case "leadership":
      if (f.confidence < 1)
        out.push(
          "Enter your tours and awards in the Record Entry tab — missing leadership sections shrink this factor toward zero.",
        );
      else if (f.score < 70)
        out.push(
          "Document leadership roles (LPO/LCPO/WCS/Section Leader) and verify each decoration in OMPF via NDAWS.",
        );
      break;
    case "development":
      if (f.confidence < 1)
        out.push(
          "Answer the remaining LaDR checklist items — unanswered items lower confidence without counting against you.",
        );
      if (f.score < 70)
        out.push(
          "Close the highest-weight LaDR milestones first: warfare qualification and required PME.",
        );
      break;
    case "continuity":
      if (typeof d.coverage === "number" && d.coverage < 0.95)
        out.push(
          "Close the evaluation continuity gap — boards verify five years of unbroken reports.",
        );
      break;
    case "completeness":
      if (f.score < 100)
        out.push(
          "Complete every PSR section and verify entries in OMPF — an incomplete record cannot be fully briefed.",
        );
      break;
    case "precept":
      if (f.score < 70)
        out.push(
          "Align your record with the active board precept's emphasis areas.",
        );
      break;
  }
  return out;
}

/** Deterministic, rubric-derived text. No I/O. Used keyless and on any model failure. */
export function fallbackNarrative(result: RubricResult): Narrative {
  const strengths: string[] = [];
  const gaps: string[] = [];
  const recommendations: string[] = [];
  const factor_commentary = {} as Record<FactorKey, string>;

  for (const f of result.factors) {
    if (f.weight <= 0 || f.detail.excluded === true) {
      factor_commentary[f.key] =
        "Excluded — no active board precept is configured; its weight was redistributed across the other factors.";
      continue;
    }
    factor_commentary[f.key] =
      `Contributed ${f.contribution.toFixed(1)} of ${f.weight.toFixed(1)} possible points ` +
      `(score ${f.score.toFixed(1)}, confidence ${f.confidence.toFixed(2)}).`;

    // Strength: score × confidence ≥ 70 (contribution ÷ (weight/100)).
    if (f.contribution / (f.weight / 100) >= 70) {
      strengths.push(
        `${FACTOR_LABELS[f.key]} is a strength — contributing ${f.contribution.toFixed(1)} of ${f.weight.toFixed(1)} possible points.`,
      );
    }
    // Gap: contribution below half the factor's weight.
    if (f.contribution < f.weight / 2) {
      gaps.push(
        `${FACTOR_LABELS[f.key]} is holding the score down — only ${f.contribution.toFixed(1)} of ${f.weight.toFixed(1)} possible points.`,
      );
    }
    recommendations.push(...remediationsFor(f));
  }

  gaps.push(...result.warnings);

  return {
    strengths,
    gaps,
    recommendations,
    factor_commentary: factor_commentary as Narrative["factor_commentary"],
  };
}

/** Model path when gateway credentials exist; otherwise returns fallbackNarrative(). */
export async function generateNarrative(
  result: RubricResult,
  context?: NarrativeContext,
): Promise<NarrativeOutcome> {
  const fallbackOutcome = (
    fallbackReason: "no_key" | "model_error",
  ): NarrativeOutcome => ({
    narrative: fallbackNarrative(result),
    source: "fallback",
    model: null,
    fallbackReason,
  });

  // Keyless gate: no request constructed, no network touched. Direct mode
  // (BOARD_NARRATIVE_BASE_URL) needs no Vercel service at all; gateway mode
  // authenticates via AI_GATEWAY_API_KEY or Vercel OIDC on deployments.
  const directBaseUrl = process.env.BOARD_NARRATIVE_BASE_URL;
  const hasGatewayAuth =
    !!process.env.AI_GATEWAY_API_KEY || !!process.env.VERCEL_OIDC_TOKEN;
  if (!directBaseUrl && !hasGatewayAuth) return fallbackOutcome("no_key");

  try {
    // Strict no-PII payload (spec §4.3 item 4): factor numbers + structured
    // non-identifying inputs only. adverseAdjustment is a number, never entries.
    const payload = {
      factors: result.factors,
      final: result.final,
      band: result.band,
      bandLabel: result.bandLabel,
      adverseAdjustment: result.adverseAdjustment,
      preceptFlags: context?.preceptFlags ?? [],
      targetPaygrade: context?.targetPaygrade ?? null,
      ratingAbbrev: context?.ratingAbbrev ?? null,
    };

    const modelId = narrativeModelId();
    // Direct endpoint wins over the gateway when both are configured.
    const model = directBaseUrl
      ? createOpenAICompatible({
          name: "board-narrative",
          baseURL: directBaseUrl,
          apiKey: process.env.BOARD_NARRATIVE_API_KEY,
          supportsStructuredOutputs: true,
        })(modelId)
      : modelId; // gateway "provider/model" string
    const { output } = await generateText({
      model,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(30_000),
      system: NARRATIVE_SYSTEM_PROMPT,
      prompt: JSON.stringify(payload),
      output: Output.object({ schema: NarrativeSchema }),
    });

    if (!output) return fallbackOutcome("model_error");
    return {
      narrative: output,
      source: "model",
      model: modelId,
      fallbackReason: null,
    };
  } catch (err) {
    // The analyze route never fails because of the narrative.
    console.error("board narrative generation failed:", err);
    return fallbackOutcome("model_error");
  }
}
