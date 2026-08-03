// tests/unit/bragSheetAutofill.test.ts
//
// AI auto-fill pipeline (brag-sheet spec §4.6/§7, §9.5). runAutofill is driven
// with a scripted injected callModel (no "ai" mock needed for the pipeline);
// buildCallModel is driven directly with "ai"'s generateText mocked
// (boardConfidenceNarrative.test.ts convention). Pins: the generateText call
// shape (verbatim system prompt, maxRetries 1, abortSignal, no sampling
// params), commentFit-derived budgets, the dod_id PII strip, citation-or-
// delete, missing-info passthrough + the server-side Bad-Day flag, the
// deterministic Block 20 overwrite, overflow retry-then-flag (never silent
// truncation), Zod strip semantics for trait_grades, AutofillModelError after
// two failed parses, ≤3 model calls per run, and the runFullValidation dry-run.

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const h = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, generateText: h.generateText };
});

const v = vi.hoisted(() => ({ runFullValidation: vi.fn() }));

vi.mock("@/lib/validationEngine", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/validationEngine")>();
  v.runFullValidation.mockImplementation(actual.runFullValidation);
  return { ...actual, runFullValidation: v.runFullValidation };
});

import {
  AUTOFILL_SYSTEM_PROMPT,
  BRAG_AI_ENV,
  AutofillModelOutputSchema,
  AutofillResponseSchema,
  AutofillModelError,
  computeBudgets,
  buildAutofillPayload,
  resolveCitation,
  runAutofill,
  buildCallModel,
} from "@/lib/bragSheet/autofill";
import { resolveAiModel } from "@/lib/aiProvider";
import { DEFAULT_NARRATIVE_MODEL } from "@/lib/boardConfidence/narrative";
import { LADR_CATEGORY_WEIGHTS } from "@/lib/boardConfidence/rubric";
import { emptyBragSheetData } from "@/lib/bragSheet/template";
import { checkCommentFit } from "@/lib/commentFit";
import type {
  AutofillRequest,
  BragSheetData,
} from "@/lib/bragSheet/types";

// ---------------------------------------------------------------------------
// Env hygiene (aiProvider reads env at call time)
// ---------------------------------------------------------------------------

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
  vi.clearAllMocks();
  for (const k of ENV_KEYS) delete process.env[k];
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL_ENV[k];
  }
});

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SENTINEL_DOD_ID = "9876543210";
const CIT = "brag.duties[0].bullets[0]"; // resolvable in the fixture request

const makeBrag = (): BragSheetData => {
  const d = emptyBragSheetData();
  d.admin.member_name = "JONES, CARL R";
  d.admin.grade_rate = "IT1";
  d.admin.dod_id = SENTINEL_DOD_ID;
  d.duties.push({
    title: "LEADING PETTY OFFICER",
    kind: "primary",
    months_assigned: 12,
    is_most_significant: true,
    abbrev: "LPO",
    bullets: [{ text: "Led 12 Sailors through INSURV", metrics: "12 Sailors" }],
  });
  d.leadership.retention_efforts.push({
    text: "Retained 3 Sailors",
    metrics: "3 reenlistments",
  });
  d.pfa.push({ cycle: "25-1", result: "P" });
  d.pfa.push({ cycle: "25-2", result: "B", notes: "Bad day" });
  d.goals.career_recommendations.push("IWO SCHOOL");
  return d;
};

const makeReq = (over: Partial<AutofillRequest> = {}): AutofillRequest => ({
  report_type: "EVAL",
  period_from: "2025-03-16",
  period_to: "2026-03-15",
  pitch: "10",
  brag: makeBrag(),
  prior_evals: [
    {
      period_to: "2025-03-15",
      report_type: "EVAL",
      promotion_recommendation: "Must Promote",
      trait_average: 4.0,
      comments: "PRIOR BLOCK 43 TEXT",
      qualifications: "ESWS AUG 2024",
      primary_duties: "LPO-12",
    },
  ],
  ladr: [
    {
      milestone_id: "m1",
      category: "qual_warfare",
      item: "ESWS qualification",
      status: "met",
    },
  ],
  ...over,
});

/** A schema-valid model output whose citations all resolve. */
const baseOutput = (): any => ({
  blocks: {
    comments: {
      text: "LED 12 SAILORS THROUGH INSURV WITH ZERO DISCREPANCIES",
      items: [
        {
          text: "LED 12 SAILORS THROUGH INSURV WITH ZERO DISCREPANCIES",
          sources: [CIT],
        },
      ],
    },
    primary_duty_abbrev: { text: "LPO", items: [{ text: "LPO", sources: [CIT] }] },
    primary_duties: {
      text: "LEADING PETTY OFFICER-12; 25-1:P; 25-2:B/BAD DAY",
      items: [
        {
          text: "LEADING PETTY OFFICER-12; 25-1:P; 25-2:B/BAD DAY",
          sources: [CIT],
        },
      ],
    },
    command_achievements: {
      text: "COMPLETED INSURV WITH GRADE OF EXCELLENT",
      items: [
        { text: "COMPLETED INSURV WITH GRADE OF EXCELLENT", sources: [CIT] },
      ],
    },
    qualifications: {
      text: "ESWS QUALIFIED THIS PERIOD",
      items: [{ text: "ESWS QUALIFIED THIS PERIOD", sources: ["ladr.qual_warfare[m1]"] }],
    },
    career_recommendations: {
      text: "IWO SCHOOL",
      entries: ["IWO SCHOOL"],
      items: [
        { text: "IWO SCHOOL", sources: ["brag.goals.career_recommendations[0]"] },
      ],
    },
    physical_readiness: { text: "PB", items: [{ text: "PB", sources: ["brag.pfa[0]"] }] },
  },
  missing_info: [],
  promotion_advisory: {
    advisory_only: true,
    recommendation: "Must Promote",
    rationale:
      "Sustained cited performance. Advisory only — the reporting senior selects Block 45.",
    sources: [CIT],
  },
});

/** Scripted callModel: returns queued outputs, repeating the last. */
const scriptedModel = (...outputs: unknown[]) => {
  let i = 0;
  return vi.fn(async (_prompt: string) => {
    const out = outputs[Math.min(i, outputs.length - 1)];
    i += 1;
    return out;
  });
};

// ---------------------------------------------------------------------------
// buildCallModel — generateText call shape (§9.5 "Call shape")
// ---------------------------------------------------------------------------

describe("buildCallModel — generateText call shape (mocked 'ai')", () => {
  it("sends the verbatim system prompt, maxRetries 1, an abortSignal, and NO sampling params", async () => {
    process.env.BOARD_NARRATIVE_BASE_URL = "https://api.x.ai/v1";
    process.env.BOARD_NARRATIVE_API_KEY = "xai-test-key";
    process.env.BOARD_NARRATIVE_MODEL = "grok-4-fast";
    const output = baseOutput();
    h.generateText.mockResolvedValue({ output });

    const callModel = buildCallModel(
      resolveAiModel(BRAG_AI_ENV, DEFAULT_NARRATIVE_MODEL)!,
    );
    const result = await callModel('{"probe":1}');

    expect(h.generateText).toHaveBeenCalledTimes(1);
    const args = h.generateText.mock.calls[0][0];
    expect(args.system).toBe(AUTOFILL_SYSTEM_PROMPT);
    expect(args.prompt).toBe('{"probe":1}');
    expect(args.maxRetries).toBe(1);
    expect(args.abortSignal).toBeDefined();
    expect(args.output).toBeDefined();
    // Direct mode: a provider model OBJECT with the resolved id.
    expect(typeof args.model).toBe("object");
    expect(args.model.modelId).toBe("grok-4-fast");
    // Sampling params are never sent (repo convention).
    expect(args).not.toHaveProperty("temperature");
    expect(args).not.toHaveProperty("topP");
    expect(args).not.toHaveProperty("topK");

    expect(result).toEqual(output);
  });
});

// ---------------------------------------------------------------------------
// Budgets — single source of truth = lib/commentFit constants (§4.6)
// ---------------------------------------------------------------------------

describe("computeBudgets — pinned to the commentFit constants", () => {
  it('EVAL @ 10-pitch matches the §4.6 payload budgets verbatim', () => {
    expect(computeBudgets("EVAL", "10")).toEqual({
      // 75 x 14 = NAVPERS 1616/26 Block 43 at TRUE 10-pitch (12 pt Courier), measured
      // off the blank (tests/unit/commentCapacity.test.ts). This budget said 18 lines
      // for every form, then 90 x 17 — which is the 12-pitch figure, not this one.
      comments: { chars_per_line: 75, max_lines: 14, target_lines: 13 },
      primary_duties: { chars_per_line: 91, max_lines: 3, first_line_lead: 20 },
      primary_duty_abbrev: { max_chars: 14 },
      command_achievements: { chars_per_line: 91, max_lines: 3 },
      qualifications: { chars_per_line: 91, max_lines: 2 },
      career_recommendations: { slots: 2, max_chars: 20 },
    });
  });

  it("CHIEFEVAL @ 12-pitch: 90 CPL, 4-line 29B, and NO qualifications budget", () => {
    const b = computeBudgets("CHIEFEVAL", "12") as any;
    // 1616/27's Block 40 is less than half the EVAL's Block 43: 8 lines at 12-pitch.
    // Budgeting the model 18 here was the coach's licence to over-write the block.
    // 84 CPL is gone — it was the width of a setting no form permits.
    expect(b.comments).toEqual({
      chars_per_line: 90,
      max_lines: 8,
      target_lines: 7,
    });
    expect(b.primary_duties).toEqual({
      chars_per_line: 91,
      max_lines: 4,
      first_line_lead: 20,
    });
    expect(b).not.toHaveProperty("qualifications");
  });

  it("FITREP also omits the qualifications budget (Block 44 is EVAL-only)", () => {
    expect(computeBudgets("FITREP", "10") as any).not.toHaveProperty(
      "qualifications",
    );
  });
});

describe("buildAutofillPayload — payload shape and PII strip (§1.2 item 10)", () => {
  it("budgets deep-equal computeBudgets and physical_readiness is server-collapsed", () => {
    const req = makeReq();
    const payload = buildAutofillPayload(req) as any;
    expect(payload.budgets).toEqual(computeBudgets("EVAL", "10"));
    expect(payload.physical_readiness).toBe("PB");
    expect(payload.report_type).toBe("EVAL");
    expect(payload.pitch).toBe("10");
  });

  it("the serialized payload never contains the DoD ID — and the input is not mutated", () => {
    const req = makeReq();
    const serialized = JSON.stringify(buildAutofillPayload(req));
    expect(serialized).not.toContain(SENTINEL_DOD_ID);
    // Deleted from a COPY (§4.6) — the caller's request keeps its value.
    expect(req.brag.admin.dod_id).toBe(SENTINEL_DOD_ID);
  });

  it("the prompt runAutofill sends carries the same budgets and no DoD ID", async () => {
    const cm = scriptedModel(baseOutput());
    await runAutofill(makeReq(), cm);
    const prompt = cm.mock.calls[0][0];
    expect(JSON.parse(prompt).budgets).toEqual(computeBudgets("EVAL", "10"));
    expect(prompt).not.toContain(SENTINEL_DOD_ID);
  });
});

// ---------------------------------------------------------------------------
// resolveCitation — grammar (§4.6)
// ---------------------------------------------------------------------------

describe("resolveCitation — citation grammar", () => {
  const req = makeReq();

  it("resolves brag paths to defined, non-empty terminals only", () => {
    expect(resolveCitation("brag.duties[0].bullets[0]", req)).toBe(true);
    expect(resolveCitation("brag.duties[0].bullets[0].metrics", req)).toBe(true);
    expect(resolveCitation("brag.leadership.retention_efforts[0]", req)).toBe(true);
    expect(resolveCitation("brag.duties[9].bullets[0]", req)).toBe(false);
    expect(resolveCitation("brag.job.responsibilities", req)).toBe(false); // ""
    expect(resolveCitation("brag.accomplishments", req)).toBe(false); // []
  });

  it("brag.admin.dod_id NEVER resolves (stripped from the payload)", () => {
    expect(resolveCitation("brag.admin.dod_id", req)).toBe(false);
  });

  // v1.1 review fix: own-enumerable walk + evidence-leaf rule.
  it("inherited/junk paths never resolve (own-enumerable walk)", () => {
    expect(resolveCitation("brag.constructor", req)).toBe(false);
    expect(resolveCitation("brag.toString", req)).toBe(false);
    expect(resolveCitation("brag.hasOwnProperty", req)).toBe(false);
    expect(resolveCitation("brag.__proto__", req)).toBe(false);
    expect(resolveCitation("brag.admin.constructor", req)).toBe(false);
    expect(resolveCitation("brag.admin.hasOwnProperty", req)).toBe(false);
    // Arrays take index segments only — .length (even on an empty array) is junk.
    expect(resolveCitation("brag.duties.length", req)).toBe(false);
    expect(resolveCitation("brag.accomplishments.length", req)).toBe(false);
  });

  // v1.2 review fix. v1.1 rejected every number and boolean, justified as "an
  // inherited method or an array's length can never substantiate a claim" — but
  // BOTH of those are killed by the own-enumerable walk (the test above), not by
  // the leaf rule, so the rule only ever refused the Sailor's own scalar entries.
  // Harmless under a `some()` source gate; under `every()` it deleted 59 of 226
  // items across 12 live claude-opus-5 runs, Block 29A in all 12 of them.
  it("a truthy scalar the Sailor entered IS evidence — counts, months, flags", () => {
    expect(resolveCitation("brag.duties[0].months_assigned", req)).toBe(true); // 12
    expect(resolveCitation("brag.duties[0].is_most_significant", req)).toBe(true); // true
    // Fixture sanity: these are really the number and the boolean, not strings.
    expect(typeof req.brag.duties[0].months_assigned).toBe("number");
    expect(typeof req.brag.duties[0].is_most_significant).toBe("boolean");
  });

  it("a falsy scalar is NOT evidence — 0 and false are template defaults, like \"\"", () => {
    // emptyBragSheetData seeds these at 0, so 0 cannot be told apart from a
    // field the Sailor never filled in — the same reason "" has always rejected.
    expect(req.brag.leadership.supervised_military).toBe(0); // untouched default
    expect(resolveCitation("brag.leadership.supervised_military", req)).toBe(
      false,
    );
    // ...and the SAME path with a real value resolves, so the rejection above is
    // about the value, not about the path or the type.
    const led = makeReq();
    led.brag.leadership.supervised_military = 22;
    expect(resolveCitation("brag.leadership.supervised_military", led)).toBe(true);

    const falseFlag = makeReq();
    falseFlag.brag.duties[0].is_most_significant = false;
    expect(resolveCitation("brag.duties[0].is_most_significant", falseFlag)).toBe(
      false,
    );
  });

  // v1.2: the object branch takes the same correction as the scalar branch. It
  // used to need a non-blank own STRING field, so the container of a fact was
  // refused while the fact itself resolved.
  it("a container resolves when anything inside it is evidence, at any depth", () => {
    expect(resolveCitation("brag.duties[0]", req)).toBe(true); // title is a non-empty string
    expect(resolveCitation("brag.pfa[0]", req)).toBe(true); // cycle/result strings

    // The exact contradiction v1.1 left behind.
    const led = makeReq();
    led.brag.leadership.supervised_military = 22;
    expect(resolveCitation("brag.leadership.supervised_military", led)).toBe(true);
    expect(resolveCitation("brag.leadership", led)).toBe(true);

    // Populated only through nested containers — no own string field at all.
    const quals = makeReq();
    quals.brag.qualifications.awards.push({ title: "NAM", date: "2025-09-30" });
    expect(
      Object.values(quals.brag.qualifications).every((v) => Array.isArray(v)),
    ).toBe(true);
    expect(resolveCitation("brag.qualifications", quals)).toBe(true);
  });

  it("an empty container is still not evidence", () => {
    // The negative half must not come free: these are empty in the fixture...
    expect(req.brag.counseling).toEqual({});
    expect(resolveCitation("brag.counseling", req)).toBe(false);
    expect(resolveCitation("brag.off_duty", req)).toBe(false);
    expect(resolveCitation("brag.qualifications", req)).toBe(false);

    // ...and the SAME paths resolve once something real is inside them, so the
    // rejection is about emptiness, not about the path.
    const filled = makeReq();
    filled.brag.counseling.counselor = "ITC MORALES";
    filled.brag.off_duty.community.push({ text: "Coached youth robotics" });
    expect(resolveCitation("brag.counseling", filled)).toBe(true);
    expect(resolveCitation("brag.off_duty", filled)).toBe(true);
  });

  // The prompt hands the model a top-level `physical_readiness` string and tells
  // it to echo the value; before v1.2 the grammar had no root for it, so the
  // model's correct citation failed.
  it("resolves the payload's own physical_readiness root when there are PFA rows", () => {
    expect(buildAutofillPayload(req).physical_readiness).toBe("PB");
    expect(resolveCitation("physical_readiness", req)).toBe(true);

    const noPfa = makeReq();
    noPfa.brag.pfa = [];
    expect(resolveCitation("physical_readiness", noPfa)).toBe(false);
    // It is a root in its own right, not a prefix that opens up others.
    expect(resolveCitation("physical_readiness.text", req)).toBe(false);
  });

  it("resolves prior_evals by exact period_to key, with optional field", () => {
    expect(resolveCitation("prior_evals[2025-03-15]", req)).toBe(true);
    expect(resolveCitation("prior_evals[2025-03-15].comments", req)).toBe(true);
    expect(resolveCitation("prior_evals[2099-01-01].comments", req)).toBe(false);
  });

  it("resolves ladr by category AND milestone_id", () => {
    expect(resolveCitation("ladr.qual_warfare[m1]", req)).toBe(true);
    expect(resolveCitation("ladr.credential[m1]", req)).toBe(false);
    expect(resolveCitation("ladr.qual_warfare[m9]", req)).toBe(false);
  });

  // v1.2: the model emitted the dot spelling in 1 of 12 live runs. It names the
  // same pair against the same list, so it resolves exactly what the bracket
  // form resolves — and nothing more.
  it("accepts the dot spelling of a ladr path, with identical strictness", () => {
    expect(resolveCitation("ladr.qual_warfare.m1", req)).toBe(true);
    expect(resolveCitation("ladr.credential.m1", req)).toBe(false); // wrong category
    expect(resolveCitation("ladr.qual_warfare.m9", req)).toBe(false); // wrong id
    expect(resolveCitation("ladr.qual_warfare", req)).toBe(false); // no id at all
  });

  // M20 — the bracket form's category group is `[^.[\]]+`, so "no LadrCategory
  // contains a dot" became load-bearing for the dot-vs-bracket split above.
  // LADR_CATEGORY_WEIGHTS is `Record<LadrCategory, number>`, so the compiler
  // makes its keys the exhaustive list.
  it("no LadrCategory contains a dot — the dot/bracket split depends on it", () => {
    const categories = Object.keys(LADR_CATEGORY_WEIGHTS);
    expect(categories.length).toBeGreaterThan(5);
    expect(categories.filter((c) => c.includes("."))).toEqual([]);
  });

  // v1.2 (F2): `req.ladr` is an array in the payload, and the model spells the
  // citation that way in 2 of 8 runs on an independent campaign.
  it("accepts the array-index spelling of a ladr path", () => {
    expect(resolveCitation("ladr[0]", req)).toBe(true);
    expect(resolveCitation("ladr[0].status", req)).toBe(true);
    expect(resolveCitation("ladr[0].milestone_id", req)).toBe(true);
    expect(resolveCitation("ladr[9]", req)).toBe(false); // out of range
    expect(resolveCitation("ladr[9].status", req)).toBe(false);
    // Whitelisted fields only — the index form can never walk into junk.
    expect(resolveCitation("ladr[0].constructor", req)).toBe(false);
    expect(resolveCitation("ladr[0].__proto__", req)).toBe(false);
    expect(resolveCitation("ladr[0].nope", req)).toBe(false);
    // A blank whitelisted field is not evidence, and the same field with a real
    // value is — so the rejection is about the value, not the spelling.
    const blank = makeReq();
    blank.ladr[0].item = "";
    expect(resolveCitation("ladr[0].item", blank)).toBe(false);
    expect(resolveCitation("ladr[0].item", req)).toBe(true);
  });

  it("anything else is unresolvable — including non-payload roots", () => {
    expect(resolveCitation("totally bogus path", req)).toBe(false);
    expect(resolveCitation("prior_evals", req)).toBe(false);
    // §4.6: the only roots are brag / prior_evals / ladr.
    expect(resolveCitation("admin.member_name", req)).toBe(false);
    expect(resolveCitation("duties[0].bullets[0]", req)).toBe(false);
    expect(resolveCitation("window.location.href", req)).toBe(false);
    expect(resolveCitation("process.env", req)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runAutofill — pipeline (§7)
// ---------------------------------------------------------------------------

describe("runAutofill — citation-or-delete (§7 step 2, invariant §1.2 item 4)", () => {
  it("strips items with unresolvable sources from items AND text; records citation_failures", async () => {
    const out = baseOutput();
    out.blocks.comments = {
      text: "GOOD LINE ALPHA\nBAD LINE BRAVO",
      items: [
        { text: "GOOD LINE ALPHA", sources: [CIT] },
        { text: "BAD LINE BRAVO", sources: ["brag.duties[9].bullets[0]"] },
      ],
    };
    const res = await runAutofill(makeReq(), scriptedModel(out));

    expect(res.blocks.comments.items).toHaveLength(1);
    expect(res.blocks.comments.items[0].text).toBe("GOOD LINE ALPHA");
    // v1.1 review fix: released text is REBUILT from surviving items only.
    expect(res.blocks.comments.text).toBe("GOOD LINE ALPHA");

    expect(res.citation_failures).toHaveLength(1);
    expect(res.citation_failures[0]).toMatchObject({
      block: "comments",
      text: "BAD LINE BRAVO",
      bad_sources: ["brag.duties[9].bullets[0]"],
    });

    // Every surviving item in every block carries ≥1 source.
    for (const block of Object.values(res.blocks) as any[]) {
      for (const item of block.items) {
        expect(item.sources.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  // v1.1 review fix: block.text is derived output — the model's own text field
  // is never released, so uncited fabrications cannot be laundered past the
  // per-item gate by one resolvable sibling item, and whitespace drift between
  // item text and block text can no longer leave removed text behind.
  it("model-authored block.text is never released: uncited text absent from items is dropped by construction", async () => {
    const out = baseOutput();
    out.blocks.comments = {
      text: "CITED LINE.  FABRICATED UNCITED SENTENCE THE ITEMS NEVER MENTION.",
      items: [{ text: "CITED LINE.", sources: [CIT] }],
    };
    const res = await runAutofill(makeReq(), scriptedModel(out));
    expect(res.blocks.comments.text).toBe("CITED LINE.");
    expect(res.blocks.comments.text).not.toContain("FABRICATED");
  });

  // T2: an uncited item whose text is a SUBSTRING of a cited sibling. The old
  // exact-indexOf surgery could excise "12 SAILORS" out of the middle of the
  // legit sentence; the rebuild must keep the cited item byte-exact.
  it("an uncited substring item never corrupts its cited sibling (exact rebuild)", async () => {
    const out = baseOutput();
    out.blocks.comments = {
      text: "LED 12 SAILORS THROUGH INSURV WITH ZERO DISCREPANCIES",
      items: [
        {
          text: "LED 12 SAILORS THROUGH INSURV WITH ZERO DISCREPANCIES",
          sources: [CIT],
        },
        { text: "12 SAILORS", sources: ["brag.duties[9].bullets[0]"] },
      ],
    };
    const res = await runAutofill(makeReq(), scriptedModel(out));

    expect(res.blocks.comments.text).toBe(
      "LED 12 SAILORS THROUGH INSURV WITH ZERO DISCREPANCIES",
    );
    expect(res.blocks.comments.items).toHaveLength(1);
    expect(res.citation_failures).toContainEqual(
      expect.objectContaining({ block: "comments", text: "12 SAILORS" }),
    );
  });

  // T2: whitespace drift between the uncited item and the model's block text.
  // The old removeSegment indexOf would silently no-op and leave the drifted
  // copy in the released text; the rebuild drops it by construction.
  it("a whitespace-drifted uncited item is absent from the released text", async () => {
    const out = baseOutput();
    out.blocks.comments = {
      // Model text carries the claim with drifted spacing vs. its item.
      text: "GOOD LINE ALPHA\nBAD  LINE   BRAVO",
      items: [
        { text: "GOOD LINE ALPHA", sources: [CIT] },
        { text: "BAD LINE BRAVO", sources: ["brag.duties[9].bullets[0]"] },
      ],
    };
    const res = await runAutofill(makeReq(), scriptedModel(out));

    expect(res.blocks.comments.text).toBe("GOOD LINE ALPHA");
    expect(res.blocks.comments.text).not.toMatch(/BAD\s+LINE/);
    expect(res.citation_failures).toContainEqual(
      expect.objectContaining({ block: "comments", text: "BAD LINE BRAVO" }),
    );
  });

  it("comments rebuild newline-joins items; flowed blocks space-join (spec §4.2)", async () => {
    const out = baseOutput();
    out.blocks.comments = {
      text: "ignored model text",
      items: [
        { text: "OPENER LINE", sources: [CIT] },
        { text: "- BULLET LINE", sources: [CIT] },
      ],
    };
    out.blocks.primary_duties = {
      text: "ignored model text",
      items: [
        { text: "LEADING PETTY OFFICER-12;", sources: [CIT] },
        { text: "25-1:P; 25-2:B/BAD DAY", sources: ["brag.pfa[0]"] },
      ],
    };
    const res = await runAutofill(makeReq(), scriptedModel(out));
    expect(res.blocks.comments.text).toBe("OPENER LINE\n- BULLET LINE");
    expect(res.blocks.primary_duties.text).toBe(
      "LEADING PETTY OFFICER-12; 25-1:P; 25-2:B/BAD DAY",
    );
  });

  it("advisory with zero resolvable sources keeps its recommendation but withholds the rationale", async () => {
    const out = baseOutput();
    out.promotion_advisory.sources = ["brag.duties[9].bullets[0]"];
    const res = await runAutofill(makeReq(), scriptedModel(out));

    expect(res.promotion_advisory.advisory_only).toBe(true);
    expect(res.promotion_advisory.recommendation).toBe("Must Promote");
    expect(res.promotion_advisory.rationale).toBe(
      "No cited evidence survived validation — advisory withheld.",
    );
  });
});

// ---------------------------------------------------------------------------
// v1.2 review fix — WITHIN-item laundering (§7 step 2, invariant §1.2 item 4)
// ---------------------------------------------------------------------------
//
// The gate was `sources.some(resolveCitation)`. The v1.1 rebuild closed the
// CROSS-item hole (an uncited sentence riding in block.text beside a cited
// sibling item) and left the WITHIN-item one open: an item citing one real path
// and one invented one was kept WHOLE, and `bad_sources` stayed empty because it
// only populated when every source failed — so the failure was invisible on
// screen as well as in the payload. This is the same defect #24 fixed in
// lib/boardConfidence/narrative.ts (`cited.every(...)`, checkCitation).
describe("runAutofill — one real source must not carry a fabricated one", () => {
  // Shaped like a real award citation; `qualifications.awards` is empty in the
  // fixture, so index 0 is out of range and the path cannot resolve.
  const INVENTED = "brag.qualifications.awards[0].title";
  const GROUNDED = "LED 12 SAILORS THROUGH INSURV";
  const MIXED = "LED 12 SAILORS THROUGH INSURV AND EARNED THE NAM";

  it("fixture sanity: one path resolves and the other does not", () => {
    const req = makeReq();
    expect(req.brag.qualifications.awards).toEqual([]);
    expect(resolveCitation(CIT, req)).toBe(true);
    expect(resolveCitation(INVENTED, req)).toBe(false);
  });

  it("deletes the mixed item, keeps its all-resolving twin, and reports only the failing path", async () => {
    const out = baseOutput();
    out.blocks.comments = {
      text: "model text is never released",
      items: [
        { text: GROUNDED, sources: [CIT, "brag.pfa[0]"] },
        { text: MIXED, sources: [CIT, INVENTED] },
      ],
    };
    const res = await runAutofill(makeReq(), scriptedModel(out));

    // POSITIVE: multi-source is not itself disqualifying — the item whose every
    // source resolves survives with its text intact. (A gate that deleted both
    // items would satisfy the negative assertions below on its own.)
    expect(res.blocks.comments.items.map((i) => i.text)).toEqual([GROUNDED]);
    expect(res.blocks.comments.text).toBe(GROUNDED);

    // The laundered claim is gone from the released text, not merely from items.
    expect(res.blocks.comments.text).not.toContain("NAM");

    const failure = res.citation_failures.find((f) => f.text === MIXED);
    expect(failure).toBeDefined();
    expect(failure!.block).toBe("comments");
    // bad_sources is the failing path ALONE — listing the resolving sibling
    // would send its author to fix a citation that was never broken.
    expect(failure!.bad_sources).toEqual([INVENTED]);
  });

  it("the same gate covers every block, not just comments", async () => {
    const out = baseOutput();
    out.blocks.command_achievements = {
      text: "model text is never released",
      items: [{ text: "COMMAND EARNED THE BATTLE E", sources: [CIT, INVENTED] }],
    };
    const res = await runAutofill(makeReq(), scriptedModel(out));

    expect(res.blocks.command_achievements.items).toEqual([]);
    expect(res.blocks.command_achievements.text).toBe("");
    expect(res.citation_failures).toContainEqual({
      block: "command_achievements",
      text: "COMMAND EARNED THE BATTLE E",
      bad_sources: [INVENTED],
    });
  });

  it("an item citing nothing cannot reach the gate — the schema rejects it", () => {
    const out = baseOutput();
    out.blocks.comments.items[0].sources = [];
    expect(AutofillModelOutputSchema.safeParse(out).success).toBe(false);
    // POSITIVE control: the same output with one source parses, so the failure
    // above is about `sources: []` and not about some other field.
    out.blocks.comments.items[0].sources = [CIT];
    expect(AutofillModelOutputSchema.safeParse(out).success).toBe(true);
  });

  it("withholds a partly-cited advisory, empties its sources, and records the failure", async () => {
    const out = baseOutput();
    const original = out.promotion_advisory.rationale;
    out.promotion_advisory.sources = [CIT, "placeholder"];
    const res = await runAutofill(makeReq(), scriptedModel(out));

    expect(res.promotion_advisory.rationale).toBe(
      "No cited evidence survived validation — advisory withheld.",
    );
    // A path that failed must not render as a provenance chip beside the
    // withheld advisory (§6).
    expect(res.promotion_advisory.sources).toEqual([]);

    const failure = res.citation_failures.find(
      (f) => f.block === "promotion_advisory",
    );
    expect(failure).toBeDefined();
    expect(failure!.text).toBe(original); // the panel shows what was withheld
    expect(failure!.bad_sources).toEqual(["placeholder"]);
  });

  it("withholds an advisory that cites nothing at all (every() is vacuous on [])", async () => {
    // promotion_advisory.sources has no .min(1), so this shape really does
    // arrive from the model — and `[].every(...)` is true.
    const out = baseOutput();
    out.promotion_advisory.sources = [];
    expect(AutofillModelOutputSchema.safeParse(out).success).toBe(true);

    const res = await runAutofill(makeReq(), scriptedModel(out));
    expect(res.promotion_advisory.rationale).toBe(
      "No cited evidence survived validation — advisory withheld.",
    );
    expect(
      res.citation_failures.filter((f) => f.block === "promotion_advisory"),
    ).toHaveLength(1);
  });

  it("POSITIVE: a fully cited advisory keeps its rationale and its sources, unreported", async () => {
    const out = baseOutput();
    const original = out.promotion_advisory.rationale;
    out.promotion_advisory.sources = [CIT, "brag.pfa[0]"];
    const res = await runAutofill(makeReq(), scriptedModel(out));

    expect(res.promotion_advisory.rationale).toBe(original);
    expect(res.promotion_advisory.recommendation).toBe("Must Promote");
    expect(res.promotion_advisory.sources).toEqual([CIT, "brag.pfa[0]"]);
    expect(
      res.citation_failures.filter((f) => f.block === "promotion_advisory"),
    ).toEqual([]);
  });
});

// T1: hostile citation paths driven through the full pipeline — every one must
// land in citation_failures and NEVER surface in any released block text.
describe("runAutofill — hostile citation paths (§4.6, v1.1 review fix)", () => {
  const HOSTILE: Array<[source: string, text: string]> = [
    ["brag.constructor", "HOSTILE CONSTRUCTOR CLAIM"],
    ["brag.__proto__", "HOSTILE PROTO CLAIM"],
    ["brag.admin.hasOwnProperty", "HOSTILE INHERITED METHOD CLAIM"],
    ["brag.duties.length", "HOSTILE ARRAY LENGTH CLAIM"],
    ["brag.accomplishments.length", "HOSTILE EMPTY ARRAY LENGTH CLAIM"],
    ["brag.duties[9].bullets[0]", "HOSTILE OUT OF RANGE CLAIM"],
    ["admin.member_name", "HOSTILE NON PAYLOAD ROOT CLAIM"],
    ["window.location.href", "HOSTILE BOGUS ROOT CLAIM"],
  ];

  it("all hostile paths fail citation and none of their text is released", async () => {
    const req = makeReq();
    // Fixture sanity: accomplishments really is the empty-array case.
    expect(req.brag.accomplishments).toEqual([]);

    const out = baseOutput();
    out.blocks.comments = {
      text: "model text is never released",
      items: [
        { text: "GOOD LINE ALPHA", sources: [CIT] },
        ...HOSTILE.map(([source, text]) => ({ text, sources: [source] })),
      ],
    };
    const res = await runAutofill(req, scriptedModel(out));

    // Only the legitimately cited item survives — exact rebuilt text.
    expect(res.blocks.comments.text).toBe("GOOD LINE ALPHA");
    expect(res.blocks.comments.items).toHaveLength(1);

    // Every hostile source is recorded as a citation failure.
    const failed = res.citation_failures
      .filter((f: any) => f.block === "comments")
      .map((f: any) => f.bad_sources[0]);
    expect(failed.sort()).toEqual(HOSTILE.map(([s]) => s).sort());

    // No hostile text appears in ANY released block.
    const released = (Object.values(res.blocks) as any[])
      .map((b) => b.text)
      .join("\n");
    for (const [, text] of HOSTILE) {
      expect(released).not.toContain(text);
    }
  });
});

describe("runAutofill — missing-info flags (§7 step 3)", () => {
  it("model flags pass through; the Bad-Day/B server flag is appended when 29B lacks a PFA note", async () => {
    const out = baseOutput();
    out.missing_info = [
      {
        block: 43,
        field: "brag.duties[0].bullets[0].metrics",
        message: "Add a metric",
      },
    ];
    // No /\d{2}-[12]/ cycle note in 29B while a B cycle exists in brag.pfa.
    out.blocks.primary_duties = {
      text: "LEADING PETTY OFFICER-12",
      items: [{ text: "LEADING PETTY OFFICER-12", sources: [CIT] }],
    };
    const res = await runAutofill(makeReq(), scriptedModel(out));

    expect(res.missing_info).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          block: 43,
          field: "brag.duties[0].bullets[0].metrics",
        }),
        expect.objectContaining({ block: 29, field: "brag.pfa" }),
      ]),
    );
  });
});

describe("runAutofill — deterministic Block 20 overwrite (§7 step 3, invariant §1.2 item 5)", () => {
  it('a model echo of "XX" is overwritten with the server-computed collapse', async () => {
    const out = baseOutput();
    out.blocks.physical_readiness.text = "XX";
    const res = await runAutofill(makeReq(), scriptedModel(out));
    expect(res.blocks.physical_readiness.text).toBe("PB");
  });
});

describe("runAutofill — overflow: one retry, then flag, NEVER truncate (§7 step 5)", () => {
  // 21 distinct sub-90-char lines → exactly 21 wrapped lines at 90 CPL.
  const overComments = Array.from(
    { length: 21 },
    (_, i) =>
      `- OVERFLOW BULLET ${String(i + 1).padStart(2, "0")} SUSTAINED SUPERIOR RESULTS THIS PERIOD`,
  ).join("\n");

  const overflowOutput = () => {
    const out = baseOutput();
    out.blocks.comments = {
      text: overComments,
      items: [{ text: overComments, sources: [CIT] }],
    };
    // 15 chars — exceeds PRIMARY_DUTY_ABBREV_MAX (14).
    out.blocks.primary_duty_abbrev = {
      text: "COMMUNICATIONS!",
      items: [{ text: "COMMUNICATIONS!", sources: [CIT] }],
    };
    return out;
  };

  it("retries once with concrete 21/14 feedback, then returns flagged with preview + dropped lines", async () => {
    const fit = checkCommentFit(overComments, "10", "EVAL");
    expect(fit.linesUsed).toBe(21); // fixture sanity
    // NAVPERS 1616/26 Block 43 holds 14 lines at TRUE 10-pitch (12 pt) — measured off
    // the blank in tests/unit/commentCapacity.test.ts. Not 18, not 17 (that is this
    // form at 12-pitch), and not the CHIEFEVAL's or FITREP's.
    expect(fit.maxLines).toBe(14);

    const cm = scriptedModel(overflowOutput(), overflowOutput());
    const res = await runAutofill(makeReq(), cm);

    // Exactly one overflow retry (≤3 calls total per run).
    expect(cm).toHaveBeenCalledTimes(2);
    const retryPrompt = cm.mock.calls[1][0];
    expect(retryPrompt).toContain("21/14");
    expect(JSON.parse(retryPrompt).retry_feedback).toBeDefined();

    const report = res.fit_reports.comments;
    expect(report.overflow).toBe(true);
    expect(report.fit.linesUsed).toBe(21);
    expect(report.truncation_preview).toBe(
      fit.wrappedLines.slice(0, 14).join("\n"),
    );
    expect(report.dropped_lines).toEqual(fit.wrappedLines.slice(14));
    expect(report.dropped_lines).toHaveLength(7);
    // The server never trims the text itself.
    expect(res.blocks.comments.text).toBe(overComments);

    // The 15-char 29A abbrev overflows through its own fit_reports slot.
    expect(res.fit_reports.primary_duty_abbrev.overflow).toBe(true);
  });

  it("a fitting draft makes exactly one model call and reports overflow: false", async () => {
    const cm = scriptedModel(baseOutput());
    const res = await runAutofill(makeReq(), cm);
    expect(cm).toHaveBeenCalledTimes(1);
    expect(res.fit_reports.comments.overflow).toBe(false);
    expect(res.fit_reports.primary_duty_abbrev.overflow).toBe(false);
  });
});

describe("runAutofill — parse rule (§7 step 1, invariant §1.2 item 2)", () => {
  it("trait_grades in the model output is silently stripped, never a parse failure", async () => {
    const out = baseOutput();
    out.trait_grades = { knowledge: "5.0", leadership: "5.0" };
    const res = await runAutofill(makeReq(), scriptedModel(out));
    expect(res).not.toHaveProperty("trait_grades");
    // The generated output carries no trait grades anywhere. (dry_run may
    // legitimately WARN about ungraded traits — that's the validator's field
    // naming, not generated content.)
    expect(JSON.stringify(res.blocks)).not.toContain("trait_grades");
    expect(JSON.stringify(res.promotion_advisory)).not.toContain("trait_grades");
  });

  it("AutofillModelOutputSchema itself strips unknown keys (default strip semantics)", () => {
    const out = baseOutput();
    out.trait_grades = { knowledge: "5.0" };
    const parsed = AutofillModelOutputSchema.parse(out) as any;
    expect(parsed).not.toHaveProperty("trait_grades");
    expect(parsed.promotion_advisory.advisory_only).toBe(true);
  });

  it("a missing required block fails the parse (strict on required keys)", () => {
    const out = baseOutput();
    delete out.blocks.comments;
    expect(AutofillModelOutputSchema.safeParse(out).success).toBe(false);
  });

  it("non-conforming output twice → AutofillModelError after exactly 2 calls", async () => {
    const cm = scriptedModel({ nope: true }, { still: "nope" });
    await expect(runAutofill(makeReq(), cm)).rejects.toBeInstanceOf(
      AutofillModelError,
    );
    expect(cm).toHaveBeenCalledTimes(2);
  });

  it("parse retry succeeds: garbage then valid output → resolves in 2 calls", async () => {
    const cm = scriptedModel({ nope: true }, baseOutput());
    const res = await runAutofill(makeReq(), cm);
    expect(cm).toHaveBeenCalledTimes(2);
    expect(res.blocks.comments.text).toContain("LED 12 SAILORS");
  });

  it("worst case parse-retry + overflow-retry stays within 3 total calls", async () => {
    const cm = scriptedModel(
      { nope: true },
      (() => {
        const out = baseOutput();
        out.blocks.comments = {
          text: Array.from({ length: 21 }, (_, i) => `- LINE ${i + 1} X`).join("\n"),
          items: [
            {
              text: Array.from({ length: 21 }, (_, i) => `- LINE ${i + 1} X`).join("\n"),
              sources: [CIT],
            },
          ],
        };
        return out;
      })(),
      baseOutput(),
    );
    const res = await runAutofill(makeReq(), cm);
    expect(cm).toHaveBeenCalledTimes(3);
    expect(res.fit_reports.comments.overflow).toBe(false);
  });

  // The whole run gets ONE deadline. Per call, AUTOFILL_TIMEOUT_MS bounds each
  // hop and nothing overall: 3 × 240s = 720s, past the 300s platform ceiling, so
  // the retry path returns the host's 504 — no abort, no audit row — instead of
  // our 500. Regress to a per-call AbortSignal.timeout and this identity fails.
  it("shares ONE AbortSignal across all 3 calls (bounds the request, not the hop)", async () => {
    const overflowing = (() => {
      const out = baseOutput();
      const long = Array.from({ length: 21 }, (_, i) => `- LINE ${i + 1} X`).join("\n");
      out.blocks.comments = { text: long, items: [{ text: long, sources: [CIT] }] };
      return out;
    })();
    const seen: (AbortSignal | undefined)[] = [];
    // parse retry, then overflow retry — the only path that reaches 3 calls.
    const outputs: unknown[] = [{ nope: true }, overflowing, baseOutput()];
    let n = 0;
    const cm = vi.fn(async (_prompt: string, deadline?: AbortSignal) => {
      seen.push(deadline);
      return outputs[n++];
    });

    await runAutofill(makeReq(), cm);

    expect(seen).toHaveLength(3);
    expect(seen[0]).toBeInstanceOf(AbortSignal);
    // The same object every time — not a fresh timeout per call.
    expect(seen[1]).toBe(seen[0]);
    expect(seen[2]).toBe(seen[0]);
  });
});

// v1.1 review fix: brag_sheets.last_autofill is untrusted JSONB — the page
// safeParses it against AutofillResponseSchema before rendering the review
// panel; malformed/legacy values render an "unreadable" card, never a crash.
describe("AutofillResponseSchema — stored last_autofill boundary", () => {
  it("a real runAutofill result (plus model id) round-trips safeParse", async () => {
    const result = await runAutofill(makeReq(), scriptedModel(baseOutput()));
    const stored = { ...result, model: "anthropic/claude-opus-5" };
    expect(AutofillResponseSchema.safeParse(stored).success).toBe(true);
  });

  it("malformed/legacy stored values fail safeParse instead of reaching the panel", () => {
    expect(AutofillResponseSchema.safeParse(null).success).toBe(false);
    expect(AutofillResponseSchema.safeParse({ legacy: true }).success).toBe(false);
    // Model output alone (no fit_reports/dry_run/model) is not a response.
    expect(AutofillResponseSchema.safeParse(baseOutput()).success).toBe(false);
  });
});

describe("runAutofill — dry-run runFullValidation (§7 step 6)", () => {
  it("attaches a ValidationResult produced from the merged draft (comments = generated text)", async () => {
    const res = await runAutofill(makeReq(), scriptedModel(baseOutput()));

    expect(v.runFullValidation).toHaveBeenCalled();
    const merged = v.runFullValidation.mock.calls.at(-1)![0];
    expect(merged.comments).toBe(res.blocks.comments.text);

    expect(typeof res.dry_run.success).toBe("boolean");
    expect(Array.isArray(res.dry_run.errors)).toBe(true);
    expect(Array.isArray(res.dry_run.warnings)).toBe(true);
  });
});
