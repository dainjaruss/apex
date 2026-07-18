// tests/unit/bragSheetPdf.test.ts
//
// generateBragSheetPdf (brag-sheet spec §4.4, §9.3) — branded from-scratch
// pdf-lib document. Smoke-tested by re-extracting the produced bytes with
// unpdf and asserting sentinels: member name, the "Duties Assigned" section
// bar (verbatim BRAG_SECTIONS.title — case-sensitive), bullet text, the
// BRAG_PDF_FOOTER short form, and "Page n of m" on every page. Pagination,
// the empty-sheet worksheet rendering, and the StandardFonts.Courier fallback
// (no Courier Prime bytes) are covered. No network: font bytes come from
// public/fonts on disk.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { generateBragSheetPdf } from "@/lib/bragSheet/pdf";
import { emptyBragSheetData } from "@/lib/bragSheet/template";
import {
  BRAG_PDF_FOOTER,
  BRAG_SHEET_VERSION,
  type BragSheet,
} from "@/lib/bragSheet/types";

const courierPrime = new Uint8Array(
  fs.readFileSync(
    path.join(process.cwd(), "public", "fonts", "CourierPrime-Regular.ttf"),
  ),
);

const BULLET_TEXT = "Restored SIPR enclave connectivity ahead of schedule";
const FOOTER_SENTINEL = "Unofficial worksheet, not a NAVPERS form";

const fixtureSheet = (over: Partial<BragSheet> = {}): BragSheet => {
  const data = emptyBragSheetData();
  data.admin.member_name = "JONES, CARL R";
  data.admin.grade_rate = "IT1";
  data.duties.push({
    title: "LEADING PETTY OFFICER",
    kind: "primary",
    months_assigned: 12,
    is_most_significant: true,
    abbrev: "LPO",
    bullets: [{ text: BULLET_TEXT, metrics: "98.2% uptime" }],
  });
  data.pfa.push({
    cycle: "25-1",
    result: "P",
    prt_category: "Excellent",
    prt_score: 88,
    bca: "within",
  });
  data.pfa.push({ cycle: "25-2", result: "B" });
  return {
    id: "bs-1",
    user_id: "u1",
    report_type: "EVAL",
    period_from: "2025-03-16",
    period_to: "2026-03-15",
    template_version: BRAG_SHEET_VERSION,
    data,
    status: "draft",
    ...over,
  };
};

const extractPages = async (bytes: Uint8Array) => {
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(doc);
  return { totalPages, pages: text as string[] };
};

const extractMerged = async (bytes: Uint8Array) => {
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(doc, { mergePages: true });
  return text;
};

describe("generateBragSheetPdf — sentinel round-trip through unpdf (spec §9.3)", () => {
  it("re-extracted text contains name, section bar, bullet, footer, page count", async () => {
    const bytes = await generateBragSheetPdf(fixtureSheet(), { courierPrime });
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(1000);

    const text = await extractMerged(bytes);
    expect(text).toContain("JONES, CARL R");
    // Section bars render BRAG_SECTIONS.title verbatim — §4.4 mandates
    // UPPERCASE for field labels only. Case-sensitive on purpose.
    expect(text).toContain("Duties Assigned");
    expect(text).toContain(BULLET_TEXT);
    // The footer sentinel is asserted via the constant so the two can't drift.
    expect(BRAG_PDF_FOOTER).toContain(FOOTER_SENTINEL);
    expect(text).toContain(FOOTER_SENTINEL);
    expect(text).toContain("Page 1 of");
  });

  it("prints the collapsed Block 20 code and PFA cycle rows", async () => {
    const bytes = await generateBragSheetPdf(fixtureSheet(), { courierPrime });
    const text = await extractMerged(bytes);
    // Label and value may extract as separate text items — assert both parts.
    expect(text).toContain("BLOCK 20 CODE");
    expect(text).toContain("PB");
    expect(text).toContain("25-1");
  });

  it("sets the branded document title (spec §4.4 step 1)", async () => {
    const bytes = await generateBragSheetPdf(fixtureSheet(), { courierPrime });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getTitle()).toBe("APEX Brag Sheet v1.0 – Powered by APEX");
  });
});

describe("generateBragSheetPdf — pagination (spec §9.3)", () => {
  it("60 accomplishment bullets produce ≥2 pages with the footer on every page", async () => {
    const sheet = fixtureSheet();
    sheet.data.accomplishments = Array.from({ length: 60 }, (_, i) => ({
      text: `Accomplishment number ${i + 1} delivering measurable readiness improvements across the command`,
      metrics: `${i + 1} units`,
    }));

    const bytes = await generateBragSheetPdf(sheet, { courierPrime });
    const { totalPages, pages } = await extractPages(bytes);

    expect(totalPages).toBeGreaterThanOrEqual(2);
    expect(pages).toHaveLength(totalPages);
    for (const [i, pageText] of Array.from(pages.entries())) {
      expect(pageText, `footer missing on page ${i + 1}`).toMatch(
        /Page \d+ of \d+/,
      );
      expect(pageText, `brand footer missing on page ${i + 1}`).toContain(
        FOOTER_SENTINEL,
      );
    }
  });
});

describe("generateBragSheetPdf — empty sheet doubles as the blank worksheet", () => {
  it("renders without throwing and marks empty sections '— none entered —'", async () => {
    const sheet = fixtureSheet();
    sheet.data = emptyBragSheetData();

    const bytes = await generateBragSheetPdf(sheet, { courierPrime });
    const text = await extractMerged(bytes);
    expect(text).toContain("— none entered —");
    // All 11 section bars still render on the blank worksheet.
    expect(text).toContain("Duties Assigned");
    expect(text).toContain("Future Goals");
  });
});

describe("generateBragSheetPdf — font fallback (spec §4.4)", () => {
  it("works without courierPrime bytes (StandardFonts.Courier fallback)", async () => {
    const bytes = await generateBragSheetPdf(fixtureSheet());
    expect(bytes.length).toBeGreaterThan(1000);
    const text = await extractMerged(bytes);
    expect(text).toContain("JONES, CARL R");
    expect(text).toContain(BULLET_TEXT);
  });
});
