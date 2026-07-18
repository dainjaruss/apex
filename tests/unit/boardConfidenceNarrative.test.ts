// tests/unit/boardConfidenceNarrative.test.ts
//
// generateNarrative / fallbackNarrative (spec §4.3, v1.3 provider-agnostic):
// keyless deterministic fallback, the mocked AI-SDK gateway call shape (model
// string from BOARD_NARRATIVE_MODEL — Anthropic, xAI Grok, or any gateway
// provider), failure → fallback, the §4.3.4 privacy floor (no PII in the model
// payload), and the no-output path. NO live API calls: ai.generateText is
// mocked; gateway credentials are set/deleted per test.

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const h = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, generateText: h.generateText };
});

import {
  generateNarrative,
  fallbackNarrative,
  NarrativeSchema,
  DEFAULT_NARRATIVE_MODEL,
  narrativeModelId,
  type Narrative,
} from "@/lib/boardConfidence/narrative";
import type {
  FactorKey,
  FactorResult,
  RubricResult,
} from "@/lib/boardConfidence/types";

// Sentinel strings planted in the fixture: none may ever reach the model.
const SENTINEL_MEMBER_NAME = "SAILOR, SENTINEL Q";
const SENTINEL_DOD_ID = "9876543210";
const SENTINEL_AWARD_TITLE = "SENTINEL ACHIEVEMENT MEDAL";
const SENTINEL_ADVERSE_NOTE = "SENTINEL NJP NOTE ALPHA";
const SENTINELS = [
  SENTINEL_MEMBER_NAME,
  SENTINEL_DOD_ID,
  SENTINEL_AWARD_TITLE,
  SENTINEL_ADVERSE_NOTE,
];

const f = (
  key: FactorKey,
  weight: number,
  score: number,
  confidence: number,
  detail: FactorResult["detail"] = {},
): FactorResult => ({
  key,
  weight,
  score,
  confidence,
  contribution: (weight / 100) * score * confidence,
  detail,
});

const fixtureResult: RubricResult = {
  final: 62.4,
  band: 50,
  bandLabel: "Crunch — middle band",
  adverseAdjustment: 15,
  factors: [
    f("performance", 40, 82, 1, {
      P1: 80,
      P2: 76,
      P3: 55,
      P4: 40,
      declinePenalty: 0,
      nObserved: 5,
      availableSubweight: 1,
    }),
    f("leadership", 15, 45, 0.7, { L1: 50, L2: 18 }),
    f("development", 15, 60, 0.5, {}),
    f("continuity", 10, 85, 1, { coverage: 0.9, gapCount: 1 }),
    f("completeness", 10, 55, 1, {}),
    f("precept", 10, 50, 1, {}),
  ],
  warnings: [
    `Excluded 1 report for ${SENTINEL_MEMBER_NAME} (dod_id ${SENTINEL_DOD_ID}).`,
    `Award not verified in OMPF: ${SENTINEL_AWARD_TITLE}.`,
    `Adverse entry on file: ${SENTINEL_ADVERSE_NOTE}.`,
  ],
};

const validNarrative: Narrative = {
  strengths: ["Sustained performance above the summary group average."],
  gaps: ["Warfare qualification is incomplete."],
  recommendations: ["Verify the award in OMPF via NDAWS."],
  factor_commentary: {
    performance: "Strong recent recommendations.",
    leadership: "One leadership tour on record.",
    development: "LaDR checklist partially answered.",
    continuity: "One gap over 90 days in the window.",
    completeness: "Several record sections are unentered.",
    precept: "Partial alignment with the active precept.",
  },
};

const ENV_KEYS = [
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
  "BOARD_NARRATIVE_MODEL",
] as const;
const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((k) => [k, process.env[k]]),
);

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) delete process.env[k];
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL_ENV[k];
  }
});

describe("generateNarrative — keyless fallback (feature works without gateway credentials)", () => {
  it("resolves the fallback outcome without touching the AI SDK", async () => {
    const out = await generateNarrative(fixtureResult);
    expect(out.source).toBe("fallback");
    expect(out.model).toBeNull();
    expect(out.fallbackReason).toBe("no_key");
    expect(NarrativeSchema.safeParse(out.narrative).success).toBe(true);
    expect(h.generateText).not.toHaveBeenCalled();
  });

  it("is deterministic: same RubricResult twice → identical text", async () => {
    const a = await generateNarrative(fixtureResult);
    const b = await generateNarrative(fixtureResult);
    expect(a.narrative).toEqual(b.narrative);
    expect(a.narrative).toEqual(fallbackNarrative(fixtureResult));
  });

  it("fallbackNarrative is schema-valid and pure", () => {
    const n1 = fallbackNarrative(fixtureResult);
    const n2 = fallbackNarrative(fixtureResult);
    expect(NarrativeSchema.safeParse(n1).success).toBe(true);
    expect(n1).toEqual(n2);
  });
});

describe("generateNarrative — mocked gateway model path (spec §4.3.2, v1.3)", () => {
  beforeEach(() => {
    process.env.AI_GATEWAY_API_KEY = "test-dummy-key";
  });

  it("calls generateText with the default gateway model string and NO sampling parameters", async () => {
    h.generateText.mockResolvedValue({ output: validNarrative });

    const out = await generateNarrative(fixtureResult);

    expect(h.generateText).toHaveBeenCalledTimes(1);
    const args = h.generateText.mock.calls[0][0];
    expect(args.model).toBe(DEFAULT_NARRATIVE_MODEL);
    expect(args.model).toBe("anthropic/claude-opus-4.8");
    expect(args.maxRetries).toBe(1);
    expect(typeof args.system).toBe("string");
    expect(args.output).toBeDefined();
    // Sampling params are never sent — some gateway models reject them.
    expect(args).not.toHaveProperty("temperature");
    expect(args).not.toHaveProperty("topP");
    expect(args).not.toHaveProperty("topK");

    expect(out.source).toBe("model");
    expect(out.model).toBe(DEFAULT_NARRATIVE_MODEL);
    expect(out.fallbackReason).toBeNull();
    expect(out.narrative).toEqual(validNarrative);
  });

  it("BOARD_NARRATIVE_MODEL selects any gateway provider (e.g. xAI Grok)", async () => {
    process.env.BOARD_NARRATIVE_MODEL = "xai/grok-4.5";
    h.generateText.mockResolvedValue({ output: validNarrative });

    const out = await generateNarrative(fixtureResult);

    expect(narrativeModelId()).toBe("xai/grok-4.5");
    expect(h.generateText.mock.calls[0][0].model).toBe("xai/grok-4.5");
    expect(out.source).toBe("model");
    expect(out.model).toBe("xai/grok-4.5");
  });

  it("privacy: the prompt and system text contain none of the planted sentinels (§4.3.4)", async () => {
    h.generateText.mockResolvedValue({ output: validNarrative });

    await generateNarrative(fixtureResult);

    const args = h.generateText.mock.calls[0][0];
    const serialized = JSON.stringify({
      prompt: args.prompt,
      system: args.system,
    });
    for (const sentinel of SENTINELS) {
      expect(serialized).not.toContain(sentinel);
    }
  });

  it("model failure → fallback outcome, never a throw", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.generateText.mockRejectedValue(new Error("429 rate limited"));

    const out = await generateNarrative(fixtureResult);

    expect(out.source).toBe("fallback");
    expect(out.model).toBeNull();
    expect(out.fallbackReason).toBe("model_error");
    expect(out.narrative).toEqual(fallbackNarrative(fixtureResult));
    errSpy.mockRestore();
  });

  it("missing output → fallback outcome", async () => {
    h.generateText.mockResolvedValue({ output: undefined });

    const out = await generateNarrative(fixtureResult);

    expect(out.source).toBe("fallback");
    expect(out.model).toBeNull();
    expect(out.fallbackReason).toBe("model_error");
    expect(NarrativeSchema.safeParse(out.narrative).success).toBe(true);
  });

  it("OIDC-only environments (Vercel deployments) also take the model path", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    process.env.VERCEL_OIDC_TOKEN = "oidc-token";
    h.generateText.mockResolvedValue({ output: validNarrative });

    const out = await generateNarrative(fixtureResult);
    expect(out.source).toBe("model");
  });
});
