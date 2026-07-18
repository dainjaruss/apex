// lib/bragSheet/pdf.ts — branded APEX Brag Sheet PDF (spec §4.4)
//
// The repo's other PDF generators overlay official blanks (PDFDocument.load);
// this is the first PDFDocument.create() document. It lifts pdfOverlay.ts's
// primitives: fontkit registration + Courier Prime embed with
// StandardFonts.Courier fallback, wrapTextToWidth for all body wrapping,
// HelveticaBold for headings.
//
// Isomorphic: no fs/fetch here — the caller supplies Courier Prime bytes
// (browser: fetch /fonts/CourierPrime-Regular.ttf; tests: fs.readFileSync).

import { PDFDocument, PDFFont, PDFPage, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { wrapTextToWidth } from "@/lib/commentFit";
import { BRAG_PDF_FOOTER, type BragSheet } from "./types";
import { BRAG_SECTIONS, collapsePfa } from "./template";

export interface BragPdfFonts { courierPrime?: Uint8Array }   // caller supplies bytes; no fs/fetch here

// ── layout constants (normative, §4.4) ──────────────────────────────────────
const PAGE_W = 612;                     // US Letter, bottom-left origin
const PAGE_H = 792;
const MARGIN = 36;                      // all sides
const CONTENT_W = 540;
const FOOTER_RESERVE = 24;              // footer floor; content never enters it

const BODY_SIZE = 9;                    // Courier field value / bullet body
const BODY_LINE = 11;                   // body line height
const LABEL_SIZE = 7.5;
const BAR_H = 16;                       // section bar rect height
const BAR_ADVANCE = 22;                 // section bar vertical advance
const HANG_INDENT = 12;                 // bullet hanging indent

const BAR_FILL = rgb(0.12, 0.16, 0.24);
const BLURB_GRAY = rgb(0.45, 0.45, 0.45);
const LABEL_GRAY = rgb(0.35, 0.35, 0.35);
const FOOTER_GRAY = rgb(0.5, 0.5, 0.5);
const RULE_GRAY = rgb(0.7, 0.7, 0.7);
const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);

/** CPL for Courier body text: Courier advance = 0.6 em; full width ⇒ 100 CPL. */
const cplFor = (availableWidth: number) => Math.floor(availableWidth / (BODY_SIZE * 0.6));

export async function generateBragSheetPdf(
  sheet: BragSheet,
  fonts?: BragPdfFonts,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle("APEX Brag Sheet v1.0 – Powered by APEX");
  pdf.setProducer("APEX");

  let courier: PDFFont;
  try {
    if (!fonts?.courierPrime) throw new Error("no bytes");
    courier = await pdf.embedFont(fonts.courierPrime);
  } catch {
    courier = await pdf.embedFont(StandardFonts.Courier);
  }
  const helv = await pdf.embedFont(StandardFonts.Helvetica);
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  // ponytail: standard WinAnsi fonts can't encode "→" etc. — swap known layout
  // glyphs, ASCII-strip anything else exotic rather than throwing mid-render.
  const draw = (text: string, x: number, font: PDFFont, size: number, color = BLACK) => {
    const t = text.replace(/→/g, "->");
    try {
      page.drawText(t, { x, y, size, font, color });
    } catch {
      page.drawText(t.replace(/[^\x20-\x7E]/g, "?"), { x, y, size, font, color });
    }
  };
  const width = (text: string, font: PDFFont, size: number) => {
    try {
      return font.widthOfTextAtSize(text.replace(/→/g, "->"), size);
    } catch {
      return font.widthOfTextAtSize(text.replace(/[^\x20-\x7E]/g, "?"), size);
    }
  };

  /** Pagination (§4.4 step 4): break BEFORE drawing any line that would enter the footer floor. */
  const need = (lineHeight: number) => {
    if (y - lineHeight < MARGIN + FOOTER_RESERVE) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  /** Wrapped Courier body text at an x offset inside the content area. */
  const body = (text: string, x = MARGIN, hangingPrefix?: string) => {
    const avail = CONTENT_W - (x - MARGIN) - (hangingPrefix ? HANG_INDENT : 0);
    const lines = wrapTextToWidth(text, Math.max(10, cplFor(avail)));
    lines.forEach((line, i) => {
      need(BODY_LINE);
      y -= BODY_LINE;
      if (hangingPrefix && i === 0) {
        draw(hangingPrefix + line, x, courier, BODY_SIZE);
      } else {
        draw(line, x + (hangingPrefix ? HANG_INDENT : 0), courier, BODY_SIZE);
      }
    });
  };

  /** Bullet line: "- " prefix, 12 pt hanging indent. */
  const bullet = (text: string, x = MARGIN) => body(text, x, "- ");

  const bulletText = (b: { text: string; metrics?: string; trait_hint?: string }) =>
    b.text +
    (b.metrics ? ` [${b.metrics}]` : "") +
    (b.trait_hint ? ` (${b.trait_hint})` : "");

  /** UPPERCASE gray label + Courier value on one baseline; wraps long values. */
  const drawPairAt = (label: string, value: string, x: number) => {
    const lab = label.toUpperCase() + " ";
    const lw = width(lab, helv, LABEL_SIZE);
    const avail = CONTENT_W - (x - MARGIN) - lw;
    const lines = wrapTextToWidth(value, Math.max(10, cplFor(avail)));
    lines.forEach((line, i) => {
      need(BODY_LINE);
      y -= BODY_LINE;
      if (i === 0) draw(lab, x, helv, LABEL_SIZE, LABEL_GRAY);
      draw(line, x + lw, courier, BODY_SIZE);
    });
  };

  const pairW = (label: string, value: string) =>
    width(label.toUpperCase() + " ", helv, LABEL_SIZE) + width(value, courier, BODY_SIZE);

  /** Scalar fields as label/value pairs — two per line when both fit 260 pt columns. */
  const pairs = (entries: [string, string | undefined | null][]) => {
    const filled = entries.filter((e): e is [string, string] => !!e[1]);
    for (let i = 0; i < filled.length; ) {
      const a = filled[i];
      const b = filled[i + 1];
      if (b && pairW(a[0], a[1]) <= 260 && pairW(b[0], b[1]) <= 260) {
        need(BODY_LINE);
        y -= BODY_LINE;
        draw(a[0].toUpperCase() + " ", MARGIN, helv, LABEL_SIZE, LABEL_GRAY);
        draw(a[1], MARGIN + width(a[0].toUpperCase() + " ", helv, LABEL_SIZE), courier, BODY_SIZE);
        draw(b[0].toUpperCase() + " ", MARGIN + 280, helv, LABEL_SIZE, LABEL_GRAY);
        draw(b[1], MARGIN + 280 + width(b[0].toUpperCase() + " ", helv, LABEL_SIZE), courier, BODY_SIZE);
        i += 2;
      } else {
        drawPairAt(a[0], a[1], MARGIN);
        i += 1;
      }
    }
  };

  /** Gray UPPERCASE sub-label line (bullet-group headers). */
  const groupLabel = (label: string) => {
    need(BODY_LINE);
    y -= BODY_LINE;
    draw(label.toUpperCase(), MARGIN, helv, LABEL_SIZE, LABEL_GRAY);
  };

  const bulletGroup = (label: string, items: { text: string; metrics?: string; trait_hint?: string }[]) => {
    if (items.length === 0) return;
    groupLabel(label);
    for (const b of items) bullet(bulletText(b));
  };

  // ── page 1 header (§4.4 step 2) ─────────────────────────────────────────────
  y -= 16;
  draw("APEX BRAG SHEET", MARGIN, helvBold, 16);
  const a = sheet.data.admin;
  y -= 14;
  draw(
    `${a.member_name ?? ""} · ${a.grade_rate ?? ""} · ${sheet.period_from} – ${sheet.period_to}`,
    MARGIN, courier, BODY_SIZE,
  );
  y -= 12;
  draw(`${sheet.report_type} · TEMPLATE v${sheet.template_version}`, MARGIN, courier, 8);
  y -= 8;
  page.drawLine({
    start: { x: MARGIN, y },
    end: { x: MARGIN + CONTENT_W, y },
    thickness: 0.5,
    color: RULE_GRAY,
  });
  y -= 10;

  // ── sections (§4.4 step 3) ──────────────────────────────────────────────────
  const isEmptyValue = (v: unknown): boolean => {
    if (v == null || v === "" || v === 0 || v === false) return true;
    if (Array.isArray(v)) return v.every(isEmptyValue);
    if (typeof v === "object") return Object.values(v).every(isEmptyValue);
    return false;
  };

  for (const section of BRAG_SECTIONS) {
    // section bar (never orphaned right at the footer floor)
    need(BAR_ADVANCE + BODY_LINE);
    page.drawRectangle({
      x: MARGIN, y: y - BAR_H, width: CONTENT_W, height: BAR_H, color: BAR_FILL,
    });
    draw2(page, section.title, MARGIN + 6, y - BAR_H + 4.5, helvBold, 10, WHITE);
    y -= BAR_ADVANCE;

    // blurb line
    need(10);
    y -= 10;
    draw(`${section.blurb} → ${section.feeds}`, MARGIN, helv, LABEL_SIZE, BLURB_GRAY);

    const value = sheet.data[section.key];
    if (isEmptyValue(value)) {
      need(BODY_LINE);
      y -= BODY_LINE;
      draw("— none entered —", MARGIN, courier, 8, BLURB_GRAY);
      y -= 6;
      continue;
    }

    switch (section.key) {
      case "admin": {
        pairs([
          ["Member Name", a.member_name],
          ["Grade/Rate", a.grade_rate],
          ["Designator", a.designator],
          ["DoD ID", a.dod_id],
          ["Duty Status", a.duty_status],
          ["UIC", a.uic],
          ["Ship/Station", a.ship_station],
          ["Date Reported", a.date_reported],
          ["Prior Report End", a.prior_report_end],
          ["Date of Rate", a.date_of_rate],
        ]);
        if (a.periods_unavailable.length) {
          groupLabel("Periods Not Available for Duty");
          for (const p of a.periods_unavailable) bullet(`${p.start} – ${p.end}: ${p.reason}`);
        }
        break;
      }
      case "duties": {
        for (const d of sheet.data.duties) {
          bullet(
            `${d.title} — ${d.kind}, ${d.months_assigned} mo` +
              (d.is_most_significant ? " [MOST SIGNIFICANT]" : "") +
              (d.abbrev ? ` (29A: ${d.abbrev})` : ""),
          );
          for (const b of d.bullets) bullet(bulletText(b), MARGIN + HANG_INDENT);
        }
        break;
      }
      case "job": {
        const j = sheet.data.job;
        pairs([
          ["Responsibilities", j.responsibilities],
          ["Equipment", j.equipment.join(", ")],
          ["Customers", j.customers],
          ["Classified Material", j.classified_material],
        ]);
        bulletGroup("Team Contributions", j.team_contributions);
        break;
      }
      case "leadership": {
        const l = sheet.data.leadership;
        pairs([
          ["Supervised (Military)", String(l.supervised_military)],
          ["Supervised (Civilian)", String(l.supervised_civilian)],
          ["Via Subordinates", String(l.supervised_via_subordinates)],
          ["Equipment Value", l.equipment_value],
          ["Budget Managed", l.budget_managed],
        ]);
        bulletGroup("Instructor Roles", l.instructor_roles);
        bulletGroup("Mentoring", l.mentoring);
        bulletGroup("Retention Efforts", l.retention_efforts);
        break;
      }
      case "accomplishments": {
        for (const b of sheet.data.accomplishments) bullet(bulletText(b));
        break;
      }
      case "qualifications": {
        const q = sheet.data.qualifications;
        if (q.quals.length) {
          groupLabel("Qualifications");
          for (const r of q.quals) bullet(`${r.title} (${r.date})`);
        }
        if (q.education.length) {
          groupLabel("Education");
          for (const r of q.education)
            bullet(`${r.title} (${r.date})` + (r.credit_hours ? ` — ${r.credit_hours} credit hours` : ""));
        }
        if (q.awards.length) {
          groupLabel("Awards");
          for (const r of q.awards) bullet(`${r.title} (${r.date})`);
        }
        break;
      }
      case "off_duty": {
        const o = sheet.data.off_duty;
        bulletGroup("Education", o.education);
        bulletGroup("Community", o.community);
        bulletGroup("Navy PR", o.navy_pr);
        pairs([["Civilian Employment", o.civilian_employment]]);
        break;
      }
      case "pfa": {
        pairs([["Block 20 Code:", collapsePfa(sheet.data)]]);
        for (const c of sheet.data.pfa) {
          bullet(
            `${c.cycle}: ${c.result}  PRT ${c.prt_category ?? "—"} ${c.prt_score ?? ""}  BCA ${c.bca ?? "—"}` +
              (c.medically_waived ? "  MEDICALLY WAIVED" : "") +
              (c.notes ? `  ${c.notes}` : ""),
          );
        }
        break;
      }
      case "goals": {
        const g = sheet.data.goals;
        if (g.career_recommendations.length) {
          groupLabel("Career Recommendations (Block 41)");
          for (const r of g.career_recommendations) bullet(r);
        }
        pairs([
          ["Desired Duties", g.desired_duties],
          ["Goals Statement", g.goals_statement],
        ]);
        break;
      }
      case "counseling": {
        pairs([
          ["Date Counseled", sheet.data.counseling.date_counseled],
          ["Counselor", sheet.data.counseling.counselor],
        ]);
        break;
      }
      case "additional": {
        body(sheet.data.additional);
        break;
      }
    }
    y -= 6;
  }

  // ── footer pass (§4.4 step 5): stamp every page with the final count ────────
  const pages = pdf.getPages();
  const total = pages.length;
  const footerW = helv.widthOfTextAtSize(BRAG_PDF_FOOTER, 7);
  pages.forEach((p, i) => {
    p.drawText(BRAG_PDF_FOOTER, {
      x: Math.max(8, (PAGE_W - footerW) / 2),
      y: 14, size: 7, font: helv, color: FOOTER_GRAY,
    });
    const pn = `Page ${i + 1} of ${total}`;
    p.drawText(pn, {
      x: PAGE_W - MARGIN - helv.widthOfTextAtSize(pn, 7),
      y: 14, size: 7, font: helv, color: FOOTER_GRAY,
    });
  });

  return pdf.save();
}

/** drawText at an explicit y (section-bar text sits inside the bar rect, not on the flow baseline). */
function draw2(
  page: PDFPage, text: string, x: number, y: number,
  font: PDFFont, size: number, color: ReturnType<typeof rgb>,
) {
  page.drawText(text, { x, y, size, font, color });
}
