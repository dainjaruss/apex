import { describe, it, expect, vi, beforeEach } from "vitest";

// tests/setup.ts globally stubs @/lib/auth (incl. signOut) for page suites;
// this suite tests the REAL module against a mocked supabase client.
vi.unmock("@/lib/auth");

import { signInWithPassword, signUpWithEmail, signOut } from "@/lib/auth";

// Mock the supabase client to prevent network requests during tests
const h = vi.hoisted(() => ({
  storageList: vi.fn(),
  storageRemove: vi.fn(),
  authSignOut: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@/lib/supabaseClient", () => {
  const mockSingle = vi
    .fn()
    .mockResolvedValue({ data: { preferred_role: "Sailor" }, error: null });
  const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });

  return {
    createBrowserClient: () => ({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: { user: { id: "mock-user-id" } },
          error: null,
        }),
        signUp: vi.fn().mockResolvedValue({
          data: { user: { id: "mock-user-id" } },
          error: null,
        }),
        signOut: h.authSignOut,
        getSession: h.getSession,
      },
      from: vi.fn().mockReturnValue({
        select: mockSelect,
      }),
      storage: {
        from: vi.fn(() => ({
          list: h.storageList,
          remove: h.storageRemove,
        })),
      },
    }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  h.storageList.mockResolvedValue({ data: [], error: null });
  h.storageRemove.mockResolvedValue({ error: null });
  h.authSignOut.mockResolvedValue({ error: null });
  h.getSession.mockResolvedValue({
    data: { session: { user: { id: "mock-user-id" } } },
  });
});

describe("APEX Auth Unit Tests", () => {
  it("should authenticate user with valid credentials", async () => {
    const res = await signInWithPassword("test@navy.mil", "password123");
    expect(res?.user?.id).toBe("mock-user-id");
  });

  it("should register user with profile metadata", async () => {
    const res = await signUpWithEmail("test@navy.mil", "password123", {
      firstName: "Franklyn",
      lastName: "Dain",
      middleInitial: "A",
      dodId: "1234567890",
      uic: "12345",
      navyRank: "SN",
      command: "USS NEVERSAIL",
      preferredRole: "Sailor",
    });
    expect(res?.user?.id).toBe("mock-user-id");
  });
});

describe("Ephemeral board-doc purge (v1.3: uploads destroyed at logout)", () => {
  it("signOut destroys the caller's board-docs before ending the session", async () => {
    h.storageList.mockResolvedValue({
      data: [{ name: "esr-redacted.pdf" }, { name: "psr-redacted.pdf" }],
      error: null,
    });

    await signOut();

    expect(h.storageList).toHaveBeenCalledWith("mock-user-id");
    expect(h.storageRemove).toHaveBeenCalledWith([
      "mock-user-id/esr-redacted.pdf",
      "mock-user-id/psr-redacted.pdf",
    ]);
    expect(h.authSignOut).toHaveBeenCalled();
    // Purge runs while the session still exists (RLS requires the owner).
    expect(h.storageRemove.mock.invocationCallOrder[0]).toBeLessThan(
      h.authSignOut.mock.invocationCallOrder[0],
    );
  });

  it("signOut proceeds even when the purge fails — logout is never blocked", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    h.storageList.mockRejectedValue(new Error("storage down"));

    await expect(signOut()).resolves.toBeUndefined();
    expect(h.authSignOut).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("signOut skips the purge when no session exists", async () => {
    h.getSession.mockResolvedValue({ data: { session: null } });

    await signOut();
    expect(h.storageList).not.toHaveBeenCalled();
    expect(h.authSignOut).toHaveBeenCalled();
  });

  it("login sweeps leftovers from a session that never logged out", async () => {
    h.storageList.mockResolvedValue({
      data: [{ name: "stale.pdf" }],
      error: null,
    });

    await signInWithPassword("test@navy.mil", "password123");

    expect(h.storageList).toHaveBeenCalledWith("mock-user-id");
    expect(h.storageRemove).toHaveBeenCalledWith(["mock-user-id/stale.pdf"]);
  });
});
