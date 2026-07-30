// tests/unit/ladrChecklistComponent.test.tsx
//
// LadrChecklist renders the transcribed substance. Two things are pinned here:
//
// 1. Service component (v1.6) — the LaDR prints "Considerations for
//    advancement" once per component (Active / TAR / SELRES) with materially
//    different criteria, and only the Active one is seeded. These rows carry
//    the heaviest LADR_CATEGORY_WEIGHTS entry (30), so a Reserve Sailor must
//    never be scored against Active criteria without the checklist saying so.
// 2. Disclosure + badges (v1.6) — `detail` carries the verbatim criterion, its
//    parenthetical examples, the Fully/Best Qualified tier, the step preamble
//    and the sea/shore guidance. All of it was stored and none of it rendered.
//    Equally pinned: what must NOT appear — no tier badge on BM's `unspecified`
//    rows, and no empty disclosure on a row whose detail is bare.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import LadrChecklist from "@/components/board/LadrChecklist";
import { itE1E9 } from "@/scripts/ladr-data/it_e1_e9";
import { bmE1E9 } from "@/scripts/ladr-data/bm_e1_e9";
import { hmE1E9 } from "@/scripts/ladr-data/hm_e1_e9";
import type { LadrSeed } from "@/scripts/seed-ladr";
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

const fromSeed = (seed: LadrSeed): LadrMilestone[] =>
  seed.milestones.map((m, i) => ({
    id: `m-${i}`,
    ladr_document_id: "doc-1",
    category: m.category,
    item: m.item,
    item_code: m.item_code,
    applies_to_paygrades: m.applies_to_paygrades,
    detail: m.detail ?? {},
    sort_order: i,
  }));

const itMilestones = fromSeed(itE1E9);
const bmMilestones = fromSeed(bmE1E9);
const hmMilestones = fromSeed(hmE1E9);

const renderChecklist = (
  targetPaygrade: number | null,
  milestones: LadrMilestone[] = itMilestones,
) =>
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

    // E9 target: one advancement card per paygrade block (E-7/E-8/E-9), each
    // carrying the caveat for its own step.
    renderChecklist(9);
    expect(
      screen.getAllByText("E7+ advancement considerations (board emphasis)"),
    ).toHaveLength(3);
    expect(screen.getAllByText(/TAR or SELRES/)).toHaveLength(3);
  });
});

describe("LadrChecklist — transcribed substance", () => {
  it("renders the verbatim criterion and its whole parenthetical examples", () => {
    renderChecklist(7);
    // Untruncated source sentence, not the short checklist label.
    expect(
      screen.getByText(
        "Contribute to IT rating improvement by participating in one or more of the following events: (i.e., OCCSTDs, AERR, MPT, JDTA, TRR, PQS Workshops, etc...)",
      ),
    ).toBeTruthy();
    // The parenthetical is kept whole — never split into per-code chips.
    expect(
      screen.getByText(
        "i.e., OCCSTDs, AERR, MPT, JDTA, TRR, PQS Workshops, etc...",
      ),
    ).toBeTruthy();
    expect(screen.getAllByText("What the LaDR says").length).toBeGreaterThan(0);
  });

  it("renders both tiers and states that Best Qualified is additive", () => {
    renderChecklist(7);
    expect(screen.getByText("Fully qualified")).toBeTruthy();
    expect(screen.getByText("Best qualified")).toBeTruthy();
    expect(
      screen.getByText(/in addition to the Fully qualified list above/),
    ).toBeTruthy();
    // The source's own statement of the same relationship, printed once.
    expect(
      screen.getByText(/as well as those from the Fully Qualified list\./),
    ).toBeTruthy();
  });

  // The inversion this whole PR exists to prevent. Asserting that both headings
  // merely EXIST ships green with TIER_ORDER swapped, which would tell a Sailor
  // that Best Qualified comes first and Fully Qualified is the fallback.
  it("prints Fully qualified ABOVE Best qualified", () => {
    const { container } = renderChecklist(7);
    const text = container.textContent ?? "";
    expect(text.indexOf("Fully qualified")).toBeGreaterThan(-1);
    expect(text.indexOf("Fully qualified")).toBeLessThan(
      text.indexOf("Best qualified"),
    );
  });

  it("drops the additivity note when no Fully qualified list is above it", () => {
    // "in addition to the list above" is false if there is no list above.
    const bqOnly = itMilestones.filter(
      (m) =>
        m.category === "advancement_consideration" &&
        (m.detail as { tier?: string }).tier === "best_qualified",
    );
    expect(bqOnly.length).toBeGreaterThan(0);
    renderChecklist(7, bqOnly);
    expect(screen.getByText("Best qualified")).toBeTruthy();
    expect(screen.queryByText("Fully qualified")).toBeNull();
    expect(
      screen.queryByText(/in addition to the Fully qualified list above/),
    ).toBeNull();
  });

  it("surfaces the step's sea/shore guidance once, not once per row", () => {
    renderChecklist(7);
    expect(
      screen.getByText(/Sea\/Shore assignment considerations: Tours of duty/),
    ).toBeTruthy();
  });

  it("hoists a rating-scoped sea/shore note above the blocks, printed once", () => {
    // HM's is 2,715 characters and is copied onto every step's rows; scoping it
    // to a card would print it three times to an E-9 candidate.
    const { container } = renderChecklist(9, hmMilestones);
    const note = screen.getAllByText(/HM is a shore-centric rate/);
    expect(note).toHaveLength(1);
    const text = container.textContent ?? "";
    expect(text.indexOf("HM is a shore-centric rate")).toBeLessThan(
      text.indexOf("the gate for E-9"),
    );
  });

  it("invents no tier badge for BM, whose LaDR prints no FQ/BQ split", () => {
    renderChecklist(7, bmMilestones);
    expect(screen.queryByText("Fully qualified")).toBeNull();
    expect(screen.queryByText("Best qualified")).toBeNull();
    expect(
      screen.queryByText(/in addition to the Fully qualified list/),
    ).toBeNull();
    // The substance is still there — BM organises by assignment group.
    expect(
      screen.getByText("1. Sea Assignments: b. CVN", { selector: "p" }),
    ).toBeTruthy();
  });
});

describe("LadrChecklist — paygrade grouping and chips", () => {
  const bare: LadrMilestone[] = [
    {
      id: "bare",
      ladr_document_id: "doc-1",
      category: "credential",
      item: "CompTIA A+",
      item_code: null,
      applies_to_paygrades: [3],
      detail: {},
      sort_order: 0,
    },
    {
      id: "range",
      ladr_document_id: "doc-1",
      category: "nec_opportunity",
      item: "Systems Administration",
      item_code: "746A",
      applies_to_paygrades: [4, 5, 6],
      detail: { course: "A-150-1980" },
      sort_order: 1,
    },
    {
      id: "gate",
      ladr_document_id: "doc-1",
      category: "pme_required",
      item: "CPO Selectee Leadership Course",
      item_code: null,
      applies_to_paygrades: [7],
      detail: {},
      sort_order: 2,
    },
  ];

  it("chips the row's own applies_to_paygrades", () => {
    renderChecklist(7, bare);
    // Scoped to the chip: the block header carries the bare "E-3"/"E-7" too.
    const chip = { selector: ".apex-badge" };
    expect(screen.getByText("E-3", chip)).toBeTruthy();
    expect(screen.getByText("E-4–E-6", chip)).toBeTruthy();
    expect(screen.getByText("E-7", chip)).toBeTruthy();
    expect(screen.getByText("course A-150-1980")).toBeTruthy();
  });

  it("separates the gate block from the blocks behind it", () => {
    renderChecklist(7, bare);
    expect(screen.getByText(/the gate for E-7/)).toBeTruthy();
    expect(screen.getByText(/first listed at E-3 — behind you at E-7/)).toBeTruthy();
  });

  it("puts the gate block first — earlier blocks read as history below it", () => {
    const { container } = renderChecklist(7, bare);
    const text = container.textContent ?? "";
    expect(text.indexOf("the gate for E-7")).toBeGreaterThan(-1);
    expect(text.indexOf("the gate for E-7")).toBeLessThan(
      text.indexOf("first listed at E-3"),
    );
  });

  it("never says 'behind you' about a row the LaDR still lists at the target", () => {
    // The block key is min(applies_to_paygrades). "Systems Administration" is
    // [4,5,6] — block E-4, but live at E-5, so its header must claim nothing.
    // Getting this wrong tells a Sailor to stop working a current item.
    renderChecklist(5, bare);
    // Exact match: the E-4 header carries the block and no "behind you" gloss.
    expect(screen.getByText("first listed at E-4")).toBeTruthy();
    // The E-3 credential really is behind them, and is the only block saying so.
    expect(screen.getAllByText(/behind you at E-5/)).toHaveLength(1);
    expect(screen.getByText(/first listed at E-3 — behind you at E-5/)).toBeTruthy();
  });

  it("badges only the rows the engine treats as board emphasis", () => {
    // service.ts: E7-only milestone ∧ target ≥ 7. The E-3 credential is not.
    renderChecklist(7, bare);
    expect(screen.getAllByText("Board emphasis")).toHaveLength(1);
  });

  it("degrades cleanly when detail is empty — no disclosure trigger", () => {
    renderChecklist(7, [bare[0]]);
    expect(screen.queryByText("What the LaDR says")).toBeNull();
    expect(screen.getByText("CompTIA A+")).toBeTruthy();
  });
});
