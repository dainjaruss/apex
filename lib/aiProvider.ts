// lib/aiProvider.ts
//
// Shared AI provider resolution (spec §4.1) — extracted from
// lib/boardConfidence/narrative.ts so board-confidence and brag-sheet autofill
// resolve models identically. Two independent paths — NEITHER requires hosting
// on (or any service from) Vercel:
//  1. DIRECT (self-host friendly): env[baseUrlVar] = any OpenAI-compatible
//     endpoint + env[apiKeyVar] (omit for keyless local endpoints) +
//     env[modelVar] = that provider's NATIVE model id. Takes precedence.
//  2. GATEWAY (one key, many providers): env[modelVar] = "provider/model"
//     string, auth via AI_GATEWAY_API_KEY (or OIDC when deployed on Vercel).
// Env is read at call time, never at module load.

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export interface AiEnvConfig {
  baseUrlVar: string; // e.g. "BOARD_NARRATIVE_BASE_URL"
  apiKeyVar: string; // e.g. "BOARD_NARRATIVE_API_KEY"
  modelVar: string; // e.g. "BOARD_NARRATIVE_MODEL"
  name: string; // provider instance name for createOpenAICompatible
}

export interface ResolvedAiModel {
  model: string | LanguageModel; // gateway ⇒ "provider/model" STRING; direct ⇒ model OBJECT
  modelId: string; // the id actually used (persisted/audited)
  mode: "direct" | "gateway";
}

/** null = keyless (no direct baseURL AND no gateway auth) — caller decides fallback/503. */
export function resolveAiModel(
  env: AiEnvConfig,
  defaultModel: string,
): ResolvedAiModel | null {
  const modelId = process.env[env.modelVar] || defaultModel;

  // Direct endpoint wins over the gateway when both are configured.
  const baseURL = process.env[env.baseUrlVar];
  if (baseURL) {
    return {
      model: createOpenAICompatible({
        name: env.name,
        baseURL,
        apiKey: process.env[env.apiKeyVar],
        supportsStructuredOutputs: true,
      })(modelId),
      modelId,
      mode: "direct",
    };
  }

  if (process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN) {
    return { model: modelId, modelId, mode: "gateway" };
  }

  return null;
}
