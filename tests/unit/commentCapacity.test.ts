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
import { checkCommentFit, getCommentCapacity } from "@/lib/commentFit";
import { runFullValidation } from "@/lib/validationEngine";
import { coachPayload } from "@/lib/evalCoach/coach";
import type { Evaluation } from "@/types";

// Real ink extents of the drawn narrative, per em. Taken from the OUTLINE BBOXES of the
// font the overlays actually embed, public/fonts/CourierPrime-Regular.ttf, over printable
// ASCII — not from the font's declared metrics and not from eyeballing a raster:
//
//   deepest  'y' / 'g' / 'j'  -0.2002 em      highest  '`'  +0.6909 em
//
// An earlier revision used 0.183 below, which covers nothing deeper than '/', and paired
// it with a probe string of nothing but the letter X — so no descender ever reached the
// renderer and a NEGATIVE margin reported as +0.12. At 0.2002 the EVAL's old shared
// baseline put line 17's ink at 253.382 against a printed rule at 253.44.
//
// Do not substitute the declared metrics here. CourierPrime declares descent -0.3418 and
// capHeight 0.5796; the "-157/1000 / 562/1000" pair quoted in older comments is Adobe
// Courier's, a different font that this code does not embed.
const INK_ABOVE = 0.6909;
const INK_BELOW = 0.2002;

/**
 * Measured off the blank forms by RASTERISING page 2 at 600 dpi and reading real ink —
 * not by trusting glyph metrics. Procedure per form: render, mask the box's own vertical
 * side rules (they put dark pixels in every row inside the block and would otherwise read
 * as printed ink all the way down), then take the bounding rules and the lowest ink of the
 * instruction header the form prints inside the block.
 *
 * Every rule on all three forms measures exactly 0.72 pt thick, which is what makes
 * "interior = rule centreline ± 0.36" sound; the numbers below are the ink edges.
 *
 * `headerFloor` is the header's REAL ink floor. On every form it sits 0.2-0.4 pt below
 * the font-metric descender, because the lowest ink is the parentheses in
 * "(10 or 12 point)". An earlier revision of this file used the metric estimate and was
 * optimistic by that much on all three.
 */
const FORMS = {
  EVAL: {
    blank: "navpers-1616-26_2025.pdf",
    block: 43,
    // Rules centred 468.42 / 253.14; ink 468.72-468.12 and 253.44-252.84.
    boxTop: 468.12,
    boxFloor: 253.44,
    headerFloor: 451.92,
  },
  CHIEFEVAL: {
    blank: "chiefEvalBlank.pdf",
    block: 40,
    // Rules centred 380.94 / 277.26; ink 381.24-380.64 and 277.56-276.96.
    boxTop: 380.64,
    boxFloor: 277.56,
    headerFloor: 371.52,
  },
  FITREP: {
    blank: "fitrepBlank.pdf",
    block: 41,
    // Rules centred 469.50 / 226.14; ink 469.80-469.20 and 226.44-225.84.
    boxTop: 469.20,
    boxFloor: 226.44,
    headerFloor: 451.44,
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

/**
 * N distinct full-width lines, each tagged so it can be found in the output.
 *
 * Every line ENDS IN A DESCENDER on purpose. This used to be `"X".repeat(70)`, which has
 * no ink below the baseline at all, so the whole suite measured a form the renderer never
 * draws and reported clearance the real glyphs did not have. 'y' and 'g' are the deepest
 * glyphs in CourierPrime (-0.2002 em); the form's own header says "Use upper and lower
 * case", so they are not a contrived worst case, they are Tuesday.
 */
const probeLines = (n: number) =>
  Array.from({ length: n }, (_, i) =>
    `L${String(i + 1).padStart(2, "0")}` + "Xygj".repeat(17) + "yg",
  ).join("\n");

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
  // generateOverlayPdf dispatches CHIEFEVAL and FITREP to their own overlays, so this
  // exercises the same entry point the export route uses for all three forms.
  const bytes = await generateOverlayPdf(ev, template);

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
    expect(getCommentCapacity("EVAL", "10")).toBe(17);
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

  it("falls back to the EVAL for an unknown report type", () => {
    expect(getCommentCapacity(undefined, "10")).toBe(17);
    expect(getCommentCapacity("SOMETHING_NEW", "10")).toBe(17);
  });
});

// The renderer half of the contract — all three forms, both pitches. CHIEFEVAL is the
// form the original bug hurt worst, so it is render-checked here like the others: since
// #34 merged, chiefEvalOverlay reads getCommentCapacity instead of carrying its own
// b40_lines10/b40_lines12, and this is what holds the two together.
describe.each([
  ["EVAL", "10"],
  ["EVAL", "12"],
  ["CHIEFEVAL", "10"],
  ["CHIEFEVAL", "12"],
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
      const inkBottom = line.baseline - line.size * INK_BELOW;
      const inkTop = line.baseline + line.size * INK_ABOVE;
      expect(inkBottom).toBeGreaterThanOrEqual(box.boxFloor);
      expect(inkTop).toBeLessThanOrEqual(box.boxTop);
    }
  });

  it("clears the form's own printed instruction header on line 1", async () => {
    // 462.0 on the FITREP failed exactly this: line 1's cap height ran at 467.6, through
    // the printed "41. COMMENTS ON PERFORMANCE / Font must be 10 or 12 pitch" header.
    const [first] = await renderedCommentLines(form, pitch, 2);
    expect(first.baseline + first.size * INK_ABOVE).toBeLessThanOrEqual(
      box.headerFloor,
    );
  });

  it("is not understating the block — one more line would fall outside", async () => {
    // Guards the other direction: a capacity that is too SMALL wastes a Sailor's space.
    const drawn = await renderedCommentLines(form, pitch, capacity);
    const leading = drawn[0].baseline - drawn[1].baseline;
    const nextBaseline = drawn[0].baseline - capacity * leading;
    expect(nextBaseline - drawn[0].size * INK_BELOW).toBeLessThan(box.boxFloor);
  });
});

it("still returns the 8 / 7 PR #34 measured independently for CHIEFEVAL", () => {
  // #34 arrived at b40_lines10: 8 / b40_lines12: 7 by measuring 1616/27 and clamped
  // rendering to them; this table arrived at the same pair from a 600 dpi raster of the
  // same blank. Two routes, one answer — and since #34 merged, chiefEvalOverlay carries
  // no line-count constant of its own, so the render-check above is what enforces it.
  // If anyone reintroduces a per-overlay constant, this pins what it has to equal.
  expect(getCommentCapacity("CHIEFEVAL", "10")).toBe(8);
  expect(getCommentCapacity("CHIEFEVAL", "12")).toBe(7);
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

  it("BEFORE/AFTER: 18 lines on an EVAL used to pass and print over the Block 44 header", () => {
    const ev = draft("EVAL", "10", wide(18));
    const fit = checkCommentFit(ev.comments!, "10", "EVAL");
    expect(fit.linesUsed).toBe(18);
    expect(fit.maxLines).toBe(17); // was 18 — line 18 rendered 20 pt below the box
    expect(fit.fit).toBe(false);

    const issue = runFullValidation(ev).errors.find((e) => e.field === "comments");
    expect(issue!.block).toBe(43);
    expect(issue!.message).toContain("17 lines");
  });

  it("gives the EVAL back the 17th line its box actually holds", () => {
    // The opposite failure to the one this PR started with, and just as real: a capacity
    // short by one costs a Sailor a line of a signed record. 16 was what APEX's old top
    // baseline happened to fit, not what 1616/26 Block 43 holds.
    const ev = draft("EVAL", "10", wide(17));
    expect(checkCommentFit(ev.comments!, "10", "EVAL").fit).toBe(true);
    expect(
      runFullValidation(ev).errors.find((e) => e.field === "comments"),
    ).toBeUndefined();
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
    expect(budgets.map((b) => b.max_lines)).toEqual([17, 8, 19]);
    expect(budgets.every((b) => b.chars_per_line === 90)).toBe(true);
  });
});
