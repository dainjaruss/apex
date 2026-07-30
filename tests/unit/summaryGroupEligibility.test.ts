import { describe, it, expect } from "vitest";
import {
  dutyStatusBucket,
  isEvalEligibleForSummaryGroup,
  visibleSummaryGroupsForEval,
} from "@/lib/summaryGroupEligibility";
import { SummaryGroupWithRs } from "@/lib/summaryGroupEligibility";

const baseEval = {
  grade_rate: "PO2",
  promotion_status: "Regular",
  period_to: "2025-12-31",
  report_type: "EVAL" as const,
  uic: "12345",
  duty_status: "ACT",
  summary_group_id: null as string | null,
  block_values: {
    reporting_senior_dod_id: "4567890123",
    billet_subcategory: "NA",
  },
};

const matchingGroup: SummaryGroupWithRs = {
  id: "g1",
  name: "E-5 Regular FY25",
  reporting_senior_id: "rs-1",
  period_to: "2025-12-31",
  grade_rate: "PO2",
  promotion_status: "Regular",
  command_employment: "LEAD LPO",
  report_type: "EVAL",
  status: "open",
  reporting_senior_dod_id: "4567890123",
};

describe("isEvalEligibleForSummaryGroup", () => {
  it("accepts a group that matches all BUPERS shared fields", () => {
    expect(isEvalEligibleForSummaryGroup(baseEval, matchingGroup)).toBe(true);
  });

  it("rejects a group for a different paygrade (PO2 vs PO1)", () => {
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        id: "g2",
        grade_rate: "PO1",
      }),
    ).toBe(false);
  });

  it("rejects a group with different promotion status", () => {
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        id: "g3",
        promotion_status: "Frocked",
      }),
    ).toBe(false);
  });

  it("rejects a group with a different ending date", () => {
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        id: "g4",
        period_to: "2024-12-31",
      }),
    ).toBe(false);
  });

  it("rejects a group for a different reporting senior", () => {
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        id: "g5",
        reporting_senior_dod_id: "9999999999",
      }),
    ).toBe(false);
  });

  it("rejects closed groups unless already attached", () => {
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        status: "closed",
      }),
    ).toBe(false);
    expect(
      isEvalEligibleForSummaryGroup(
        { ...baseEval, summary_group_id: "g1" },
        { ...matchingGroup, status: "closed" },
      ),
    ).toBe(true);
  });

  it("filters UIC when the group specifies a breakout UIC", () => {
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        id: "g6",
        uic: "12345",
      }),
    ).toBe(true);
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        id: "g7",
        uic: "99999",
      }),
    ).toBe(false);
  });

  // ── Table 1-4 Block 5 Duty/Competitive Status ────────────────────────────
  // "For enlisted, group ACT and TAR together, group INACT, AT/ADOS separately."
  it("groups enlisted ACT and TAR together (Block 5, Table 1-4)", () => {
    const tarGroup = { ...matchingGroup, id: "g-tar", duty_status: "TAR" };
    expect(isEvalEligibleForSummaryGroup(baseEval, tarGroup)).toBe(true);
    expect(
      isEvalEligibleForSummaryGroup(
        { ...baseEval, duty_status: "TAR" },
        { ...matchingGroup, id: "g-act", duty_status: "ACT" },
      ),
    ).toBe(true);
  });

  it("separates enlisted INACT and AT/ADOS from ACT/TAR (Block 5, Table 1-4)", () => {
    for (const separate of ["INACT", "AT/ADOS"]) {
      expect(
        isEvalEligibleForSummaryGroup(baseEval, {
          ...matchingGroup,
          id: `g-${separate}`,
          duty_status: separate,
        }),
        `ACT eval must not join a ${separate} group`,
      ).toBe(false);
    }
    // ...and INACT and AT/ADOS are separate from each other.
    expect(
      isEvalEligibleForSummaryGroup(
        { ...baseEval, duty_status: "INACT" },
        { ...matchingGroup, id: "g-at", duty_status: "AT/ADOS" },
      ),
    ).toBe(false);
  });

  it("does NOT merge ACT and TAR for officers (Table 1-3 groups by the box marked)", () => {
    const fitrepEval = {
      ...baseEval,
      grade_rate: "LCDR",
      report_type: "FITREP" as const,
    };
    const fitrepGroup: SummaryGroupWithRs = {
      ...matchingGroup,
      id: "g-off",
      grade_rate: "LCDR",
      report_type: "FITREP",
    };
    expect(
      isEvalEligibleForSummaryGroup(fitrepEval, {
        ...fitrepGroup,
        duty_status: "ACT",
      }),
    ).toBe(true);
    expect(
      isEvalEligibleForSummaryGroup(fitrepEval, {
        ...fitrepGroup,
        id: "g-off-tar",
        duty_status: "TAR",
      }),
    ).toBe(false);
  });

  it("bucket helper implements the enlisted/officer Block 5 split", () => {
    expect(dutyStatusBucket("ACT", "EVAL")).toBe("ACT/TAR");
    expect(dutyStatusBucket("TAR", "CHIEFEVAL")).toBe("ACT/TAR");
    expect(dutyStatusBucket("INACT", "EVAL")).toBe("INACT");
    expect(dutyStatusBucket("AT/ADOS", "EVAL")).toBe("AT/ADOS");
    expect(dutyStatusBucket("ACT", "FITREP")).toBe("ACT");
    expect(dutyStatusBucket("TAR", "FITREP")).toBe("TAR");
  });

  // ── Table 1-4 Block 21 Billet ────────────────────────────────────────────
  // "Group by entry in this block."
  it("splits groups by Block 21 billet", () => {
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        id: "g-billet-na",
        billet_subcategory: "NA",
      }),
    ).toBe(true);
    expect(
      isEvalEligibleForSummaryGroup(baseEval, {
        ...matchingGroup,
        id: "g-billet-inst",
        billet_subcategory: "INSTRUCTOR",
      }),
    ).toBe(false);
  });
});

describe("visibleSummaryGroupsForEval", () => {
  it("returns only eligible open groups for PO2 Doe", () => {
    const groups: SummaryGroupWithRs[] = [
      matchingGroup,
      { ...matchingGroup, id: "g-wrong-pg", grade_rate: "PO1" },
      { ...matchingGroup, id: "g-wrong-date", period_to: "2024-12-31" },
    ];
    const visible = visibleSummaryGroupsForEval(baseEval, groups);
    expect(visible.map((g) => g.id)).toEqual(["g1"]);
  });
});
