// tests/unit/evalCoach.test.ts
//
// The Block 43 narrative coach (docs/EVAL-COACH.md): the hard invariant (no
// trait grade, no Block 45 — enforced by the schema AND by the prose guard),
// citation-or-delete against an invented path, evidence that cannot be
// fabricated, the deterministic short-circuits, and the route's auth / consent
// / keyless-degrade / NEVER-PERSIST behaviour. No live API calls: the pure
// module takes an injected callModel, and the route suite mocks ai.generateText.

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const h = vi.hoisted(() => ({
  generateText: vi.fn(),
  getRouteUserId: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, generateText: h.generateText };
});

vi.mock("@/lib/supabaseClient", () => ({
  getRouteUserId: h.getRouteUserId,
  createAdminClient: h.createAdminClient,
  createBrowserClient: vi.fn(() => ({})),
}));

import {
  applyCoachGate,
  citationPaths,
  coachPayload,
  CoachModelError,
  CoachOutputSchema,
  COACH_SYSTEM_PROMPT,
  EMPTY_NARRATIVE_NOTE,
  NO_GRADES_NOTE,
  runEvalCoach,
  splitSentences,
  suggestsGrade,
  type CoachRequest,
} from "@/lib/evalCoach/coach";
import { GET, POST } from "@/app/api/eval-coach/route";

const REQ: CoachRequest = {
  report_type: "EVAL",
  pitch: "10",
  comments:
    "REBUILT THE DIVISION WATCHBILL FOR 42 SAILORS, CLOSING A 3-MONTH CERTIFICATION GAP.\nOUTSTANDING PERFORMER IN ALL RESPECTS.",
  trait_grades: {
    knowledge: "4.0",
    work: "4.0",
    leadership: "5.0",
    teamwork: "NOB",
    not_a_real_trait: "5.0",
  },
};

const finding = (over: Record<string, unknown> = {}) => ({
  trait: "knowledge",
  verdict: "partial" as const,
  evidence_sentence: 0,
  rationale: "Your watchbill rebuild shows applied knowledge. [sentences.0]",
  suggestion: "Name the system you qualified on. [traits.knowledge]",
  ...over,
});

const output = (over: Record<string, unknown> = {}) => ({
  findings: [finding()],
  narrative_notes: [],
  ...over,
});

// ── payload ─────────────────────────────────────────────────────────────────

describe("coachPayload", () => {
  it("carries only graded traits the standards table knows, never NOB", () => {
    const keys = coachPayload(REQ).traits.map((t) => t.key);
    expect(keys).toEqual(["knowledge", "work", "leadership"]);
    // Unknown keys are skipped, not guessed at — that is what makes the
    // inbound CHIEFEVAL trait-key rename a non-event here.
    expect(keys).not.toContain("not_a_real_trait");
    expect(keys).not.toContain("teamwork"); // NOB
  });

  it("attaches the printed anchors, the measured budget, and the rules-engine findings", () => {
    const p = coachPayload({
      ...REQ,
      trait_grades: { knowledge: "1.0", eo: "2.0" },
    });
    expect(p.traits[0].anchors["3.0"].length).toBeGreaterThan(0);
    expect(p.budget).toMatchObject({ chars_per_line: 90, max_lines: 18 });
    // The Block 43 substantiation rule is validationEngine's, not a second copy.
    expect(
      p.issues.some((i) => /substantiate/i.test(i.message) && i.block === 43),
    ).toBe(true);
    // …and nothing from the admin blocks leaks into the coaching payload.
    expect(
      p.issues.every(
        (i) => i.field === "comments" || (i.field ?? "").startsWith("trait_grades"),
      ),
    ).toBe(true);
  });

  it("splits bullets and sentences into addressable units", () => {
    expect(splitSentences("- LED 42 SAILORS\nRAN THE WATCHBILL. FIXED IT.")).toEqual([
      "- LED 42 SAILORS",
      "RAN THE WATCHBILL.",
      "FIXED IT.",
    ]);
  });
});

// ── the hard invariant ──────────────────────────────────────────────────────

describe("invariant: the coach never produces a trait grade or Block 45", () => {
  it("has no grade or Block 45 field in the schema, and strips any the model emits", () => {
    const parsed = CoachOutputSchema.parse({
      findings: [
        {
          ...finding(),
          suggested_grade: "5.0",
          trait_grades: { knowledge: "5.0" },
          block_45: "Early Promote",
        },
      ],
      narrative_notes: [],
      promotion_recommendation: "Early Promote",
      trait_grades: { work: "1.0" },
    });
    expect(JSON.stringify(parsed)).not.toMatch(/5\.0|Early Promote|block_45/);
    expect(Object.keys(parsed)).toEqual(["findings", "narrative_notes"]);
    expect(Object.keys(parsed.findings[0])).toEqual([
      "trait",
      "verdict",
      "evidence_sentence",
      "rationale",
      "suggestion",
    ]);
  });

  it("deletes prose that recommends a grade, and keeps prose that merely names one", () => {
    for (const bad of [
      "This should be a 3.0 instead.",
      "Consider a 5.0 here.",
      "Raise the mark in Block 39.",
      "A 4.0 would be more appropriate.",
      "Mark it 2.0.",
      "This reads like a 5.0.",
    ])
      expect(suggestsGrade(bad), bad).toBe(true);

    for (const good of [
      "The 5.0 you set in Block 39 is not substantiated by any sentence here.",
      "Your 1.0 mark requires specific substantiation in this block.",
      "Nothing here supports the grade you assigned.",
    ])
      expect(suggestsGrade(good), good).toBe(false);
  });

  it("drops the finding when the rationale recommends a grade, and nulls the suggestion when it does", () => {
    const payload = coachPayload(REQ);
    const gated = applyCoachGate(
      {
        findings: [
          finding({
            trait: "work",
            rationale: "You should be a 5.0 on this one. [traits.work]",
          }),
          finding({
            suggestion: "Consider a 3.0 until you add metrics. [traits.knowledge]",
          }),
        ],
        narrative_notes: ["Raise the mark in Block 34. [budget]"],
      },
      payload,
    );
    expect(gated.findings.map((f) => f.trait)).toEqual(["knowledge"]);
    expect(gated.findings[0].suggestion).toBeNull();
    expect(gated.notes).toEqual([]);
    expect(gated.dropped).toBe(3);
  });

  it("never instructs the model to produce a grade", () => {
    expect(COACH_SYSTEM_PROMPT).toMatch(/NEVER state, suggest, recommend/);
    expect(COACH_SYSTEM_PROMPT).toMatch(/NEVER write or propose Block 45/);
  });
});

// ── citation-or-delete ──────────────────────────────────────────────────────

describe("citation-or-delete", () => {
  it("enumerates exactly the resolvable paths", () => {
    const p = coachPayload(REQ);
    const paths = citationPaths(p);
    expect(paths.has("sentences.0")).toBe(true);
    expect(paths.has("sentences.2")).toBe(false); // only two sentences exist
    expect(paths.has("traits.knowledge")).toBe(true);
    expect(paths.has("traits.not_a_real_trait")).toBe(false);
    expect(paths.has("budget")).toBe(true);
  });

  it("drops an item citing an invented path, and one valid path cannot launder it", () => {
    const p = coachPayload(REQ);
    const gated = applyCoachGate(
      {
        findings: [
          finding({
            trait: "work",
            rationale: "You earned the Navy Achievement Medal. [awards.fabricated]",
          }),
          finding({
            trait: "leadership",
            rationale:
              "You led 42 Sailors and won three awards. [sentences.0, awards.fabricated]",
          }),
          finding({ rationale: "You rebuilt the watchbill." }), // no citation at all
        ],
        narrative_notes: ["The narrative fits the block. [nonsense.path]"],
      },
      p,
    );
    expect(gated.findings).toEqual([]);
    expect(gated.notes).toEqual([]);
    expect(gated.dropped).toBe(4);
  });

  it("strips only the trailing citation group, leaving bracketed Navy codes intact", () => {
    const p = coachPayload(REQ);
    const gated = applyCoachGate(
      {
        findings: [
          finding({
            rationale:
              'Name the qualification, e.g. "Information Systems Technician [NEC 742A]". [traits.knowledge]',
          }),
        ],
        narrative_notes: [],
      },
      p,
    );
    expect(gated.findings[0].rationale).toBe(
      'Name the qualification, e.g. "Information Systems Technician [NEC 742A]".',
    );
  });

  it("drops a finding for a trait that is not graded on this draft", () => {
    const p = coachPayload(REQ);
    const gated = applyCoachGate(
      {
        findings: [finding({ trait: "bearing" })],
        narrative_notes: [],
      },
      p,
    );
    expect(gated.findings).toEqual([]);
    expect(gated.dropped).toBe(1);
  });
});

// ── evidence ────────────────────────────────────────────────────────────────

describe("evidence is the Sailor's own sentence", () => {
  it("resolves by index — the model never supplies quoted text", () => {
    const p = coachPayload(REQ);
    const gated = applyCoachGate(
      { findings: [finding({ evidence_sentence: 1 })], narrative_notes: [] },
      p,
    );
    expect(gated.findings[0].evidence).toBe("OUTSTANDING PERFORMER IN ALL RESPECTS.");
  });

  it("nulls an out-of-range index and drops a 'substantiated' claim pointing at nothing", () => {
    const p = coachPayload(REQ);
    const gated = applyCoachGate(
      {
        findings: [
          finding({ verdict: "unsupported", evidence_sentence: 99 }),
          finding({ trait: "work", verdict: "substantiated", evidence_sentence: null }),
        ],
        narrative_notes: [],
      },
      p,
    );
    expect(gated.findings.map((f) => f.trait)).toEqual(["knowledge"]);
    expect(gated.findings[0].evidence).toBeNull();
  });
});

// ── deterministic short-circuits ────────────────────────────────────────────

describe("runEvalCoach", () => {
  it("answers without calling the model when there is nothing to coach", async () => {
    const callModel = vi.fn();
    expect(
      (await runEvalCoach({ ...REQ, comments: "   " }, callModel)).notes,
    ).toEqual([EMPTY_NARRATIVE_NOTE]);
    expect(
      (await runEvalCoach({ ...REQ, trait_grades: {} }, callModel)).notes,
    ).toEqual([NO_GRADES_NOTE]);
    expect(callModel).not.toHaveBeenCalled();
  });

  it("throws CoachModelError on unparseable output", async () => {
    await expect(
      runEvalCoach(REQ, async () => ({ findings: "nope" })),
    ).rejects.toBeInstanceOf(CoachModelError);
  });

  it("passes the payload as the prompt and gates the result", async () => {
    const callModel = vi.fn(async (_prompt: string) => output());
    const res = await runEvalCoach(REQ, callModel);
    const sent = JSON.parse(callModel.mock.calls[0][0]);
    expect(sent.traits.map((t: any) => t.key)).toEqual([
      "knowledge",
      "work",
      "leadership",
    ]);
    expect(res.findings).toEqual([
      {
        trait: "knowledge",
        block: 33,
        title: "Professional Knowledge",
        grade: "4.0",
        verdict: "partial",
        evidence:
          "REBUILT THE DIVISION WATCHBILL FOR 42 SAILORS, CLOSING A 3-MONTH CERTIFICATION GAP.",
        rationale: "Your watchbill rebuild shows applied knowledge.",
        suggestion: "Name the system you qualified on.",
      },
    ]);
  });
});

// ── route ───────────────────────────────────────────────────────────────────

const ENV_KEYS = [
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
  "BOARD_NARRATIVE_MODEL",
  "BOARD_NARRATIVE_BASE_URL",
  "BOARD_NARRATIVE_API_KEY",
] as const;
const ORIGINAL_ENV = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

const postReq = (body: unknown) => ({ json: async () => body }) as any;
const validBody = { ...REQ, consent: true };

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) delete process.env[k];
  h.getRouteUserId.mockResolvedValue("u1");
  h.generateText.mockResolvedValue({ output: output() });
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL_ENV[k] as string;
  }
});

describe("POST /api/eval-coach", () => {
  it("401 when unauthenticated", async () => {
    h.getRouteUserId.mockResolvedValue(null);
    expect((await POST(postReq(validBody))).status).toBe(401);
  });

  it("400 without explicit consent — the gate is server-enforced", async () => {
    const { consent, ...noConsent } = validBody;
    expect((await POST(postReq(noConsent))).status).toBe(400);
    expect((await POST(postReq({ ...validBody, consent: false }))).status).toBe(400);
  });

  it("degrades to 503 when the server is keyless — never throws, never fabricates", async () => {
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/not configured/);
    expect(h.generateText).not.toHaveBeenCalled();
  });

  it("GET reports availability so a keyless server hides the button", async () => {
    expect(await (await GET()).json()).toEqual({ available: false, model: null });
    process.env.BOARD_NARRATIVE_BASE_URL = "https://example.invalid/v1";
    process.env.BOARD_NARRATIVE_MODEL = "claude-opus-5";
    expect(await (await GET()).json()).toEqual({
      available: true,
      model: "claude-opus-5",
    });
  });

  it("502 on unusable model output — a model failure is not a validation failure", async () => {
    process.env.BOARD_NARRATIVE_BASE_URL = "https://example.invalid/v1";
    h.generateText.mockResolvedValue({ output: { findings: "nope" } });
    expect((await POST(postReq(validBody))).status).toBe(502);

    h.generateText.mockRejectedValue(new Error("upstream 500"));
    expect((await POST(postReq(validBody))).status).toBe(502);
  });

  it("NEVER PERSISTS: a successful run touches no database at all", async () => {
    process.env.BOARD_NARRATIVE_BASE_URL = "https://example.invalid/v1";
    process.env.BOARD_NARRATIVE_MODEL = "claude-opus-5";
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.model).toBe("claude-opus-5");
    expect(body.findings[0].trait).toBe("knowledge");
    // The only Supabase call the route may make is the auth lookup: no admin
    // client is ever constructed, so there is nothing to write the narrative to.
    expect(h.createAdminClient).not.toHaveBeenCalled();
    // The response carries no grade and no Block 45.
    expect(JSON.stringify(body)).not.toMatch(
      /trait_grades|promotion_recommendation|block_45/,
    );
  });

  it("sends the system prompt and no sampling parameters", async () => {
    process.env.BOARD_NARRATIVE_BASE_URL = "https://example.invalid/v1";
    await POST(postReq(validBody));
    const args = h.generateText.mock.calls[0][0];
    expect(args.system).toBe(COACH_SYSTEM_PROMPT);
    expect(args).not.toHaveProperty("temperature");
    expect(args).not.toHaveProperty("topP");
  });
});
