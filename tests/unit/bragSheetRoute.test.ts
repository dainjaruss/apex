// tests/unit/bragSheetRoute.test.ts
//
// GET/POST /api/brag-sheet/autofill (brag-sheet spec §5.2, §9.6): auth 401,
// body 400, keyless 503 BEFORE any DB access (invariant §1.2 item 9 — never a
// canned draft), 404 unknown sheet, OWNER-ONLY 403 (self-asserted profile
// roles authorize nothing — no role lookup occurs), the consent-gate 403 with
// its exact message, the in-process concurrency cap 429
// (MAX_CONCURRENT_AUTOFILLS = 2), 502 on AutofillModelError, and the generic
// 500 that never echoes the fail-closed audit internals. Pattern:
// boardConfidenceRoute.test.ts — supabaseClient and the brag service mocked,
// handlers imported directly.

import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

const h = vi.hoisted(() => ({
  getRouteUserId: vi.fn(),
  createAdminClient: vi.fn(),
  runBragAutofill: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => ({
  getRouteUserId: h.getRouteUserId,
  createAdminClient: h.createAdminClient,
  createBrowserClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/bragSheet/service", () => ({
  runBragAutofill: h.runBragAutofill,
  AutofillUnavailableError: class AutofillUnavailableError extends Error {},
}));

import { GET, POST } from "@/app/api/brag-sheet/autofill/route";
import { AutofillModelError } from "@/lib/bragSheet/autofill";

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

const SHEET_ID = "3f0c1a2e-5b7d-4c9e-8f10-123456789abc";

const sheetRow = (over: Record<string, unknown> = {}) => ({
  id: SHEET_ID,
  user_id: "u1",
  report_type: "EVAL",
  period_from: "2025-03-16",
  period_to: "2026-03-15",
  template_version: "1.0",
  data: {},
  status: "draft",
  consented_at: "2026-07-18T00:00:00.000Z",
  last_autofill: null,
  ...over,
});

// Chainable admin stub: brag_sheets select chain resolves the queued row;
// records every table name so "no role lookup" is assertable.
const makeAdmin = (row: unknown) => {
  const tables: string[] = [];
  const client = {
    from: vi.fn((table: string) => {
      tables.push(table);
      const b: any = {};
      for (const m of ["select", "eq", "order", "limit"]) {
        b[m] = vi.fn(() => b);
      }
      b.maybeSingle = vi.fn(async () => ({ data: row, error: null }));
      b.single = vi.fn(async () => ({ data: row, error: null }));
      return b;
    }),
  };
  return { client, tables };
};

const postReq = (body: unknown) => ({ json: async () => body }) as any;

const validBody = { bragSheetId: SHEET_ID };

const fakeResponse = {
  blocks: { comments: { text: "GENERATED", items: [] } },
  missing_info: [],
  promotion_advisory: {
    advisory_only: true,
    recommendation: "Promotable",
    rationale: "r",
    sources: [],
  },
  fit_reports: {},
  citation_failures: [],
  dry_run: { success: true, errors: [], warnings: [] },
  model: "anthropic/claude-opus-4.8",
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ENV_KEYS) delete process.env[k];
  h.getRouteUserId.mockResolvedValue("u1");
  h.createAdminClient.mockImplementation(() => makeAdmin(sheetRow()).client);
  h.runBragAutofill.mockResolvedValue(fakeResponse);
});

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (ORIGINAL_ENV[k] === undefined) delete process.env[k];
    else process.env[k] = ORIGINAL_ENV[k];
  }
});

const withGateway = () => {
  process.env.AI_GATEWAY_API_KEY = "test-dummy-key";
};

describe("POST /api/brag-sheet/autofill — auth and body validation", () => {
  it("401 when unauthenticated", async () => {
    h.getRouteUserId.mockResolvedValue(null);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Not authenticated.");
  });

  it("400 when bragSheetId is missing", async () => {
    withGateway();
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid request body.");
    expect(h.runBragAutofill).not.toHaveBeenCalled();
  });

  it('400 on pitch "11" (only "10" | "12")', async () => {
    withGateway();
    const res = await POST(postReq({ bragSheetId: SHEET_ID, pitch: "11" }));
    expect(res.status).toBe(400);
    expect(h.runBragAutofill).not.toHaveBeenCalled();
  });

  it("400 on unparseable JSON body", async () => {
    withGateway();
    const res = await POST({
      json: async () => {
        throw new Error("bad json");
      },
    } as any);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/brag-sheet/autofill — keyless 503 (invariant §1.2 item 9)", () => {
  it("503 before any DB access; no fallback draft exists", async () => {
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe(
      "AI drafting is not configured on this server.",
    );
    expect(h.createAdminClient).not.toHaveBeenCalled();
    expect(h.runBragAutofill).not.toHaveBeenCalled();
  });
});

describe("POST /api/brag-sheet/autofill — sheet lookup and authorization", () => {
  it("404 when the sheet does not exist", async () => {
    withGateway();
    h.createAdminClient.mockImplementation(() => makeAdmin(null).client);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("Brag sheet not found.");
  });

  it("403 for a non-owner — even an Admin claim — with NO role lookup", async () => {
    withGateway();
    const { client, tables } = makeAdmin(sheetRow({ user_id: "u2" }));
    h.createAdminClient.mockReturnValue(client);
    // The caller's profile claims Admin; roles are self-asserted and consulted nowhere.
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(
      "Only the brag sheet owner may generate drafts.",
    );
    expect(h.runBragAutofill).not.toHaveBeenCalled();
    expect(tables).not.toContain("profiles");
  });

  it("403 with the exact consent message while consented_at is null", async () => {
    withGateway();
    h.createAdminClient.mockImplementation(
      () => makeAdmin(sheetRow({ consented_at: null })).client,
    );
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(
      "Consent required. Review and accept the AI drafting terms before generating.",
    );
    expect(h.runBragAutofill).not.toHaveBeenCalled();
  });
});

describe("POST /api/brag-sheet/autofill — success", () => {
  it("200 returns the service response; pitch defaults to '10'", async () => {
    withGateway();
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(fakeResponse);
    expect(h.runBragAutofill).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      expect.objectContaining({ id: SHEET_ID, user_id: "u1" }),
      "10",
    );
  });

  it("200 passes an explicit pitch '12' through", async () => {
    withGateway();
    const res = await POST(postReq({ bragSheetId: SHEET_ID, pitch: "12" }));
    expect(res.status).toBe(200);
    expect(h.runBragAutofill).toHaveBeenCalledWith(
      expect.anything(),
      "u1",
      expect.anything(),
      "12",
    );
  });
});

describe("POST /api/brag-sheet/autofill — concurrency cap (MAX_CONCURRENT_AUTOFILLS = 2)", () => {
  it("third concurrent request gets 429; the slots release after resolution", async () => {
    withGateway();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    h.runBragAutofill.mockImplementation(async () => {
      await gate;
      return fakeResponse;
    });

    const p1 = POST(postReq(validBody));
    const p2 = POST(postReq(validBody));
    const p3 = POST(postReq(validBody));

    const r3 = await p3;
    expect(r3.status).toBe(429);
    expect((await r3.json()).error).toBe(
      "Too many drafts in progress. Try again shortly.",
    );

    release();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    // Counter released — a fresh request succeeds.
    h.runBragAutofill.mockResolvedValue(fakeResponse);
    const r4 = await POST(postReq(validBody));
    expect(r4.status).toBe(200);
  });
});

describe("POST /api/brag-sheet/autofill — model and audit failures", () => {
  it("502 when the model output fails the strict parse twice (AutofillModelError)", async () => {
    withGateway();
    h.runBragAutofill.mockRejectedValue(
      new AutofillModelError("second parse failed"),
    );
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe(
      "The AI model returned unusable output. Try again.",
    );
  });

  it("500 generic on the fail-closed audit throw — internals never echoed", async () => {
    withGateway();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.runBragAutofill.mockRejectedValue(
      new Error(
        "Auto-fill could not be recorded in the audit log; no draft was released.",
      ),
    );
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Draft generation failed. See server logs for details.");
    expect(JSON.stringify(body)).not.toContain("audit");
    errSpy.mockRestore();
  });
});

describe("GET /api/brag-sheet/autofill — availability probe (spec §5.2)", () => {
  it("401 when unauthenticated", async () => {
    h.getRouteUserId.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("keyless ⇒ { available: false, model: null }", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ available: false, model: null });
  });

  it("gateway auth ⇒ { available: true, model: 'anthropic/claude-opus-4.8' }", async () => {
    withGateway();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      available: true,
      model: "anthropic/claude-opus-4.8",
    });
  });
});
