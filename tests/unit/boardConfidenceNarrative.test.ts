// tests/unit/boardConfidenceNarrative.test.ts
//
// generateNarrative / fallbackNarrative (spec §4.3): keyless deterministic
// fallback, the exact mocked Claude call shape (claude-opus-4-8 rejects
// sampling params — none may ever be sent), failure → fallback, the §4.3.4
// privacy floor (no PII in the model payload), and the parsed_output-null path.
// NO live API calls: the Anthropic SDK is mocked; the key is set/deleted per test.

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const h = vi.hoisted(() => {
  const parseMock = vi.fn();
  const anthropicCtor = vi.fn(function () {
    return { messages: { parse: parseMock } };
  });
  return { parseMock, anthropicCtor };
});

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, default: h.anthropicCtor };
});

import {
  generateNarrative,
  fallbackNarrative,
  NarrativeSchema,
  NARRATIVE_MODEL,
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

const ORIGINAL_KEY = process.env.ANTHROPIC_API_KEY;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.ANTHROPIC_API_KEY;
});

afterAll(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = ORIGINAL_KEY;
});

describe("generateNarrative — keyless fallback (feature works without ANTHROPIC_API_KEY)", () => {
  it("resolves the fallback outcome without constructing the SDK client", async () => {
    const out = await generateNarrative(fixtureResult);
    expect(out.source).toBe("fallback");
    expect(out.model).toBeNull();
    expect(NarrativeSchema.safeParse(out.narrative).success).toBe(true);
    expect(h.anthropicCtor).not.toHaveBeenCalled();
    expect(h.parseMock).not.toHaveBeenCalled();
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

describe("generateNarrative — mocked model path (spec §4.3.2 call shape)", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-dummy-key";
  });

  it("calls messages.parse with the pinned shape and NO sampling parameters", async () => {
    h.parseMock.mockResolvedValue({ parsed_output: validNarrative });

    const out = await generateNarrative(fixtureResult);

    expect(h.anthropicCtor).toHaveBeenCalled();
    expect(h.parseMock).toHaveBeenCalledTimes(1);
    const args = h.parseMock.mock.calls[0][0];
    expect(args.model).toBe("claude-opus-4-8");
    expect(args.model).toBe(NARRATIVE_MODEL);
    expect(args.max_tokens).toBe(4096);
    expect(args.thinking).toEqual({ type: "adaptive" });
    expect(args.output_config?.format).toBeDefined();
    // claude-opus-4-8 rejects sampling params with a 400 — never sent.
    expect(args).not.toHaveProperty("temperature");
    expect(args).not.toHaveProperty("top_p");
    expect(args).not.toHaveProperty("top_k");

    expect(out.source).toBe("model");
    expect(out.model).toBe(NARRATIVE_MODEL);
    expect(out.narrative).toEqual(validNarrative);
  });

  it("privacy: the user message contains none of the planted sentinels (§4.3.4)", async () => {
    h.parseMock.mockResolvedValue({ parsed_output: validNarrative });

    await generateNarrative(fixtureResult);

    const serialized = JSON.stringify(h.parseMock.mock.calls[0][0].messages);
    for (const sentinel of SENTINELS) {
      expect(serialized).not.toContain(sentinel);
    }
  });

  it("model failure → fallback outcome, never a throw", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.parseMock.mockRejectedValue(new Error("429 rate limited"));

    const out = await generateNarrative(fixtureResult);

    expect(out.source).toBe("fallback");
    expect(out.model).toBeNull();
    expect(out.narrative).toEqual(fallbackNarrative(fixtureResult));
    errSpy.mockRestore();
  });

  it("parsed_output: null → fallback outcome", async () => {
    h.parseMock.mockResolvedValue({ parsed_output: null });

    const out = await generateNarrative(fixtureResult);

    expect(out.source).toBe("fallback");
    expect(out.model).toBeNull();
    expect(NarrativeSchema.safeParse(out.narrative).success).toBe(true);
  });
});
