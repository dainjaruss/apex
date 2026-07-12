import { describe, it, expect } from "vitest";
import {
  runFullValidation,
  generateErrorReport,
  getBlockForField,
} from "../../lib/validationEngine";
import { Evaluation } from "../../types";

const mockValidEvaluation: Evaluation = {
  id: "test-eval-id",
  created_by: "test-user-id",
  form_definition_id: "EVAL",
  report_type: "EVAL",
  member_name: "DOE, JOHN A",
  dod_id: "1234567890",
  grade_rate: "PO2",
  designator: "1110",
  period_from: "2025-01-01",
  period_to: "2025-12-31",
  duty_status: "ACT",
  uic: "12345",
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
  comments: "PO2 DOE HAS PERFORMED OUTSTANDING DUTIES THROUGHOUT THIS CYCLE.",
  career_recommendations: ["NAVY RECRUITER", "LPO"],
  promotion_recommendation: "Must Promote",
  retention: "Recommended",
  status: "draft",
  block_values: {
    physical_readiness: "PPP",
    date_reported: "2024-01-15",
    periodic: true, // Block 10 — occasion
    regular_report: true, // Block 17 — type
    reporting_senior_name: "SMITH, A J",
    reporting_senior_grade: "CDR",
    reporting_senior_designator: "1110",
    reporting_senior_title: "CO",
    reporting_senior_uic: "12345",
    reporting_senior_dod_id: "0987654321",
    command_achievements: "LEAD LPO",
    primary_duties: "DIVISION LEAD",
    date_counseled: "25JAN15",
    counselor: "SMITH, A J",
    comment_pitch: "10",
    billet_subcategory: "NA",
  },
};

describe("APEX Validation Engine Unit Tests", () => {
  it("should map form fields to their correct NAVPERS block numbers", () => {
    expect(getBlockForField("member_name")).toBe(1);
    expect(getBlockForField("dod_id")).toBe(4);
    expect(getBlockForField("comments")).toBe(43);
    expect(getBlockForField("promotion_recommendation")).toBe(45);
    expect(getBlockForField("non_existent_field")).toBeUndefined();
  });

  it("should pass validation for a perfectly formatted evaluation report", () => {
    const result = runFullValidation(mockValidEvaluation);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("should flag errors for invalid administrative details", () => {
    const invalidAdmin = {
      ...mockValidEvaluation,
      member_name: "John Doe", // Invalid format
      dod_id: "12345", // Must be 10 digits
      uic: "ABC", // Must be 5 characters
      grade_rate: "PO-2", // Special characters not allowed
    };

    const result = runFullValidation(invalidAdmin);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.field === "member_name")).toBe(true);
    expect(result.errors.some((e) => e.field === "dod_id")).toBe(true);
    expect(result.errors.some((e) => e.field === "uic")).toBe(true);
    expect(result.errors.some((e) => e.field === "grade_rate")).toBe(true);
  });

  it("should flag errors if member name contains disallowed special characters", () => {
    const invalidName = {
      ...mockValidEvaluation,
      member_name: "DOE, JOHN A.", // Period is not allowed
    };
    const result = runFullValidation(invalidName);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.field === "member_name")).toBe(true);
  });

  it("should restrict promotion recommendation if a trait grade is 1.0", () => {
    const poorTrait = {
      ...mockValidEvaluation,
      trait_grades: {
        ...mockValidEvaluation.trait_grades,
        work: "1.0",
      },
      promotion_recommendation: "Must Promote", // Disallowed by 1.0 trait grade rules
    };

    const result = runFullValidation(poorTrait);
    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.field === "promotion_recommendation"),
    ).toBe(true);
  });

  it("should restrict promotion recommendation if Command Climate/EO is 2.0", () => {
    const poorClimate = {
      ...mockValidEvaluation,
      trait_grades: {
        ...mockValidEvaluation.trait_grades,
        eo: "2.0",
      },
      promotion_recommendation: "Promotable", // Disallowed (limits to Progressing or lower)
    };

    const result = runFullValidation(poorClimate);
    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.field === "promotion_recommendation"),
    ).toBe(true);
  });

  it("should flag an error if Block 43 comments exceed physical monospace box capacity", () => {
    const overflowComments = {
      ...mockValidEvaluation,
      // 20 lines of comments exceeds the 18 line max box capacity
      comments: Array(20)
        .fill("THIS LINE FITS WITHIN MONOSPACE WIDTH.")
        .join("\n"),
    };

    const result = runFullValidation(overflowComments);
    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.field === "comments")).toBe(true);
  });

  it("should trigger warnings for missing optional but recommended fields", () => {
    const missingOptional = {
      ...mockValidEvaluation,
      designator: "",
    };

    const result = runFullValidation(missingOptional);
    expect(result.success).toBe(true); // Success is true because they are warnings, not blocker errors
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.some((w) => w.field === "designator")).toBe(true);
  });

  it("should flag Block 29 overflow caused by the 29A box sharing line 1", () => {
    // 33 seven-char words = 263 chars: fits 3 lines at a flat 91 CPL, but the 29A
    // abbreviation box reserves ~20 chars on line 1, pushing it to a 4th line.
    const body = Array.from({ length: 33 }, () => "COMMTEC").join(" ");
    const overflow = {
      ...mockValidEvaluation,
      block_values: {
        ...mockValidEvaluation.block_values,
        primary_duties: body,
      },
    };

    const result = runFullValidation(overflow);
    expect(result.success).toBe(false);
    expect(
      result.errors.some((e) => e.field === "primary_duties" && e.block === 29),
    ).toBe(true);
  });

  it("should error (not warn) when Block 21 billet subcategory is empty", () => {
    const emptyBillet = {
      ...mockValidEvaluation,
      block_values: {
        ...mockValidEvaluation.block_values,
        billet_subcategory: "",
      },
    };

    const result = runFullValidation(emptyBillet);
    expect(result.success).toBe(false);
    const issue = result.errors.find((e) => e.field === "billet_subcategory");
    expect(issue).toBeDefined();
    expect(issue?.block).toBe(21);
  });

  it("should accept Block 30 Date Counseled as a date, NOT REQ, or NOT PERF", () => {
    // ISO (calendar picker), legacy YYMMMDD, and the two exception codes all pass.
    for (const v of ["2025-01-15", "25JAN15", "NOT REQ", "NOT PERF"]) {
      const ok = {
        ...mockValidEvaluation,
        block_values: {
          ...mockValidEvaluation.block_values,
          date_counseled: v,
        },
      };
      expect(
        runFullValidation(ok).errors.some((e) => e.field === "date_counseled"),
      ).toBe(false);
    }
    const bad = {
      ...mockValidEvaluation,
      block_values: {
        ...mockValidEvaluation.block_values,
        date_counseled: "SOMEDAY",
      },
    };
    const res = runFullValidation(bad);
    expect(
      res.errors.some((e) => e.field === "date_counseled" && e.block === 30),
    ).toBe(true);
  });

  it("should require Block 31 Counselor", () => {
    const noCounselor = {
      ...mockValidEvaluation,
      block_values: { ...mockValidEvaluation.block_values, counselor: "" },
    };
    const res = runFullValidation(noCounselor);
    expect(
      res.errors.some((e) => e.field === "counselor" && e.block === 31),
    ).toBe(true);
  });

  it("should cap Block 31 Counselor at 22 characters so it fits the form", () => {
    const tooLong = {
      ...mockValidEvaluation,
      block_values: {
        ...mockValidEvaluation.block_values,
        counselor: "A".repeat(23),
      },
    };
    expect(
      runFullValidation(tooLong).errors.some(
        (e) => e.field === "counselor" && e.block === 31,
      ),
    ).toBe(true);

    const exactly22 = {
      ...mockValidEvaluation,
      block_values: {
        ...mockValidEvaluation.block_values,
        counselor: "A".repeat(22),
      },
    };
    expect(
      runFullValidation(exactly22).errors.some((e) => e.field === "counselor"),
    ).toBe(false);
  });

  it("should require at least one Block 41 career recommendation (never blank)", () => {
    const blank = { ...mockValidEvaluation, career_recommendations: ["", ""] };
    expect(
      runFullValidation(blank).errors.some(
        (e) => e.field === "career_recommendations" && e.block === 41,
      ),
    ).toBe(true);

    // A single entry (e.g. "NA") satisfies the mandatory-minimum.
    const oneEntry = {
      ...mockValidEvaluation,
      career_recommendations: ["NA", ""],
    };
    expect(
      runFullValidation(oneEntry).errors.some(
        (e) => e.field === "career_recommendations",
      ),
    ).toBe(false);
  });

  it("should cap each Block 41 career recommendation at 20 characters", () => {
    const tooLong = {
      ...mockValidEvaluation,
      career_recommendations: ["A".repeat(21), ""],
    };
    expect(
      runFullValidation(tooLong).errors.some(
        (e) => e.field === "career_recommendations" && e.block === 41,
      ),
    ).toBe(true);

    const exactly20 = {
      ...mockValidEvaluation,
      career_recommendations: ["A".repeat(20), "LPO"],
    };
    expect(
      runFullValidation(exactly20).errors.some(
        (e) => e.field === "career_recommendations",
      ),
    ).toBe(false);
  });

  it("should reject more than two Block 41 career recommendations", () => {
    const three = {
      ...mockValidEvaluation,
      career_recommendations: ["RECRUITER", "LPO", "CCC"],
    };
    expect(
      runFullValidation(three).errors.some(
        (e) => e.field === "career_recommendations" && e.block === 41,
      ),
    ).toBe(true);
  });

  it("should output a clean text report from generateErrorReport", () => {
    const result = runFullValidation(mockValidEvaluation);
    const emptyReport = generateErrorReport(result);
    expect(emptyReport).toContain("Validation Complete");

    const badDataResult = runFullValidation({
      ...mockValidEvaluation,
      dod_id: "12345",
    });
    const errorReport = generateErrorReport(badDataResult);
    expect(errorReport).toContain("Validation Errors");
    expect(errorReport).toContain("Block 4");
  });

  it("should warn when a starred Block 21 subcategory is not matched in Block 29", () => {
    const mismatch = {
      ...mockValidEvaluation,
      block_values: {
        ...mockValidEvaluation.block_values,
        billet_subcategory: "STUDENT", // starred code (*) in table 1-1
        primary_duty_abbrev: "NUKE ELT",
        primary_duties: "PRIMARY DUTY: REACTOR OPERATOR", // no "STUDENT" entry
      },
    };

    const result = runFullValidation(mismatch);
    const warning = result.warnings.find(
      (w) => w.field === "billet_subcategory",
    );
    expect(warning).toBeDefined();
    expect(warning?.block).toBe(21);
  });

  it("should not warn when a starred Block 21 subcategory matches Block 29", () => {
    const matched = {
      ...mockValidEvaluation,
      block_values: {
        ...mockValidEvaluation.block_values,
        billet_subcategory: "STUDENT",
        primary_duties: "STUDENT, NUCLEAR POWER SCHOOL", // matches Block 21
      },
    };

    const result = runFullValidation(matched);
    expect(result.warnings.some((w) => w.field === "billet_subcategory")).toBe(
      false,
    );
  });

  it("should not apply the Block 21↔29 match rule to non-starred codes (NA)", () => {
    const result = runFullValidation(mockValidEvaluation); // billet_subcategory: 'NA'
    expect(result.warnings.some((w) => w.field === "billet_subcategory")).toBe(
      false,
    );
  });

  // --- Block 9: Date Reported (ISO date, today or earlier) ---

  it("should accept a valid past Date Reported (Block 9) in ISO format", () => {
    const result = runFullValidation(mockValidEvaluation); // date_reported: '2024-01-15'
    expect(result.errors.some((e) => e.field === "date_reported")).toBe(false);
  });

  it("should reject a Date Reported (Block 9) that is in the future", () => {
    const future = {
      ...mockValidEvaluation,
      block_values: {
        ...mockValidEvaluation.block_values,
        date_reported: "2999-01-01",
      },
    };
    const res = runFullValidation(future);
    expect(
      res.errors.some((e) => e.field === "date_reported" && e.block === 9),
    ).toBe(true);
  });

  it("should reject a Date Reported (Block 9) that is not ISO YYYY-MM-DD", () => {
    const legacy = {
      ...mockValidEvaluation,
      block_values: {
        ...mockValidEvaluation.block_values,
        date_reported: "24JAN15",
      },
    };
    const res = runFullValidation(legacy);
    expect(
      res.errors.some((e) => e.field === "date_reported" && e.block === 9),
    ).toBe(true);
  });

  it("should reject an impossible calendar Date Reported (Block 9)", () => {
    const feb30 = {
      ...mockValidEvaluation,
      block_values: {
        ...mockValidEvaluation.block_values,
        date_reported: "2024-02-30",
      },
    };
    const res = runFullValidation(feb30);
    expect(
      res.errors.some((e) => e.field === "date_reported" && e.block === 9),
    ).toBe(true);
  });

  // --- Block 21: Billet Subcategory must be a valid table 1-1 code ---

  it("should reject a Block 21 billet subcategory that is not a table 1-1 code", () => {
    const offList = {
      ...mockValidEvaluation,
      block_values: {
        ...mockValidEvaluation.block_values,
        billet_subcategory: "BOGUS",
      },
    };
    const res = runFullValidation(offList);
    expect(res.success).toBe(false);
    expect(
      res.errors.some(
        (e) => e.field === "billet_subcategory" && e.block === 21,
      ),
    ).toBe(true);
  });

  it("should accept a valid SPECIAL Block 21 billet subcategory code", () => {
    const special = {
      ...mockValidEvaluation,
      block_values: {
        ...mockValidEvaluation.block_values,
        billet_subcategory: "SPECIAL05",
      },
    };
    expect(
      runFullValidation(special).errors.some(
        (e) => e.field === "billet_subcategory",
      ),
    ).toBe(false);
  });

  // --- Block 29A: primary-duty abbreviation, 14 chars max ---

  it("should reject a Block 29A primary duty abbreviation longer than 14 characters", () => {
    const tooLong = {
      ...mockValidEvaluation,
      block_values: {
        ...mockValidEvaluation.block_values,
        primary_duty_abbrev: "A".repeat(15),
      },
    };
    const res = runFullValidation(tooLong);
    expect(
      res.errors.some(
        (e) => e.field === "primary_duty_abbrev" && e.block === 29,
      ),
    ).toBe(true);
  });

  it("should accept a Block 29A abbreviation of 14 characters including spaces", () => {
    const ok = {
      ...mockValidEvaluation,
      block_values: {
        ...mockValidEvaluation.block_values,
        primary_duty_abbrev: "WORK CTR SUPVR",
      }, // 14 chars
    };
    expect(
      runFullValidation(ok).errors.some(
        (e) => e.field === "primary_duty_abbrev",
      ),
    ).toBe(false);
  });

  // --- Block 43 substantiation (1.0 marks / three 2.0 marks / 2.0 in Block 35) ---

  it("should ERROR when a 1.0 mark is present but Block 43 comments are empty", () => {
    const e = {
      ...mockValidEvaluation,
      promotion_recommendation: "Progressing", // 1.0 limits the rec; keeps the test focused
      trait_grades: { ...mockValidEvaluation.trait_grades, knowledge: "1.0" },
      comments: "",
    };
    const res = runFullValidation(e);
    expect(
      res.errors.some(
        (i) =>
          i.field === "comments" &&
          i.block === 43 &&
          /substantiate/i.test(i.message),
      ),
    ).toBe(true);
  });

  it("should WARN and name the block when a 1.0 mark has comments present", () => {
    const e = {
      ...mockValidEvaluation,
      promotion_recommendation: "Progressing",
      trait_grades: { ...mockValidEvaluation.trait_grades, knowledge: "1.0" },
      comments:
        "PO2 DOE STRUGGLED WITH CORE TASKS THIS PERIOD; SPECIFIC EXAMPLES FOLLOW.",
    };
    const w = runFullValidation(e).warnings.find(
      (i) => i.field === "comments" && i.block === 43,
    );
    expect(w).toBeDefined();
    expect(w?.message).toMatch(/Block 33/);
  });

  it("should not flag two 2.0 marks, but should flag three or more", () => {
    const two = {
      ...mockValidEvaluation,
      promotion_recommendation: "Promotable", // 2.0 bars Must/Early Promote, allows Promotable
      trait_grades: {
        ...mockValidEvaluation.trait_grades,
        knowledge: "2.0",
        work: "2.0",
      },
    };
    expect(
      runFullValidation(two).warnings.some(
        (i) => i.field === "comments" && /substantiate/i.test(i.message),
      ),
    ).toBe(false);

    const three = {
      ...mockValidEvaluation,
      promotion_recommendation: "Promotable",
      trait_grades: {
        ...mockValidEvaluation.trait_grades,
        knowledge: "2.0",
        work: "2.0",
        accomplishment: "2.0",
      },
    };
    expect(
      runFullValidation(three).warnings.some(
        (i) => i.field === "comments" && /three or more 2\.0/i.test(i.message),
      ),
    ).toBe(true);
  });

  it("should flag a single 2.0 in Block 35 (EO/Climate)", () => {
    const e = {
      ...mockValidEvaluation,
      promotion_recommendation: "Progressing", // a 2.0 in EO bars Promotable or higher
      trait_grades: { ...mockValidEvaluation.trait_grades, eo: "2.0" },
    };
    const w = runFullValidation(e).warnings.find(
      (i) => i.field === "comments" && i.block === 43,
    );
    expect(w).toBeDefined();
    expect(w?.message).toMatch(/Block 35/);
  });

  it("should flag an ungraded trait on an observed report (Block 33-39 required)", () => {
    const e = {
      ...mockValidEvaluation,
      block_values: {
        ...mockValidEvaluation.block_values,
        not_observed: false,
      },
      trait_grades: {
        ...mockValidEvaluation.trait_grades,
        leadership: undefined,
      },
    };
    const res = runFullValidation(e);
    expect(
      res.errors.some(
        (i) => i.field === "trait_grades.leadership" && i.block === 39,
      ),
    ).toBe(true);
  });

  it("should not require trait grades on a wholly Not Observed report", () => {
    const e = {
      ...mockValidEvaluation,
      promotion_recommendation: "NOB",
      block_values: { ...mockValidEvaluation.block_values, not_observed: true },
      trait_grades: {},
    };
    const res = runFullValidation(e);
    expect(res.errors.some((i) => i.field?.startsWith("trait_grades."))).toBe(
      false,
    );
  });

  it("should not apply the Block 43 substantiation rule to NOB reports", () => {
    const e = {
      ...mockValidEvaluation,
      promotion_recommendation: "NOB",
      trait_grades: { ...mockValidEvaluation.trait_grades, knowledge: "1.0" },
      comments: "",
    };
    const res = runFullValidation(e);
    expect(
      res.errors.some(
        (i) => i.field === "comments" && /substantiate/i.test(i.message),
      ),
    ).toBe(false);
    expect(
      res.warnings.some(
        (i) => i.field === "comments" && /substantiate/i.test(i.message),
      ),
    ).toBe(false);
  });
});
