// tests/unit/evalOverlayGeometry.test.ts
//
// Page-1 geometry of the EVAL overlay (lib/pdfOverlay.ts) against NAVPERS
// 1616/26 — the blank that ships in public/navpers-1616-26_2025.pdf.
//
// ── Why this file exists ────────────────────────────────────────────────────
// The EVAL is the form APEX shipped FIRST and the one most Sailors get, and its
// page-1 geometry had never been checked. tests/unit/pdfOverlayForms.test.ts
// asserts that `generateOverlayPdf` returns a valid PDF buffer and nothing about
// where the ink lands.
//
// It was found the long way round. Correcting the FITREP overlay (#48) showed
// that 1610/2 page 1 is 1616/26 page 1 rigidly shifted, so the two forms' page-1
// constants are the same numbers — and the FITREP's Block 16 mark, which drew
// 12.2 pt above its checkbox, turned out to have inherited that error from
// pdfOverlay.ts, where it is still live. Verified here rather than assumed.
//
// ── Method (re-runnable) ────────────────────────────────────────────────────
//   pdftoppm -gray -r 600 public/navpers-1616-26_2025.pdf out
// then, per row: columns dark on >85% of the band are cell dividers; columns
// dark on 30-85% are checkbox sides; and the lowest ink inside a column is that
// block's printed label. Every bound below is transcribed from that scan,
// independently of lib/pdfOverlay.ts — these fail when a constant drifts off the
// FORM, not off today's output.
//
// Cross-check, not source: every one of these equals the 1610/2 value measured
// in tests/unit/fitrepTraitTable.test.ts minus exactly (2.040, 11.040).

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import { generateOverlayPdf } from "@/lib/pdfOverlay";
import { Evaluation } from "@/types";

/** CourierPrime-Regular: every printable glyph advances 1228/2048 em. */
const ADVANCE = 1228 / 2048;
/** Real outline extents over printable ASCII — '`' highest, 'y'/'g'/'j' deepest. */
const INK_ABOVE = 0.6909;
const INK_BELOW = 0.2002;

/** Inner ink edges of 1616/26's page-1 side rules. */
const RULE_L = 30.6;
const RULE_R = 577.8;

/**
 * [cell floor, USABLE ceiling]. The ceiling is the row's lowest printed HEADER
 * ink, not its rule — a value that clears the rule but not the label prints on
 * top of the label. `occasion` is the exception and keeps the rule, because
 * Blocks 14-15 are set BESIDE their "From:"/"To:" labels on the same line.
 */
const CELLS: Record<string, [number, number]> = {
  identity: [735.96, 746.28], // Blocks 1-4
  admin: [712.2, 723.24], // Block 5 + Blocks 6-9
  occasion: [687.0, 711.48], // Blocks 10-13 + Blocks 14-15
  type: [663.24, 675.0], // Blocks 16-18 + Blocks 20-21
  reportingSenior: [638.04, 651.96], // Blocks 22-27
  counselling: [506.28, 519.0], // Blocks 30-31
};

/** Column interiors, inner ink edges of each cell's dividers. */
const COLS: Record<string, [number, number]> = {
  b1: [30.6, 302.04],
  b2: [302.76, 367.56],
  b6: [179.64, 230.04],
  b7: [230.76, 425.88],
  b8: [426.6, 505.08],
  b9: [505.8, 577.8],
  b1415: [369.72, 577.8],
  b20: [369.72, 468.36],
  b21: [469.08, 577.8],
  b22: [30.6, 180.36],
  b23: [181.08, 230.76],
  b30: [209.88, 287.64],
  b31: [288.36, 425.16],
};

/**
 * EVERY checkbox square on page 1, inner ink edges.
 *
 * The census has to be complete because the assertion below is inverted: "every
 * mark landed in some box", not "each listed box got a mark". The second form
 * cannot see a mark that went nowhere, which is exactly how Block 16 survived on
 * both forms.
 *
 * 1616/26 prints THREE type-of-report boxes, not four — it has no Block 19
 * "OpsCdr"; that block is new in the REV 05-2025 forms (1610/2 and 1616/27).
 */
const BOXES: Record<string, { x: [number, number]; y: [number, number] }> = {
  "5_ACT": { x: [43.56, 57.24], y: [714.36, 725.88] },
  "5_TAR": { x: [73.08, 86.76], y: [714.36, 725.88] },
  "5_INACT": { x: [101.88, 115.56], y: [714.36, 725.88] },
  "5_AT_ADSW": { x: [129.96, 143.64], y: [714.36, 725.88] },
  "10_PERIODIC": { x: [86.76, 100.44], y: [690.6, 702.12] },
  "11_DET_INDIV": { x: [166.68, 180.36], y: [690.6, 702.12] },
  "12_PROMO_FROCK": { x: [261.0, 274.68], y: [690.6, 702.12] },
  "13_SPECIAL": { x: [339.48, 353.16], y: [690.6, 702.12] },
  "16_NOT_OBSERVED": { x: [86.76, 100.44], y: [666.12, 677.64] },
  "17_REGULAR": { x: [166.68, 180.36], y: [666.12, 677.64] },
  "18_CONCURRENT": { x: [261.0, 274.68], y: [666.12, 677.64] },
};

/**
 * The lowest outline point of any character in `str`, in em, read from the font
 * this overlay actually embeds. Negative below the baseline, 0 for a run whose
 * every glyph sits on it.
 *
 * Derived from the file rather than transcribed, because the transcribed pair
 * (+0.6909, -0.2002) describes the WORST glyphs in printable ASCII — a backtick
 * and a "y" — and the whole point here is that an uppercased field contains
 * neither. Held to the envelope, the identity row reads 2.4 pt of descender and
 * 0.4 pt of ascender that are not there, which on this form is the difference
 * between fitting its cell and overflowing it in both directions.
 */
const FONT = fontkit.create(
  fs.readFileSync(path.join(process.cwd(), "public", "fonts", "CourierPrime-Regular.ttf")),
) as any;
const glyphExtents = (str: string): { lo: number; hi: number; right: number } => {
  const run = FONT.layout(str);
  let lo = 0;
  let hi = 0;
  let pen = 0;
  let right = 0;
  run.glyphs.forEach((g: any, i: number) => {
    const b = g.bbox;
    if (b) {
      if (typeof b.minY === "number") lo = Math.min(lo, b.minY / FONT.unitsPerEm);
      if (typeof b.maxY === "number") hi = Math.max(hi, b.maxY / FONT.unitsPerEm);
      // INK right edge, not the advance. The advance overstates by the glyph's
      // right side bearing, which on a monospace digit is most of a point at
      // 12 pt — enough to report a 0.13 pt column overrun that is not there.
      if (typeof b.maxX === "number")
        right = Math.max(right, (pen + b.maxX) / FONT.unitsPerEm);
    }
    pen += run.positions[i]?.xAdvance ?? 0;
  });
  return { lo, hi, right };
};

/**
 * Read back every glyph run the overlay drew, in PAGE coordinates.
 *
 * THIS OVERLAY DRAWS IN TWO FONTS, unlike the FITREP's. Text is CourierPrime
 * (`embedNarrativeFont`, declared descent -700/2048) and checkbox marks are
 * StandardFonts.HelveticaBold (`markFont`, pdfOverlay.ts:295) — so a filter that
 * keeps one sans-serif face silently drops every X, and a single monospace
 * advance is wrong for half the runs. Both faces are identified by their DECLARED
 * DESCENT rather than by family, because the 1616/26 blank embeds a sans-serif of
 * its own and family alone is ambiguous here.
 *
 * `x2` is only meaningful for the monospace runs and is only asserted on those;
 * marks are located by centre.
 */
async function overlayRuns(bytes: Uint8Array, page: number) {
  const { getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const tc = await (await doc.getPage(page)).getTextContent();
  const styles = tc.styles as Record<string, { fontFamily: string; descent: number }>;

  const byDescent = (d: number) =>
    Object.entries(styles).filter(
      ([, s]) => s.fontFamily === "sans-serif" && Math.abs(s.descent - d) < 1e-4,
    );
  // Asserted, not assumed — a filter matching nothing makes every test below
  // vacuously green, and this file exists because of an assertion that could not
  // see what it was meant to.
  const courier = byDescent(-700 / 2048);
  const mark = byDescent(-0.207);
  expect(courier, "CourierPrime run font not found").toHaveLength(1);
  expect(mark, "HelveticaBold mark font not found").toHaveLength(1);
  const courierName = courier[0][0];
  const markName = mark[0][0];

  return (tc.items as any[])
    .filter((i) => (i.str ?? "").trim() && (i.fontName === courierName || i.fontName === markName))
    .map((i) => {
      const str = (i.str as string).replace(/\s+$/, "");
      const size = Math.hypot(i.transform[1], i.transform[3]) as number;
      const x = i.transform[4] as number;
      const y = i.transform[5] as number;
      const isMark = i.fontName === markName;
      return {
        str,
        size,
        isMark,
        x,
        // Monospace advance for text; pdf.js's own measured width for the
        // proportional mark face.
        x2: isMark ? x + (i.width as number) : x + size * glyphExtents(str).right,
        base: y,
        // HelveticaBold caps top out at 0.718 em and an "X" has no descender.
        top: y + size * (isMark ? 0.718 : glyphExtents(str).hi),
        // Per-RUN ink floor, from the outline of the characters the run actually
        // contains — not the -0.2002 em envelope over all printable ASCII, which
        // is set by 'y'/'g'/'j' and cannot occur in an uppercased field. Holding
        // a caps-and-digits row to the full envelope reads 2.4 pt of descender
        // that is not there, and on this form that is the difference between the
        // identity row fitting its cell and overflowing it. A comma does descend,
        // but nothing like as far, and guessing which way to round that is what
        // `glyphFloor` exists to avoid.
        bot: isMark ? y : y + size * glyphExtents(str).lo,
      };
    });
}

const TEMPLATE = new Uint8Array(
  fs.readFileSync(path.join(process.cwd(), "public", "navpers-1616-26_2025.pdf")),
);

/**
 * EVERY page-1 field populated, and every occasion/type flag set.
 *
 * Contradictory as a real report, deliberately: the sweep can only see a field
 * that DRAWS. On the FITREP, leaving three flags unset left three checkbox
 * constants unpinned — they could be moved to another cell with the suite green.
 *
 * Every value is distinct, so a lookup by string cannot match a different
 * block's run (the member's own designator and UIC matching the reporting
 * senior's is how that bit once).
 */
const FIXTURE = {
  report_type: "EVAL",
  member_name: "TESTMEMBERLONGNAME, SAILOR A",
  grade_rate: "IT1",
  designator: "AW",
  dod_id: "1234567890",
  uic: "N00011",
  ship_station: "USS FRANKLYN",
  promotion_status: "REGULAR",
  duty_status: "ACT",
  period_from: "2025-01-01",
  period_to: "2025-11-15",
  trait_grades: { knowledge: "5.0" },
  block_values: {
    date_reported: "2024-08-01",
    periodic: true,
    detachment_individual: true,
    promotion_frocking: true,
    special: true,
    not_observed: true,
    regular_report: true,
    concurrent_report: true,
    physical_readiness: "PB",
    billet_subcategory: "NA",
    date_counseled: "2025-05-01",
    counselor: "JONES-MARTINEZ, CARL R",
    reporting_senior_name: "REPORTINGSENIORNAME, JOHN A",
    reporting_senior_grade: "LCDR",
    reporting_senior_designator: "1310",
    reporting_senior_title: "COMMANDING OFFICER",
    reporting_senior_uic: "N00022",
    reporting_senior_dod_id: "1234509876",
  },
} as unknown as Evaluation;

const render = () => generateOverlayPdf(FIXTURE, TEMPLATE);

describe("NAVPERS 1616/26 overlay geometry — page 1", () => {
  it("every field prints in the cell and column whose header names it", async () => {
    const runs = await overlayRuns(await render(), 1);
    const find = (str: string) => {
      const hits = runs.filter((r) => r.str === str);
      expect(hits, `"${str}" drew ${hits.length} times`).toHaveLength(1);
      return hits[0];
    };

    const FIELDS: Array<[string, keyof typeof CELLS, keyof typeof COLS, number]> = [
      ["TESTMEMBERLONGNAME, SAILOR A", "identity", "b1", 1],
      ["IT1", "identity", "b2", 2],
      ["N00011", "admin", "b6", 6],
      ["USS FRANKLYN", "admin", "b7", 7],
      ["REGULAR", "admin", "b8", 8],
      ["24AUG01", "admin", "b9", 9],
      ["25JAN01", "occasion", "b1415", 14],
      ["25NOV15", "occasion", "b1415", 15],
      ["PB", "type", "b20", 20],
      ["NA", "type", "b21", 21],
      ["REPORTINGSENIORNAME, JOHN A", "reportingSenior", "b22", 22],
      ["LCDR", "reportingSenior", "b23", 23],
      ["25MAY01", "counselling", "b30", 30],
      ["JONES-MARTINEZ, CARL R", "counselling", "b31", 31],
    ];

    for (const [str, cell, col, block] of FIELDS) {
      const [floor, ceiling] = CELLS[cell];
      const [left, right] = COLS[col];
      const r = find(str);
      expect(r.bot, `Block ${block} ("${str}") sits below its cell`).toBeGreaterThanOrEqual(floor);
      expect(r.top, `Block ${block} ("${str}") prints over its own header`).toBeLessThanOrEqual(ceiling);
      expect(r.x, `Block ${block} starts left of its column`).toBeGreaterThanOrEqual(left);
      expect(r.x2, `Block ${block} runs past its column`).toBeLessThanOrEqual(right);
      // SIZE, not just position. `text()` shrinks to fit a maxWidth, so a
      // MISPAIRED width still lands inside its column — reversing `rsWidths`
      // renders the reporting senior's name at 6.1 pt instead of 12 and passes
      // every bound above. Nothing on a signed record should print that much
      // smaller than the row around it. Block 31's clamp legitimately binds on
      // this fixture (its counsellor is long enough to trigger it), which is
      // what stops `counselor_width` from being unpinned.
      expect(
        r.size,
        `Block ${block} shrank to ${r.size.toFixed(2)} pt — width mispaired?`,
      ).toBeGreaterThanOrEqual(8);
    }
  }, 30_000);

  it("every checkbox mark lands inside a printed square", async () => {
    // INVERTED on purpose. "Each listed box got a mark" cannot see a mark that
    // landed nowhere, which is how Block 16 drew 12.2 pt above its square — on a
    // printed rule, with the box empty — on this form and on 1610/2.
    const runs = await overlayRuns(await render(), 1);
    const marks = runs.filter((r) => r.isMark);
    // Eight in the header (Blocks 5, 10-13, 16-18) plus the Block 33 trait grade.
    expect(marks).toHaveLength(9);

    // Ink centre, recomputed from the drawn origin rather than by inverting
    // mark()'s own (-3.4, -3.8) offsets — which would make the check circular.
    const centre = (m: (typeof marks)[number]) => ({
      cx: (m.x + m.x2) / 2,
      cy: m.base + m.size * 0.718 / 2,
    });
    const inBox = (m: (typeof marks)[number], b: (typeof BOXES)[string]) => {
      const { cx, cy } = centre(m);
      return cx > b.x[0] && cx < b.x[1] && cy > b.y[0] && cy < b.y[1];
    };

    const header = marks.filter((m) => centre(m).cy > 655);
    expect(header).toHaveLength(8);
    for (const m of header) {
      const landed = Object.entries(BOXES).filter(([, b]) => inBox(m, b));
      expect(
        landed.map(([n]) => n),
        `a mark at (${m.x.toFixed(2)}, ${m.base.toFixed(2)}) is in no checkbox`,
      ).toHaveLength(1);
    }
    // …and each flag marked its OWN box, so a swapped pair cannot satisfy the
    // "every mark is in some box" rule and still be wrong.
    // Only the boxes the fixture SELECTS — Block 5 is a one-of-four duty status,
    // so the other three squares are correctly empty.
    for (const name of [
      "5_ACT",
      "10_PERIODIC",
      "11_DET_INDIV",
      "12_PROMO_FROCK",
      "13_SPECIAL",
      "16_NOT_OBSERVED",
      "17_REGULAR",
      "18_CONCURRENT",
    ])
      expect(
        header.filter((m) => inBox(m, BOXES[name])),
        `no mark landed in ${name}`,
      ).toHaveLength(1);
  }, 30_000);

  it("nothing on page 1 prints on top of anything else", async () => {
    // The guard that catches a whole class at once, rather than one field at a
    // time. On 1610/2 the same sweep was what finally showed that correcting one
    // block dropped it onto the next.
    const runs = await overlayRuns(await render(), 1);
    expect(runs.length, "the fixture drew almost nothing").toBeGreaterThan(20);

    const collisions: string[] = [];
    for (let a = 0; a < runs.length; a++)
      for (let b = a + 1; b < runs.length; b++) {
        const p = runs[a];
        const q = runs[b];
        if (p.bot < q.top && p.top > q.bot && p.x < q.x2 && p.x2 > q.x)
          collisions.push(
            `"${p.str.slice(0, 20)}" @(${p.x.toFixed(1)}, ${p.base.toFixed(2)}) ` +
              `over "${q.str.slice(0, 20)}" @(${q.x.toFixed(1)}, ${q.base.toFixed(2)})`,
          );
      }
    expect(collisions).toEqual([]);
  }, 30_000);

  it("nothing on page 1 prints outside the form's side rules", async () => {
    const runs = await overlayRuns(await render(), 1);
    const outside = runs
      .filter((r) => r.x < RULE_L || r.x2 > RULE_R)
      .map((r) => `"${r.str.slice(0, 20)}" x[${r.x.toFixed(2)}, ${r.x2.toFixed(2)}]`);
    expect(outside).toEqual([]);
  }, 30_000);
});
