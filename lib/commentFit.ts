// lib/commentFit.ts
//
// Text-fit measurement for the fixed-width (Courier) narrative blocks. A single wrap
// algorithm backs the on-screen measuring canvas, the fit validation, and the PDF
// renderer so all three agree exactly (true WYSIWYG). Block 43 keeps its pitch toggle
// (90/84 CPL); blocks 28/29/44 use the shared FIELD_FIT config below.

export interface CommentFitResult {
  fit: boolean;
  linesUsed: number;
  maxLines: number;
  charsPerLine: number;
  wrappedLines: string[];
}

/**
 * Wraps text into lines based on a maximum characters-per-line constraint.
 * Preserves explicit newlines and force-splits words longer than the line width.
 */
export function wrapTextToWidth(text: string, charsPerLine: number): string[] {
  const paragraphs = text.split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph === "") {
      lines.push("");
      continue;
    }

    const words = paragraph.split(" ");
    let currentLine = "";

    for (const word of words) {
      if (word === "") {
        // Handle multiple sequential spaces
        currentLine += " ";
        continue;
      }

      if (currentLine.length === 0) {
        let remaining = word;
        while (remaining.length > charsPerLine) {
          lines.push(remaining.substring(0, charsPerLine));
          remaining = remaining.substring(charsPerLine);
        }
        currentLine = remaining;
      } else {
        const spacing = currentLine.endsWith(" ") ? "" : " ";
        const potentialLength =
          currentLine.length + spacing.length + word.length;

        if (potentialLength <= charsPerLine) {
          currentLine += spacing + word;
        } else {
          lines.push(currentLine);
          let remaining = word;
          while (remaining.length > charsPerLine) {
            lines.push(remaining.substring(0, charsPerLine));
            remaining = remaining.substring(charsPerLine);
          }
          currentLine = remaining;
        }
      }
    }

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }
  }

  return lines;
}

/**
 * Generic fit measurement: wraps `text` to `charsPerLine` and reports whether the
 * result fits within `maxLines`.
 *
 * `firstLineLead` reserves that many characters on line 1 — e.g. Block 29A's
 * abbreviation box shares Block 29's first printed line, so the 29B narrative's first
 * line is that much shorter. This mirrors the PDF renderer's narrativeWithLead padding
 * exactly, keeping the on-screen fit, the validation, and the PDF in agreement.
 */
export function measureTextFit(
  text: string,
  charsPerLine: number,
  maxLines: number,
  firstLineLead = 0,
): CommentFitResult {
  if (!text) {
    return {
      fit: true,
      linesUsed: 0,
      maxLines,
      charsPerLine,
      wrappedLines: [],
    };
  }
  const lead = Math.max(0, firstLineLead);
  const wrappedLines = wrapTextToWidth(
    lead > 0 ? " ".repeat(lead) + text : text,
    charsPerLine,
  );
  // Drop the reserved-lead spaces from the returned first line; the line count (which
  // includes the lead's effect) is what matters for the fit check.
  if (lead > 0 && wrappedLines.length > 0) {
    wrappedLines[0] = wrappedLines[0].slice(lead);
  }
  return {
    fit: wrappedLines.length <= maxLines,
    linesUsed: wrappedLines.length,
    maxLines,
    charsPerLine,
    wrappedLines,
  };
}

/**
 * Comment-block capacity in PRINTED LINES, per report type and Courier pitch.
 *
 * This was a single hardcoded 18 for every form. 18 came from NAVPERS 1616/26 and was
 * never true even there; on 1616/27 it is more than double the real capacity, so a Chief
 * could pass validation, sign, and lose ten lines off the printed record with no marker.
 *
 * MEASURED off the blank forms in public/ — the forms outrank this comment.
 *
 * Method: rasterise each blank's page 2 at 600 dpi, mask the box's own vertical side
 * rules (they put dark pixels in every row and otherwise read as "printed ink" all the
 * way down), and take the REAL INK extents — the bounding rules, and the lowest ink of
 * the instruction header the form prints inside the block. Every rule on all three forms
 * measures exactly 0.72 pt. Then draw mixed-case Courier into a blank page at the
 * candidate first baseline, re-rasterise, and check the drawn ink against those bounds.
 *
 * Real ink, not glyph metrics. An earlier pass used the font's declared descender and
 * came out 0.2-0.4 pt optimistic on every form, because the header's lowest ink is the
 * parentheses in "(10 or 12 point)", which hang below the metric descender. Both fonts
 * the renderer can embed were checked (public/fonts/CourierPrime-Regular.ttf and the
 * StandardFonts.Courier fallback at pdfOverlay.ts); CourierPrime is the binding one.
 *
 *   NAVPERS 1616/26 (EVAL) Block 43 — clear interior y[253.44, 468.12], header ink
 *     floor 452.04, first baseline 444.5 (constant 458.5 through pdfOverlay's page-2
 *     translate, dy -14).
 *     10-pitch: 17 lines ink y[253.56, 451.44] — clears the header by 0.60, the floor
 *       by 0.12.
 *     12-pitch: 15 lines ink y[265.32, 451.92] — clears the header by 0.12.
 *     Narrow window, and it is the reason the constant is what it is: 12-pitch line 1
 *     caps the baseline at 444.62, 10-pitch line 17 floors it at 444.38, so 444.5 is the
 *     midpoint. A 16th 12-pitch line or an 18th 10-pitch line does not exist at any
 *     baseline in that window.
 *
 *   NAVPERS 1616/27 (CHIEFEVAL) Block 40 — clear interior y[277.56, 380.64], header ink
 *     floor 371.64, first baseline 363.0 (chiefEvalOverlay b40_topBaseline, from #34).
 *     10-pitch: 8 lines ink y[278.88, 369.72] — clears the floor by 1.32, header by 1.92.
 *       A 9th line inks down to 270.00, 7.56 pt BELOW the box floor.
 *     12-pitch: 7 lines ink y[285.48, 370.20].
 *     Independently reproduces the 8 / 7 measured on PR #34.
 *
 *   NAVPERS 1610/2 (FITREP) Block 41 — clear interior y[226.44, 469.20], header ink
 *     floor 451.56, first baseline 444.0 (fitrepOverlay b43_topBaseline; the old 462.0
 *     printed line 1 straight through that header).
 *     10-pitch: 19 lines. 12-pitch: 18 lines, ink y[226.80, 451.32] — the binding case,
 *       clearing the header by 0.24 and the floor by 0.36.
 *
 * The EVAL's 0.12 pt and the FITREP's 0.24 pt are real clearances, not rounding: at
 * 600 dpi one pixel is 0.12 pt, so they were confirmed by drawing the text and looking,
 * not by arithmetic. Do not nudge any of the three top baselines without re-rastering.
 *
 * tests/unit/commentCapacity.test.ts renders real PDFs off these blanks and asserts every
 * line lands inside the measured box, so the renderer and this table cannot drift apart
 * without that test going red.
 */
const COMMENT_CAPACITY: Record<string, { "10": number; "12": number }> = {
  EVAL: { "10": 17, "12": 15 }, // 1616/26 Block 43
  CHIEFEVAL: { "10": 8, "12": 7 }, // 1616/27 Block 40
  FITREP: { "10": 19, "12": 18 }, // 1610/2  Block 41
};

/**
 * Printed-line capacity of the comment block for this form at this pitch.
 *
 * Same shape as traitStandards' getCommentsBlock(): an unknown or absent report type
 * falls back to the enlisted EVAL, the form APEX defaults to everywhere else.
 *
 * That fallback is a guess, and on a CHIEFEVAL it would be a generous one — 17 against a
 * real capacity of 8. It is safe only because it is unreachable in practice: every caller
 * passes a report_type that came out of the row, and the three real values are pinned in
 * tests/unit/commentCapacity.test.ts. If a fourth form is ever added, add it to the table
 * in the same commit — do NOT rely on this fallback to be conservative, because it isn't.
 */
export function getCommentCapacity(
  reportType: string | undefined,
  pitch: "10" | "12" | 10 | 12,
): number {
  const form = COMMENT_CAPACITY[reportType ?? ""] ?? COMMENT_CAPACITY.EVAL;
  return Number(pitch) === 10 ? form["10"] : form["12"];
}

/**
 * Checks whether the given text fits the comment block of `reportType` at the selected
 * Courier pitch (10-pitch = 90 CPL, 12-pitch = 84 CPL).
 *
 * `reportType` is REQUIRED on purpose. It used to be absent and every caller silently got
 * the EVAL's line count; making it a parameter the compiler demands is what proves no
 * caller is still asking the wrong form's question.
 */
export function checkCommentFit(
  text: string,
  pitch: "10" | "12" | 10 | 12,
  reportType: string | undefined,
): CommentFitResult {
  const charsPerLine = Number(pitch) === 10 ? 90 : 84;
  return measureTextFit(
    text,
    charsPerLine,
    getCommentCapacity(reportType, pitch),
  );
}

/**
 * Fixed-width narrative blocks that share the Block-43-style measuring canvas.
 * 95 CPL is provisional and may be tuned once verified against the printed PDF.
 */
export interface FieldFitSpec {
  block: number;
  charsPerLine: number;
  maxLines: number;
  label: string;
  /**
   * Characters reserved on line 1 for an inline lead box. Block 29's first printed line
   * is shared with the 29A abbreviation box (20 chars ≈ box width at the 29B font size),
   * so the 29B narrative's first line holds that many fewer characters. The PDF renderer
   * (narrativeWithLead) pads by the same amount so screen, validation, and PDF agree.
   */
  firstLineLead?: number;
}

export const FIELD_FIT: Record<string, FieldFitSpec> = {
  command_achievements: {
    block: 28,
    charsPerLine: 91,
    maxLines: 3,
    label: "Command Employment and Achievements",
  },
  primary_duties: {
    block: 29,
    charsPerLine: 91,
    maxLines: 3,
    label: "Primary/Collateral/Watchstanding Duties",
    firstLineLead: 20,
  },
  /** Block 29B on NAVPERS 1610/2 & 1616/27 (REV 05-2025) — taller duties box than 1616/26. */
  primary_duties_extended: {
    block: 29,
    charsPerLine: 91,
    maxLines: 4,
    label: "Primary/Collateral/Watchstanding Duties",
    firstLineLead: 20,
  },
  qualifications: {
    block: 44,
    charsPerLine: 91,
    maxLines: 2,
    label: "Qualifications / Achievements",
  },
  reporting_senior_address: {
    block: 48,
    charsPerLine: 30,
    maxLines: 3,
    label: "Reporting Senior Address",
  },
};

// Block 29 primary-duty abbreviation (section A) — fixed-width box.
export const PRIMARY_DUTY_ABBREV_MAX = 14;

/**
 * Block 29B narrative fit spec by report type. EVAL (1616/26) = 3 lines;
 * FITREP (1610/2) and CHIEFEVAL (1616/27) templates measure 4 lines at 91 CPL
 * (same 29A first-line lead as enlisted).
 */
export function getPrimaryDutiesFieldFit(
  reportType?: string,
): FieldFitSpec {
  if (reportType === "FITREP" || reportType === "CHIEFEVAL") {
    return FIELD_FIT.primary_duties_extended;
  }
  return FIELD_FIT.primary_duties;
}
