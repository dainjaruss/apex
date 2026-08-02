// lib/fitrepOverlay.ts
//
// High-fidelity PDF generation by OVERLAYING our data onto the official
// NAVPERS 1610/2 (FITREP, REV 05-2025) blank.
//
// Maps the Officer trait layout — the SEVEN traits printed at Blocks 33-39, five on
// page 1 and two on page 2. 1610/2 has no retention block at all (that is EVAL Block 47);
// on this form Block 47 is "Typed name, grade, command, UIC, and signature of Regular
// Reporting Senior on Concurrent Report".
//
// ponytail: measured against public/fitrepBlank.pdf so far — the trait grid
// (GRADE_COLS_P1/P2 and both `traitCy` maps), Block 41's box (#41), and, here, the
// HORIZONTAL axis of Blocks 28/29 plus both axes of Block 40. Every other coordinate in
// `C` is still inherited from NAVPERS 1616/26 and UNVERIFIED; the note beside b43_x lists
// the ones known to print outside a rule.
//
// Root cause, for whoever picks this up: lib/pdfOverlay.ts (EVAL) wraps its page draw in a
// rigid translate (OFFSET_P1 = {dx: 13, dy: -11}), so its constants are expressed in
// PRE-translate space. This file and lib/chiefEvalOverlay.ts inherited those constants
// and dropped the calibration that made them correct. Rendering a
// fully populated report shows the damage: identity row over its own labels, comments over
// the Block 41 header, promotion-recommendation X in the wrong column, trait average
// printed inside Block 39's descriptor instead of the "Member Trait Average" field
// (measured at 133.7, 100.5 — the constants say 528.0, 538.5), signature dates below
// Block 47. 1610/2 also numbers its non-trait blocks differently from the EVAL this was
// copied from: comments are Block 41, not 43, and Block 44 is the Reporting Senior
// Address, not Qualifications.
//
// Upgrade path, page 1: 1610/2 page 1 is 1616/26 page 1 rigidly shifted by (+1.9, +10.8)
// pt (verified on five independent landmark clusters), so delete the invented page-1
// constants, reuse pdfOverlay's proven ones, and apply that shift. Page 2 genuinely
// differs and needs its ~15 fields measured the way the grid was (300 dpi raster scan for
// box/rule positions). Where a value lands on a placeholder the blank pre-prints ("0.00"
// in both average fields, an "X" in Block 42 NOB), the decided approach is: draw a white
// rectangle, then the text — reversible, never edits the official blank, and keeps the
// artifact byte-diffable against public/fitrepBlank.pdf.
//
// This file draws in PAGE COORDINATES and applies no transform of any kind. It used to
// import pushGraphicsState/translate from pdf-lib and call neither, and two separate
// rounds of this epic then explained a real misplacement away as "absorbed by the page
// translate". The imports are gone so the question cannot be asked again: every constant
// below is the number that reaches the page.
//

import { PDFDocument, PDFFont, PDFPage, rgb } from "pdf-lib";
import { Evaluation } from "@/types";
import {
  wrapTextToWidth,
  FIELD_FIT,
  getPrimaryDutiesFieldFit,
  getCommentCapacity,
  COMMENT_PITCH,
  resolveCommentPitch,
} from "./commentFit";
import { computeTraitAverage } from "./traitAverage";
import { formatNavpersDate } from "./navyDate";
import { embedNarrativeFont } from "./pdfBoxText";

const BLACK = rgb(0, 0, 0);

// Side rules of NAVPERS 1610/2, INNER INK EDGES, measured off public/fitrepBlank.pdf by
// rasterising each page at 600 dpi and scanning for columns dark on >90% of the rows in
// each block's y band. Every rule on the form strokes exactly 0.72 pt. Re-measured at
// 2400 dpi, where the same edges read 32.630 / 579.830 / 31.640 / 578.870 — agreement to
// within one 600 dpi pixel (0.12 pt), which is the quantisation, not a disagreement.
//
// THE TWO PAGES DO NOT SHARE A LEFT RULE. Page 1 sits 0.96 pt right of page 2. One
// FORM_LEFT for both is how four fields ended up in the margin: the constant that used to
// live here was 17.3, inherited from lib/pdfOverlay.ts (NAVPERS 1616/26, a different
// blank), and nothing in this file ever corrected it.
const P1_RULE_L = 32.64;
const P1_RULE_R = 579.84;
const P2_RULE_L = 31.68;
const P2_RULE_R = 578.88;

/**
 * Block 40's interior divider, inner ink edge of its right side — the left rule of the
 * empty cell the career recommendations go in. Measured the same way; 2400 dpi reads
 * 470.120.
 */
const B40_CELL_L = 470.16;

/** House inset off a printed rule, same value pdfOverlay/chiefEvalOverlay use. */
const INSET = 2.5;

/**
 * Clear interior of a full-width block. Both pages measure the SAME 547.200 — as do all
 * three comment blocks across the three blanks (see tests/unit/commentCapacity.test.ts),
 * which is what makes one CPL table serve every form.
 */
const CLEAR_INTERIOR = P1_RULE_R - P1_RULE_L;

function dutyIndex(s: string): number | null {
  const u = (s || "").toUpperCase();
  if (u.includes("AT/AD") || u.startsWith("AT")) return 3;
  if (u.includes("INACT")) return 2;
  if (u.includes("TAR") || u.includes("FTS")) return 1;
  if (u.includes("ACT")) return 0;
  return null;
}

function gradeIndex(grade?: string): number | null {
  if (!grade) return null;
  if (grade.toUpperCase() === "NOB") return 0;
  const n = parseInt(grade, 10);
  return n >= 1 && n <= 5 ? n : null;
}

const REC_COLS = [
  "NOB",
  "Significant Problems",
  "Progressing",
  "Promotable",
  "Must Promote",
  "Early Promote",
];

function recIndex(r?: string): number | null {
  const i = REC_COLS.indexOf(r || "");
  return i >= 0 ? i : null;
}

// Trait-grid geometry below is MEASURED from public/fitrepBlank.pdf, not carried over
// from the EVAL/CHIEFEVAL template — 1610/2 has its own grid and the inherited numbers
// missed every checkbox on the form (see tests/unit/fitrepTraitTable.test.ts).
//
// Method: render the blank at 300 dpi greyscale and locate the checkbox borders — the
// six boxes per row are 14.4 pt squares whose right edge sits on each grade column's
// rule; row centres come from the checkbox band, which is also where the row's NOB
// label prints. Both are re-derivable from the form at any time.
const C = {
  // [NOB, 1.0, 2.0, 3.0, 4.0, 5.0] checkbox centres.
  GRADE_COLS_P1: [95.5, 224.4, 260.4, 396.5, 433.2, 570.7],
  GRADE_COLS_P2: [94.6, 223.4, 259.4, 396.2, 432.2, 569.8],

  p1: {
    name_x: 23.5,
    grade_x: 279.0,
    desig_x: 355.0,
    dodid_x: 452.0,
    identityBaseline: 755.3,

    dutyCx: [31.5, 107.5, 187.0, 248.5],
    dutyCy: 721.2,

    uic_x: 337.5,
    ship_x: 382.0,
    promo_x: 524.5,
    datereported_x: 546.5,
    row69Baseline: 721.5,

    periodicCx: 31.5,
    detachIndCx: 107.5,
    promoFrockCx: 226.5,
    specialCx: 326.5,
    occasionCy: 686.0,

    from_x: 440.0,
    to_x: 512.0,
    periodBaseline: 686.0,

    notObservedCx: 31.5,
    regularCx: 107.5,
    concurrentCx: 187.0,
    notObservedCy: 650.0,
    regularCy: 650.0,
    concurrentCy: 650.0,

    pfa_x: 325.0,
    billet_x: 388.0,
    pfaBilletBaseline: 651.0,

    rsName_x: 23.5,
    rsGrade_x: 212.0,
    rsDesig_x: 268.0,
    rsTitle_x: 343.0,
    rsUic_x: 432.0,
    rsDodid_x: 488.0,
    rsBaseline: 616.0,

    // Blocks 28 and 29 are both full-width panels bounded by the page-1 side rules, so
    // both start one house inset off P1_RULE_L. They were FORM_LEFT (17.3): 15.34 pt
    // LEFT of the rule, i.e. out in the page margin, on every line of both blocks.
    //
    // Only the HORIZONTAL axis of these two is fixed here; their baselines are still the
    // inherited 1616/26 values and are still wrong — see the note in p2 below.
    b28_x: P1_RULE_L + INSET,
    b28_topBaseline: 574.0,
    b28_lines: 4,
    b28_cpl: 91,

    // b29b_contX is gone: it was a third FORM_LEFT site, always equal to b29b_x, and
    // `narrativeWithLead` already defaults contX to x.
    b29b_x: P1_RULE_L + INSET,
    b29_firstBaseline: 486.0,
    b29b_lines: getPrimaryDutiesFieldFit("FITREP").maxLines,
    b29b_cpl: getPrimaryDutiesFieldFit("FITREP").charsPerLine,
    b29_abbrevSize: 9.5,

    dateCounseled_x: 23.5,
    counselor_x: 88.0,
    counselor_width: 145.0,
    counselBaseline: 400.0,

    // Blocks 33-37 (page 1 of the trait grid).
    traitCy: {
      knowledge: 392.75, // 33 PROFESSIONAL EXPERTISE
      eo: 309.25, // 34 COMMAND OR ORGANIZATIONAL CLIMATE
      bearing: 224.3, // 35 MILITARY BEARING/CHARACTER
      teamwork: 140.05, // 36 TEAMWORK
      accomplishment: 56.5, // 37 MISSION ACCOMPLISHMENT AND INITIATIVE
    } as Record<string, number>,
  },

  p2: {
    name_x: 23.5,
    grade_x: 279.0,
    desig_x: 355.0,
    dodid_x: 452.0,
    identityBaseline: 755.3,

    // Blocks 38-39 (page 2 of the trait grid).
    traitCy: {
      leadership: 609.5, // 38 LEADERSHIP
      tactical_performance: 513.7, // 39 TACTICAL PERFORMANCE (warfare qualified only)
    } as Record<string, number>,

    traitAvg_x: 528.0,
    traitAvg_y: 538.5,

    // Block 40, the career-milestone recommendations ("maximum of two"). NOT Blocks
    // 46/47 — on 1610/2 those are the member's signature and the concurrent-report
    // reporting senior; the recommendation block is 40, printed at y 492.91 on the blank.
    //
    // Block 40 is one row split by a rule at x[469.440, 470.160] into a wide left cell
    // carrying the form's own three lines of instruction text (its ink fills y[477.84,
    // 500.16], leaving 8.04 pt of clear height — under one 12 pt line) and an EMPTY right
    // cell x[470.160, 578.880] y[469.800, 505.080] holding ZERO form ink at 600 dpi. That
    // cell is where the two entries go; it is the only place on the block they fit.
    //
    // Both entries used to draw at y 512.0 — 6.92 pt ABOVE the block, inside the Block 39
    // TACTICAL PERFORMANCE grid row — and rec1 at x 17.30, out in the page margin. So
    // this pair needs both axes, not just the x the margin defect names: x = the cell's
    // own rule + inset, and one line each stacked inside the cell.
    //
    // Sizing is unchanged and still runs through the Math.min(12, …) clamp: passing the
    // cell's REAL width (108.72) with the 14 characters it really holds solves 12.0368
    // and clamps to 12.0000, exactly as cpl 10 in a notional 80 pt box did. Deleting the
    // clamp still moves the output, so tests/unit/commentCapacity.test.ts keeps its grip
    // on this file's own copy of it.
    //
    // ponytail: 14 chars/entry is the cell at 12 pt; APEX and NAVFIT both allow 20, so a
    // longer entry still loses its tail at the wrap. Fixing that means dropping below
    // 12 pt (20 chars needs 8.65), which is a capacity question for the block, not a
    // geometry one — take it with Blocks 28/29 below.
    rec_x: B40_CELL_L + INSET,
    rec_cellWidth: P2_RULE_R - B40_CELL_L,
    rec_cpl: 14,
    // Two 12 pt lines centred in the cell: ink top 499.89 against a 505.080 ceiling,
    // ink floor 474.998 against a 469.800 floor — 5.19 / 5.20 pt clear, well past INSET.
    rec1_y: 491.6,
    rec2_y: 477.4,

    // Block 41 comments (1610/2 numbers this block 41, not 43 — the name is legacy).
    // Clear interior y[226.44, 469.20], printed header ink floor 451.44, printed side
    // rules x[31.680, 578.880] — all measured off fitrepBlank.pdf page 2 at 600 dpi.
    // Holds getCommentCapacity("FITREP", pitch) lines — 16 at 10-pitch, 19 at 12.
    //
    // b43_x was FORM_LEFT (17.3), which put every character of Block 41 **14.38 pt LEFT
    // of the block's own left rule**, i.e. out in the page margin — confirmed by reading
    // x back off a generated PDF (x=17.30 against a rule whose inner ink edge is 31.68).
    // FORM_LEFT was a pdfOverlay constant calibrated against a DIFFERENT blank, and
    // nothing in this file corrected it. 34.2 is the left rule + this repo's 2.5 pt
    // inset, matching chiefEvalOverlay against the identically-placed rule on 1616/27.
    //
    // Both pitches are fixed point sizes (COMMENT_PITCH) and their legal first-baseline
    // windows overlap, so one constant serves both:
    //   12-pitch = 10 pt, 19 lines: [440.842, 444.531]
    //   10-pitch = 12 pt, 16 lines: [441.243, 443.149]
    //   overlap [441.243, 443.149] -> 442.20, the midpoint.
    // Line 20 at 12-pitch would need 452.642 and line 17 at 10-pitch 455.403, both above
    // the header. The previous 443.9 sat above the 10-pitch window entirely and had to
    // move. Fixing the size also RELIEVED the binding case #36 documented here: the legal
    // window at a solved 10.7278 pt was 0.241 pt wide, and at a fixed 10 pt it is 3.689.
    //
    // Every remaining FORM_LEFT site is now measured against its own rule; the constant
    // itself is gone. What is NOT fixed, measured off the blank rather than assumed:
    //
    //   VERTICAL, blocks 28/29. Both draw one whole block low. Block 28's box is
    //   y[601.560, 648.360], its only printed ink the header at y[637.680, 644.880], and
    //   it draws 4 lines from 574.0 — inside Block 29's box and through the rule at
    //   539.640 beneath it. Block 29's box is y[539.640, 600.840], printed ink y[577.800,
    //   597.360], and it draws from 486.0, over the Block 33 trait descriptors.
    //
    //   Neither is a constant swap, because the line counts are unsettled too. At the
    //   solved 9.894 pt, 4 lines need 43.85 pt of ink height and 3 need 32.17; Block 28
    //   has 36.12 pt clear below its header and this file hardcodes 4 while
    //   FIELD_FIT.command_achievements says 3. Block 29 has 38.16 pt clear below the
    //   abbreviation box — 4 lines only fit if the first sits BESIDE that box, which is
    //   a layout decision, not a measurement. Settling it is #36's per-form capacity
    //   derivation, never done for 28/29, and it has to move FIELD_FIT, the validator,
    //   the coach budget and the brag-sheet budget together, or the editor will promise
    //   lines the PDF silently drops.
    //
    //   Block 29's abbreviation has its own printed box, x[40.520, 155.720] y[578.520,
    //   590.040], on its own line under the header. This file still draws the
    //   abbreviation inline as a 20-space lead on the duties' first line, the 1616/26
    //   layout, so it lands nowhere near that box.
    //
    //   OTHER FIELDS OUTSIDE A RULE, none of which came from FORM_LEFT (x, then what is
    //   wrong): identity + reporting-senior rows and Block 30 date at 23.5, page 1, 9.14
    //   pt into the margin; the Block 5/10/16 X marks at 28.10 (cx 31.5 − 3.4), 4.54 pt
    //   into the margin; Block 9 date reported ends at 588.47 against a 579.840 right
    //   rule; date49 at 25.0 on page 2, 6.68 into the margin; and the whole signature-date
    //   row at y 47.0, whose ink floor is 45.00 under a bottom rule inked [46.440,
    //   47.160] — printed off the form altogether. Same
    //   root cause as this fix — 1616/26 constants on a 1610/2 blank — but each needs its
    //   own cell measured, and several are wrong on both axes, so none is a constant swap.
    b43_x: P2_RULE_L + INSET,
    b43_topBaseline: 442.2,

    promoRecCx: [47.5, 126.5, 222.5, 313.5, 411.5, 511.5],
    promoRecCy: 142.5,
    promoSummaryCy: 119.0,

    rsAddr_x: 204.0,
    rsAddr_topBaseline: 82.0,
    rsAddr_lines: 3,
    rsAddr_cpl: 40,
    rsAddr_width: 215.0,

    doNotIntendCx: 433.2,
    intendCx: 494.5,
    memberStmtCy: 96.5,

    summaryAvg_x: 135.0,
    summaryAvg_y: 47.0,

    date49_x: 25.0,
    date49_y: 47.0,
    date50_x: 205.0,
    date50_y: 47.0,
    date51_x: 433.0,
    date51_y: 47.0,
    date52_x: 522.0,
    date52_y: 47.0,
  },
};

export async function generateFitrepOverlayPdf(
  evaluation: Evaluation,
  templateBuffer: Uint8Array,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(templateBuffer);
  const courier = await embedNarrativeFont(pdf);

  const pages = pdf.getPages();
  const page1 = pages[0];
  const page2 = pages.length > 1 ? pages[1] : pages[0];
  const bv = evaluation.block_values || {};
  const tg = (evaluation.trait_grades || {}) as Record<string, string | undefined>;

  const mark = (pg: PDFPage, cx: number, cy: number) => {
    const s = 11;
    pg.drawText("X", {
      x: cx - 3.4,
      y: cy - 3.8,
      size: s,
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
        s = Math.max(6, Math.floor((s * maxWidth) / w * 10) / 10);
      }
    }
    pg.drawText(v, { x, y, size: s, font, color: BLACK });
  };

  // `fixedSize` sets the point size outright — what the comment block passes, because
  // pitch constrains SIZE and lets CPL fall out of the box (see COMMENT_PITCH). Blocks
  // 28/29 still solve a size from their CPL target. The min(12, …) cap below is LIVE on
  // this form: the two Block 40 recommendations pass 14 chars in their measured 108.72 pt
  // cell, which solves to 12.0368 pt and is clamped to 12 — remove the cap and 12.0368
  // appears in the output.
  const narrative = (
    pg: PDFPage,
    str: string | undefined | null,
    x: number,
    topBaseline: number,
    cpl: number,
    maxLines: number,
    boxWidth = CLEAR_INTERIOR,
    fixedSize?: number,
  ) => {
    const v = (str || "").trim();
    if (!v) return;
    const size =
      fixedSize ??
      Math.max(5, Math.min(12, (boxWidth - 4) / ((cpl + 0.5) * 0.6)));
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
    boxWidth = CLEAR_INTERIOR,
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
  if (bv.promotion_frocking) mark(page1, p1.promoFrockCx, p1.occasionCy);
  if (bv.special) mark(page1, p1.specialCx, p1.occasionCy);

  text(page1, formatNavpersDate(evaluation.period_from), p1.from_x, p1.periodBaseline);
  text(page1, formatNavpersDate(evaluation.period_to), p1.to_x, p1.periodBaseline);

  if (bv.not_observed) mark(page1, p1.notObservedCx, p1.notObservedCy);
  if (bv.regular_report) mark(page1, p1.regularCx, p1.regularCy);
  if (bv.concurrent_report) mark(page1, p1.concurrentCx, p1.concurrentCy);

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
  );

  text(page1, formatNavpersDate(bv.date_counseled), p1.dateCounseled_x, p1.counselBaseline);
  text(page1, up(bv.counselor), p1.counselor_x, p1.counselBaseline, 12, courier, p1.counselor_width);

  // Officer trait grades, Blocks 33-37, on page 1
  const p1Trait = (key: string, grade?: string) => {
    const gi = gradeIndex(grade);
    if (gi != null && p1.traitCy[key] != null) mark(page1, C.GRADE_COLS_P1[gi], p1.traitCy[key]);
  };
  p1Trait("knowledge", tg.knowledge);
  p1Trait("eo", tg.eo);
  p1Trait("bearing", tg.bearing);
  p1Trait("teamwork", tg.teamwork);
  p1Trait("accomplishment", tg.accomplishment);

  // ───────────────── PAGE 2 ─────────────────
  const p2 = C.p2;
  const p2Trait = (key: string, grade?: string) => {
    const gi = gradeIndex(grade);
    if (gi != null && p2.traitCy[key] != null) mark(page2, C.GRADE_COLS_P2[gi], p2.traitCy[key]);
  };
  p2Trait("leadership", tg.leadership);
  p2Trait("tactical_performance", tg.tactical_performance);

  const indivAvg = computeTraitAverage(evaluation.trait_grades).average;
  text(page2, indivAvg != null ? indivAvg.toFixed(2) : "", p2.traitAvg_x, p2.traitAvg_y);

  // One line each, stacked in Block 40's empty cell — the cell holds exactly two 12 pt
  // lines, and "maximum of two" is what the block asks for.
  const recs = evaluation.career_recommendations || [];
  narrative(page2, up(recs[0]), p2.rec_x, p2.rec1_y, p2.rec_cpl, 1, p2.rec_cellWidth);
  narrative(page2, up(recs[1]), p2.rec_x, p2.rec2_y, p2.rec_cpl, 1, p2.rec_cellWidth);

  const pitch = resolveCommentPitch(bv);
  narrative(
    page2,
    evaluation.comments,
    p2.b43_x,
    p2.b43_topBaseline,
    COMMENT_PITCH[pitch].charsPerLine,
    getCommentCapacity(evaluation.report_type, pitch),
    undefined,
    COMMENT_PITCH[pitch].points,
  );

  // No qualifications field is drawn — 1610/2 has no Qualifications block. Block 44 on
  // this form is "Reporting Senior Address", a panel at x[399.600, 578.880] y[154.440,
  // 225.720]. `bv.qualifications` is EVAL-only (the brag sheet already omits it for a
  // FITREP) and it used to print at x 17.30, out in the page margin, beside the promotion
  // recommendation grid. Drawing nothing is the correct rendering of a block the form
  // does not have.

  const ri = recIndex(evaluation.promotion_recommendation);
  if (ri != null) mark(page2, p2.promoRecCx[ri], p2.promoRecCy);

  if (evaluation.promotion_recommendation !== "NOB" && evaluation.summary_group_distribution) {
    const dist = evaluation.summary_group_distribution;
    for (let i = 1; i < REC_COLS.length; i++) {
      const n = String(dist[REC_COLS[i]] ?? 0);
      const w = courier.widthOfTextAtSize(n, 11);
      text(page2, n, p2.promoRecCx[i] - w / 2, p2.promoSummaryCy, 11);
    }
  }

  // NOTE: no retention field is drawn — 1610/2 has no retention block. (Retention is
  // EVAL Block 47; 1610/2 Block 47 is the concurrent-report Reporting Senior block.)

  narrative(
    page2,
    up(bv.reporting_senior_address),
    p2.rsAddr_x,
    p2.rsAddr_topBaseline,
    p2.rsAddr_cpl,
    p2.rsAddr_lines,
    p2.rsAddr_width,
  );

  const stmt = (bv.member_statement_intent || "").toUpperCase();
  if (stmt.includes("NOT") || stmt.includes("DO NOT")) mark(page2, p2.doNotIntendCx, p2.memberStmtCy);
  else if (stmt.includes("INTEND")) mark(page2, p2.intendCx, p2.memberStmtCy);

  text(
    page2,
    evaluation.summary_group_average != null ? evaluation.summary_group_average.toFixed(2) : "",
    p2.summaryAvg_x,
    p2.summaryAvg_y,
  );

  text(page2, bv.senior_rater_signature_date, p2.date49_x, p2.date49_y);
  text(page2, bv.reporting_senior_signature_date, p2.date50_x, p2.date50_y);
  text(page2, bv.member_signature_date, p2.date51_x, p2.date51_y);
  text(page2, bv.concurrent_rs_signature_date, p2.date52_x, p2.date52_y);

  return await pdf.save();
}
