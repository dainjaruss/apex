// tests/unit/boardContinuityAdvisory.test.tsx
//
// The reporting-continuity advisory on the Results view must state
// BUPERSINST 1610.10H para 17-6, not its inverse.
//
// Para 17-6, verbatim: "Missing FITREPs, CHIEFEVALs, or EVALs do not disqualify
// a member before a selection board, but missing reports can make the work of
// the board more difficult." APEX asserted the opposite. It survived a full
// domain review by living in a `??` fallback branch nobody rendered, and it is
// ALSO persisted verbatim into every pre-correction board_analyses row — twice,
// because rubric.ts pushes the advisory into `warnings` as well. Correcting the
// engine does not correct those rows, so this pins the RENDER boundary: both
// paths, and the remedy a Sailor is entitled to know about.

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import type { BoardAnalysisRow } from "@/lib/boardConfidence/types";

vi.mock("@/lib/boardConfidenceService", () => ({ runBoardAnalysis: vi.fn() }));

import ResultsView from "@/components/board/ResultsView";

const RETRACTED =
  "A selection board can treat ANY gap in the record — even a single day — as enough to disqualify a candidate.";

const gapRow = (advisory: string | null, warnings: string[] = []): BoardAnalysisRow =>
  ({
    id: "run-1",
    user_id: "u1",
    board_date: "2026-09-01",
    created_at: "2026-04-01T12:00:00.000Z",
    input: {
      boardDate: "2026-09-01",
      evals: [],
      psr: { entered: false, awards: null, necs: null, education: null, tours: null, pfa: null, adverse: [] },
      ladr: [],
      preceptFlags: [],
      disclaimer: "",
      warnings,
      meta: {
        continuity_gap: true,
        ...(advisory ? { continuity_advisory: advisory } : {}),
      },
    },
    factor_scores: [],
    overall_score: 42,
    band: 25,
    adverse_adjustment: 0,
    narrative: {} as any,
    narrative_source: "fallback",
    narrative_fallback_reason: "no_key",
    model: null,
    created_by: "u1",
  }) as BoardAnalysisRow;

const renderRow = (row: BoardAnalysisRow) =>
  render(
    <ResultsView
      runs={[row]}
      selected={row}
      onSelect={vi.fn()}
      onRunComplete={vi.fn()}
      consentGranted
      onRequestConsent={vi.fn()}
    />,
  );

describe("continuity gap advisory — BUPERSINST 1610.10H para 17-6", () => {
  it("never renders the retracted claim from a pre-correction snapshot", () => {
    renderRow(gapRow(RETRACTED, [RETRACTED, "Excluded 1 report."]));
    expect(document.body.textContent).not.toMatch(/even a single day/i);
    expect(document.body.textContent).not.toMatch(/enough to disqualify/i);
    // One retracted claim is filtered, not every warning.
    expect(document.body.textContent).toContain("Excluded 1 report.");
  });

  it("says what para 17-6 says, and names the remedy", () => {
    renderRow(gapRow(null));
    const text = screen.getByTestId("continuity-advisory").textContent ?? "";
    expect(text).toContain("do NOT disqualify you before a selection board");
    expect(text).toContain("BUPERSINST 1610.10H para 17-6");
    // A Sailor must learn there is a fix, not only that there is a problem.
    expect(text).toContain("E-5 or above within the past 5 years");
    expect(text).toContain("PERS-32 (para 17-6a)");
    expect(text).toContain("letter in lieu of the report");
    expect(text).toContain("para 17-6b");
  });

  it("prefers a current run's own advisory so the two texts cannot drift", () => {
    const current =
      "2 gaps in reporting continuity (a missing period longer than 90 days) were detected in the record. Missing FITREPs, CHIEFEVALs, or EVALs do NOT disqualify you before a selection board (BUPERSINST 1610.10H para 17-6).";
    renderRow(gapRow(current, [current]));
    expect(screen.getByTestId("continuity-advisory").textContent).toBe(current);
  });
});
