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
import {
  checkCommentFit,
  getCommentCapacity,
  COMMENT_PITCH,
  commentPitchFields,
  resolveCommentPitch,
} from "@/lib/commentFit";
import { runFullValidation } from "@/lib/validationEngine";
import { coachPayload } from "@/lib/evalCoach/coach";
import { mapEvaluationToNavfit } from "@/lib/navfit98/mapEvaluationToNavfit";
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
    // Side rules, same 600 dpi raster, same 0.72 pt stroke. Scanned as columns dark on
    // >95% of the rows INSIDE the block. #36 measured only the horizontal bounds, which
    // is how fitrepOverlay drew Block 41 fourteen points outside its own left rule
    // without any test noticing.
    boxLeft: 29.640,
    boxRight: 576.840,
  },
  CHIEFEVAL: {
    blank: "chiefEvalBlank.pdf",
    block: 40,
    // Rules centred 380.94 / 277.26; ink 381.24-380.64 and 277.56-276.96.
    boxTop: 380.64,
    boxFloor: 277.56,
    headerFloor: 371.52,
    boxLeft: 31.680,
    boxRight: 578.880,
  },
  FITREP: {
    blank: "fitrepBlank.pdf",
    block: 41,
    // Rules centred 469.50 / 226.14; ink 469.80-469.20 and 226.44-225.84.
    boxTop: 469.20,
    boxFloor: 226.44,
    headerFloor: 451.44,
    boxLeft: 31.680,
    boxRight: 578.880,
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
    block_values: commentPitchFields(pitch),
  }) as unknown as Evaluation;

/**
 * Advance width of every printable ASCII glyph in CourierPrime-Regular, read off the
 * shipped TTF: 1228/2048 em = 0.5996094. It is what makes pitch computable from a point
 * size, and the fact that ONE value covers all 95 glyphs is what makes the font
 * fixed-pitch in the first place.
 */
const ADVANCE = 1228 / 2048;

/**
 * N distinct EXACTLY-full-width lines, each tagged so it can be found in the output.
 *
 * Every line carries both ink extremes and ends in a descender. This used to be
 * `"X".repeat(70)`: no ink below the baseline at all, and ~20 characters short of the
 * line width, so the suite measured a form the renderer never draws — it reported
 * vertical clearance the real glyphs did not have, and could not see a horizontal
 * overrun at all. 'y'/'g'/'j' are the deepest glyphs in CourierPrime (-0.2002 em) and
 * '`' the highest (+0.6909 em); the forms' own header says "Use upper and lower case",
 * so descenders are not a contrived worst case, they are Tuesday.
 *
 * Length is exactly `cpl`, so the right-hand assertion is made against a real full line.
 */
const FILL = "Xygj`Q";
const probeLines = (n: number, cpl: number) =>
  Array.from({ length: n }, (_, i) => {
    const tag = `L${String(i + 1).padStart(2, "0")}`;
    return (
      tag +
      FILL.repeat(Math.ceil(cpl / FILL.length)).slice(0, cpl - tag.length - 1) +
      "g"
    );
  }).join("\n");

/** Render, then read back every probe line's geometry from the real PDF. */
async function renderedCommentLines(
  form: FormKey,
  pitch: "10" | "12",
  lineCount: number,
) {
  const template = new Uint8Array(
    fs.readFileSync(path.join(process.cwd(), "public", FORMS[form].blank)),
  );
  const ev = draft(
    form,
    pitch,
    probeLines(lineCount, COMMENT_PITCH[pitch].charsPerLine),
  );
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
      x: i.transform[4] as number,
      chars: (i.str as string).length,
    }))
    .sort((a, b) => a.n - b.n);
}

describe("comment-block capacity is a property of the form, not a constant", () => {
  it("is a different number on each of the three forms", () => {
    // The defect this file exists for: one hardcoded 18 answered for all three.
    expect(getCommentCapacity("EVAL", "10")).toBe(14);
    expect(getCommentCapacity("CHIEFEVAL", "10")).toBe(6);
    expect(getCommentCapacity("FITREP", "10")).toBe(16);

    // Pitch is a real dimension of the answer, not a rounding detail.
    expect(getCommentCapacity("EVAL", "12")).toBe(17);
    expect(getCommentCapacity("CHIEFEVAL", "12")).toBe(8);
    expect(getCommentCapacity("FITREP", "12")).toBe(19);

    // No form is 18 at 10-pitch. The old constant was right nowhere.
    for (const f of ["EVAL", "CHIEFEVAL", "FITREP"] as const)
      expect(getCommentCapacity(f, "10")).not.toBe(18);
  });

  it("falls back to the EVAL for an unknown report type", () => {
    expect(getCommentCapacity(undefined, "10")).toBe(14);
    expect(getCommentCapacity("SOMETHING_NEW", "10")).toBe(14);
  });
});

describe("the selector offers only settings the printed form permits", () => {
  // NAVPERS 1616/26 Blk 43 and 1610/2 Blk 41, printed on the blanks in public/:
  //   "Font must be 10 or 12 pitch (10 or 12 point) only. Use upper and lower case."
  // BUPERSINST 1610.10H para 13-2.a(1), p. 13-1: "NAVFIT98A reports with 10- or
  // 12-pitch will still be accepted." (the manual's only use of the word "pitch").
  //
  // Pitch is CHARACTERS PER INCH and point is glyph height, so in a 0.5996-em font they
  // are inverse: 10 pt is 12 pitch and 12 pt is 10 pitch. The old table offered 90 CPL
  // labelled "10-Pitch" (really 11.988 CPI) and 84 CPL labelled "12-Pitch" (11.193 CPI
  // at 10.7278 pt — legal in NEITHER unit). These assertions are on the numbers, so a
  // relabel that does not change the geometry cannot satisfy them.
  it("pairs each pitch with the point size that produces it", () => {
    expect(COMMENT_PITCH["10"].points).toBe(12);
    expect(COMMENT_PITCH["12"].points).toBe(10);
    for (const p of ["10", "12"] as const)
      expect(72 / (COMMENT_PITCH[p].points * ADVANCE)).toBeCloseTo(Number(p), 1);
  });

  it("renders at exactly 10 or 12 point on every form and pitch", async () => {
    for (const form of ["EVAL", "CHIEFEVAL", "FITREP"] as const) {
      for (const pitch of ["10", "12"] as const) {
        const [line] = await renderedCommentLines(form, pitch, 2);
        // Exact, not approximate: the point size is the thing the form constrains.
        expect(line.size).toBe(COMMENT_PITCH[pitch].points);
        // ...and therefore the pitch the Sailor was promised, to within the 0.065% by
        // which CourierPrime is narrower than nominal Courier.
        expect(72 / (line.size * ADVANCE)).toBeCloseTo(Number(pitch), 1);
      }
    }
  }, 60_000);

  it("keeps the Math.min(12) cap honest on the fields that DO reach it", async () => {
    // The cap looked like dead code — the comment block's widest solved size was 10.7278,
    // so it never bound there. It is live elsewhere: the career-recommendation fields
    // pass cpl 10 in an 80 pt box, which solves to 12.063 pt and is really clamped. That
    // made "delete the cap" a mutation-test survivor, so this pins it: remove the cap and
    // these render at 12.063 instead of 12.
    const template = new Uint8Array(
      fs.readFileSync(path.join(process.cwd(), "public", FORMS.EVAL.blank)),
    );
    const ev = {
      ...draft("EVAL", "12", "SHORT."),
      career_recommendations: ["DEPTHEADgy", "WARCOLLEGE"],
    } as unknown as Evaluation;
    const pdf = await getDocumentProxy(
      new Uint8Array(await generateOverlayPdf(ev, template)),
    );
    const items = (await (await pdf.getPage(2)).getTextContent()).items as any[];
    const recs = items.filter((i) => /DEPTHEAD|WARCOLL/.test(i.str ?? ""));
    expect(recs).toHaveLength(2);
    for (const r of recs)
      expect(Math.hypot(r.transform[1], r.transform[3])).toBe(12);
  }, 30_000);

  it("never renders 10.7278 pt again — the size no form permits", async () => {
    // The exact value the old "12-Pitch (84 CPL)" button produced on 1616/26 and 1610/2.
    const sizes: number[] = [];
    for (const form of ["EVAL", "CHIEFEVAL", "FITREP"] as const)
      for (const pitch of ["10", "12"] as const)
        sizes.push((await renderedCommentLines(form, pitch, 2))[0].size);
    expect(sizes.every((s) => s === 10 || s === 12)).toBe(true);
    expect(sizes.some((s) => Math.abs(s - 10.7278) < 0.01)).toBe(false);
  }, 60_000);
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

  it("keeps a FULL-WIDTH line between the block's own side rules", async () => {
    // The axis nothing checked. fitrepOverlay drew Block 41 from x=17.30 against a left
    // rule whose inner ink edge is 31.68 — every character of every FITREP comment sat
    // 14.38 pt out in the page margin, and both the capacity table and the vertical
    // assertions above were perfectly happy about it.
    const drawn = await renderedCommentLines(form, pitch, capacity);
    for (const line of drawn) {
      expect(line.chars).toBe(COMMENT_PITCH[pitch].charsPerLine); // a real full line
      expect(line.x).toBeGreaterThanOrEqual(box.boxLeft);
      expect(line.x + line.chars * line.size * ADVANCE).toBeLessThanOrEqual(
        box.boxRight,
      );
    }
  });

  it("uses the width it is given — one more character would overrun", async () => {
    // The other direction: a CPL short by one costs a Sailor a character on every line.
    const [line] = await renderedCommentLines(form, pitch, 2);
    const oneMore =
      line.x + (COMMENT_PITCH[pitch].charsPerLine + 1) * line.size * ADVANCE;
    expect(oneMore).toBeGreaterThan(box.boxRight - 2.5); // 2.5 = the house inset
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

it("keeps the 8 PR #34 measured for CHIEFEVAL — under the pitch that produces it", () => {
  // #34 measured 1616/27 and got 8 lines at what it called 10-pitch; that setting was
  // rendering 12.059 CPI at 9.9576 pt, i.e. 12 pitch. The 8 is real and survives, but it
  // belongs to the 12-pitch column. #34's companion "7 at 12-pitch" does NOT survive: it
  // described 10.6647 pt, a size NAVPERS 1616/27 does not permit. True 10-pitch (12 pt)
  // holds 6.
  expect(getCommentCapacity("CHIEFEVAL", "12")).toBe(8);
  expect(getCommentCapacity("CHIEFEVAL", "10")).toBe(6);
});

describe("a draft written before the pitch fix still renders the way it was signed off", () => {
  // The migration hazard. The stored token did not change but its meaning did, so an
  // unstamped draft is read as 12-pitch whatever it says — see COMMENT_PITCH_V.
  it("reads any unstamped draft as 12-pitch, whatever token it carries", () => {
    expect(resolveCommentPitch({ comment_pitch: "10" })).toBe("12");
    expect(resolveCommentPitch({ comment_pitch: "12" })).toBe("12");
    expect(resolveCommentPitch({})).toBe("12");
    expect(resolveCommentPitch(undefined)).toBe("12");
  });

  it("honours a stamped choice in both directions", () => {
    expect(resolveCommentPitch(commentPitchFields("10"))).toBe("10");
    expect(resolveCommentPitch(commentPitchFields("12"))).toBe("12");
  });

  it("never shrinks a legacy draft's box, so nothing reflows out of it", () => {
    // Legacy "10" drew 90 CPL over 17/8/19 lines; legacy "12" drew 84 over 15/7/18.
    // Both now resolve to 12-pitch = 90 CPL over 17/8/19 — equal or roomier on BOTH
    // axes, which is what makes the migration safe rather than merely quiet.
    for (const form of ["EVAL", "CHIEFEVAL", "FITREP"] as const) {
      const legacyLines = { EVAL: 17, CHIEFEVAL: 8, FITREP: 19 }[form];
      const effective = resolveCommentPitch({ comment_pitch: "10" });
      expect(COMMENT_PITCH[effective].charsPerLine).toBeGreaterThanOrEqual(90);
      expect(getCommentCapacity(form, effective)).toBeGreaterThanOrEqual(legacyLines);
    }
  });

  it("a full legacy narrative still fits, and still validates", () => {
    // 17 lines x 90 chars is a completely full old EVAL Block 43. Read as 12-pitch it
    // fits exactly. Had it been read as 10-pitch it would wrap to 21 lines against a
    // capacity of 14 — seven lines off the signed record.
    const body = Array.from({ length: 17 }, (_, i) =>
      `LINE ${String(i + 1).padStart(2, "0")} ` + "WORD ".repeat(16),
    )
      .map((l) => l.trim().slice(0, 90))
      .join("\n");
    const legacy = {
      ...draft("EVAL", "12", body),
      block_values: { comment_pitch: "10" }, // unstamped: written by the old code
    } as unknown as Evaluation;

    const pitch = resolveCommentPitch(legacy.block_values);
    expect(pitch).toBe("12");
    expect(checkCommentFit(body, pitch, "EVAL").fit).toBe(true);
    expect(
      runFullValidation(legacy).errors.find((e) => e.field === "comments"),
    ).toBeUndefined();

    // ...and the counterfactual this guards against.
    expect(checkCommentFit(body, "10", "EVAL").fit).toBe(false);
    expect(checkCommentFit(body, "10", "EVAL").linesUsed).toBeGreaterThan(14);
  });

  it("exports the point size the PDF actually renders", () => {
    // NAVFIT98A's column is named Pitch but holds POINT strings, so the units cross:
    // 10-pitch is 12 point. This used to map "12" -> "12 POINT" while rendering 10.7278.
    const at = (bv: Record<string, unknown>) =>
      mapEvaluationToNavfit({ ...draft("EVAL", "10", "TEXT."), block_values: bv } as any)
        .CommentsPitch;
    expect(at(commentPitchFields("10"))).toBe("12 POINT");
    expect(at(commentPitchFields("12"))).toBe("10 POINT");
    // A legacy draft keeps the string it always exported.
    expect(at({ comment_pitch: "10" })).toBe("10 POINT");
    expect(at({})).toBe("10 POINT");
  });
});

describe("the Sailor is told before signing, against the real number", () => {
  /** n lines that each fill `cpl` exactly, so the wrap is not doing anything surprising. */
  const wide = (n: number, cpl: number) =>
    Array.from({ length: n }, (_, i) =>
      (`LINE ${String(i + 1).padStart(2, "0")} ` + "WORD ".repeat(20)).slice(0, cpl).trim(),
    ).join("\n");

  it("BEFORE/AFTER: 18 lines on a CHIEFEVAL used to pass validation and lose 10 lines", () => {
    const ev = draft("CHIEFEVAL", "12", wide(18, 90));
    const fit = checkCommentFit(ev.comments!, "12", "CHIEFEVAL");

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
    const ev = draft("EVAL", "12", wide(18, 90));
    const fit = checkCommentFit(ev.comments!, "12", "EVAL");
    expect(fit.linesUsed).toBe(18);
    expect(fit.maxLines).toBe(17); // was 18 — line 18 rendered 20 pt below the box
    expect(fit.fit).toBe(false);

    const issue = runFullValidation(ev).errors.find((e) => e.field === "comments");
    expect(issue!.block).toBe(43);
    expect(issue!.message).toContain("17 lines");
  });

  it("charges 10-pitch its real cost: bigger type, fewer lines AND fewer characters", () => {
    // 10-pitch is not a free readability win and the label should not imply it is.
    // EVAL: 75 x 14 = 1050 characters against 90 x 17 = 1530.
    for (const form of ["EVAL", "CHIEFEVAL", "FITREP"] as const) {
      const ten = COMMENT_PITCH["10"].charsPerLine * getCommentCapacity(form, "10");
      const twelve = COMMENT_PITCH["12"].charsPerLine * getCommentCapacity(form, "12");
      expect(ten).toBeLessThan(twelve);
    }
    expect(COMMENT_PITCH["10"].charsPerLine * getCommentCapacity("EVAL", "10")).toBe(1050);
    expect(COMMENT_PITCH["12"].charsPerLine * getCommentCapacity("EVAL", "12")).toBe(1530);
  });

  it("gives the EVAL back the 17th line its box actually holds at 12-pitch", () => {
    // The opposite failure to the one this PR started with, and just as real: a capacity
    // short by one costs a Sailor a line of a signed record.
    const ev = draft("EVAL", "12", wide(17, 90));
    expect(checkCommentFit(ev.comments!, "12", "EVAL").fit).toBe(true);
    expect(
      runFullValidation(ev).errors.find((e) => e.field === "comments"),
    ).toBeUndefined();
  });

  it("does not cry wolf: a narrative that fits raises nothing", () => {
    for (const form of ["EVAL", "CHIEFEVAL", "FITREP"] as const) {
      for (const pitch of ["10", "12"] as const) {
        const ev = draft(
          form,
          pitch,
          wide(getCommentCapacity(form, pitch), COMMENT_PITCH[pitch].charsPerLine),
        );
        expect(checkCommentFit(ev.comments!, pitch, form).fit).toBe(true);
        expect(
          runFullValidation(ev).errors.find((e) => e.field === "comments"),
        ).toBeUndefined();
      }
    }
  });

  it("tells the AI coach the physical size of THIS form's block", () => {
    // lib/evalCoach/coach.ts hands budget.max_lines to the model as "the physical size of
    // the block". While it said 18 on a CHIEFEVAL, the coach was confidently telling a
    // Chief to fill ten lines that do not exist on NAVPERS 1616/27.
    const budgetsAt = (pitch: "10" | "12") =>
      (["EVAL", "CHIEFEVAL", "FITREP"] as const).map(
        (report_type) =>
          coachPayload({
            report_type,
            comments: "SHORT DRAFT.",
            pitch,
            trait_grades: {},
          } as any).budget,
      );
    expect(budgetsAt("10").map((b) => b.max_lines)).toEqual([14, 6, 16]);
    expect(budgetsAt("10").every((b) => b.chars_per_line === 75)).toBe(true);
    expect(budgetsAt("12").map((b) => b.max_lines)).toEqual([17, 8, 19]);
    expect(budgetsAt("12").every((b) => b.chars_per_line === 90)).toBe(true);
  });
});
