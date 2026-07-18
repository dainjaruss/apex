// tests/unit/bragSheetService.test.ts
//
// assembleAutofillRequest + runBragAutofill (brag-sheet spec §4.7) against
// arg-aware stubbed admin clients (boardConfidenceService.test.ts pattern):
// the exact finalized-gate .or() string with the lt(period_to) window, the §2
// dod_id cross-check exclusion, trait_average recomputed via
// computeTraitAverage (stored column never trusted), the LaDR applicability
// rule with ALL categories included (evidence, not scoring), keyless ⇒
// AutofillUnavailableError before any DB write, and the fail-closed audit:
// insert error ⇒ last_autofill compensated to null + throw; compensation also
// failing ⇒ CRITICAL log naming the sheet + still throw. generateText is
// mocked — no live model calls.

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const h = vi.hoisted(() => ({ generateText: vi.fn() }));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, generateText: h.generateText };
});

import {
  assembleAutofillRequest,
  runBragAutofill,
  AutofillUnavailableError,
} from "@/lib/bragSheet/service";
import { emptyBragSheetData } from "@/lib/bragSheet/template";
import { DEFAULT_NARRATIVE_MODEL } from "@/lib/boardConfidence/narrative";
import { BRAG_SHEET_VERSION, type BragSheet } from "@/lib/bragSheet/types";

const FINALIZED_GATE =
  "status.eq.completed,signature_locked.eq.true,routing_stage.eq.locked";

const ENV_KEYS = [
  "AI_GATEWAY_API_KEY",
  "VERCEL_OIDC_TOKEN",
  "BOARD_NARRATIVE_MODEL",
  "BOARD_NARRATIVE_BASE_URL",
  "BOARD_NARRATIVE_API_KEY",
] as const;
const ORIGINAL_ENV = Object.fromEntries(
  ENV_KEYS.map((k) => [k, process.env[k]]),
);

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) delete process.env[k];
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL_ENV[k];
  }
});

// ---------------------------------------------------------------------------
// Stubs (boardConfidenceService.test.ts pattern)
// ---------------------------------------------------------------------------

type Res = { data: unknown; error: unknown };

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
    "lt",
    "lte",
    "gt",
    "gte",
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SHEET_DOD_ID = "5555555555"; // must never surface in the audit row

const profile = {
  id: "u1",
  dod_id: "1234567890",
  navy_rank: "IT2",
  preferred_role: "Sailor",
};

const fixtureSheet = (over: Partial<BragSheet> = {}): BragSheet => {
  const data = emptyBragSheetData();
  data.admin.member_name = "JONES, CARL R";
  data.admin.dod_id = SHEET_DOD_ID;
  data.duties.push({
    title: "LEADING PETTY OFFICER",
    kind: "primary",
    months_assigned: 12,
    is_most_significant: true,
    bullets: [{ text: "Led 12 Sailors through INSURV", metrics: "12 Sailors" }],
  });
  data.pfa.push({ cycle: "25-1", result: "P" });
  data.goals.career_recommendations.push("IWO SCHOOL");
  return {
    id: "bs-1",
    user_id: "u1",
    report_type: "EVAL",
    period_from: "2025-03-16",
    period_to: "2026-03-15",
    template_version: BRAG_SHEET_VERSION,
    data,
    status: "draft",
    consented_at: "2026-07-18T00:00:00.000Z",
    ...over,
  };
};

let evSeq = 0;
const dbEval = (over: Record<string, unknown> = {}) => ({
  id: `ev-${++evSeq}`,
  created_by: "u1",
  report_type: "EVAL",
  member_name: "JONES, CARL R",
  dod_id: null,
  period_from: "2024-03-16",
  period_to: "2025-03-15",
  promotion_recommendation: "Must Promote",
  // Seven 4.0 EVAL traits → computeTraitAverage = 4.00 ...
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
  comments: "PRIOR BLOCK 43 TEXT",
  block_values: { qualifications: "PRIOR QUALS", primary_duties: "PRIOR 29B" },
  status: "completed",
  signature_locked: true,
  routing_stage: "locked",
  ...over,
});

const baseTables = (over: Record<string, any[]> = {}) => ({
  profiles: [profile],
  evaluations: [dbEval()],
  member_board_records: [],
  ladr_documents: [],
  ladr_milestones: [],
  ...over,
});

// ---------------------------------------------------------------------------
// assembleAutofillRequest
// ---------------------------------------------------------------------------

describe("assembleAutofillRequest — prior-eval query (spec §4.7 step 3)", () => {
  it("queries by created_by with the exact finalized gate, window, order, and limit", async () => {
    const { admin, builder } = makeAdmin(baseTables());

    const req = await assembleAutofillRequest(admin, "u1", fixtureSheet(), "10");

    const q = builder("evaluations");
    expect(q).toBeDefined();
    expect(q.eq).toHaveBeenCalledWith("created_by", "u1");
    expect(q.or).toHaveBeenCalledWith(FINALIZED_GATE);
    expect(q.lt).toHaveBeenCalledWith("period_to", "2025-03-16");
    expect(q.order).toHaveBeenCalledWith("period_to", { ascending: false });
    expect(q.limit).toHaveBeenCalledWith(5);

    expect(req.report_type).toBe("EVAL");
    expect(req.period_from).toBe("2025-03-16");
    expect(req.period_to).toBe("2026-03-15");
    expect(req.pitch).toBe("10");
  });

  it("maps rows to PriorEvalSummary with trait_average RECOMPUTED (never the stored column)", async () => {
    const { admin } = makeAdmin(baseTables());

    const req = await assembleAutofillRequest(admin, "u1", fixtureSheet(), "10");

    expect(req.prior_evals).toHaveLength(1);
    const p = req.prior_evals[0];
    expect(p.period_to).toBe("2025-03-15");
    expect(p.trait_average).toBe(4); // stored column said 3.2
    expect(p.promotion_recommendation).toBe("Must Promote");
    expect(p.comments).toBe("PRIOR BLOCK 43 TEXT");
    expect(p.qualifications).toBe("PRIOR QUALS");
    expect(p.primary_duties).toBe("PRIOR 29B");
  });

  it('maps null promotion_recommendation to "NOB" and null comments to ""', async () => {
    const { admin } = makeAdmin(
      baseTables({
        evaluations: [
          dbEval({ promotion_recommendation: null, comments: null }),
        ],
      }),
    );

    const req = await assembleAutofillRequest(admin, "u1", fixtureSheet(), "10");
    expect(req.prior_evals[0].promotion_recommendation).toBe("NOB");
    expect(req.prior_evals[0].comments).toBe("");
  });

  it("§2 dod_id cross-check: mismatched rows excluded; matching/absent rows stay", async () => {
    const { admin } = makeAdmin(
      baseTables({
        evaluations: [
          dbEval({ dod_id: "9999999999", period_to: "2023-03-15" }), // mismatch
          dbEval({ dod_id: "1234567890", period_to: "2024-03-15" }), // match
          dbEval({ dod_id: null, period_to: "2025-03-15" }), // absent
        ],
      }),
    );

    const req = await assembleAutofillRequest(admin, "u1", fixtureSheet(), "10");
    const periods = req.prior_evals.map((p) => p.period_to);
    expect(periods).not.toContain("2023-03-15");
    expect(periods).toContain("2024-03-15");
    expect(periods).toContain("2025-03-15");
  });

  it("fails loudly on a corrupt data payload (BragSheetDataSchema.parse)", async () => {
    const { admin } = makeAdmin(baseTables());
    const corrupt = fixtureSheet({ data: { admin: "garbage" } as any });
    await expect(
      assembleAutofillRequest(admin, "u1", corrupt, "10"),
    ).rejects.toThrow();
  });
});

describe("assembleAutofillRequest — LaDR (spec §4.7 step 4)", () => {
  const mbr = {
    id: "mbr-1",
    user_id: "u1",
    rating_abbrev: "IT",
    target_paygrade: 6,
    ladr_checklist: { m1: { status: "met", verified_in_ompf: true } },
  };
  const doc = {
    id: "doc-1",
    rating_abbrev: "IT",
    paygrade_range: "E1-E9",
    effective_date: "2026-07-01",
  };
  const ms = (
    id: string,
    category: string,
    applies: number[],
    sort_order = 0,
  ) => ({
    id,
    ladr_document_id: "doc-1",
    category,
    item: `item ${id}`,
    applies_to_paygrades: applies,
    detail: {},
    sort_order,
  });

  it("absent member_board_records row ⇒ ladr: [] (never fabricated)", async () => {
    const { admin } = makeAdmin(baseTables());
    const req = await assembleAutofillRequest(admin, "u1", fixtureSheet(), "10");
    expect(req.ladr).toEqual([]);
  });

  it("null rating_abbrev ⇒ ladr: []", async () => {
    const { admin } = makeAdmin(
      baseTables({
        member_board_records: [{ ...mbr, rating_abbrev: null }],
      }),
    );
    const req = await assembleAutofillRequest(admin, "u1", fixtureSheet(), "10");
    expect(req.ladr).toEqual([]);
  });

  it("applies min(applies_to_paygrades) ≤ target; ALL categories included; checklist status or 'unanswered'", async () => {
    const { admin } = makeAdmin(
      baseTables({
        member_board_records: [mbr],
        ladr_documents: [doc],
        ladr_milestones: [
          ms("m1", "credential", [4, 5, 6]), // min 4 ≤ 6 → included, status met
          ms("m2", "credential", [7]), // min 7 > 6 → excluded
          ms("m3", "career_milestone", [1]), // zero-weight in the analyzer — INCLUDED here
        ],
      }),
    );

    const req = await assembleAutofillRequest(admin, "u1", fixtureSheet(), "10");

    const ids = req.ladr.map((i) => i.milestone_id).sort();
    expect(ids).toEqual(["m1", "m3"]);

    const m1 = req.ladr.find((i) => i.milestone_id === "m1")!;
    expect(m1.category).toBe("credential");
    expect(m1.status).toBe("met");
    expect(m1.item).toBe("item m1");

    // No checklist entry → the documented default, never a fabricated status.
    const m3 = req.ladr.find((i) => i.milestone_id === "m3")!;
    expect(m3.category).toBe("career_milestone");
    expect(m3.status).toBe("unanswered");
  });
});

// ---------------------------------------------------------------------------
// runBragAutofill — persistence + fail-closed audit
// ---------------------------------------------------------------------------

/** A schema-valid model output whose citations resolve against fixtureSheet(). */
const modelOut = () => {
  const cite = ["brag.duties[0].bullets[0]"];
  const gb = (text: string, sources = cite) => ({
    text,
    items: [{ text, sources }],
  });
  return {
    blocks: {
      comments: gb("LED 12 SAILORS THROUGH INSURV WITH ZERO DISCREPANCIES"),
      primary_duty_abbrev: gb("LPO"),
      primary_duties: gb("LEADING PETTY OFFICER-12; 25-1:P"),
      command_achievements: gb("COMPLETED INSURV WITH GRADE OF EXCELLENT"),
      qualifications: gb("ESWS QUALIFIED THIS PERIOD"),
      career_recommendations: {
        ...gb("IWO SCHOOL", ["brag.goals.career_recommendations[0]"]),
        entries: ["IWO SCHOOL"],
      },
      physical_readiness: gb("P", ["brag.pfa[0]"]),
    },
    missing_info: [],
    promotion_advisory: {
      advisory_only: true,
      recommendation: "Must Promote",
      rationale:
        "Sustained cited performance. Advisory only — the reporting senior selects Block 45.",
      sources: cite,
    },
  };
};

// Assembly reads fall through to makeAdmin; brag_sheets updates and
// audit_logs inserts are argument-capturing with scriptable errors.
const makeRunAdmin = (
  opts: {
    auditError?: unknown;
    updateErrors?: unknown[];
    tables?: Record<string, any[]>;
  } = {},
) => {
  const base = makeAdmin(baseTables(opts.tables));
  const updateErrors = [...(opts.updateErrors ?? [])];
  const calls: { updates: { patch: any; id: string }[]; audit?: any } = {
    updates: [],
  };
  const admin: any = {
    from: vi.fn((table: string) => {
      if (table === "brag_sheets") {
        return {
          update: vi.fn((patch: any) => ({
            eq: vi.fn(async (_col: string, id: string) => {
              calls.updates.push({ patch, id });
              return { error: updateErrors.shift() ?? null };
            }),
          })),
        };
      }
      if (table === "audit_logs") {
        return {
          insert: vi.fn(async (rows: any) => {
            calls.audit = Array.isArray(rows) ? rows[0] : rows;
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
  "Auto-fill could not be recorded in the audit log; no draft was released.";

describe("runBragAutofill — keyless (invariant §1.2 item 9)", () => {
  it("throws AutofillUnavailableError before any model call or DB write", async () => {
    const { admin, calls } = makeRunAdmin();

    await expect(
      runBragAutofill(admin, "u1", fixtureSheet(), "10"),
    ).rejects.toBeInstanceOf(AutofillUnavailableError);

    expect(h.generateText).not.toHaveBeenCalled();
    expect(calls.updates).toHaveLength(0);
    expect(calls.audit).toBeUndefined();
  });
});

describe("runBragAutofill — success path (spec §4.7 steps 4-7)", () => {
  beforeEach(() => {
    process.env.AI_GATEWAY_API_KEY = "test-dummy-key";
    h.generateText.mockResolvedValue({ output: modelOut() });
  });

  it("persists last_autofill on the sheet row and returns the response with the model id", async () => {
    const { admin, calls } = makeRunAdmin();

    const res = await runBragAutofill(admin, "u1", fixtureSheet(), "10");

    expect(res.model).toBe(DEFAULT_NARRATIVE_MODEL);
    expect(res.blocks.comments.text).toContain("LED 12 SAILORS");
    // Deterministic Block 20 overwrite survives the full service path.
    expect(res.blocks.physical_readiness.text).toBe("P");

    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].id).toBe("bs-1");
    expect(calls.updates[0].patch.last_autofill).toBeDefined();
    expect(calls.updates[0].patch.last_autofill.model).toBe(
      DEFAULT_NARRATIVE_MODEL,
    );
  });

  it("audits BRAG_AUTOFILL_RUN with the pinned details shape and no PII", async () => {
    const { admin, calls } = makeRunAdmin();

    const res = await runBragAutofill(admin, "u1", fixtureSheet(), "10");

    const a = calls.audit;
    expect(a).toBeDefined();
    expect(a.action).toBe("BRAG_AUTOFILL_RUN");
    expect(a.user_id).toBe("u1");
    expect(a.evaluation_id).toBeNull();
    expect(a.details.brag_sheet_id).toBe("bs-1");
    expect(a.details.model).toBe(DEFAULT_NARRATIVE_MODEL);
    expect(a.details.input_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a.details.citation_failure_count).toBe(res.citation_failures.length);
    expect(a.details.missing_info_count).toBe(res.missing_info.length);
    expect(Array.isArray(a.details.overflow_blocks)).toBe(true);
    // The audit row holds ids and a hash — never the member's DoD ID.
    expect(JSON.stringify(a)).not.toContain(SHEET_DOD_ID);
    expect(JSON.stringify(a)).not.toContain(profile.dod_id);
  });
});

describe("runBragAutofill — fail-closed audit (spec §4.7 step 6)", () => {
  beforeEach(() => {
    process.env.AI_GATEWAY_API_KEY = "test-dummy-key";
    h.generateText.mockResolvedValue({ output: modelOut() });
  });

  it("audit insert error ⇒ last_autofill compensated to null AND the call throws", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin, calls } = makeRunAdmin({
      auditError: { message: "audit down" },
    });

    await expect(
      runBragAutofill(admin, "u1", fixtureSheet(), "10"),
    ).rejects.toThrow(AUDIT_FAIL_MSG);

    expect(calls.updates).toHaveLength(2);
    expect(calls.updates[1].id).toBe("bs-1");
    expect(calls.updates[1].patch).toEqual({ last_autofill: null });
    errSpy.mockRestore();
  });

  it("audit AND compensation both fail ⇒ still throws, CRITICAL log names the sheet", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { admin, calls } = makeRunAdmin({
      auditError: { message: "audit down" },
      updateErrors: [null, { message: "update down" }],
    });

    await expect(
      runBragAutofill(admin, "u1", fixtureSheet(), "10"),
    ).rejects.toThrow(AUDIT_FAIL_MSG);

    expect(calls.updates).toHaveLength(2);
    const critical = errSpy.mock.calls.find((c) =>
      String(c.join(" ")).includes("CRITICAL"),
    );
    expect(critical).toBeDefined();
    expect(String(critical!.join(" "))).toContain("bs-1");
    errSpy.mockRestore();
  });
});
