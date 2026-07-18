// tests/unit/boardConfidenceService.test.ts
//
// assembleRubricInputs (spec §4.4) — assembly logic against a stubbed admin
// client: the exact finalized-gate .or() string, the §2 dod_id cross-check
// exclusion + warning, trait_average recomputed via computeTraitAverage (the
// stored column is never trusted), the §3 LaDR applicability rule
// min(applies_to_paygrades) ≤ target, zero-weight category exclusion, and the
// documented empty PsrSection when no member_board_records row exists.

import { describe, it, expect, vi } from "vitest";
import {
  assembleRubricInputs,
  runBoardAnalysis,
} from "@/lib/boardConfidence/service";
import { BOARD_DISCLAIMER } from "@/lib/boardConfidence/types";

// runBoardAnalysis calls the narrative module (Anthropic SDK) — stub it with a
// pinned outcome so persistence of source/model/fallbackReason is assertable.
vi.mock("@/lib/boardConfidence/narrative", () => ({
  generateNarrative: vi.fn(async () => ({
    narrative: { summary: "stub", strengths: [], gaps: [], recommendations: [] },
    source: "fallback",
    model: null,
    fallbackReason: "model_error",
  })),
}));

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

  it("v1.5: derives board_emphasis (explicit flag, category, or E7-only ∧ target ≥ 7)", async () => {
    const e7mbr = { ...mbr, target_paygrade: 7 };
    const { admin } = makeAdmin(
      baseTables({
        member_board_records: [e7mbr],
        ladr_documents: [doc],
        ladr_milestones: [
          // E7-only milestone while the member targets E7 → emphasized.
          ms("e7only", "credential", [7]),
          // Applies across grades (min 4) → NOT emphasized by the paygrade rule.
          ms("broad", "credential", [4, 5, 6, 7]),
          // Explicit parser/seed flag → emphasized regardless of paygrades.
          {
            ...ms("flagged", "qual_watchstanding", [4, 5, 6, 7]),
            detail: { board_emphasis: true },
          },
          // The considerations category is always emphasized.
          ms("consid", "advancement_consideration", [7]),
        ],
      }),
    );

    const res = await assembleRubricInputs(admin, "subj-1", "2026-09-01");
    const flag = (id: string) =>
      res.inputs.ladr.find((i) => i.milestone_id === id)?.board_emphasis;
    expect(flag("e7only")).toBe(true);
    expect(flag("broad")).toBe(false);
    expect(flag("flagged")).toBe(true);
    expect(flag("consid")).toBe(true);
  });

  it("v1.5: does NOT emphasize an E7-only milestone when the member targets E6", async () => {
    const { admin } = makeAdmin(
      baseTables({
        member_board_records: [mbr], // target_paygrade 6
        ladr_documents: [doc],
        ladr_milestones: [ms("m1", "credential", [4, 5, 6])],
      }),
    );
    const res = await assembleRubricInputs(admin, "subj-1", "2026-09-01");
    expect(res.inputs.ladr.find((i) => i.milestone_id === "m1")?.board_emphasis).toBe(
      false,
    );
  });
});

describe("assembleRubricInputs — v1.1 review fixes", () => {
  it("maps a null promotion_recommendation to NOB with the warning (never NaN)", async () => {
    const { admin } = makeAdmin(
      baseTables({ evaluations: [dbEval({ promotion_recommendation: null })] }),
    );

    const res = await assembleRubricInputs(admin, "subj-1", "2026-09-01");

    expect(res.inputs.evals[0].promotion_recommendation).toBe("NOB");
    expect(res.warnings).toContain(
      "1 report has no promotion recommendation and was excluded from Performance scoring (period 2024-06-01–2025-05-31).",
    );
  });

  it("maps empty-array PSR sections to null — empty list = not entered", async () => {
    const { admin } = makeAdmin(
      baseTables({
        member_board_records: [
          {
            id: "mbr-1",
            user_id: "subj-1",
            rating_abbrev: null,
            target_paygrade: null,
            psr_entered: true,
            awards: [],
            necs: [],
            quals: [],
            education: [],
            pfa_history: [],
            tours: [],
            adverse: [],
            eval_context: {},
            ladr_checklist: {},
          },
        ],
      }),
    );

    const res = await assembleRubricInputs(admin, "subj-1", "2026-09-01");

    expect(res.inputs.psr).toEqual({
      entered: true,
      awards: null,
      necs: null,
      education: null,
      tours: null,
      pfa: null,
      adverse: [],
    });
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

// ---------------------------------------------------------------------------
// runBoardAnalysis — persistence + fail-closed audit (spec §4.4)
// ---------------------------------------------------------------------------

const runMbr = {
  id: "mbr-1",
  user_id: "subj-1",
  rating_abbrev: null,
  target_paygrade: null,
  psr_entered: true,
  awards: [],
  necs: [],
  quals: [],
  education: [],
  pfa_history: [],
  tours: [],
  adverse: [{ kind: "njp", date: "2024-01-10" }],
  eval_context: {},
  ladr_checklist: {},
};

// Admin stub for the full run: assembly reads fall through to makeAdmin;
// board_analyses insert/delete and audit_logs insert are argument-capturing.
const makeRunAdmin = (
  opts: {
    auditError?: unknown;
    deleteError?: unknown;
    tables?: Record<string, any[]>;
  } = {},
) => {
  const base = makeAdmin(baseTables(opts.tables));
  const calls: {
    insertPayload?: any;
    auditPayload?: any;
    deleted?: [string, string];
  } = {};
  const admin: any = {
    from: vi.fn((table: string) => {
      if (table === "board_analyses") {
        return {
          insert: vi.fn((rows: any[]) => {
            calls.insertPayload = rows[0];
            return {
              select: () => ({
                single: async () =>
                  ({ data: { id: "ba-1", ...rows[0] }, error: null }) as Res,
              }),
            };
          }),
          delete: vi.fn(() => ({
            eq: async (col: string, id: string) => {
              calls.deleted = [col, id];
              return { error: opts.deleteError ?? null };
            },
          })),
        };
      }
      if (table === "audit_logs") {
        return {
          insert: vi.fn(async (rows: any[]) => {
            calls.auditPayload = rows[0];
            return { error: opts.auditError ?? null };
          }),
        };
      }
      return base.admin.from(table);
    }),
  };
  return { admin, calls };
};

const AUDIT_FAIL_MSG =
  "Analysis could not be recorded in the audit log; no result was released.";

describe("runBoardAnalysis — success path persists the full snapshot", () => {
  it("persists BOARD_DISCLAIMER verbatim, the real adverse_adjustment, and narrative_fallback_reason; audits with the analysis id", async () => {
    const { admin, calls } = makeRunAdmin({
      tables: { member_board_records: [runMbr] },
    });

    const row = await runBoardAnalysis(admin, "subj-1", "caller-1", "2026-09-01");
    expect(row.id).toBe("ba-1");

    const p = calls.insertPayload;
    expect(p.user_id).toBe("subj-1");
    expect(p.created_by).toBe("caller-1");
    expect(p.board_date).toBe("2026-09-01");
    expect(p.input.disclaimer).toBe(BOARD_DISCLAIMER);
    // One NJP adverse item → A = 15 (a constant-0 mutation cannot pass).
    expect(p.adverse_adjustment).toBe(15);
    expect(p.narrative_source).toBe("fallback");
    expect(p.model).toBeNull();
    expect(p.narrative_fallback_reason).toBe("model_error");
    expect(Number.isFinite(p.overall_score)).toBe(true);

    expect(calls.auditPayload.action).toBe("BOARD_ANALYSIS_RUN");
    expect(calls.auditPayload.user_id).toBe("caller-1");
    expect(calls.auditPayload.details.analysis_id).toBe("ba-1");
    expect(calls.auditPayload.details.subject_user_id).toBe("subj-1");
    // Nothing was deleted on the happy path.
    expect(calls.deleted).toBeUndefined();
  });

  it("v1.5: snapshots the rubric config + continuity advisory into input.meta (reproducibility + the UI banner read this)", async () => {
    const { admin, calls } = makeRunAdmin({
      tables: { member_board_records: [runMbr] },
    });

    await runBoardAnalysis(admin, "subj-1", "caller-1", "2026-09-01");

    const meta = calls.insertPayload.input.meta;
    // Absent board_rubric_config row → defaults are snapshotted verbatim.
    expect(meta.rubric_config).toMatchObject({
      weights: { performance: 40, precept: 10 },
      continuity_gap_days: 90,
      board_emphasis_multiplier: 2,
    });
    // These exact snake_case keys are what ResultsView reads — a rename breaks
    // the "continuity gap" banner silently, so pin them.
    expect(meta).toHaveProperty("continuity_gap");
    expect(meta).toHaveProperty("continuity_advisory");
    expect(typeof meta.continuity_gap).toBe("boolean");
  });

  it("v1.5: loadRubricConfig reads the active row and falls back to defaults on malformed values", async () => {
    const { admin, calls } = makeRunAdmin({
      tables: {
        member_board_records: [runMbr],
        board_rubric_config: [
          {
            weights: { performance: 50, leadership: 10, development: 10, continuity: 10, completeness: 10, precept: 10 },
            continuity_gap_days: "oops", // malformed → default 90
            board_emphasis_multiplier: 3,
            active: true,
          },
        ],
      },
    });

    await runBoardAnalysis(admin, "subj-1", "caller-1", "2026-09-01");

    const cfg = calls.insertPayload.input.meta.rubric_config;
    expect(cfg.weights.performance).toBe(50); // operator override honored
    expect(cfg.board_emphasis_multiplier).toBe(3);
    expect(cfg.continuity_gap_days).toBe(90); // malformed value → default
  });
});

describe("runBoardAnalysis — fail-closed audit (v1.1 review fix)", () => {
  it("audit insert failure: the analysis row is deleted AND the call throws", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin, calls } = makeRunAdmin({
      auditError: { message: "audit down" },
    });

    await expect(
      runBoardAnalysis(admin, "subj-1", "caller-1", "2026-09-01"),
    ).rejects.toThrow(AUDIT_FAIL_MSG);
    expect(calls.deleted).toEqual(["id", "ba-1"]);
    errSpy.mockRestore();
  });

  it("audit fails AND the delete fails: still throws, CRITICAL orphan log names the row", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin, calls } = makeRunAdmin({
      auditError: { message: "audit down" },
      deleteError: { message: "delete down" },
    });

    await expect(
      runBoardAnalysis(admin, "subj-1", "caller-1", "2026-09-01"),
    ).rejects.toThrow(AUDIT_FAIL_MSG);
    expect(calls.deleted).toEqual(["id", "ba-1"]);

    const critical = errSpy.mock.calls.find((c) =>
      String(c[0]).includes("CRITICAL"),
    );
    expect(critical).toBeDefined();
    expect(String(critical![0])).toContain("ba-1");
    errSpy.mockRestore();
  });
});

describe("runBoardAnalysis — v1.1 scoring semantics reach the persisted snapshot", () => {
  it("null promotion_recommendation: finite score, warning persisted, excluded from Performance", async () => {
    const { admin, calls } = makeRunAdmin({
      tables: { evaluations: [dbEval({ promotion_recommendation: null })] },
    });

    await runBoardAnalysis(admin, "subj-1", "caller-1", "2026-09-01");

    const p = calls.insertPayload;
    expect(Number.isFinite(p.overall_score)).toBe(true);
    expect(p.input.warnings).toContain(
      "1 report has no promotion recommendation and was excluded from Performance scoring (period 2024-06-01–2025-05-31).",
    );
    const perf = p.factor_scores.find((f: any) => f.key === "performance");
    expect(perf.detail.no_data).toBe(true);
    expect(perf.detail.nObserved).toBe(0);
    // The NOB report still exists for continuity coverage.
    const cont = p.factor_scores.find((f: any) => f.key === "continuity");
    expect(cont.detail.coveredDays).toBeGreaterThan(0);
  });

  it("empty-array PSR sections: completeness awards no necs/education/awards points", async () => {
    const { admin, calls } = makeRunAdmin({
      tables: { member_board_records: [{ ...runMbr, adverse: [] }] },
    });

    await runBoardAnalysis(admin, "subj-1", "caller-1", "2026-09-01");

    const comp = calls.insertPayload.factor_scores.find(
      (f: any) => f.key === "completeness",
    );
    expect(comp.detail.psrEntered).toBe(15); // the row exists and is entered...
    expect(comp.detail.necs).toBe(0); // ...but empty lists earn nothing
    expect(comp.detail.education).toBe(0);
    expect(comp.detail.awards).toBe(0);
    expect(comp.detail.pfa3).toBe(0);
  });
});
