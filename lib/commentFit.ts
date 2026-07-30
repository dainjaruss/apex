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
 * MEASURED off the blank forms in public/ — the forms outrank this comment. Method, per
 * form: read the comment box's own printed top/bottom rules out of the blank's content
 * stream (rule centrelines ± half the 0.72 pt stroke = the box interior), then walk the
 * renderer's own text model down from the first typed baseline and count the lines whose
 * DESCENDER still clears the box floor. The renderer's model (narrative() in the three
 * overlays) is: size = min(12, (boxWidth - 4) / ((cpl + 0.5) * 0.6)), leading = 1.18 x
 * size, Courier descender = 0.157 em (pdf-lib's own Courier Descender, -157/1000).
 *
 *   NAVPERS 1616/26 (EVAL) Block 43 — box interior y[253.48, 468.04], first baseline
 *     436.00 (constant 450.0 through pdfOverlay's page-2 translate, dy -14).
 *     10-pitch: size 10.0166, leading 11.8196, descender 1.573.
 *       (436.00 - 1.573 - 253.48) / 11.8196 = 15.31 -> floor 15, +1 = 16 lines.
 *       Line 16 baseline 258.71 (descender 257.13, clears by 3.65 pt); line 17 baseline
 *       246.89 — 8.17 pt BELOW the box, printed over the Block 44 header.
 *     12-pitch: size 10.7278, leading 12.6588, descender 1.684.
 *       (436.00 - 1.684 - 253.48) / 12.6588 = 14.29 -> 15 lines.
 *     17 lines would need a first baseline of 444.16 or higher, and the printed
 *     instruction header's descender sits at 452.26 — under 2.5 pt of clearance. 16 is
 *     the form's answer, not an artefact of where the renderer happens to start.
 *
 *   NAVPERS 1616/27 (CHIEFEVAL) Block 40 — box interior y[277.56, 380.52], first
 *     baseline 363.0. This form's overlay uses a wider narrative box, so the same
 *     formula yields size 9.9576 / leading 11.750 at 10-pitch.
 *       (363.0 - 1.563 - 277.56) / 11.750 = 7.14 -> 8 lines. Line 8's descender lands at
 *       279.19, 1.63 pt inside; line 9's BASELINE is 269.00, 8.56 pt below the floor.
 *     12-pitch: size 10.6647, leading 12.5844 ->
 *       (363.0 - 1.674 - 277.56) / 12.5844 = 6.65 -> 7 lines.
 *     Independently reproduces the 8 / 7 measured on PR #34 (b40_lines10 / b40_lines12).
 *
 *   NAVPERS 1610/2 (FITREP) Block 41 — box interior y[226.44, 469.08], first baseline
 *     444.0 (fitrepOverlay b43_topBaseline; the old 462.0 printed line 1 on top of the
 *     form's own instruction header, whose descender is at 451.86).
 *     10-pitch: (444.0 - 1.573 - 226.44) / 11.8196 = 18.27 -> 19 lines.
 *     12-pitch: (444.0 - 1.684 - 226.44) / 12.6588 = 17.05 -> 18 lines.
 *     Both hold across the entire legal band for that baseline (444.0 up to 446.0, where
 *     line 1 starts colliding with the header), so neither is knife-edge.
 *
 * tests/unit/commentCapacity.test.ts renders real PDFs off these blanks and asserts every
 * line lands inside the measured box, so the renderer and this table cannot drift apart
 * without that test going red.
 */
const COMMENT_CAPACITY: Record<string, { "10": number; "12": number }> = {
  EVAL: { "10": 16, "12": 15 }, // 1616/26 Block 43
  CHIEFEVAL: { "10": 8, "12": 7 }, // 1616/27 Block 40
  FITREP: { "10": 19, "12": 18 }, // 1610/2  Block 41
};

/**
 * Printed-line capacity of the comment block for this form at this pitch.
 *
 * Same shape as traitStandards' getCommentsBlock(): an unknown or absent report type
 * falls back to the enlisted EVAL, the form APEX defaults to everywhere else. That
 * fallback is never more generous than CHIEFEVAL's real capacity would be, so it cannot
 * invent room a form does not have.
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
