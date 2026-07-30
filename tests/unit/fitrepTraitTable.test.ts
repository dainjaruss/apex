// tests/unit/fitrepTraitTable.test.ts
//
// Pins the officer trait table to NAVPERS 1610/2 (REV 05-2025) — the blank that ships
// in public/fitrepBlank.pdf — rather than to whatever APEX currently renders.
//
// The form prints SEVEN traits. Every expectation below is transcribed from the blank's
// text layer (`pdftotext -layout public/fitrepBlank.pdf`) and the block-number/label
// pairs are re-checkable in five seconds against that command's output.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import React from "react";
import { render, screen } from "@testing-library/react";
import Block33to39Traits from "../../components/blocks/Block33to39Traits/Block33to39Traits";
import { ReportBanner } from "../../components/report/ReportChrome";
import {
  PDFDocument,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import { FITREP_TRAIT_KEYS, FitrepSchema } from "../../types/navpers";
import { NAVFIT_TRAIT_MAP } from "../../lib/navfit98/constants";
import { computeTraitAverage } from "../../lib/traitAverage";
import { runFullValidation } from "../../lib/validationEngine";
import { generateFitrepOverlayPdf } from "../../lib/fitrepOverlay";
import { Evaluation } from "../../types";

// Blocks 33-39 exactly as printed on NAVPERS 1610/2 (REV 05-2025), in form order.
// There is no eighth trait and no "Quality of Work" — that is an EVAL (1616/26) trait.
const FORM_TRAITS: Array<{ block: number; key: string; printed: string }> = [
  { block: 33, key: "knowledge", printed: "PROFESSIONAL EXPERTISE" },
  { block: 34, key: "eo", printed: "COMMAND OR ORGANIZATIONAL CLIMATE" },
  { block: 35, key: "bearing", printed: "MILITARY BEARING/CHARACTER" },
  { block: 36, key: "teamwork", printed: "TEAMWORK" },
  { block: 37, key: "accomplishment", printed: "MISSION ACCOMPLISHMENT AND INITIATIVE" },
  { block: 38, key: "leadership", printed: "LEADERSHIP" },
  { block: 39, key: "tactical_performance", printed: "TACTICAL PERFORMANCE" },
];

describe("NAVPERS 1610/2 trait table", () => {
  it("is the seven traits printed at Blocks 33-39, in form order", () => {
    expect([...FITREP_TRAIT_KEYS]).toEqual(FORM_TRAITS.map((t) => t.key));
  });

  it("has no Quality of Work trait — the schema drops it", () => {
    expect(FITREP_TRAIT_KEYS as readonly string[]).not.toContain("work");

    const parsed = FitrepSchema.shape.trait_grades.parse({
      knowledge: "5.0",
      work: "1.0", // an EVAL trait; must not survive onto an officer report
      eo: "5.0",
    });
    expect(parsed).not.toHaveProperty("work");
    expect(parsed.knowledge).toBe("5.0");
  });

  it("anchors every validation error on the block the form prints it at", () => {
    // An observed FITREP with nothing graded raises one error per trait (rule 11),
    // each carrying the block number — which is how the block map reaches the UI.
    const result = runFullValidation({
      report_type: "FITREP",
      trait_grades: {},
      block_values: { regular_report: true },
    } as unknown as Evaluation);

    const byField = new Map(
      result.errors
        .filter((e) => (e.field || "").startsWith("trait_grades."))
        .map((e) => [e.field, e.block]),
    );

    expect(Array.from(byField.keys()).sort()).toEqual(
      FORM_TRAITS.map((t) => `trait_grades.${t.key}`).sort(),
    );
    for (const { block, key } of FORM_TRAITS) {
      expect(byField.get(`trait_grades.${key}`)).toBe(block);
    }
  });

  it("exports each block to NAVFIT from the trait the form prints there", () => {
    expect(NAVFIT_TRAIT_MAP.FITREP.map((e) => [e.block, e.key])).toEqual(
      FORM_TRAITS.map((t) => [t.block, t.key]),
    );
  });

  it("labels seven rows on screen with the form's block numbers", () => {
    const { container } = render(
      React.createElement(Block33to39Traits, {
        evalData: {
          report_type: "FITREP",
          trait_grades: {},
        } as unknown as Evaluation,
        onChange: () => {},
        issues: [],
      }),
    );

    // The rater sees one row per printed trait, numbered as the form numbers it.
    const legends = Array.from(container.querySelectorAll("legend")).map(
      (l) => l.textContent || "",
    );
    expect(legends).toHaveLength(FORM_TRAITS.length);
    FORM_TRAITS.forEach((t, i) => {
      expect(legends[i]).toMatch(new RegExp(`\\(${t.block}\\)`));
    });

    // The row that used to be here is an EVAL trait and must be gone, as must the
    // "8th trait" framing that treated Tactical Performance as an extra.
    expect(screen.queryByText(/Quality of Work/i)).toBeNull();
    expect(screen.queryByText(/8th Trait/i)).toBeNull();
    expect(screen.getByText(/Tactical Performance \(39\)/)).toBeTruthy();
  });
});

describe("NAVPERS 1610/2 trait average divisor", () => {
  const graded = (grades: string[]) =>
    Object.fromEntries(FORM_TRAITS.map((t, i) => [t.key, grades[i]]));

  it("divides a fully graded officer report by seven, not eight", () => {
    // Six 5.0s and a 3.0 = 33/7 = 4.714… → 4.71. The old eight-key table divided the
    // same marks by 8 and printed 4.75.
    const r = computeTraitAverage(graded(["5.0", "5.0", "5.0", "5.0", "5.0", "5.0", "3.0"]));
    expect(r.gradedCount).toBe(7);
    expect(r.average).toBe(4.71);
  });

  it("drops to six when Block 39 is NOB (not warfare qualified)", () => {
    // Block 39 carries its own NOB box on the form. NOB is excluded from both the sum
    // and the count, so a non-warfare-qualified officer averages over six traits.
    const r = computeTraitAverage(graded(["5.0", "5.0", "5.0", "5.0", "5.0", "5.0", "NOB"]));
    expect(r.gradedCount).toBe(6);
    expect(r.average).toBe(5);
  });

  // KNOWN GAP, pinned deliberately. `computeTraitAverage` counts whatever it finds in
  // `TRAIT_KEYS` (lib/traitAverage.ts), a cross-form superset that still contains `work`
  // because `work` is a real EVAL trait at 1616/26 Block 34. The divisor is therefore NOT
  // report-type aware: a FITREP that still carries `work` averages over 8 while only 7
  // marks print on the page.
  //
  // Migration 011 is what closes this — it strips `work` from officer records, and
  // FitrepSchema stops new ones being written. The exposure is anything that bypasses
  // both: a hosted record before 011 runs, a backup restore, a direct DB write.
  //
  // This asserts the real numbers rather than the ones we would like, so that making the
  // divisor report-type aware BREAKS this test and forces a deliberate update instead of
  // passing silently. Fixing it properly means threading report_type through ~8
  // production call sites across all three forms — its own change, not this one.
  it("counts a stray legacy `work` grade — divisor is not report-type aware", () => {
    const clean = graded(["5.0", "5.0", "5.0", "5.0", "5.0", "5.0", "3.0"]);
    expect(computeTraitAverage(clean)).toMatchObject({
      average: 4.71,
      gradedCount: 7,
      gradedSum: 33,
    });

    // The same seven marks, plus an orphaned EVAL trait the form does not have.
    expect(computeTraitAverage({ ...clean, work: "1.0" })).toMatchObject({
      average: 4.25,
      gradedCount: 8,
      gradedSum: 34,
    });
  });

  it("shows a cleared average as a gap, not as 0.00", () => {
    // Migration 011 nulls `trait_average` on the records it corrected, on the stated
    // grounds that a visible gap beats a number that quietly changed. That only holds
    // if the header actually renders the null as a gap — a truthiness check here would
    // print "0.00", indistinguishable from an ungraded draft.
    const banner = (avg: number | null) =>
      render(
        React.createElement(ReportBanner, {
          evaluation: {
            member_name: "CHEN, DAVID T",
            status: "draft",
            trait_average: avg,
          } as unknown as Evaluation,
        }),
      ).container.textContent || "";

    expect(banner(null)).toContain("—");
    expect(banner(null)).not.toContain("0.00");
    expect(banner(4.71)).toContain("4.71");
    // 0 is the "nothing graded" sentinel and must still print as a number.
    expect(banner(0)).toContain("0.00");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Overlay geometry.
//
// The checkbox bounds below are MEASURED from public/fitrepBlank.pdf, independently of
// lib/fitrepOverlay.ts, so this test fails if the overlay's grid drifts off the form.
//
// Method (re-runnable): `pdftoppm -gray -r 300 public/fitrepBlank.pdf out`, then within
// each trait row's checkbox band count dark pixels per column — the six 14.4 pt boxes
// show up as pairs of full-height strokes. Row bands come from the same scan and agree
// with each row's NOB label position in `pdftotext -bbox-layout` to within a point.
// ─────────────────────────────────────────────────────────────────────────────

// [NOB, 1.0, 2.0, 3.0, 4.0, 5.0] — x of each checkbox's left and right border.
const BOX_X: Record<1 | 2, Array<[number, number]>> = {
  1: [[88.3, 102.7], [217.2, 231.6], [253.2, 267.6], [389.3, 403.7], [426.0, 440.4], [563.5, 577.9]],
  2: [[87.4, 101.8], [216.2, 230.6], [252.2, 266.6], [389.0, 403.4], [425.0, 439.4], [562.6, 577.0]],
};

// Each trait row's checkbox band: [page, block, yBottom, yTop].
const ROW_Y: Array<[1 | 2, number, number, number]> = [
  [1, 33, 386.6, 398.9],
  [1, 34, 303.1, 315.4],
  [1, 35, 218.2, 230.4],
  [1, 36, 133.9, 146.2],
  [1, 37, 50.4, 62.6],
  [2, 38, 603.4, 615.6],
  [2, 39, 507.6, 519.8],
];

const GRADE_COL: Record<string, number> = {
  NOB: 0,
  "1.0": 1,
  "2.0": 2,
  "3.0": 3,
  "4.0": 4,
  "5.0": 5,
};

// pdf-lib writes each drawText as `1 0 0 1 <x> <y> Tm` followed by the glyph. The "X"
// mark is 11 pt Courier drawn from that origin: ~6.6 pt wide, ~6.3 pt cap height.
function drawnMarks(pdfBytes: Uint8Array, page: number) {
  return PDFDocument.load(pdfBytes).then((doc) => {
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
    const marks: Array<{ cx: number; cy: number }> = [];
    // size Tf … 1 0 0 1 x y Tm … <glyph> Tj. Keep the 11 pt single-glyph draws: that is
    // `mark()`'s "X" and nothing else the overlay writes (the trait average is 10 pt).
    const re =
      /([\d.]+) Tf\s+24 TL\s+1 0 0 1 (-?[\d.]+) (-?[\d.]+) Tm\s+<([0-9A-Fa-f]+)> Tj/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (+m[1] !== 11 || m[4].length > 4) continue;
      marks.push({ cx: +m[2] + 6.6 / 2, cy: +m[3] + 6.3 / 2 });
    }
    return marks;
  });
}

describe("NAVPERS 1610/2 overlay geometry", () => {
  // A different grade in every trait, so a swapped row or column cannot pass by luck.
  const GRADES = ["1.0", "2.0", "3.0", "4.0", "5.0", "NOB", "5.0"];

  it("stamps every trait grade inside its own checkbox on the printed form", async () => {
    const template = new Uint8Array(
      fs.readFileSync(path.join(process.cwd(), "public", "fitrepBlank.pdf")),
    );
    const out = await generateFitrepOverlayPdf(
      {
        report_type: "FITREP",
        trait_grades: Object.fromEntries(
          FORM_TRAITS.map((t, i) => [t.key, GRADES[i]]),
        ),
      } as unknown as Evaluation,
      template,
    );

    const marks = { 1: await drawnMarks(out, 1), 2: await drawnMarks(out, 2) };
    expect(marks[1]).toHaveLength(5); // Blocks 33-37 print on page 1
    expect(marks[2]).toHaveLength(2); // Blocks 38-39 print on page 2

    ROW_Y.forEach(([page, block, yBot, yTop], i) => {
      const [xLeft, xRight] = BOX_X[page][GRADE_COL[GRADES[i]]];
      const hit = marks[page].filter(
        (p) => p.cx > xLeft && p.cx < xRight && p.cy > yBot && p.cy < yTop,
      );
      expect(
        hit.length,
        `Block ${block} (${FORM_TRAITS[i].printed}) graded ${GRADES[i]} should land in ` +
          `x[${xLeft}, ${xRight}] y[${yBot}, ${yTop}] on page ${page}; ` +
          `marks were ${JSON.stringify(marks[page])}`,
      ).toBe(1);
    });
  });
});
