// tests/unit/commentCapacity.test.ts
//
// The comment block's capacity, pinned to the BLANK FORMS in public/ rather than to
// whatever APEX currently emits.
//
// Prior rounds on this epic kept landing tests that asserted today's output, so a wrong
// constant stayed green. These assertions are built the other way round: the box
// coordinates below were read out of each blank's own content stream (the printed rules
// that bound the comment block, and the printed instruction header inside it), and every
// check is "does the rendered PDF land inside THAT". If someone changes a capacity, a top
// baseline, the font model, or the wrap, one of these fails.
//
// Definition of capacity used throughout: the number of lines APEX prints FULLY INSIDE
// the block's printed box, with line 1 clear of the form's own printed instruction
// header. Text past that line does not reach the signed record.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { getDocumentProxy } from "unpdf";
import { generateOverlayPdf } from "@/lib/pdfOverlay";
import { generateFitrepOverlayPdf } from "@/lib/fitrepOverlay";
import { checkCommentFit, getCommentCapacity } from "@/lib/commentFit";
import { runFullValidation } from "@/lib/validationEngine";
import { coachPayload } from "@/lib/evalCoach/coach";
import type { Evaluation } from "@/types";

// pdf-lib's Courier: Descender -157/1000 em, CapHeight 562/1000 em. The overlays draw the
// narrative in Courier, so these are the extents that decide "inside the box".
const DESCENDER = 0.157;
const CAP_HEIGHT = 0.562;

/**
 * Measured off the blank forms. Method for each number, reproducible from the file:
 * inflate page 2's content stream, walk the q/Q/cm stack, and take the full-width stroked
 * rules that bound the comment block. All three forms stroke at 0.72 pt, so the box
 * INTERIOR is the rule centreline ± 0.36. `headerFloor` is the descender of the lowest
 * instruction line the form prints INSIDE that box — line 1 of the narrative must clear it.
 */
const FORMS = {
  EVAL: {
    blank: "navpers-1616-26_2025.pdf",
    block: 43,
    // Rules at y=468.40 and y=253.12; header baselines 460.48 and 453.28 at 6.468 pt.
    boxTop: 468.04,
    boxFloor: 253.48,
    headerFloor: 453.28 - 6.468 * DESCENDER, // 452.26
  },
  CHIEFEVAL: {
    blank: "chiefEvalBlank.pdf",
    block: 40,
    // Rules at y=380.88 and y=277.20; header baseline 372.36 at 6.947 pt.
    boxTop: 380.52,
    boxFloor: 277.56,
    headerFloor: 372.36 - 6.947 * DESCENDER, // 371.27
  },
  FITREP: {
    blank: "fitrepBlank.pdf",
    block: 41,
    // Rules at y=469.44 and y=226.08; header baselines 460.08 and 452.88 at 6.468 pt.
    boxTop: 469.08,
    boxFloor: 226.44,
    headerFloor: 452.88 - 6.468 * DESCENDER, // 451.86
  },
} as const;

type FormKey = keyof typeof FORMS;

const draft = (reportType: FormKey, pitch: "10" | "12", comments: string) =>
  ({
    id: "capacity-probe",
    created_by: "u",
    form_definition_id: "d",
    report_type: reportType,
    member_name: "TEST, SAILOR A",
    grade_rate: reportType === "FITREP" ? "LT" : reportType === "CHIEFEVAL" ? "ITC" : "IT1",
    period_from: "2025-01-01",
    period_to: "2025-11-15",
    trait_grades: {},
    comments,
    block_values: { comment_pitch: pitch },
  }) as unknown as Evaluation;

/** N distinct full-width lines, each tagged so it can be found in the output. */
const probeLines = (n: number) =>
  Array.from({ length: n }, (_, i) => `L${String(i + 1).padStart(2, "0")}` + "X".repeat(70)).join("\n");

/** Render, then read back every probe line's baseline and font size from the real PDF. */
async function renderedCommentLines(
  form: FormKey,
  pitch: "10" | "12",
  lineCount: number,
) {
  const template = new Uint8Array(
    fs.readFileSync(path.join(process.cwd(), "public", FORMS[form].blank)),
  );
  const ev = draft(form, pitch, probeLines(lineCount));
  const bytes =
    form === "FITREP"
      ? await generateFitrepOverlayPdf(ev, template)
      : await generateOverlayPdf(ev, template);

  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const items = (await (await pdf.getPage(2)).getTextContent()).items as any[];
  return items
    .filter((i) => /^L\d\dX/.test(i.str ?? ""))
    .map((i) => ({
      n: Number(i.str.slice(1, 3)),
      baseline: i.transform[5] as number,
      size: Math.hypot(i.transform[1], i.transform[3]) as number,
    }))
    .sort((a, b) => a.n - b.n);
}

describe("comment-block capacity is a property of the form, not a constant", () => {
  it("is a different number on each of the three forms", () => {
    // The defect this file exists for: one hardcoded 18 answered for all three.
    expect(getCommentCapacity("EVAL", "10")).toBe(16);
    expect(getCommentCapacity("CHIEFEVAL", "10")).toBe(8);
    expect(getCommentCapacity("FITREP", "10")).toBe(19);

    // Pitch is a real dimension of the answer, not a rounding detail.
    expect(getCommentCapacity("EVAL", "12")).toBe(15);
    expect(getCommentCapacity("CHIEFEVAL", "12")).toBe(7);
    expect(getCommentCapacity("FITREP", "12")).toBe(18);

    // No form is 18 at 10-pitch. The old constant was right nowhere.
    for (const f of ["EVAL", "CHIEFEVAL", "FITREP"] as const)
      expect(getCommentCapacity(f, "10")).not.toBe(18);
  });

  it("falls back to the EVAL for an unknown report type, never to the largest form", () => {
    expect(getCommentCapacity(undefined, "10")).toBe(16);
    expect(getCommentCapacity("SOMETHING_NEW", "10")).toBe(16);
    // A fallback that guessed high would re-create the original bug on a CHIEFEVAL.
    expect(getCommentCapacity(undefined, "10")).toBeLessThan(
      getCommentCapacity("FITREP", "10"),
    );
  });
});

// The renderer half of the contract. CHIEFEVAL is absent on purpose — its overlay is
// PR #34's file (fix/chiefeval-overlay) and this branch must not touch it; see the
// CHIEFEVAL block further down for how the two compose.
describe.each([
  ["EVAL", "10"],
  ["EVAL", "12"],
  ["FITREP", "10"],
  ["FITREP", "12"],
] as const)("%s at %s-pitch: the renderer agrees with the printed box", (form, pitch) => {
  const box = FORMS[form];
  const capacity = getCommentCapacity(form, pitch);

  it(`prints exactly ${capacity} lines and stops`, async () => {
    // Ask for more than the block can hold — the renderer must clamp to capacity.
    const drawn = await renderedCommentLines(form, pitch, capacity + 4);
    expect(drawn).toHaveLength(capacity);
    expect(drawn.map((d) => d.n)).toEqual(
      Array.from({ length: capacity }, (_, i) => i + 1),
    );
  });

  it("lands every printed line inside the box measured off the blank", async () => {
    const drawn = await renderedCommentLines(form, pitch, capacity);
    for (const line of drawn) {
      const descender = line.baseline - line.size * DESCENDER;
      const capTop = line.baseline + line.size * CAP_HEIGHT;
      expect(descender).toBeGreaterThanOrEqual(box.boxFloor);
      expect(capTop).toBeLessThanOrEqual(box.boxTop);
    }
  });

  it("clears the form's own printed instruction header on line 1", async () => {
    // 462.0 on the FITREP failed exactly this: line 1's cap height ran at 467.6, through
    // the printed "41. COMMENTS ON PERFORMANCE / Font must be 10 or 12 pitch" header.
    const [first] = await renderedCommentLines(form, pitch, 2);
    expect(first.baseline + first.size * CAP_HEIGHT).toBeLessThanOrEqual(
      box.headerFloor,
    );
  });

  it("is not understating the block — one more line would fall outside", async () => {
    // Guards the other direction: a capacity that is too SMALL wastes a Sailor's space.
    const drawn = await renderedCommentLines(form, pitch, capacity);
    const leading = drawn[0].baseline - drawn[1].baseline;
    const nextBaseline = drawn[0].baseline - capacity * leading;
    expect(nextBaseline - drawn[0].size * DESCENDER).toBeLessThan(box.boxFloor);
  });
});

describe("CHIEFEVAL (NAVPERS 1616/27) Block 40", () => {
  // Not render-checked here: lib/chiefEvalOverlay.ts belongs to PR #34, which this branch
  // does not touch. #34 measured b40_lines10: 8 / b40_lines12: 7 against its own
  // b40_topBaseline: 363.0 and clamps drawing to them. The arithmetic below re-derives
  // those two numbers independently from the box measured off chiefEvalBlank.pdf, so the
  // renderer's clamp and this table are the same claim reached two different ways.
  //
  // Composition once #34 lands: delete b40_lines10/b40_lines12 and call
  // getCommentCapacity("CHIEFEVAL", pitch) at the Block 40 narrative(), the way
  // pdfOverlay and fitrepOverlay now do. Until then this test is what keeps them equal.
  const box = FORMS.CHIEFEVAL;
  const TOP_BASELINE = 363.0; // PR #34, lib/chiefEvalOverlay.ts

  // 1616/27's overlay narrative box is 544.7 pt wide (FORM_RIGHT 578.9 - TEXT_X 34.2),
  // and every overlay sizes the same way: min(12, (width - 4) / ((cpl + 0.5) * 0.6)).
  const size = (cpl: number) => Math.min(12, (544.7 - 4) / ((cpl + 0.5) * 0.6));

  it.each([
    ["10", 90, 8],
    ["12", 84, 7],
  ] as const)("holds %s-pitch: %i CPL -> %i lines", (pitch, cpl, expected) => {
    const s = size(cpl);
    const leading = s * 1.18;
    const usable = TOP_BASELINE - s * DESCENDER - box.boxFloor;
    expect(Math.floor(usable / leading) + 1).toBe(expected);
    expect(getCommentCapacity("CHIEFEVAL", pitch)).toBe(expected);
  });

  it("keeps line 1 clear of the printed Block 40 header", () => {
    expect(TOP_BASELINE + size(84) * CAP_HEIGHT).toBeLessThanOrEqual(box.headerFloor);
  });

  it("would put line 9 well below the box floor at 10-pitch", () => {
    // The measured failure on PR #34: a CHIEFEVAL passed validation at 18 lines and the
    // printed form showed 8. Line 9's BASELINE — not its descender — is already outside.
    const leading = size(90) * 1.18;
    expect(TOP_BASELINE - 8 * leading).toBeLessThan(box.boxFloor);
  });
});

describe("the Sailor is told before signing, against the real number", () => {
  const wide = (n: number) =>
    Array.from({ length: n }, (_, i) => `LINE ${i + 1} ` + "WORD ".repeat(15)).join("\n");

  it("BEFORE/AFTER: 18 lines on a CHIEFEVAL used to pass validation and lose 10 lines", () => {
    const ev = draft("CHIEFEVAL", "10", wide(18));
    const fit = checkCommentFit(ev.comments!, "10", "CHIEFEVAL");

    // Before: maxLines was 18 for every form, so this returned fit: true and the
    // reporting senior signed a record whose printed Block 40 showed 8 lines.
    expect(fit.linesUsed).toBe(18);
    expect(fit.maxLines).toBe(8);
    expect(fit.fit).toBe(false);

    const issue = runFullValidation(ev).errors.find((e) => e.field === "comments");
    expect(issue).toBeDefined();
    expect(issue!.block).toBe(40); // not 43 — 1616/27 numbers this block 40
    expect(issue!.message).toContain("8 lines");
    expect(issue!.severity).toBe("error");
  });

  it("BEFORE/AFTER: 17 lines on an EVAL used to pass and print over the Block 44 header", () => {
    const ev = draft("EVAL", "10", wide(17));
    const fit = checkCommentFit(ev.comments!, "10", "EVAL");
    expect(fit.linesUsed).toBe(17);
    expect(fit.maxLines).toBe(16); // was 18 — line 17 rendered 8.17 pt below the box
    expect(fit.fit).toBe(false);

    const issue = runFullValidation(ev).errors.find((e) => e.field === "comments");
    expect(issue!.block).toBe(43);
    expect(issue!.message).toContain("16 lines");
  });

  it("does not cry wolf: a narrative that fits raises nothing", () => {
    for (const form of ["EVAL", "CHIEFEVAL", "FITREP"] as const) {
      const ev = draft(form, "10", wide(getCommentCapacity(form, "10")));
      expect(checkCommentFit(ev.comments!, "10", form).fit).toBe(true);
      expect(
        runFullValidation(ev).errors.find((e) => e.field === "comments"),
      ).toBeUndefined();
    }
  });

  it("tells the AI coach the physical size of THIS form's block", () => {
    // lib/evalCoach/coach.ts hands budget.max_lines to the model as "the physical size of
    // the block". While it said 18 on a CHIEFEVAL, the coach was confidently telling a
    // Chief to fill ten lines that do not exist on NAVPERS 1616/27.
    const budgets = (["EVAL", "CHIEFEVAL", "FITREP"] as const).map(
      (report_type) =>
        coachPayload({
          report_type,
          comments: "SHORT DRAFT.",
          pitch: "10",
          trait_grades: {},
        } as any).budget,
    );
    expect(budgets.map((b) => b.max_lines)).toEqual([16, 8, 19]);
    expect(budgets.every((b) => b.chars_per_line === 90)).toBe(true);
  });
});
