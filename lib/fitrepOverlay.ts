// lib/fitrepOverlay.ts
//
// High-fidelity PDF generation by OVERLAYING our data onto the official
// NAVPERS 1610/2 (FITREP, REV 05-2025) blank.
//
// Maps Officer-specific trait layout (8 traits including Tactical Performance)
// and omits Block 47 (Retention).
//

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

const BLACK = rgb(0, 0, 0);
const FORM_RIGHT = 565.2;
const FORM_LEFT = 17.3;

function formatNavpersDate(dateStr?: string): string {
  if (!dateStr) return "";
  const months = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (iso) return `${iso[1].slice(-2)}${months[Number(iso[2]) - 1]}${iso[3]}`;
  return dateStr.toUpperCase();
}

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

const C = {
  GRADE_COLS_P1: [80.6, 209.5, 245.5, 381.6, 418.3, 555.8],
  GRADE_COLS_P2: [80.6, 209.5, 245.5, 383.0, 418.3, 555.8],

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

    b28_x: FORM_LEFT,
    b28_topBaseline: 574.0,
    b28_lines: 4,
    b28_cpl: 91,

    b29b_x: FORM_LEFT,
    b29_firstBaseline: 486.0,
    b29b_lines: 4,
    b29b_cpl: 91,
    b29_abbrevSize: 9.5,
    b29b_contX: FORM_LEFT,

    dateCounseled_x: 23.5,
    counselor_x: 88.0,
    counselor_width: 145.0,
    counselBaseline: 400.0,

    traitCy: {
      knowledge: 339.8,
      work: 271.8,
      eo: 204.8,
      bearing: 136.8,
      accomplishment: 68.8,
    } as Record<string, number>,
  },

  p2: {
    name_x: 23.5,
    grade_x: 279.0,
    desig_x: 355.0,
    dodid_x: 452.0,
    identityBaseline: 755.3,

    traitCy: {
      teamwork: 663.8,
      leadership: 594.8,
      tactical_performance: 525.8, // Officer 8th trait
    } as Record<string, number>,

    traitAvg_x: 528.0,
    traitAvg_y: 538.5,

    rec1_x: FORM_LEFT,
    rec1_y: 512.0,
    rec2_x: 300.0,
    rec2_y: 512.0,

    b43_x: FORM_LEFT,
    b43_topBaseline: 462.0,
    b43_lines: 18,

    b44_x: FORM_LEFT,
    b44_topBaseline: 220.0,
    b44_lines: 2,
    b44_cpl: 91,

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

  const narrative = (
    pg: PDFPage,
    str: string | undefined | null,
    x: number,
    topBaseline: number,
    cpl: number,
    maxLines: number,
    boxWidth = FORM_RIGHT - FORM_LEFT,
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
    boxWidth = FORM_RIGHT - FORM_LEFT,
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
    p1.b29b_contX,
  );

  text(page1, formatNavpersDate(bv.date_counseled), p1.dateCounseled_x, p1.counselBaseline);
  text(page1, up(bv.counselor), p1.counselor_x, p1.counselBaseline, 12, courier, p1.counselor_width);

  // Officer Trait grades 33-37 on page 1
  const p1Trait = (key: string, grade?: string) => {
    const gi = gradeIndex(grade);
    if (gi != null && p1.traitCy[key] != null) mark(page1, C.GRADE_COLS_P1[gi], p1.traitCy[key]);
  };
  p1Trait("knowledge", tg.knowledge);
  p1Trait("work", tg.work);
  p1Trait("eo", tg.eo);
  p1Trait("bearing", tg.bearing);
  p1Trait("accomplishment", tg.accomplishment);

  // ───────────────── PAGE 2 ─────────────────
  const p2 = C.p2;
  const p2Trait = (key: string, grade?: string) => {
    const gi = gradeIndex(grade);
    if (gi != null && p2.traitCy[key] != null) mark(page2, C.GRADE_COLS_P2[gi], p2.traitCy[key]);
  };
  p2Trait("teamwork", tg.teamwork);
  p2Trait("leadership", tg.leadership);
  p2Trait("tactical_performance", tg.tactical_performance);

  const indivAvg = computeTraitAverage(evaluation.trait_grades).average;
  text(page2, indivAvg != null ? indivAvg.toFixed(2) : "", p2.traitAvg_x, p2.traitAvg_y);

  const recs = evaluation.career_recommendations || [];
  narrative(page2, up(recs[0]), p2.rec1_x, p2.rec1_y, 10, 2, 80);
  narrative(page2, up(recs[1]), p2.rec2_x, p2.rec2_y, 10, 2, 80);

  const pitch = (bv.comment_pitch || "10") as "10" | "12";
  const cpl43 = pitch === "10" ? 90 : 84;
  narrative(page2, evaluation.comments, p2.b43_x, p2.b43_topBaseline, cpl43, p2.b43_lines);

  narrative(page2, bv.qualifications, p2.b44_x, p2.b44_topBaseline, p2.b44_cpl, p2.b44_lines);

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

  // NOTE: Block 47 (Retention) is omitted on FITREP per BUPERSINST 1610.10H Ch. 10.

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
