// lib/commentFit.ts
//
// Text-fit measurement for the fixed-width (Courier) narrative blocks. A single wrap
// algorithm backs the on-screen measuring canvas, the fit validation, and the PDF
// renderer so all three agree exactly (true WYSIWYG). Block 43 keeps its pitch toggle;
// blocks 28/29/44 use the shared FIELD_FIT config below.

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
 * The two comment-block settings the forms permit, and what each one physically IS.
 *
 * SOURCE, in the precedence this repo uses. The blank forms in public/ outrank
 * everything, and two of the three print the rule inside the comment block itself:
 *
 *   NAVPERS 1616/26 (EVAL) Block 43 and NAVPERS 1610/2 (FITREP) Block 41, verbatim:
 *     "Font must be 10 or 12 pitch (10 or 12 point) only. Use upper and lower case."
 *   NAVPERS 1616/27 (CHIEFEVAL) Block 40 prints NO typography sentence at all.
 *
 *   BUPERSINST 1610.10H (30 Jul 2025, w/ CH-1 and CH-2), para 13-2.a(1), page 13-1:
 *     "NAVFIT98A reports with 10- or 12-pitch will still be accepted."
 *   That is the ONLY occurrence of "pitch" in all 174 pages. The instruction names no
 *   font family, no point size, and never defines pitch or relates it to point — so the
 *   equivalence below is NOT a Navy claim and must not be cited as one.
 *
 * PITCH IS CHARACTERS PER INCH; POINT IS GLYPH HEIGHT. For a fixed-pitch font they are
 * inversely related, so the form's parenthetical "(10 or 12 point)" does NOT pair up in
 * the order it reads. Measured off the font this repo actually embeds,
 * public/fonts/CourierPrime-Regular.ttf — every printable ASCII glyph advances
 * 1228/2048 em = 0.5996094 em, i.e. it is genuinely monospaced:
 *
 *     10 point -> advance 5.9961 pt -> 72/5.9961 = 12.008 CPI  =>  10 point IS 12 PITCH
 *     12 point -> advance 7.1953 pt -> 72/7.1953 = 10.007 CPI  =>  12 point IS 10 PITCH
 *
 * (Nominal Courier is 0.6 em exactly, which would give 12.000 and 10.000; CourierPrime
 * is 0.065% narrower. That is why the CPI figures are 12.008/10.007 and not round.)
 *
 * charsPerLine is DERIVED from the printed box, not chosen. All three comment blocks
 * measure the SAME clear interior width — 547.200 pt — between their own printed
 * vertical rules (each rule 0.72 pt; rasterised at 600 dpi off the blanks in public/,
 * ink edges EVAL x[29.640, 576.840], CHIEFEVAL and FITREP x[31.680, 578.880]). Holding
 * back this file's house inset of 2.5 pt at each edge leaves 542.2 pt of usable width:
 *
 *     10-pitch: floor(542.2 / 7.1953) = floor(75.36) = 75 chars
 *     12-pitch: floor(542.2 / 5.9961) = floor(90.43) = 90 chars
 *
 * WHAT THIS REPLACES. APEX used to name a CPL target and solve for a font size:
 * size = min(12, (boxWidth - 4) / ((cpl + 0.5) * 0.6)) against cpl 90 or 84. Read back
 * off real generated PDFs, that rendered 10.0166 pt / 11.988 CPI for the button labelled
 * "10-Pitch" and 10.7278 pt / 11.193 CPI for the one labelled "12-Pitch" (9.9576 and
 * 10.6647 pt on the CHIEFEVAL, whose narrative width differed again). So:
 *   - "10-Pitch (90 CPL)" was really 12 pitch at ~10 point. Legal setting, INVERTED LABEL.
 *   - "12-Pitch (84 CPL)" was 11.19 CPI and 10.73 point — neither legal value in EITHER
 *     unit, i.e. a setting the printed form does not permit.
 * Size is now the input, because size is what the instruction constrains; CPL falls out
 * of the box. Do not reintroduce a CPL-target solver here.
 */
export const COMMENT_PITCH = {
  /** 10 characters per inch = 12 point. Larger type, less of it. */
  "10": { points: 12, charsPerLine: 75, label: "10-Pitch (12 pt · 75 CPL)" },
  /** 12 characters per inch = 10 point. */
  "12": { points: 10, charsPerLine: 90, label: "12-Pitch (10 pt · 90 CPL)" },
} as const;

export type CommentPitch = keyof typeof COMMENT_PITCH;

/** Narrows the historic `"10" | "12" | 10 | 12` callers to a table key. */
export const asCommentPitch = (
  pitch: CommentPitch | 10 | 12 | string | number | undefined,
): CommentPitch => (Number(pitch) === 10 ? "10" : "12");

/**
 * Stamp written beside `comment_pitch` by everything that SETS a pitch, so a stored
 * value can be told apart from one written before the meaning of "10" was corrected.
 *
 * WHY A DRAFT NEEDS THIS. The stored token did not change, but what it renders did:
 * "10" used to mean 90 CPL over 17/8/19 lines and now means 75 CPL over 14/6/16. A
 * draft saved under the old code and reopened under the new one would silently reflow —
 * a full EVAL Block 43 (17 lines x 90 chars) needs 20+ lines at 75 CPL, and everything
 * past line 14 would be dropped from the printed record.
 *
 * resolveCommentPitch() therefore reads any UNSTAMPED draft as 12-pitch, whatever token
 * it carries. That is the safe answer for both legacy values, not a guess:
 *   - legacy "10" rendered 90 CPL x 17/8/19 at 10.0166 pt; 12-pitch is 90 CPL x 17/8/19
 *     at exactly 10 pt. The rendering is IDENTICAL to within 0.017 pt. Nothing reflows.
 *   - legacy "12" rendered 84 CPL x 15/7/18. 12-pitch is strictly ROOMIER on both axes,
 *     so text that fit before still fits; the line count can only fall.
 *
 * BE PRECISE ABOUT WHAT IS GUARANTEED. The claim is NOT "no stored comment reflows" — a
 * legacy "12" draft demonstrably does: 84 CPL -> 90 CPL re-wraps a flowing paragraph and
 * six lines can become five. The guarantee is narrower, and is the one that matters:
 * NO STORED COMMENT REFLOWS *OUT OF ITS BOX*. Both legacy values land on a setting at
 * least as roomy on both axes, so line counts can only fall and no character that used to
 * print stops printing.
 *
 * SIGNED RECORDS, NOT JUST DRAFTS. app/api/pdf/route.ts regenerates the PDF from the row
 * on every export, so an already-signed legacy-"12" record re-renders after deploy at a
 * different size (10.7278 -> 10 pt), a different wrap (84 -> 90 CPL) and a different line
 * count. No rendered artifact is stored, so there is nothing to pin it to. That is
 * defensible — the size it used to render was legal in NEITHER unit, so the old output
 * was the defect — but it is a real change to the appearance of a record someone has
 * already signed, and it belongs in the release note rather than being discovered.
 */
export const COMMENT_PITCH_V = 2;

/**
 * The block_values keys that record a pitch choice. Spread this rather than assigning
 * `comment_pitch` alone — an unstamped write is indistinguishable from a legacy draft
 * and will read back as 12-pitch no matter what the caller asked for.
 */
export const commentPitchFields = (pitch: CommentPitch) => ({
  comment_pitch: pitch,
  comment_pitch_v: COMMENT_PITCH_V,
});

/** The pitch a stored draft actually prints at. See COMMENT_PITCH_V for the legacy rule. */
export function resolveCommentPitch(
  blockValues:
    | { comment_pitch?: string; comment_pitch_v?: number }
    | null
    | undefined,
): CommentPitch {
  if (blockValues?.comment_pitch_v !== COMMENT_PITCH_V) return "12";
  return asCommentPitch(blockValues.comment_pitch);
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
 * Capacity now falls out of a FIXED point size (COMMENT_PITCH above) rather than a size
 * solved from a CPL target, so every number below moved when the pitch labels were
 * corrected. With leading = 1.18 x size, the deepest legal first baseline for N lines is
 * boxFloor + 0.20022*size + (N-1)*leading, and the highest is headerFloor - 0.69092*size;
 * N is the largest count for which those two still admit a baseline.
 *
 *   NAVPERS 1616/26 (EVAL) Block 43 — clear interior y[253.44, 468.12], header ink
 *     floor 451.92. The two pitches render at different sizes and their legal
 *     first-baseline windows DO NOT INTERSECT, so pdfOverlay carries one baseline each:
 *     12-pitch (10 pt, leading 11.80): window [444.242, 445.011] -> 444.63
 *       (constant 458.63), 17 lines. Line 18 would need 456.042, above the header.
 *     10-pitch (12 pt, leading 14.16): window [439.923, 443.629] -> 441.78
 *       (constant 455.78), 14 lines. Line 15 would need 454.083, above the header.
 *
 *   NAVPERS 1616/27 (CHIEFEVAL) Block 40 — clear interior y[277.56, 380.64], header ink
 *     floor 371.52. 12-pitch window [362.162, 364.611], 8 lines; 10-pitch
 *     [350.763, 363.229], 6 lines. They overlap on [362.162, 363.229], so one baseline
 *     still serves both: 362.70 (chiefEvalOverlay b40_topBaseline). A 9th 12-pitch line
 *     would need 373.962 and a 7th 10-pitch line 364.923, both above the header.
 *
 *   NAVPERS 1610/2 (FITREP) Block 41 — clear interior y[226.44, 469.20], header ink
 *     floor 451.44. 12-pitch window [440.842, 444.531], 19 lines; 10-pitch
 *     [441.243, 443.149], 16 lines. Overlap [441.243, 443.149] -> 442.20, one baseline
 *     for both. Line 20 at 12-pitch would need 452.642, line 17 at 10-pitch 455.403.
 *     The old 443.9 is ABOVE the 10-pitch window and had to move. Note this change
 *     RELIEVES the binding case #36 documented: at a solved 10.7278 pt the legal window
 *     here was 0.241 pt wide, and at a fixed 10 pt it is 3.689 pt.
 *
 * The 12-pitch column is numerically unchanged from the "10" column #36 measured (17/8/19)
 * because #36's "10-pitch" was already rendering 11.99-12.06 CPI — 12 pitch, mislabelled.
 * The old "12" column (15/7/18, at 10.7278 pt) described a setting the forms do not permit
 * and has no successor; 14/6/16 is the TRUE 10-pitch capacity, which had never been built.
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
 *
 * ponytail: leading stays at APEX's existing 1.18 x size. BUPERSINST 1610.10H prescribes
 * no line spacing — "pitch" is its only typography word (13-2.a(1)) — so there is nothing
 * to calibrate against and tightening it would be an unsourced second change. If a source
 * for 6 lines/inch ever turns up, leading becomes 12.0 pt flat and every N below rises.
 */
const COMMENT_CAPACITY: Record<string, Record<CommentPitch, number>> = {
  EVAL: { "10": 14, "12": 17 }, // 1616/26 Block 43
  CHIEFEVAL: { "10": 6, "12": 8 }, // 1616/27 Block 40
  FITREP: { "10": 16, "12": 19 }, // 1610/2  Block 41
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
  pitch: CommentPitch | 10 | 12,
): number {
  const form = COMMENT_CAPACITY[reportType ?? ""] ?? COMMENT_CAPACITY.EVAL;
  return form[asCommentPitch(pitch)];
}

/**
 * Checks whether the given text fits the comment block of `reportType` at the selected
 * pitch (10-pitch = 12 pt = 75 CPL, 12-pitch = 10 pt = 90 CPL — see COMMENT_PITCH).
 *
 * `reportType` is REQUIRED on purpose. It used to be absent and every caller silently got
 * the EVAL's line count; making it a parameter the compiler demands is what proves no
 * caller is still asking the wrong form's question.
 */
export function checkCommentFit(
  text: string,
  pitch: CommentPitch | 10 | 12,
  reportType: string | undefined,
): CommentFitResult {
  const p = asCommentPitch(pitch);
  return measureTextFit(
    text,
    COMMENT_PITCH[p].charsPerLine,
    getCommentCapacity(reportType, p),
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
  /**
   * Block 29B on NAVPERS 1610/2 & 1616/27 (REV 05-2025) — taller duties box than 1616/26.
   *
   * FOUR lines is measured, not assumed, and it only holds because line 1 sits BESIDE the
   * 29A abbreviation box rather than under it. Both blanks print Block 29 as a cell
   * y[539.640, 600.840] whose lowest form ink is the 29A box floor at 577.800 — 38.16 pt
   * clear, which holds three lines of the 9.85-9.89 pt these blocks solve and not four.
   * The fourth line exists because the region to the RIGHT of the 29A box is clear from
   * the header floor down, so line 1 draws there and lines 2-4 fall in the full-width
   * remainder. That is why this spec carries a lead at all.
   *
   * THE LEAD IS 21, not 20, and the extra character is the whole point: 20 put line 1's
   * first glyph ON the 29A box's right stroke on a FITREP. Measured off the blanks at
   * 600 dpi, 29A's right stroke and the x line 1 starts at (b29b_x + lead x advance):
   *
   *   1610/2  (FITREP)     stroke x[155.760, 156.480]   lead 20 -> 153.80  OVERPRINTS
   *                                                     lead 21 -> 159.73  3.25 pt clear
   *   1616/27 (CHIEFEVAL)  stroke x[148.320, 149.040]   lead 20 -> 152.31  3.27 pt clear
   *                                                     lead 21 -> 158.22  9.18 pt clear
   *
   * So 21 is required by 1610/2 and merely roomier on 1616/27, which is what lets one
   * number serve both. 1616/26 keeps its own 20 in `primary_duties` above — its 29A box
   * is a third size again, and EVAL is not this form.
   *
   * Changing this moves the editor's measuring canvas, the validator, the brag-sheet
   * budget and the PDF together: every one of them reads the lead off the spec
   * getPrimaryDutiesFieldFit() returns. Do not read FIELD_FIT.primary_duties.firstLineLead
   * from a 1610/2 or 1616/27 caller — that is the EVAL's lead, and the two overlays used
   * to do exactly that.
   */
  primary_duties_extended: {
    block: 29,
    charsPerLine: 91,
    maxLines: 4,
    label: "Primary/Collateral/Watchstanding Duties",
    firstLineLead: 21,
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
