import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { generateChiefEvalOverlayPdf } from "@/lib/chiefEvalOverlay";
import { generateFitrepOverlayPdf } from "@/lib/fitrepOverlay";
import { generateOverlayPdf } from "@/lib/pdfOverlay";
import { Evaluation } from "@/types";

describe("CHIEFEVAL and FITREP PDF Overlays", () => {
  it("generates a valid CHIEFEVAL overlay PDF buffer", async () => {
    const templatePath = path.join(process.cwd(), "public", "chiefEvalBlank.pdf");
    const templateBuffer = new Uint8Array(fs.readFileSync(templatePath));

    const evalData: Evaluation = {
      id: "test-cpo-1",
      created_by: "user-1",
      form_definition_id: "def-1",
      report_type: "CHIEFEVAL",
      member_name: "RAY, ALAN T",
      grade_rate: "ITC",
      designator: "SW/AW",
      dod_id: "1234567890",
      period_from: "2025-01-01",
      period_to: "2025-11-15",
      duty_status: "ACT",
      promotion_status: "REGULAR",
      uic: "N00011",
      ship_station: "USS FRANKLYN",
      trait_grades: {
        deckplate_leadership: "4.0",
        professionalism: "5.0",
        mission_accomplishment: "4.0",
        human_development: "4.0",
        eo_climate: "5.0",
        teamwork: "4.0",
        leadership: "4.0",
      },
      comments: "Outstanding Chief Petty Officer performing at senior level.",
      promotion_recommendation: "Early Promote",
      block_values: {
        reporting_senior_name: "JONES, CARL R",
        reporting_senior_grade: "CDR",
        reporting_senior_designator: "1110",
      },
    } as any;

    const result = await generateChiefEvalOverlayPdf(evalData, templateBuffer);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(1000);
    // Verify dispatcher routes correctly
    const dispatched = await generateOverlayPdf(evalData, templateBuffer);
    expect(dispatched.length).toBeGreaterThan(1000);
  });

  it("generates a valid FITREP overlay PDF buffer", async () => {
    const templatePath = path.join(process.cwd(), "public", "fitrepBlank.pdf");
    const templateBuffer = new Uint8Array(fs.readFileSync(templatePath));

    const evalData: Evaluation = {
      id: "test-off-1",
      created_by: "user-1",
      form_definition_id: "def-2",
      report_type: "FITREP",
      member_name: "JONES, CARL R",
      grade_rate: "CDR",
      designator: "1110",
      dod_id: "0987654321",
      period_from: "2025-01-01",
      period_to: "2025-10-31",
      duty_status: "ACT",
      promotion_status: "REGULAR",
      uic: "N00011",
      ship_station: "USS FRANKLYN",
      trait_grades: {
        knowledge: "5.0",
        work: "4.0",
        eo: "5.0",
        bearing: "5.0",
        accomplishment: "4.0",
        teamwork: "5.0",
        leadership: "5.0",
        tactical_performance: "5.0",
      },
      comments: "Exceptional CO and tactical leader.",
      promotion_recommendation: "Early Promote",
      block_values: {
        reporting_senior_name: "SMITH, JOHN A",
        reporting_senior_grade: "RADM",
        reporting_senior_designator: "1110",
      },
    } as any;

    const result = await generateFitrepOverlayPdf(evalData, templateBuffer);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(1000);
    // Verify dispatcher routes correctly
    const dispatched = await generateOverlayPdf(evalData, templateBuffer);
    expect(dispatched.length).toBeGreaterThan(1000);
  });
});
