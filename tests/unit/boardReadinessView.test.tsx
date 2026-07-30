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

/**
 * Everything a user can perceive, not just `document.body.textContent`.
 *
 * Two holes this closes, both of which let a mutant render the composite while
 * all 34 tests stayed green:
 *  - textContent is CONCATENATED WITHOUT SEPARATORS, so React's `vote {band}`
 *    arrives as "…RESULTvote 0APEX…" and a `\bvote\s+\d+\b` guard never fires.
 *    Padding the boundaries makes \b behave the way the assertion assumed.
 *  - textContent excludes ATTRIBUTES entirely, so a score in an aria-label or a
 *    title — which a screen reader reads aloud and a tooltip shows — was
 *    invisible to every guard here. The old ScoreDial put it in exactly those
 *    two places.
 */
const perceivable = (): string => {
  const parts: string[] = [];
  document.body.querySelectorAll("*").forEach((el) => {
    for (const attr of ["aria-label", "aria-description", "title", "alt", "aria-valuetext"]) {
      const v = el.getAttribute(attr);
      if (v) parts.push(v);
    }
    for (const n of Array.from(el.childNodes))
      if (n.nodeType === 3 && n.textContent?.trim()) parts.push(n.textContent);
  });
  return ` ${parts.join(" \n ")} `;
};

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
    // Attributes included: an aria-label or title carrying the score is read
    // aloud and shown on hover, and textContent cannot see either.
    const text = perceivable();
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
    expect(text).not.toMatch(/vote\s+(0|25|50|75|100)\b/);
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

  it("renders no number and no band even when the engine DOES emit one", () => {
    // Founder ruling, replacing the earlier "suppression must be the gate's
    // decision" reading of this case. The gates catch the thin record; what
    // survives them is the record where the number is confidently WRONG — four
    // straight Must Promote above the summary group, PSR entered, LaDR fully
    // answered, coverage 6 of 6 at 1.000, "44.5 / 100 — vote 25, Not
    // competitive this cycle". Nothing is missing there, so no gate can help.
    const scored = buildClientReport(partlyEntered);
    const row = rowFor(partlyEntered);
    row.input.readiness = {
      ...scored,
      score: { value: 78.4, band: 75, label: "Competitive" },
      scoreNote: null,
    };

    renderWith(row);
    const text = perceivable();
    expect(screen.queryByTestId("score-line")).toBeNull();
    expect(text).not.toContain("78.4");
    expect(text).not.toContain("Competitive");
    expect(text).not.toMatch(/\/\s*100\b/);
    expect(text).not.toMatch(/vote\s+(0|25|50|75|100)\b/);
    // Still computed and still persisted — a render decision, not an engine one.
    expect(row.input.readiness.score).not.toBeNull();
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

  it("renders continuity as a data state when nothing the rubric scored survives", () => {
    // Reported live on this screen before PR #24: a record whose ONLY report was
    // dated after the board date rendered "Reporting continuity — LOOKING
    // STRONG, APEX found no break between the reports you have entered", while
    // Performance correctly said it held too few reports. #24 gates evidence on
    // what the engine actually scored, so continuity is now not_enough_entered.
    const futureDated: RubricInputs = {
      ...partlyEntered,
      evals: [{ ...partlyEntered.evals[0], period_from: "2026-10-01", period_to: "2027-09-30" }],
    };
    const cont = buildClientReport(futureDated).areas.find((a) => a.key === "continuity")!;
    expect(cont.status).toBe("not_enough_entered");

    renderWith(rowFor(futureDated));
    const card = screen.getByTestId("area-continuity");
    expect(card.getAttribute("data-status")).toBe("not_enough_entered");
    expect((card as HTMLElement).style.borderStyle).toBe("dashed");
    expect(card.textContent).toContain("Not entered");
    expect(card.textContent).not.toContain("found no break");
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
    // Two states route here — no precept row, and a precept row an admin filled
    // in that cites no convening order. "Not set up for your cycle" was true of
    // the first and false of the second.
    expect(document.body.textContent).not.toContain("not set up for your cycle");
  });
});

// Extends the ban PR #21 applies to engine strings: here it covers everything
// this component renders, including anything React might stringify by accident.
const BANNED =
  /\b(P1|P2|P3|P4|aP|wSum|S_f|coveredDays|availableSubweight|nObserved|declinePenalty|contribution|excluded|ratio_[a-z_]+)\b/;

describe("ResultsView — no engine internal reaches the DOM", () => {

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

  it("the server strips detail from the report before it leaves", () => {
    const report = buildClientReport(partlyEntered);
    for (const area of report.areas)
      expect(area).not.toHaveProperty("detail");
  });

  it("keeps engine internals off the SCREEN even when the row carries them", () => {
    // The guard above only covers readiness.areas[].detail. Production rows also
    // carry factor_scores, overall_score and band — .select("*") returns them and
    // the analyze route hands the row back wholesale — so a fixture with
    // factor_scores: [] would pass this suite while the real screen leaked.
    // Give the row what production gives it.
    const scored = scoreBoardConfidence(partlyEntered, CFG);
    const row = rowFor(partlyEntered, {
      factor_scores: scored.factors,
      overall_score: scored.final,
      band: scored.band,
    });
    expect(row.factor_scores.length).toBe(6);
    expect(row.factor_scores[0]).toHaveProperty("contribution");

    renderWith(row);
    const text = perceivable();
    expect(text).not.toMatch(BANNED);
    // Non-zero only: "0.0" is unavoidably common (it lives inside any ISO
    // timestamp) and a zero contribution reconstructs nothing anyway.
    for (const f of row.factor_scores.filter((x) => x.contribution > 0))
      expect(text).not.toContain(f.contribution.toFixed(1));
    expect(text).not.toContain(String(scored.final));
    expect(text).not.toMatch(/vote\s+(0|25|50|75|100)\b/);
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

describe("ResultsView — the continuity advisory states the rule, not its inverse", () => {
  // BUPERSINST 1610.10H para 17-6: "Missing FITREPs, CHIEFEVALs, or EVALs do not
  // disqualify a member before a selection board." APEX asserted the opposite.
  // It survived a full domain review by living in a fallback branch nobody
  // rendered, and it is ALSO persisted verbatim into every pre-correction
  // board_analyses row — twice, since rubric.ts pushes the advisory into
  // `warnings` as well. These pin both paths.
  const RETRACTED =
    "A selection board can treat ANY gap in the record — even a single day — as enough to disqualify a candidate.";

  const gapRow = (advisory: string | null, warnings: string[] = []) => {
    const row = rowFor(partlyEntered);
    row.input.meta = {
      continuity_gap: true,
      ...(advisory ? { continuity_advisory: advisory } : {}),
    };
    row.input.warnings = warnings;
    return row;
  };

  it("never renders the retracted claim from a pre-correction snapshot", () => {
    renderWith(gapRow(RETRACTED, [RETRACTED, "Excluded 1 report."]));
    expect(document.body.textContent).not.toMatch(/even a single day/i);
    expect(document.body.textContent).not.toMatch(/enough to disqualify/i);
    // The other data notice is untouched — this filters one retracted claim,
    // not every warning.
    expect(document.body.textContent).toContain("Excluded 1 report.");
  });

  it("says what para 17-6 says, and names the remedy", () => {
    renderWith(gapRow(null));
    const text = screen.getByTestId("continuity-advisory").textContent ?? "";
    expect(text).toContain("do NOT disqualify you before a selection board");
    expect(text).toContain("BUPERSINST 1610.10H para 17-6");
    // A Sailor must learn there is a fix, not only that there is a problem.
    expect(text).toContain("E-5 or above within the past 5 years");
    expect(text).toContain("para 17-6a");
    expect(text).toContain("letter in lieu of the report");
    expect(text).toContain("para 17-6b");
    // The procedural detail #29 added: a Sailor who follows a compressed
    // version gets bounced. boardContinuityAdvisory.test.tsx pins the same set.
    expect(text).toContain("all required signatures, initials and dates");
    expect(text).toContain("blocks 1-19 and 22-26");
  });

  it("prefers a current run's own advisory so the two texts cannot drift", () => {
    const current =
      "2 gaps in reporting continuity (a missing period longer than 90 days) were detected in the record. Missing FITREPs, CHIEFEVALs, or EVALs do NOT disqualify you before a selection board (BUPERSINST 1610.10H para 17-6).";
    renderWith(gapRow(current, [current]));
    expect(screen.getByTestId("continuity-advisory").textContent).toBe(current);
  });
});

describe("ResultsView — the AI narrative", () => {
  const withNarrative = (
    over: Partial<BoardAnalysisRow>,
    narrative: Record<string, unknown>,
  ) => {
    const row = rowFor(partlyEntered, over);
    row.narrative = narrative as any;
    return row;
  };

  const FULL = {
    strengths: ["Your reports are consistent. [areas.performance]"],
    gaps: ["Your development checklist is empty. [areas.development]"],
    recommendations: ["Do a thing. [actions.x]"],
    factor_commentary: {
      performance: "p",
      leadership: "l",
      development: "d",
      continuity: "c",
      completeness: "x",
      precept: "b",
    },
  };

  it("renders model output as synthesis, not as a second copy of the plan", () => {
    renderWith(withNarrative({ narrative_source: "model", model: "m" }, FULL));
    expect(document.body.textContent).toContain("Your reports are consistent.");
    expect(document.body.textContent).toContain("Your development checklist is empty.");
    // recommendations and factor_commentary are the plan and the area cards
    // re-emitted; a second differently ordered list of what to do is the "two
    // numbers for one item" failure in list form.
    expect(document.body.textContent).not.toContain("Do a thing.");
  });

  it("fails closed on an unexpected narrative_source", () => {
    // `=== "model"` is not interchangeable with `!== "fallback"`. The union says
    // they are; the DATABASE does not — narrative_source is a text column, and a
    // NULL or unrecognised value must not open the model-only path. That
    // refactor reads as a harmless simplification and passes every other test
    // here, so pin the direction explicitly.
    renderWith(withNarrative({ narrative_source: null as any }, FULL));
    expect(screen.queryByText("In plain terms")).toBeNull();
    expect(document.body.textContent).not.toContain("Your reports are consistent.");
  });

  it("does not render the deterministic fallback — it re-emits what is already on screen", () => {
    // fallbackNarrative sets factor_commentary[key] = area.summary and builds
    // recommendations from actions.action + missing.howTo + confirmInOmpf.note.
    // Rendering it would show a Sailor the same sentences twice.
    renderWith(withNarrative({ narrative_source: "fallback" }, FULL));
    expect(document.body.textContent).not.toContain("Your reports are consistent.");
    expect(screen.queryByText("In plain terms")).toBeNull();
  });

  it("strips path-shaped tokens the trailing-only citation gate leaves behind", () => {
    renderWith(
      withNarrative(
        { narrative_source: "model", model: "m" },
        { ...FULL, strengths: ["Solid [areas.bogus]. [areas.performance]"] },
      ),
    );
    // The gate strips only the TRAILING group, so [areas.bogus] survives it.
    expect(document.body.textContent).toContain("Solid.");
    expect(document.body.textContent).not.toContain("areas.bogus");
  });

  it("leaves a non-citation bracket alone instead of mangling the sentence", () => {
    // A shape-only strip turned "…per [1610.10H]. [actions.a1]" into "…per."
    // Anchoring to the closed prefix set citationPaths() enumerates removes the
    // citation and nothing else.
    renderWith(
      withNarrative(
        { narrative_source: "model", model: "m" },
        { ...FULL, gaps: ["Recover the report per [1610.10H]. [actions.a1]"] },
      ),
    );
    expect(document.body.textContent).toContain("Recover the report per [1610.10H].");
  });

  it("keeps the bracketed NEC and CIN codes the gate deliberately preserves", () => {
    renderWith(
      withNarrative(
        { narrative_source: "model", model: "m" },
        {
          ...FULL,
          gaps: ['Complete "Advanced Network Analyst [NEC 742A]" and [CIN A-531-0009].'],
        },
      ),
    );
    expect(document.body.textContent).toContain("[NEC 742A]");
    expect(document.body.textContent).toContain("[CIN A-531-0009]");
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
