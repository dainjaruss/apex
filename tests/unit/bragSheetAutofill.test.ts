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
  AutofillModelError,
  computeBudgets,
  buildAutofillPayload,
  resolveCitation,
  runAutofill,
  buildCallModel,
} from "@/lib/bragSheet/autofill";
import { resolveAiModel } from "@/lib/aiProvider";
import { DEFAULT_NARRATIVE_MODEL } from "@/lib/boardConfidence/narrative";
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
      comments: { chars_per_line: 90, max_lines: 18, target_lines: 17 },
      primary_duties: { chars_per_line: 91, max_lines: 3, first_line_lead: 20 },
      primary_duty_abbrev: { max_chars: 14 },
      command_achievements: { chars_per_line: 91, max_lines: 3 },
      qualifications: { chars_per_line: 91, max_lines: 2 },
      career_recommendations: { slots: 2, max_chars: 20 },
    });
  });

  it("CHIEFEVAL @ 12-pitch: 84 CPL, 4-line 29B, and NO qualifications budget", () => {
    const b = computeBudgets("CHIEFEVAL", "12") as any;
    expect(b.comments).toEqual({
      chars_per_line: 84,
      max_lines: 18,
      target_lines: 17,
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

  it("anything else is unresolvable", () => {
    expect(resolveCitation("totally bogus path", req)).toBe(false);
    expect(resolveCitation("prior_evals", req)).toBe(false);
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
    expect(res.blocks.comments.text).toContain("GOOD LINE ALPHA");
    expect(res.blocks.comments.text).not.toContain("BAD LINE BRAVO");

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

  it("retries once with concrete 21/18 feedback, then returns flagged with preview + dropped lines", async () => {
    const fit = checkCommentFit(overComments, "10");
    expect(fit.linesUsed).toBe(21); // fixture sanity

    const cm = scriptedModel(overflowOutput(), overflowOutput());
    const res = await runAutofill(makeReq(), cm);

    // Exactly one overflow retry (≤3 calls total per run).
    expect(cm).toHaveBeenCalledTimes(2);
    const retryPrompt = cm.mock.calls[1][0];
    expect(retryPrompt).toContain("21/18");
    expect(JSON.parse(retryPrompt).retry_feedback).toBeDefined();

    const report = res.fit_reports.comments;
    expect(report.overflow).toBe(true);
    expect(report.fit.linesUsed).toBe(21);
    expect(report.truncation_preview).toBe(
      fit.wrappedLines.slice(0, 18).join("\n"),
    );
    expect(report.dropped_lines).toEqual(fit.wrappedLines.slice(18));
    expect(report.dropped_lines).toHaveLength(3);
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
