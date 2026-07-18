// tests/unit/boardConfidenceLadrFetch.test.ts
//
// On-demand LaDR ingestion (v1.4): the conservative parser against a fixture
// derived from the REAL extracted YN E1-E9 LaDR text (July 2026, cool.osd.mil),
// store-time versioning/dedupe (never overwrite, spec §10.3), and rating
// validation on the fetcher (no network for bad input). No live network calls.
import { describe, it, expect, vi } from "vitest";
import {
  parseLadr,
  storeLadr,
  fetchLadrPdf,
  type ParsedLadr,
} from "@/lib/boardConfidence/ladrFetch";
import { LADR_CATEGORY_WEIGHTS } from "@/lib/boardConfidence/rubric";

// Representative excerpt of the real extracted YN LaDR text (head + NELD
// ladder mentions + PQS/warfare/education signals + COOL credential table).
const YN_FIXTURE = `Yeoman (YN) July 2026 United States Navy Ethos We are the United States Navy, our Nation's sea power - ready guardians of peace.
CAREER MILESTONES AVERAGE TIME TO ADVANCE COMMISSIONING OR OTHER SPECIAL PROGRAMS SEA/SHORE FLOW TYPICAL CAREER PATH DEVELOPMENT 25-30 YNCM 21.56 Yrs CMDCM, CSEL.
Enlisted Leadership Development: NELD-03 2 days. NELD-04 3 days Professional Military Knowledge Eligibility Exam (PMK-EE). NELD-05 4 days Professional Military Knowledge Eligibility Exam. NELD-06 5 days Ethics Training Command Delivered Required.
Personnel Qualification Standards (PQS), Job Qualification Requirements (JQR), or watchstation qualifications apply at every command.
Surface Warfare Specialist Submarine Warfare Specialist Aviation Warfare Specialist Expeditionary Warfare Specialist warfare qualifications, college enrollment, and USMAP certifications.
The following certifications and licenses are applicable to the YN-Yeoman rating. For more information visit NAVY COOL. Target Paygrade Certifying Agency Credential Title Date Completed E7 Human Resource Certification Institute (HRCI) Associate Professional in Human Resources (aPHR) E3 Microsoft Corporation Microsoft Office Specialist (MOS): Excel Associate (Office 2019) E5 Society for Human Resource Management (SHRM) SHRM Certified Professional (SHRM-CP)
Considerations for advancement from E6 to E7 1. Candidates eligible for selection to YNC should have documented leadership as an LPO or leading significant leadership positions within command programs, including leadership of peers. 2. Duty Assignments: Sea Duty: Serve onboard CVN, LHD, LHA, LSD, LPD, DDG, CG, CSG, ESG, CAG, DESRON, PHIBRON, sea going squadrons, and Joint operational commands.
Considerations for advancement from E7 to E8 1. Candidates eligible for selection to YNCS should have documented leadership as an LCPO or other significant leadership positions, including leadership up the chain of command.`;

const ALLOWED_CATEGORIES = new Set(Object.keys(LADR_CATEGORY_WEIGHTS));

describe("parseLadr — conservative extraction from real LaDR structure", () => {
  const parsed = parseLadr(YN_FIXTURE, "YN")!;

  it("parses the cover version and effective date from the document head", () => {
    expect(parsed).not.toBeNull();
    expect(parsed.rating_abbrev).toBe("YN");
    expect(parsed.rating_name).toBe("Yeoman");
    expect(parsed.version).toBe("July 2026");
    expect(parsed.effective_date).toBe("2026-07-01");
  });

  it("extracts a useful, valid milestone set", () => {
    expect(parsed.milestones.length).toBeGreaterThanOrEqual(8);
    for (const m of parsed.milestones) {
      expect(ALLOWED_CATEGORIES.has(m.category)).toBe(true);
      expect(m.item.length).toBeGreaterThan(3);
      expect(m.applies_to_paygrades.length).toBeGreaterThan(0);
      for (const p of m.applies_to_paygrades) {
        expect(p).toBeGreaterThanOrEqual(2);
        expect(p).toBeLessThanOrEqual(9);
      }
      // EVERY auto-ingested milestone is flagged for UI verification notes.
      expect(m.detail.source).toBe("auto_extracted");
    }
  });

  it("maps the NELD ladder to pme_required by paygrade", () => {
    const neld = parsed.milestones.filter((m) => m.category === "pme_required");
    expect(neld.map((m) => m.item_code).sort()).toEqual([
      "NELD-03",
      "NELD-04",
      "NELD-05",
      "NELD-06",
    ]);
    expect(
      neld.find((m) => m.item_code === "NELD-05")!.applies_to_paygrades,
    ).toEqual([6]);
  });

  it("extracts COOL credentials with their printed target paygrades", () => {
    const creds = parsed.milestones.filter((m) => m.category === "credential");
    expect(creds.length).toBeGreaterThanOrEqual(3);
    const aphr = creds.find((m) => m.item.includes("aPHR"));
    expect(aphr).toBeDefined();
    expect(aphr!.applies_to_paygrades).toEqual([7]);
    const shrm = creds.find((m) => m.item.includes("SHRM"));
    expect(shrm!.applies_to_paygrades).toEqual([5]);
  });

  it("v1.5: extracts 'Considerations for advancement' items as board-emphasis milestones", () => {
    const ac = parsed.milestones.filter(
      (m) => m.category === "advancement_consideration",
    );
    // 2 items in the E6→E7 block, 1 in E7→E8.
    expect(ac.length).toBe(3);
    const e7 = ac.filter((m) => m.applies_to_paygrades.join() === "7");
    const e8 = ac.filter((m) => m.applies_to_paygrades.join() === "8");
    expect(e7.length).toBe(2);
    expect(e8.length).toBe(1);
    for (const m of ac) {
      expect(m.detail.board_emphasis).toBe(true);
      expect(m.item).toMatch(/^E[789] board: /);
      expect(typeof m.detail.notes).toBe("string");
    }
    expect(e7[0].item).toContain("Candidates eligible for selection to YNC");
    expect(e8[0].item).toContain("YNCS");
  });

  it("v1.5: a table-of-contents 'Considerations…' entry harvests no milestones", () => {
    // TOC line (dot leaders + page number) followed by unrelated front-matter.
    const toc =
      "Yeoman (YN) July 2026 Table of Contents Considerations for advancement " +
      "from E8 to E9 ..... 14 1. Purpose of this instruction is broad and applies " +
      "to all hands. 2. Scope covers every Sailor in the community worldwide.";
    const p = parseLadr(toc, "YN")!;
    expect(
      p.milestones.filter((m) => m.category === "advancement_consideration"),
    ).toHaveLength(0);
  });

  it("v1.5: does not split a numbered item on a back-reference inside its prose", () => {
    const prose =
      "Yeoman (YN) July 2026 header. Considerations for advancement from E6 to E7 " +
      "1. Sustained superior performance documented per reference 1. Documented " +
      "leadership of junior Sailors is essential for every advancement candidate.";
    const ac = parseLadr(prose, "YN")!.milestones.filter(
      (m) => m.category === "advancement_consideration",
    );
    expect(ac).toHaveLength(1); // one item, not split at "reference 1."
    expect(ac[0].item).toContain("Sustained superior performance");
  });

  it("returns null on text with no LaDR head (never guesses)", () => {
    expect(parseLadr("random unrelated document text", "YN")).toBeNull();
    expect(parseLadr(YN_FIXTURE, "IT")).toBeNull(); // wrong-rating head
  });
});

describe("storeLadr — versioned, never overwrites (spec §10.3)", () => {
  const parsed: ParsedLadr = parseLadr(YN_FIXTURE, "YN")!;

  const makeAdmin = (existingId: string | null) => {
    const inserted: Record<string, unknown[]> = {};
    const docBuilder: any = {
      select: vi.fn(() => docBuilder),
      eq: vi.fn(() => docBuilder),
      maybeSingle: vi.fn(async () => ({
        data: existingId ? { id: existingId } : null,
        error: null,
      })),
      single: vi.fn(async () => ({ data: { id: "new-doc" }, error: null })),
      insert: vi.fn((rows: unknown[]) => {
        inserted["ladr_documents"] = rows;
        return docBuilder;
      }),
      delete: vi.fn(() => docBuilder),
    };
    const msBuilder: any = {
      select: vi.fn(() => msBuilder),
      eq: vi.fn(() => msBuilder),
      then: (onF: any) => Promise.resolve({ count: 5, error: null }).then(onF),
      insert: vi.fn(async (rows: unknown[]) => {
        inserted["ladr_milestones"] = rows;
        return { error: null };
      }),
    };
    const client: any = {
      from: vi.fn((table: string) =>
        table === "ladr_documents" ? docBuilder : msBuilder,
      ),
    };
    return { client, inserted, docBuilder, msBuilder };
  };

  it("dedupes on (rating, version): existing issue → already_current, zero inserts", async () => {
    const { client, inserted, docBuilder } = makeAdmin("doc-1");
    const res = await storeLadr(client, parsed, "https://x/yn.pdf", "hash");
    expect(res.status).toBe("already_current");
    expect(res.documentId).toBe("doc-1");
    expect(docBuilder.eq).toHaveBeenCalledWith("rating_abbrev", "YN");
    expect(docBuilder.eq).toHaveBeenCalledWith("version", "July 2026");
    expect(inserted["ladr_documents"]).toBeUndefined();
    expect(inserted["ladr_milestones"]).toBeUndefined();
  });

  it("stores a new versioned document + flagged milestones when absent", async () => {
    const { client, inserted } = makeAdmin(null);
    const res = await storeLadr(client, parsed, "https://x/yn.pdf", "hash123");
    expect(res.status).toBe("stored");
    expect(res.milestones).toBe(parsed.milestones.length);
    const doc = (inserted["ladr_documents"] as any[])[0];
    expect(doc.version).toBe("July 2026");
    expect(doc.source_hash).toBe("hash123");
    expect(doc.paygrade_range).toBe("E1-E9");
    const rows = inserted["ladr_milestones"] as any[];
    expect(rows).toHaveLength(parsed.milestones.length);
    expect(rows.every((r) => r.detail.source === "auto_extracted")).toBe(true);
    expect(rows.map((r) => r.sort_order)).toEqual(rows.map((_, i) => i));
  });
});

describe("fetchLadrPdf — input validation before any network", () => {
  it("rejects unknown ratings without touching the network", async () => {
    const res = await fetchLadrPdf("NOPE");
    expect(res.status).toBe("error");
  });
});
