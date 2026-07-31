// tests/unit/boardPreceptPanel.test.tsx
//
// The Precept tab's three states. It branched on the precept row EXISTING while
// the engine branches on the row citing a source (assembleRubricInputs), so a
// row with source_url null produced emerald Warfighting / Sea duty chips under
// "feed the Board Emphasis factor" on this tab, while the Results tab of the
// SAME session said APEX had excluded those areas entirely.
//
// Reachable, not hypothetical: scripts/set-precept.ts validates `cycle` and
// at-least-one-flag, and does not require source_url.
//
// Nothing rendered this component before, so both the wide mutant
// (`!!precept.source_url` -> `!!precept`) and the narrow one
// (`set && sourced` -> `set`) passed the entire suite.

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import type { BoardPrecept } from "@/lib/boardConfidence/types";

vi.mock("@/lib/boardConfidenceService", () => ({
  fetchPreceptPreview: vi.fn(),
  extractPreceptFromFile: vi.fn(),
  getActivePrecept: vi.fn(),
  getMemberBoardRecord: vi.fn(),
  getLatestLadr: vi.fn(),
  fetchLadr: vi.fn(),
  listMyAnalyses: vi.fn(),
  saveMemberBoardRecord: vi.fn(),
  runBoardAnalysis: vi.fn(),
}));

import PreceptPanel from "@/components/board/PreceptPanel";

const FLAGS = {
  warfighting: true,
  leadership_positions: true,
  education: false,
  sea_duty: true,
  technical_expertise: false,
};

const precept = (source_url: string | null): BoardPrecept => ({
  cycle: "FY27 Active-Duty E7",
  title: "FY27 CPO Selection Board emphasis",
  emphasis_flags: FLAGS,
  source_url,
  active: true,
});

/** The chip element carrying a flag label, whatever its styling. */
const chip = (label: string) =>
  Array.from(document.querySelectorAll("span")).find(
    (el) => el.textContent?.startsWith(label) && el.className.includes("apex-badge"),
  )!;

describe("PreceptPanel — no precept row at all", () => {
  it("says the factor is excluded and its weight redistributed", () => {
    render(<PreceptPanel precept={null} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("No board precept is loaded");
    expect(text).toContain("10% weight is spread across the other five factors");
    expect(document.querySelectorAll(".apex-badge-emerald")).toHaveLength(0);
  });
});

describe("PreceptPanel — a row that cites no convening order", () => {
  it("styles NO flag as active, however many are set", () => {
    render(<PreceptPanel precept={precept(null)} />);
    // The mutant this kills: `set && sourced` -> `set` puts these back.
    expect(document.querySelectorAll(".apex-badge-emerald")).toHaveLength(0);
    expect(chip("Warfighting").className).toContain("apex-badge-draft");
    expect(chip("Sea duty").className).toContain("apex-badge-draft");
  });

  it("distinguishes a recorded-but-unscored flag from an unemphasized one", () => {
    render(<PreceptPanel precept={precept(null)} />);
    expect(chip("Warfighting").textContent).toBe("Warfighting — recorded, not scored");
    expect(chip("Education").textContent).toBe("Education — not emphasized");
  });

  it("does not claim the areas feed the score, and says why", () => {
    render(<PreceptPanel precept={precept(null)} />);
    const text = document.body.textContent ?? "";
    // The wide mutant (`!!precept.source_url` -> `!!precept`) restores this.
    expect(text).not.toContain("feed the Board Emphasis factor");
    expect(text).toContain("not traceable to a convening order");
    expect(text).toContain("excludes them from your review");
  });

  it("agrees with what the Results tab says about the same run", () => {
    render(<PreceptPanel precept={precept(null)} />);
    // ResultsView: "APEX has no board emphasis areas it can trace to a
    // convening order, so it left them out of this review entirely."
    expect(document.body.textContent).toMatch(/trace\w*\b.*convening order/);
  });
});

describe("PreceptPanel — a sourced precept", () => {
  it("marks the set flags active and states that they feed the factor", () => {
    render(
      <PreceptPanel
        precept={precept("https://www.mynavyhr.navy.mil/Portals/55/FY27_Enlisted_Precept.pdf")}
      />,
    );
    expect(chip("Warfighting").className).toContain("apex-badge-emerald");
    expect(chip("Sea duty").className).toContain("apex-badge-emerald");
    expect(chip("Education").className).toContain("apex-badge-draft");
    expect(chip("Warfighting").textContent).toBe("Warfighting");
    const text = document.body.textContent ?? "";
    expect(text).toContain("feed the Board Emphasis factor");
    expect(text).not.toContain("not traceable to a convening order");
  });

  it("links the source document", () => {
    render(<PreceptPanel precept={precept("https://www.mynavyhr.navy.mil/p.pdf")} />);
    expect(screen.getByRole("link", { name: "Source" })).toHaveProperty(
      "href",
      "https://www.mynavyhr.navy.mil/p.pdf",
    );
  });
});
