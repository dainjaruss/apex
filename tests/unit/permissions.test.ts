// tests/unit/permissions.test.ts
//
// Unit tests for the RBAC permission engine.
//

import { describe, it, expect } from "vitest";
import {
  hasPermission,
  canPerformAction,
  getAvailableActions,
  getRoleDescription,
  canSignBlock,
  canViewSummaryAverage,
} from "@/lib/permissions";
import { Profile, Evaluation } from "@/types";

const mockEvaluation: Evaluation = {
  id: "eval-1",
  created_by: "sailor-1",
  current_holder_id: "sailor-1", // in draft, the creator holds custody
  reviewer_id: "reviewer-1",
  form_definition_id: "EVAL",
  report_type: "EVAL",
  member_name: "DOE, JOHN A",
  dod_id: "1234567890",
  grade_rate: "PO2",
  period_from: "2025-01-01",
  period_to: "2025-12-31",
  duty_status: "ACT",
  uic: "12345",
  ship_station: "USS TEST",
  promotion_status: "Regular",
  comments: "test",
  career_recommendations: [],
  promotion_recommendation: "Promotable",
  retention: "Recommended",
  status: "draft",
  block_values: {},
  trait_grades: {},
};

const sailor: Profile = {
  id: "sailor-1",
  first_name: "John",
  last_name: "Doe",
  preferred_role: "Sailor",
  assigned_roles: ["Sailor"],
};

const rater: Profile = {
  id: "rater-1",
  first_name: "Jane",
  last_name: "Smith",
  preferred_role: "Rater",
  assigned_roles: ["Rater"],
};

const reportingSenior: Profile = {
  id: "reviewer-1",
  first_name: "Alan",
  last_name: "Senior",
  preferred_role: "Reporting Senior",
  assigned_roles: ["Reporting Senior"],
};

const admin: Profile = {
  id: "admin-1",
  first_name: "Admin",
  last_name: "User",
  preferred_role: "Admin",
  assigned_roles: ["Admin"],
};

describe("RBAC Permission Engine", () => {
  describe("hasPermission (static role checks)", () => {
    it("should allow Sailors to create evaluations", () => {
      expect(hasPermission("Sailor", "create_evaluation")).toBe(true);
    });

    it("should not allow Sailors to manage users", () => {
      expect(hasPermission("Sailor", "manage_users")).toBe(false);
    });

    it("should not allow Sailors to approve evaluations", () => {
      expect(hasPermission("Sailor", "approve_evaluation")).toBe(false);
    });

    it("should allow Raters to approve evaluations", () => {
      expect(hasPermission("Rater", "approve_evaluation")).toBe(true);
    });

    it("should allow Admins to manage users", () => {
      expect(hasPermission("Admin", "manage_users")).toBe(true);
    });

    it("should allow Reporting Senior to view all evaluations", () => {
      expect(hasPermission("Reporting Senior", "view_all_evaluations")).toBe(
        true,
      );
    });

    it("should not allow Sailors to view all evaluations", () => {
      expect(hasPermission("Sailor", "view_all_evaluations")).toBe(false);
    });

    it("should return false for unknown roles", () => {
      expect(hasPermission("UnknownRole", "create_evaluation")).toBe(false);
    });
  });

  describe("canPerformAction (contextual checks)", () => {
    it("should allow the creator to edit their own draft evaluation", () => {
      expect(canPerformAction(sailor, "edit_evaluation", mockEvaluation)).toBe(
        true,
      );
    });

    it("should not allow a non-creator Sailor to edit the evaluation", () => {
      const otherSailor = { ...sailor, id: "other-sailor" };
      expect(
        canPerformAction(otherSailor, "edit_evaluation", mockEvaluation),
      ).toBe(false);
    });

    it("should not allow editing a completed evaluation", () => {
      const completedEval = { ...mockEvaluation, status: "completed" as const };
      expect(canPerformAction(sailor, "edit_evaluation", completedEval)).toBe(
        false,
      );
    });

    it("should allow the assigned reviewer to approve a ready_for_review evaluation", () => {
      const readyEval = {
        ...mockEvaluation,
        status: "ready_for_review" as const,
      };
      expect(
        canPerformAction(reportingSenior, "approve_evaluation", readyEval),
      ).toBe(true);
    });

    it("should not allow an unassigned reviewer to approve", () => {
      const readyEval = {
        ...mockEvaluation,
        status: "ready_for_review" as const,
      };
      expect(canPerformAction(rater, "approve_evaluation", readyEval)).toBe(
        false,
      );
    });

    it("should allow Admin to do anything regardless of ownership — except browser edits", () => {
      expect(
        canPerformAction(admin, "approve_evaluation", mockEvaluation),
      ).toBe(true);
      expect(canPerformAction(admin, "delete_evaluation", mockEvaluation)).toBe(
        true,
      );
      // Editing mirrors RLS eval_update_custody: only the current holder may
      // write from the browser, so a non-holder Admin is denied.
      expect(canPerformAction(admin, "edit_evaluation", mockEvaluation)).toBe(
        false,
      );
      const heldByAdmin = { ...mockEvaluation, current_holder_id: "admin-1" };
      expect(canPerformAction(admin, "edit_evaluation", heldByAdmin)).toBe(
        true,
      );
    });

    it("should only allow the member (Individual Evaluated) to sign block 51", () => {
      expect(canPerformAction(sailor, "sign_block_51", mockEvaluation)).toBe(
        true,
      );
      const otherSailor = { ...sailor, id: "other-sailor" };
      expect(
        canPerformAction(otherSailor, "sign_block_51", mockEvaluation),
      ).toBe(false);
    });

    it("should map the Senior Rater signature to block 49 (not 48), and bar Sailors from it", () => {
      // Block 49 is the Senior Rater signature on the real NAVPERS 1616/26.
      expect(hasPermission("Senior Rater", "sign_block_49")).toBe(true);
      expect(hasPermission("Sailor", "sign_block_49")).toBe(false);
      // Block 48 is the RS address, not a signature — no sign action exists for it.
      expect(hasPermission("Admin", "sign_block_48" as any)).toBe(false);
    });
  });

  describe("getAvailableActions", () => {
    it("should return limited actions for a Sailor on their own draft", () => {
      const actions = getAvailableActions(sailor, mockEvaluation);
      expect(actions).toContain("edit_evaluation");
      expect(actions).toContain("submit_for_review");
      expect(actions).toContain("sign_block_51");
      expect(actions).not.toContain("approve_evaluation");
      expect(actions).not.toContain("manage_users");
    });

    it("should return all actions for Admin except custody-gated editing", () => {
      const actions = getAvailableActions(admin, mockEvaluation);
      expect(actions).toContain("approve_evaluation");
      expect(actions).toContain("delete_evaluation");
      // edit_evaluation requires custody (RLS), which this Admin does not hold
      expect(actions).not.toContain("edit_evaluation");
    });
  });

  describe("getRoleDescription", () => {
    it("should return a description for each known role", () => {
      expect(getRoleDescription("Sailor")).toContain("evaluation");
      expect(getRoleDescription("Admin")).toContain("unrestricted");
    });
  });

  describe("canSignBlock (report-screen signing enforcement)", () => {
    // mockEvaluation.created_by === 'sailor-1'
    it("gates reviewer-chain blocks by role possession", () => {
      // Rater may sign Block 42 but not 49/50/52
      expect(canSignBlock(rater, 42, mockEvaluation)).toBe(true);
      expect(canSignBlock(rater, 49, mockEvaluation)).toBe(false);
      expect(canSignBlock(rater, 50, mockEvaluation)).toBe(false);
      // Senior Rater may sign 42 and 49 but not 50
      expect(
        canSignBlock(
          { ...rater, preferred_role: "Senior Rater" },
          49,
          mockEvaluation,
        ),
      ).toBe(true);
      expect(
        canSignBlock(
          { ...rater, preferred_role: "Senior Rater" },
          50,
          mockEvaluation,
        ),
      ).toBe(false);
      // Reporting Senior may sign 50 and 52
      expect(canSignBlock(reportingSenior, 50, mockEvaluation)).toBe(true);
      expect(canSignBlock(reportingSenior, 52, mockEvaluation)).toBe(true);
      // Sailor may sign none of the reviewer-chain blocks
      expect(canSignBlock(sailor, 42, mockEvaluation)).toBe(false);
    });

    it("restricts member blocks (51, 32) to the evaluated member (created_by) or Admin", () => {
      expect(canSignBlock(sailor, 51, mockEvaluation)).toBe(true); // sailor is created_by
      expect(canSignBlock(sailor, 32, mockEvaluation)).toBe(true);
      const otherSailor = { ...sailor, id: "other-sailor" };
      expect(canSignBlock(otherSailor, 51, mockEvaluation)).toBe(false);
      expect(canSignBlock(rater, 51, mockEvaluation)).toBe(false); // role has perm but is not the member
      expect(canSignBlock(admin, 51, mockEvaluation)).toBe(true); // Admin bypass
    });

    it("rejects non-signature blocks", () => {
      expect(canSignBlock(admin, 48, mockEvaluation)).toBe(false); // Block 48 is an address
      expect(canSignBlock(admin, 99, mockEvaluation)).toBe(false);
    });
  });

  describe("canViewSummaryAverage (Block 50a visibility)", () => {
    const draft = { status: "draft" };

    it("hides the summary group average from a Sailor while the report is in draft", () => {
      expect(canViewSummaryAverage("Sailor", draft)).toBe(false);
      expect(
        canViewSummaryAverage("Sailor", { status: "ready_for_review" }),
      ).toBe(false);
    });

    it("shows it to the Sailor once the report is finalized (the official record)", () => {
      expect(canViewSummaryAverage("Sailor", { status: "completed" })).toBe(
        true,
      );
      expect(
        canViewSummaryAverage("Sailor", {
          signature_locked: true,
          status: "draft",
        }),
      ).toBe(true);
      expect(canViewSummaryAverage("Sailor", { routing_stage: "locked" })).toBe(
        true,
      );
    });

    it("always shows it to reviewers (the rating chain), even during draft", () => {
      expect(canViewSummaryAverage("Rater", draft)).toBe(true);
      expect(canViewSummaryAverage("Senior Rater", draft)).toBe(true);
      expect(canViewSummaryAverage("Reporting Senior", draft)).toBe(true);
      expect(canViewSummaryAverage("Admin", draft)).toBe(true);
    });

    it("denies an unknown or missing role on a draft", () => {
      expect(canViewSummaryAverage(undefined, draft)).toBe(false);
      expect(canViewSummaryAverage("UnknownRole", draft)).toBe(false);
    });
  });
});
