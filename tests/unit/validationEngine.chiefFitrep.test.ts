import { describe, it, expect } from "vitest";
import { runFullValidation } from "../../lib/validationEngine";
import { Evaluation } from "../../types";

const chiefBaseBlockValues = {
  physical_readiness: "PP",
  date_reported: "2024-06-01",
  periodic: true,
  regular_report: true,
  reporting_senior_name: "SMITH, A J",
  reporting_senior_grade: "CMDCM",
  reporting_senior_designator: "",
  reporting_senior_title: "CMDCM",
  reporting_senior_uic: "12345",
  reporting_senior_dod_id: "0987654321",
  command_achievements: "DEPLOYED WESTPAC",
  primary_duties: "LCPO-12",
  date_counseled: "NOT REQ",
  counselor: "SMITH, A J",
  comment_pitch: "10",
  billet_subcategory: "NA",
};

const mockChiefEval: Evaluation = {
  id: "chief-1",
  created_by: "u1",
  form_definition_id: "CHIEFEVAL",
  report_type: "CHIEFEVAL",
  member_name: "RODRIGUEZ, M E",
  dod_id: "1234567890",
  grade_rate: "ITCS",
  designator: "AW",
  period_from: "2025-01-01",
  period_to: "2025-12-31",
  duty_status: "ACT",
  uic: "12345",
  ship_station: "NIOC NORFOLK",
  promotion_status: "Regular",
  trait_grades: {
    deckplate_leadership: "4.0",
    professionalism: "4.0",
    mission_accomplishment: "4.0",
    human_development: "4.0",
    eo_climate: "4.0",
    teamwork: "4.0",
    leadership: "4.0",
  },
  comments: "ITCS RODRIGUEZ LED THE DIVISION WITH STRONG DECKPLATE PRESENCE.",
  career_recommendations: ["CMDCM", "NA"],
  promotion_recommendation: "Must Promote",
  retention: "Recommended",
  status: "draft",
  block_values: chiefBaseBlockValues,
};

const mockFitrep: Evaluation = {
  id: "fitrep-1",
  created_by: "u1",
  form_definition_id: "FITREP_W2_O6",
  report_type: "FITREP",
  member_name: "CHEN, D T",
  dod_id: "1234567890",
  grade_rate: "LT",
  designator: "1110",
  period_from: "2025-01-01",
  period_to: "2025-12-31",
  duty_status: "ACT",
  uic: "12345",
  ship_station: "USS EXAMPLE",
  promotion_status: "Regular",
  trait_grades: {
    knowledge: "4.0",
    work: "4.0",
    eo: "4.0",
    bearing: "4.0",
    accomplishment: "4.0",
    teamwork: "4.0",
    leadership: "4.0",
    tactical_performance: "4.0",
  },
  comments: "LT CHEN DEMONSTRATED STRONG OFFICER LEADERSHIP THROUGHOUT THE PERIOD.",
  career_recommendations: ["DEPT HEAD", "NA"],
  promotion_recommendation: "Must Promote",
  retention: "Recommended",
  status: "draft",
  block_values: { ...chiefBaseBlockValues, date_counseled: "2025-06-01" },
};

describe("CHIEFEVAL validation (NAVPERS 1616/27)", () => {
  it("passes a complete valid CHIEFEVAL", () => {
    const result = runFullValidation(mockChiefEval);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects future Date Reported (Block 9) like EVAL", () => {
    const bad = {
      ...mockChiefEval,
      block_values: {
        ...mockChiefEval.block_values,
        date_reported: "2999-01-01",
      },
    };
    expect(
      runFullValidation(bad).errors.some(
        (e) => e.field === "date_reported" && e.block === 9,
      ),
    ).toBe(true);
  });

  it("gates promotion on EO/Climate Block 37 below 3.0", () => {
    const bad = {
      ...mockChiefEval,
      trait_grades: { ...mockChiefEval.trait_grades, eo_climate: "2.0" },
      promotion_recommendation: "Promotable" as const,
    };
    expect(
      runFullValidation(bad).errors.some(
        (e) => e.field === "promotion_recommendation",
      ),
    ).toBe(true);
  });

  it("requires substantiation for any 2.0 mark (CHIEFEVAL footnote)", () => {
    const twoOnly = {
      ...mockChiefEval,
      promotion_recommendation: "Promotable" as const,
      trait_grades: {
        ...mockChiefEval.trait_grades,
        teamwork: "2.0",
      },
      comments:
        "ITCS RODRIGUEZ PERFORMED ADEQUATELY WITH ONE AREA FOR IMPROVEMENT.",
    };
    const w = runFullValidation(twoOnly).warnings.find(
      (i) => i.field === "comments" && /every 2\.0/i.test(i.message),
    );
    expect(w).toBeDefined();
  });

  it("does not require retention (Block 47 omitted)", () => {
    // CHIEFEVAL omits Block 47, so build the fixture without a retention key at all.
    const { retention: _retention, ...noRetention } = mockChiefEval;
    expect(
      runFullValidation(noRetention as Evaluation).errors.some(
        (e) => e.field === "retention",
      ),
    ).toBe(false);
  });
});

describe("FITREP validation (NAVPERS 1610/2)", () => {
  it("passes a complete valid FITREP with 8 traits", () => {
    const result = runFullValidation(mockFitrep);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("requires officer four-digit designator (Block 3)", () => {
    const bad = { ...mockFitrep, designator: "" };
    expect(
      runFullValidation(bad).errors.some(
        (e) => e.field === "designator" && e.block === 3,
      ),
    ).toBe(true);
  });

  it("flags ungraded tactical_performance on observed reports", () => {
    const bad = {
      ...mockFitrep,
      trait_grades: {
        ...mockFitrep.trait_grades,
        tactical_performance: undefined,
      },
    };
    expect(
      runFullValidation(bad).errors.some(
        (e) => e.field === "trait_grades.tactical_performance",
      ),
    ).toBe(true);
  });

  it("substantiation cites Block 34 for EO 2.0 on FITREP", () => {
    const eo2 = {
      ...mockFitrep,
      promotion_recommendation: "Progressing" as const,
      trait_grades: { ...mockFitrep.trait_grades, eo: "2.0" },
      comments: "LT CHEN COMMENTS ADDRESS EO CONCERNS WITH EXAMPLES.",
    };
    const w = runFullValidation(eo2).warnings.find(
      (i) => i.field === "comments" && i.block === 43,
    );
    expect(w?.message).toMatch(/Block 34/);
  });

  it("allows four Block 29B lines on FITREP (not EVAL three-line cap)", () => {
    const fourLineBody = Array.from({ length: 4 }, () => "A".repeat(71)).join(
      "\n",
    );
    const fitrepFour = {
      ...mockFitrep,
      block_values: {
        ...mockFitrep.block_values,
        primary_duty_abbrev: "",
        primary_duties: fourLineBody,
      },
    };
    expect(
      runFullValidation(fitrepFour).errors.some(
        (e) => e.field === "primary_duties",
      ),
    ).toBe(false);

    const chiefFour = {
      ...mockChiefEval,
      block_values: {
        ...mockChiefEval.block_values,
        primary_duty_abbrev: "",
        primary_duties: fourLineBody,
      },
    };
    expect(
      runFullValidation(chiefFour).errors.some(
        (e) => e.field === "primary_duties",
      ),
    ).toBe(false);
  });

  it("does not warn on empty designator for officers when designator is set", () => {
    const withDesig = runFullValidation(mockFitrep);
    expect(withDesig.warnings.some((w) => w.field === "designator")).toBe(
      false,
    );
  });
});