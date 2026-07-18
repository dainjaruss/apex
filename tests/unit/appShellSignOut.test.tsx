// Regression: sign out used to live only in the desktop sidebar (hidden below
// lg), leaving mobile users with no way to sign out. The shell must expose a
// sign-out control outside the sidebar for small viewports.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AppShell from "@/components/layout/AppShell";
import { signOut } from "@/lib/auth";
import { useRouter } from "next/navigation";

describe("AppShell sign out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const renderShell = () =>
    render(
      <AppShell profile={{ navy_rank: "IT2", last_name: "SAILOR", preferred_role: "Sailor" }}>
        <div>content</div>
      </AppShell>,
    );

  it("renders a sign-out control outside the desktop-only sidebar", () => {
    renderShell();
    const buttons = screen.getAllByRole("button", { name: /sign out/i });
    const outsideSidebar = buttons.filter((b) => !b.closest("aside"));
    expect(outsideSidebar).toHaveLength(1);
    // Mobile header button hides at lg (where the sidebar takes over) but is
    // visible below it; the sidebar itself is hidden below lg.
    expect(outsideSidebar[0].className).toContain("lg:hidden");
    const sidebar = buttons.find((b) => b.closest("aside"))?.closest("aside");
    expect(sidebar?.className).toContain("hidden");
    expect(sidebar?.className).toContain("lg:flex");
  });

  it("signs out and redirects to /login from the mobile header button", async () => {
    renderShell();
    const mobileButton = screen
      .getAllByRole("button", { name: /sign out/i })
      .find((b) => !b.closest("aside"))!;
    fireEvent.click(mobileButton);
    await waitFor(() => {
      expect(signOut).toHaveBeenCalledTimes(1);
      expect(useRouter().push).toHaveBeenCalledWith("/login");
    });
  });
});
