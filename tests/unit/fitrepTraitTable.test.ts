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

/** 14 chars: what Block 40's cell holds at the clamped 12 pt. Uppercased by the overlay. */
const REC_A = "CO(Q),DEPTHEAD";
const REC_B = "MAJOR COMMAND,";

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
      block_values: {
        date_reported: "2024-08-01",
        periodic: true,
        regular_report: true,
        reporting_senior_name: "REPORTINGSENIORNAME, JOHN A",
        reporting_senior_grade: "RADM",
        // 4 lines' worth of unbroken text, so the wrap force-splits at exactly the CPL.
        command_achievements: probe(91 * 4, B28_FILL),
        primary_duty_abbrev: "OPS",
        primary_duties: probe(91 * 4, B29_FILL),
        date_counseled: "2025-05-01",
        counselor: "JONES, CARL R",
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
    const recs = runs.filter((r) => /DEPTHEAD|MAJOR COMMAND/.test(r.str));
    expect(recs).toHaveLength(2);

    for (const r of recs) {
      // Full width for this cell — 14 characters is what it holds at 12 pt, and a
      // shorter probe could not see a right-hand overrun.
      expect(r.str).toHaveLength(14);
      expect(r.size).toBe(12);
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

  it("one more character would overrun Block 40's cell", async () => {
    // The other direction: a CPL short by one costs the Sailor a character.
    const runs = await overlayRuns(await renderProbeFitrep(), 2);
    const rec = runs.find((r) => /DEPTHEAD/.test(r.str))!;
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

  it("keeps every remaining field inside the printed frame, bar a named ledger", async () => {
    // The general guard the four constants slipped past: nothing may print outside the
    // form's outer rules. The exemptions are the fields this PR did NOT fix — each is
    // wrong on both axes (wrong CELL, not merely a margin), and each is described in the
    // note in lib/fitrepOverlay.ts. Fixing one deletes its line; adding one fails here.
    const LEDGER = new Set([
      "1|23.50|755.30", // p1.name_x — identity row
      "1|28.10|717.40", // p1.dutyCx[0] mark (cx 31.5)
      "1|546.50|721.50", // p1.datereported_x — overruns the RIGHT rule, ends at 588.47
      "1|28.10|682.20", // p1.periodicCx mark (cx 31.5)
      "1|23.50|616.00", // p1.rsName_x — reporting senior row
      "1|23.50|400.00", // p1.dateCounseled_x
      "2|23.50|755.30", // p2.name_x — identity row
      "2|135.00|47.00", // p2.summaryAvg_x — ink floor 45.00 under the 47.16 bottom rule
      "2|25.00|47.00", // p2.date49_x — margin AND under the bottom rule
      "2|205.00|47.00", // p2.date50_x
      "2|433.00|47.00", // p2.date51_x
    ]);

    const bytes = await renderProbeFitrep();
    const seen: string[] = [];
    const all: string[] = [];
    for (const page of [1, 2] as const) {
      const runs = await overlayRuns(bytes, page);
      all.push(...runs.map((r) => r.str));
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
    for (const sentinel of ["TESTMEMBERLONGNAME", "REPORTINGSENIORNAME", "DEPTHEAD", "X"])
      expect(all.some((s) => s.includes(sentinel))).toBe(true);

    const unlisted = seen.filter((s) => !LEDGER.has(s));
    expect(unlisted, `new field(s) printing outside the form frame`).toEqual([]);
    // ...and every field this PR moved is off the ledger for good: no run starts at the
    // inherited FORM_LEFT.
    expect(seen.some((s) => s.includes("|17.30|"))).toBe(false);
  }, 30_000);
});
