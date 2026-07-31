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
 * Method, per form. Rasterise page 2 at 600 dpi and mask the box's own VERTICAL side
 * rules — they put dark pixels in every row inside the block and otherwise read as
 * "printed ink" all the way down. That gives the bounding rules (all three forms stroke
 * at exactly 0.72 pt) and the lowest ink of the instruction header printed inside the
 * block. Capacity is then the number of lines whose ink stays inside that clear region,
 * with line 1 clear of the header.
 *
 * The ink envelope is the OUTLINE BBOXES of the font the overlays embed,
 * public/fonts/CourierPrime-Regular.ttf, over printable ASCII:
 *
 *     +0.6909 em above the baseline (backtick)      -0.2002 em below ('y', 'g', 'j')
 *
 * NOT the declared metrics, and specifically not "Descender -157/1000, CapHeight
 * 562/1000" — those belong to Adobe Courier, a different font this code does not embed.
 * CourierPrime declares descent -0.3418 and capHeight 0.5796. An earlier revision here
 * used metric estimates and ran 0.2-0.4 pt optimistic on every form: the header's lowest
 * ink is the parentheses in "(10 or 12 point)", which hang below the metric descender,
 * and 'y'/'g'/'j' hang 0.017 em below the value that revision assumed.
 *
 *   NAVPERS 1616/26 (EVAL) Block 43 — clear interior y[253.44, 468.12], header ink
 *     floor 451.92. The two pitches render at different sizes and their legal
 *     first-baseline windows DO NOT INTERSECT, so pdfOverlay carries one baseline each:
 *     10-pitch window [444.558, 445.000] -> 444.8 (constant 458.8), 17 lines,
 *       clearing the header by 0.20 and the floor by 0.24.
 *     12-pitch window [432.811, 444.508] -> 444.0 (constant 458.0), 15 lines,
 *       clearing the header by 0.51 with ~11 pt of floor slack.
 *     An 18th 10-pitch line would need a baseline of 456.4 and a 16th 12-pitch line
 *     445.5; both are above their own header ceiling, so neither exists at any legal
 *     baseline. A single shared 444.5 inked line 17 to 253.382 against the rule at
 *     253.44 — negative, though nothing was clipped or lost.
 *
 *   NAVPERS 1616/27 (CHIEFEVAL) Block 40 — clear interior y[277.56, 380.64], header ink
 *     floor 371.52, first baseline 363.0 (chiefEvalOverlay b40_topBaseline, from #34).
 *     10-pitch window [361.804, 364.640], 8 lines; 12-pitch [355.201, 364.152], 7 lines.
 *     A 9th line would need 373.6, well above the header. Comfortable on both pitches,
 *     so one baseline serves both. Independently reproduces the 8 / 7 measured on #34.
 *
 *   NAVPERS 1610/2 (FITREP) Block 41 — clear interior y[226.44, 469.20], header ink
 *     floor 451.44, first baseline 443.9 (the old 462.0 printed line 1 straight through
 *     that header).
 *     10-pitch window [441.197, 444.520], 19 lines. 12-pitch [443.788, 444.028] — only
 *     0.241 pt wide, the binding case — 18 lines, and 443.9 is its midpoint, clearing
 *     the header by 0.13 and the floor by 0.11.
 *
 * Margins this fine are real, not rounding — and they are also stable. An earlier
 * revision claimed poppler and Ghostscript disagreed by 0.12 pt on the tight cases and
 * centred the baselines to absorb that; the disagreement was an artefact of the
 * measuring instrument, not the renderers. Re-rasterising at 600 / 1200 / 2400 dpi, the
 * gap shrinks in exact proportion to pixel size and the two renderers agree on
 * byte-identical rows at 2400. The baselines stay centred because centring is free, not
 * because anything wobbles.
 *
 * Nor can the margin be eaten downstream. The overlay operators are appended to the SAME
 * page content stream as the form graphics, so printer fit-to-page and viewer zoom scale
 * the printed box and the typed text by one transform — the relative gap is preserved.
 * The one mechanism that could have changed relative geometry was font substitution, and
 * embedNarrativeFont (lib/pdfBoxText.ts) closed it. Page 2 carries no clip operators, so
 * even a negative margin would be a sub-pixel graze of a printed rule, never lost text.
 *
 * Do not nudge any of the four top baselines without re-deriving against the envelope.
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
