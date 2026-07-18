// lib/pdfOverlay.ts
//
// High-fidelity PDF generation by OVERLAYING our data onto the official
// NAVPERS 1616/26 (REV 05-2025) blank — a flat, vector, letter-size PDF with no
// AcroForm and no XFA (so no radio "bubbles", and the correct required revision).
//
// We draw text and literal "X" marks at measured coordinates on top of the real
// form. Coordinates are in PDF user space (bottom-left origin, points), reverse-
// engineered from the blank's content stream (checkbox squares, cell grid, label
// baselines). Narrative blocks (28, 29B, 43, 44) are drawn in Courier with text
// pre-wrapped by the same wrapTextToWidth() the on-screen measuring canvas uses,
// so the printed wrap matches the canvas exactly (true WYSIWYG).
//
// See [[apex-pdf-acroform-fill]] for the prior fill-based approach (08-10 form);
// this overlay supersedes it for the 05-2025 requirement.

import {
  PDFDocument,
  PDFFont,
  PDFPage,
  rgb,
  StandardFonts,
  pushGraphicsState,
  popGraphicsState,
  translate,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import fs from "fs";
import path from "path";
import { Evaluation } from "@/types";
import { wrapTextToWidth, FIELD_FIT } from "./commentFit";
import { computeTraitAverage } from "./traitAverage";
import { formatNavpersDate } from "./navyDate";
import { generateChiefEvalOverlayPdf } from "./chiefEvalOverlay";
import { generateFitrepOverlayPdf } from "./fitrepOverlay";

const BLACK = rgb(0, 0, 0);

// Right edge of the form's data area (used to size full-width narrative boxes).
const FORM_RIGHT = 565.2;
const FORM_LEFT = 17.3;

// APEX duty_status -> column index in the block-5 box row [ACT, TAR/FTS, INACT, AT/ADSW]
function dutyIndex(s: string): number | null {
  const u = (s || "").toUpperCase();
  if (u.includes("AT/AD") || u.startsWith("AT")) return 3;
  if (u.includes("INACT")) return 2;
  if (u.includes("TAR") || u.includes("FTS")) return 1;
  if (u.includes("ACT")) return 0;
  return null;
}

// trait grade -> grade-column index [NOB, 1.0, 2.0, 3.0, 4.0, 5.0]
function gradeIndex(grade?: string): number | null {
  if (!grade) return null;
  if (grade.toUpperCase() === "NOB") return 0;
  const n = parseInt(grade, 10);
  return n >= 1 && n <= 5 ? n : null;
}

// promotion_recommendation -> column index in the block-45 row
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

// ─────────────────────────── coordinate map ───────────────────────────
// All coordinates in PDF points, bottom-left origin. cx/cy = checkbox-square CENTERS.
const C = {
  // grade-box column centers (NOB,1,2,3,4,5); per-trait row centers vary
  GRADE_COLS_P1: [80.6, 209.5, 245.5, 381.6, 418.3, 555.8],
  GRADE_COLS_P2: [80.6, 209.5, 245.5, 383.0, 418.3, 555.8],

  p1: {
    // identity row (labels at top of 23pt cell; data sits just below)
    identityBaseline: 749,
    name_x: 25,
    grade_x: 295,
    desig_x: 360,
    dodid_x: 460,

    // block 5 duty status — four square centers, single row
    dutyCy: 731.1,
    dutyCx: [37.4, 67.0, 95.8, 123.8],

    // blocks 6-9 (UIC/Ship/Promo/DateReported share this baseline; LOWER y = lower on
    // the page, so subtract to nudge the whole row down, add to nudge it up)
    row69Baseline: 726,
    uic_x: 174,
    ship_x: 226,
    promo_x: 421,
    datereported_x: 500,

    // occasion 10-13 (single row of square centers)
    occasionCy: 707.4,
    periodicCx: 80.6,
    detachIndCx: 160.6,
    promoFrockCx: 254.9,
    specialCx: 333.4,

    // type 16-18
    notObservedCx: 80.6,
    notObservedCy: 695.1,
    regularCx: 160.6,
    regularCy: 682.9,
    concurrentCx: 254.9,
    concurrentCy: 682.9,

    // period of report (same line as the "14. From: / 15. To:" labels)
    periodBaseline: 702,
    from_x: 398,
    to_x: 500,

    // PFA 20 / billet 21 (labels at y~692; data below). The 20|21 cell divider is at
    // x≈455.8 here (468.8 on the centered template), so billet must clear it.
    pfaBilletBaseline: 677,
    pfa_x: 365,
    billet_x: 465,

    // reporting senior 22-27 (cell-lefts measured from blank: 167.8/218.2/269.3/401.0/455.8)
    rsBaseline: 652,
    rsName_x: 26,
    rsGrade_x: 180,
    rsDesig_x: 230,
    rsTitle_x: 280,
    rsUic_x: 409,
    rsDodid_x: 463,

    // block 28 narrative (full width; 3 lines)
    b28_x: 21,
    b28_topBaseline: 630,
    b28_cpl: FIELD_FIT.command_achievements.charsPerLine,
    b28_lines: FIELD_FIT.command_achievements.maxLines,

    // block 29: 29a abbreviation (12-pt, in its printed box) + 29b description flow
    // INLINE on the first line. The body begins just past the box's right border
    // (measured ~x=147 on this template) — ~20 narrative chars in from b29b_x at the 29B
    // font size. That reserve lives in FIELD_FIT.primary_duties.firstLineLead so the
    // on-screen canvas, the fit validation, and the PDF wrap line 1 identically.
    b29_firstBaseline: 581,
    b29_abbrevSize: 12,
    b29b_x: 28,
    b29b_contX: 25,
    b29b_cpl: FIELD_FIT.primary_duties.charsPerLine,
    b29b_lines: FIELD_FIT.primary_duties.maxLines,

    // counseling 30-32 (cell-lefts measured: 196.6/275.0/412.6)
    counselBaseline: 522,
    dateCounseled_x: 200,
    counselor_x: 279,
    counselor_width: 130,

    // trait rows 33-37 (grade-box row centers)
    traitCy: {
      knowledge: 392.8,
      work: 309.2,
      eo: 224.3,
      bearing: 140.1,
      accomplishment: 56.5,
    } as Record<string, number>,
  },

  p2: {
    identityBaseline: 749,
    name_x: 22,
    grade_x: 293,
    desig_x: 360,
    dodid_x: 460,

    // trait rows 38-39
    traitCy: { teamwork: 671.4, leadership: 549.7 } as Record<string, number>,

    // block 40 individual trait average (drawn inside the small box ~x44-84)
    traitAvg_x: 52,
    traitAvg_y: 489,

    // block 41 career recommendations (up to two; side-by-side on y=499)
    rec1_x: 112,
    rec1_y: 499,
    rec2_x: 218,
    rec2_y: 499,

    // block 43 comments (big box; 18 lines) — top baseline clears the 2-line instruction header
    b43_x: 22,
    b43_topBaseline: 450,
    b43_lines: 18,

    // block 44 qualifications (2 lines)
    b44_x: 22,
    b44_topBaseline: 245,
    b44_cpl: FIELD_FIT.qualifications.charsPerLine,
    b44_lines: FIELD_FIT.qualifications.maxLines,

    // block 45 individual promotion recommendation (X in a column, INDIVIDUAL row)
    promoRecCy: 189,
    promoRecCx: [110, 157, 208, 259, 310, 360], // NOB, SigProb, Progressing, Promotable, MustPromote, EarlyPromote
    // block 46 summary row (counts), same columns one row below block 45. ESTIMATE — calibrate Y visually.
    promoSummaryCy: 162,

    // block 47 retention
    retentionCy: 212.1,
    retentionNotRecCx: 463.7,
    retentionRecCx: 543.6,

    // block 48 reporting senior address — cell measured at overlay-x 385–565 (≈180pt wide).
    // Auto-fit (like 28/29/44): 30 cpl over rsAddr_width≈178 → ~9.5pt, matching block 44's
    // size; 3 lines × 30 = 90 chars of capacity. cpl/lines from FIELD_FIT keep UI+PDF in sync.
    rsAddr_x: 390,
    rsAddr_topBaseline: 182,
    rsAddr_cpl: FIELD_FIT.reporting_senior_address.charsPerLine,
    rsAddr_lines: FIELD_FIT.reporting_senior_address.maxLines,
    rsAddr_width: 178,

    // block 51 member statement (box centers measured: 132.5 / 284.4)
    memberStmtCy: 81,
    intendCx: 132.5,
    doNotIntendCx: 284.4,

    // summary group average — the "Summary Group Average:" label sits in the Block 50
    // band (label ends ≈overlay-x 405, baseline ≈y 94 on the centered template; minus the
    // p2 offset → config ≈398, 108). Value is printed just to the right of the label.
    summaryAvg_x: 400,
    summaryAvg_y: 111,

    // signature dates
    date49_x: 215,
    date49_y: 128,
    date50_x: 515,
    date50_y: 128,
    date51_x: 215,
    date51_y: 70,
    date52_x: 515,
    date52_y: 70,
  },
};

export async function generateOverlayPdf(
  evaluation: Evaluation,
  templateBytes: ArrayBuffer | Uint8Array,
): Promise<Uint8Array> {
  const template =
    templateBytes instanceof Uint8Array
      ? templateBytes
      : new Uint8Array(templateBytes);

  if (evaluation.report_type === "CHIEFEVAL") {
    return generateChiefEvalOverlayPdf(evaluation, template);
  }
  if (evaluation.report_type === "FITREP") {
    return generateFitrepOverlayPdf(evaluation, template);
  }

  const pdf = await PDFDocument.load(template);
  pdf.registerFontkit(fontkit);

  let courier: PDFFont;
  try {
    const bytes = fs.readFileSync(
      path.join(process.cwd(), "public/fonts/CourierPrime-Regular.ttf"),
    );
    courier = await pdf.embedFont(new Uint8Array(bytes));
  } catch {
    courier = await pdf.embedFont(StandardFonts.Courier);
  }
  const markFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const pages = pdf.getPages();
  const page1 = pages[0];
  const page2 = pages[1] || pages[0];
  const bv = evaluation.block_values || {};
  const tg = evaluation.trait_grades || ({} as any);

  // The centered 05-2025 template shifts all form graphics right & down vs. the original
  // blank our coordinates were calibrated against. Rather than re-edit every coordinate,
  // translate each page's overlay layer by the measured per-page offset (pure rigid
  // shift, no scaling): page 1 = (+13, -11), page 2 = (+12, -14) PDF points.
  // Pushed before any draw; popped just before save so the whole overlay is wrapped.
  const OFFSET_P1 = { dx: 13, dy: -11 };
  const OFFSET_P2 = { dx: 12, dy: -14 };
  page1.pushOperators(
    pushGraphicsState(),
    translate(OFFSET_P1.dx, OFFSET_P1.dy),
  );
  if (page2 !== page1)
    page2.pushOperators(
      pushGraphicsState(),
      translate(OFFSET_P2.dx, OFFSET_P2.dy),
    );

  // ── drawing helpers ──
  // single-line data fields render at 12-pitch (12 pt Courier); the measured narrative
  // blocks (28/29/44, and 43 via its toggle) use narrative()/narrativeWithLead() below.
  const text = (
    page: PDFPage,
    value: string | undefined | null,
    x: number,
    y: number,
    size = 12,
    font = courier,
    maxWidth?: number,
  ) => {
    if (value == null || value === "") return;
    const str = String(value);
    // Shrink to fit a fixed cell when maxWidth is given (e.g. Block 31 counselor);
    // short values keep the full `size`, long ones scale down just enough to fit.
    let s = size;
    if (maxWidth) {
      const w = font.widthOfTextAtSize(str, size);
      if (w > maxWidth) s = size * (maxWidth / w);
    }
    page.drawText(str, { x, y, size: s, font, color: BLACK });
  };
  // a literal "X" centered in a checkbox square
  const mark = (page: PDFPage, cx: number, cy: number, size = 11) => {
    const w = markFont.widthOfTextAtSize("X", size);
    page.drawText("X", {
      x: cx - w / 2,
      y: cy - size * 0.36,
      size,
      font: markFont,
      color: BLACK,
    });
  };
  // wrap+draw a monospace narrative; size chosen so `cpl` Courier chars fill `boxWidth`
  const narrative = (
    page: PDFPage,
    value: string | undefined,
    x: number,
    topBaseline: number,
    cpl: number,
    maxLines: number,
    boxWidth = FORM_RIGHT - FORM_LEFT,
  ) => {
    if (!value) return;
    const size = Math.max(
      5,
      Math.min(12, (boxWidth - 4) / ((cpl + 0.5) * 0.6)),
    );
    const lh = size * 1.18;
    const lines = wrapTextToWidth(value, cpl).slice(0, maxLines);
    lines.forEach((ln, i) =>
      page.drawText(ln, {
        x,
        y: topBaseline - i * lh,
        size,
        font: courier,
        color: BLACK,
      }),
    );
  };
  // Like narrative(), but the first line begins with a short `lead` (block 29's
  // abbreviation, drawn at `leadSize` inside its own printed box); the body flows to
  // the right of that box on the same line, then wraps below at full cell width.
  // `leadChars` is the number of narrative chars reserved on line 1 for the printed
  // abbreviation box — the SAME value the measuring canvas/validation use (FIELD_FIT
  // firstLineLead), so screen, validation, and PDF wrap identically. The body is padded
  // by that many chars so line 1 is shorter; lines 2+ start at `contX` (a slight hanging
  // indent left of `x`), defaulting to `x`.
  const narrativeWithLead = (
    page: PDFPage,
    lead: string | undefined,
    body: string | undefined,
    x: number,
    topBaseline: number,
    cpl: number,
    maxLines: number,
    leadSize: number,
    leadChars: number,
    contX = x,
    boxWidth = FORM_RIGHT - FORM_LEFT,
  ) => {
    const leadStr = (lead || "").toUpperCase().trim();
    if (!leadStr && !body) return;
    const size = Math.max(
      5,
      Math.min(12, (boxWidth - 4) / ((cpl + 0.5) * 0.6)),
    );
    const lh = size * 1.18;
    if (leadStr)
      page.drawText(leadStr, {
        x,
        y: topBaseline,
        size: leadSize,
        font: courier,
        color: BLACK,
      });
    if (!body) return;
    const padded = " ".repeat(Math.max(0, leadChars)) + body;
    const lines = wrapTextToWidth(padded, cpl).slice(0, maxLines);
    lines.forEach((ln, i) =>
      page.drawText(ln, {
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
  // identity (repeated on both page headers)
  for (const [pg, P] of [
    [page1, C.p1],
    [page2, C.p2],
  ] as [PDFPage, typeof C.p1 | typeof C.p2][]) {
    text(pg, up(evaluation.member_name), P.name_x, P.identityBaseline);
    text(pg, up(evaluation.grade_rate), P.grade_x, P.identityBaseline);
    text(pg, up(evaluation.designator), P.desig_x, P.identityBaseline);
    text(pg, evaluation.dod_id, P.dodid_x, P.identityBaseline);
  }

  // block 5 duty status
  const di = dutyIndex(evaluation.duty_status || "");
  if (di != null) mark(page1, p1.dutyCx[di], p1.dutyCy);

  // blocks 6-9
  text(page1, evaluation.uic, p1.uic_x, p1.row69Baseline);
  text(page1, up(evaluation.ship_station), p1.ship_x, p1.row69Baseline);
  text(page1, up(evaluation.promotion_status), p1.promo_x, p1.row69Baseline);
  text(
    page1,
    formatNavpersDate(bv.date_reported),
    p1.datereported_x,
    p1.row69Baseline,
  );

  // occasion 10-13
  if (bv.periodic) mark(page1, p1.periodicCx, p1.occasionCy);
  if (bv.detachment_individual) mark(page1, p1.detachIndCx, p1.occasionCy);
  if (bv.promotion_frocking) mark(page1, p1.promoFrockCx, p1.occasionCy);
  if (bv.special) mark(page1, p1.specialCx, p1.occasionCy);

  // period 14-15
  text(
    page1,
    formatNavpersDate(evaluation.period_from),
    p1.from_x,
    p1.periodBaseline,
  );
  text(
    page1,
    formatNavpersDate(evaluation.period_to),
    p1.to_x,
    p1.periodBaseline,
  );

  // type 16-18
  if (bv.not_observed) mark(page1, p1.notObservedCx, p1.notObservedCy);
  if (bv.regular_report) mark(page1, p1.regularCx, p1.regularCy);
  if (bv.concurrent_report) mark(page1, p1.concurrentCx, p1.concurrentCy);

  // PFA 20 / billet 21
  text(page1, up(bv.physical_readiness), p1.pfa_x, p1.pfaBilletBaseline);
  text(page1, up(bv.billet_subcategory), p1.billet_x, p1.pfaBilletBaseline);

  // reporting senior 22-27
  text(page1, up(bv.reporting_senior_name), p1.rsName_x, p1.rsBaseline);
  text(page1, up(bv.reporting_senior_grade), p1.rsGrade_x, p1.rsBaseline);
  text(page1, up(bv.reporting_senior_designator), p1.rsDesig_x, p1.rsBaseline);
  text(page1, up(bv.reporting_senior_title), p1.rsTitle_x, p1.rsBaseline);
  text(page1, bv.reporting_senior_uic, p1.rsUic_x, p1.rsBaseline);
  text(page1, bv.reporting_senior_dod_id, p1.rsDodid_x, p1.rsBaseline);

  // block 28 narrative
  narrative(
    page1,
    bv.command_achievements,
    p1.b28_x,
    p1.b28_topBaseline,
    p1.b28_cpl,
    p1.b28_lines,
  );

  // block 29: 29a abbreviation + 29b description inline on the first line. The reserved
  // first-line span comes from the shared FIELD_FIT lead so the PDF wraps exactly like
  // the on-screen 29B canvas and the fit validation.
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

  // counseling 30-32 (block 30 ISO date -> YYMMMDD; NOT REQ / NOT PERF pass through)
  text(
    page1,
    formatNavpersDate(bv.date_counseled),
    p1.dateCounseled_x,
    p1.counselBaseline,
  );
  text(
    page1,
    up(bv.counselor),
    p1.counselor_x,
    p1.counselBaseline,
    12,
    courier,
    p1.counselor_width,
  );

  // trait grades 33-37
  const p1Trait = (key: string, grade?: string) => {
    const gi = gradeIndex(grade);
    if (gi != null && p1.traitCy[key] != null)
      mark(page1, C.GRADE_COLS_P1[gi], p1.traitCy[key]);
  };
  p1Trait("knowledge", tg.knowledge); // 33 Professional Knowledge
  p1Trait("work", tg.work); // 34 Quality of Work
  p1Trait("eo", tg.eo); // 35 Command/Org Climate-EO
  p1Trait("bearing", tg.bearing); // 36 Military Bearing/Character
  p1Trait("accomplishment", tg.accomplishment); // 37 Job Accomplishment/Initiative

  // ───────────────── PAGE 2 ─────────────────
  const p2 = C.p2;
  const p2Trait = (key: string, grade?: string) => {
    const gi = gradeIndex(grade);
    if (gi != null && p2.traitCy[key] != null)
      mark(page2, C.GRADE_COLS_P2[gi], p2.traitCy[key]);
  };
  p2Trait("teamwork", tg.teamwork); // 38 Teamwork
  p2Trait("leadership", tg.leadership); // 39 Leadership

  // block 40 individual trait average — computed from the grades at render time (the
  // stored trait_average can go stale), NOB-excluded, X.XX.
  const indivAvg = computeTraitAverage(evaluation.trait_grades).average;
  text(
    page2,
    indivAvg != null ? indivAvg.toFixed(2) : "",
    p2.traitAvg_x,
    p2.traitAvg_y,
  );

  // block 41 career recommendations (wrap at 10 chars per line, up to 2 lines per recommendation)
  const recs = evaluation.career_recommendations || [];
  narrative(page2, up(recs[0]), p2.rec1_x, p2.rec1_y, 10, 2, 80);
  narrative(page2, up(recs[1]), p2.rec2_x, p2.rec2_y, 10, 2, 80);

  // block 43 comments (pitch -> cpl)
  const pitch = (bv.comment_pitch || "10") as "10" | "12";
  const cpl43 = pitch === "10" ? 90 : 84;
  narrative(
    page2,
    evaluation.comments,
    p2.b43_x,
    p2.b43_topBaseline,
    cpl43,
    p2.b43_lines,
  );

  // block 44 qualifications
  narrative(
    page2,
    bv.qualifications,
    p2.b44_x,
    p2.b44_topBaseline,
    p2.b44_cpl,
    p2.b44_lines,
  );

  // block 45 individual promotion recommendation
  const ri = recIndex(evaluation.promotion_recommendation);
  if (ri != null) mark(page2, p2.promoRecCx[ri], p2.promoRecCy);

  // block 46 promotion-recommendation SUMMARY — the count of the summary group's OBSERVED reports
  // in each of the five ranked columns. The NOB column already has a pre-printed "X" on the blank
  // form (NOB reports aren't part of a summary group, BUPERSINST 1610.10H Table 1-3), so we never
  // draw it. Left entirely blank when THIS report is itself NOB.
  if (
    evaluation.promotion_recommendation !== "NOB" &&
    evaluation.summary_group_distribution
  ) {
    const dist = evaluation.summary_group_distribution;
    for (let i = 1; i < REC_COLS.length; i++) {
      const n = String(dist[REC_COLS[i]] ?? 0);
      const w = courier.widthOfTextAtSize(n, 11);
      text(page2, n, p2.promoRecCx[i] - w / 2, p2.promoSummaryCy, 11);
    }
  }

  // block 47 retention
  const ret = (evaluation.retention || "").toUpperCase();
  if (ret.includes("NOT")) mark(page2, p2.retentionNotRecCx, p2.retentionCy);
  else if (ret.includes("RECOMMEND"))
    mark(page2, p2.retentionRecCx, p2.retentionCy);

  // block 48 RS address (wrapped to fit the narrow cell; size auto-fits from cpl + width)
  narrative(
    page2,
    up(bv.reporting_senior_address),
    p2.rsAddr_x,
    p2.rsAddr_topBaseline,
    p2.rsAddr_cpl,
    p2.rsAddr_lines,
    p2.rsAddr_width,
  );

  // block 51 member statement
  const stmt = (bv.member_statement_intent || "").toUpperCase();
  if (stmt.includes("NOT") || stmt.includes("DO NOT"))
    mark(page2, p2.doNotIntendCx, p2.memberStmtCy);
  else if (stmt.includes("INTEND")) mark(page2, p2.intendCx, p2.memberStmtCy);

  // signature dates (typed signatures/images are applied by the signing flow)
  // block 50 summary group average — computed by the caller (export screen) and passed
  // on the payload; blank when the eval isn't in a summary group.
  text(
    page2,
    evaluation.summary_group_average != null
      ? evaluation.summary_group_average.toFixed(2)
      : "",
    p2.summaryAvg_x,
    p2.summaryAvg_y,
  );

  text(page2, bv.senior_rater_signature_date, p2.date49_x, p2.date49_y);
  text(page2, bv.reporting_senior_signature_date, p2.date50_x, p2.date50_y);
  text(page2, bv.member_signature_date, p2.date51_x, p2.date51_y);
  text(page2, bv.concurrent_rs_signature_date, p2.date52_x, p2.date52_y);

  // close the per-page overlay translation pushed above
  page1.pushOperators(popGraphicsState());
  if (page2 !== page1) page2.pushOperators(popGraphicsState());

  return await pdf.save();
}
