// tests/unit/navfit98Map.test.ts
//
// mapEvaluationToNavfit — Evaluation → NAVFIT 98A Reports row.
// Expectations derived from docs/specs/navfit98-field-mapping.md §1/§4/§5.

import { describe, it, expect } from "vitest";
import { mapEvaluationToNavfit } from "@/lib/navfit98/mapEvaluationToNavfit";
import { Evaluation } from "@/types";

// Spec §1: all 126 Reports columns minus ReportID (AutoNumbered by the writer).
const EXPECTED_COLUMNS = [
  "Parent",
  "ReportType",
  "FullName",
  "FirstName",
  "MI",
  "LastName",
  "Suffix",
  "Rate",
  "Desig",
  "SSN",
  "Active",
  "TAR",
  "Inactive",
  "ATADSW",
  "UIC",
  "ShipStation",
  "PromotionStatus",
  "DateReported",
  "Periodic",
  "DetInd",
  "Frocking",
  "Special",
  "FromDate",
  "ToDate",
  "NOB",
  "Regular",
  "Concurrent",
  "OpsCdr",
  "PhysicalReadiness",
  "PhysicalReadiness2",
  "PhysicalReadinessDt",
  "BilletSubcat",
  "RSLastName",
  "RSFI",
  "RSMI",
  "ReportingSenior",
  "RSGrade",
  "RSDesig",
  "RSTitle",
  "RSUIC",
  "RSSSN",
  "Achievements",
  "PrimaryDuty",
  "Duties",
  "DateCounseled",
  "Counseler",
  "CounselerLN",
  "CounselerFI",
  "CounselerMI",
  "PROF",
  "PROFDN1",
  "PROFDN2",
  "PROFDN3",
  "QUAL",
  "QUALDN1",
  "QUALDN2",
  "QUALDN3",
  "EO",
  "EODN1",
  "EODN2",
  "EODN3",
  "MIL",
  "MILDN1",
  "MILDN2",
  "MILDN3",
  "PA",
  "PADN1",
  "PADN2",
  "PADN3",
  "TEAM",
  "TEAMDN1",
  "TEAMDN2",
  "TEAMDN3",
  "LEAD",
  "LEADDN1",
  "LEADDN2",
  "LEADDN3",
  "MIS",
  "MISDN1",
  "MISDN2",
  "MISDN3",
  "TAC",
  "TACDN1",
  "TACDN2",
  "TACDN3",
  "RecommendA",
  "RecommendB",
  "Rater",
  "RaterDate",
  "CommentsPitch",
  "Comments",
  "Qualifications",
  "PromotionRecom",
  "SummaryRank",
  "SummarySP",
  "SummaryProg",
  "SummaryProm",
  "SummaryMP",
  "SummaryEP",
  "RetentionYes",
  "RetentionNo",
  "RSCA",
  "RSAddress",
  "RSAddress1",
  "RSAddress2",
  "RSCity",
  "RSState",
  "RSZipCd",
  "RSPhone",
  "RSDSN",
  "SeniorRater",
  "SeniorRaterDate",
  "StatementYes",
  "StatementNo",
  "RSInfo",
  "RRSFI",
  "RRSMI",
  "RRSLastName",
  "RRSGrade",
  "RRSCommand",
  "RRSUIC",
  "UserComments",
  "Psswrd",
  "Standards",
  "IsValidated",
];

// Spec §6 invariant 6 — the 17 Yes/No columns in Reports.
const BIT_COLUMNS = [
  "Active",
  "TAR",
  "Inactive",
  "ATADSW",
  "Periodic",
  "DetInd",
  "Frocking",
  "Special",
  "NOB",
  "Regular",
  "Concurrent",
  "OpsCdr",
  "RetentionYes",
  "RetentionNo",
  "StatementYes",
  "StatementNo",
  "IsValidated",
];

const TRAIT_COLUMNS = [
  "PROF",
  "QUAL",
  "EO",
  "MIL",
  "PA",
  "TEAM",
  "LEAD",
  "MIS",
  "TAC",
];

const evalFixture: Evaluation = {
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
    work: "3.0",
    eo: "5.0",
    bearing: "4.0",
    accomplishment: "3.0",
    teamwork: "5.0",
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
    reporting_senior_name: "GRABOWSKI, T R JR",
    reporting_senior_grade: "CDR",
    reporting_senior_designator: "1110",
    reporting_senior_title: "CO",
    reporting_senior_uic: "54321",
    reporting_senior_dod_id: "0987654321",
    reporting_senior_address: "USS NEVERSAIL\nFPO AE 09501",
    command_achievements: "BATTLE E. RETENTION EXCELLENCE AWARD.",
    primary_duty_abbrev: "LPO",
    primary_duties: "LEADING PETTY OFFICER, DECK DIVISION.",
    qualifications: "ESWS QUALIFIED.",
    date_counseled: "2025-07-17",
    counselor: "SMITH, A J",
    comment_pitch: "10",
    member_statement_intent: "I INTEND TO SUBMIT A STATEMENT",
    rater_signature: "SMITH, A J",
    rater_signature_date: "2025-12-20",
    senior_rater_signature: "JONES, R K",
    senior_rater_signature_date: "2025-12-21",
  },
};

const chiefFixture: Evaluation = {
  id: "chief-1",
  created_by: "user-1",
  form_definition_id: "form-chiefeval",
  report_type: "CHIEFEVAL",
  member_name: "OSBORNE, KAREN L",
  dod_id: "2345678901",
  grade_rate: "CPO",
  designator: "ESWS",
  period_from: "2025-01-16",
  period_to: "2025-11-15",
  duty_status: "AT/ADOS",
  uic: "23456",
  ship_station: "NAVRESCEN DENVER",
  promotion_status: "Frocked",
  // Grades chosen so each CHIEFEVAL block lands a distinct-enough value to
  // catch a name-based (rather than positional §4.3) column assignment.
  trait_grades: {
    deckplate_leadership: "5.0",
    professionalism: "1.0",
    mission_accomplishment: "2.0",
    human_development: "3.0",
    eo_climate: "4.0",
    teamwork: "NOB",
    leadership: "3.0",
  },
  comments: "CHIEF OSBORNE LED THE RESERVE CENTER THROUGH A DEMANDING YEAR.",
  career_recommendations: ["SEA DUTY", ""],
  promotion_recommendation: "Early Promote",
  retention: "Recommended",
  status: "completed",
  signature_locked: true,
  routing_stage: "locked",
  block_values: {
    physical_readiness: "PPW",
    date_reported: "2023-06-01",
    periodic: true,
    regular_report: true,
    billet_subcategory: "NA",
    reporting_senior_name: "STJOHN, O F",
    reporting_senior_grade: "CAPT",
    reporting_senior_designator: "1110",
    reporting_senior_title: "CO",
    reporting_senior_uic: "23456",
    reporting_senior_dod_id: "1122334455",
    reporting_senior_address: "NAVRESCEN DENVER CO 80112",
    command_achievements: "TOP RESERVE CENTER IN REGION.",
    primary_duty_abbrev: "SEL",
    primary_duties: "SENIOR ENLISTED LEADER.",
    date_counseled: "NOT REQ",
    counselor: "STJOHN, O F",
    comment_pitch: "10",
  },
};

const fitrepFixture: Evaluation = {
  id: "fitrep-1",
  created_by: "user-1",
  form_definition_id: "form-fitrep",
  report_type: "FITREP",
  member_name: "HALSEY, WILLIAM F",
  dod_id: "3456789012",
  grade_rate: "LT",
  designator: "1110",
  period_from: "2024-11-01",
  period_to: "2025-10-31",
  duty_status: "TAR",
  uic: "34567",
  ship_station: "USS EXAMPLE",
  promotion_status: "Regular",
  // `work` is the legacy block-34 alias — spec §4.3 says FITREP block 34 comes
  // from `eo`; the mapper must ignore `work` (given a decoy value here).
  trait_grades: {
    knowledge: "5.0",
    work: "1.0",
    eo: "4.0",
    bearing: "3.0",
    accomplishment: "5.0",
    teamwork: "2.0",
    leadership: "4.0",
    tactical_performance: "3.0",
  },
  comments: "LT HALSEY IS A TALENTED OFFICER WITH UNLIMITED POTENTIAL.",
  career_recommendations: ["DEPARTMENT HEAD", ""],
  promotion_recommendation: "Must Promote",
  retention: "Recommended",
  status: "completed",
  signature_locked: true,
  routing_stage: "locked",
  block_values: {
    physical_readiness: "PP",
    date_reported: "2023-01-10",
    periodic: true,
    regular_report: true,
    billet_subcategory: "NA",
    reporting_senior_name: "NIMITZ, C W",
    reporting_senior_grade: "CAPT",
    reporting_senior_designator: "1110",
    reporting_senior_title: "CO",
    reporting_senior_uic: "34567",
    reporting_senior_dod_id: "5566778899",
    command_achievements: "DEPLOYED 7TH FLEET.",
    primary_duty_abbrev: "WEPS",
    primary_duties: "WEAPONS OFFICER.",
    date_counseled: "25JAN15",
    counselor: "HM1 SMITH",
    member_statement_intent: "I DO NOT INTEND TO SUBMIT A STATEMENT",
  },
};

describe("mapEvaluationToNavfit — row shape", () => {
  it("returns exactly the 125 expected Reports columns (126 minus ReportID)", () => {
    const row = mapEvaluationToNavfit(evalFixture);
    expect(EXPECTED_COLUMNS).toHaveLength(125);
    expect(Object.keys(row).sort()).toEqual([...EXPECTED_COLUMNS].sort());
  });

  it("links every report to the Root folder via Parent 'a 1'", () => {
    expect(mapEvaluationToNavfit(evalFixture).Parent).toBe("a 1");
    expect(mapEvaluationToNavfit(fitrepFixture).Parent).toBe("a 1");
  });

  it("writes the per-form ReportType discriminator strings", () => {
    expect(mapEvaluationToNavfit(evalFixture).ReportType).toBe("Eval");
    expect(mapEvaluationToNavfit(chiefFixture).ReportType).toBe("Chief");
    expect(mapEvaluationToNavfit(fitrepFixture).ReportType).toBe("FitRep");
  });

  it("emits an explicit boolean for all 17 bit columns on every form", () => {
    for (const fixture of [evalFixture, chiefFixture, fitrepFixture]) {
      const row = mapEvaluationToNavfit(fixture);
      for (const col of BIT_COLUMNS) {
        expect(typeof row[col], `${fixture.report_type} ${col}`).toBe(
          "boolean",
        );
      }
    }
  });

  it("always writes OpsCdr and IsValidated as false", () => {
    const row = mapEvaluationToNavfit(evalFixture);
    expect(row.OpsCdr).toBe(false);
    expect(row.IsValidated).toBe(false);
  });
});

describe("mapEvaluationToNavfit — checkbox fanouts", () => {
  it("fans duty_status out to exactly one of Active/TAR/Inactive/ATADSW", () => {
    const act = mapEvaluationToNavfit(evalFixture);
    expect(act.Active).toBe(true);
    expect(act.TAR).toBe(false);
    expect(act.Inactive).toBe(false);
    expect(act.ATADSW).toBe(false);

    const tar = mapEvaluationToNavfit(fitrepFixture);
    expect(tar.Active).toBe(false);
    expect(tar.TAR).toBe(true);

    const atadsw = mapEvaluationToNavfit(chiefFixture);
    expect(atadsw.ATADSW).toBe(true);
    expect(atadsw.Active).toBe(false);
  });

  it("maps occasion and type-of-report booleans directly", () => {
    const row = mapEvaluationToNavfit(evalFixture);
    expect(row.Periodic).toBe(true);
    expect(row.DetInd).toBe(false);
    expect(row.Frocking).toBe(false);
    expect(row.Special).toBe(false);
    expect(row.NOB).toBe(false);
    expect(row.Regular).toBe(true);
    expect(row.Concurrent).toBe(false);
  });

  it("fans EVAL retention out to exactly one bit", () => {
    const yes = mapEvaluationToNavfit(evalFixture);
    expect(yes.RetentionYes).toBe(true);
    expect(yes.RetentionNo).toBe(false);

    // "Not Recommended" contains "Recommended" — a substring fanout would set both.
    const no = mapEvaluationToNavfit({
      ...evalFixture,
      retention: "Not Recommended",
    });
    expect(no.RetentionYes).toBe(false);
    expect(no.RetentionNo).toBe(true);
  });

  it("always writes RetentionYes/No false on CHIEFEVAL and FITREP", () => {
    for (const fixture of [chiefFixture, fitrepFixture]) {
      const row = mapEvaluationToNavfit(fixture);
      expect(row.RetentionYes, fixture.report_type).toBe(false);
      expect(row.RetentionNo, fixture.report_type).toBe(false);
    }
  });

  it("fans member_statement_intent out to StatementYes/StatementNo", () => {
    const intend = mapEvaluationToNavfit(evalFixture);
    expect(intend.StatementYes).toBe(true);
    expect(intend.StatementNo).toBe(false);

    const doNot = mapEvaluationToNavfit(fitrepFixture);
    expect(doNot.StatementYes).toBe(false);
    expect(doNot.StatementNo).toBe(true);

    const unset = mapEvaluationToNavfit(chiefFixture);
    expect(unset.StatementYes).toBe(false);
    expect(unset.StatementNo).toBe(false);
  });
});

describe("mapEvaluationToNavfit — dates", () => {
  it("keeps true date columns as ISO YYYY-MM-DD strings for the writer", () => {
    const row = mapEvaluationToNavfit(evalFixture);
    expect(row.DateReported).toBe("2024-01-15");
    expect(row.FromDate).toBe("2025-01-16");
    expect(row.ToDate).toBe("2025-12-15");
    expect(row.RaterDate).toBe("2025-12-20");
    expect(row.SeniorRaterDate).toBe("2025-12-21");
  });

  it("leaves unsigned signature dates null", () => {
    const row = mapEvaluationToNavfit(fitrepFixture);
    expect(row.RaterDate).toBeNull();
    expect(row.SeniorRaterDate).toBeNull();
  });

  it("formats ISO DateCounseled to YYMMMDD and passes literals through", () => {
    expect(mapEvaluationToNavfit(evalFixture).DateCounseled).toBe("25JUL17");
    expect(mapEvaluationToNavfit(chiefFixture).DateCounseled).toBe("NOT REQ");
    expect(mapEvaluationToNavfit(fitrepFixture).DateCounseled).toBe("25JAN15");
  });
});

describe("mapEvaluationToNavfit — trait grades (§4.3)", () => {
  it("maps EVAL traits by name and leaves MIS/TAC null", () => {
    const row = mapEvaluationToNavfit(evalFixture);
    expect(row.PROF).toBe(4); // knowledge
    expect(row.QUAL).toBe(3); // work
    expect(row.EO).toBe(5); // eo
    expect(row.MIL).toBe(4); // bearing
    expect(row.PA).toBe(3); // accomplishment
    expect(row.TEAM).toBe(5); // teamwork
    expect(row.LEAD).toBe(4); // leadership
    expect(row.MIS).toBeNull();
    expect(row.TAC).toBeNull();
  });

  it("maps CHIEFEVAL traits positionally (blocks 33-39) and leaves QUAL/PA null", () => {
    const row = mapEvaluationToNavfit(chiefFixture);
    expect(row.LEAD).toBe(5); // block 33 deckplate_leadership
    expect(row.TAC).toBe(1); // block 34 professionalism
    expect(row.PROF).toBe(2); // block 35 mission_accomplishment
    expect(row.MIS).toBe(3); // block 36 human_development
    expect(row.EO).toBe(4); // block 37 eo_climate
    expect(row.TEAM).toBe(0); // block 38 teamwork = NOB
    expect(row.MIL).toBe(3); // block 39 leadership
    expect(row.QUAL).toBeNull();
    expect(row.PA).toBeNull();
  });

  it("maps FITREP traits per the spec block map, ignoring the legacy work alias", () => {
    const row = mapEvaluationToNavfit(fitrepFixture);
    expect(row.PROF).toBe(5); // block 33 knowledge
    expect(row.EO).toBe(4); // block 34 eo — NOT the work decoy (1)
    expect(row.MIL).toBe(3); // block 35 bearing
    expect(row.TEAM).toBe(2); // block 36 teamwork
    expect(row.MIS).toBe(5); // block 37 accomplishment
    expect(row.LEAD).toBe(4); // block 38 leadership
    expect(row.TAC).toBe(3); // block 39 tactical_performance
    expect(row.QUAL).toBeNull();
    expect(row.PA).toBeNull();
  });

  it("encodes NOB as 0 and absent traits as null on a Not Observed report", () => {
    const row = mapEvaluationToNavfit({
      ...evalFixture,
      promotion_recommendation: "NOB",
      trait_grades: {},
      block_values: { ...evalFixture.block_values, not_observed: true },
    });
    expect(row.NOB).toBe(true);
    expect(row.PromotionRecom).toBe(0);
    for (const col of TRAIT_COLUMNS) {
      expect(row[col], col).toBeNull();
    }
  });
});

describe("mapEvaluationToNavfit — scalars and defaults", () => {
  it("encodes PromotionRecom with the §4.4 radio-index codes", () => {
    const codes: [string, number][] = [
      ["NOB", 0],
      ["Significant Problems", 1],
      ["Progressing", 2],
      ["Promotable", 3],
      ["Must Promote", 4],
      ["Early Promote", 5],
    ];
    for (const [rec, code] of codes) {
      const row = mapEvaluationToNavfit({
        ...evalFixture,
        promotion_recommendation: rec,
      });
      expect(row.PromotionRecom, rec).toBe(code);
    }
  });

  it("writes summary group counts as text from summary_group_distribution", () => {
    const row = mapEvaluationToNavfit(evalFixture);
    expect(row.SummarySP).toBe("0");
    expect(row.SummaryProg).toBe("1");
    expect(row.SummaryProm).toBe("4");
    expect(row.SummaryMP).toBe("3");
    expect(row.SummaryEP).toBe("2");
    expect(row.SummaryRank).toBe(0);
  });

  it('falls back to "0" for all five summary counts without a distribution', () => {
    const row = mapEvaluationToNavfit(fitrepFixture);
    for (const col of [
      "SummarySP",
      "SummaryProg",
      "SummaryProm",
      "SummaryMP",
      "SummaryEP",
    ]) {
      expect(row[col], col).toBe("0");
    }
  });

  it("uppercases PromotionStatus", () => {
    expect(mapEvaluationToNavfit(evalFixture).PromotionStatus).toBe("REGULAR");
    expect(mapEvaluationToNavfit(chiefFixture).PromotionStatus).toBe("FROCKED");
  });

  it('always writes RSCA as the decimal string "0.00"', () => {
    expect(mapEvaluationToNavfit(evalFixture).RSCA).toBe("0.00");
  });

  it("never writes SSN, RSSSN, Psswrd, or Suffix", () => {
    const row = mapEvaluationToNavfit(evalFixture);
    expect(row.SSN).toBeNull();
    expect(row.RSSSN).toBeNull();
    expect(row.Psswrd).toBeNull();
    expect(row.Suffix).toBeNull();
  });

  it('maps comment_pitch to a NAVFIT pitch string, defaulting to "10 POINT"', () => {
    expect(mapEvaluationToNavfit(evalFixture).CommentsPitch).toBe("10 POINT");
    // fitrepFixture has no comment_pitch — spec default
    expect(mapEvaluationToNavfit(fitrepFixture).CommentsPitch).toBe("10 POINT");
    const twelve = mapEvaluationToNavfit({
      ...evalFixture,
      block_values: { ...evalFixture.block_values, comment_pitch: "12" },
    });
    expect(twelve.CommentsPitch).toBe("12 POINT");
  });
});

describe("mapEvaluationToNavfit — name splits (§4.7)", () => {
  it("splits member_name into LastName/FirstName/MI and keeps FullName verbatim", () => {
    const row = mapEvaluationToNavfit(evalFixture);
    expect(row.FullName).toBe("SAILOR, AMY B");
    expect(row.LastName).toBe("SAILOR");
    expect(row.FirstName).toBe("AMY");
    expect(row.MI).toBe("B");
    expect(row.Suffix).toBeNull();
  });

  it("leaves MI null when the member name has no single-letter trailing token", () => {
    const noMi = mapEvaluationToNavfit({
      ...evalFixture,
      member_name: "SAILOR, AMY",
    });
    expect(noMi.FirstName).toBe("AMY");
    expect(noMi.MI).toBeNull();

    const twoWord = mapEvaluationToNavfit({
      ...evalFixture,
      member_name: "SAILOR, MARY JO",
    });
    expect(twoWord.FirstName).toBe("MARY JO");
    expect(twoWord.MI).toBeNull();
  });

  it("splits the reporting senior name, dropping the suffix from the splits only", () => {
    const row = mapEvaluationToNavfit(evalFixture);
    expect(row.ReportingSenior).toBe("GRABOWSKI, T R JR");
    expect(row.RSLastName).toBe("GRABOWSKI");
    expect(row.RSFI).toBe("T");
    expect(row.RSMI).toBe("R");
  });

  it("splits a LAST, FI MI counselor and leaves non-matching shapes unsplit", () => {
    const split = mapEvaluationToNavfit(evalFixture);
    expect(split.Counseler).toBe("SMITH, A J");
    expect(split.CounselerLN).toBe("SMITH");
    expect(split.CounselerFI).toBe("A");
    expect(split.CounselerMI).toBe("J");

    const unsplit = mapEvaluationToNavfit(fitrepFixture); // counselor "HM1 SMITH"
    expect(unsplit.Counseler).toBe("HM1 SMITH");
    expect(unsplit.CounselerLN).toBeNull();
    expect(unsplit.CounselerFI).toBeNull();
    expect(unsplit.CounselerMI).toBeNull();
  });
});
