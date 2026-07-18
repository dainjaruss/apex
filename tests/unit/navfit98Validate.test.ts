// tests/unit/navfit98Validate.test.ts
//
// validateNavfitExport — the NAVFIT-specific export gate (spec §6): length caps
// tighter than APEX's own, trait/NOB consistency, exclusive bit groups.
// Rejects, never truncates.

import { describe, it, expect } from "vitest";
import { validateNavfitExport } from "@/lib/navfit98/validateNavfitExport";
import { Evaluation } from "@/types";

const validEval: Evaluation = {
  id: "eval-1",
  created_by: "user-1",
  form_definition_id: "form-eval",
  report_type: "EVAL",
  member_name: "SAILOR, AMY B",
  dod_id: "1234567890",
  grade_rate: "PO2",
  designator: "ESWS",
  period_from: "2025-01-16",
  period_to: "2025-12-15",
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
  summary_group_distribution: {
    "Significant Problems": 0,
    Progressing: 1,
    Promotable: 4,
    "Must Promote": 3,
    "Early Promote": 2,
  },
  comments: "PO2 SAILOR IS MY NUMBER ONE PETTY OFFICER. PROMOTE NOW.",
  career_recommendations: ["NAVY RECRUITER", "LPO"],
  promotion_recommendation: "Must Promote",
  retention: "Recommended",
  status: "completed",
  signature_locked: true,
  routing_stage: "locked",
  block_values: {
    physical_readiness: "PPP",
    date_reported: "2024-01-15",
    periodic: true,
    regular_report: true,
    billet_subcategory: "NA",
    reporting_senior_name: "SMITH, A J",
    reporting_senior_grade: "CDR",
    reporting_senior_designator: "1110",
    reporting_senior_title: "CO",
    reporting_senior_uic: "54321",
    reporting_senior_dod_id: "0987654321",
    reporting_senior_address: "USS NEVERSAIL FPO AE 09501",
    command_achievements: "BATTLE E. RETENTION EXCELLENCE AWARD.",
    primary_duty_abbrev: "LPO",
    primary_duties: "LEADING PETTY OFFICER, DECK DIVISION.",
    qualifications: "ESWS QUALIFIED.",
    date_counseled: "2025-07-17",
    counselor: "SMITH, A J",
    comment_pitch: "10",
    member_statement_intent: "I DO NOT INTEND TO SUBMIT A STATEMENT",
    rater_signature: "SMITH, A J",
    rater_signature_date: "2025-12-20",
    senior_rater_signature: "JONES, R K",
    senior_rater_signature_date: "2025-12-21",
  },
};

const validChief: Evaluation = {
  ...validEval,
  id: "chief-1",
  form_definition_id: "form-chiefeval",
  report_type: "CHIEFEVAL",
  member_name: "OSBORNE, KAREN L",
  dod_id: "2345678901",
  grade_rate: "CPO",
  trait_grades: {
    deckplate_leadership: "5.0",
    professionalism: "4.0",
    mission_accomplishment: "5.0",
    human_development: "4.0",
    eo_climate: "5.0",
    teamwork: "4.0",
    leadership: "5.0",
  },
  comments: "CHIEF OSBORNE LED THE MESS THROUGH A DEMANDING YEAR.",
  career_recommendations: ["SEA DUTY", ""],
  promotion_recommendation: "Early Promote",
};

const validFitrep: Evaluation = {
  ...validEval,
  id: "fitrep-1",
  form_definition_id: "form-fitrep",
  report_type: "FITREP",
  member_name: "HALSEY, WILLIAM F",
  dod_id: "3456789012",
  grade_rate: "LT",
  designator: "1110",
  trait_grades: {
    knowledge: "5.0",
    eo: "4.0",
    bearing: "4.0",
    accomplishment: "5.0",
    teamwork: "4.0",
    leadership: "4.0",
    tactical_performance: "4.0",
  },
  comments: "LT HALSEY IS A TALENTED OFFICER WITH UNLIMITED POTENTIAL.",
  career_recommendations: ["DEPARTMENT HEAD", ""],
  promotion_recommendation: "Must Promote",
};

const withBv = (e: Evaluation, patch: Record<string, any>): Evaluation => ({
  ...e,
  block_values: { ...e.block_values, ...patch },
});

const hasBlockError = (e: Evaluation, block: number) =>
  validateNavfitExport(e).errors.some((issue) => issue.block === block);

describe("validateNavfitExport — happy paths", () => {
  it("passes a complete EVAL", () => {
    const res = validateNavfitExport(validEval);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("passes a complete CHIEFEVAL", () => {
    const res = validateNavfitExport(validChief);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("passes a complete FITREP", () => {
    const res = validateNavfitExport(validFitrep);
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });
});

describe("validateNavfitExport — NAVFIT length caps (spec §6.3)", () => {
  // Each case: value exactly at the Access column cap passes; cap+1 is rejected
  // with the correct NAVPERS block number. Never truncated.
  const cases: {
    name: string;
    block: number;
    pass: Evaluation;
    fail: Evaluation;
  }[] = [
    {
      name: "member_name ≤27 (FullName)",
      block: 1,
      pass: { ...validEval, member_name: `${"A".repeat(20)}, AMY B` }, // 27
      fail: { ...validEval, member_name: `${"A".repeat(21)}, AMY B` }, // 28
    },
    {
      name: "grade_rate ≤5 (Rate)",
      block: 2,
      pass: { ...validEval, grade_rate: "ABCDE" },
      fail: { ...validEval, grade_rate: "ABCDEF" },
    },
    {
      name: "ship_station ≤18 (ShipStation)",
      block: 7,
      pass: { ...validEval, ship_station: "A".repeat(18) },
      fail: { ...validEval, ship_station: "A".repeat(19) },
    },
    {
      name: "physical_readiness ≤4 (PhysicalReadiness)",
      block: 20,
      pass: withBv(validEval, { physical_readiness: "PPPP" }),
      fail: withBv(validEval, { physical_readiness: "PPPPP" }),
    },
    {
      name: "billet_subcategory ≤10 (BilletSubcat)",
      block: 21,
      pass: withBv(validEval, { billet_subcategory: "INSTRUCTOR" }), // 10-char table 1-1 code
      fail: withBv(validEval, { billet_subcategory: "AAAAAAAAAAA" }), // 11
    },
    {
      name: "reporting_senior_name ≤18 (ReportingSenior)",
      block: 22,
      pass: withBv(validEval, {
        reporting_senior_name: `${"A".repeat(13)}, A J`, // 18
      }),
      fail: withBv(validEval, {
        reporting_senior_name: `${"A".repeat(14)}, A J`, // 19
      }),
    },
    {
      name: "counselor ≤20 (Counseler — APEX itself allows 22)",
      block: 31,
      pass: withBv(validEval, { counselor: "A".repeat(20) }),
      fail: withBv(validEval, { counselor: "A".repeat(21) }),
    },
    {
      name: "career_recommendations[i] ≤20 (RecommendA/B)",
      block: 41,
      pass: { ...validEval, career_recommendations: ["A".repeat(20), "LPO"] },
      fail: { ...validEval, career_recommendations: ["A".repeat(21), "LPO"] },
    },
    {
      name: "rater typed name ≤28 (Rater)",
      block: 42,
      pass: withBv(validEval, { rater_signature: "A".repeat(28) }),
      fail: withBv(validEval, { rater_signature: "A".repeat(29) }),
    },
    {
      name: "summary counts ≤999 (SummarySP…EP are Text(3))",
      block: 46,
      pass: {
        ...validEval,
        summary_group_distribution: {
          ...validEval.summary_group_distribution,
          "Early Promote": 999,
        },
      },
      fail: {
        ...validEval,
        summary_group_distribution: {
          ...validEval.summary_group_distribution,
          "Early Promote": 1000,
        },
      },
    },
  ];

  for (const c of cases) {
    it(`${c.name}: value at the cap passes`, () => {
      const res = validateNavfitExport(c.pass);
      expect(res.errors).toEqual([]);
      expect(res.ok).toBe(true);
    });

    it(`${c.name}: cap+1 is rejected with Block ${c.block}`, () => {
      const res = validateNavfitExport(c.fail);
      expect(res.ok).toBe(false);
      expect(res.errors.some((issue) => issue.block === c.block)).toBe(true);
    });
  }
});

describe("validateNavfitExport — trait/NOB consistency (spec §6.4)", () => {
  it("rejects a null trait when the NOB bit is not set", () => {
    const missingTrait: Evaluation = {
      ...validEval,
      trait_grades: { ...validEval.trait_grades, leadership: undefined },
    };
    const res = validateNavfitExport(missingTrait);
    expect(res.ok).toBe(false);
    expect(res.errors.some((issue) => issue.block === 39)).toBe(true);
  });

  it("accepts NOB (0) traits and blank traits on a Not Observed report", () => {
    const nob: Evaluation = {
      ...validEval,
      promotion_recommendation: "NOB",
      trait_grades: {
        knowledge: "NOB",
        work: "NOB",
        eo: "NOB",
        bearing: "NOB",
        accomplishment: "NOB",
        teamwork: "NOB",
        leadership: "NOB",
      },
      block_values: { ...validEval.block_values, not_observed: true },
    };
    expect(validateNavfitExport(nob).ok).toBe(true);

    const blankTraits: Evaluation = {
      ...nob,
      trait_grades: {},
    };
    expect(validateNavfitExport(blankTraits).ok).toBe(true);
  });
});

describe("validateNavfitExport — EVAL retention bit group (spec §6.5)", () => {
  it("rejects an EVAL with no retention selection (neither bit would be set)", () => {
    const res = validateNavfitExport({ ...validEval, retention: "" });
    expect(res.ok).toBe(false);
    expect(res.errors.length).toBeGreaterThan(0);
  });

  it("rejects an EVAL retention value outside the two options", () => {
    const res = validateNavfitExport({ ...validEval, retention: "Maybe" });
    expect(res.ok).toBe(false);
  });

  it('accepts "Not Recommended" as exactly one bit (never both via substring match)', () => {
    const res = validateNavfitExport({
      ...validEval,
      retention: "Not Recommended",
    });
    expect(res.errors).toEqual([]);
    expect(res.ok).toBe(true);
  });
});
