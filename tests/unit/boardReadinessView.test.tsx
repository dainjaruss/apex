// tests/unit/boardReadinessView.test.tsx
//
// The Results screen (ResultsView v2 — coverage first, then a plan). Every test
// here pins a rendering rule that exists because the old screen broke it:
//
//   - a suppressed score must not reappear as a number, a band, or a sum of
//     per-area parts (Σ detail.contribution recovered 43.2 AND its band exactly
//     on a `score: null` report);
//   - "not entered" must not look like a deficiency — that conflation IS the
//     defect this epic exists to fix, and reintroducing it in CSS is as bad as
//     having it in the arithmetic;
//   - no engine internal (P1, aP, wSum, coveredDays, availableSubweight,
//     contribution, ratio_*) may reach the DOM;
//   - a horizon header must not be rendered from a duration APEX never had;
//   - Run must not score a record the Sailor has edited but not saved.
//
// Reports are built by the REAL engine from real inputs, then passed through the
// same `detail`-stripping the server does, so these assert what a browser
// actually receives rather than a hand-written fixture.

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  scoreBoardConfidence,
  DEFAULT_RUBRIC_CONFIG,
} from "@/lib/boardConfidence/rubric";
import { buildReadinessReport } from "@/lib/boardConfidence/readiness";
import {
  BOARD_DISCLAIMER,
  type BoardAnalysisRow,
  type ClientReadinessReport,
  type LadrItemInput,
  type PsrSection,
  type RubricInputs,
} from "@/lib/boardConfidence/types";

const h = vi.hoisted(() => ({ runBoardAnalysis: vi.fn() }));
vi.mock("@/lib/boardConfidenceService", () => ({
  runBoardAnalysis: h.runBoardAnalysis,
}));

import ResultsView from "@/components/board/ResultsView";

const T = "2026-09-01";
const AS_OF = "2026-04-01";
const CFG = DEFAULT_RUBRIC_CONFIG;

const emptyPsr: PsrSection = {
  entered: false,
  awards: null,
  necs: null,
  education: null,
  tours: null,
  pfa: null,
  adverse: [],
};

/** Server-side shape: `detail` is stripped at the boundary (service.ts). */
const buildClientReport = (inputs: RubricInputs): ClientReadinessReport => {
  const full = buildReadinessReport(
    scoreBoardConfidence(inputs, CFG),
    inputs,
    CFG,
    { asOf: AS_OF },
  );
  return { ...full, areas: full.areas.map(({ detail, ...a }) => a) };
};

const rowFor = (
  inputs: RubricInputs | null,
  over: Partial<BoardAnalysisRow> = {},
): BoardAnalysisRow =>
  ({
    id: "run-1",
    user_id: "u1",
    board_date: T,
    created_at: "2026-04-01T12:00:00.000Z",
    input: {
      boardDate: T,
      evals: [],
      psr: emptyPsr,
      ladr: [],
      preceptFlags: [],
      disclaimer: BOARD_DISCLAIMER,
      warnings: [],
      meta: {},
      ...(inputs ? { readiness: buildClientReport(inputs) } : {}),
    },
    factor_scores: [],
    overall_score: 1,
    band: 0,
    adverse_adjustment: 0,
    narrative: {} as any,
    narrative_source: "fallback",
    narrative_fallback_reason: "no_key",
    model: null,
    created_by: "u1",
    ...over,
  }) as BoardAnalysisRow;

/** Nothing entered — the very first thing the product used to say was "1.0". */
const nothingEntered: RubricInputs = {
  boardDate: T,
  evals: [],
  psr: emptyPsr,
  ladr: [],
  preceptFlags: [],
};

/**
 * A rating whose roadmap carries NO `typical_months` on any row — which is every
 * seeded rating today. Every meet-action therefore lands in `next_cycle` with
 * horizonBasis "unknown_duration".
 */
const noDurationLadr: LadrItemInput[] = [
  {
    milestone_id: "m-warfare",
    category: "qual_warfare",
    status: "not_met",
    verified_in_ompf: false,
    item: "Information Warfare (EIWS)",
  },
  {
    milestone_id: "m-pme",
    category: "pme_required",
    status: "not_met",
    verified_in_ompf: false,
    item: "Petty Officer First Class Selectee Leadership Course",
  },
  {
    milestone_id: "m-open",
    category: "skill_training_required",
    status: "unanswered",
    verified_in_ompf: false,
    item: "Advanced Network Analyst",
  },
];

const partlyEntered: RubricInputs = {
  boardDate: T,
  evals: [
    {
      period_from: "2025-03-16",
      period_to: "2026-03-15",
      report_type: "EVAL",
      promotion_recommendation: "Promotable",
      trait_average: 3.8,
      summary_group_average: null,
      rsca: null,
      sea_duty: false,
      ep_count: null,
      group_size: null,
    },
  ],
  psr: {
    ...emptyPsr,
    entered: true,
    awards: [
      {
        title: "Navy Achievement Medal",
        level: "personal_achievement",
        date_awarded: "2025-06-01",
        verified_in_ompf: false,
      },
    ],
  },
  ladr: noDurationLadr,
  preceptFlags: [],
};

const baseProps = {
  runs: [],
  selected: null as BoardAnalysisRow | null,
  onSelect: vi.fn(),
  onRunComplete: vi.fn(),
  consentGranted: true,
  onRequestConsent: vi.fn(),
  onSaveBeforeRun: vi.fn(async () => true),
  rating: "IT" as string | null,
  ladrLoaded: true,
  ladrFetching: false,
  ladrFetchMsg: null,
  onFetchLadr: vi.fn(),
};

const renderWith = (row: BoardAnalysisRow | null, over: Partial<typeof baseProps> = {}) =>
  render(<ResultsView {...baseProps} runs={row ? [row] : []} selected={row} {...over} />);

beforeEach(() => {
  vi.clearAllMocks();
  baseProps.onSaveBeforeRun.mockResolvedValue(true);
});

describe("ResultsView — the suppressed score stays suppressed", () => {
  it("renders no number and no band when score is null", () => {
    const report = buildClientReport(nothingEntered);
    expect(report.score).toBeNull(); // guard: the fixture must exercise the gate

    renderWith(rowFor(nothingEntered));

    expect(screen.queryByTestId("score-line")).toBeNull();
    const text = document.body.textContent ?? "";
    // Every band label the rubric can emit — none may appear anywhere.
    for (const label of [
      "Clearly at the top",
      "Competitive",
      "Crunch",
      "Not competitive this cycle",
      "Drop-from-consideration risk",
    ])
      expect(text).not.toContain(label);
    expect(text).not.toMatch(/\/\s*100\b/);
    expect(text).not.toMatch(/\bvote\s+(0|25|50|75|100)\b/);
  });

  it("shows the engine's own reason verbatim instead of a number", () => {
    const report = buildClientReport(nothingEntered);
    renderWith(rowFor(nothingEntered));
    // Verbatim, so a new gate branch (e.g. "your rating's roadmap grew") reaches
    // the Sailor without this component guessing at its wording.
    expect(screen.getByTestId("score-note").textContent).toBe(report.scoreNote);
  });

  it("leads with coverage, not with a verdict", () => {
    renderWith(rowFor(nothingEntered));
    const heading = screen.getByRole("heading", { level: 2 });
    expect(heading.textContent).toMatch(/APEX can see \d+ of \d+ areas/);
  });

  it("the prior-reviews table carries no score or band column", () => {
    renderWith(rowFor(nothingEntered));
    const headers = screen.getAllByRole("columnheader").map((th) => th.textContent);
    expect(headers).toEqual(["Run date", "Board date", "Coverage"]);
  });

  it("still shows the number and band when the engine DOES emit one", () => {
    // The converse of the rule: suppression must be the gate's decision, not a
    // blanket deletion of score rendering. Synthesised, because both gates
    // passing is rare by design (and getting rarer).
    const scored = buildClientReport(partlyEntered);
    const row = rowFor(partlyEntered);
    row.input.readiness = {
      ...scored,
      score: { value: 78.4, band: 75, label: "Competitive" },
      scoreNote: null,
    };

    renderWith(row);
    const line = screen.getByTestId("score-line");
    expect(line.textContent).toContain("78.4 / 100");
    expect(line.textContent).toContain("Competitive");
    expect(screen.queryByTestId("score-note")).toBeNull();
  });

  it("a run stored before v2 shows no score at all, not its stored one", () => {
    renderWith(rowFor(null, { overall_score: 1, band: 0 }));
    const text = document.body.textContent ?? "";
    expect(text).toContain("predates the readiness review");
    expect(text).not.toContain("Drop-from-consideration risk");
    expect(text).not.toMatch(/\b1\.0\b/);
  });
});

describe("ResultsView — 'not entered' is a data state, not a deficiency", () => {
  it("not_entered and needs_attention get different treatment, not the same bar", () => {
    renderWith(rowFor(nothingEntered));

    // An empty record produces both statuses at once: completeness is a REAL
    // finding (an empty record genuinely is incomplete) while everything else is
    // simply unknown to APEX.
    const notEntered = document.querySelectorAll('[data-status="not_enough_entered"]');
    const attention = document.querySelectorAll('[data-status="needs_attention"]');
    expect(notEntered.length).toBeGreaterThan(0);
    expect(attention.length).toBeGreaterThan(0);

    const a = notEntered[0] as HTMLElement;
    const b = attention[0] as HTMLElement;
    // Different border STYLE, not the same border in a different colour.
    expect(a.style.borderStyle).toBe("dashed");
    expect(b.style.borderStyle).toBe("solid");
    expect(a.style.borderLeftColor).not.toBe(b.style.borderLeftColor);
    // Different badge class — never the same ramp at a different saturation.
    expect(a.querySelector(".apex-badge-draft")).not.toBeNull();
    expect(b.querySelector(".apex-badge-amber")).not.toBeNull();
    // And a neutral word, never a grade.
    expect(a.textContent).toContain("Not entered");
    expect(a.textContent).not.toContain("Needs attention");
  });

  it("no area renders a progress bar that would rank the two on one scale", () => {
    renderWith(rowFor(nothingEntered));
    document.querySelectorAll("[data-status]").forEach((el) => {
      expect(el.querySelector('[style*="width"]')).toBeNull();
    });
  });

  it("every area states where its data came from, on the surface", () => {
    const report = buildClientReport(partlyEntered);
    renderWith(rowFor(partlyEntered));
    for (const area of report.areas) {
      if (area.key === "precept") continue; // dropped when no precept is loaded
      const card = screen.getByTestId(`area-${area.key}`);
      // Inline text, not a title/aria tooltip.
      expect(card.textContent).toContain(area.evidenceNote);
      expect(card.textContent).toContain(area.evidenceLabel);
    }
  });

  it("a tool-configuration gap is not shown as something the Sailor failed to enter", () => {
    // No active precept ⇒ the rubric drops the factor to weight 0 and coverage
    // counts 5 areas. A sixth "Not entered" card would contradict the headline
    // AND blame the Sailor for a setting only an Admin can make.
    const report = buildClientReport(nothingEntered);
    expect(report.coverage.areasTotal).toBe(5);

    renderWith(rowFor(nothingEntered));
    expect(screen.queryByTestId("area-precept")).toBeNull();
    expect(document.querySelectorAll("[data-status]")).toHaveLength(5);
    expect(document.body.textContent).toContain("they are not counted against you");
  });
});

describe("ResultsView — no engine internal reaches the DOM", () => {
  // Extends the ban PR #21 applies to engine strings: here it covers everything
  // this component adds, including anything React might stringify by accident.
  const BANNED =
    /\b(P1|P2|P3|P4|aP|wSum|S_f|coveredDays|availableSubweight|nObserved|declinePenalty|contribution|excluded|ratio_[a-z_]+)\b/;

  for (const [name, inputs] of [
    ["an empty record", nothingEntered],
    ["a partly entered record", partlyEntered],
  ] as const) {
    it(`keeps them out of the rendered text for ${name}`, () => {
      renderWith(rowFor(inputs));
      expect(document.body.textContent ?? "").not.toMatch(BANNED);
      expect(document.body.innerHTML).not.toMatch(/detail|contribution/i);
    });
  }

  it("the server strips detail before the report ever leaves, so no toggle can reach it", () => {
    const report = buildClientReport(partlyEntered);
    for (const area of report.areas)
      expect(area).not.toHaveProperty("detail");
  });
});

describe("ResultsView — the disclaimer", () => {
  it("renders the normative §1.1 text on the results view", () => {
    renderWith(rowFor(partlyEntered));
    const notes = screen.getAllByLabelText("Unofficial tool disclaimer");
    // Exactly one: the audit found it five times before the first actionable
    // sentence, and the page banner now stands down on this tab.
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toContain(BOARD_DISCLAIMER.slice(0, 60));
  });
});

describe("ResultsView — the plan groups on horizonBasis, not on horizon", () => {
  it("renders one honest 'start now' bucket when no milestone carries a duration", () => {
    const report = buildClientReport(partlyEntered);
    // Guard: the fixture must actually exercise the unknown-duration path.
    const meets = report.actions.filter((a) => a.horizonBasis === "unknown_duration");
    expect(meets.length).toBeGreaterThan(0);
    expect(meets.every((a) => a.horizon === "next_cycle")).toBe(true);

    renderWith(rowFor(partlyEntered));
    const text = document.body.textContent ?? "";
    expect(text).toContain("APEX does not know how long these take — start now");
    // The blind "next cycle" header those same actions would have produced.
    expect(text).not.toContain("Longer than the time left");
  });

  it("turns missing areas into the first, unlockable steps of the plan", () => {
    const report = buildClientReport(nothingEntered);
    expect(report.coverage.missing.length).toBeGreaterThan(0);

    renderWith(rowFor(nothingEntered));
    const steps = screen.getAllByRole("listitem").map((li) => li.textContent ?? "");
    for (const m of report.coverage.missing)
      expect(steps.some((s) => s.includes(m.label) && s.includes(m.unlocks))).toBe(true);
  });

  it("never prints an action's point value", () => {
    renderWith(rowFor(partlyEntered));
    expect(document.body.textContent ?? "").not.toMatch(/[+−-]\s?\d+(\.\d+)?\s*(points|pts)/i);
  });
});

describe("ResultsView — unsaved edits are never silently unscored", () => {
  it("saves before running", async () => {
    h.runBoardAnalysis.mockResolvedValue(rowFor(partlyEntered));
    renderWith(rowFor(partlyEntered));

    fireEvent.click(screen.getByRole("button", { name: "Run Review" }));
    await waitFor(() => expect(h.runBoardAnalysis).toHaveBeenCalled());
    expect(baseProps.onSaveBeforeRun).toHaveBeenCalled();
    expect(baseProps.onSaveBeforeRun.mock.invocationCallOrder[0]).toBeLessThan(
      h.runBoardAnalysis.mock.invocationCallOrder[0],
    );
  });

  it("blocks the run when the save was refused", async () => {
    baseProps.onSaveBeforeRun.mockResolvedValue(false);
    renderWith(rowFor(partlyEntered));

    fireEvent.click(screen.getByRole("button", { name: "Run Review" }));
    await screen.findByRole("alert");
    expect(h.runBoardAnalysis).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toContain("Unsaved changes");
  });

  it("hands the engine a caller-supplied today rather than letting it read a clock", async () => {
    h.runBoardAnalysis.mockResolvedValue(rowFor(partlyEntered));
    renderWith(rowFor(partlyEntered));

    fireEvent.click(screen.getByRole("button", { name: "Run Review" }));
    await waitFor(() => expect(h.runBoardAnalysis).toHaveBeenCalled());
    expect(h.runBoardAnalysis.mock.calls[0][0].asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("ResultsView — empty and first-run states", () => {
  it("invites a brand-new user to run without a complete record first", () => {
    renderWith(null);
    expect(document.body.textContent).toContain("No review yet");
    expect(document.body.textContent).toContain("do not need a complete record");
  });

  it("offers the one-click Navy COOL fetch when the rating has no roadmap", () => {
    renderWith(rowFor(nothingEntered), { ladrLoaded: false });
    expect(
      screen.getByRole("button", { name: /Fetch official LaDR from Navy COOL/ }),
    ).toBeDefined();
    // 80 of 82 ratings — say so rather than implying the Sailor did something wrong.
    expect(document.body.textContent).toContain(
      "only a couple of ratings ship with a roadmap already loaded",
    );
  });

  it("asks for a rating first when none is set", () => {
    renderWith(rowFor(nothingEntered), { ladrLoaded: false, rating: null });
    expect(screen.queryByRole("button", { name: /Navy COOL/ })).toBeNull();
    expect(document.body.textContent).toContain("Pick your rating on the Record Entry tab");
  });
});
