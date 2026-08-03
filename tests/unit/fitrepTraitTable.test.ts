// tests/unit/fitrepTraitTable.test.ts
//
// Pins the officer trait table to NAVPERS 1610/2 (REV 05-2025) — the blank that ships
// in public/fitrepBlank.pdf — rather than to whatever APEX currently renders.
//
// The form prints SEVEN traits. Every expectation below is transcribed from the blank's
// text layer (`pdftotext -layout public/fitrepBlank.pdf`) and the block-number/label
// pairs are re-checkable in five seconds against that command's output.

import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import Block33to39Traits from "../../components/blocks/Block33to39Traits/Block33to39Traits";
import Block43Comments from "../../components/blocks/Block43Comments";
import { ReportBanner } from "../../components/report/ReportChrome";
import {
  PDFDocument,
  PDFArray,
  PDFDict,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
} from "pdf-lib";
import {
  FITREP_TRAIT_STANDARDS,
  ANCHOR_GRADES,
  getTraitStandard,
} from "../../lib/traitStandards";
import { coachPayload } from "../../lib/evalCoach/coach";
import { FITREP_TRAIT_KEYS, FitrepSchema } from "../../types/navpers";
import { NAVFIT_TRAIT_MAP } from "../../lib/navfit98/constants";
import { computeTraitAverage } from "../../lib/traitAverage";
import { runFullValidation } from "../../lib/validationEngine";
import { generateFitrepOverlayPdf } from "../../lib/fitrepOverlay";
import {
  FIELD_FIT,
  getPrimaryDutiesFieldFit,
  measureTextFit,
} from "../../lib/commentFit";
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

// ─────────────────────────────────────────────────────────────────────────────
// Trait DESCRIPTORS, read out of the blank form itself.
//
// The block numbers above were already right while the prose under them was the
// EVAL's: the flat TRAIT_STANDARDS_LOOKUP merge resolved six of the seven officer
// keys to the 1616/26 table, so "Command or Organizational Climate (34)" printed
// above the EVAL's Block 35 anchors and Block 33 offered "advancement/PQS
// requirements" to an officer whose form grades qualifications.
//
// So these tests do not compare APEX to a hand-typed copy of the form — a copy is
// just the same transcription twice, and it passes whatever the transcription got
// wrong. They read the descriptor text out of public/fitrepBlank.pdf at run time
// and require APEX's strings to be IN it. Retyping a bullet from memory, or
// re-merging the EVAL table, fails.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The blank's text layer. Its glyphs are CID-encoded against a subset font, so the
 * codes are decoded through the PDF's own /ToUnicode CMaps rather than read as
 * latin1 (which yields mojibake — see the overlay readers above, which decode
 * pdf-lib's OUTPUT and need the shipped TTF instead).
 */
function blankFormText(file: string): Promise<string> {
  const bytes = new Uint8Array(
    fs.readFileSync(path.join(process.cwd(), "public", file)),
  );
  return PDFDocument.load(bytes).then((doc) => {
    const ctx = doc.context;
    const cmap = new Map<string, string>();
    for (const [, obj] of ctx.enumerateIndirectObjects()) {
      if (!(obj instanceof PDFDict)) continue;
      const tu = obj.get(PDFName.of("ToUnicode"));
      if (!tu) continue;
      const s = ctx.lookup(tu);
      if (!(s instanceof PDFRawStream)) continue;
      const t = Buffer.from(decodePDFRawStream(s).decode()).toString("latin1");
      for (const m of Array.from(
        t.matchAll(/<([0-9A-Fa-f]{4})>\s*<([0-9A-Fa-f]{4,})>/g),
      )) {
        cmap.set(
          m[1].toUpperCase(),
          String.fromCharCode(parseInt(m[2].slice(0, 4), 16)),
        );
      }
    }
    const decodeHex = (hex: string) => {
      let out = "";
      for (let i = 0; i + 4 <= hex.length; i += 4)
        out += cmap.get(hex.slice(i, i + 4).toUpperCase()) ?? "";
      return out;
    };

    let text = "";
    for (const page of doc.getPages()) {
      const contents = page.node.Contents();
      const streams =
        contents instanceof PDFArray
          ? contents.asArray().map((r) => page.node.context.lookup(r))
          : [contents];
      let raw = "";
      for (const s of streams)
        if (s instanceof PDFRawStream)
          raw += Buffer.from(decodePDFRawStream(s).decode()).toString("latin1");

      // `[ <hex> kern <hex> … ] TJ` and `<hex> Tj`. Ordinary letter-fit kerns in
      // this file are under 40; the cell gaps the form uses instead of a space
      // glyph are ~250. Anything past 100 is a gap, so it becomes a space.
      for (const m of Array.from(
        raw.matchAll(/\[([^\]]*)\]\s*TJ|<([0-9A-Fa-f]+)>\s*Tj/g),
      )) {
        if (m[2] !== undefined) {
          text += " " + decodeHex(m[2]);
          continue;
        }
        for (const t of Array.from(m[1].matchAll(/<([0-9A-Fa-f]+)>|(-?[\d.]+)/g)))
          text +=
            t[1] !== undefined
              ? decodeHex(t[1])
              : Math.abs(Number(t[2])) > 100
                ? " "
                : "";
        text += " ";
      }
    }
    return text;
  });
}

// Whitespace-and-case insensitive containment. The form wraps mid-phrase and even
// mid-token ("command/" / "organizational climate"), and prints trait names in
// caps, so comparing raw would fail on layout rather than on content. Every
// character and its order still has to match.
const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();

// Whitespace-only, CASE PRESERVED. The anchor bullets match the blank's casing
// exactly, and keeping case is what lets the boundary check below tell the form's
// next cell from more of APEX's own last bullet.
const stripWs = (s: string) => s.replace(/\s+/g, "");

describe("NAVPERS 1610/2 trait descriptors are the officer form's own words", () => {
  it("prints every title and sub-caption APEX shows the officer", async () => {
    const form = squash(await blankFormText("fitrepBlank.pdf"));
    // Sanity: the decoder produced the form, not an empty string that would make
    // every containment check below pass for free.
    expect(form).toContain(squash("NAVPERS 1610/2 (REV 05-2025)"));
    expect(form.length).toBeGreaterThan(5000);

    for (const [key, std] of Object.entries(FITREP_TRAIT_STANDARDS)) {
      for (const claim of [std.title, std.definition]) {
        expect(
          form.includes(squash(claim)),
          `Block ${std.block} (${key}): "${claim}" is not printed on NAVPERS 1610/2`,
        ).toBe(true);
      }
    }
  });

  // Bullets per anchor column, counted off the printed grid — 83 across 21 columns.
  // A LITERAL, not derived from FITREP_TRAIT_STANDARDS, because a table cannot count
  // itself: a column missing its last bullet is still a PREFIX of the form's real run,
  // and `includes` is satisfied by a prefix.
  const BULLETS_PER_COLUMN: Record<string, [number, number, number]> = {
    knowledge: [3, 3, 3],
    eo: [4, 6, 3],
    bearing: [4, 4, 4],
    teamwork: [3, 3, 3],
    accomplishment: [4, 4, 4],
    leadership: [6, 6, 7],
    tactical_performance: [3, 3, 3],
  };

  it("reproduces each anchor column WHOLE, in the form's own order", async () => {
    // Not per-bullet containment: a bullet cut short is still "contained" in the
    // form, and a truncation mutant passed that check. The blank prints a column's
    // bullets consecutively, dash-separated, so assert the whole joined column.
    //
    // Three assertions per column, because the joined needle by itself is still only
    // a PREFIX test. It pins the 62 bullets that have a sibling behind them and says
    // nothing about the 21 that END a column — drop or truncate one of those and the
    // needle stays a valid prefix. So:
    //   1. the form contains the joined column        (order, spelling, wholeness)
    //   2. what follows it is the next CELL           (last bullet is not truncated)
    //   3. the bullet count matches the printed grid  (last bullet is not missing)
    //
    // For (2): across all 21 columns the blank continues with exactly one of three
    // things — the next cell's dash, the next block number ("34."), or the page-1
    // footer after Block 37's 5.0 column, which is the last on the page. Anything
    // else means APEX stopped mid-bullet and the form kept going. Checked with case
    // preserved, so a cut before a capitalised word ("…Navy Core Values:" / "HONOR")
    // fails too — a lowercase-only check would have waved that through.
    const form = stripWs(await blankFormText("fitrepBlank.pdf"));
    expect(form).toContain(stripWs("NAVPERS 1610/2 (REV 05-2025)"));

    let columns = 0;
    let bullets = 0;
    for (const [key, std] of Object.entries(FITREP_TRAIT_STANDARDS)) {
      ANCHOR_GRADES.forEach((grade, i) => {
        const printed = std.anchors[grade];
        const where = `Block ${std.block} (${key}) ${grade}`;
        const column = stripWs("-" + printed.join("-"));
        const at = form.indexOf(column);

        expect(
          at,
          `${where} column is not printed on NAVPERS 1610/2 as APEX has it:\n  ` +
            printed.join("\n  "),
        ).toBeGreaterThanOrEqual(0);

        const after = form.slice(at + column.length, at + column.length + 20);
        expect(
          /^(?:-|\d|NAVPERS)/.test(after),
          `${where}: the form continues "${after}" past APEX's last bullet — ` +
            `"${printed[printed.length - 1]}" is truncated`,
        ).toBe(true);

        expect(
          printed.length,
          `${where}: the printed grid has ${BULLETS_PER_COLUMN[key][i]} bullets`,
        ).toBe(BULLETS_PER_COLUMN[key][i]);

        columns++;
        bullets += printed.length;
      });
    }
    expect(columns).toBe(21); // seven traits × 1.0 / 3.0 / 5.0
    expect(bullets).toBe(83);
  });

  it("never hands an officer a phrase that only 1616/26 prints", async () => {
    // Each of these is EVAL prose the officer was shown under a 1610/2 heading.
    // They are absent from the officer blank — asserted, not assumed.
    const EVAL_ONLY = [
      "Marginal knowledge of rating, specialty or job",
      "Fails to meet advancement/PQS requirements",
      "Meets advancement/PQS requirements on time",
      "Poor self-control; conduct resulting in disciplinary action",
      "Model of conduct, on and off duty",
      "Needs prodding to attain qualification or finish job",
      "Avoids responsibility",
      "Seeks extra responsibility and takes on the hardest jobs",
      "Needs excessive supervision", // Quality of Work — no such trait on 1610/2
    ];
    const form = squash(await blankFormText("fitrepBlank.pdf"));
    // A `not.toContain` over an empty read passes for free. Guard locally rather
    // than leaning on the previous test having run.
    expect(form).toContain(squash("NAVPERS 1610/2 (REV 05-2025)"));
    const officer = squash(JSON.stringify(FITREP_TRAIT_STANDARDS));
    for (const phrase of EVAL_ONLY) {
      expect(form, `1610/2 does print "${phrase}"`).not.toContain(squash(phrase));
      expect(
        officer,
        `the officer trait table still serves EVAL prose: "${phrase}"`,
      ).not.toContain(squash(phrase));
    }
  });

  it("answers per form — no key borrows another form's entry", () => {
    // `work` (Quality of Work) is 1616/26 Block 34 and prints nowhere on 1610/2;
    // `tactical_performance` is 1610/2 Block 39 and prints on neither enlisted form.
    // A form that does not print a trait must answer undefined, so callers skip it
    // explicitly instead of receiving a plausible-looking wrong standard.
    expect(getTraitStandard("FITREP", "work")).toBeUndefined();
    expect(getTraitStandard("EVAL", "tactical_performance")).toBeUndefined();
    expect(getTraitStandard("CHIEFEVAL", "tactical_performance")).toBeUndefined();
    expect(getTraitStandard("FITREP", "professionalism")).toBeUndefined();

    // …and the seven keys the officer form DOES print resolve to officer prose.
    expect(getTraitStandard("FITREP", "knowledge")?.title).toBe(
      "Professional Expertise",
    );
    expect(getTraitStandard("EVAL", "knowledge")?.title).toBe(
      "Professional Knowledge",
    );
    expect(getTraitStandard("FITREP", "eo")?.block).toBe(34);
    expect(getTraitStandard("EVAL", "eo")?.block).toBe(35);
  });

  it("shows the officer 1610/2 prose on screen, not 1616/26 prose", () => {
    render(
      React.createElement(Block33to39Traits, {
        evalData: {
          report_type: "FITREP",
          trait_grades: { knowledge: "1.0", bearing: "5.0" },
        } as unknown as Evaluation,
        onChange: () => {},
        issues: [],
      }),
    );

    // Block 33 at 1.0 and Block 35 at 5.0, as 1610/2 prints them…
    expect(
      screen.getByText("Lacks basic professional knowledge to perform effectively"),
    ).toBeTruthy();
    expect(screen.getByText("Exemplary Navy representative")).toBeTruthy();
    // …and not as 1616/26 prints the traits it numbers 33 and 36.
    expect(screen.queryByText(/Marginal knowledge of rating/)).toBeNull();
    expect(screen.queryByText(/Model of conduct, on and off duty/)).toBeNull();
  });

  it("keeps descriptors and headings on the same form when only the form id says FITREP", () => {
    // A draft identified by form_definition_id alone used to take its trait
    // HEADINGS from that id and its descriptor prose from an undefined report
    // type — officer headings, enlisted anchors, on the same row.
    render(
      React.createElement(Block33to39Traits, {
        evalData: {
          form_definition_id: "FITREP-1610-2",
          trait_grades: { knowledge: "1.0" },
        } as unknown as Evaluation,
        onChange: () => {},
        issues: [],
      }),
    );
    expect(screen.getByText(/Professional Expertise \(33\)/)).toBeTruthy();
    expect(
      screen.getByText("Lacks basic professional knowledge to perform effectively"),
    ).toBeTruthy();
    expect(screen.queryByText(/Marginal knowledge of rating/)).toBeNull();
  });

  it("coaches an officer against the officer form's anchors", async () => {
    // The AI coach reads the same table. A live FITREP run was measured judging an
    // officer's narrative against 1616/26 anchors before this; the payload is what
    // carries them, so pin the payload.
    const p = coachPayload({
      report_type: "FITREP",
      pitch: "10",
      comments: "QUALIFIED EARLY AND LED THE WATCH TEAM.",
      trait_grades: { knowledge: "5.0", eo: "3.0" },
    });

    const knowledge = p.traits.find((t) => t.key === "knowledge");
    expect(knowledge?.block).toBe(33);
    expect(knowledge?.title).toBe("Professional Expertise");
    expect(knowledge?.anchors?.["5.0"]).toContain(
      "Achieves early/highly advanced qualifications",
    );

    // Every anchor the model is handed is printed on the officer's own form, and
    // no trait reaches it with an empty yardstick.
    const form = squash(await blankFormText("fitrepBlank.pdf"));
    for (const t of p.traits) {
      const bullets = ANCHOR_GRADES.flatMap((g) => t.anchors?.[g] ?? []);
      expect(bullets.length, `${t.key} reached the model with no anchors`).toBeGreaterThan(0);
      for (const b of bullets)
        expect(form, `coach fed "${b}" — not on NAVPERS 1610/2`).toContain(squash(b));
    }
  });
});

describe("the narrative coach asks about the officer's own form", () => {
  // NarrativeCoach is a separate component from Block43Comments with its own
  // `evalData` prop, so the parent's resolved report type is not in scope there —
  // a fact that first surfaced as a compile error, which means nothing was pinning
  // what this call site actually sends. The route's z.enum rejects undefined, so
  // passing the raw field 400s a draft carrying only a form_definition_id instead
  // of coaching it, and passing the WRONG form coaches it against wrong anchors.
  const coachBody = async (evalData: Partial<Evaluation>) => {
    localStorage.setItem("apex:eval-coach-consent", "true");
    let posted: Record<string, unknown> | null = null;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (!init) return Promise.resolve({ ok: true, json: async () => ({ available: true }) });
      posted = JSON.parse(String(init.body));
      return Promise.resolve({ ok: true, json: async () => ({ findings: [], notes: [], unassessed: [], dropped: 0 }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      React.createElement(Block43Comments, {
        evalData: evalData as Evaluation,
        onChange: () => {},
        issues: [],
      }),
    );
    const btn = await screen.findByRole("button", { name: /review my narrative/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    vi.unstubAllGlobals();
    return posted as Record<string, unknown> | null;
  };

  it("sends FITREP for a draft identified only by its form id", async () => {
    const body = await coachBody({
      form_definition_id: "FITREP-1610-2",
      comments: "COMMANDED THE WATCH.",
      trait_grades: { knowledge: "5.0" },
    });
    // Not undefined — the route's z.enum would 400 — and not "EVAL".
    expect(body?.report_type).toBe("FITREP");
  });

  it("still honours an explicit report_type", async () => {
    const body = await coachBody({
      report_type: "CHIEFEVAL",
      form_definition_id: "",
      comments: "LED THE MESS.",
      trait_grades: { accountability: "4.0" },
    });
    expect(body?.report_type).toBe("CHIEFEVAL");
  });
});
// ─────────────────────────────────────────────────────────────────────────────
// Horizontal geometry.
//
// The axis that had NO coverage at all until PR #41, which added it for Block 41 only —
// which is why four more constants sat 14-15 pt out in the page margin through #32, #34
// and #36, all of which measured the vertical axis exhaustively.
//
// Every bound below is MEASURED off public/fitrepBlank.pdf and transcribed here
// independently of lib/fitrepOverlay.ts, so these fail when a constant drifts off the
// FORM, not when it drifts off today's output.
//
// Method (re-runnable): `pdftoppm -r 600 -gray public/fitrepBlank.pdf out`, then within
// each block's y band take the columns dark on >90% of the band's rows. Every rule on the
// form strokes exactly 0.72 pt; the numbers are INNER ink edges. Re-measured at 2400 dpi,
// where the same edges read 32.630 / 579.830 / 31.640 / 578.870 / 470.120 — agreement to
// within one 600 dpi pixel (0.12 pt).
//
// THE TWO PAGES DO NOT SHARE A LEFT RULE, which is the substance of this fix: one
// constant for both is how the margin defect happened.
// ─────────────────────────────────────────────────────────────────────────────

const RULES: Record<1 | 2, { left: number; right: number }> = {
  1: { left: 32.64, right: 579.84 },
  2: { left: 31.68, right: 578.88 },
};
const FRAME_TOP = 769.32;
const FRAME_FLOOR = 47.16;

/**
 * Block 40's empty right cell — where the two career-milestone recommendations go. The
 * block is split by a rule at x[469.440, 470.160]; the wide left cell carries the form's
 * own three lines of instruction text (ink y[477.840, 500.160]), leaving 8.04 pt of clear
 * height there, under one 12 pt line. This cell holds ZERO form ink at 600 dpi.
 */
const B40_CELL = { left: 470.16, right: 578.88, floor: 469.8, top: 505.08 };

/**
 * Blocks 28 and 29, page 1, measured the same way — and this is the axis the horizontal
 * sweep below cannot see: both blocks used to print INSIDE THE FRAME and inside the wrong
 * cell, so every assertion in this file passed while Block 28 drew over Block 29 and
 * Block 29 drew over the Block 33 trait descriptors.
 *
 * The three rules that bound the pair strike at y[648.360, 649.080], y[600.840, 601.560]
 * and y[538.920, 539.640]; the numbers below are inner ink edges.
 *
 * Block 28's only form ink is its header, x[35.160, 220.920] y[637.680, 644.880] — so the
 * cell is clear full width from 637.680 down to 601.560, 36.12 pt.
 *
 * Block 29 carries two things. Its header prints y[590.160, 597.360] out to x 311.520, and
 * the 29A abbreviation box hangs below it on its own line: strokes x[39.840, 40.560] /
 * x[155.760, 156.480] and y[577.800, 578.520] / y[590.040, 590.760]. Right of that box the
 * cell is clear from the header's floor down; below it the cell is clear full width from
 * 577.800 to 539.640, which is 38.16 pt and holds three lines, not four. The fourth line
 * exists only because line 1 sits beside the box.
 */
const B28 = { floor: 601.56, headerFloor: 637.68 };
const B29 = {
  floor: 539.64,
  /** Lowest header ink RIGHT of the 29A box, which is where line 1 goes. */
  headerFloor: 590.16,
  /**
   * The 29A box. `floor`/`ceiling` are the INTERIOR, which is what the
   * abbreviation itself has to stay inside. `inkFloor` is the box's lowest
   * printed ink — the bottom stroke's outer edge — and it is what a full-width
   * line BELOW the box has to clear. They differ by exactly the 0.72 pt stroke,
   * and conflating them made the "lines 2+ clear the box" assertion 0.72 pt
   * looser than the derivation lib/fitrepOverlay.ts actually used: a line topping
   * out at 578.4 would have passed while sitting on the printed rule.
   */
  abbrev: { left: 40.56, right: 155.76, floor: 578.52, ceiling: 590.04, inkFloor: 577.8 },
};
/** The rule between the two cells — the one Block 28 used to print through. */
const B28_B29_RULE = 600.84;

/**
 * Blocks 22-27, the Reporting Senior identity row. Cell y[649.080, 673.560];
 * column strokes at x[182.400, 183.120] / [232.800, 233.520] / [283.920, 284.640]
 * / [415.680, 416.400] / [470.400, 471.120]; lowest header ink 662.880.
 *
 * Here because this row USED to draw at y 616.0 — inside Block 28's cell — which
 * was invisible while Block 28 itself drew a cell low, and became an unreadable
 * overprint the moment Block 28 was corrected.
 */
const RS_ROW = { floor: 649.08, ceiling: 673.56, headerFloor: 662.88 };
const RS_COLS: Array<[number, number]> = [
  [32.64, 182.4],
  [183.12, 232.8],
  [233.52, 283.92],
  [284.64, 415.68],
  [416.4, 470.4],
  [471.12, 579.84],
];

/** House inset off a printed rule. Same 2.5 the comment blocks are held to. */
const INSET = 2.5;

/** CourierPrime-Regular: every printable glyph advances 1228/2048 em. */
const ADVANCE = 1228 / 2048;
/** Real outline extents over printable ASCII — '`' highest, 'y'/'g'/'j' deepest. */
const INK_ABOVE = 0.6909;
const INK_BELOW = 0.2002;

/**
 * A probe line of EXACTLY n characters carrying both ink extremes and ending in a
 * descender. An earlier suite on this epic drew nothing but "X": no descender ever
 * reached the renderer, and the line was ~20 characters short of the box, so it could not
 * see a horizontal overrun at all.
 */
const probe = (n: number, alphabet: string) =>
  alphabet.repeat(Math.ceil(n / alphabet.length)).slice(0, n - 1) + "g";

/** Read back every glyph run APEX drew, in page coordinates. */
async function overlayRuns(bytes: Uint8Array, page: 1 | 2) {
  const { getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const tc = await (await doc.getPage(page)).getTextContent();
  const styles = tc.styles as Record<string, { fontFamily: string; descent: number }>;
  // The blank embeds serif faces only; the overlay adds CourierPrime, which pdf.js
  // reports as sans-serif with the font's own declared descent of -700/2048. Asserted,
  // not assumed — a filter that silently matched nothing would make every test below
  // vacuously green.
  const mine = Object.entries(styles)
    .filter(([, s]) => s.fontFamily === "sans-serif")
    .map(([k]) => k);
  expect(mine).toHaveLength(1);
  expect(styles[mine[0]].descent).toBeCloseTo(-700 / 2048, 6);

  return (tc.items as any[])
    .filter((i) => i.fontName === mine[0] && (i.str ?? "").trim())
    .map((i) => {
      const str = (i.str as string).replace(/\s+$/, "");
      const size = Math.hypot(i.transform[1], i.transform[3]) as number;
      const x = i.transform[4] as number;
      const y = i.transform[5] as number;
      return {
        str,
        size,
        x,
        x2: x + str.length * size * ADVANCE,
        base: y,
        top: y + size * INK_ABOVE,
        bot: y - size * INK_BELOW,
      };
    });
}

const B28_FILL = "Xygj`Q";
const B29_FILL = "Wygj`Q";

/** 4 lines' worth of unbroken text, so the wrap force-splits at exactly the CPL. */
const B28_TEXT = probe(91 * 4, B28_FILL);

/**
 * TWO tokens, not one unbroken run, and the first is exactly 91 - lead long.
 *
 * Block 29's first line is shared with the 29A box, so it holds only 91 - lead characters.
 * An unbroken token cannot start there: wrapTextToWidth emits the reserved lead as a line
 * of its OWN, pushing the narrative down one line and dropping the last chunk at the
 * slice. The fixture used to do exactly that, so line 1 of Block 29 never reached the
 * renderer and nothing here could see where it landed. Sized to fill all four lines.
 */
const B29_TEXT =
  probe(91 - (getPrimaryDutiesFieldFit("FITREP").firstLineLead ?? 0), B29_FILL) +
  " " +
  probe(91 * 3, B29_FILL);

/**
 * The narrative lines one block drew, top-down. Selected by ALPHABET, never by position —
 * a y-band filter would assume the answer these tests exist to check. `X` and `W` are what
 * tell the two blocks apart; the rest of both alphabets is shared, and every line is long
 * enough to carry many of them.
 */
function fillLines<T extends { str: string; base: number }>(
  runs: T[],
  fill: string,
): T[] {
  return runs
    .filter(
      (r) =>
        r.str.length >= 20 &&
        r.str.includes(fill[0]) &&
        new RegExp(`^[${fill}]+$`).test(r.str),
    )
    .sort((a, b) => b.base - a.base);
}

/**
 * 20 chars — CAREER_REC_MAX, which is what the editor accepts, the validator allows and
 * NAVFIT's RecommendA/B carry. Uppercased by the overlay, so the deepest ink available is
 * punctuation and 'Q'; the assertions use the global -0.2002 em anyway, which is the
 * conservative direction.
 */
const REC_A = "DEPARTMENT HEAD (Q),";
const REC_B = "POSTGRADUATE SCHOOL,";

async function renderProbeFitrep() {
  const template = new Uint8Array(
    fs.readFileSync(path.join(process.cwd(), "public", "fitrepBlank.pdf")),
  );
  return generateFitrepOverlayPdf(
    {
      report_type: "FITREP",
      member_name: "TESTMEMBERLONGNAME, SAILOR A",
      grade_rate: "CDR",
      designator: "1110",
      dod_id: "1234567890",
      period_from: "2025-01-01",
      period_to: "2025-11-15",
      duty_status: "ACT",
      promotion_status: "REGULAR",
      uic: "N00011",
      ship_station: "USS FRANKLYN",
      trait_grades: { knowledge: "5.0", leadership: "5.0" },
      comments: "SHORT.",
      career_recommendations: [REC_A, REC_B],
      promotion_recommendation: "Early Promote",
      summary_group_average: 4.55,
      // summary_group_distribution, not_observed and concurrent_rs_signature_date are
      // set because the sweep below can only see fields that DRAW. The first revision of
      // this fixture omitted all three, and the ledger silently missed two constants that
      // print outside the form (notObservedCx, date52_x) — the same miss-a-sibling
      // failure this whole epic keeps repeating.
      summary_group_distribution: {
        "Significant Problems": 0,
        Progressing: 1,
        Promotable: 2,
        "Must Promote": 3,
        "Early Promote": 4,
      },
      block_values: {
        date_reported: "2024-08-01",
        // EVERY occasion and type flag, so all seven header checkboxes draw.
        // Contradictory as a real report — deliberately, because the sweep can
        // only see a field that DRAWS, and leaving three unset left Blocks 11, 13
        // and 18 unpinned: their constants could be moved to another cell
        // entirely and the whole suite stayed green.
        periodic: true,
        detachment_individual: true,
        special: true,
        regular_report: true,
        not_observed: true,
        concurrent_report: true,
        concurrent_rs_signature_date: "2025-11-23",
        // All SIX Blocks 22-27 fields, not two. The first revision of this fixture
        // set only name and grade, so four of the six columns never drew and the
        // sweep could not see them — the same miss-a-sibling failure that let the
        // whole row sit in Block 28's cell unnoticed.
        reporting_senior_name: "REPORTINGSENIORNAME, JOHN A",
        reporting_senior_grade: "RADM",
        // Every value DISTINCT from the member's own — the fixture's
        // designator is 1110 and its UIC N00011, and a lookup by string then
        // finds the identity row's run instead of this one.
        reporting_senior_designator: "1310",
        reporting_senior_title: "COMMANDING OFFICER",
        reporting_senior_uic: "N00022",
        reporting_senior_dod_id: "1234509876",
        command_achievements: B28_TEXT,
        primary_duty_abbrev: "OPS",
        primary_duties: B29_TEXT,
        date_counseled: "2025-05-01",
        counselor: "JONES, CARL R",
        // Set so the Block 12 guard has something to refuse. 1610/2 prints
        // "Detachment of Reporting Senior" there, not the EVAL's Promotion/Frocking.
        promotion_frocking: true,
        // Blocks 20-21. They drew a cell low, straight over the reporting
        // senior's title, and the sweep could not see it because the fixture
        // never set them — the same miss-a-sibling gap as Blocks 22-27.
        physical_readiness: "PB",
        billet_subcategory: "NA",
        qualifications: "ESWS QUALIFIED THIS PERIOD.",
        reporting_senior_address: "1234 NAVY WAY\nNORFOLK VA 23511",
        member_statement_intent: "I INTEND TO SUBMIT A STATEMENT",
        senior_rater_signature_date: "2025-11-20",
        reporting_senior_signature_date: "2025-11-21",
        member_signature_date: "2025-11-22",
        comment_pitch: "12",
        comment_pitch_v: 2,
      },
    } as unknown as Evaluation,
    template,
  );
}

describe("NAVPERS 1610/2 overlay geometry — the horizontal axis", () => {
  it.each([
    ["Block 28 command achievements", 1 as const, B28_FILL, 91],
    ["Block 29B primary duties", 1 as const, B29_FILL, 91],
  ])(
    "%s: every full-width line sits between the page's own side rules",
    async (_label, page, fill, cpl) => {
      const runs = await overlayRuns(await renderProbeFitrep(), page);
      const lines = runs.filter((r) => new RegExp(`^[${fill}]{20,}`).test(r.str));

      // The probe must have reached the renderer at FULL width, or the assertions below
      // are measuring a line the form never has to hold.
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(Math.max(...lines.map((l) => l.str.length))).toBe(cpl);

      // The point size these blocks solve comes from the box the BLANK has, not from a
      // width carried over from another form. The inherited FORM_RIGHT - FORM_LEFT was
      // 547.9 against a real 547.200 — right by accident, and the accident is what this
      // pins. (Both pages measure the same interior; so do all three comment blocks.)
      const interior = RULES[page].right - RULES[page].left;
      expect(interior).toBeCloseTo(547.2, 6);
      for (const l of lines)
        expect(l.size).toBeCloseTo((interior - 4) / ((cpl + 0.5) * 0.6), 6);

      for (const l of lines) {
        expect(l.x - RULES[page].left).toBeGreaterThanOrEqual(INSET);
        expect(RULES[page].right - l.x2).toBeGreaterThanOrEqual(INSET);
      }
    },
    30_000,
  );

  it("Block 29B's duty abbreviation starts inside the rule too", async () => {
    // Drawn by narrativeWithLead at the same x as the body; it was the third FORM_LEFT
    // site once b29b_contX is counted, and it prints on its own.
    const runs = await overlayRuns(await renderProbeFitrep(), 1);
    const lead = runs.find((r) => r.str === "OPS");
    expect(lead).toBeDefined();
    expect(lead!.x - RULES[1].left).toBeGreaterThanOrEqual(INSET);
  });

  it("Block 40's two recommendations land in the block's own empty cell", async () => {
    const runs = await overlayRuns(await renderProbeFitrep(), 2);
    const recs = runs.filter((r) => /DEPARTMENT HEAD|POSTGRADUATE/.test(r.str));
    expect(recs).toHaveLength(2);

    for (const r of recs) {
      // Full width — 20 characters, the length every other layer of APEX carries, at the
      // size THIS cell solves for them. A shorter probe could not see a right-hand
      // overrun, and a probe that let the entry truncate would not notice it had.
      expect(r.str).toHaveLength(20);
      const cellWidth = B40_CELL.right - B40_CELL.left;
      expect(cellWidth).toBeCloseTo(108.72, 6);
      expect(r.size).toBeCloseTo((cellWidth - 4) / ((20 + 0.5) * 0.6), 6);
      expect(r.x - B40_CELL.left).toBeGreaterThanOrEqual(INSET);
      expect(B40_CELL.right - r.x2).toBeGreaterThanOrEqual(INSET);
      // BOTH axes: they used to draw at y 512.0, which is 6.92 pt above this block
      // entirely, inside the Block 39 trait row. x alone would not have moved them in.
      expect(r.bot - B40_CELL.floor).toBeGreaterThanOrEqual(INSET);
      expect(B40_CELL.top - r.top).toBeGreaterThanOrEqual(INSET);
    }
    // Two lines, not one on top of the other.
    const [a, b] = recs.sort((p, q) => q.base - p.base);
    expect(a.bot).toBeGreaterThan(b.top);
  });

  it("uses the cell's full width — one more character at this size would overrun", async () => {
    // The other direction: a CPL short by one costs the Sailor a character of a career
    // recommendation. This says 20 characters is what the cell holds AT THE SOLVED SIZE;
    // it is not a claim that 20 is forced by the geometry alone, since the formula
    // rescales with CPL. 20 comes from CAREER_REC_MAX, and this is what proves it fits.
    const runs = await overlayRuns(await renderProbeFitrep(), 2);
    const rec = runs.find((r) => /DEPARTMENT HEAD/.test(r.str))!;
    expect(rec.x + (rec.str.length + 1) * rec.size * ADVANCE).toBeGreaterThan(
      B40_CELL.right - INSET,
    );
  });

  it("draws no Qualifications block — 1610/2 does not have one", async () => {
    // Block 44 on this form is "Reporting Senior Address" (header at x 402.68), and the
    // brag sheet already treats qualifications as EVAL-only. It used to print at x 17.30,
    // in the margin beside the promotion-recommendation grid.
    const runs = await overlayRuns(await renderProbeFitrep(), 2);
    expect(runs.some((r) => /ESWS QUALIFIED/.test(r.str))).toBe(false);
  });

  it("Block 28's narrative stays in Block 28's cell", async () => {
    const lines = fillLines(await overlayRuns(await renderProbeFitrep(), 1), B28_FILL);

    // The count is the BOX's, not a preference: FIELD_FIT is what the editor and the
    // validator enforce, and this file used to hardcode 4 against a 3-line box.
    expect(lines).toHaveLength(FIELD_FIT.command_achievements.maxLines);
    expect(lines).toHaveLength(3);

    for (const l of lines) {
      expect(l.top).toBeLessThanOrEqual(B28.headerFloor);
      expect(l.bot).toBeGreaterThanOrEqual(B28.floor);
    }
    // And 3 is what the cell HOLDS — one more line would break the floor. Without this
    // the count assertion above is just two constants agreeing with each other.
    const lead = lines[0].base - lines[1].base;
    expect(lines[lines.length - 1].bot - lead).toBeLessThan(B28.floor);
  }, 30_000);

  it("Block 29's abbreviation prints inside the 29A box, not over its rules", async () => {
    const runs = await overlayRuns(await renderProbeFitrep(), 1);
    const abbrev = runs.find((r) => r.str === "OPS");
    expect(abbrev).toBeDefined();
    // It used to draw at the 29B text origin — 4.7 pt left of this box's left stroke,
    // running straight over it — and at the 29B baseline, which sits below the floor.
    expect(abbrev!.x).toBeGreaterThanOrEqual(B29.abbrev.left + INSET);
    expect(abbrev!.x2).toBeLessThanOrEqual(B29.abbrev.right - INSET);
    expect(abbrev!.top).toBeLessThanOrEqual(B29.abbrev.ceiling);
    expect(abbrev!.bot).toBeGreaterThanOrEqual(B29.abbrev.floor);
  }, 30_000);

  it("Block 29's narrative stays in Block 29's cell, line 1 beside the 29A box", async () => {
    const lines = fillLines(await overlayRuns(await renderProbeFitrep(), 1), B29_FILL);
    const spec = getPrimaryDutiesFieldFit("FITREP");
    expect(lines).toHaveLength(spec.maxLines);
    expect(lines).toHaveLength(4);

    // Line 1 is the only one that clears the 29A box, and only because it starts to its
    // RIGHT. That is what the first-line lead buys, and a lead of 20 did not buy it: the
    // first glyph landed at 153.80, on top of the box's right stroke.
    const [first, ...rest] = lines;
    expect(first.x).toBeGreaterThanOrEqual(B29.abbrev.right + INSET);
    expect(first.top).toBeLessThanOrEqual(B29.headerFloor);
    expect(first.bot).toBeGreaterThanOrEqual(B29.floor);

    // Lines 2+ are full width, so they have to clear the 29A box's printed INK,
    // not its interior — the bottom stroke is 0.72 pt of black between the two.
    for (const l of rest) {
      expect(l.x).toBeLessThan(B29.abbrev.left);
      expect(l.top).toBeLessThanOrEqual(B29.abbrev.inkFloor);
      expect(l.bot).toBeGreaterThanOrEqual(B29.floor);
    }
    const lead = lines[0].base - lines[1].base;
    expect(lines[lines.length - 1].bot - lead).toBeLessThan(B29.floor);
  }, 30_000);

  it("does not print either block into the other's cell", async () => {
    // The defect this pair had: Block 28 drew 4 lines from 574.0 — inside Block 29's
    // cell and through the rule beneath it — and Block 29 drew from 486.0, over the
    // Block 33 trait descriptors. Both were inside the page frame, so the sweep below
    // saw nothing. Assert the cells directly.
    const runs = await overlayRuns(await renderProbeFitrep(), 1);
    const b28 = fillLines(runs, B28_FILL);
    const b29 = fillLines(runs, B29_FILL);
    // Length pins first: two `for` loops over an empty match pass green, and this
    // is the one assertion in the group that has no count of its own.
    expect(b28).toHaveLength(3);
    expect(b29).toHaveLength(4);
    for (const l of b28) expect(l.bot).toBeGreaterThan(B28_B29_RULE);
    for (const l of b29) {
      expect(l.top).toBeLessThan(B28_B29_RULE);
      expect(l.bot).toBeGreaterThan(B29.floor);
    }
  }, 30_000);

  /**
   * Every page-1 cell, measured off the blank: the eight full-width rules give
   * the row boundaries, and each cluster below belongs in exactly one of them.
   *
   * This table is what makes the offset checkable. A collision sweep alone does
   * NOT: move a field back into a different EMPTY cell and it overlaps nothing,
   * stays inside the frame, and every other assertion in this file passes. Five
   * of nine mutants survived on exactly that hole before this existed.
   */
  // [cell floor, USABLE ceiling]. The ceiling is the row's lowest printed HEADER
  // ink, not the rule — a value that clears the rule but not the label prints on
  // top of the label, which is what `identityBaseline: 755.3` did to "1. Name"
  // (5.0 pt above a header flooring at 757.2) while sitting inside its cell the
  // whole time. `occasion` is the exception and keeps the rule: Blocks 14-15 are
  // set BESIDE their "14. From:"/"15. To:" labels, sharing the printed line.
  const P1_CELLS: Record<string, [number, number]> = {
    identity: [747.0, 757.2], // Blocks 1-4
    admin: [723.24, 734.16], // Block 5 + Blocks 6-9
    occasion: [698.04, 722.52], // Blocks 10-13 + Blocks 14-15 (value beside label)
    type: [674.28, 685.92], // Blocks 16-19 + Blocks 20-21
    reportingSenior: [649.08, 662.88], // Blocks 22-27
    counselling: [517.32, 530.28], // Blocks 30-31
  };

  /**
   * The column each field belongs to, inner ink edges of the dividers. Without
   * these the cell check passes for a field in the RIGHT ROW and the WRONG
   * COLUMN — `uic_x` reverted to the EVAL's 174 lands in Block 5's column and
   * survived the row check untouched.
   */
  const P1_COLS: Record<string, [number, number]> = {
    b1: [32.64, 304.08],
    b2: [304.8, 369.6],
    b6: [181.68, 232.08],
    b7: [232.8, 427.92],
    b8: [428.64, 507.12],
    b9: [507.84, 579.84],
    b1415: [371.76, 579.84],
    b20: [371.76, 470.4],
    b21: [471.12, 579.84],
    b22: [32.64, 182.4],
    b23: [183.12, 232.8],
    b30: [211.92, 289.68],
    b31: [290.4, 427.2],
  };

  /**
   * EVERY checkbox square on page 1, inner ink edges off the blank — not just the
   * ones the probe stamps.
   *
   * The census matters because the assertion is inverted below. Listing only the
   * stamped boxes and checking "each listed box got a mark" is what let Block 16
   * ship 12.2 pt above its square: the mark existed, `toHaveLength(5)` counted
   * it, and no assertion asked where it went. The question has to be "did every
   * mark land in a box", which needs all the boxes.
   *
   * All four type-of-report squares (16-19) are in ONE row at y[677.160, 688.680]
   * — Block 16's LABEL wraps to two lines, its box does not.
   */
  const P1_BOXES: Record<string, { x: [number, number]; y: [number, number] }> = {
    "5_ACT": { x: [45.6, 59.28], y: [725.4, 736.92] },
    "5_TAR": { x: [75.12, 88.8], y: [725.4, 736.92] },
    "5_INACT": { x: [103.92, 117.6], y: [725.4, 736.92] },
    "5_AT_ADSW": { x: [132.0, 145.68], y: [725.4, 736.92] },
    "10_PERIODIC": { x: [88.8, 102.48], y: [701.64, 713.16] },
    "11_DET_INDIV": { x: [168.72, 182.4], y: [701.64, 713.16] },
    "12_DET_RS": { x: [263.04, 276.72], y: [701.64, 713.16] },
    "13_SPECIAL": { x: [341.52, 355.2], y: [701.64, 713.16] },
    "16_NOT_OBSERVED": { x: [88.8, 102.48], y: [677.16, 688.68] },
    "17_REGULAR": { x: [168.72, 182.4], y: [677.16, 688.68] },
    "18_CONCURRENT": { x: [263.04, 276.72], y: [677.16, 688.68] },
    "19_OPS_CDR": { x: [341.52, 355.2], y: [677.16, 688.68] },
  };

  it("every page-1 field prints in the cell whose header names it", async () => {
    const runs = await overlayRuns(await renderProbeFitrep(), 1);
    const find = (str: string) => {
      const hits = runs.filter((r) => r.str === str);
      expect(hits, `"${str}" drew ${hits.length} times`).toHaveLength(1);
      return hits[0];
    };

    // Field text -> the cell it belongs in. Values are unique in the fixture, so
    // a lookup cannot silently match a different block's run.
    const FIELDS: Array<[string, keyof typeof P1_CELLS, keyof typeof P1_COLS, number]> = [
      ["TESTMEMBERLONGNAME, SAILOR A", "identity", "b1", 1],
      ["CDR", "identity", "b2", 2],
      ["N00011", "admin", "b6", 6],
      ["USS FRANKLYN", "admin", "b7", 7],
      ["REGULAR", "admin", "b8", 8],
      ["24AUG01", "admin", "b9", 9],
      ["25JAN01", "occasion", "b1415", 14],
      ["25NOV15", "occasion", "b1415", 15],
      ["PB", "type", "b20", 20],
      ["NA", "type", "b21", 21],
      ["REPORTINGSENIORNAME, JOHN A", "reportingSenior", "b22", 22],
      ["RADM", "reportingSenior", "b23", 23],
      ["25MAY01", "counselling", "b30", 30],
      ["JONES, CARL R", "counselling", "b31", 31],
    ];
    for (const [str, cell, col, block] of FIELDS) {
      const [floor, ceiling] = P1_CELLS[cell];
      const [left, right] = P1_COLS[col];
      const r = find(str);
      expect(r.bot, `Block ${block} ("${str}") sits below its cell`).toBeGreaterThanOrEqual(floor);
      expect(r.top, `Block ${block} ("${str}") prints over its own header`).toBeLessThanOrEqual(ceiling);
      expect(r.x, `Block ${block} starts left of its column`).toBeGreaterThanOrEqual(left);
      expect(r.x2, `Block ${block} runs past its column`).toBeLessThanOrEqual(right);
    }

    // The three checkbox marks the probe stamps, each inside its own printed
    // square — not merely inside the right cell.
    // Eight on page 1: Block 5 ACT, Blocks 10/11/13, Blocks 16/17/18, and the
    // Block 33 trait grade. Block 12 is deliberately absent even though the
    // fixture sets its flag, and Block 19 has no APEX field — see below.
    const marks = runs.filter((r) => r.str === "X" && r.size === 11);
    expect(marks).toHaveLength(8);
    const centreOf = (m: (typeof marks)[number]) => ({
      cx: m.x + 6.6 / 2,
      cy: m.base + 6.3 / 2,
    });
    // INVERTED: every mark must land in SOME box. "Each listed box got a mark" is
    // the form this test had, and it cannot see a mark that went nowhere — which
    // is exactly how Block 16 shipped 12.2 pt above its square, on a printed rule,
    // while the count assertion above passed. The trait-grid mark is excluded by
    // y band; it has its own test against GRADE_COLS_P1.
    //
    // By CENTRE, the idiom the trait-grid test uses: the mark is an 11 pt "X" with
    // no descender, so the -0.2002 em envelope that full-width narrative lines are
    // held to reads 0.2 pt below ink that does not exist.
    const inBox = (m: (typeof marks)[number], box: (typeof P1_BOXES)[string]) => {
      const { cx, cy } = centreOf(m);
      return cx > box.x[0] && cx < box.x[1] && cy > box.y[0] && cy < box.y[1];
    };
    const headerMarks = marks.filter((m) => centreOf(m).cy > 660);
    expect(headerMarks).toHaveLength(7);
    for (const m of headerMarks) {
      const landed = Object.entries(P1_BOXES).filter(([, box]) => inBox(m, box));
      expect(
        landed.map(([n]) => n),
        `a mark at (${m.x.toFixed(2)}, ${m.base.toFixed(2)}) is in no checkbox`,
      ).toHaveLength(1);
    }
    // …and each flag the fixture sets marked its OWN box, so a pair of constants
    // cannot be swapped and still satisfy the "every mark is in some box" rule.
    for (const name of [
      "5_ACT",
      "10_PERIODIC",
      "11_DET_INDIV",
      "13_SPECIAL",
      "16_NOT_OBSERVED",
      "17_REGULAR",
      "18_CONCURRENT",
    ])
      expect(
        headerMarks.filter((m) => inBox(m, P1_BOXES[name])),
        `no mark landed in ${name}`,
      ).toHaveLength(1);
  }, 30_000);

  it("never stamps Block 12 — on 1610/2 it is Detachment of Reporting Senior", async () => {
    // NOT the EVAL's "Promotion/Frocking". APEX's only key for the slot is
    // bv.promotion_frocking, so stamping it puts an occasion on a signed record
    // the rater never selected. The probe sets that flag; the form must ignore it.
    // Blank is recoverable, a false occasion is not — same rule 1616/27 follows.
    const runs = await overlayRuns(await renderProbeFitrep(), 1);
    const marks = runs.filter((r) => r.str === "X" && r.size === 11);
    const centre = (m: (typeof marks)[number]) => ({
      cx: m.x + 6.6 / 2,
      cy: m.base + 6.3 / 2,
    });
    // Block 12's square, measured: x[263.04, 276.72] y[701.64, 713.16].
    expect(
      marks.filter((m) => {
        const { cx, cy } = centre(m);
        return cx > 263.04 && cx < 276.72 && cy > 701.64 && cy < 713.16;
      }),
      "Block 12 was stamped",
    ).toEqual([]);
    // …and the assertion is not vacuous: Block 10, its sibling in the same cell
    // and the same checkbox row, IS marked from the same fixture.
    expect(
      marks.filter((m) => {
        const { cx, cy } = centre(m);
        return cx > 88.8 && cx < 102.48 && cy > 701.64 && cy < 713.16;
      }),
    ).toHaveLength(1);
  }, 30_000);

  it("NOTHING on page 1 prints on top of anything else", async () => {
    // The general form of the defect this PR kept re-discovering one field at a
    // time. Blocks 28/29 drew a cell low; correcting them dropped them on Blocks
    // 22-27, which drew a cell low; correcting those dropped Blocks 16-21 on
    // them. Every per-block assertion in this file passed throughout, because
    // each one filters runs to its own block's probe alphabet and a line
    // overprinted by a DIFFERENT drawText is invisible to it.
    //
    // The root cause was one missing offset, not twenty wrong constants, so the
    // right guard is one sweep over every pair of drawn runs — not another
    // per-block bound. There is no ledger: on page 1 the answer is zero.
    const runs = await overlayRuns(await renderProbeFitrep(), 1);
    expect(runs.length, "the probe drew almost nothing").toBeGreaterThan(25);

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

  it("no OTHER field prints through Block 28's or Block 29's lines", async () => {
    // The gap that let the reporting-senior row hide. Every assertion above
    // filters drawn runs to one block's probe alphabet, so a line overprinted by
    // a DIFFERENT drawText passes all of them — and correcting Block 28's
    // baseline moved it on top of Blocks 22-27, which were themselves drawing a
    // whole cell low at y 616.0. Compare the two blocks' runs to EVERY other run
    // instead of each to its own box.
    const runs = await overlayRuns(await renderProbeFitrep(), 1);
    const narrative = [...fillLines(runs, B28_FILL), ...fillLines(runs, B29_FILL)];
    expect(narrative).toHaveLength(7);

    const collisions: string[] = [];
    for (const other of runs) {
      if (narrative.includes(other)) continue;
      for (const l of narrative) {
        const overlapsY = other.bot < l.top && other.top > l.bot;
        const overlapsX = other.x < l.x2 && other.x2 > l.x;
        if (overlapsY && overlapsX)
          collisions.push(
            `"${other.str.slice(0, 24)}" at (${other.x.toFixed(1)}, ${other.base.toFixed(1)}) ` +
              `over a narrative line at ${l.base.toFixed(2)}`,
          );
      }
    }
    expect(collisions).toEqual([]);
  }, 30_000);

  it("the reporting-senior row prints in Blocks 22-27, each field in its own column", async () => {
    // It drew at y 616.0 — inside Block 28's cell, 9.14 pt out in the page margin,
    // and with five of six fields starting far enough right to overflow their own
    // column ("RADM" at x 212.0 ended at 236.0, past the stroke at 232.800).
    const runs = await overlayRuns(await renderProbeFitrep(), 1);
    const fields = [
      "REPORTINGSENIORNAME, JOHN A",
      "RADM",
      "1310",
      "COMMANDING OFFICER",
      "N00022",
      "1234509876",
    ];
    fields.forEach((str, i) => {
      // Exactly one run, or the lookup is finding some other field that happens
      // to carry the same text — which it did, until the fixture stopped giving
      // the reporting senior the member's own designator and UIC.
      const hits = runs.filter((r) => r.str === str);
      expect(hits, `Block ${22 + i} (${str}) drew ${hits.length} times`).toHaveLength(1);
      const run = hits[0];
      expect(run, `Block ${22 + i} (${str}) was not drawn`).toBeDefined();
      const [left, right] = RS_COLS[i];
      expect(run.x, `Block ${22 + i} starts left of its column`).toBeGreaterThanOrEqual(
        left + INSET,
      );
      expect(run.x2, `Block ${22 + i} overruns its column`).toBeLessThanOrEqual(right);
      expect(run.top).toBeLessThanOrEqual(RS_ROW.headerFloor);
      expect(run.bot).toBeGreaterThanOrEqual(RS_ROW.floor);
      // SIZE, not just position. `rsWidths` is a positional array paired against
      // a hand-written field list, and `text()` shrinks to fit — so pairing the
      // longest name with the narrowest column renders it at 6.4 pt instead of
      // 8.9 and still lands inside its column. Reversing the array passed every
      // other assertion in this file. Nothing on a signed record should print
      // that much smaller than the row around it.
      expect(
        run.size,
        `Block ${22 + i} shrank to ${run.size.toFixed(2)} pt — rsWidths mispaired?`,
      ).toBeGreaterThanOrEqual(8);
    });
  }, 30_000);

  it("draws exactly as many lines as the editor and the validator promise", async () => {
    // The trap named in lib/fitrepOverlay.ts: move a line count in one place and the
    // editor keeps accepting text the PDF silently slices off. measureTextFit is what
    // backs the measuring canvas (MeasuredCourierField) and rule 30 in validationEngine,
    // so wrapping the SAME fixture through it must give the same number of lines the
    // renderer drew — at the cap, where a mismatch actually costs the Sailor text.
    const runs = await overlayRuns(await renderProbeFitrep(), 1);

    const ca = measureTextFit(
      B28_TEXT,
      FIELD_FIT.command_achievements.charsPerLine,
      FIELD_FIT.command_achievements.maxLines,
      FIELD_FIT.command_achievements.firstLineLead ?? 0,
    );
    const spec = getPrimaryDutiesFieldFit("FITREP");
    const pd = measureTextFit(
      B29_TEXT,
      spec.charsPerLine,
      spec.maxLines,
      spec.firstLineLead ?? 0,
    );

    // Block 28's fixture deliberately OVERFLOWS — 4 lines' worth into a 3-line block, so
    // the horizontal sweep gets full-width lines to measure. The guarantee that direction
    // is that the overflow is visible: the validator rejects it rather than the renderer
    // quietly slicing a line off a record the editor said was fine.
    expect(ca.fit).toBe(false);
    expect(ca.linesUsed).toBeGreaterThan(FIELD_FIT.command_achievements.maxLines);
    expect(fillLines(runs, B28_FILL)).toHaveLength(
      FIELD_FIT.command_achievements.maxLines,
    );

    // Block 29's fixture fills its block EXACTLY, which is the case that matters: the
    // editor accepts it, and every line it accepted reaches the page. This is what breaks
    // if the lead moves in one layer and not the other — at lead 20 the canvas would fit
    // this text in 4 lines while the PDF started it on top of the 29A box's rule.
    expect(pd.fit).toBe(true);
    expect(pd.linesUsed).toBe(spec.maxLines);
    expect(fillLines(runs, B29_FILL)).toHaveLength(pd.linesUsed);
  }, 30_000);

  it("keeps every remaining field inside the printed frame, bar a named ledger", async () => {
    // The general guard the four constants slipped past: nothing may print outside the
    // form's outer rules. The exemptions are the fields this PR did NOT fix — each is
    // wrong on both axes (wrong CELL, not merely a margin), and each is described in the
    // note in lib/fitrepOverlay.ts. Fixing one deletes its line; adding one fails here.
    // PAGE 1 HAS NO ENTRIES. All seven it used to carry — the identity row, the
    // Block 5 and 10 and 16 checkbox marks, Block 9's date running off the right
    // rule, and the Block 30 counselling date — were the same one missing offset,
    // and they left together. The page-1 half of this ledger is asserted EMPTY
    // below, so a regression cannot be absorbed by adding a line here.
    const LEDGER = new Set([
      "2|23.50|755.30", // p2.name_x — identity row
      "2|135.00|47.00", // p2.summaryAvg_x — ink floor 45.00 under the 47.16 bottom rule
      "2|25.00|47.00", // p2.date49_x — margin AND under the bottom rule
      "2|205.00|47.00", // p2.date50_x
      "2|433.00|47.00", // p2.date51_x
      "2|522.00|47.00", // p2.date52_x — concurrent reporting senior's signature date
    ]);

    const bytes = await renderProbeFitrep();
    const seen: string[] = [];
    const all: Array<{ str: string; size: number }> = [];
    for (const page of [1, 2] as const) {
      const runs = await overlayRuns(bytes, page);
      all.push(...runs);
      for (const r of runs) {
        const outside =
          r.x < RULES[page].left ||
          r.x2 > RULES[page].right ||
          r.bot < FRAME_FLOOR ||
          r.top > FRAME_TOP;
        if (outside)
          seen.push(`${page}|${r.x.toFixed(2)}|${r.base.toFixed(2)}`);
      }
    }
    // The probe really drew a populated report on both pages — a sweep over an empty
    // form would pass every assertion below without testing anything.
    expect(all.length).toBeGreaterThan(30);
    for (const sentinel of ["TESTMEMBERLONGNAME", "REPORTINGSENIORNAME", "DEPARTMENT HEAD"])
      expect(all.some((r) => r.str.includes(sentinel))).toBe(true);
    // The checkbox marks specifically. A plain `includes("X")` sentinel passed on the
    // Block 28 probe alphabet ("Xygj`Q") whether or not mark() drew anything at all —
    // making mark() a no-op left it green. mark() is the only 11 pt single-glyph draw.
    expect(all.some((r) => r.str === "X" && r.size === 11)).toBe(true);

    const unlisted = seen.filter((s) => !LEDGER.has(s));
    expect(unlisted, `new field(s) printing outside the form frame`).toEqual([]);
    // Page 1 is finished: not "everything outside the frame is listed", but
    // nothing on page 1 is outside it at all. Page 2 still has its six.
    expect(
      seen.filter((s) => s.startsWith("1|")),
      "a page-1 field is outside the printed frame again",
    ).toEqual([]);
    expect(Array.from(LEDGER).every((s) => s.startsWith("2|"))).toBe(true);
    // ...and every field this PR moved is off the ledger for good: no run starts at the
    // inherited FORM_LEFT.
    expect(seen.some((s) => s.includes("|17.30|"))).toBe(false);
  }, 30_000);
});
