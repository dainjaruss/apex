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
 * Checks whether the given text fits in Block 43 comments space (18 lines maximum)
 * under the selected Courier pitch (10-pitch = 90 CPL, 12-pitch = 84 CPL).
 */
export function checkCommentFit(
  text: string,
  pitch: "10" | "12" | 10 | 12,
): CommentFitResult {
  const charsPerLine = Number(pitch) === 10 ? 90 : 84;
  return measureTextFit(text, charsPerLine, 18);
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
