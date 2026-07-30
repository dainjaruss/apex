// tests/unit/aiSchemaGrammarBudget.test.ts
//
// Guards the structured-output schemas this repo sends to the model provider.
//
// Why this file exists: brag-sheet autofill shipped completely non-functional in
// direct mode — the provider rejected every request with "The compiled grammar
// is too large, which would cause performance issues." It reached production
// because every unit test mocked generateText and asserted only
// `expect(args.output).toBeDefined()` (bragSheetAutofill.test.ts), which never
// resolves the lazy `responseFormat` promise. The schema was therefore never
// compiled in CI even once.
//
// WHAT THESE OFFLINE TESTS DO AND DO NOT PROVE
// They pin the two *structural* regressions we understand and can name. They are
// NOT a general "will the provider accept this schema" check, and nothing
// offline can be: the endpoint enforces at least two separate undocumented
// limits, and neither is a function of any single number computable here.
//   - Compiled size. Measured live: 3506B accepted, 3641B rejected — but a
//     3699B schema of 6 blocks + 11 plain string fields was ACCEPTED, so size
//     alone does not decide it. The byte assertion below is a loose smoke bound
//     against runaway growth, deliberately NOT calibrated to that cliff.
//   - Union breadth. A 2426B schema of 40 nullable fields was REJECTED with a
//     DIFFERENT error naming the real rule: "too many parameters with union
//     types (40 parameters with type arrays or anyOf). This causes exponential
//     compilation cost." Hence the union count below.
//   - Regex range quantifiers blow up at 366B. Not currently used; no guard.
// Only a live call is authoritative — see the key-gated smoke test at the end,
// which is the check that would actually have caught the shipped bug.

import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, generateText: h.generateText };
});

import { asSchema } from "ai";
import { resolveAiModel } from "@/lib/aiProvider";
import {
  DEFAULT_NARRATIVE_MODEL,
  NarrativeSchema,
} from "@/lib/boardConfidence/narrative";
import {
  AutofillModelOutputSchema,
  AutofillProviderSchema,
  AUTOFILL_SYSTEM_PROMPT,
  BRAG_AI_ENV,
  buildCallModel,
} from "@/lib/bragSheet/autofill";
import { CoachOutputSchema } from "@/lib/evalCoach/coach";

/** Loose smoke bound — catches a schema exploding by an order of magnitude, not
 *  a provider limit. See the header: 3699B is known-accepted and 2426B
 *  known-rejected, so a tight byte budget would be both wrong and misleading. */
const SMOKE_MAX_BYTES = 8_000;

/** The provider names 40 as the point where union breadth causes "exponential
 *  compilation cost". Stay well clear of it. */
const MAX_UNION_PARAMS = 25;

const occurrences = (haystack: string, needle: string): number =>
  haystack.split(needle).length - 1;

/** What the provider counts as a union parameter: JSON-Schema `anyOf`, plus
 *  draft-07 type arrays (`"type":["string","null"]`). */
const unionParams = (json: string): number =>
  occurrences(json, '"anyOf"') + occurrences(json, '"type":[');

const compile = async (schema: unknown): Promise<string> =>
  JSON.stringify(await asSchema(schema as never).jsonSchema);

/** The JSON Schema buildCallModel actually hands the provider — captured from
 *  the real call path, not from an exported constant a refactor could quietly
 *  stop using. Resolves the promise nobody resolved. */
async function schemaSentByAutofill(): Promise<string> {
  h.generateText.mockReset();
  h.generateText.mockResolvedValue({ output: {} });
  await buildCallModel({
    model: "test/model",
    modelId: "test/model",
    mode: "gateway",
  })("{}");
  const { output } = h.generateText.mock.calls[0][0];
  return JSON.stringify((await output.responseFormat).schema);
}

// ---------------------------------------------------------------------------
// The structural regression guards — the part of this file with real teeth
// ---------------------------------------------------------------------------

describe("autofill sends the reference-sharing schema, not seven inlined copies", () => {
  // With useReferences:false zod inlines a full copy of GeneratedBlock (and the
  // GeneratedItem inside it) into all SEVEN block keys, and the provider
  // compiles every copy into its own grammar productions. That is the bug.
  // `sources: z.array(z.string()).min(1)` occurs once inside GeneratedItem, so
  // the `"minItems":1` count is exactly how many times that subtree was
  // duplicated: 1 when shared, 7 when inlined.
  it("shares reused subtrees by reference", async () => {
    const sent = await schemaSentByAutofill();
    expect(sent).toContain('"definitions"'); // draft-07 spelling of $defs
    expect(occurrences(sent, '"minItems":1')).toBe(1);
  });

  it("the inlined form duplicates the subtree seven times (the shipped bug)", async () => {
    const inlined = await compile(AutofillModelOutputSchema);
    expect(inlined).not.toContain('"definitions"');
    expect(occurrences(inlined, '"minItems":1')).toBe(7);
  });

  // Sharing must not change meaning: `sources` stays required with its minItems,
  // so the citation architecture is untouched by the serialisation change.
  it("keeps sources required with minItems intact", async () => {
    const sent = await schemaSentByAutofill();
    expect(sent).toContain('"required":["text","sources"]');
    expect(sent).toContain('"minItems":1');
  });
});

// ---------------------------------------------------------------------------
// Cheap sanity bounds across every structured-output schema in the repo
// ---------------------------------------------------------------------------

describe("structured-output schemas stay clear of the known provider limits", () => {
  const schemas: [string, unknown][] = [
    ["brag-sheet autofill", AutofillProviderSchema],
    ["board-confidence narrative", NarrativeSchema],
    ["eval coach", CoachOutputSchema],
  ];

  it.each(schemas)("%s: union breadth well under 40", async (_n, schema) => {
    expect(unionParams(await compile(schema))).toBeLessThan(MAX_UNION_PARAMS);
  });

  it.each(schemas)("%s: no runaway growth", async (_n, schema) => {
    expect((await compile(schema)).length).toBeLessThan(SMOKE_MAX_BYTES);
  });
});

// ---------------------------------------------------------------------------
// The authoritative check — live, key-gated, skipped in CI without credentials
// ---------------------------------------------------------------------------
//
// The only test here that can actually answer "will the provider accept our
// schema". It sends the real schema with a throwaway prompt and a 16-token cap:
// the grammar rejection is a request-validation 400 that fires before any
// generation (measured ~0.4s), so this is fast and costs essentially nothing.
// Run it with the direct endpoint configured, e.g.
//   set -a; . .env.local; set +a; npx vitest run tests/unit/aiSchemaGrammarBudget.test.ts

const live = process.env.BOARD_NARRATIVE_BASE_URL ? describe : describe.skip;

live("live: the provider accepts the schema we actually send", () => {
  it(
    "does not reject the compiled grammar",
    async () => {
      const { generateText, Output } =
        await vi.importActual<typeof import("ai")>("ai");
      const resolved = resolveAiModel(BRAG_AI_ENV, DEFAULT_NARRATIVE_MODEL)!;
      try {
        await generateText({
          model: resolved.model,
          maxRetries: 0,
          maxOutputTokens: 16,
          system: AUTOFILL_SYSTEM_PROMPT,
          prompt: "{}",
          output: Output.object({ schema: AutofillProviderSchema }),
        });
      } catch (err) {
        // Any other failure (token cap, unparseable output) means the schema was
        // accepted — only the grammar/compilation rejection matters here.
        const detail = `${(err as Error).message} ${(err as { responseBody?: string }).responseBody ?? ""}`;
        expect(detail).not.toMatch(
          /grammar is too large|exponential compilation/i,
        );
      }
    },
    60_000,
  );
});
