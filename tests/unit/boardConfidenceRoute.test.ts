// tests/unit/boardConfidenceRoute.test.ts
//
// POST /api/board-confidence/analyze and GET /api/board-confidence/runs
// (spec §5): auth 401, boardDate 400, OWNER-ONLY 403 (v1.1 review fix — the
// former Admin path trusted self-asserted profiles roles and is removed), the
// in-process concurrency cap 429 (MAX_CONCURRENT_ANALYSES = 2), and the generic
// 500 that never echoes internals (fail-closed audit error stays in server logs).
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

const CONSENTED = ok({ consented_at: "2026-07-18T00:00:00.000Z" });

beforeEach(() => {
  vi.clearAllMocks();
  h.getRouteUserId.mockResolvedValue("u1");
  h.createAdminClient.mockImplementation(
    () =>
      makeAdmin({
        profiles: [ok({ id: "u1" })],
        member_board_records: [CONSENTED],
      }).client,
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

describe("POST /api/board-confidence/analyze — owner-only authorization (v1.1 review fix)", () => {
  it("403 when caller ≠ subject — before the admin client is even created", async () => {
    const res = await POST(postReq({ userId: "u2", boardDate: "2026-09-01" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(
      "Only the record owner may run/view analyses.",
    );
    expect(h.runBoardAnalysis).not.toHaveBeenCalled();
    expect(h.createAdminClient).not.toHaveBeenCalled();
  });

  it("403 even when the caller's profile claims Admin (roles are self-asserted)", async () => {
    const { client } = makeAdmin({
      profiles: [ok({ preferred_role: "Admin", assigned_roles: ["Admin"] })],
    });
    h.createAdminClient.mockReturnValue(client);

    const res = await POST(postReq({ userId: "u2", boardDate: "2026-09-01" }));
    expect(res.status).toBe(403);
    expect(h.runBoardAnalysis).not.toHaveBeenCalled();
    // The profile role lookup no longer exists — nothing may consult it.
    expect(client.from).not.toHaveBeenCalled();
  });

  it("404 when the subject profile does not exist — looked up by the SUBJECT's id", async () => {
    const { client, builders } = makeAdmin({ profiles: [ok(null)] });
    h.createAdminClient.mockReturnValue(client);

    const res = await POST(postReq({ boardDate: "2026-09-01" }));
    expect(res.status).toBe(404);

    const q = builders.find((b) => b.table === "profiles");
    expect(q).toBeDefined();
    expect(q.eq).toHaveBeenCalledWith("id", "u1");
    expect(q.single).toHaveBeenCalled();
    expect(h.runBoardAnalysis).not.toHaveBeenCalled();
  });

  it("200 owner default path (no userId): profile checked by id u1, analysis run as u1/u1", async () => {
    const { client, builders } = makeAdmin({
      profiles: [ok({ id: "u1" })],
      member_board_records: [CONSENTED],
    });
    h.createAdminClient.mockReturnValue(client);

    const res = await POST(postReq({ boardDate: "2026-09-01" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(fakeRow);

    // Argument-aware: the profile existence check must target the SUBJECT row.
    const q = builders.find((b) => b.table === "profiles");
    expect(q).toBeDefined();
    expect(q.select).toHaveBeenCalledWith("id");
    expect(q.eq).toHaveBeenCalledWith("id", "u1");
    // Argument-aware: the consent lookup must target the SUBJECT's record row.
    const c = builders.find((b) => b.table === "member_board_records");
    expect(c).toBeDefined();
    expect(c.select).toHaveBeenCalledWith("consented_at");
    expect(c.eq).toHaveBeenCalledWith("user_id", "u1");
    expect(h.runBoardAnalysis).toHaveBeenCalledWith(
      client,
      "u1",
      "u1",
      "2026-09-01",
    );
  });

  it("200 when the body userId explicitly equals the caller", async () => {
    const res = await POST(postReq({ userId: "u1", boardDate: "2026-09-01" }));
    expect(res.status).toBe(200);
    expect(h.runBoardAnalysis).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      "u1",
      "2026-09-01",
    );
  });
});

describe("POST /api/board-confidence/analyze — consent gate (server-enforced)", () => {
  it("403 when no member_board_records row exists (consent never recorded)", async () => {
    const { client } = makeAdmin({
      profiles: [ok({ id: "u1" })],
      member_board_records: [ok(null)],
    });
    h.createAdminClient.mockReturnValue(client);

    const res = await POST(postReq({ boardDate: "2026-09-01" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(
      "Consent required. Review and accept the Board Confidence Analyzer terms before running an analysis.",
    );
    expect(h.runBoardAnalysis).not.toHaveBeenCalled();
  });

  it("403 when the record exists but consented_at is null", async () => {
    const { client } = makeAdmin({
      profiles: [ok({ id: "u1" })],
      member_board_records: [ok({ consented_at: null })],
    });
    h.createAdminClient.mockReturnValue(client);

    const res = await POST(postReq({ boardDate: "2026-09-01" }));
    expect(res.status).toBe(403);
    expect(h.runBoardAnalysis).not.toHaveBeenCalled();
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

  it("403 when requesting another user's runs — owner-only, Admin claims included (v1.1)", async () => {
    const { client } = makeAdmin({
      profiles: [ok({ preferred_role: "Admin", assigned_roles: ["Admin"] })],
    });
    h.createAdminClient.mockReturnValue(client);

    const res = await GET(getReq(`${RUNS_URL}?userId=u2`));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(
      "Only the record owner may run/view analyses.",
    );
    // 403 fires before the admin client exists — no query, no role lookup.
    expect(h.createAdminClient).not.toHaveBeenCalled();
    expect(client.from).not.toHaveBeenCalled();
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
    // v1.1 columns must be part of the select the route consumers see.
    expect(q.select).toHaveBeenCalledWith(
      expect.stringContaining("adverse_adjustment"),
    );
    expect(q.select).toHaveBeenCalledWith(
      expect.stringContaining("narrative_fallback_reason"),
    );
  });

  it("200 when the userId param explicitly equals the caller — query still by u1", async () => {
    const { client, builders } = makeAdmin({ board_analyses: [ok([])] });
    h.createAdminClient.mockReturnValue(client);

    const res = await GET(getReq(`${RUNS_URL}?userId=u1`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ runs: [] });

    const q = builders.find((b) => b.table === "board_analyses");
    expect(q).toBeDefined();
    expect(q.eq).toHaveBeenCalledWith("user_id", "u1");
  });
});
