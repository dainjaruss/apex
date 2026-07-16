import { vi } from "vitest";

// Global defaults for AppShell and pages using next/navigation.
// Suite-specific mocks may override these.
const mockRouter = {
  push: vi.fn(),
  refresh: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
};
const mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/dashboard",
  useParams: () => ({}),
  useSearchParams: () => mockSearchParams,
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return {
    ...actual,
    signOut: vi.fn().mockResolvedValue(undefined),
  };
});
