// tests/unit/evalCoach.test.ts
//
// The Block 43 narrative coach (docs/EVAL-COACH.md): the hard invariant (no
// trait grade, no Block 45 — the SCHEMA half is absolute, the PROSE half is
// pattern-matching and is tested as such), citation-or-delete against an
// invented path, evidence that cannot be fabricated, sentence ids published
// explicitly so the model cannot renumber them, coverage reconciliation, the
// report-type seams (#26 anchors/standards, FITREP block numbers), provider
// JSON-Schema compatibility, the deterministic short-circuits, and the route's
// auth / consent / input-cap / keyless-degrade / NEVER-PERSIST behaviour. No
// live API calls: the pure module takes an injected callModel, and the route
// suite mocks ai.generateText.

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { z } from "zod";
import { readFileSync } from "fs";

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
  suggestsGradeOrRecommendation,
  type CoachRequest,
} from "@/lib/evalCoach/coach";
import { TRAIT_STANDARDS_LOOKUP } from "@/lib/traitStandards";
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
    // Unknown keys are skipped, not guessed at — that is what kept the
    // CHIEFEVAL trait-key rename (#26) from mismatching anchors here.
    expect(keys).not.toContain("not_a_real_trait");
    expect(keys).not.toContain("teamwork"); // NOB
  });

  it("attaches the printed anchors, the measured budget, and the rules-engine findings", () => {
    const p = coachPayload({
      ...REQ,
      trait_grades: { knowledge: "1.0", eo: "2.0" },
    });
    expect(p.traits[0].anchors?.["3.0"].length).toBeGreaterThan(0);
    // max_lines is handed to the model as "the physical size of the block", so it has to
    // be THIS form's size: 16 on an EVAL at 10-pitch, 8 on a CHIEFEVAL. It said 18 for
    // every form. See tests/unit/commentCapacity.test.ts for the measurement.
    expect(p.budget).toMatchObject({ chars_per_line: 90, max_lines: 16 });
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

  it("splits bullets and sentences into units carrying an EXPLICIT 0-based id", () => {
    // The id must be a field in the JSON, not the array position. Position was
    // the contract once, the prompt said so, and the model silently renumbered
    // from 1 on roughly half of live runs — every citation then failed to
    // resolve and the finding was deleted.
    expect(splitSentences("- LED 42 SAILORS\nRAN THE WATCHBILL. FIXED IT.")).toEqual([
      { id: 0, text: "- LED 42 SAILORS" },
      { id: 1, text: "RAN THE WATCHBILL." },
      { id: 2, text: "FIXED IT." },
    ]);
  });

  it("publishes the sentence id contract to the model, and cites by that id", () => {
    const p = coachPayload(REQ);
    for (const s of p.sentences) expect(typeof s.id).toBe("number");
    expect(p.sentences.map((s) => s.id)).toEqual([0, 1]);
    // Serialized shape is what the model actually reads.
    expect(JSON.parse(JSON.stringify(p)).sentences[0]).toEqual({
      id: 0,
      text: p.sentences[0].text,
    });
    expect(COACH_SYSTEM_PROMPT).toMatch(/USE THE id FIELD\. Ids start at 0\./);
    expect(citationPaths(p).has("sentences.0")).toBe(true);
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
      expect(suggestsGradeOrRecommendation(bad), bad).toBe(true);

    for (const good of [
      "The 5.0 you set in Block 39 is not substantiated by any sentence here.",
      "Your 1.0 mark requires specific substantiation in this block.",
      "Nothing here supports the grade you assigned.",
    ])
      expect(suggestsGradeOrRecommendation(good), good).toBe(false);
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

  it("deletes prose that strays into Block 45", () => {
    // The schema half of the Block 45 invariant only ever covered a block_45
    // KEY. Free-text promotion advice inside a rationale was prompt-defended
    // only — the model refused every probe, but nothing enforced it.
    for (const bad of [
      "Your narrative supports a Must Promote. [traits.work]",
      "This warrants Early Promote.",
      "Block 45 should read Promotable.",
      "Close with PROMOTE AHEAD OF PEERS.",
      "I recommend Significant Problems here.",
      "Your promotion recommendation should match this.",
    ])
      expect(suggestsGradeOrRecommendation(bad), bad).toBe(true);

    // A Sailor's own 2.0 mark is labelled "Progressing" on the printed scale
    // and must stay discussable.
    for (const good of [
      "Your 2.0 (Progressing) mark in Block 34 has no supporting sentence.",
      "The narrative is progressing toward specificity but is not there yet.",
    ])
      expect(suggestsGradeOrRecommendation(good), good).toBe(false);
  });

  it("never instructs the model to produce a grade or a promotion recommendation", () => {
    expect(COACH_SYSTEM_PROMPT).toMatch(/NEVER state, suggest, recommend/);
    expect(COACH_SYSTEM_PROMPT).toMatch(
      /NEVER write, propose, name or hint at a Block 45/,
    );
  });

  it("does not claim the prose guard is absolute", () => {
    // The guard is pattern-matching over a refusing prompt. Three places used
    // to assert a guarantee it cannot provide; if that language comes back,
    // this fails.
    const src = readFileSync("lib/evalCoach/coach.ts", "utf8");
    expect(src).toMatch(/PROSE \(pattern-matched, not absolute\)/);
    expect(readFileSync("docs/EVAL-COACH.md", "utf8")).toMatch(
      /pattern-matching, not a proof/i,
    );
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
  it("resolves by the published id — the model never supplies quoted text", () => {
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

// ── coverage reconciliation ─────────────────────────────────────────────────

describe("every graded trait is accounted for", () => {
  it("reports traits the model skipped as unassessed, not as absent", () => {
    const p = coachPayload(REQ);
    const gated = applyCoachGate(
      { findings: [finding()], narrative_notes: [] },
      p,
    );
    expect(gated.findings.map((f) => f.trait)).toEqual(["knowledge"]);
    expect(gated.unassessed).toEqual([
      { trait: "work", block: 34, title: "Quality of Work", grade: "4.0" },
      { trait: "leadership", block: 39, title: "Leadership", grade: "5.0" },
    ]);
  });

  it("surfaces 1-based sentence-id drift instead of silently deleting the trait", () => {
    // The exact live failure: a 2-sentence narrative, the model citing
    // sentences.1 and sentences.2 (1-based) where the valid ids are 0 and 1.
    // The citation gate still deletes the finding — that part is correct, the
    // claim really is uncited — but the trait must not vanish from the panel.
    const p = coachPayload(REQ);
    const gated = applyCoachGate(
      {
        findings: [
          finding({ rationale: "Off-by-one citation. [sentences.2]" }),
          finding({ trait: "work", rationale: "Also off by one. [sentences.2]" }),
        ],
        narrative_notes: [],
      },
      p,
    );
    expect(gated.findings).toEqual([]);
    expect(gated.unassessed.map((u) => u.trait)).toEqual([
      "knowledge",
      "work",
      "leadership",
    ]);
    expect(gated.dropped).toBe(2);
  });
});

// ── report-type seams ───────────────────────────────────────────────────────

describe("form differences the standards table models", () => {
  it("CHIEFEVAL traits carry printed `standards`, never an empty anchors key", () => {
    // #26 made `anchors` optional: 1616/27 prints one bullet list per trait and
    // no per-grade columns. `anchors: std.anchors` would serialize to nothing
    // and hand the model a trait with no yardstick at all.
    const p = coachPayload({
      report_type: "CHIEFEVAL",
      pitch: "10",
      comments: "LED THE MESS.",
      trait_grades: { technical_mastery: "4.0", accountability: "3.0" },
    });
    expect(p.traits.map((t) => t.key)).toEqual([
      "technical_mastery",
      "accountability",
    ]);
    for (const t of p.traits) {
      expect(t.standards?.length).toBeGreaterThan(0);
      expect(t).not.toHaveProperty("anchors");
      expect(JSON.stringify(t)).not.toContain("anchors");
    }
    expect(p.traits[1].block).toBe(37); // the CHIEFEVAL 3.0 advancement gate
  });

  it("FITREP block numbers come from the report-type map, not the merged lookup", () => {
    // TRAIT_STANDARDS_LOOKUP reports block 39 for BOTH leadership and
    // tactical_performance, which rendered two cards headed "39".
    const p = coachPayload({
      report_type: "FITREP",
      pitch: "10",
      comments: "COMMANDED THE WATCH.",
      trait_grades: { leadership: "4.0", tactical_performance: "5.0" },
    });
    expect(p.traits.map((t) => [t.key, t.block])).toEqual([
      ["leadership", 38],
      ["tactical_performance", 39],
    ]);
    const blocks = p.traits.map((t) => t.block);
    expect(new Set(blocks).size).toBe(blocks.length);
  });

  it("skips a trait the form does not print rather than falling back to a block number", () => {
    // `work` is an EVAL trait (block 34) with no row on the 1610/2. The route
    // accepts any key, so a stale client can still send it; falling back to the
    // merged lookup's 34 would collide with `eo`, which really is Block 34 on
    // this form. Two cards headed "34" is the bug this whole seam exists to
    // prevent, so an unprintable trait yields no card at all.
    const p = coachPayload({
      report_type: "FITREP",
      pitch: "10",
      comments: "COMMANDED THE WATCH.",
      trait_grades: { eo: "4.0", work: "4.0" },
    });
    expect(p.traits.map((t) => [t.key, t.block])).toEqual([["eo", 34]]);
    // …and every graded trait that IS coached keeps a unique block on all three
    // forms, which is the invariant that matters.
    for (const report_type of ["EVAL", "CHIEFEVAL", "FITREP"] as const) {
      const all = coachPayload({
        report_type,
        pitch: "10",
        comments: "X.",
        trait_grades: Object.fromEntries(
          Object.keys(TRAIT_STANDARDS_LOOKUP).map((k) => [k, "4.0"]),
        ),
      });
      const bs = all.traits.map((t) => t.block);
      expect(new Set(bs).size, `${report_type} block collision`).toBe(bs.length);
      expect(bs.length).toBeGreaterThan(0);
    }
  });
});

// ── provider schema compatibility ───────────────────────────────────────────

describe("CoachOutputSchema survives conversion to JSON Schema", () => {
  it("emits no numeric bounds — the live endpoint rejects the whole request", () => {
    // z.number().int() makes zod emit safe-integer minimum/maximum, and the
    // provider answers 400: "For 'integer' type, properties maximum, minimum
    // are not supported". Every mocked test passed while the feature was dead
    // against the real endpoint. This catches that class with no network.
    const json = JSON.stringify(z.toJSONSchema(CoachOutputSchema));
    expect(json).not.toMatch(/"(?:minimum|maximum|exclusiveMinimum|exclusiveMaximum)"/);
  });
});

// ── the removal counter ─────────────────────────────────────────────────────

describe("dropped counts removals, not absences", () => {
  it("does not count an empty suggestion the model never wrote", () => {
    // z.string() accepts "". Three clean findings with empty suggestions used to
    // report "3 uncited or duplicate items removed" when nothing was removed.
    const p = coachPayload(REQ);
    const gated = applyCoachGate(
      {
        findings: [
          finding({ suggestion: "" }),
          finding({ trait: "work", suggestion: "   " }),
        ],
        narrative_notes: [],
      },
      p,
    );
    expect(gated.findings.map((f) => f.suggestion)).toEqual([null, null]);
    expect(gated.dropped).toBe(0);
  });

  it("still counts a suggestion that was written and then removed", () => {
    const p = coachPayload(REQ);
    const gated = applyCoachGate(
      { findings: [finding({ suggestion: "Cite nothing at all." })], narrative_notes: [] },
      p,
    );
    expect(gated.findings[0].suggestion).toBeNull();
    expect(gated.dropped).toBe(1);
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

  it("400 on an oversized trait-grade VALUE — unknown keys are free, padding is not", async () => {
    process.env.BOARD_NARRATIVE_BASE_URL = "https://example.invalid/v1";
    const padded = {
      ...validBody,
      trait_grades: { knowledge: "5.0".padEnd(320_000, "x") },
    };
    expect((await POST(postReq(padded))).status).toBe(400);
    expect(h.generateText).not.toHaveBeenCalled();

    // Key count genuinely cannot amplify: unknown keys are dropped downstream.
    const manyKeys = Object.fromEntries(
      Array.from({ length: 5000 }, (_, i) => [`junk_${i}`, "5.0"]),
    );
    const res = await POST(postReq({ ...validBody, trait_grades: manyKeys }));
    expect(res.status).toBe(200);
    expect((await res.json()).findings).toEqual([]);
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
