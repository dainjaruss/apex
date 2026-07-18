import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LoginPage from "@/app/login/page";
import React from "react";

// Mock next/navigation router
const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
  usePathname: () => "/login",
}));

// Mock auth module — the page calls signInWithPassword then getSession, and
// only redirects (full navigation, not router.push) when a session exists.
const mockSignIn = vi.fn();
const mockGetSession = vi.fn();
vi.mock("@/lib/auth", () => ({
  signInWithPassword: (...args: any[]) => mockSignIn(...args),
  getSession: (...args: any[]) => mockGetSession(...args),
  resendVerificationEmail: vi.fn(),
}));

// jsdom's real location.assign throws "not implemented" — replace location
// with a spy-carrying copy (jsdom keeps the property configurable).
const mockAssign = vi.fn();
const realLocation = window.location;
beforeAll(() => {
  Object.defineProperty(window, "location", {
    value: { ...realLocation, assign: mockAssign },
    writable: true,
    configurable: true,
  });
});
afterAll(() => {
  Object.defineProperty(window, "location", {
    value: realLocation,
    writable: true,
    configurable: true,
  });
});

describe("LoginPage Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the login form inputs and submit button", () => {
    render(<LoginPage />);
    expect(screen.getByPlaceholderText("sailor@navy.mil")).toBeDefined();
    expect(screen.getByPlaceholderText("••••••••")).toBeDefined();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeDefined();
  });

  it("should call signInWithPassword and redirect to dashboard on successful login", async () => {
    mockSignIn.mockResolvedValueOnce({ user: { id: "test-user-id" } });
    mockGetSession.mockResolvedValueOnce({ user: { id: "test-user-id" } });
    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText("sailor@navy.mil");
    const passInput = screen.getByPlaceholderText("••••••••");
    const submitBtn = screen.getByRole("button", { name: /sign in/i });

    fireEvent.change(emailInput, { target: { value: "sailor@navy.mil" } });
    fireEvent.change(passInput, { target: { value: "password123" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("sailor@navy.mil", "password123");
      // The page does a full navigation (middleware needs the auth cookies),
      // not a client-side router.push.
      expect(mockAssign).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("should show the session-not-saved error instead of redirecting when no session exists", async () => {
    mockSignIn.mockResolvedValueOnce({ user: { id: "test-user-id" } });
    mockGetSession.mockResolvedValueOnce(null);
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("sailor@navy.mil"), {
      target: { value: "sailor@navy.mil" },
    });
    fireEvent.change(screen.getByPlaceholderText("••••••••"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText(/session was not saved/i)).toBeDefined();
    });
    expect(mockAssign).not.toHaveBeenCalled();
  });

  it("should display error message on authentication failure", async () => {
    mockSignIn.mockRejectedValueOnce(new Error("Invalid password"));
    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText("sailor@navy.mil");
    const passInput = screen.getByPlaceholderText("••••••••");
    const submitBtn = screen.getByRole("button", { name: /sign in/i });

    fireEvent.change(emailInput, { target: { value: "sailor@navy.mil" } });
    fireEvent.change(passInput, { target: { value: "wrongpass" } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Invalid password")).toBeDefined();
    });
  });
});
