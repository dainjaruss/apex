// Regression: the LaDR prints "Considerations for advancement" once per service
// component (Active / TAR / SELRES) with materially different criteria, and only
// the Active one is seeded. These rows carry the heaviest LADR_CATEGORY_WEIGHTS
// entry (30), so a Reserve Sailor must never be scored against Active criteria
// without the checklist saying so. detail.component is stored on every row —
// this pins that it is actually rendered.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LadrChecklist from "@/components/board/LadrChecklist";
import { itE1E9 } from "@/scripts/ladr-data/it_e1_e9";
import type { LadrDocument, LadrMilestone } from "@/lib/boardConfidence/types";

const document_: LadrDocument = {
  id: "doc-1",
  rating_abbrev: "IT",
  rating_name: "Information Systems Technician",
  paygrade_range: "E1-E9",
  version: "July 2026",
  effective_date: "2026-07-01",
  source_url: "https://www.cool.osd.mil/usn/LaDR/it_e1_e9.pdf",
};

const milestones: LadrMilestone[] = itE1E9.milestones.map((m, i) => ({
  id: `m-${i}`,
  ladr_document_id: "doc-1",
  category: m.category,
  item: m.item,
  item_code: m.item_code,
  applies_to_paygrades: m.applies_to_paygrades,
  detail: m.detail ?? {},
  sort_order: i,
}));

const renderChecklist = (targetPaygrade: number | null) =>
  render(
    <LadrChecklist
      document={document_}
      milestones={milestones}
      targetPaygrade={targetPaygrade}
      checklist={{}}
      onChange={() => {}}
      onSave={() => {}}
      saving={false}
    />,
  );

describe("LadrChecklist — advancement considerations service component", () => {
  it("names the transcribed component and warns TAR/SELRES Sailors", () => {
    renderChecklist(7);
    expect(screen.getByText("IT CAREER PATH (IW/SW/AW/EXW)")).toBeTruthy();
    expect(screen.getByText(/TAR or SELRES/)).toBeTruthy();
  });

  it("shows the label wherever the section itself is shown", () => {
    // E6 target: no advancement rows apply, so no section and no label.
    const { unmount } = renderChecklist(6);
    expect(
      screen.queryByText("E7+ advancement considerations (board emphasis)"),
    ).toBeNull();
    expect(screen.queryByText(/TAR or SELRES/)).toBeNull();
    unmount();

    renderChecklist(9);
    expect(
      screen.getByText("E7+ advancement considerations (board emphasis)"),
    ).toBeTruthy();
    expect(screen.getByText(/TAR or SELRES/)).toBeTruthy();
  });
});
