// tests/unit/boardConfidenceService.test.ts
//
// assembleRubricInputs (spec §4.4) — assembly logic against a stubbed admin
// client: the exact finalized-gate .or() string, the §2 dod_id cross-check
// exclusion + warning, trait_average recomputed via computeTraitAverage (the
// stored column is never trusted), the §3 LaDR applicability rule
// min(applies_to_paygrades) ≤ target, zero-weight category exclusion, and the
// documented empty PsrSection when no member_board_records row exists.

import { describe, it, expect, vi } from "vitest";
import { assembleRubricInputs } from "@/lib/boardConfidence/service";

const FINALIZED_GATE =
  "status.eq.completed,signature_locked.eq.true,routing_stage.eq.locked";

type Res = { data: unknown; error: unknown };

// Chainable/thenable PostgREST builder stub: awaiting the chain resolves the
// row list; single()/maybeSingle() resolve the first row (or null).
const makeBuilder = (rows: any[], table: string) => {
  const b: any = {
    table,
    then: (onF: any, onR: any) =>
      Promise.resolve({ data: rows, error: null } as Res).then(onF, onR),
  };
  for (const m of [
    "select",
    "eq",
    "neq",
    "or",
    "in",
    "is",
    "not",
    "order",
    "limit",
    "filter",
  ]) {
    b[m] = vi.fn(() => b);
  }
  b.single = vi.fn(async () => ({ data: rows[0] ?? null, error: null }) as Res);
  b.maybeSingle = vi.fn(
    async () => ({ data: rows[0] ?? null, error: null }) as Res,
  );
  return b;
};

const makeAdmin = (tables: Record<string, any[]>) => {
  const builders: any[] = [];
  const admin = {
    from: vi.fn((table: string) => {
      const b = makeBuilder(tables[table] ?? [], table);
      builders.push(b);
      return b;
    }),
  };
  const builder = (table: string) => builders.find((b) => b.table === table);
  return { admin: admin as any, builders, builder };
};

const profile = {
  id: "subj-1",
  dod_id: "1234567890",
  navy_rank: "IT2",
  preferred_role: "Sailor",
};

let evSeq = 0;
const dbEval = (over: Record<string, unknown> = {}) => ({
  id: `ev-${++evSeq}`,
  created_by: "subj-1",
  report_type: "EVAL",
  member_name: "SAILOR, TEST",
  dod_id: null,
  period_from: "2024-06-01",
  period_to: "2025-05-31",
  promotion_recommendation: "Must Promote",
  // All seven EVAL traits at 4.0 → computeTraitAverage = 4.00 ...
  trait_grades: {
    knowledge: "4.0",
    work: "4.0",
    eo: "4.0",
    bearing: "4.0",
    accomplishment: "4.0",
    teamwork: "4.0",
    leadership: "4.0",
  },
  // ... while the stored column is deliberately stale (never trusted).
  trait_average: 3.2,
  summary_group_id: null,
  summary_group_distribution: null,
  status: "completed",
  signature_locked: true,
  routing_stage: "locked",
  ...over,
});

const baseTables = (over: Record<string, any[]> = {}) => ({
  profiles: [profile],
  member_board_records: [],
  evaluations: [dbEval()],
  ladr_documents: [],
  ladr_milestones: [],
  board_precepts: [],
  ...over,
});

describe("assembleRubricInputs — finalized gate (same condition as the NAVFIT export)", () => {
  it("queries evaluations by created_by with the exact .or() gate string", async () => {
    const { admin, builder } = makeAdmin(baseTables());

    await assembleRubricInputs(admin, "subj-1", "2026-09-01");

    const q = builder("evaluations");
    expect(q).toBeDefined();
    expect(q.eq).toHaveBeenCalledWith("created_by", "subj-1");
    expect(q.or).toHaveBeenCalledWith(FINALIZED_GATE);
  });
});

describe("assembleRubricInputs — §2 dod_id cross-check", () => {
  it("excludes a mismatched eval with the verbatim warning; matching/absent dod_id rows stay", async () => {
    const mismatch = dbEval({
      dod_id: "9999999999",
      period_from: "2023-06-01",
      period_to: "2024-05-31",
    });
    const match = dbEval({ dod_id: "1234567890" });
    const absent = dbEval({
      dod_id: null,
      period_from: "2025-06-01",
      period_to: "2026-05-31",
    });
    const { admin } = makeAdmin(
      baseTables({ evaluations: [mismatch, match, absent] }),
    );

    const res = await assembleRubricInputs(admin, "subj-1", "2026-09-01");

    expect(res.inputs.evals).toHaveLength(2);
    expect(
      res.inputs.evals.some((e) => e.period_to === "2024-05-31"),
    ).toBe(false);
    expect(res.warnings).toContain(
      "Excluded 1 report whose DoD ID does not match your profile (period 2023-06-01–2024-05-31).",
    );
    expect(res.meta.eval_count_total).toBe(3);
    expect(res.meta.eval_count_excluded).toBe(1);
  });
});

describe("assembleRubricInputs — trait_average is always recomputed", () => {
  it("uses computeTraitAverage(trait_grades), not the stale stored column", async () => {
    const { admin } = makeAdmin(baseTables());

    const res = await assembleRubricInputs(admin, "subj-1", "2026-09-01");

    expect(res.inputs.evals).toHaveLength(1);
    // Stored column says 3.2; the seven 4.0 trait grades say 4.00.
    expect(res.inputs.evals[0].trait_average).toBe(4);
  });
});

describe("assembleRubricInputs — LaDR applicability (§3 rule) and scored categories", () => {
  const mbr = {
    id: "mbr-1",
    user_id: "subj-1",
    rating_abbrev: "IT",
    target_paygrade: 6,
    psr_entered: true,
    awards: [],
    necs: [],
    quals: [],
    education: [],
    pfa_history: [],
    tours: [],
    adverse: [],
    eval_context: {},
    ladr_checklist: { m1: { status: "met", verified_in_ompf: true } },
  };
  const doc = {
    id: "doc-1",
    rating_abbrev: "IT",
    rating_name: "Information Systems Technician",
    paygrade_range: "E1-E9",
    version: "July 2026",
    effective_date: "2026-07-01",
    source_url: "https://www.cool.osd.mil/usn/LaDR/it_e1_e9.pdf",
  };
  const ms = (id: string, category: string, applies: number[]) => ({
    id,
    ladr_document_id: "doc-1",
    category,
    item: id,
    item_code: null,
    applies_to_paygrades: applies,
    detail: {},
    sort_order: 0,
  });

  it("includes items with min(applies_to_paygrades) ≤ target; drops zero-weight categories", async () => {
    const { admin } = makeAdmin(
      baseTables({
        member_board_records: [mbr],
        ladr_documents: [doc],
        ladr_milestones: [
          ms("m1", "credential", [4, 5, 6]), // min 4 ≤ 6 → applicable
          ms("m2", "credential", [7]), // min 7 > 6 → not applicable
          ms("m3", "qual_watchstanding", [1, 2, 3]), // min 1 ≤ 6 → applicable
          ms("m4", "career_milestone", [4]), // weight 0 — never reaches inputs.ladr
          ms("m5", "billet_recommended", [5]), // weight 0 — never reaches inputs.ladr
        ],
      }),
    );

    const res = await assembleRubricInputs(admin, "subj-1", "2026-09-01");

    const ids = res.inputs.ladr.map((i) => i.milestone_id).sort();
    expect(ids).toEqual(["m1", "m3"]);

    const m1 = res.inputs.ladr.find((i) => i.milestone_id === "m1")!;
    expect(m1.category).toBe("credential");
    expect(m1.status).toBe("met");
    expect(m1.verified_in_ompf).toBe(true);

    // No checklist entry → the documented default, never a fabricated status.
    const m3 = res.inputs.ladr.find((i) => i.milestone_id === "m3")!;
    expect(m3.status).toBe("unanswered");
    expect(m3.verified_in_ompf).toBe(false);
  });
});

describe("assembleRubricInputs — absent member_board_records row", () => {
  it("yields the documented empty PsrSection (null sections ≠ empty lists)", async () => {
    const { admin } = makeAdmin(baseTables()); // member_board_records: []

    const res = await assembleRubricInputs(admin, "subj-1", "2026-09-01");

    expect(res.inputs.psr).toEqual({
      entered: false,
      awards: null,
      necs: null,
      education: null,
      tours: null,
      pfa: null,
      adverse: [],
    });
    expect(res.inputs.ladr).toEqual([]);
    expect(res.meta.rating_abbrev).toBeNull();
  });
});
