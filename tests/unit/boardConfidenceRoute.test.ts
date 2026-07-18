// tests/unit/boardConfidenceRoute.test.ts
//
// POST /api/board-confidence/analyze and GET /api/board-confidence/runs
// (spec §5): auth 401, boardDate 400, owner-or-Admin 403, the in-process
// concurrency cap 429 (MAX_CONCURRENT_ANALYSES = 2), and the generic 500 that
// never echoes internals (fail-closed audit error stays in server logs).
// getRouteUserId / createAdminClient / runBoardAnalysis are mocked per-suite.

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  getRouteUserId: vi.fn(),
  createAdminClient: vi.fn(),
  runBoardAnalysis: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  getRouteUserId: h.getRouteUserId,
  createAdminClient: h.createAdminClient,
  createBrowserClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/boardConfidence/service", () => ({
  runBoardAnalysis: h.runBoardAnalysis,
}));

import { POST } from "@/app/api/board-confidence/analyze/route";
import { GET } from "@/app/api/board-confidence/runs/route";

type Res = { data: unknown; error: unknown };
const ok = (data: unknown): Res => ({ data, error: null });

// Minimal chainable/thenable PostgREST builder stub. Repeats the last queued
// result when a table is queried more often than results were supplied.
const makeBuilder = (result: Res, table: string) => {
  const b: any = {
    table,
    then: (onF: any, onR: any) => Promise.resolve(result).then(onF, onR),
  };
  for (const m of ["select", "eq", "or", "order", "limit", "in"]) {
    b[m] = vi.fn(() => b);
  }
  b.single = vi.fn(async () => result);
  b.maybeSingle = vi.fn(async () => result);
  return b;
};

const makeAdmin = (tables: Record<string, Res[]>) => {
  const counts: Record<string, number> = {};
  const builders: any[] = [];
  const client = {
    from: vi.fn((table: string) => {
      const queue = tables[table] ?? [];
      const i = counts[table] ?? 0;
      counts[table] = i + 1;
      const result = queue[Math.min(i, queue.length - 1)] ?? ok(null);
      const b = makeBuilder(result, table);
      builders.push(b);
      return b;
    }),
  };
  return { client, builders };
};

const postReq = (body: unknown) => ({ json: async () => body }) as any;

const getReq = (url: string) => ({ url, nextUrl: new URL(url) }) as any;

const RUNS_URL = "http://localhost/api/board-confidence/runs";

const fakeRow = {
  id: "run-1",
  user_id: "u1",
  board_date: "2026-09-01",
  overall_score: 62.4,
  band: 50,
  narrative_source: "fallback",
  model: null,
  created_by: "u1",
};

beforeEach(() => {
  vi.clearAllMocks();
  h.getRouteUserId.mockResolvedValue("u1");
  h.createAdminClient.mockImplementation(
    () => makeAdmin({ profiles: [ok({ id: "u1" })] }).client,
  );
  h.runBoardAnalysis.mockResolvedValue(fakeRow);
});

describe("POST /api/board-confidence/analyze — auth and validation", () => {
  it("401 when unauthenticated", async () => {
    h.getRouteUserId.mockResolvedValue(null);
    const res = await POST(postReq({}));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Not authenticated.");
  });

  it('400 on boardDate "09/01/2026" (not YYYY-MM-DD)', async () => {
    const res = await POST(postReq({ boardDate: "09/01/2026" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(
      "Invalid boardDate (expected YYYY-MM-DD).",
    );
  });

  it('400 on boardDate "2026-13-40" (shape ok, unparseable)', async () => {
    const res = await POST(postReq({ boardDate: "2026-13-40" }));
    expect(res.status).toBe(400);
    expect(h.runBoardAnalysis).not.toHaveBeenCalled();
  });
});

describe("POST /api/board-confidence/analyze — owner-or-Admin authorization", () => {
  it("403 when caller ≠ subject and caller is not an Admin", async () => {
    const { client } = makeAdmin({
      profiles: [ok({ preferred_role: "Sailor", assigned_roles: ["Rater"] })],
    });
    h.createAdminClient.mockReturnValue(client);

    const res = await POST(postReq({ userId: "u2", boardDate: "2026-09-01" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(
      "Only the record owner or an Admin may run an analysis.",
    );
    expect(h.runBoardAnalysis).not.toHaveBeenCalled();
  });

  it("200 when caller's preferred_role is Admin", async () => {
    const { client } = makeAdmin({
      profiles: [
        ok({ preferred_role: "Admin", assigned_roles: [] }), // caller role check
        ok({ id: "u2" }), // subject exists
      ],
    });
    h.createAdminClient.mockReturnValue(client);
    h.runBoardAnalysis.mockResolvedValue({ ...fakeRow, user_id: "u2" });

    const res = await POST(postReq({ userId: "u2", boardDate: "2026-09-01" }));
    expect(res.status).toBe(200);
    expect((await res.json()).user_id).toBe("u2");
    expect(h.runBoardAnalysis).toHaveBeenCalledWith(
      client,
      "u2",
      "u1",
      "2026-09-01",
    );
  });

  it("200 when Admin arrives via assigned_roles", async () => {
    const { client } = makeAdmin({
      profiles: [
        ok({ preferred_role: "Senior Rater", assigned_roles: ["Admin"] }),
        ok({ id: "u2" }),
      ],
    });
    h.createAdminClient.mockReturnValue(client);

    const res = await POST(postReq({ userId: "u2", boardDate: "2026-09-01" }));
    expect(res.status).toBe(200);
  });

  it("404 when the subject profile does not exist", async () => {
    const { client } = makeAdmin({ profiles: [ok(null)] });
    h.createAdminClient.mockReturnValue(client);

    const res = await POST(postReq({ boardDate: "2026-09-01" }));
    expect(res.status).toBe(404);
  });

  it("200 owner path returns the full analysis row", async () => {
    const res = await POST(postReq({ boardDate: "2026-09-01" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(fakeRow);
    expect(h.runBoardAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "u1",
      "2026-09-01",
    );
  });
});

describe("POST /api/board-confidence/analyze — concurrency cap (MAX_CONCURRENT_ANALYSES = 2)", () => {
  it("third concurrent request gets 429; the slots release after resolution", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    h.runBoardAnalysis.mockImplementation(async () => {
      await gate;
      return fakeRow;
    });

    const p1 = POST(postReq({ boardDate: "2026-09-01" }));
    const p2 = POST(postReq({ boardDate: "2026-09-01" }));
    const p3 = POST(postReq({ boardDate: "2026-09-01" }));

    const r3 = await p3;
    expect(r3.status).toBe(429);
    expect((await r3.json()).error).toBe(
      "Too many analyses in progress. Try again shortly.",
    );

    release();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    // Counter released — a fresh request succeeds.
    h.runBoardAnalysis.mockResolvedValue(fakeRow);
    const r4 = await POST(postReq({ boardDate: "2026-09-01" }));
    expect(r4.status).toBe(200);
  });
});

describe("POST /api/board-confidence/analyze — generic 500 (never echoes internals)", () => {
  it("fail-closed audit error surfaces as the generic message only", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.runBoardAnalysis.mockRejectedValue(
      new Error(
        "Analysis could not be recorded in the audit log; no result was released.",
      ),
    );

    const res = await POST(postReq({ boardDate: "2026-09-01" }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe(
      "Board confidence analysis failed. See server logs for details.",
    );
    expect(JSON.stringify(body)).not.toContain("audit");
    errSpy.mockRestore();
  });
});

describe("GET /api/board-confidence/runs — prior-run list (§5.2)", () => {
  it("401 when unauthenticated", async () => {
    h.getRouteUserId.mockResolvedValue(null);
    const res = await GET(getReq(RUNS_URL));
    expect(res.status).toBe(401);
  });

  it("403 when requesting another user's runs without Admin", async () => {
    const { client } = makeAdmin({
      profiles: [ok({ preferred_role: "Sailor", assigned_roles: [] })],
    });
    h.createAdminClient.mockReturnValue(client);

    const res = await GET(getReq(`${RUNS_URL}?userId=u2`));
    expect(res.status).toBe(403);
  });

  it("200 returns the caller's runs ordered created_at desc", async () => {
    const rows = [
      { id: "run-2", user_id: "u1", overall_score: 70.1, band: 75, created_at: "2026-07-18T02:00:00Z" },
      { id: "run-1", user_id: "u1", overall_score: 62.4, band: 50, created_at: "2026-07-17T01:00:00Z" },
    ];
    const { client, builders } = makeAdmin({ board_analyses: [ok(rows)] });
    h.createAdminClient.mockReturnValue(client);

    const res = await GET(getReq(RUNS_URL));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ runs: rows });

    const q = builders.find((b) => b.table === "board_analyses");
    expect(q).toBeDefined();
    expect(q.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(q.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(q.limit).toHaveBeenCalledWith(50);
  });
});
