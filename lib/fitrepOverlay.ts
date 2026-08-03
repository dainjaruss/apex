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
// (GRADE_COLS_P1/P2 and both `traitCy` maps), Block 41's box (#41), both axes of Block 40,
// and both axes of Blocks 28/29 including the 29A abbreviation cell. Every other coordinate
// in `C` is still inherited from NAVPERS 1616/26 and UNVERIFIED; the note beside b43_x
// lists the ones known to print outside a rule.
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
// each block's y band. Every rule on the form strokes exactly 0.72 pt.
//
// Cross-checked against the PDF's own stroke operators with no rasteriser in the loop
// (`pdftocairo -svg`, centreline +/- half of a 0.96 stroke under the page's 0.75 matrix):
//   page 1   32.64125 / 579.83922      page 2   31.64125 / 578.83922
// The constants below are the 600 dpi reads, which sit 0.001-0.041 pt INSIDE the true
// edges — conservative, i.e. every inset assertion built on them is stricter than the
// form requires. Page separation is exactly 1.00000 pt and both interiors are 547.19797.
//
// THE TWO PAGES DO NOT SHARE A LEFT RULE. Page 1 sits exactly 1 pt right of page 2. One
// FORM_LEFT for both is how four fields ended up in the margin: the constant that used to
// live here was 17.3, inherited from lib/pdfOverlay.ts (NAVPERS 1616/26, a different
// blank), and nothing in this file ever corrected it.
const P1_RULE_L = 32.64;
const P1_RULE_R = 579.84;
const P2_RULE_L = 31.68;
const P2_RULE_R = 578.88;

/**
 * Block 40's interior divider, inner ink edge of its right side — the left rule of the
 * empty cell the career recommendations go in. Measured the same way; the stroke
 * operators put it at 470.12172.
 */
const B40_CELL_L = 470.16;

/** House inset off a printed rule, same value pdfOverlay/chiefEvalOverlay use. */
const INSET = 2.5;

/**
 * Clear interior of a full-width block. Both pages measure the SAME 547.200 (547.19797
 * by the stroke operators) — as do all three comment blocks across the three blanks (see
 * tests/unit/commentCapacity.test.ts), which is what makes one CPL table serve every
 * form. The inherited FORM_RIGHT - FORM_LEFT was 547.9: right by accident.
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

    // BLOCKS 22-27, the Reporting Senior identity row — cell y[649.080, 673.560]
    // between the rules at y[673.560, 674.280] and y[648.360, 649.080], split by
    // strokes at x[182.400, 183.120] / [232.800, 233.520] / [283.920, 284.640] /
    // [415.680, 416.400] / [470.400, 471.120]. Header labels floor at 662.880 in
    // the widest two columns and 664.440 in the rest.
    //
    // THIS ROW HAD TO MOVE WITH BLOCK 28, and finding out why is the reason this
    // section exists. `rsBaseline` was 616.0 — one whole cell low, INSIDE Block
    // 28's cell y[601.560, 648.360]. That was invisible while Block 28 itself
    // drew at 574.0, because both were displaced and neither was where the other
    // was. Correcting Block 28 to 628.87 put its second line at 617.195, 1.195 pt
    // from this row: rendered, the name, grade, designator, title, UIC and DoD ID
    // print straight through Block 28's narrative. Fixing one field into a cell
    // another field is squatting in is not a fix.
    //
    // The suite could not see it either. The Block 28/29 assertions filter drawn
    // runs to each block's probe alphabet, so a line overprinted by a DIFFERENT
    // drawText passes every one of them. The pin is below, and it compares the
    // two blocks' runs to each other rather than each to its box.
    //
    // At the 10 pt these fields draw, ink runs base - 2.002 to base + 6.909, so
    // the legal window is [649.080 + 2.002, 662.880 - 6.909] = [651.082, 655.971]
    // -> 653.53. (1616/27 places the same row at 651.8 in a cell measuring
    // y[648.7, 673.7], which is the same band; only 1610/2 had it wrong.)
    //
    // Every x is its own column's inner edge plus the house inset. The inherited
    // values were 23.5 / 212.0 / 268.0 / 343.0 / 432.0 / 488.0: the first sat
    // 9.14 pt out in the page margin (its own line in the frame ledger, now gone)
    // and the other five, while nominally inside their columns, started far
    // enough right to OVERFLOW them — "RADM" at 212.0 ends at 236.0, past the
    // stroke at 232.800 and into the designator cell.
    //
    // Each field also carries its column's usable WIDTH, which none of them did.
    // The x fix alone is not enough: "REPORTINGSENIORNAME, JOHN A" is 27
    // characters, 161.90 pt at the default 10 pt, and from 35.14 it ends at
    // 197.03 — 14.63 pt into the Grade cell. `text()` already shrinks to a
    // maxWidth (it is how `counselor` fits); these six just never passed one, so
    // a long but ordinary Navy name printed over the next block.
    rsName_x: 32.64 + INSET,
    rsGrade_x: 183.12 + INSET,
    rsDesig_x: 233.52 + INSET,
    rsTitle_x: 284.64 + INSET,
    rsUic_x: 416.4 + INSET,
    rsDodid_x: 471.12 + INSET,
    rsBaseline: 653.53,
    rsWidths: [
      182.4 - 32.64 - 2 * INSET,
      232.8 - 183.12 - 2 * INSET,
      283.92 - 233.52 - 2 * INSET,
      415.68 - 284.64 - 2 * INSET,
      470.4 - 416.4 - 2 * INSET,
      579.84 - 471.12 - 2 * INSET,
    ],

    // Blocks 28 and 29 are both full-width panels bounded by the page-1 side rules, so
    // both start one house inset off P1_RULE_L. They were FORM_LEFT (17.3): 15.34 pt
    // LEFT of the rule, i.e. out in the page margin, on every line of both blocks.
    //
    // Both baselines below are now DERIVED from the blank, by the same method the comment
    // blocks use (see getCommentCapacity): a line's ink runs from base - 0.2002*size to
    // base + 0.6909*size — the real outline extents of CourierPrime-Regular over printable
    // ASCII, not its declared metrics — and leading is 1.18*size. For N lines the legal
    // first baseline is [floor + 0.2002*s + (N-1)*1.18*s, ceiling - 0.6909*s]; the constant
    // is that window's midpoint, because centring is free.
    //
    // Both blocks solve s = (547.20 - 4) / (91.5 * 0.6) = 9.894353 from their CPL, so
    // 0.6909*s = 6.836009, 0.2002*s = 1.980849 and the leading is 11.675337.
    //
    // (The envelope and the leading are the comment blocks' model. The SIZE is
    // not: Block 41 takes a fixed point size from COMMENT_PITCH, while 28/29
    // still solve one from a CPL target in `narrative()`. Same envelope,
    // different origin for s.)
    b28_x: P1_RULE_L + INSET,

    // BLOCK 28 — cell y[601.560, 648.360] between the rules at y[648.360, 649.080] and
    // y[600.840, 601.560]; its only form ink is the header, x[35.160, 220.920]
    // y[637.680, 644.880]. So 36.12 pt of clear height, full width.
    //
    // THREE lines, which is what FIELD_FIT.command_achievements has always said and what
    // the editor and the validator have always enforced. This file hardcoded 4 — 43.85 pt
    // of ink against 36.12 pt of box — and drew them from 574.0, which is not in this
    // block at all: it is inside Block 29's cell and through the rule beneath it.
    //   window [626.892, 630.844] -> 628.87, giving 1.98 pt clear of the header and
    //   1.98 pt clear of the cell floor. A 4th line would need 638.567, 7.7 pt above
    //   the header's lowest ink.
    // Read the count off FIELD_FIT like the two sibling overlays do, so the drift that
    // let 4 and 3 coexist cannot come back.
    b28_topBaseline: 628.87,
    b28_lines: FIELD_FIT.command_achievements.maxLines,
    b28_cpl: FIELD_FIT.command_achievements.charsPerLine,

    // BLOCK 29 — cell y[539.640, 600.840]. Form ink: the header, and the 29A abbreviation
    // box whose strokes measure x[39.840, 40.560] / x[155.760, 156.480] and
    // y[577.800, 578.520] / y[590.040, 590.760], i.e. an interior of x[40.560, 155.760]
    // y[578.520, 590.040]. Right of the box the cell is clear from the header's floor
    // (590.160) down; below the box it is clear from 577.800 to the cell floor.
    //
    // That 38.16 pt of full-width clearance holds THREE lines, not four. The fourth is
    // real only because line 1 sits BESIDE the 29A box, which is the layout the 20-space
    // lead was always implying and the geometry never delivered — it used to draw from
    // 486.0, a whole block low, over the Block 33 trait descriptors.
    //   line 4's floor gives 576.647; line 2 clearing the 29A box floor gives 582.639;
    //   line 1 clearing the header gives 583.324 and is not binding.
    //   window [576.647, 582.639] -> 579.64: 3.00 pt clear at the 29A box floor, 3.00 pt
    //   at the cell floor, 3.69 pt under the header.
    //
    // b29b_contX is gone: it was a third FORM_LEFT site, always equal to b29b_x, and
    // `narrativeWithLead` already defaults contX to x.
    b29b_x: P1_RULE_L + INSET,
    b29_firstBaseline: 579.64,
    b29b_lines: getPrimaryDutiesFieldFit("FITREP").maxLines,
    b29b_cpl: getPrimaryDutiesFieldFit("FITREP").charsPerLine,

    // 29A, the duty abbreviation, drawn into its own printed box rather than as an inline
    // lead at the 29B origin. At the 29B origin it would start 4.7 pt LEFT of the box's
    // left stroke and run straight over it; and while its baseline could share line 1's,
    // 579.64 puts the envelope's floor 0.78 pt under the box. Its own cell is 11.52 pt
    // tall, so at 9.5 pt the legal window is [580.422, 583.476] -> 581.95.
    // Width is the interior less one inset each side, so an over-long legacy value shrinks
    // to fit the box instead of running out of it (the editor caps at
    // PRIMARY_DUTY_ABBREV_MAX; a direct DB write does not).
    // ponytail: KNOWN CEILING at ~30 characters. `text()`'s shrink-to-fit floors the point
    // size at 6, so past that the value overruns the box again — 40 characters by 33.7 pt.
    // The clamp is unreachable from validated input at all (all three zod schemas cap 29A
    // at PRIMARY_DUTY_ABBREV_MAX = 14, which is 79.75 pt against a 110.20 pt box, so it
    // first engages at 20), and the 6 pt floor is `text()`'s, shared with the other two
    // overlays. Upgrade path if a direct write ever produces one: clamp the string, not
    // the size — truncating an abbreviation is honest in a way a 6 pt smear is not.
    b29a_x: 40.56 + INSET,
    b29a_baseline: 581.95,
    b29a_width: 155.76 - 40.56 - 2 * INSET,
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
    // CPL is 20 because 20 is what the rest of APEX carries: CAREER_REC_MAX, the
    // editor's counter, the validator's only length rule, and NAVFIT's RecommendA/B
    // text(20). Through the size formula, 20 chars in the measured 108.72 pt cell solve
    // 8.5138 pt — a 102.10 pt line with 4.12 pt clear of the right rule, past the inset.
    // An earlier revision of this fix used 14, the cell's capacity at 12 pt, which
    // silently dropped the tail of every entry longer than that ("DEPARTMENT HEAD" ->
    // "DEPARTMENT") while the NAVFIT export of the same record still carried all 20.
    // Truncating a signed evaluation to keep a font size is the wrong trade.
    //
    // The consequence, stated: Math.min(12, …) now binds NOWHERE in this file — b28/b29
    // solve 9.8944, rsAddr 8.6831, Block 41 passes fixedSize, and these solve 8.5138. Its
    // FITREP mutant is therefore equivalent, like CHIEFEVAL's, and the live pin moved to
    // pdfOverlay's copy, which still binds (cpl 10 in an 80 pt box -> 12.0635). The blank
    // outranks the pin.
    rec_x: B40_CELL_L + INSET,
    rec_cellWidth: P2_RULE_R - B40_CELL_L,
    rec_cpl: 20,
    // Two lines in the cell: at 8.5138 pt, ink top 497.48 against a 505.080 ceiling and
    // ink floor 475.70 against a 469.800 floor — 7.60 / 5.90 pt clear, past INSET on
    // both, and 6.61 pt of white between the two lines.
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
    // itself is gone. Blocks 28 and 29 are measured on BOTH axes now too — see the p1
    // section above for the derivation and tests/unit/fitrepTraitTable.test.ts for the
    // pins. What is still NOT fixed, measured off the blank rather than assumed:
    //
    //   OTHER FIELDS OUTSIDE A RULE — thirteen runs at eight distinct x positions, none
    //   of which came from FORM_LEFT (x, then what is wrong): identity + reporting-senior rows and
    //   Block 30 date at 23.5, page 1, 9.14 pt into the margin; the Block 5/10/16 X marks
    //   at 28.10 (cx 31.5 − 3.4), 4.54 pt into the margin — Block 16 is notObservedCx and
    //   a Not Observed report is routine; Block 9 date reported ends at 588.47 against a
    //   579.840 right rule; date49 at 25.0 on page 2, 6.68 into the margin; and the whole
    //   signature-date row at y 47.0 — date49/50/51 AND date52 — whose ink floor is 45.00
    //   under a bottom rule inked [46.440, 47.160], printed off the form altogether. Same
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
  // 28/29 still solve a size from their CPL target. The min(12, …) cap below is DEAD on
  // this form — every caller solves under 12 (b28/b29 9.8944, Block 40 8.5138, rsAddr
  // 8.6831; Block 41 passes fixedSize) — so deleting it here is an equivalent mutant. It
  // is live and pinned in lib/pdfOverlay.ts, whose Block 41 recommendations pass cpl 10
  // in an 80 pt box and really do clamp. Kept only to stay identical to the two sibling
  // overlays' copy of this helper.
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

  // Blocks 22-27, each held to its own column's width — see rsWidths.
  (
    [
      [up(bv.reporting_senior_name), p1.rsName_x],
      [up(bv.reporting_senior_grade), p1.rsGrade_x],
      [up(bv.reporting_senior_designator), p1.rsDesig_x],
      [up(bv.reporting_senior_title), p1.rsTitle_x],
      [bv.reporting_senior_uic, p1.rsUic_x],
      [bv.reporting_senior_dod_id, p1.rsDodid_x],
    ] as [string | undefined, number][]
  ).forEach(([v, x], i) =>
    text(page1, v, x, p1.rsBaseline, 10, courier, p1.rsWidths[i]),
  );

  narrative(page1, bv.command_achievements, p1.b28_x, p1.b28_topBaseline, p1.b28_cpl, p1.b28_lines);

  // 29A goes in its own printed box; 29B still reserves the same character count on line 1
  // so the narrative resumes clear of that box's right stroke. The lead comes off the spec
  // this form actually uses — reading FIELD_FIT.primary_duties here was reading the EVAL's
  // lead, which is a character short of what 1610/2's wider 29A box needs.
  text(
    page1,
    up(bv.primary_duty_abbrev),
    p1.b29a_x,
    p1.b29a_baseline,
    p1.b29_abbrevSize,
    courier,
    p1.b29a_width,
  );
  narrativeWithLead(
    page1,
    null,
    bv.primary_duties,
    p1.b29b_x,
    p1.b29_firstBaseline,
    p1.b29b_cpl,
    p1.b29b_lines,
    p1.b29_abbrevSize,
    getPrimaryDutiesFieldFit("FITREP").firstLineLead ?? 0,
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
