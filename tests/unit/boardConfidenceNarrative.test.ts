// tests/unit/boardConfidenceNarrative.test.ts
//
// generateNarrative / fallbackNarrative (spec §4.3, §14): the keyless
// deterministic fallback, the mocked AI-SDK call shape (gateway string and
// direct provider object), failure → fallback, the §4.3.4 privacy floor, and
// the two v2 gates — NO score leakage (the narrative may not print or let a
// reader reconstruct a composite the readiness layer suppressed) and
// citation-or-delete (a bracket that resolves to nothing is deleted, not shown).
// NO live API calls: ai.generateText is mocked; credentials are set per test.

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const h = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, generateText: h.generateText };
});

import {
  generateNarrative,
  fallbackNarrative,
  narrativePayload,
  applyCitationGate,
  citationPaths,
  NarrativeSchema,
  NARRATIVE_SYSTEM_PROMPT,
  DEFAULT_NARRATIVE_MODEL,
  narrativeModelId,
  type Narrative,
} from "@/lib/boardConfidence/narrative";
import {
  DEFAULT_RUBRIC_CONFIG as CFG,
  scoreBoardConfidence,
} from "@/lib/boardConfidence/rubric";
import { buildReadinessReport } from "@/lib/boardConfidence/readiness";
import type { RubricInputs } from "@/lib/boardConfidence/types";

// Sentinel strings planted in the fixture: none may ever reach the model.
const SENTINEL_MEMBER_NAME = "SAILOR, SENTINEL Q";
const SENTINEL_DOD_ID = "9876543210";
const SENTINEL_AWARD_TITLE = "SENTINEL ACHIEVEMENT MEDAL";
const SENTINEL_TOUR_TITLE = "SENTINEL TOUR BRAVO";
const SENTINELS = [
  SENTINEL_MEMBER_NAME,
  SENTINEL_DOD_ID,
  SENTINEL_AWARD_TITLE,
  SENTINEL_TOUR_TITLE,
];

const annual = (endYear: number, rec: any, ita: number) => ({
  period_from: `${endYear - 1}-03-16`,
  period_to: `${endYear}-03-15`,
  report_type: "EVAL" as const,
  promotion_recommendation: rec,
  trait_average: ita,
  summary_group_average: null,
  rsca: null,
  sea_duty: false,
  ep_count: null,
  group_size: null,
});

const fixtureInputs: RubricInputs = {
  boardDate: "2026-09-01",
  evals: [2022, 2023, 2024, 2025, 2026].map((y) => annual(y, "Promotable", 3.8)),
  psr: {
    entered: true,
    awards: [
      { title: SENTINEL_AWARD_TITLE, level: "personal_achievement", date_awarded: "2024-01-01", verified_in_ompf: false },
    ],
    necs: [{ code: "742A", verified_in_ompf: true }],
    education: [{ kind: "degree", title: "Associate of Science", verified_in_ompf: true }],
    tours: [{ title: SENTINEL_TOUR_TITLE, start: "2021-01-01", end: null, sea_duty: true, leadership: true }],
    pfa: [
      { cycle: "a", date: "2024-04-01", result: "pass" },
      { cycle: "b", date: "2024-10-01", result: "pass" },
      { cycle: "c", date: "2025-04-01", result: "pass" },
    ],
    adverse: [],
  },
  ladr: [
    { milestone_id: "m-warfare", category: "qual_warfare", status: "met", verified_in_ompf: true, item: "Information Warfare (EIWS)" },
    { milestone_id: "m-pme", category: "pme_required", status: "met", verified_in_ompf: true, item: "PO1 Selectee Leadership Course" },
    { milestone_id: "m-cert", category: "credential", status: "not_met", verified_in_ompf: false, item: "CompTIA Security+", typical_months: 2 },
    { milestone_id: "m-deg", category: "education_degree", status: "not_met", verified_in_ompf: false, item: "Occupational-related Associate degree", typical_months: 18 },
  ],
  preceptFlags: ["warfighting", "leadership_positions", "education", "sea_duty", "technical_expertise"],
};

const fixtureResult = scoreBoardConfidence(fixtureInputs, CFG);
const fixtureReport = buildReadinessReport(fixtureResult, fixtureInputs, CFG, {
  asOf: "2026-04-01",
});

// Warnings are server-composed strings shown only to the record owner; they
// carry the sentinels and must never be forwarded to the model.
const fixtureWarnings = [
  `Excluded 1 report for ${SENTINEL_MEMBER_NAME} (dod_id ${SENTINEL_DOD_ID}).`,
];
const resultWithWarnings = { ...fixtureResult, warnings: fixtureWarnings };

/** A model reply whose every item cites a path that really is in the payload. */
const citedNarrative = (): Narrative => ({
  strengths: ["Your reporting periods run without a break. [areas.continuity]"],
  gaps: ["Most of your rating's roadmap is still open. [areas.development]"],
  recommendations: ["Complete CompTIA Security+. [actions.ladr:m-cert:meet]"],
  factor_commentary: {
    performance: "Solid recent reports. [areas.performance]",
    leadership: "Sea time and a leadership billet. [areas.leadership]",
    development: "Two milestones still open. [unmet.m-cert]",
    continuity: "No break between reports. [areas.continuity]",
    completeness: "Most sections entered. [areas.completeness]",
    precept: "Emphasis areas partly covered. [areas.precept]",
  },
});

const ENV_KEYS = [
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
  "BOARD_NARRATIVE_MODEL",
  "BOARD_NARRATIVE_BASE_URL",
  "BOARD_NARRATIVE_API_KEY",
] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

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

const run = (r = fixtureResult) => generateNarrative(fixtureReport, r);

describe("the model id must actually resolve", () => {
  it("is a hyphenated gateway id — Anthropic model ids never contain a dot", () => {
    // "anthropic/claude-opus-4.8" was malformed in BOTH modes and could never
    // resolve, so the default silently guaranteed the keyless fallback.
    expect(DEFAULT_NARRATIVE_MODEL).toBe("anthropic/claude-opus-5");
    expect(DEFAULT_NARRATIVE_MODEL).not.toMatch(/\d\.\d/);
    expect(DEFAULT_NARRATIVE_MODEL.split("/")).toHaveLength(2);
  });
});

describe("generateNarrative — keyless fallback (feature works without credentials)", () => {
  it("resolves the fallback outcome without touching the AI SDK", async () => {
    const out = await run();
    expect(out.source).toBe("fallback");
    expect(out.model).toBeNull();
    expect(out.fallbackReason).toBe("no_key");
    expect(NarrativeSchema.safeParse(out.narrative).success).toBe(true);
    expect(h.generateText).not.toHaveBeenCalled();
  });

  it("is deterministic and pure", async () => {
    const a = await run();
    const b = await run();
    expect(a.narrative).toEqual(b.narrative);
    expect(a.narrative).toEqual(fallbackNarrative(fixtureReport, fixtureResult.warnings));
    expect(NarrativeSchema.safeParse(fallbackNarrative(fixtureReport)).success).toBe(true);
  });
});

describe("no score leakage — the narrative may not reconstruct the suppressed composite", () => {
  // What leaks is NUMBERS and rubric vocabulary — not the English verb "score".
  // "Your recent reports score low against this rubric's scales" is an honest
  // qualitative sentence with nothing to add up; "Contributed 33.5 of 40.0
  // possible points" is the composite in disguise.
  const NUMBERS_THAT_LEAK =
    /\d+\.\d|\bcontribut|possible points|\bweighted?\b|\bconfidence\b|\bpoints\b|out of \d/i;

  it("the fallback prints no contributions, weights, or point totals", () => {
    // The old fallback emitted "Contributed 33.5 of 40.0 possible points" for
    // ALL SIX factors, which sums straight back to the suppressed number.
    const text = JSON.stringify(fallbackNarrative(fixtureReport, fixtureResult.warnings));
    expect(text).not.toMatch(NUMBERS_THAT_LEAK);
    expect(text).not.toContain(String(fixtureResult.final));
  });

  it("the fallback stays clean on a record whose score is suppressed", () => {
    const empty: RubricInputs = {
      boardDate: "2026-09-01",
      evals: [],
      psr: { entered: false, awards: null, necs: null, education: null, tours: null, pfa: null, adverse: [] },
      ladr: [],
      preceptFlags: ["warfighting"],
    };
    const r = scoreBoardConfidence(empty, CFG);
    const rep = buildReadinessReport(r, empty, CFG);
    expect(rep.score).toBeNull();

    const text = JSON.stringify(fallbackNarrative(rep, r.warnings));
    expect(text).not.toMatch(NUMBERS_THAT_LEAK);
    expect(text).not.toContain("Drop-from-consideration risk");
  });

  it("the model payload carries no per-factor numbers, no worth, and no score", () => {
    const payload = narrativePayload(fixtureReport, fixtureResult);
    const text = JSON.stringify(payload);

    expect(text).not.toContain('"contribution"');
    expect(text).not.toContain('"weight"');
    expect(text).not.toContain('"worth"');
    expect(text).not.toContain('"detail"');
    expect(text).not.toContain('"bandLabel"');
    // `scored` is a bare boolean — the number itself never leaves the server.
    expect(payload.scored).toBe(fixtureReport.score !== null);
    expect(text).not.toContain(String(fixtureResult.final));
    for (const a of payload.areas) expect(a).not.toHaveProperty("detail");
    for (const a of payload.actions) expect(a).not.toHaveProperty("worth");
  });

  it("the system prompt forbids stating or implying a score", () => {
    const out = fallbackNarrative(fixtureReport);
    expect(NarrativeSchema.safeParse(out).success).toBe(true);
    // The instruction itself is pinned so it cannot be quietly dropped.
    expect(NARRATIVE_SYSTEM_PROMPT).toMatch(/NEVER state, estimate, imply or reconstruct an overall score/);
    expect(NARRATIVE_SYSTEM_PROMPT).toMatch(/not_enough_entered/);
  });
});

describe("guards that ship with this change", () => {
  // N8 — a suppressed record must not be advertised to the model as scored.
  it("`scored` tracks the readiness gate, it is not hardcoded true", () => {
    const empty: RubricInputs = {
      boardDate: "2026-09-01",
      evals: [],
      psr: { entered: false, awards: null, necs: null, education: null, tours: null, pfa: null, adverse: [] },
      ladr: [],
      preceptFlags: ["warfighting"],
    };
    const r = scoreBoardConfidence(empty, CFG);
    const rep = buildReadinessReport(r, empty, CFG);
    expect(rep.score).toBeNull();
    expect(narrativePayload(rep, r).scored).toBe(false);
    expect(narrativePayload(fixtureReport, fixtureResult).scored).toBe(true);
  });

  // N12 — the headline rule of §14.4: missing data is never a deficiency.
  it("never routes `not_enough_entered` into gaps", () => {
    const thin: RubricInputs = {
      boardDate: "2026-09-01",
      evals: [],
      psr: { entered: true, awards: null, necs: null, education: null, tours: null, pfa: null, adverse: [] },
      ladr: [],
      preceptFlags: ["warfighting"],
    };
    const r = scoreBoardConfidence(thin, CFG);
    const rep = buildReadinessReport(r, thin, CFG);
    const unknown = rep.areas.filter((a) => a.status === "not_enough_entered");
    expect(unknown.length).toBeGreaterThan(0);

    const n = fallbackNarrative(rep);
    for (const a of unknown) expect(n.gaps.join(" ")).not.toContain(a.summary);
    // ...and the guidance for them is offered instead.
    expect(n.recommendations.length).toBeGreaterThan(0);
  });

  // N13 — only `strong` is a strength; `on_track` is middling, not praise.
  it("keys strengths on `strong` alone, never on `on_track`", () => {
    const onTrackOnly = {
      ...fixtureReport,
      areas: fixtureReport.areas.map((a) => ({ ...a, status: "on_track" as const })),
    };
    expect(fallbackNarrative(onTrackOnly).strengths).toEqual([]);

    const allStrong = {
      ...fixtureReport,
      areas: fixtureReport.areas.map((a) => ({ ...a, status: "strong" as const })),
    };
    expect(fallbackNarrative(allStrong).strengths).toHaveLength(5); // six areas, capped at MAX_ITEMS
  });

  // N14 — a milestone with no threaded text must not reach the model as item: "".
  it("drops unnamed milestones from the payload rather than sending empty text", () => {
    const unnamed: RubricInputs = {
      ...fixtureInputs,
      ladr: [
        { milestone_id: "no-name", category: "credential", status: "not_met", verified_in_ompf: false },
        { milestone_id: "named", category: "credential", status: "not_met", verified_in_ompf: false, item: "CompTIA Security+" },
      ],
    };
    const r = scoreBoardConfidence(unnamed, CFG);
    const rep = buildReadinessReport(r, unnamed, CFG);
    const ids = narrativePayload(rep, r).unmet.map((u) => u.milestone_id);
    expect(ids).toEqual(["named"]);
    expect(r.ladrUnmet!.map((u) => u.milestone_id)).toContain("no-name"); // the engine still knows
  });

  // A long action list must not starve the "enter this section" guidance.
  it("interleaves recommendations so many actions cannot crowd out missing-data guidance", () => {
    const many = {
      ...fixtureReport,
      actions: Array.from({ length: 8 }, (_, i) => ({
        ...fixtureReport.actions[0],
        id: `a-${i}`,
        action: `ACTION ${i}`,
      })),
      coverage: {
        ...fixtureReport.coverage,
        missing: [
          { area: "leadership" as const, label: "your tours and awards", unlocks: "leadership assessment", howTo: "MISSING-HOWTO-1" },
          { area: "precept" as const, label: "the board emphasis areas", unlocks: "the board emphasis check", howTo: "MISSING-HOWTO-2" },
        ],
      },
    };
    const recs = fallbackNarrative(many).recommendations.join(" | ");
    // Concatenate-then-slice showed zero of these; both must survive the cap.
    expect(recs).toContain("MISSING-HOWTO-1");
    expect(recs).toContain("MISSING-HOWTO-2");
  });
});

describe("the payload names unmet milestones — this is what makes output specific", () => {
  it("carries public Navy COOL milestone names, and no point values", () => {
    const payload = narrativePayload(fixtureReport, fixtureResult);
    expect(payload.unmet.map((u) => u.item).sort()).toEqual([
      "CompTIA Security+",
      "Occupational-related Associate degree",
    ]);
    for (const u of payload.unmet) expect(u).not.toHaveProperty("marginal_points");
  });

  it("action text quotes the milestone by name", () => {
    const payload = narrativePayload(fixtureReport, fixtureResult);
    expect(payload.actions.some((a) => a.action.includes("CompTIA Security+"))).toBe(true);
  });
});

describe("citation-or-delete — a bracket pointing at nothing is worse than no bracket", () => {
  const payload = () => narrativePayload(fixtureReport, fixtureResult);

  it("the valid path set is built from the payload actually sent", () => {
    const paths = citationPaths(payload());
    expect(paths.has("areas.performance")).toBe(true);
    expect(paths.has("unmet.m-cert")).toBe(true);
    expect(paths.has("actions.ladr:m-cert:meet")).toBe(true);
    // The old prompt's exemplars — never in any payload.
    expect(paths.has("performance.detail.P1")).toBe(false);
    expect(paths.has("development.detail.categories.qual_warfare")).toBe(false);
  });

  it("keeps cited items, strips the trailing citation, and deletes unciteable ones", () => {
    const deterministic = fallbackNarrative(fixtureReport);
    const gated = applyCitationGate(
      {
        ...citedNarrative(),
        strengths: [
          "Your reporting periods run without a break. [areas.continuity]",
          "Invented claim about a medal. [performance.detail.P1]",
          "No citation at all here.",
        ],
      },
      payload(),
      deterministic,
    );

    expect(gated.strengths).toEqual(["Your reporting periods run without a break."]);
    const items = [
      ...gated.strengths,
      ...gated.gaps,
      ...gated.recommendations,
      ...Object.values(gated.factor_commentary),
    ];
    // No surviving item still shows a bracketed PATH to the Sailor.
    for (const t of items) expect(t).not.toMatch(/\[(areas|actions|unmet|coverage)\./);
    expect(items.join(" ")).not.toContain("Invented claim");
  });

  it("EVERY cited path must resolve — one valid path may not launder a fabrication", () => {
    // A model that appends one safe citation to a fabricated sentence walked
    // straight through the old `some()` check, while the system prompt promised
    // the model that any item citing an unknown path is deleted.
    const deterministic = fallbackNarrative(fixtureReport);
    const gated = applyCitationGate(
      {
        ...citedNarrative(),
        strengths: [
          "You failed your PFA and hold no warfare device. [areas.performance, awards.fabricated]",
          "Both of these resolve. [areas.performance, areas.continuity]",
        ],
      },
      payload(),
      deterministic,
    );
    expect(gated.strengths).toEqual(["Both of these resolve."]);
  });

  it("leaves bracketed NEC/CIN codes in the prose alone — only the trailing group is a citation", () => {
    // PR #22 transcribed 80 milestones whose text carries bracketed codes; a
    // global strip ate them: `Complete "X [NEC 742A]".` → `Complete "X ".`
    const deterministic = fallbackNarrative(fixtureReport);
    const gated = applyCitationGate(
      {
        ...citedNarrative(),
        recommendations: [
          'Complete "Advanced Network Analyst [NEC 742A]". [actions.ladr:m-cert:meet]',
          'Prose bracket with no citation at all [NEC 742A].',
        ],
      },
      payload(),
      deterministic,
    );
    expect(gated.recommendations).toEqual([
      'Complete "Advanced Network Analyst [NEC 742A]".',
    ]);
  });

  it("falls back to deterministic text for an unciteable factor_commentary entry", () => {
    // The schema requires all six keys, so they cannot be deleted — but an
    // unsupported one must not be rendered either.
    const deterministic = fallbackNarrative(fixtureReport);
    const bad = citedNarrative();
    bad.factor_commentary.performance = "Ungrounded claim. [performance.detail.P1]";

    const gated = applyCitationGate(bad, payload(), deterministic);
    expect(gated.factor_commentary.performance).toBe(
      deterministic.factor_commentary.performance,
    );
    expect(gated.factor_commentary.continuity).toBe("No break between reports.");
  });

  it("the model path runs the gate on real output", async () => {
    process.env.AI_GATEWAY_API_KEY = "test-dummy-key";
    h.generateText.mockResolvedValue({
      output: { ...citedNarrative(), gaps: ["Fabricated. [nonsense.path]"] },
    });

    const out = await run();
    expect(out.source).toBe("model");
    expect(out.narrative.gaps).toEqual([]);
    expect(out.narrative.strengths[0]).toBe("Your reporting periods run without a break.");
  });
});

describe("generateNarrative — mocked gateway model path", () => {
  beforeEach(() => {
    process.env.AI_GATEWAY_API_KEY = "test-dummy-key";
  });

  it("calls generateText with the default gateway model string and NO sampling parameters", async () => {
    h.generateText.mockResolvedValue({ output: citedNarrative() });

    const out = await run();

    expect(h.generateText).toHaveBeenCalledTimes(1);
    const args = h.generateText.mock.calls[0][0];
    expect(args.model).toBe(DEFAULT_NARRATIVE_MODEL);
    expect(args.maxRetries).toBe(1);
    expect(typeof args.system).toBe("string");
    expect(args.output).toBeDefined();
    // Sampling params are never sent — current Anthropic models reject them.
    expect(args).not.toHaveProperty("temperature");
    expect(args).not.toHaveProperty("topP");
    expect(args).not.toHaveProperty("topK");

    expect(out.source).toBe("model");
    expect(out.model).toBe(DEFAULT_NARRATIVE_MODEL);
    expect(out.fallbackReason).toBeNull();
  });

  it("BOARD_NARRATIVE_MODEL selects any gateway provider (e.g. xAI Grok)", async () => {
    process.env.BOARD_NARRATIVE_MODEL = "xai/grok-4.5";
    h.generateText.mockResolvedValue({ output: citedNarrative() });

    const out = await run();

    expect(narrativeModelId()).toBe("xai/grok-4.5");
    expect(h.generateText.mock.calls[0][0].model).toBe("xai/grok-4.5");
    expect(out.model).toBe("xai/grok-4.5");
  });

  it("privacy: the prompt and system text contain none of the planted sentinels (§4.3.4)", async () => {
    h.generateText.mockResolvedValue({ output: citedNarrative() });

    await generateNarrative(fixtureReport, resultWithWarnings);

    const args = h.generateText.mock.calls[0][0];
    const serialized = JSON.stringify({ prompt: args.prompt, system: args.system });
    for (const sentinel of SENTINELS) expect(serialized).not.toContain(sentinel);
  });

  it("model failure → fallback outcome, never a throw", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.generateText.mockRejectedValue(new Error("429 rate limited"));

    const out = await run();

    expect(out.source).toBe("fallback");
    expect(out.model).toBeNull();
    expect(out.fallbackReason).toBe("model_error");
    expect(out.narrative).toEqual(fallbackNarrative(fixtureReport, fixtureResult.warnings));
    errSpy.mockRestore();
  });

  it("missing output → fallback outcome", async () => {
    h.generateText.mockResolvedValue({ output: undefined });

    const out = await run();

    expect(out.source).toBe("fallback");
    expect(out.fallbackReason).toBe("model_error");
    expect(NarrativeSchema.safeParse(out.narrative).success).toBe(true);
  });

  it("OIDC-only environments (Vercel deployments) also take the model path", async () => {
    delete process.env.AI_GATEWAY_API_KEY;
    process.env.VERCEL_OIDC_TOKEN = "oidc-token";
    h.generateText.mockResolvedValue({ output: citedNarrative() });

    expect((await run()).source).toBe("model");
  });
});

describe("generateNarrative — direct OpenAI-compatible mode (zero Vercel services)", () => {
  it("BOARD_NARRATIVE_BASE_URL alone enables the model path — no gateway credentials", async () => {
    process.env.BOARD_NARRATIVE_BASE_URL = "https://api.x.ai/v1";
    process.env.BOARD_NARRATIVE_API_KEY = "xai-test-key";
    process.env.BOARD_NARRATIVE_MODEL = "grok-4-fast";
    h.generateText.mockResolvedValue({ output: citedNarrative() });

    const out = await run();

    const args = h.generateText.mock.calls[0][0];
    // A provider model OBJECT, not a gateway string.
    expect(typeof args.model).toBe("object");
    expect(args.model.modelId).toBe("grok-4-fast");
    expect(out.model).toBe("grok-4-fast");
  });

  it("direct mode on Anthropic takes the NATIVE id, with no provider prefix", async () => {
    process.env.BOARD_NARRATIVE_BASE_URL = "https://api.anthropic.com/v1";
    process.env.BOARD_NARRATIVE_API_KEY = "sk-test";
    process.env.BOARD_NARRATIVE_MODEL = "claude-opus-5";
    h.generateText.mockResolvedValue({ output: citedNarrative() });

    const out = await run();
    expect(h.generateText.mock.calls[0][0].model.modelId).toBe("claude-opus-5");
    expect(out.model).toBe("claude-opus-5");
  });

  it("works for keyless local endpoints (e.g. Ollama on the self-hosted box)", async () => {
    process.env.BOARD_NARRATIVE_BASE_URL = "http://localhost:11434/v1";
    process.env.BOARD_NARRATIVE_MODEL = "llama3.3";
    h.generateText.mockResolvedValue({ output: citedNarrative() });

    expect((await run()).source).toBe("model");
    expect(h.generateText.mock.calls[0][0].model.modelId).toBe("llama3.3");
  });

  it("direct endpoint takes precedence over gateway credentials when both are set", async () => {
    process.env.AI_GATEWAY_API_KEY = "gateway-key";
    process.env.BOARD_NARRATIVE_BASE_URL = "https://api.x.ai/v1";
    process.env.BOARD_NARRATIVE_MODEL = "grok-4-fast";
    h.generateText.mockResolvedValue({ output: citedNarrative() });

    await run();
    expect(typeof h.generateText.mock.calls[0][0].model).toBe("object");
  });
});
