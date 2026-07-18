// tests/integration/navfit98Roundtrip.test.ts
//
// Confirm-it-works test: map real-shaped evaluations, write a NAVFIT 98A
// .accdb via the Java sidecar, then parse the returned file with mdb-reader
// and verify the golden-template invariants from
// docs/specs/navfit98-field-mapping.md §0/§2/§3/§6.
//
// Skips cleanly on hosts without a JRE (isNavfitWriterAvailable → false).
//
// @vitest-environment node

import { spawnSync } from "child_process";
import { describe, it, expect, beforeAll } from "vitest";
import MDBReader from "mdb-reader";
import { mapEvaluationToNavfit } from "@/lib/navfit98/mapEvaluationToNavfit";
import { writeNavfitAccdb } from "@/lib/navfit98/writeAccdb";
import { Evaluation } from "@/types";
import { NavfitReportRow } from "@/lib/navfit98/types";

// Sync probe mirroring isNavfitWriterAvailable (same NAVFIT98_JAVA override) —
// describe.skipIf needs a boolean before registration and this tsconfig's
// target forbids top-level await.
const available =
  spawnSync(process.env.NAVFIT98_JAVA ?? "java", ["-version"]).status === 0;

// Access date columns come back from mdb-reader as JS Dates (midnight, no TZ
// shift) — compared by UTC y/m/d against the mapper's ISO strings.
const DATE_COLUMNS = new Set([
  "DateReported",
  "FromDate",
  "ToDate",
  "RaterDate",
  "SeniorRaterDate",
]);

// Spec §6 invariant 6 — every Yes/No column must round-trip as a non-null boolean.
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
    reporting_senior_address: "USS NEVERSAIL FPO AE 09501",
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
  trait_grades: {
    knowledge: "5.0",
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

describe.skipIf(!available)(
  "NAVFIT 98A .accdb roundtrip (Java sidecar → mdb-reader)",
  () => {
    let evalRow: NavfitReportRow;
    let fitrepRow: NavfitReportRow;
    let reader: MDBReader;

    beforeAll(async () => {
      evalRow = mapEvaluationToNavfit(evalFixture);
      fitrepRow = mapEvaluationToNavfit(fitrepFixture);
      const buffer = await writeNavfitAccdb([evalRow, fitrepRow]);
      reader = new MDBReader(buffer);
    }, 60_000);

    it("contains exactly the two written reports (template sample cleared)", () => {
      const rows = reader.getTable("Reports").getData();
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.ReportType).sort()).toEqual(["Eval", "FitRep"]);
    });

    it("keeps exactly the golden Root row in Folders", () => {
      const folders = reader.getTable("Folders").getData();
      expect(folders).toHaveLength(1);
      expect(folders[0].FolderID).toBe(1);
      expect(folders[0].FolderName).toBe("Root");
      expect(folders[0].Parent).toBe(0);
    });

    it("emits Summary with zero rows", () => {
      expect(reader.getTable("Summary").getData()).toHaveLength(0);
    });

    it("links both reports to the Root folder via Parent 'a 1'", () => {
      const rows = reader.getTable("Reports").getData();
      for (const row of rows) {
        expect(row.Parent).toBe("a 1");
      }
    });

    it("stores every bit column as a non-null boolean on both rows", () => {
      const rows = reader.getTable("Reports").getData();
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        for (const col of BIT_COLUMNS) {
          expect(typeof row[col], `${row.ReportType} ${col}`).toBe("boolean");
        }
      }
    });

    it("round-trips every scalar column of the EVAL row", () => {
      const db = reader
        .getTable("Reports")
        .getData()
        .find((r) => r.ReportType === "Eval");
      expect(db).toBeDefined();

      for (const [col, val] of Object.entries(evalRow)) {
        const stored = db![col];
        if (DATE_COLUMNS.has(col)) {
          if (val === null) {
            expect(stored, col).toBeNull();
            continue;
          }
          expect(stored, col).toBeInstanceOf(Date);
          const d = stored as Date;
          const iso = [
            d.getUTCFullYear(),
            String(d.getUTCMonth() + 1).padStart(2, "0"),
            String(d.getUTCDate()).padStart(2, "0"),
          ].join("-");
          expect(iso, col).toBe(val);
          // Midnight, no timezone shift (spec §4.1)
          expect(d.getUTCHours(), `${col} hours`).toBe(0);
          expect(d.getUTCMinutes(), `${col} minutes`).toBe(0);
        } else {
          expect(stored, col).toEqual(val);
        }
      }

      // Spot-check the values the spec calls out by type
      expect(db!.RSCA, "RSCA decimal").toBe("0.00");
      expect(db!.PROF, "PROF trait int").toBe(4);
      expect(db!.SummaryEP, "SummaryEP text count").toBe("2");
      expect(db!.Comments, "Comments memo").toBe(evalFixture.comments);
      expect(db!.DateCounseled, "DateCounseled text date").toBe("25JUL17");
    });
  },
);
