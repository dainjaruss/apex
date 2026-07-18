// lib/boardConfidence/narrative.ts
//
// AI narrative (strengths / gaps / recommendations) for a board-confidence run.
// Model path uses Claude structured output when ANTHROPIC_API_KEY is configured;
// otherwise (and on ANY model failure) a deterministic rubric-derived fallback is
// returned, so the feature is fully functional keyless. Spec §4.3.
//
// Privacy (normative): the model payload is built ONLY from RubricResult numbers
// plus non-identifying context (precept flags, target paygrade, rating abbrev).
// No names, DoD IDs, eval comments, award titles, tour titles, or adverse entry
// details ever leave the server — the raw RubricInputs object is never passed in.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
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

export const NARRATIVE_MODEL = "claude-opus-4-8";

export interface NarrativeOutcome {
  narrative: Narrative;
  source: "model" | "fallback";
  model: string | null; // NARRATIVE_MODEL when source === "model", else null
  // v1.1 review fix: why the fallback was used (null when source === "model") —
  // "no_key" = ANTHROPIC_API_KEY unset; "model_error" = model call failed/unparseable.
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
  "invent facts that are not in the payload. Produce 2-5 items per list " +
  "(strengths, gaps, recommendations). Phrase each recommendation as a concrete " +
  "record action (e.g. \"close out the eval gap\", \"verify the award in OMPF via " +
  "NDAWS\", \"answer the remaining LaDR checklist items\"). This tool is not a " +
  "selection board: never claim to predict board results or selection outcomes.";

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

/** Model path when ANTHROPIC_API_KEY is set; otherwise returns fallbackNarrative(). */
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

  // Keyless gate: no client constructed, no network touched.
  if (!process.env.ANTHROPIC_API_KEY) return fallbackOutcome("no_key");

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

    // claude-opus-4-8 rejects temperature/top_p/top_k with a 400 — never sent.
    const client = new Anthropic({ timeout: 30_000, maxRetries: 1 });
    const response = await client.messages.parse({
      model: NARRATIVE_MODEL,
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      system: NARRATIVE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: JSON.stringify(payload) }],
      output_config: { format: zodOutputFormat(NarrativeSchema) },
    });

    if (!response.parsed_output) return fallbackOutcome("model_error");
    return {
      narrative: response.parsed_output,
      source: "model",
      model: NARRATIVE_MODEL,
      fallbackReason: null,
    };
  } catch (err) {
    // The analyze route never fails because of the narrative.
    console.error("board narrative generation failed:", err);
    return fallbackOutcome("model_error");
  }
}
