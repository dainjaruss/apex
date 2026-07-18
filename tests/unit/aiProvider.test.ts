// tests/unit/aiProvider.test.ts
//
// resolveAiModel (brag-sheet spec §4.1) — the shared provider resolution
// extracted from lib/boardConfidence/narrative.ts. Pins: direct mode returns a
// provider model OBJECT, gateway mode a "provider/model" STRING, direct wins
// over gateway, keyless returns null, and env is read at call time (never at
// module load). The 12 existing tests in boardConfidenceNarrative.test.ts are
// the regression gate for the narrative.ts refactor and run unmodified.

import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { resolveAiModel, type AiEnvConfig } from "@/lib/aiProvider";

const ENV_CONFIG: AiEnvConfig = {
  baseUrlVar: "BOARD_NARRATIVE_BASE_URL",
  apiKeyVar: "BOARD_NARRATIVE_API_KEY",
  modelVar: "BOARD_NARRATIVE_MODEL",
  name: "board-narrative",
};

const DEFAULT_MODEL = "anthropic/claude-opus-4.8";

const ENV_KEYS = [
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
  "BOARD_NARRATIVE_MODEL",
  "BOARD_NARRATIVE_BASE_URL",
  "BOARD_NARRATIVE_API_KEY",
] as const;
const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((k) => [k, process.env[k]]),
);

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL_ENV[k];
  }
});

describe("resolveAiModel — keyless", () => {
  it("returns null when no direct baseURL and no gateway auth exist", () => {
    expect(resolveAiModel(ENV_CONFIG, DEFAULT_MODEL)).toBeNull();
  });

  it("returns null even when only the model var is set (a model id is not auth)", () => {
    process.env.BOARD_NARRATIVE_MODEL = "xai/grok-4.5";
    expect(resolveAiModel(ENV_CONFIG, DEFAULT_MODEL)).toBeNull();
  });
});

describe("resolveAiModel — gateway mode (string model)", () => {
  it("AI_GATEWAY_API_KEY alone resolves the default model as a STRING", () => {
    process.env.AI_GATEWAY_API_KEY = "test-dummy-key";
    const resolved = resolveAiModel(ENV_CONFIG, DEFAULT_MODEL);
    expect(resolved).not.toBeNull();
    expect(resolved!.mode).toBe("gateway");
    expect(resolved!.model).toBe(DEFAULT_MODEL);
    expect(typeof resolved!.model).toBe("string");
    expect(resolved!.modelId).toBe(DEFAULT_MODEL);
  });

  it("VERCEL_OIDC_TOKEN alone also enables the gateway path", () => {
    process.env.VERCEL_OIDC_TOKEN = "oidc-token";
    const resolved = resolveAiModel(ENV_CONFIG, DEFAULT_MODEL);
    expect(resolved).not.toBeNull();
    expect(resolved!.mode).toBe("gateway");
    expect(resolved!.model).toBe(DEFAULT_MODEL);
  });

  it("the model env var overrides the default (any gateway provider)", () => {
    process.env.AI_GATEWAY_API_KEY = "test-dummy-key";
    process.env.BOARD_NARRATIVE_MODEL = "xai/grok-4.5";
    const resolved = resolveAiModel(ENV_CONFIG, DEFAULT_MODEL);
    expect(resolved!.model).toBe("xai/grok-4.5");
    expect(resolved!.modelId).toBe("xai/grok-4.5");
  });
});

describe("resolveAiModel — direct OpenAI-compatible mode (object model)", () => {
  it("baseURL + key + model resolves an OBJECT model with the expected modelId", () => {
    process.env.BOARD_NARRATIVE_BASE_URL = "https://api.x.ai/v1";
    process.env.BOARD_NARRATIVE_API_KEY = "xai-test-key";
    process.env.BOARD_NARRATIVE_MODEL = "grok-4-fast";
    const resolved = resolveAiModel(ENV_CONFIG, DEFAULT_MODEL);
    expect(resolved).not.toBeNull();
    expect(resolved!.mode).toBe("direct");
    expect(typeof resolved!.model).toBe("object");
    expect((resolved!.model as { modelId: string }).modelId).toBe("grok-4-fast");
    expect(resolved!.modelId).toBe("grok-4-fast");
  });

  it("works keyless against local endpoints (baseURL without an API key)", () => {
    process.env.BOARD_NARRATIVE_BASE_URL = "http://localhost:11434/v1";
    process.env.BOARD_NARRATIVE_MODEL = "llama3.3";
    const resolved = resolveAiModel(ENV_CONFIG, DEFAULT_MODEL);
    expect(resolved).not.toBeNull();
    expect(resolved!.mode).toBe("direct");
    expect((resolved!.model as { modelId: string }).modelId).toBe("llama3.3");
  });

  it("direct wins over gateway when both are configured", () => {
    process.env.AI_GATEWAY_API_KEY = "gateway-key";
    process.env.BOARD_NARRATIVE_BASE_URL = "https://api.x.ai/v1";
    process.env.BOARD_NARRATIVE_MODEL = "grok-4-fast";
    const resolved = resolveAiModel(ENV_CONFIG, DEFAULT_MODEL);
    expect(resolved!.mode).toBe("direct");
    // Object model = direct path; a string would mean the gateway won.
    expect(typeof resolved!.model).toBe("object");
  });
});

describe("resolveAiModel — env read at call time, never at module load", () => {
  it("two calls with mutated env return different results", () => {
    expect(resolveAiModel(ENV_CONFIG, DEFAULT_MODEL)).toBeNull();

    process.env.AI_GATEWAY_API_KEY = "test-dummy-key";
    const gateway = resolveAiModel(ENV_CONFIG, DEFAULT_MODEL);
    expect(gateway!.mode).toBe("gateway");

    process.env.BOARD_NARRATIVE_BASE_URL = "http://localhost:11434/v1";
    const direct = resolveAiModel(ENV_CONFIG, DEFAULT_MODEL);
    expect(direct!.mode).toBe("direct");

    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.BOARD_NARRATIVE_BASE_URL;
    expect(resolveAiModel(ENV_CONFIG, DEFAULT_MODEL)).toBeNull();
  });
});
