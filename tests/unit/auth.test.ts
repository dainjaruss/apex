import { describe, it, expect, vi } from "vitest";
import { signInWithPassword, signUpWithEmail } from "@/lib/auth";

// Mock the supabase client to prevent network requests during tests
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
      },
      from: vi.fn().mockReturnValue({
        select: mockSelect,
      }),
    }),
  };
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
