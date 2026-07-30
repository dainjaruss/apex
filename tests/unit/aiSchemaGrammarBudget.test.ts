// tests/unit/aiSchemaGrammarBudget.test.ts
//
// Compiles the structured-output schemas this repo sends to the model provider
// and asserts each stays inside the endpoint's constrained-decoding grammar
// budget. No network: this resolves the SAME lazy responseFormat promise the
// AI SDK resolves before it builds the request, so it fails in CI for the same
// reason the live endpoint 400s.
//
// Why this file exists: brag-sheet autofill shipped completely non-functional
// in direct mode. Every unit test mocked generateText and asserted only
// `expect(args.output).toBeDefined()` — which never resolves that promise — so
// the schema was never once compiled before it reached a real provider, and
// the provider rejected every call with "The compiled grammar is too large,
// which would cause performance issues."
//
// Calibration (measured against the configured direct endpoint, claude-opus-5,
// by sending candidate schemas and recording accept vs. reject):
//     3506 B → ACCEPT      3641 B → REJECT
// so the true cliff sits in 3506–3640 B of compiled JSON Schema. Byte count is
// a proxy for grammar production count, not the real unit, hence the margin:
// 3000 B keeps ~15% headroom under the lowest observed rejection.

import { describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ generateText: vi.fn() }));
vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, generateText: h.generateText };
});

import { asSchema } from "@ai-sdk/provider-utils";
import {
  AutofillModelOutputSchema,
  buildCallModel,
} from "@/lib/bragSheet/autofill";
import { NarrativeSchema } from "@/lib/boardConfidence/narrative";

const MAX_SCHEMA_BYTES = 3000;

/** The JSON Schema buildCallModel actually hands the provider — captured from
 *  the real call path, not from an exported constant a refactor could stop
 *  using. */
async function schemaSentByAutofill(): Promise<string> {
  h.generateText.mockReset();
  h.generateText.mockResolvedValue({ output: {} });
  await buildCallModel({
    model: "test/model",
    modelId: "test/model",
    mode: "gateway",
  })("{}");
  const { output } = h.generateText.mock.calls[0][0];
  const responseFormat = await output.responseFormat; // the promise nobody resolved
  return JSON.stringify(responseFormat.schema);
}

describe("structured-output schemas stay inside the provider's grammar budget", () => {
  it("brag-sheet autofill: the schema buildCallModel sends is under budget", async () => {
    expect((await schemaSentByAutofill()).length).toBeLessThan(MAX_SCHEMA_BYTES);
  });

  it("board-confidence narrative is under budget", async () => {
    const json = JSON.stringify(await asSchema(NarrativeSchema).jsonSchema);
    expect(json.length).toBeLessThan(MAX_SCHEMA_BYTES);
  });

  // The regression guard. buildCallModel must send the reference-sharing form:
  // with useReferences:false zod inlines a full copy of GeneratedBlock (and the
  // GeneratedItem inside it) into all SEVEN block keys, and the provider
  // compiles every copy into its own grammar productions.
  // `sources: z.array(z.string()).min(1)` occurs once inside GeneratedItem, so
  // the number of `"minItems":1` occurrences counts how many times that subtree
  // was duplicated: 7 when inlined, 1 when shared.
  it("autofill shares reused subtrees by reference instead of inlining them", async () => {
    const sent = await schemaSentByAutofill();
    expect(sent).toContain('"definitions"');
    expect(sent.split('"minItems":1').length - 1).toBe(1);
  });

  it("the inlined form of the same schema would blow the budget (the shipped bug)", async () => {
    const inlined = JSON.stringify(
      await asSchema(AutofillModelOutputSchema).jsonSchema,
    );
    expect(inlined).not.toContain('"definitions"');
    expect(inlined.split('"minItems":1').length - 1).toBe(7);
    expect(inlined.length).toBeGreaterThan(MAX_SCHEMA_BYTES);
  });
});
