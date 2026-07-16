// tests/integration/evaluation.test.tsx
//
// Comprehensive unit/integration tests for the evaluation drafts workflow,
// including live Zod rules validation, Courier-box overflow, creation, and view/edit pages.
//

import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  renderHook,
  cleanup,
  act,
} from "@testing-library/react";

// Set mock environment variables
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://mock-supabase.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "mock-supabase-anon-key";

const mockPush = vi.fn();
const mockRouter = {
  push: mockPush,
  refresh: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
};
vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/evaluations/mock-eval-id/edit",
  useParams: () => ({ id: "mock-eval-id" }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Supabase client
const mockDataStore = {
  profile: {
    id: "test-user-id",
    preferred_role: "Sailor",
    first_name: "FRANKLYN",
    last_name: "DAIN",
    middle_initial: "A",
    dod_id: "1234567890",
    navy_rank: "PO2",
    command: "USS NEVERSAIL",
    uic: "00241",
  },
  evaluation: {
    id: "mock-eval-id",
    created_by: "test-user-id",
    current_holder_id: "test-user-id", // draft custody stays with the creator
    form_definition_id: "EVAL",
    report_type: "EVAL",
    member_name: "DAIN, FRANKLYN A",
    dod_id: "1234567890",
    grade_rate: "PO2",
    designator: "1110",
    period_from: "2025-01-01",
    period_to: "2025-12-31",
    duty_status: "ACT",
    uic: "00241",
    ship_station: "USS NEVERSAIL",
    promotion_status: "Regular",
    trait_grades: {
      knowledge: "4.0",
      work: "4.0",
      eo: "4.0",
      bearing: "4.0",
      accomplishment: "4.0",
      teamwork: "4.0",
      leadership: "4.0",
    },
    comments: "EXCELLENT PO2. HIGHLY RECOMMENDED FOR PROMOTION.",
    career_recommendations: ["NAVY RECRUITER"],
    promotion_recommendation: "Must Promote",
    retention: "Recommended",
    status: "draft",
    block_values: {
      physical_readiness: "P/P",
      reporting_senior_name: "SENIOR, IM A",
      reporting_senior_grade: "CDR",
      reporting_senior_uic: "00241",
      reporting_senior_title: "COMMANDING OFFICER",
      date_counseled: "25JAN15",
    },
  },
};

vi.mock("@/lib/supabaseClient", () => {
  return {
    createBrowserClient: () => ({
      from: (table: string) => ({
        select: () => ({
          eq: () => ({
            single: async () => {
              if (table === "profiles") {
                return { data: JSON.parse(JSON.stringify(mockDataStore.profile)), error: null };
              }
              if (table === "evaluations") {
                return { data: JSON.parse(JSON.stringify(mockDataStore.evaluation)), error: null };
              }
              return { data: null, error: new Error("Not found") };
            },
            order: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
      }),
    }),
  };
});

vi.mock("@/lib/auth", () => ({
  getSession: vi.fn().mockImplementation(async () => ({ user: { id: "test-user-id" } })),
  getSessionUserId: vi.fn().mockImplementation(async () => "test-user-id"),
}));

vi.mock("@/lib/evaluationService", () => ({
  loadById: vi.fn().mockImplementation(async () => JSON.parse(JSON.stringify(mockDataStore.evaluation))),
  saveDraft: vi.fn().mockImplementation(async () => JSON.parse(JSON.stringify(mockDataStore.evaluation))),
}));

vi.mock("@/lib/summaryGroupService", () => ({
  listOpenGroups: vi.fn().mockImplementation(async () => []),
  fetchGroupAveragePool: vi.fn().mockImplementation(async () => ({ gradedSum: 0, gradedTraitCount: 0 })),
}));

// Imports under test
import { useLiveValidation } from "@/hooks/useLiveValidation";
import NewEvaluationPage from "@/app/evaluations/new/page";
import EditEvaluationPage from "@/app/evaluations/[id]/edit/page";
import ViewEvaluationPage from "@/app/evaluations/[id]/page";
import { checkCommentFit } from "@/lib/commentFit";

describe("Evaluation Forms & Live Navy Rules Integration Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
    window.localStorage.clear();
  });

  it("should validate name formatting and cycle periods correctly in useLiveValidation hook", () => {
    const invalidEvalData = {
      ...mockDataStore.evaluation,
      member_name: "Invalid Name format", // Must be LAST, FIRST MI
      period_from: "2025-12-31",
      period_to: "2025-01-01", // Out of bounds
    } as any;

    const { result } = renderHook(() => useLiveValidation(invalidEvalData));
    expect(result.current.isValid).toBe(false);

    const nameErr = result.current.issues.find(
      (i) => i.field === "member_name",
    );
    expect(nameErr?.message).toContain("LAST, FIRST MI");

    const dateErr = result.current.issues.find((i) => i.field === "period_to");
    expect(dateErr?.message).toContain(
      "Period To cannot be before Period From",
    );
  });

  it("should restrict promotion recommendations if EO or Bearing trait grade is 2.0 or lower", () => {
    const poorEoEvalData = {
      ...mockDataStore.evaluation,
      trait_grades: {
        ...mockDataStore.evaluation.trait_grades,
        eo: "2.0", // limits recommendation
      },
      promotion_recommendation: "Early Promote",
    } as any;

    const { result } = renderHook(() => useLiveValidation(poorEoEvalData));
    expect(result.current.isValid).toBe(false);

    const promoIssue = result.current.issues.find(
      (i) => i.field === "promotion_recommendation",
    );
    expect(promoIssue?.message).toContain(
      "limits the promotion recommendation",
    );
  });

  it("should check Courier comments text bounds and detect box overflow capacity", () => {
    // 10-pitch text with a paragraph of 20 lines (exceeds the 18 max limit)
    const longText = Array(20)
      .fill(
        "THIS IS A MONOSPACE COMMENT LINE THAT FITS THE 10-PITCH WIDTH LIMIT.",
      )
      .join("\n");
    const fitResult = checkCommentFit(longText, "10");
    expect(fitResult.fit).toBe(false);
    expect(fitResult.linesUsed).toBe(20);

    const normalText = "SHORT AND SWEET DRAFT.";
    const fitResultNormal = checkCommentFit(normalText, "12");
    expect(fitResultNormal.fit).toBe(true);
    expect(fitResultNormal.linesUsed).toBe(1);
  });

  it("should render NewEvaluationPage with prefilled user profile values", async () => {
    await act(async () => {
      render(<NewEvaluationPage />);
    });
    await waitFor(() => {
      expect(screen.getByText(/Draft New Report/i)).toBeDefined();
    });
    // Click the recommended or EVAL form picker option
    const evalOption = screen.getByText(/^Evaluation Report and Counseling Record$/i);
    await act(async () => {
      fireEvent.click(evalOption.closest("button")!);
    });
    await waitFor(() => {
      expect(screen.getByText(/Draft New EVAL/i)).toBeDefined();
    });
    expect(screen.getAllByText(/APEX/i).length).toBeGreaterThan(0);
  });

  it("should render ViewEvaluationPage showing evaluation status, trait ratings, and comments", async () => {
    await act(async () => {
      render(<ViewEvaluationPage />);
    });
    await waitFor(() => {
      expect(
        screen.getByText(/EXCELLENT PO2. HIGHLY RECOMMENDED FOR PROMOTION./i),
      ).toBeDefined();
    });
    expect(screen.getAllByText(/Must Promote/i).length).toBeGreaterThan(0);
  });

  it("should render EditEvaluationPage and enable saving changes", async () => {
    await act(async () => {
      render(<EditEvaluationPage />);
    });
    await waitFor(() => {
      expect(screen.getByText(/Edit Evaluation Draft/i)).toBeDefined();
    });

    const saveButton = screen.getByRole("button", {
      name: /Save Evaluation Draft/i,
    });
    expect(saveButton).toBeDefined();
    await act(async () => {
      fireEvent.click(saveButton);
    });
  });
});
