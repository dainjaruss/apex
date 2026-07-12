// tests/unit/roleGuard.test.tsx
//
// Unit tests for the RoleGuard component.
//

import { describe, it, expect } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import RoleGuard, { AccessDeniedPanel } from "@/components/RoleGuard";
import { Profile, Evaluation } from "@/types";

const sailorUser: Profile = {
  id: "sailor-1",
  first_name: "John",
  last_name: "Doe",
  preferred_role: "Sailor",
  assigned_roles: ["Sailor"],
};

const adminUser: Profile = {
  id: "admin-1",
  first_name: "Admin",
  last_name: "User",
  preferred_role: "Admin",
  assigned_roles: ["Admin"],
};

const mockEval: Evaluation = {
  id: "eval-1",
  created_by: "sailor-1",
  current_holder_id: "sailor-1", // draft custody stays with the creator
  form_definition_id: "EVAL",
  report_type: "EVAL",
  member_name: "DOE, JOHN A",
  dod_id: "1234567890",
  grade_rate: "PO2",
  period_from: "2025-01-01",
  period_to: "2025-12-31",
  uic: "12345",
  ship_station: "USS TEST",
  comments: "",
  career_recommendations: [],
  promotion_recommendation: "Promotable",
  retention: "Recommended",
  status: "draft",
  block_values: {},
  trait_grades: {},
};

describe("RoleGuard Component", () => {
  it("should render children when user has required permission", () => {
    render(
      <RoleGuard user={adminUser} requiredPermission="manage_users">
        <div>Admin Content</div>
      </RoleGuard>,
    );
    expect(screen.getByText("Admin Content")).toBeDefined();
  });

  it("should not render children when user lacks required permission", () => {
    render(
      <RoleGuard user={sailorUser} requiredPermission="manage_users">
        <div>Admin Content</div>
      </RoleGuard>,
    );
    expect(screen.queryByText("Admin Content")).toBeNull();
  });

  it("should render fallback when access is denied", () => {
    render(
      <RoleGuard
        user={sailorUser}
        requiredPermission="manage_users"
        fallback={<div>No Access</div>}
      >
        <div>Admin Content</div>
      </RoleGuard>,
    );
    expect(screen.queryByText("Admin Content")).toBeNull();
    expect(screen.getByText("No Access")).toBeDefined();
  });

  it("should render children when allowed by role list", () => {
    render(
      <RoleGuard user={sailorUser} allowedRoles={["Sailor", "Rater"]}>
        <div>Sailor Content</div>
      </RoleGuard>,
    );
    expect(screen.getByText("Sailor Content")).toBeDefined();
  });

  it("should allow Admin through any role list check", () => {
    render(
      <RoleGuard user={adminUser} allowedRoles={["Reporting Senior"]}>
        <div>RS Content</div>
      </RoleGuard>,
    );
    expect(screen.getByText("RS Content")).toBeDefined();
  });

  it("should use contextual action check with evaluation", () => {
    render(
      <RoleGuard
        user={sailorUser}
        requiredAction="edit_evaluation"
        evaluation={mockEval}
      >
        <div>Edit Form</div>
      </RoleGuard>,
    );
    // Sailor is the creator and eval is draft, so should be allowed
    expect(screen.getByText("Edit Form")).toBeDefined();
  });

  it("should deny contextual action when not the creator", () => {
    const otherSailor = { ...sailorUser, id: "other-sailor" };
    render(
      <RoleGuard
        user={otherSailor}
        requiredAction="edit_evaluation"
        evaluation={mockEval}
      >
        <div>Edit Form</div>
      </RoleGuard>,
    );
    expect(screen.queryByText("Edit Form")).toBeNull();
  });
});

describe("AccessDeniedPanel", () => {
  it("should render with default message", () => {
    render(<AccessDeniedPanel />);
    expect(screen.getByText("Access Restricted")).toBeDefined();
    expect(
      screen.getByText(/do not have the required permissions/i),
    ).toBeDefined();
  });

  it("should render with custom message", () => {
    render(<AccessDeniedPanel message="Admin only area." />);
    expect(screen.getByText("Admin only area.")).toBeDefined();
  });
});
