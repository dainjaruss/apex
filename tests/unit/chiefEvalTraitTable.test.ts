// tests/unit/chiefEvalTraitTable.test.ts
//
// Pins the CHIEFEVAL overlay's geometry to NAVPERS 1616/27 (REV 05-2025) — the blank
// that ships in public/chiefEvalBlank.pdf — rather than to whatever lib/chiefEvalOverlay
// currently draws. It runs the REAL exported generator, parses the content stream of the
// PDF it returns, and compares every mark against bounds measured from the blank.
//
// ── Why this file exists ────────────────────────────────────────────────────
// Every CHIEFEVAL this app produced before it printed no grades at all. The overlay
// stamped an "X" into one of six grade COLUMNS, and 1616/27 has no grade columns: it
// prints ONE bordered cell per trait row, pre-filled with "0.0", and the grade is typed
// into it. Nothing in the suite could see that, because nothing drove the generator and
// looked at where the ink landed.
//
// ── Method (re-runnable in about a minute) ──────────────────────────────────
//   pdftotext -bbox-layout public/chiefEvalBlank.pdf out.html
//     → bboxes of every printed label and pre-printed default, in top-left origin;
//       convert to pdf-lib's bottom-left origin as (792 - y).
//   pdftoppm -gray -r 300 public/chiefEvalBlank.pdf page
//     → rule detection (rows/columns that are dark across a long span) and, for a
//       bordered cell, a walk outward from a seed point until a wall is hit. That walk
//       is what produced every CELL bound below; a whole-page rectangle scan produced
//       the CHECKBOX bounds.
//
// Nothing here reads a constant out of lib/chiefEvalOverlay.ts. If the overlay's map
// drifts off the form, these fail.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import fontkit from "@pdf-lib/fontkit";
import {
  PDFDocument,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import {
  generateChiefEvalOverlayPdf,
  formatTraitGrade,
  OVERLAY_TRAIT_KEYS,
} from "@/lib/chiefEvalOverlay";
import { CHIEFEVAL_TRAIT_KEYS } from "@/types/navpers";
import { Evaluation } from "@/types";

type Page = 1 | 2;
interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Measured from public/chiefEvalBlank.pdf.
// ─────────────────────────────────────────────────────────────────────────────

// The one bordered grade cell in each trait row's PERFORMANCE GRADE column. Every row
// shares the same x span; only the y moves. Each is 24.9 x 17.8 pt and is pre-printed
// with "0.0".
const GRADE_CELL: Array<{
  page: Page;
  block: number;
  key: string;
  printed: string;
  cell: Bounds;
}> = [
  { page: 1, block: 33, key: "technical_mastery", printed: "TECHNICAL MASTERY", cell: { x0: 233.8, y0: 380.9, x1: 258.7, y1: 398.6 } },
  { page: 1, block: 34, key: "institutional_expertise", printed: "INSTITUTIONAL EXPERTISE", cell: { x0: 233.8, y0: 270.0, x1: 258.7, y1: 287.8 } },
  { page: 1, block: 35, key: "professionalism", printed: "PROFESSIONALISM", cell: { x0: 233.8, y0: 159.1, x1: 258.7, y1: 176.9 } },
  { page: 1, block: 36, key: "integrity", printed: "INTEGRITY", cell: { x0: 233.8, y0: 46.8, x1: 258.7, y1: 64.6 } },
  { page: 2, block: 37, key: "accountability", printed: "ACCOUNTABILITY", cell: { x0: 233.8, y0: 611.3, x1: 258.7, y1: 629.0 } },
  { page: 2, block: 38, key: "deckplate_leadership", printed: "DECKPLATE LEADERSHIP", cell: { x0: 233.8, y0: 500.4, x1: 258.7, y1: 518.2 } },
  { page: 2, block: 39, key: "team_effectiveness", printed: "TEAM EFFECTIVENESS", cell: { x0: 233.8, y0: 389.5, x1: 258.7, y1: 407.3 } },
];

// Ink extent of the "0.0" the blank pre-prints inside each grade cell, measured by
// counting dark pixels inside the cell at 300 dpi. The white cover has to contain this.
const PREPRINTED_INK: Record<number, Bounds> = {
  33: { x0: 237.4, y0: 388.1, x1: 246.7, y1: 393.6 },
  34: { x0: 237.8, y0: 275.3, x1: 249.4, y1: 282.2 },
  35: { x0: 237.8, y0: 164.4, x1: 249.4, y1: 171.4 },
  36: { x0: 237.8, y0: 52.1, x1: 249.4, y1: 59.0 },
  37: { x0: 237.8, y0: 616.6, x1: 249.4, y1: 623.5 },
  38: { x0: 237.8, y0: 505.7, x1: 249.4, y1: 512.6 },
  39: { x0: 237.8, y0: 394.8, x1: 249.4, y1: 401.8 },
};

// The PERFORMANCE GRADE column, full height of each trait row. The pre-1616/27 overlay
// scattered its X marks across this column and into PERFORMANCE COMMENTS beyond it.
const GRADE_COLUMN_X: Bounds = { x0: 140.2, y0: 0, x1: 258.7, y1: 0 };
const TRAIT_ROW_Y: Array<[Page, number, number]> = [
  [1, 380.9, 491.5], [1, 270.0, 380.6], [1, 159.1, 269.8], [1, 46.8, 158.9],
  [2, 611.3, 721.9], [2, 500.4, 611.0], [2, 389.5, 500.2],
];

// The complete checkbox census of NAVPERS 1616/27: fourteen 15.1 x 12.5 pt squares,
// twelve in the page-1 header and two in Block 49. NOT ONE is in a trait row.
const CHECKBOX: Record<string, { page: Page; cell: Bounds }> = {
  "5_ACT":        { page: 1, cell: { x0: 43.9, y0: 725.0, x1: 59.0, y1: 737.5 } },
  "5_TAR":        { page: 1, cell: { x0: 73.4, y0: 725.0, x1: 88.6, y1: 737.5 } },
  "5_INACT":      { page: 1, cell: { x0: 102.2, y0: 725.0, x1: 117.4, y1: 737.5 } },
  "5_AT_ADOS":    { page: 1, cell: { x0: 130.3, y0: 725.0, x1: 145.4, y1: 737.5 } },
  "10_PERIODIC":  { page: 1, cell: { x0: 125.3, y0: 701.3, x1: 140.4, y1: 713.8 } },
  "11_DET_INDIV": { page: 1, cell: { x0: 200.9, y0: 701.3, x1: 216.0, y1: 713.8 } },
  "12_DET_RS":    { page: 1, cell: { x0: 290.9, y0: 701.3, x1: 306.0, y1: 713.8 } },
  "13_SPECIAL":   { page: 1, cell: { x0: 348.5, y0: 701.3, x1: 363.6, y1: 713.8 } },
  "16_NOT_OBS":   { page: 1, cell: { x0: 92.9, y0: 676.8, x1: 108.0, y1: 689.3 } },
  "17_REGULAR":   { page: 1, cell: { x0: 167.0, y0: 676.8, x1: 182.2, y1: 689.3 } },
  "18_CONCURRENT":{ page: 1, cell: { x0: 236.2, y0: 676.8, x1: 251.3, y1: 689.3 } },
  "19_OPS_CDR":   { page: 1, cell: { x0: 303.8, y0: 676.8, x1: 319.0, y1: 689.3 } },
  "49_INTEND":    { page: 2, cell: { x0: 247.7, y0: 162.0, x1: 262.8, y1: 174.5 } },
  "49_DO_NOT":    { page: 2, cell: { x0: 326.9, y0: 162.0, x1: 342.0, y1: 174.5 } },
};

// ─────────────────────────────────────────────────────────────────────────────
// Content-stream readers. pdf-lib emits every drawText as
//   /<font> <size> Tf  24 TL  1 0 0 1 <x> <y> Tm  <hex> Tj
// and every filled rectangle as
//   1 1 1 rg  0 w  [] 0 d  1 0 0 1 <x> <y> cm … 0 0 m  0 <h> l  <w> <h> l  <w> 0 l  h  f
// ─────────────────────────────────────────────────────────────────────────────

async function contentStream(bytes: Uint8Array, page: Page): Promise<string> {
  const doc = await PDFDocument.load(bytes);
  const node = doc.getPages()[page - 1].node;
  const contents = node.Contents();
  const streams =
    contents instanceof PDFArray
      ? contents.asArray().map((r) => node.context.lookup(r))
      : [contents];
  let text = "";
  for (const s of streams) {
    if (s instanceof PDFRawStream) {
      text += Buffer.from(decodePDFRawStream(s).decode()).toString("latin1");
    }
  }
  return text;
}

/** A drawn string and the ink box it occupies, so it can be tested against a cell. */
interface Drawn extends Bounds {
  str: string;
  size: number;
}

// Metrics of the face this overlay embeds. These are LITERALS transcribed from
// public/fonts/CourierPrime-Regular.ttf (advanceWidth 1228/2048, capHeight 1187/2048) —
// unlike GID_TO_CHAR below, which really is derived from the file at run time. They said
// 0.6 / 0.583, the standard-14 Courier values, back when this overlay silently embedded
// nothing and the reader substituted its own font; it now embeds CourierPrime like the
// other two overlays. Re-transcribe if the shipped face ever changes.
const COURIER_ADVANCE = 0.599609;
const COURIER_CAP = 0.57959;

// pdf-lib writes a fontkit-embedded TrueType as CID/Identity-H, so each glyph is TWO
// bytes and the code IS the glyph id — decoding the hex as latin1 yields "\u0000\u0014"
// where "1" is meant. Invert the font's own cmap once and decode properly.
const GID_TO_CHAR: Map<number, string> = (() => {
  const font = fontkit.create(
    fs.readFileSync(path.join(process.cwd(), "public/fonts/CourierPrime-Regular.ttf")),
  ) as any;
  const m = new Map<number, string>();
  for (let c = 32; c < 127; c++) {
    const ch = String.fromCharCode(c);
    const g = font.glyphsForString(ch)[0];
    if (g && !m.has(g.id)) m.set(g.id, ch);
  }
  return m;
})();

function decodeGlyphHex(hex: string): string {
  let out = "";
  for (let i = 0; i + 3 < hex.length + 1; i += 4) {
    const gid = parseInt(hex.slice(i, i + 4), 16);
    out += GID_TO_CHAR.get(gid) ?? "";
  }
  return out;
}

function drawnText(stream: string): Drawn[] {
  const re =
    /([\d.]+) Tf\s+24 TL\s+1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm\s+<([0-9A-Fa-f]+)> Tj/g;
  const out: Drawn[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(stream))) {
    const size = Number(m[1]);
    const x = Number(m[2]);
    const y = Number(m[3]);
    const str = decodeGlyphHex(m[4]);
    out.push({
      str,
      size,
      x0: x,
      y0: y,
      x1: x + str.length * COURIER_ADVANCE * size,
      y1: y + COURIER_CAP * size,
    });
  }
  return out;
}

function whiteRects(stream: string): Bounds[] {
  const re =
    /1 1 1 rg\s+0 w\s+\[\] 0 d\s+1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm(?:\s+1 0 0 1 0 0 cm)*\s+0 0 m\s+0 (-?[\d.]+) l\s+(-?[\d.]+) -?[\d.]+ l/g;
  const out: Bounds[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(stream))) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    out.push({ x0: x, y0: y, x1: x + Number(m[4]), y1: y + Number(m[3]) });
  }
  return out;
}

const within = (inner: Bounds, outer: Bounds) =>
  inner.x0 >= outer.x0 &&
  inner.x1 <= outer.x1 &&
  inner.y0 >= outer.y0 &&
  inner.y1 <= outer.y1;

// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATE = new Uint8Array(
  fs.readFileSync(path.join(process.cwd(), "public", "chiefEvalBlank.pdf")),
);

// A different grade in every row, so a swapped row or a transposed page cannot pass by
// luck, and one NOB so the not-observed path is exercised too.
const GRADES = ["1.0", "2.0", "3.0", "4.0", "5.0", "NOB", "5.0"];

function evaluation(over: Partial<Evaluation> = {}): Evaluation {
  return {
    id: "geom", created_by: "u", form_definition_id: "d",
    report_type: "CHIEFEVAL",
    member_name: "Ray, Alan T", grade_rate: "ITC", dod_id: "1234567890",
    period_from: "2025-01-01", period_to: "2025-11-15",
    duty_status: "ACT", promotion_status: "Regular",
    uic: "N0011", ship_station: "USS Franklyn",
    trait_grades: Object.fromEntries(
      GRADE_CELL.map((c, i) => [c.key, GRADES[i]]),
    ),
    comments: "Substantiated.",
    career_recommendations: ["COMMAND SENIOR CHIEF"],
    promotion_recommendation: "Early Promote",
    block_values: {},
    ...over,
  } as unknown as Evaluation;
}

async function render(over: Partial<Evaluation> = {}) {
  const bytes = await generateChiefEvalOverlayPdf(evaluation(over), TEMPLATE);
  const s1 = await contentStream(bytes, 1);
  const s2 = await contentStream(bytes, 2);
  return {
    text: { 1: drawnText(s1), 2: drawnText(s2) } as Record<Page, Drawn[]>,
    rects: { 1: whiteRects(s1), 2: whiteRects(s2) } as Record<Page, Bounds[]>,
  };
}

describe("NAVPERS 1616/27 trait grades are numerals in cells", () => {
  it("formats a grade the way the form pre-prints it — one decimal, or NOB", () => {
    // The cell reads "0.0", not "0". A bare "4" must not print as "4".
    expect(formatTraitGrade("4")).toBe("4.0");
    expect(formatTraitGrade("4.0")).toBe("4.0");
    expect(formatTraitGrade("NOB")).toBe("NOB");
    expect(formatTraitGrade("nob")).toBe("NOB");
    // Nothing to say → draw nothing, leaving the blank's own 0.0 rather than
    // fabricating a grade.
    expect(formatTraitGrade("")).toBeNull();
    expect(formatTraitGrade(undefined)).toBeNull();
    expect(formatTraitGrade("6.0")).toBeNull();
    expect(formatTraitGrade("0")).toBeNull();
  });

  it("has a grade cell for exactly the seven traits the form prints", () => {
    expect([...OVERLAY_TRAIT_KEYS]).toEqual([...CHIEFEVAL_TRAIT_KEYS]);
    expect(OVERLAY_TRAIT_KEYS).toHaveLength(7);
  });

  it("writes each grade inside its own cell on the printed form", async () => {
    const { text } = await render();

    GRADE_CELL.forEach(({ page, block, printed, cell }, i) => {
      const expected = GRADES[i];
      const hits = text[page].filter(
        (d) => d.str === expected && within(d, cell),
      );
      expect(
        hits.length,
        `Block ${block} (${printed}) graded ${expected} should be written inside ` +
          `x[${cell.x0}, ${cell.x1}] y[${cell.y0}, ${cell.y1}] on page ${page}; ` +
          `page ${page} drew ${JSON.stringify(text[page].map((d) => [d.str, d.x0, d.y0]))}`,
      ).toBe(1);
    });
  });

  it("marks a not-observed trait by writing NOB in the grade cell", async () => {
    // 1616/27 prints no NOB checkbox on a trait row — only a bold legend beside the one
    // grade cell — so NOB is typed where the numeral goes. Block 41 is the form's own
    // demonstration: an identical bordered cell pre-printed with "NOB" as its default.
    const nob = GRADE_CELL[5]; // Block 38, graded NOB above
    const { text } = await render();
    expect(
      text[nob.page].filter((d) => d.str === "NOB" && within(d, nob.cell)),
    ).toHaveLength(1);
  });

  it("covers the pre-printed 0.0 before writing, without erasing the cell border", async () => {
    const { rects } = await render();

    GRADE_CELL.forEach(({ page, block, cell }) => {
      const ink = PREPRINTED_INK[block];
      const covers = rects[page].filter((r) => within(ink, r));
      expect(
        covers.length,
        `Block ${block}'s pre-printed "0.0" at x[${ink.x0}, ${ink.x1}] ` +
          `y[${ink.y0}, ${ink.y1}] must be covered before the grade is drawn, ` +
          `else the cell reads "0.04.0"`,
      ).toBe(1);
      // …and the cover must stay inside the cell, or it eats the printed border.
      expect(within(covers[0], cell)).toBe(true);
    });
  });

  it("puts no X mark anywhere in a trait row — 1616/27 has no grade columns", async () => {
    const { text } = await render();
    for (const [page, y0, y1] of TRAIT_ROW_Y) {
      const strays = text[page].filter(
        (d) =>
          d.str === "X" &&
          d.y0 >= y0 &&
          d.y0 <= y1 &&
          d.x0 >= GRADE_COLUMN_X.x0 - 20 &&
          d.x0 <= 612,
      );
      expect(
        strays,
        `page ${page} row y[${y0}, ${y1}] must contain no X mark; the six-column ` +
          `grade grid does not exist on this form`,
      ).toEqual([]);
    }
  });

  it("leaves a trait blank rather than stamping a grade it was not given", async () => {
    const { text, rects } = await render({
      trait_grades: { technical_mastery: "4.0" } as Evaluation["trait_grades"],
    });
    const drawn = [...text[1], ...text[2]].filter((d) =>
      GRADE_CELL.some((c) => within(d, c.cell)),
    );
    expect(drawn.map((d) => d.str)).toEqual(["4.0"]);
    // No cover either — an ungraded cell must still show the form's own 0.0.
    const covers = [...rects[1], ...rects[2]].filter((r) =>
      GRADE_CELL.some((c) => within(r, c.cell)),
    );
    expect(covers).toHaveLength(1);
  });
});

describe("NAVPERS 1616/27 header checkboxes", () => {
  it("marks each selected box inside the square the form prints", async () => {
    const { text } = await render({
      duty_status: "ACT",
      block_values: {
        periodic: true,
        special: true,
        not_observed: true,
        regular_report: true,
        concurrent_report: true,
        member_statement_intent: "I INTEND TO SUBMIT A STATEMENT",
      } as Evaluation["block_values"],
    });

    const expected: Array<keyof typeof CHECKBOX> = [
      "5_ACT", "10_PERIODIC", "13_SPECIAL",
      "16_NOT_OBS", "17_REGULAR", "18_CONCURRENT", "49_INTEND",
    ];
    for (const name of expected) {
      const { page, cell } = CHECKBOX[name];
      const hits = text[page].filter((d) => d.str === "X" && within(d, cell));
      expect(
        hits.length,
        `checkbox ${name} should be marked inside x[${cell.x0}, ${cell.x1}] ` +
          `y[${cell.y0}, ${cell.y1}] on page ${page}`,
      ).toBe(1);
    }

    // Every X the overlay draws must land in one of the form's fourteen squares —
    // no free-floating marks anywhere on either page.
    for (const page of [1, 2] as Page[]) {
      const stray = text[page]
        .filter((d) => d.str === "X")
        .filter(
          (d) =>
            !Object.values(CHECKBOX).some(
              (c) => c.page === page && within(d, c.cell),
            ),
        );
      expect(stray, `page ${page} drew an X outside every printed checkbox`).toEqual([]);
    }
  });

  it("picks the do-not-intend box for a declining member", async () => {
    const { text } = await render({
      block_values: {
        member_statement_intent: "I DO NOT INTEND TO SUBMIT A STATEMENT",
      } as Evaluation["block_values"],
    });
    const { cell } = CHECKBOX["49_DO_NOT"];
    expect(text[2].filter((d) => d.str === "X" && within(d, cell))).toHaveLength(1);
    expect(
      text[2].filter((d) => d.str === "X" && within(d, CHECKBOX["49_INTEND"].cell)),
    ).toHaveLength(0);
  });
});

describe("NAVPERS 1616/27 averages and recommendations", () => {
  // Cells measured the same way as the grade cells; 43 and 45 are pre-printed "0.00"
  // and 41 is pre-printed "NOB".
  const B41: Bounds = { x0: 92.6, y0: 239.0, x1: 211.2, y1: 253.2 };
  const B43: Bounds = { x0: 236.9, y0: 222.5, x1: 273.6, y1: 244.3 };
  const B45: Bounds = { x0: 364.3, y0: 223.2, x1: 393.8, y1: 235.7 };
  const B44_RSCA: Bounds = { x0: 364.3, y0: 241.2, x1: 393.8, y1: 253.7 };
  const B42_RANK: Bounds = { x0: 108.7, y0: 223.2, x1: 138.2, y1: 235.7 };
  const B42_OF: Bounds = { x0: 177.1, y0: 223.2, x1: 206.6, y1: 235.7 };
  // Ink extents of the defaults these cells are pre-printed with, measured at 300 dpi.
  const PREPRINTED_B44_INK: Bounds = { x0: 369.6, y0: 245.0, x1: 391.7, y1: 251.5 };
  const PREPRINTED_B42_INK: Record<string, Bounds> = {
    "0 (rank)": { x0: 114.0, y0: 227.0, x1: 117.6, y1: 233.5 },
    "0 (of)": { x0: 182.4, y0: 227.0, x1: 186.0, y1: 233.5 },
  };

  it("writes the member trait average in Block 43, not into a trait row", async () => {
    const { text } = await render();
    // Six graded traits (one NOB): (1+2+3+4+5+5)/6 = 3.33.
    const hits = text[2].filter((d) => within(d, B43));
    expect(hits.map((d) => d.str)).toEqual(["3.33"]);
  });

  it("writes the individual promotion recommendation in Block 41, set left", async () => {
    const { text } = await render();
    const hits = text[2].filter((d) => within(d, B41));
    expect(hits.map((d) => d.str)).toEqual(["EARLY PROMOTE"]);
    // Set left, where the form sets its own pre-printed NOB (ink starts at x 96.2),
    // not centred in a 118pt cell.
    expect(hits[0].x0).toBeLessThan(100);
  });

  it("writes the summary group average in Block 45", async () => {
    const { text } = await render({ summary_group_average: 4.32 });
    expect(text[2].filter((d) => within(d, B45)).map((d) => d.str)).toEqual(["4.32"]);
  });

  it("blanks Block 44 RSCA rather than leaving the form's 0.00 to read as a figure", async () => {
    // RSCA is the reporting senior's cumulative average. APEX holds no such number, and
    // the cell sits in the AVERAGES panel between Block 43 (3.33) and Block 45 (4.32) —
    // nothing marks it as un-computed, and 0.00 is a damaging number to a board.
    const { text, rects } = await render({ summary_group_average: 4.32 });
    expect(text[2].filter((d) => within(d, B44_RSCA))).toEqual([]);
    expect(
      rects[2].filter((r) => within(PREPRINTED_B44_INK, r)),
      "Block 44's pre-printed 0.00 must be covered, leaving the cell blank",
    ).toHaveLength(1);
  });

  it("blanks Block 42's pre-printed '0 of 0' ranking", async () => {
    // grep finds no summary-ranking field anywhere in APEX. Left alone, every generated
    // CHIEFEVAL tells a board the Sailor ranked 0 of 0.
    const { text, rects } = await render();
    for (const [name, ink] of Object.entries(PREPRINTED_B42_INK)) {
      expect(
        rects[2].filter((r) => within(ink, r)),
        `Block 42's pre-printed "${name}" must be covered`,
      ).toHaveLength(1);
    }
    expect(text[2].filter((d) => within(d, B42_RANK) || within(d, B42_OF))).toEqual([]);
  });

  it("breaks the summary group down across Block 48's five printed columns", async () => {
    // y[190.8, 205.4]; Significant Problems … Early Promote, left to right.
    const cells: Bounds[] = [
      { x0: 141.8, y0: 190.8, x1: 171.4, y1: 205.4 },
      { x0: 199.4, y0: 190.8, x1: 229.0, y1: 205.4 },
      { x0: 249.8, y0: 190.8, x1: 279.4, y1: 205.4 },
      { x0: 301.7, y0: 190.8, x1: 331.2, y1: 205.4 },
      { x0: 355.0, y0: 190.8, x1: 384.5, y1: 205.4 },
    ];
    const { text } = await render({
      summary_group_distribution: {
        "Significant Problems": 0, Progressing: 1, Promotable: 3,
        "Must Promote": 2, "Early Promote": 4,
      },
    });
    expect(
      cells.map((c) => text[2].filter((d) => within(d, c)).map((d) => d.str)),
    ).toEqual([["0"], ["1"], ["3"], ["2"], ["4"]]);
  });
});

describe("NAVPERS 1616/27 page-2 body geometry", () => {
  // Block 40 REPORTING SENIOR COMMENTS — cell y[277.2, 380.6], 103pt, label bottom
  // 370.9. Text is drawn from the cell's left origin, so every comment line is exactly
  // the page-2 text at x 34.2 below the trait table; anything the renderer spills past
  // the cell shows up in this same set.
  const B40: Bounds = { x0: 31.4, y0: 277.2, x1: 579.1, y1: 380.6 };
  const B40_TEXT_X = 34.2;
  const commentLines = (drawn: Drawn[]) =>
    drawn.filter((d) => Math.abs(d.x0 - B40_TEXT_X) < 0.01 && d.y0 < 381);

  const LONG_COMMENT = Array.from(
    { length: 30 },
    (_, i) => `Line ${i} substantiating the marks with verifiable specifics and results.`,
  ).join(" ");

  it("clamps Block 40 to the eight lines the box physically holds at 10-pitch", async () => {
    // The box is 103pt; at 10-pitch Courier (~11.75pt lead) that is EIGHT lines, not the
    // eighteen lib/commentFit.checkCommentFit still allows — 18 is the 1616/26 Block 43
    // number. Nine lines would put ink through the PROMOTION RECOMMENDATION panel.
    const { text } = await render({
      comments: LONG_COMMENT,
      block_values: { comment_pitch: "10" } as Evaluation["block_values"],
    });
    const lines = commentLines(text[2]);
    expect(lines).toHaveLength(8);
    lines.forEach((l, i) =>
      expect(within(l, B40), `Block 40 line ${i + 1} spills outside the box`).toBe(true),
    );
  });

  it("clamps Block 40 to seven lines at 12-pitch", async () => {
    const { text } = await render({
      comments: LONG_COMMENT,
      block_values: { comment_pitch: "12" } as Evaluation["block_values"],
    });
    const lines = commentLines(text[2]);
    expect(lines).toHaveLength(7);
    lines.forEach((l) => expect(within(l, B40)).toBe(true));
  });

  it("writes each career recommendation on its own Block 46 / 47 line", async () => {
    // Cells x[396.5, 579.1]; the wrapped "46. First / Recommendation" label ends at
    // x 444.3, so a value has to start clear of it and stay inside the right rule.
    const B46: Bounds = { x0: 444.3, y0: 237.6, x1: 579.1, y1: 255.4 };
    const B47: Bounds = { x0: 444.3, y0: 219.6, x1: 579.1, y1: 237.4 };
    const { text } = await render({
      career_recommendations: ["COMMAND SENIOR CHIEF", "RECRUIT DIV CMDR"],
    });
    expect(text[2].filter((d) => within(d, B46)).map((d) => d.str)).toEqual([
      "COMMAND SENIOR CHIEF",
    ]);
    expect(text[2].filter((d) => within(d, B47)).map((d) => d.str)).toEqual([
      "RECRUIT DIV CMDR",
    ]);
  });

  it("puts the reporting senior address in Block 51, above the printed Phone:/DSN:", async () => {
    // Cell x[373.4, 579.1]; "51. Reporting Senior Address" label bottom 144.8 and the
    // printed "Phone:" top 90.0 bound the writable band.
    const B51: Bounds = { x0: 373.4, y0: 90.0, x1: 579.1, y1: 144.8 };
    const { text } = await render({
      block_values: {
        reporting_senior_address: "USS FRANKLYN DDG 999\nFPO AP 96601-1234\nUNITED STATES",
      } as Evaluation["block_values"],
    });
    const lines = text[2].filter((d) => d.x0 > 300 && d.y0 > 60 && d.y0 < 160);
    expect(lines.map((d) => d.str)).toEqual([
      "USS FRANKLYN DDG 999",
      "FPO AP 96601-1234",
      "UNITED STATES",
    ]);
    lines.forEach((l) => expect(within(l, B51)).toBe(true));
  });

  it("puts each signature date in its own Block 49 / 50 / 52 box", async () => {
    const CELLS: Array<[number, Bounds, string]> = [
      [49, { x0: 518.2, y0: 156.2, x1: 575.5, y1: 174.0 }, "25NOV20"],
      [50, { x0: 302.2, y0: 113.8, x1: 370.3, y1: 131.5 }, "25NOV21"],
      [52, { x0: 302.2, y0: 50.4, x1: 370.3, y1: 68.2 }, "25NOV22"],
    ];
    const { text } = await render({
      block_values: {
        member_signature_date: "2025-11-20",
        reporting_senior_signature_date: "2025-11-21",
        concurrent_rs_signature_date: "2025-11-22",
      } as Evaluation["block_values"],
    });
    for (const [block, cell, expected] of CELLS) {
      expect(
        text[2].filter((d) => within(d, cell)).map((d) => d.str),
        `Block ${block}'s date must land in x[${cell.x0}, ${cell.x1}] y[${cell.y0}, ${cell.y1}]`,
      ).toEqual([expected]);
    }
  });
});

describe("NAVPERS 1616/27 Block 12 is not APEX's Block 12", () => {
  it("never stamps Block 12 from promotion_frocking", async () => {
    // 1616/27 Block 12 is "Detachment of Reporting Senior". APEX's only key for that
    // slot is bv.promotion_frocking, which the UI labels "12: Promotion/Frocking" —
    // EVAL 1616/26's Block 12. Stamping it puts an occasion on a signed record that the
    // rater never selected. This stays unmarked until the UI carries a per-form label.
    const { text } = await render({
      block_values: {
        promotion_frocking: true,
        periodic: true,
      } as Evaluation["block_values"],
    });
    expect(
      text[1].filter((d) => d.str === "X" && within(d, CHECKBOX["12_DET_RS"].cell)),
      "Block 12 must stay unmarked — blank is recoverable, a false occasion is not",
    ).toEqual([]);
    // …and the assertion is not vacuous: a sibling occasion box does get marked.
    expect(
      text[1].filter((d) => d.str === "X" && within(d, CHECKBOX["10_PERIODIC"].cell)),
    ).toHaveLength(1);
  });
});
