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
