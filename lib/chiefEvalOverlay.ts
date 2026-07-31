// lib/chiefEvalOverlay.ts
//
// High-fidelity PDF generation by OVERLAYING our data onto the official
// NAVPERS 1616/27 (CHIEFEVAL, REV 05-2025) blank in public/chiefEvalBlank.pdf.
//
// ── How 1616/27 records a trait grade ────────────────────────────────────────
// It does NOT use the 1.0/2.0/3.0/4.0/5.0 checkbox grid that 1616/26 and 1610/2 use.
// Each trait row (Blocks 33-39) is three columns — PERFORMANCE TRAITS | PERFORMANCE
// GRADE | PERFORMANCE COMMENTS — and the PERFORMANCE GRADE column holds:
//   • a bare bold "NOB" label near the top of the column, with NO square around it, and
//   • ONE bordered cell in the column's bottom-right corner, 24.9 x 17.8 pt,
//     PRE-PRINTED with "0.0".
// A whole-page census at 300 dpi finds fourteen 15.1 x 12.5 pt checkboxes on the form
// and not one of them is in a trait row: twelve are page-1 header boxes (Blocks 5,
// 10-13, 16-19) and two are Block 49's statement-intent boxes. So the grade is a
// NUMERAL TYPED INTO A CELL, not an X in one of six columns, and the cell's pre-printed
// "0.0" has to be covered before the value is written (see lib/pdfBoxText.ts).
//
// ── How an unobserved trait is marked ────────────────────────────────────────
// "NOB" goes in the same cell, as text. The form itself demonstrates the convention:
// Block 41 (Individual promotion recommendation) is an identical bordered cell and
// 1616/27 pre-prints "NOB" inside it as that cell's default value, exactly as it
// pre-prints "0.0" in the grade cells and "0.00" in the average cells. A trait row
// offers no other writable target — the bold "NOB" beside the cell is a legend, not a
// box — so an unobserved trait is recorded by typing NOB where the numeral would go.
//
// ── Coordinates ─────────────────────────────────────────────────────────────
// Every constant below is MEASURED from public/chiefEvalBlank.pdf, not inherited from
// 1616/26. Method, re-runnable in a minute:
//   pdftotext -bbox-layout public/chiefEvalBlank.pdf   (label and default-value bboxes,
//     converted to pdf-lib's bottom-left origin as 792 - y)
//   pdftoppm -gray -r 300 public/chiefEvalBlank.pdf    (rule and box detection: scan for
//     rows/columns of dark pixels, then walk outward from a seed point to the enclosing
//     cell walls)
// tests/unit/chiefEvalTraitTable.test.ts re-asserts the trait cells and the header
// checkboxes against the same measurements by parsing the generated content stream.

import {
  PDFDocument,
  PDFFont,
  PDFPage,
  rgb,
  StandardFonts,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { Evaluation } from "@/types";
import {
  wrapTextToWidth,
  FIELD_FIT,
  getPrimaryDutiesFieldFit,
  getCommentCapacity,
} from "./commentFit";
import { computeTraitAverage } from "./traitAverage";
import { formatNavpersDate } from "./navyDate";
import { Box, coverBox, drawInBox } from "./pdfBoxText";

const BLACK = rgb(0, 0, 0);

// Inner edges of the form's outer rules, and the left origin for text set inside a
// full-width cell (2.5pt clear of the rule).
const FORM_LEFT = 31.7;
const FORM_RIGHT = 578.9;
const TEXT_X = 34.2;
const NARRATIVE_WIDTH = FORM_RIGHT - TEXT_X;

function dutyIndex(s: string): number | null {
  const u = (s || "").toUpperCase();
  if (u.includes("AT/AD") || u.startsWith("AT")) return 3;
  if (u.includes("INACT")) return 2;
  if (u.includes("TAR") || u.includes("FTS")) return 1;
  if (u.includes("ACT")) return 0;
  return null;
}

/**
 * A trait grade as 1616/27 prints it in the grade cell: one decimal ("4.0", matching
 * the pre-printed "0.0"), or the literal "NOB". Anything else renders nothing, which
 * leaves the form's own "0.0" showing — an ungraded trait, not a fabricated 0.0.
 */
export function formatTraitGrade(grade?: string): string | null {
  const v = (grade || "").trim();
  if (!v) return null;
  if (v.toUpperCase() === "NOB") return "NOB";
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n.toFixed(1) : null;
}

// Block 48 Summary Group Breakdown columns, left to right as the form prints them.
// There is no NOB column: 1616/27 breaks the group down over the five observed
// recommendations only.
const BREAKDOWN_COLS = [
  "Significant Problems",
  "Progressing",
  "Promotable",
  "Must Promote",
  "Early Promote",
];

// ─────────────────────────────────────────────────────────────────────────────
// Measured coordinate map — NAVPERS 1616/27 (REV 05-2025).
// Boxes are cell interiors {x0,y0,x1,y1}; *Cx/*Cy are checkbox centres; *_x with a
// *Baseline is a text origin.
// ─────────────────────────────────────────────────────────────────────────────
const C = {
  p1: {
    // Blocks 1-4, cell row y[746.6, 769.4]; labels occupy y[757.1, 766.0].
    name_x: 34.0,
    grade_x: 306.0,
    desig_x: 372.0,
    dodid_x: 472.5,
    identityBaseline: 749.5,

    // Block 5 — boxes sit BELOW their ACT/TAR/INACT/AT-ADOS labels on 1616/27.
    dutyCx: [51.5, 81.0, 109.8, 137.9],
    dutyCy: 731.3,

    // Blocks 6-9, cell row y[722.9, 746.4].
    uic_x: 183.0,
    ship_x: 234.0,
    promo_x: 429.5,
    datereported_x: 509.0,
    row69Baseline: 725.8,

    // Blocks 10-13 (Occasion for Report) — box to the RIGHT of each label.
    // Block 12 on 1616/27 is "Detachment of Reporting Senior", NOT the EVAL's
    // "Promotion/Frocking"; APEX has no field for it, so it is deliberately left
    // unmarked (see the p1 occasion section below).
    periodicCx: 132.8,
    detachIndCx: 208.4,
    detachRsCx: 298.4,
    specialCx: 356.0,
    occasionCy: 707.5,

    // Blocks 14-15, values set right of each label inside the Period of Report cell.
    from_x: 407.5,
    to_x: 505.5,
    periodBaseline: 701.5,

    // Blocks 16-19 (Type of Report). Block 19 "Ops Cdr" is 1616/27-only; APEX has no
    // field for it, so its box is left unmarked.
    notObservedCx: 100.4,
    regularCx: 174.6,
    concurrentCx: 243.7,
    typeCy: 683.0,

    // Blocks 20-21, cell row y[673.9, 697.4].
    pfa_x: 333.5,
    billet_x: 472.5,
    pfaBilletBaseline: 677.0,

    // Blocks 22-27, cell row y[648.7, 673.7].
    rsName_x: 34.0,
    rsGrade_x: 184.5,
    rsDesig_x: 234.8,
    rsTitle_x: 286.0,
    rsUic_x: 417.8,
    rsDodid_x: 472.5,
    rsBaseline: 651.8,

    // Block 28 — cell y[601.2, 648.5], label bottom 638.7. 3 lines at ~11.6pt lead.
    b28_x: TEXT_X,
    b28_topBaseline: 632.0,
    b28_lines: FIELD_FIT.command_achievements.maxLines,
    b28_cpl: FIELD_FIT.command_achievements.charsPerLine,

    // Block 29 — the 29A abbreviation box is x[32.4, 149.0] y[578.2, 590.6] and shares
    // its printed line with the first line of the 29B narrative, which resumes to its
    // right and then wraps to the full width down to the cell bottom at 539.5.
    b29b_x: TEXT_X,
    b29_firstBaseline: 581.5,
    b29b_lines: getPrimaryDutiesFieldFit("CHIEFEVAL").maxLines,
    b29b_cpl: getPrimaryDutiesFieldFit("CHIEFEVAL").charsPerLine,
    b29_abbrevSize: 9.5,
    b29b_contX: TEXT_X,

    // Blocks 30-31, cell row y[517.0, 539.0].
    dateCounseled_x: 213.2,
    counselor_x: 291.7,
    counselor_width: 132.0,
    counselBaseline: 520.0,

    // Blocks 33-36 grade cells — COMPETENCY 33-34, CHARACTER 35-36.
    traitCell: {
      technical_mastery: { x0: 233.8, y0: 380.9, x1: 258.7, y1: 398.6 }, // 33
      institutional_expertise: { x0: 233.8, y0: 270.0, x1: 258.7, y1: 287.8 }, // 34
      professionalism: { x0: 233.8, y0: 159.1, x1: 258.7, y1: 176.9 }, // 35
      integrity: { x0: 233.8, y0: 46.8, x1: 258.7, y1: 64.6 }, // 36
    } as Record<string, Box>,
  },

  p2: {
    // Blocks 1-4 repeat identically on page 2.
    name_x: 34.0,
    grade_x: 306.0,
    desig_x: 372.0,
    dodid_x: 472.5,
    identityBaseline: 749.5,

    // Blocks 37-39 grade cells — CHARACTER 37, CULTURE 38-39.
    traitCell: {
      accountability: { x0: 233.8, y0: 611.3, x1: 258.7, y1: 629.0 }, // 37 — 3.0 gate
      deckplate_leadership: { x0: 233.8, y0: 500.4, x1: 258.7, y1: 518.2 }, // 38
      team_effectiveness: { x0: 233.8, y0: 389.5, x1: 258.7, y1: 407.3 }, // 39
    } as Record<string, Box>,

    // Block 40 REPORTING SENIOR COMMENTS — clear interior y[277.56, 380.64] and the
    // printed label's lowest ink at 371.64, both re-measured off chiefEvalBlank.pdf at
    // 600 dpi. Drawing mixed-case Courier from this baseline inks 8 lines at 10-pitch
    // into y[278.88, 369.72] — 1.32 pt clear of the floor — while a 9th reaches 270.00,
    // 7.56 pt outside the box.
    //
    // b40_lines10 / b40_lines12 lived here because #34 could clamp rendering but not
    // fix validation, which still promised 18 for every form. That is done now:
    // getCommentCapacity is the single source and returns exactly the 8 / 7 this file
    // measured, so the renderer and the measuring canvas can no longer disagree.
    b40_x: TEXT_X,
    b40_topBaseline: 363.0,

    // Block 41 Individual — one bordered cell, pre-printed "NOB", value set left.
    b41_cell: { x0: 92.6, y0: 239.0, x1: 211.2, y1: 253.2 } as Box,

    // Blocks 43/45 averages — pre-printed "0.00".
    b43_memberTraitCell: { x0: 236.9, y0: 222.5, x1: 273.6, y1: 244.3 } as Box,
    b45_groupSummaryCell: { x0: 364.3, y0: 223.2, x1: 393.8, y1: 235.7 } as Box,

    // Cells APEX holds no value for. Their pre-printed defaults are BLANKED, not left
    // standing: Block 44 (RSCA, "0.00") sits in the AVERAGES panel between two averages
    // APEX does compute, and Block 42 ("0 of 0") is the Sailor's hard-breakout ranking.
    // Neither figure exists anywhere in APEX, and both read as real to a board.
    b44_rscaCell: { x0: 364.3, y0: 241.2, x1: 393.8, y1: 253.7 } as Box,
    b42_rankCell: { x0: 108.7, y0: 223.2, x1: 138.2, y1: 235.7 } as Box,
    b42_ofCell: { x0: 177.1, y0: 223.2, x1: 206.6, y1: 235.7 } as Box,

    // Blocks 46-47 Career Milestone Recommendations — one line each, right of the
    // wrapped "46. First / Recommendation" label which ends at x 444.3.
    rec_x: 447.0,
    rec1Baseline: 243.3,
    rec2Baseline: 225.3,
    rec_width: 126.0,

    // Block 48 Summary Group Breakdown — five empty cells, y[190.8, 205.4].
    b48_cells: [
      { x0: 141.8, y0: 190.8, x1: 171.4, y1: 205.4 },
      { x0: 199.4, y0: 190.8, x1: 229.0, y1: 205.4 },
      { x0: 249.8, y0: 190.8, x1: 279.4, y1: 205.4 },
      { x0: 301.7, y0: 190.8, x1: 331.2, y1: 205.4 },
      { x0: 355.0, y0: 190.8, x1: 384.5, y1: 205.4 },
    ] as Box[],

    // Block 49 statement intent — box to the right of each phrase.
    intendCx: 255.2,
    doNotIntendCx: 334.4,
    memberStmtCy: 168.2,

    // Signature dates. 1616/27 prints three: Block 49 (member), Block 50 (reporting
    // senior) and Block 52 (regular RS on a concurrent report). There is no senior
    // rater block on this form, so bv.senior_rater_signature_date has no home here.
    b49_dateCell: { x0: 518.2, y0: 156.2, x1: 575.5, y1: 174.0 } as Box,
    b50_dateCell: { x0: 302.2, y0: 113.8, x1: 370.3, y1: 131.5 } as Box,
    b52_dateCell: { x0: 302.2, y0: 50.4, x1: 370.3, y1: 68.2 } as Box,

    // Block 51 Reporting Senior Address — cell x[373.4, 579.1], label bottom 144.8,
    // "Phone:" top 90.0.
    rsAddr_x: 376.5,
    rsAddr_topBaseline: 138.0,
    rsAddr_lines: FIELD_FIT.reporting_senior_address.maxLines,
    rsAddr_cpl: FIELD_FIT.reporting_senior_address.charsPerLine,
    rsAddr_width: 203.0,
  },
};

/**
 * Trait keys this overlay has grade-cell coordinates for, derived from the coordinate
 * map itself (page 1 then page 2, in block order). Pinned against
 * CHIEFEVAL_TRAIT_KEYS in tests so a future trait rename cannot silently stop
 * stamping grades onto the PDF.
 */
export const OVERLAY_TRAIT_KEYS: readonly string[] = Object.freeze([
  ...Object.keys(C.p1.traitCell),
  ...Object.keys(C.p2.traitCell),
]);

/** The measured grade cell for a trait, or undefined if the map has none. */
export function traitGradeCell(
  key: string,
): { page: 1 | 2; box: Box } | undefined {
  if (C.p1.traitCell[key]) return { page: 1, box: C.p1.traitCell[key] };
  if (C.p2.traitCell[key]) return { page: 2, box: C.p2.traitCell[key] };
  return undefined;
}

export async function generateChiefEvalOverlayPdf(
  evaluation: Evaluation,
  templateBuffer: Uint8Array,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(templateBuffer);
  pdf.registerFontkit(fontkit);

  const fontPath = path.join(process.cwd(), "public", "fonts", "Courier.ttf");
  let courier: PDFFont;
  if (fs.existsSync(fontPath)) {
    const fontBytes = fs.readFileSync(fontPath);
    courier = await pdf.embedFont(fontBytes);
  } else {
    courier = await pdf.embedFont(StandardFonts.Courier);
  }

  const pages = pdf.getPages();
  const page1 = pages[0];
  const page2 = pages.length > 1 ? pages[1] : pages[0];
  const bv = evaluation.block_values || {};
  const tg = (evaluation.trait_grades || {}) as Record<string, string | undefined>;

  // An "X" centred on a measured 15.1 x 12.5 pt checkbox. Courier's cap height is
  // 0.583 em, so centring the cap box puts the glyph in the middle of the square.
  const MARK_SIZE = 11;
  const mark = (pg: PDFPage, cx: number, cy: number) => {
    pg.drawText("X", {
      x: cx - courier.widthOfTextAtSize("X", MARK_SIZE) / 2,
      y: cy - (MARK_SIZE * 0.583) / 2,
      size: MARK_SIZE,
      font: courier,
      color: BLACK,
    });
  };

  const text = (
    pg: PDFPage,
    str: string | undefined | null,
    x: number,
    y: number,
    size = 10,
    font: PDFFont = courier,
    maxWidth?: number,
  ) => {
    const v = (str || "").trim();
    if (!v) return;
    let s = size;
    if (maxWidth && maxWidth > 0) {
      const w = font.widthOfTextAtSize(v, s);
      if (w > maxWidth) {
        s = Math.max(6, Math.floor(((s * maxWidth) / w) * 10) / 10);
      }
    }
    pg.drawText(v, { x, y, size: s, font, color: BLACK });
  };

  const narrative = (
    pg: PDFPage,
    str: string | undefined | null,
    x: number,
    topBaseline: number,
    cpl: number,
    maxLines: number,
    boxWidth = NARRATIVE_WIDTH,
  ) => {
    const v = (str || "").trim();
    if (!v) return;
    const size = Math.max(5, Math.min(12, (boxWidth - 4) / ((cpl + 0.5) * 0.6)));
    const lh = size * 1.18;
    const lines = wrapTextToWidth(v, cpl).slice(0, maxLines);
    lines.forEach((ln, i) =>
      pg.drawText(ln, {
        x,
        y: topBaseline - i * lh,
        size,
        font: courier,
        color: BLACK,
      }),
    );
  };

  const narrativeWithLead = (
    pg: PDFPage,
    lead: string | undefined | null,
    body: string | undefined | null,
    x: number,
    topBaseline: number,
    cpl: number,
    maxLines: number,
    leadSize: number,
    leadChars: number,
    contX = x,
    boxWidth = NARRATIVE_WIDTH,
  ) => {
    const leadStr = (lead || "").toUpperCase().trim();
    if (!leadStr && !body) return;
    const size = Math.max(5, Math.min(12, (boxWidth - 4) / ((cpl + 0.5) * 0.6)));
    const lh = size * 1.18;
    if (leadStr)
      pg.drawText(leadStr, { x, y: topBaseline, size: leadSize, font: courier, color: BLACK });
    if (!body) return;
    const padded = " ".repeat(Math.max(0, leadChars)) + body;
    const lines = wrapTextToWidth(padded, cpl).slice(0, maxLines);
    lines.forEach((ln, i) =>
      pg.drawText(ln, {
        x: i === 0 ? x : contX,
        y: topBaseline - i * lh,
        size,
        font: courier,
        color: BLACK,
      }),
    );
  };

  const up = (s?: string) => (s || "").toUpperCase();

  // ───────────────── PAGE 1 ─────────────────
  const p1 = C.p1;
  for (const [pg, P] of [[page1, C.p1], [page2, C.p2]] as [PDFPage, typeof C.p1 | typeof C.p2][]) {
    text(pg, up(evaluation.member_name), P.name_x, P.identityBaseline);
    text(pg, up(evaluation.grade_rate), P.grade_x, P.identityBaseline);
    text(pg, up(evaluation.designator), P.desig_x, P.identityBaseline);
    text(pg, evaluation.dod_id, P.dodid_x, P.identityBaseline);
  }

  const di = dutyIndex(evaluation.duty_status || "");
  if (di != null) mark(page1, p1.dutyCx[di], p1.dutyCy);

  text(page1, evaluation.uic, p1.uic_x, p1.row69Baseline);
  text(page1, up(evaluation.ship_station), p1.ship_x, p1.row69Baseline);
  text(page1, up(evaluation.promotion_status), p1.promo_x, p1.row69Baseline);
  text(page1, formatNavpersDate(bv.date_reported), p1.datereported_x, p1.row69Baseline);

  if (bv.periodic) mark(page1, p1.periodicCx, p1.occasionCy);
  if (bv.detachment_individual) mark(page1, p1.detachIndCx, p1.occasionCy);
  if (bv.special) mark(page1, p1.specialCx, p1.occasionCy);
  // Block 12 (p1.detachRsCx) is intentionally not stamped. The only APEX key for this
  // slot is bv.promotion_frocking, which the UI labels "12: Promotion/Frocking" — that
  // is EVAL 1616/26's block 12. 1616/27 prints "Detachment of Reporting Senior" here,
  // so marking it would put an occasion on the record the rater never selected. Needs a
  // per-report-type occasion label in components/blocks/Block1Name.tsx first.

  text(page1, formatNavpersDate(evaluation.period_from), p1.from_x, p1.periodBaseline);
  text(page1, formatNavpersDate(evaluation.period_to), p1.to_x, p1.periodBaseline);

  if (bv.not_observed) mark(page1, p1.notObservedCx, p1.typeCy);
  if (bv.regular_report) mark(page1, p1.regularCx, p1.typeCy);
  if (bv.concurrent_report) mark(page1, p1.concurrentCx, p1.typeCy);

  text(page1, up(bv.physical_readiness), p1.pfa_x, p1.pfaBilletBaseline);
  text(page1, up(bv.billet_subcategory), p1.billet_x, p1.pfaBilletBaseline);

  text(page1, up(bv.reporting_senior_name), p1.rsName_x, p1.rsBaseline);
  text(page1, up(bv.reporting_senior_grade), p1.rsGrade_x, p1.rsBaseline);
  text(page1, up(bv.reporting_senior_designator), p1.rsDesig_x, p1.rsBaseline);
  text(page1, up(bv.reporting_senior_title), p1.rsTitle_x, p1.rsBaseline);
  text(page1, bv.reporting_senior_uic, p1.rsUic_x, p1.rsBaseline);
  text(page1, bv.reporting_senior_dod_id, p1.rsDodid_x, p1.rsBaseline);

  narrative(page1, bv.command_achievements, p1.b28_x, p1.b28_topBaseline, p1.b28_cpl, p1.b28_lines);

  narrativeWithLead(
    page1,
    bv.primary_duty_abbrev,
    bv.primary_duties,
    p1.b29b_x,
    p1.b29_firstBaseline,
    p1.b29b_cpl,
    p1.b29b_lines,
    p1.b29_abbrevSize,
    FIELD_FIT.primary_duties.firstLineLead ?? 0,
    p1.b29b_contX,
  );

  text(page1, formatNavpersDate(bv.date_counseled), p1.dateCounseled_x, p1.counselBaseline);
  text(page1, up(bv.counselor), p1.counselor_x, p1.counselBaseline, 10, courier, p1.counselor_width);

  // ───────────────── TRAIT GRADES, Blocks 33-39 ─────────────────
  // The numeral (or NOB) goes INSIDE the row's one bordered grade cell, over the "0.0"
  // the blank pre-prints there.
  const GRADE_SIZE = 11;
  for (const key of OVERLAY_TRAIT_KEYS) {
    const cell = traitGradeCell(key);
    if (!cell) continue;
    drawInBox(
      cell.page === 1 ? page1 : page2,
      formatTraitGrade(tg[key]),
      cell.box,
      courier,
      { size: GRADE_SIZE },
    );
  }

  // ───────────────── PAGE 2 ─────────────────
  const p2 = C.p2;

  // Blank the cells APEX has no figure for, so the form's defaults cannot be read as
  // computed values. Unconditional: no APEX field feeds either block.
  coverBox(page2, p2.b44_rscaCell);
  coverBox(page2, p2.b42_rankCell);
  coverBox(page2, p2.b42_ofCell);

  // Block 43 — the member's trait average, over the pre-printed 0.00.
  const indivAvg = computeTraitAverage(evaluation.trait_grades).average;
  drawInBox(
    page2,
    indivAvg != null ? indivAvg.toFixed(2) : null,
    p2.b43_memberTraitCell,
    courier,
    { size: 11 },
  );

  // Block 40 — reporting senior comments. Qualifications and achievements go here too;
  // 1616/27 has no separate block for them (migration 010).
  const pitch = (bv.comment_pitch || "10") as "10" | "12";
  narrative(
    page2,
    evaluation.comments,
    p2.b40_x,
    p2.b40_topBaseline,
    pitch === "10" ? 90 : 84,
    getCommentCapacity(evaluation.report_type, pitch),
  );

  // Block 41 — individual promotion recommendation, over the pre-printed "NOB".
  drawInBox(
    page2,
    up(evaluation.promotion_recommendation),
    p2.b41_cell,
    courier,
    { size: 10, align: "left" },
  );

  // Block 45 — summary group average, over the pre-printed 0.00.
  drawInBox(
    page2,
    evaluation.summary_group_average != null
      ? evaluation.summary_group_average.toFixed(2)
      : null,
    p2.b45_groupSummaryCell,
    courier,
    { size: 10 },
  );

  // Blocks 46-47 — Career Milestone Recommendations, one line each.
  const recs = evaluation.career_recommendations || [];
  text(page2, up(recs[0]), p2.rec_x, p2.rec1Baseline, 10, courier, p2.rec_width);
  text(page2, up(recs[1]), p2.rec_x, p2.rec2Baseline, 10, courier, p2.rec_width);

  // Block 48 — summary group breakdown. A NOB report is not part of a summary group,
  // so it gets no breakdown.
  if (evaluation.promotion_recommendation !== "NOB" && evaluation.summary_group_distribution) {
    const dist = evaluation.summary_group_distribution;
    BREAKDOWN_COLS.forEach((col, i) =>
      drawInBox(page2, String(dist[col] ?? 0), p2.b48_cells[i], courier, { size: 10 }),
    );
  }

  // NOTE: 1616/27 prints no Retention block at all. Retention is EVAL 1616/26 Block
  // 47; Block 47 on the CHIEFEVAL is the second Career Milestone Recommendation. (The
  // earlier note here cited "1610.10H Ch. 10" — chapter 10 is INACT Navy Reservist
  // reports; the block-by-block guide is Encl (2) ch. 1.)

  // Block 51 — reporting senior address, above the printed Phone:/DSN: lines.
  narrative(
    page2,
    up(bv.reporting_senior_address),
    p2.rsAddr_x,
    p2.rsAddr_topBaseline,
    p2.rsAddr_cpl,
    p2.rsAddr_lines,
    p2.rsAddr_width,
  );

  // Block 49 — statement intent.
  const stmt = (bv.member_statement_intent || "").toUpperCase();
  if (stmt.includes("NOT")) mark(page2, p2.doNotIntendCx, p2.memberStmtCy);
  else if (stmt.includes("INTEND")) mark(page2, p2.intendCx, p2.memberStmtCy);

  // Signature dates — Blocks 49, 50 and 52, in the form's own YYMMMDD notation.
  drawInBox(page2, formatNavpersDate(bv.member_signature_date), p2.b49_dateCell, courier, { size: 10 });
  drawInBox(page2, formatNavpersDate(bv.reporting_senior_signature_date), p2.b50_dateCell, courier, { size: 10 });
  drawInBox(page2, formatNavpersDate(bv.concurrent_rs_signature_date), p2.b52_dateCell, courier, { size: 10 });

  return await pdf.save();
}
