// lib/pdfBoxText.ts
//
// One drawing primitive shared by the NAVPERS overlays: write a value into a bordered
// cell that the official blank PRE-PRINTS A DEFAULT INTO.
//
// NAVPERS 1616/27 prints "0.0" inside every trait grade cell (Blocks 33-39), "0.00"
// inside the three average cells (43/44/45), "NOB" inside Block 41's individual
// promotion-recommendation cell and "0" inside both Block 42 ranking cells. 1610/2 and
// 1616/26 print the same class of defaults in their own summary and average cells.
// Drawing a value straight on top of one leaves "0.04.0" overprinted, so the cell has
// to be covered first.
//
// The cover is an opaque white rectangle appended to the page's content stream,
// immediately followed by the text. The official blank in public/ is never modified and
// the generated file stays byte-diffable against it — every difference is an appended
// operator, and deleting those operators restores the form exactly.

import { PDFFont, PDFPage, rgb } from "pdf-lib";

const WHITE = rgb(1, 1, 1);
const BLACK = rgb(0, 0, 0);

/**
 * A cell's interior in PDF user space (bottom-left origin, points): the span between
 * the innermost pixels of the cell's own printed borders, so insetting by ~1pt covers
 * the pre-printed value without erasing the border.
 */
export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface BoxTextOptions {
  /** Starting font size. Shrunk (never below 5pt) until the value fits the box width. */
  size?: number;
  /** How the blank prints that cell's own default. Block 41's "NOB" is left-set. */
  align?: "center" | "left";
  /** Points held back from each edge so the cell's printed border survives. */
  inset?: number;
}

// Courier's cap height is 0.583 em. Digits and capitals reach exactly that, so
// centring the cap box (rather than the full em box) puts "4.0" optically centred in
// the cell the way the form's own "0.0" sits.
const CAP_HEIGHT = 0.583;
const PAD = 2;

/**
 * Blank a cell: cover its pre-printed default and write nothing in its place.
 *
 * Needed wherever APEX holds no value for a cell the form pre-fills, because a
 * pre-filled default is not neutral. 1616/27 prints "0.00" in Block 44 (RSCA) and
 * "0 of 0" in Block 42 (Summary Ranking), both sitting beside averages APEX does
 * compute — nothing distinguishes them from computed figures, and a board reads them
 * as such. An empty cell says "not provided"; "0.00" says the reporting senior's
 * cumulative average is zero, and "0 of 0" says the Sailor ranked last of nobody.
 *
 * 1610/2 needs the same call for Block 42's pre-printed "X" when the report does not
 * select that column.
 */
export function coverBox(page: PDFPage, box: Box, inset = 1): void {
  page.drawRectangle({
    x: box.x0 + inset,
    y: box.y0 + inset,
    width: box.x1 - box.x0 - inset * 2,
    height: box.y1 - box.y0 - inset * 2,
    color: WHITE,
  });
}

/**
 * Cover a cell's pre-printed default with white, then draw `value` inside it.
 *
 * An empty value draws nothing at all and leaves the form's default showing. When the
 * cell should end up blank instead, call coverBox() — see its note on why "no data" and
 * "the form's default" are different statements.
 */
export function drawInBox(
  page: PDFPage,
  value: string | number | null | undefined,
  box: Box,
  font: PDFFont,
  { size = 10, align = "center", inset = 1 }: BoxTextOptions = {},
): void {
  const str = String(value ?? "").trim();
  if (!str) return;

  const boxW = box.x1 - box.x0;
  const boxH = box.y1 - box.y0;
  coverBox(page, box, inset);

  const room = boxW - inset * 2 - PAD * 2;
  const natural = font.widthOfTextAtSize(str, size);
  const s = natural > room ? Math.max(5, (size * room) / natural) : size;
  const w = font.widthOfTextAtSize(str, s);

  page.drawText(str, {
    x: align === "left" ? box.x0 + inset + PAD : box.x0 + (boxW - w) / 2,
    y: box.y0 + (boxH - s * CAP_HEIGHT) / 2,
    size: s,
    font,
    color: BLACK,
  });
}
