// tests/integration/workflow.test.tsx
//
// Integration tests for the custodian RoutingPanel (ReviewPanel) component.
//

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ReviewPanel from "@/components/Reviewer/ReviewPanel";
import { Evaluation, Profile } from "@/types";

vi.mock("@/lib/evaluationService", () => ({
  routeForward: vi.fn().mockResolvedValue({ ok: true }),
  recycleForCorrection: vi.fn().mockResolvedValue({ ok: true }),
  beginDebrief: vi.fn().mockResolvedValue({ ok: true }),
  applyMinorCorrection: vi.fn().mockResolvedValue({ ok: true }),
  setLock: vi.fn().mockResolvedValue({ ok: true }),
  fetchReviewApprovals: vi.fn().mockResolvedValue([
    {
      id: "approval-1",
      approval_status: "returned",
      reviewer_comments: "Please fix block 43 comment length.",
      created_at: new Date().toISOString(),
      profiles: {
        first_name: "Alan",
        last_name: "Smith",
        preferred_role: "Senior Rater",
      },
    },
  ]),
}));

vi.mock("@/lib/summaryGroupService", () => ({
  listOpenGroups: vi.fn().mockResolvedValue([]),
  attachSummaryGroup: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/supabaseClient", () => ({
  createBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: [
              {
                id: "rater-id-1",
                first_name: "Ray",
                last_name: "Rater",
                preferred_role: "Rater",
              },
            ],
            error: null,
          }),
      }),
    }),
  }),
}));

const baseEval: Evaluation = {
  id: "test-eval-id-1",
  created_by: "creator-user-id",
  form_definition_id: "EVAL",
  report_type: "EVAL",
  member_name: "DOE, JOHN A",
  dod_id: "1234567890",
  grade_rate: "PO2",
  period_from: "2025-01-01",
  period_to: "2025-12-31",
  duty_status: "ACT",
  uic: "12345",
  ship_station: "USS NEVERSAIL",
  promotion_status: "Regular",
  comments: "GOOD JOB.",
  career_recommendations: [],
  promotion_recommendation: "Promotable",
  retention: "Recommended",
  status: "draft",
  block_values: {},
  trait_grades: {},
  current_holder_id: "creator-user-id",
  routing_stage: "sailor",
  participants: ["creator-user-id"],
};

const sailor: Profile = {
  id: "creator-user-id",
  first_name: "John",
  last_name: "Sailor",
  preferred_role: "Sailor",
  assigned_roles: ["Sailor"],
};
const rater: Profile = {
  id: "rater-user-id",
  first_name: "Ray",
  last_name: "Rater",
  preferred_role: "Rater",
  assigned_roles: ["Rater"],
};

describe("APEX RoutingPanel Integration Tests", () => {
  const onWorkflowAction = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lets the sailor (current holder, draft) route forward to a Rater", async () => {
    const { routeForward } = await import("@/lib/evaluationService");
    render(
      <ReviewPanel
        evaluation={baseEval}
        currentUser={sailor}
        onWorkflowAction={onWorkflowAction}
      />,
    );

    expect(screen.getByText(/Routing Workflow/i)).toBeDefined();
    expect(await screen.findByText(/Route forward to a Rater/i)).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: /Route Forward/i }));
    await waitFor(() => {
      expect(routeForward).toHaveBeenCalled();
      expect(onWorkflowAction).toHaveBeenCalled();
    });
  });

  it("shows route-forward + recycle to the holder at the rater stage", async () => {
    const raterHeld: Evaluation = {
      ...baseEval,
      routing_stage: "rater",
      current_holder_id: "rater-user-id",
      previous_holder_id: "creator-user-id",
    };
    render(
      <ReviewPanel
        evaluation={raterHeld}
        currentUser={rater}
        onWorkflowAction={onWorkflowAction}
      />,
    );

    expect(screen.getByText(/Route forward to a Senior Rater/i)).toBeDefined();
    expect(
      screen.getByRole("button", { name: /Recycle to Previous Holder/i }),
    ).toBeDefined();
  });

  it("displays the recycle/review feedback history", async () => {
    render(
      <ReviewPanel
        evaluation={baseEval}
        currentUser={sailor}
        onWorkflowAction={onWorkflowAction}
      />,
    );
    const historyHeader = await screen.findByText(/Recycle \/ Review History/i);
    expect(historyHeader).toBeDefined();
    expect(
      screen.getByText(/Please fix block 43 comment length/i),
    ).toBeDefined();
  });
});
