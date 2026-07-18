// tests/unit/bragSheetTemplate.test.ts
//
// Template v1.0 (brag-sheet spec §4.3, §9.2): emptyBragSheetData satisfies
// BragSheetDataSchema, the JSON export/import round-trip is lossless, and
// collapsePfa is the deterministic Block 20 producer. Plus the §9.7 apply-flow
// contract: applyBragDraft (with saveDraft mocked) never writes the promotion
// advisory or trait grades, sets no custody/system fields, carries the
// deterministic Block 20/30/31 values, omits Block 44 for CHIEFEVAL, and links
// evaluation_id + status "submitted" on the sheet afterward.

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => {
  const updates: { table: string; patch: any; id: string }[] = [];
  const client = {
    from: (table: string) => ({
      update: (patch: any) => ({
        eq: (_col: string, id: string) => {
          updates.push({ table, patch, id });
          return {
            select: () => ({
              single: async () => ({ data: { id, ...patch }, error: null }),
            }),
          };
        },
      }),
    }),
  };
  return { updates, client, saveDraft: vi.fn() };
});

vi.mock("@/lib/supabaseClient", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, createBrowserClient: () => h.client };
});

vi.mock("@/lib/evaluationService", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, saveDraft: h.saveDraft };
});

import {
  emptyBragSheetData,
  collapsePfa,
  BRAG_SECTIONS,
} from "@/lib/bragSheet/template";
import { BragSheetDataSchema } from "@/lib/bragSheet/autofill";
import {
  BRAG_SHEET_VERSION,
  type BragSheet,
  type BragSheetData,
} from "@/lib/bragSheet/types";
import { applyBragDraft } from "@/lib/bragSheetService";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const fixtureData = (): BragSheetData => {
  const d = emptyBragSheetData();
  d.admin.member_name = "JONES, CARL R";
  d.admin.grade_rate = "IT2";
  d.admin.dod_id = "1234567890";
  d.admin.date_reported = "2024-06-01";
  d.admin.periods_unavailable.push({
    start: "2025-06-01",
    end: "2025-06-14",
    reason: "TEMADD",
  });
  d.duties.push({
    title: "LEADING PETTY OFFICER",
    kind: "primary",
    months_assigned: 12,
    is_most_significant: true,
    abbrev: "LPO",
    bullets: [{ text: "Led 12 Sailors through INSURV", metrics: "12 Sailors" }],
  });
  d.accomplishments.push({
    text: "Rebuilt the SIPR enclave",
    metrics: "98.2% uptime",
    trait_hint: "knowledge",
  });
  d.qualifications.quals.push({ title: "ESWS", date: "2025-08-01" });
  d.pfa.push({
    cycle: "25-1",
    result: "P",
    prt_category: "Excellent",
    prt_score: 88,
    bca: "within",
  });
  d.pfa.push({ cycle: "25-2", result: "B", notes: "Bad day - alternate cardio" });
  d.goals.career_recommendations.push("IWO SCHOOL");
  d.goals.desired_duties = "NIOC MARYLAND";
  d.counseling = { date_counseled: "2025-09-15", counselor: "SMITH, ANN B" };
  d.additional = "Sustained superior performance all period.";
  return d;
};

const fixtureSheet = (over: Partial<BragSheet> = {}): BragSheet => ({
  id: "bs-1",
  user_id: "u1",
  report_type: "EVAL",
  period_from: "2025-03-16",
  period_to: "2026-03-15",
  template_version: BRAG_SHEET_VERSION,
  data: fixtureData(),
  status: "draft",
  consented_at: "2026-07-18T00:00:00.000Z",
  ...over,
});

// ---------------------------------------------------------------------------
// §9.2 — template + schema
// ---------------------------------------------------------------------------

describe("emptyBragSheetData — schema-valid empty payload (spec §4.3)", () => {
  it("satisfies BragSheetDataSchema.parse", () => {
    expect(() => BragSheetDataSchema.parse(emptyBragSheetData())).not.toThrow();
  });

  it("covers every BRAG_SECTIONS key (11 ordered sections)", () => {
    const d = emptyBragSheetData();
    expect(BRAG_SECTIONS).toHaveLength(11);
    for (const s of BRAG_SECTIONS) {
      expect(d).toHaveProperty(s.key);
    }
  });
});

describe("JSON round-trip (export → import, spec §9.2)", () => {
  it("stringify → parse → schema parse is deep-equal to the fixture", () => {
    const fix = fixtureData();
    const roundTripped = BragSheetDataSchema.parse(
      JSON.parse(JSON.stringify(fix)),
    );
    expect(roundTripped).toEqual(fix);
  });
});

describe("collapsePfa — deterministic Block 20 (spec §4.3)", () => {
  it('[P, B, F] cycles collapse to "PBF"', () => {
    const d = emptyBragSheetData();
    d.pfa.push(
      { cycle: "24-1", result: "P" },
      { cycle: "24-2", result: "B" },
      { cycle: "25-1", result: "F" },
    );
    expect(collapsePfa(d)).toBe("PBF");
  });

  it('empty pfa collapses to ""', () => {
    expect(collapsePfa(emptyBragSheetData())).toBe("");
  });

  it("preserves cycle order exactly (never sorts)", () => {
    const d = emptyBragSheetData();
    d.pfa.push({ cycle: "25-2", result: "F" }, { cycle: "25-1", result: "P" });
    expect(collapsePfa(d)).toBe("FP");
  });
});

// ---------------------------------------------------------------------------
// §9.7 — applyBragDraft (saveDraft mocked)
// ---------------------------------------------------------------------------

// Custody/system fields saveDraft owns — the draft must not carry any (§5.3).
const FORBIDDEN_FIELDS = [
  "id",
  "created_at",
  "updated_at",
  "created_by",
  "current_holder_id",
  "participants",
  "routing_stage",
  "trait_average",
  "reviewer_id",
  "summary_group_id",
  "signature_locked",
  "pdf_storage_path",
];

const accepted = {
  comments: "LED 12 SAILORS THROUGH INSURV WITH ZERO DISCREPANCIES",
  primary_duty_abbrev: "LPO",
  primary_duties: "LEADING PETTY OFFICER-12; 25-1:P/PRT EXCELLENT",
  command_achievements: "COMPLETED INSURV WITH GRADE OF EXCELLENT",
  qualifications: "ESWS QUALIFIED AUG 2025",
  career_recommendations: ["IWO SCHOOL"],
};

beforeEach(() => {
  h.updates.length = 0;
  h.saveDraft.mockReset();
  h.saveDraft.mockResolvedValue({ id: "ev-9", member_name: "JONES, CARL R" });
});

describe("applyBragDraft — EVAL (spec §5.3 / §9.7)", () => {
  it("passes a clean draft: Promotable, trait_grades {}, no custody fields, deterministic 20/30/31", async () => {
    const sheet = fixtureSheet();
    const saved = await applyBragDraft("u1", sheet, accepted, "10");

    expect(h.saveDraft).toHaveBeenCalledTimes(1);
    const [uid, draft] = h.saveDraft.mock.calls[0];
    expect(uid).toBe("u1");

    // Invariants §1.2 items 2 and 3: advisory never copied, traits never set.
    expect(draft.promotion_recommendation).toBe("Promotable");
    expect(draft.trait_grades).toEqual({});

    for (const field of FORBIDDEN_FIELDS) {
      expect(draft, `draft must not set ${field}`).not.toHaveProperty(field);
    }
    expect(draft.status).toBe("draft");

    // Accepted blocks land; identity/period from the sheet.
    expect(draft.comments).toBe(accepted.comments);
    expect(draft.career_recommendations).toEqual(["IWO SCHOOL"]);
    expect(draft.member_name).toBe("JONES, CARL R");
    expect(draft.period_from).toBe("2025-03-16");
    expect(draft.period_to).toBe("2026-03-15");
    expect(draft.uic).toBe("00000"); // no 5-char uic in admin → DB CHECK fallback

    // block_values: accepted narrative blocks + deterministic values.
    expect(draft.block_values.comment_pitch).toBe("10");
    expect(draft.block_values.primary_duty_abbrev).toBe("LPO");
    expect(draft.block_values.primary_duties).toBe(accepted.primary_duties);
    expect(draft.block_values.command_achievements).toBe(
      accepted.command_achievements,
    );
    expect(draft.block_values.qualifications).toBe(accepted.qualifications);
    expect(draft.block_values.date_reported).toBe("2024-06-01");
    // Block 20 — from the sheet's PFA rows, never from accepted AI text.
    expect(draft.block_values.physical_readiness).toBe(collapsePfa(sheet.data));
    expect(draft.block_values.physical_readiness).toBe("PB");
    // Blocks 30/31 — deterministic pass-through.
    expect(draft.block_values.date_counseled).toBe("2025-09-15");
    expect(draft.block_values.counselor).toBe("SMITH, ANN B");

    expect(saved.id).toBe("ev-9");
  });

  it("links evaluation_id and sets status 'submitted' on the sheet afterward", async () => {
    await applyBragDraft("u1", fixtureSheet(), accepted, "10");

    const upd = h.updates.find((u) => u.table === "brag_sheets");
    expect(upd).toBeDefined();
    expect(upd!.id).toBe("bs-1");
    expect(upd!.patch).toMatchObject({
      evaluation_id: "ev-9",
      status: "submitted",
    });
  });

  it("rejected blocks fall back to empty/seed values", async () => {
    await applyBragDraft("u1", fixtureSheet(), {}, "10");

    const draft = h.saveDraft.mock.calls[0][1];
    expect(draft.comments).toBe("");
    expect(draft.block_values).not.toHaveProperty("primary_duty_abbrev");
    expect(draft.block_values).not.toHaveProperty("primary_duties");
    expect(draft.block_values).not.toHaveProperty("command_achievements");
    // Deterministic Block 20 still lands — it never depends on acceptance.
    expect(draft.block_values.physical_readiness).toBe("PB");
  });
});

describe("applyBragDraft — CHIEFEVAL variant (spec §5.3 / §9.7)", () => {
  it("omits Block 44 qualifications even when present in accepted blocks", async () => {
    const sheet = fixtureSheet({ report_type: "CHIEFEVAL" });
    await applyBragDraft("u1", sheet, accepted, "12");

    const draft = h.saveDraft.mock.calls[0][1];
    expect(draft.report_type).toBe("CHIEFEVAL");
    expect(draft.block_values).not.toHaveProperty("qualifications");
    expect(draft.block_values.comment_pitch).toBe("12");
    expect(draft.promotion_recommendation).toBe("Promotable");
    expect(draft.trait_grades).toEqual({});
  });
});
