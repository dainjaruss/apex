// tests/unit/bragSheetExtract.test.ts
//
// In-memory PDF extraction + heuristic suggestions (brag-sheet spec §4.5,
// §9.4). extractPdfText round-trips a PDF generated in-test (never a stored
// fixture — invariant §1.2 item 1: uploads are never persisted, so neither
// are test fixtures). suggestFromText heuristics run on plain strings. The
// extract route is driven directly with jsdom File/FormData: 401/400/413/422,
// asserting the 413 boundary against the literal 10 * 1024 * 1024
// (MAX_EXTRACT_BYTES is deliberately not exported from the route file, §5.1).

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  getRouteUserId: vi.fn(),
  createAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/supabaseClient", () => ({
  getRouteUserId: h.getRouteUserId,
  createAdminClient: h.createAdminClient,
  createBrowserClient: vi.fn(() => ({})),
}));

// Never-persist enforcement (§1.2 item 1): wrap the fs WRITE APIs in
// call-through spies via vi.mock so any route-side import — named or default,
// "fs" or "node:fs" — hits the spy. (vi.spyOn on the module object misses ESM
// named-import bindings, which is exactly how a /tmp-write mutant would slip
// through.) Reads pass through untouched; nothing is stubbed out.
const fsw = vi.hoisted(() => ({
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  createWriteStream: vi.fn(),
  promisesWriteFile: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  fsw.writeFileSync.mockImplementation(actual.writeFileSync as any);
  fsw.appendFileSync.mockImplementation(actual.appendFileSync as any);
  fsw.createWriteStream.mockImplementation(actual.createWriteStream as any);
  const wrapped = {
    ...actual,
    writeFileSync: fsw.writeFileSync,
    appendFileSync: fsw.appendFileSync,
    createWriteStream: fsw.createWriteStream,
  };
  return { ...wrapped, default: wrapped };
});

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  fsw.promisesWriteFile.mockImplementation(actual.writeFile as any);
  const wrapped = { ...actual, writeFile: fsw.promisesWriteFile };
  return { ...wrapped, default: wrapped };
});

import { PDFDocument } from "pdf-lib";
import { extractPdfText, suggestFromText } from "@/lib/bragSheet/extract";
import { generateBragSheetPdf } from "@/lib/bragSheet/pdf";
import { emptyBragSheetData } from "@/lib/bragSheet/template";
import { BRAG_SHEET_VERSION, type BragSheet } from "@/lib/bragSheet/types";
import { POST } from "@/app/api/brag-sheet/extract/route";

const MAX_BYTES = 10 * 1024 * 1024; // the §5.1 literal — pinned, not imported

// jsdom's File/Blob lack arrayBuffer(); the route relies on it. Polyfill via
// FileReader (same spirit as the tests/setup.ts matchMedia polyfill).
if (typeof File !== "undefined" && !File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = function (this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(this);
    });
  };
}

const BULLET_TEXT = "Restored SIPR enclave connectivity ahead of schedule";

const fixtureSheet = (): BragSheet => {
  const data = emptyBragSheetData();
  data.admin.member_name = "JONES, CARL R";
  data.duties.push({
    title: "LEADING PETTY OFFICER",
    kind: "primary",
    months_assigned: 12,
    is_most_significant: true,
    bullets: [{ text: BULLET_TEXT, metrics: "4 hours" }],
  });
  return {
    id: "bs-1",
    user_id: "u1",
    report_type: "EVAL",
    period_from: "2025-03-16",
    period_to: "2026-03-15",
    template_version: BRAG_SHEET_VERSION,
    data,
    status: "draft",
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  h.getRouteUserId.mockResolvedValue("u1");
});

// ---------------------------------------------------------------------------
// extractPdfText — in-memory round-trip
// ---------------------------------------------------------------------------

describe("extractPdfText — recovers text from an in-test generated PDF (spec §9.4)", () => {
  it("returns the sentinels fully in memory", async () => {
    const bytes = await generateBragSheetPdf(fixtureSheet());
    const text = await extractPdfText(bytes);
    expect(text).toContain("JONES, CARL R");
    expect(text).toContain(BULLET_TEXT);
  });

  it("throws on unparseable input", async () => {
    const garbage = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    await expect(extractPdfText(garbage)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// suggestFromText — heuristics on plain strings (spec §4.5, normative regexes)
// ---------------------------------------------------------------------------

const PRIOR_EVAL_TEXT = [
  "EVALUATION REPORT & COUNSELING RECORD",
  "JONES, CARL R  IT1  USS ENTERPRISE",
  "Date Reported 2023-04-01",
  "Period 2024-03-16 to 2025-03-15",
  "LEADING PETTY OFFICER-12; NETWORK SECURITY-6",
  "- Led 12 Sailors through a no-notice INSURV with zero discrepancies found",
  "- Restored SIPR connectivity 4 hours ahead of schedule during POMCERT",
].join("\n");

describe("suggestFromText — prior-eval fixture", () => {
  it('detects kind "prior_eval" and extracts name / USS / dates', () => {
    const s = suggestFromText(PRIOR_EVAL_TEXT);
    expect(s.kind).toBe("prior_eval");
    expect(s.admin.member_name).toBe("JONES, CARL R");
    expect(s.admin.ship_station).toBe("USS ENTERPRISE");
    // Latest ISO date → prior_report_end; earliest only with the label nearby.
    expect(s.admin.prior_report_end).toBe("2025-03-15");
    expect(s.admin.date_reported).toBe("2023-04-01");
    expect(s.chars_extracted).toBeGreaterThan(0);
  });

  it("extracts title-months duty pairs — first primary + most significant, rest collateral", () => {
    const s = suggestFromText(PRIOR_EVAL_TEXT);
    expect(s.duties.length).toBeGreaterThanOrEqual(2);
    expect(s.duties[0]).toMatchObject({
      title: "LEADING PETTY OFFICER",
      months_assigned: 12,
      kind: "primary",
      is_most_significant: true,
    });
    expect(s.duties[1]).toMatchObject({
      title: "NETWORK SECURITY",
      months_assigned: 6,
      kind: "collateral",
    });
  });

  it("extracts candidate bullets (≥20 chars, '- ' lines), deduplicated", () => {
    const s = suggestFromText(PRIOR_EVAL_TEXT);
    expect(
      s.bullets.some((b) => b.includes("Led 12 Sailors through a no-notice INSURV")),
    ).toBe(true);
    expect(
      s.bullets.some((b) => b.includes("Restored SIPR connectivity")),
    ).toBe(true);
    expect(new Set(s.bullets).size).toBe(s.bullets.length);
  });
});

describe("suggestFromText — PRIMS fixture", () => {
  it('detects kind "prims" and extracts a cycle with title-cased category', () => {
    const s = suggestFromText(
      "PRIMS Official PFA Report\n25-1 P OUTSTANDING PRT 95\n",
    );
    expect(s.kind).toBe("prims");
    expect(s.pfa.length).toBeGreaterThanOrEqual(1);
    expect(s.pfa[0]).toMatchObject({
      cycle: "25-1",
      result: "P",
      prt_category: "Outstanding",
    });
  });
});

describe("suggestFromText — garbage input", () => {
  it('returns kind "unknown" with empty suggestions and never throws', () => {
    const s = suggestFromText("lorem ipsum dolor sit amet nothing navy here");
    expect(s.kind).toBe("unknown");
    expect(s.duties).toEqual([]);
    expect(s.quals).toEqual([]);
    expect(s.pfa).toEqual([]);
    expect(s.bullets).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/brag-sheet/extract — route error inventory (spec §5.1, §9.4)
// ---------------------------------------------------------------------------

const makeReq = (form: FormData | null) =>
  ({
    formData: async () => {
      if (!form) throw new Error("bad multipart body");
      return form;
    },
  }) as any;

const pdfFile = (
  content: BlobPart,
  name = "prior.pdf",
  type = "application/pdf",
) => new File([content], name, { type });

const formWith = (file: File) => {
  const form = new FormData();
  form.append("file", file);
  return form;
};

describe("POST /api/brag-sheet/extract — auth and input gates", () => {
  it("401 when unauthenticated", async () => {
    h.getRouteUserId.mockResolvedValue(null);
    const res = await POST(makeReq(new FormData()));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Not authenticated.");
  });

  it("400 when no file field is present", async () => {
    const res = await POST(makeReq(new FormData()));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Missing file.");
  });

  it("400 when the multipart body cannot be parsed", async () => {
    const res = await POST(makeReq(null));
    expect(res.status).toBe(400);
  });

  it("400 on a non-PDF file type", async () => {
    const res = await POST(
      makeReq(formWith(pdfFile("hello", "notes.txt", "text/plain"))),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Only PDF files are supported.");
  });

  it("413 one byte over the literal 10 * 1024 * 1024 cap", async () => {
    const res = await POST(
      makeReq(formWith(pdfFile(new Uint8Array(MAX_BYTES + 1)))),
    );
    expect(res.status).toBe(413);
    expect((await res.json()).error).toBe("File too large (10 MB max).");
  });

  it("a file exactly at the cap is NOT 413 (unreadable content → 422)", async () => {
    const res = await POST(
      makeReq(formWith(pdfFile(new Uint8Array(MAX_BYTES)))),
    );
    expect(res.status).toBe(422);
  });
});

describe("POST /api/brag-sheet/extract — content outcomes", () => {
  it("422 on a valid PDF with zero extractable text (scanned/image-only)", async () => {
    const empty = await PDFDocument.create();
    empty.addPage();
    const bytes = await empty.save();
    const res = await POST(makeReq(formWith(pdfFile(new Uint8Array(bytes)))));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe(
      "Could not extract text — scanned or image-only PDFs are not supported.",
    );
  });

  it("422 on unreadable bytes with the generic message", async () => {
    const res = await POST(
      makeReq(formWith(pdfFile(new Uint8Array([9, 9, 9, 9])))),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe("Could not read that PDF.");
  });

  it("200 returns BragExtractSuggestions for a readable PDF", async () => {
    const bytes = await generateBragSheetPdf(fixtureSheet());
    const res = await POST(makeReq(formWith(pdfFile(new Uint8Array(bytes)))));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(["prior_eval", "prims", "unknown"]).toContain(body.kind);
    expect(body.chars_extracted).toBeGreaterThan(0);
    expect(Array.isArray(body.bullets)).toBe(true);
    expect(Array.isArray(body.duties)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Never-persist invariant (§1.2 item 1) — a successful extraction must not
// write the upload (or anything else) to disk, a log file, or Supabase
// storage. Spies observe the real fs APIs; nothing is stubbed out.
// ---------------------------------------------------------------------------

describe("POST /api/brag-sheet/extract — uploads are NEVER persisted (§1.2 item 1)", () => {
  it("a successful extraction performs zero fs writes and never touches the admin client", async () => {
    const bytes = await generateBragSheetPdf(fixtureSheet());
    const res = await POST(makeReq(formWith(pdfFile(new Uint8Array(bytes)))));
    expect(res.status).toBe(200); // the invariant is asserted on the SUCCESS path

    expect(fsw.writeFileSync).not.toHaveBeenCalled();
    expect(fsw.appendFileSync).not.toHaveBeenCalled();
    expect(fsw.createWriteStream).not.toHaveBeenCalled();
    expect(fsw.promisesWriteFile).not.toHaveBeenCalled();
    // No storage upload either: the service-role client is never constructed.
    expect(h.createAdminClient).not.toHaveBeenCalled();
  });
});
