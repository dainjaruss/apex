// Regression: the Brag Sheet and Board Confidence pages shipped without any
// navigation entry — unreachable except by URL. The shell must expose both in
// the desktop sidebar AND the mobile tab bar for every role.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AppShell from "@/components/layout/AppShell";

const renderShell = () =>
  render(
    <AppShell profile={{ navy_rank: "IT2", last_name: "SAILOR", preferred_role: "Sailor" }}>
      <div>content</div>
    </AppShell>,
  );

const hrefs = (links: HTMLElement[]) =>
  links.map((a) => a.getAttribute("href"));

describe("AppShell navigation — feature discoverability", () => {
  it("sidebar links Brag Sheet and Board Confidence for a plain Sailor", () => {
    renderShell();
    const sidebar = document.querySelector("aside")!;
    const links = Array.from(sidebar.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(links).toContain("/brag-sheet");
    expect(links).toContain("/board-confidence");
    expect(links).toContain("/dashboard");
    expect(links).toContain("/evaluations/new");
  });

  it("mobile tab bar links both features (visible below lg where the sidebar is hidden)", () => {
    renderShell();
    const mobileNav = screen.getByRole("navigation", { name: "Primary" });
    const links = Array.from(mobileNav.querySelectorAll("a")).map((a) =>
      a.getAttribute("href"),
    );
    expect(links).toContain("/brag-sheet");
    expect(links).toContain("/board-confidence");
  });
});
