// tests/integration/traitAverageDisplay.test.tsx
//
// Regression guard: clicking a trait grade must merge with the other grades, not replace
// the whole trait_grades object. The bug made the Block 40 average collapse to the last
// grade clicked (because EvaluationForm.handleFieldChange shallow-merges).

import { describe, it, expect } from "vitest";
import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import Block33to39Traits from "@/components/blocks/Block33to39Traits";
import { Evaluation } from "@/types";

const seed = (): Evaluation =>
  ({
    trait_grades: {
      knowledge: "3.0",
      work: "3.0",
      eo: "3.0",
      bearing: "3.0",
      accomplishment: "3.0",
      teamwork: "3.0",
      leadership: "3.0",
    },
  }) as Evaluation;

function Harness() {
  const [data, setData] = useState<Evaluation>(seed());
  // Mirrors EvaluationForm.handleFieldChange exactly — a shallow merge. This is the
  // context the bug lived in, so the test only passes if the trait section merges grades.
  const onChange = (fields: Partial<Evaluation>) =>
    setData((prev) => ({ ...prev, ...fields }));
  return <Block33to39Traits evalData={data} onChange={onChange} issues={[]} />;
}

describe("Trait section average (Block 40)", () => {
  it("accumulates grades across traits instead of collapsing to the last one clicked", () => {
    render(<Harness />);

    // knowledge (row 0) -> 5.0, work (row 1) -> 1.0; the other five stay 3.0.
    fireEvent.click(screen.getAllByRole("button", { name: "5.0" })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: "1.0" })[1]);

    // (5.0 + 1.0 + 3.0*5) / 7 = 3.00 — the grade-wipe bug produced 1.00 (the last click).
    expect(screen.getByText("3.00")).toBeDefined();
    expect(screen.queryByText("1.00")).toBeNull();
  });

  it("averages only graded traits and excludes untouched ones (EVALMAN: ungraded = blank)", () => {
    function PartialHarness() {
      // Only two traits graded; the other five are untouched/blank and must NOT count.
      const [data, setData] = useState<Evaluation>({
        trait_grades: { knowledge: "4.0", leadership: "4.0" },
      } as Evaluation);
      const onChange = (fields: Partial<Evaluation>) =>
        setData((prev) => ({ ...prev, ...fields }));
      return (
        <Block33to39Traits evalData={data} onChange={onChange} issues={[]} />
      );
    }

    render(<PartialHarness />);

    // (4.0 + 4.0) / 2 = 4.00 — the five blank traits are excluded (not counted as 3.0).
    expect(screen.getByText("4.00")).toBeDefined();
  });

  it("clears a trait when its active grade is clicked again (toggle to ungraded)", () => {
    function ToggleHarness() {
      const [data, setData] = useState<Evaluation>({
        trait_grades: { knowledge: "4.0", work: "2.0" },
      } as Evaluation);
      const onChange = (fields: Partial<Evaluation>) =>
        setData((prev) => ({ ...prev, ...fields }));
      return (
        <Block33to39Traits evalData={data} onChange={onChange} issues={[]} />
      );
    }

    render(<ToggleHarness />);
    expect(screen.getByText("3.00")).toBeDefined(); // (4.0 + 2.0) / 2

    // Click knowledge's active 4.0 to clear it -> only work (2.0) remains graded -> 2.00.
    fireEvent.click(screen.getAllByRole("button", { name: "4.0" })[0]);
    expect(screen.getByText("2.00")).toBeDefined();
  });
});
