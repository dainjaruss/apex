// tests/unit/bragAutofillPanel.test.tsx
//
// The citation gate deletes content; this pins that the Sailor is TOLD.
//
// Both halves of the v1.2 fix are only half-done in the pipeline: when the gate
// drops an item or withholds the advisory, the panel is where that becomes
// visible or doesn't. PR #29's failure was exactly this seam — findings the
// engine produced never reached the screen, so a partly-withheld result read as
// a clean bill of health. The panel is fed by a REAL `runAutofill` result rather
// than a hand-built AutofillResponse, so a change that stops recording a failure
// fails here too, not just in the pipeline suite.
//
// Spec: docs/specs/brag-sheet.md §6, §7 step 2.

import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import AutofillReviewPanel from "@/components/brag/AutofillReviewPanel";
import { runAutofill } from "@/lib/bragSheet/autofill";
import { emptyBragSheetData } from "@/lib/bragSheet/template";
import { BRAG_SHEET_VERSION } from "@/lib/bragSheet/types";
import type {
  AutofillRequest,
  AutofillResponse,
  BragSheet,
  BragSheetData,
} from "@/lib/bragSheet/types";

const CIT = "brag.duties[0].bullets[0]"; // resolves
const INVENTED = "brag.qualifications.awards[0].title"; // awards is empty ⇒ never resolves

const makeBrag = (): BragSheetData => {
  const d = emptyBragSheetData();
  d.admin.member_name = "JONES, CARL R";
  d.admin.grade_rate = "IT1";
  d.duties.push({
    title: "LEADING PETTY OFFICER",
    kind: "primary",
    months_assigned: 12,
    is_most_significant: true,
    abbrev: "LPO",
    bullets: [{ text: "Led 12 Sailors through INSURV", metrics: "12 Sailors" }],
  });
  d.pfa.push({ cycle: "25-1", result: "P" });
  d.goals.career_recommendations.push("IWO SCHOOL");
  return d;
};

const req: AutofillRequest = {
  report_type: "EVAL",
  period_from: "2025-03-16",
  period_to: "2026-03-15",
  pitch: "10",
  brag: makeBrag(),
  prior_evals: [],
  ladr: [],
};

const sheet: BragSheet = {
  user_id: "u1",
  report_type: "EVAL",
  period_from: req.period_from,
  period_to: req.period_to,
  template_version: BRAG_SHEET_VERSION,
  data: req.brag,
  status: "draft",
};

const GROUNDED = "LED 12 SAILORS THROUGH INSURV";
const LAUNDERED = "LED 12 SAILORS THROUGH INSURV AND EARNED THE NAM";
const REC_DROPPED = "IWO SCHOOL PIPELINE PER AWARD CITATION";
const RATIONALE =
  "Sustained cited performance. Advisory only — the reporting senior selects Block 45.";

/** `launder` adds a mixed-source item to two blocks and to the advisory;
 *  `advisorySources` overrides what the advisory cites. */
const modelOutput = (opts: {
  launder: boolean;
  advisorySources?: string[];
}): unknown => ({
  blocks: {
    comments: {
      text: "never released",
      items: [
        { text: GROUNDED, sources: [CIT] },
        ...(opts.launder ? [{ text: LAUNDERED, sources: [CIT, INVENTED] }] : []),
      ],
    },
    primary_duty_abbrev: { text: "LPO", items: [{ text: "LPO", sources: [CIT] }] },
    primary_duties: {
      text: "x",
      items: [{ text: "LEADING PETTY OFFICER-12;", sources: [CIT] }],
    },
    command_achievements: { text: "x", items: [{ text: "INSURV COMPLETE", sources: [CIT] }] },
    qualifications: { text: "x", items: [{ text: "ESWS", sources: [CIT] }] },
    career_recommendations: {
      text: "x",
      entries: ["IWO SCHOOL"],
      items: [
        { text: "IWO SCHOOL", sources: ["brag.goals.career_recommendations[0]"] },
        ...(opts.launder
          ? [
              {
                text: REC_DROPPED,
                sources: ["brag.goals.career_recommendations[0]", INVENTED],
              },
            ]
          : []),
      ],
    },
    physical_readiness: { text: "P", items: [{ text: "P", sources: ["brag.pfa[0]"] }] },
  },
  missing_info: [],
  promotion_advisory: {
    advisory_only: true,
    recommendation: "Must Promote",
    rationale: RATIONALE,
    sources:
      opts.advisorySources ?? (opts.launder ? [CIT, INVENTED] : [CIT]),
  },
});

const build = async (
  launder: boolean,
  advisorySources?: string[],
): Promise<AutofillResponse> => {
  const out = modelOutput({ launder, advisorySources });
  return { ...(await runAutofill(req, async () => out)), model: "claude-opus-5" };
};

const paint = (result: AutofillResponse) =>
  render(
    <AutofillReviewPanel
      sheet={sheet}
      result={result}
      pitch="10"
      generating={false}
      applying={false}
      onRegenerate={vi.fn()}
      onGoToSource={vi.fn()}
      onApply={vi.fn()}
    />,
  );

/** The struck-through ghost rows the gate's output is supposed to produce. */
const removedRows = () =>
  screen
    .queryAllByText(/removed — citation did not resolve/)
    .map((el) => el.parentElement?.textContent ?? "");

describe("AutofillReviewPanel — the gate's deletions are on screen", () => {
  it("shows the deleted item's text and names ONLY the path that failed", async () => {
    paint(await build(true));

    const rows = removedRows();
    const comment = rows.find((r) => r.includes(LAUNDERED));
    expect(comment).toBeDefined();
    expect(comment).toContain(INVENTED);
    // The resolving sibling path is not blamed: a Sailor sent to "fix"
    // brag.duties[0].bullets[0] would find nothing wrong with it.
    expect(comment).not.toContain(CIT);

    // The laundered claim itself is not in the accepted block text.
    expect(screen.getByText(GROUNDED).textContent).toBe(GROUNDED);
  });

  it("shows the Block 41 deletion too — the card that rendered no failures at all", async () => {
    paint(await build(true));
    expect(removedRows().some((r) => r.includes(REC_DROPPED))).toBe(true);
  });

  it("a withheld advisory shows Withheld, not the recommendation it can no longer support", async () => {
    const result = await build(true);
    paint(result);

    expect(result.promotion_advisory.rationale).toContain("advisory withheld");
    expect(screen.getByText("Withheld")).toBeTruthy();
    expect(screen.queryByText("Must Promote")).toBeNull();
    // What was withheld, and why, is stated rather than left to be inferred.
    expect(removedRows().some((r) => r.includes(RATIONALE))).toBe(true);
  });

  it("an advisory that cited nothing says so, rather than showing empty parentheses", async () => {
    // promotion_advisory.sources has no .min(1), so bad_sources can legitimately
    // be empty — "citation did not resolve ()" would name no problem at all.
    const result = await build(false, []);
    const failure = result.citation_failures.find(
      (f) => f.block === "promotion_advisory",
    );
    expect(failure?.bad_sources).toEqual([]);

    paint(result);
    expect(removedRows().some((r) => r.includes("no sources cited"))).toBe(true);
  });

  it("POSITIVE: a fully cited result shows the recommendation and no removal rows", async () => {
    const result = await build(false);
    expect(result.citation_failures).toEqual([]); // the gate found nothing to drop
    paint(result);

    expect(screen.getByText("Must Promote")).toBeTruthy();
    expect(screen.queryByText("Withheld")).toBeNull();
    expect(removedRows()).toEqual([]);
    expect(screen.getByText(RATIONALE)).toBeTruthy();
  });
});
