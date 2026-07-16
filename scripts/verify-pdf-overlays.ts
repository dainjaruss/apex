import fs from "fs";
import path from "path";
import { generateChiefEvalOverlayPdf } from "../lib/chiefEvalOverlay";
import { generateFitrepOverlayPdf } from "../lib/fitrepOverlay";
import { generateOverlayPdf } from "../lib/pdfOverlay";
import { Evaluation } from "../types";

async function verify() {
  console.log("Starting verification of CHIEFEVAL and FITREP PDF Overlays...");

  // Test 1: CHIEFEVAL
  const chiefTemplatePath = path.join(process.cwd(), "public", "chiefEvalBlank.pdf");
  const chiefBuffer = new Uint8Array(fs.readFileSync(chiefTemplatePath));
  const chiefEvalData: Evaluation = {
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

  const chiefPdf = await generateChiefEvalOverlayPdf(chiefEvalData, chiefBuffer);
  console.log(`✓ CHIEFEVAL overlay generated successfully (${chiefPdf.length} bytes)`);
  if (chiefPdf.length < 1000) throw new Error("CHIEFEVAL PDF output too small!");

  const chiefDispatched = await generateOverlayPdf(chiefEvalData, chiefBuffer);
  console.log(`✓ CHIEFEVAL dispatch via generateOverlayPdf verified (${chiefDispatched.length} bytes)`);

  // Test 2: FITREP
  const fitrepTemplatePath = path.join(process.cwd(), "public", "fitrepBlank.pdf");
  const fitrepBuffer = new Uint8Array(fs.readFileSync(fitrepTemplatePath));
  const fitrepData: Evaluation = {
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

  const fitrepPdf = await generateFitrepOverlayPdf(fitrepData, fitrepBuffer);
  console.log(`✓ FITREP overlay generated successfully (${fitrepPdf.length} bytes)`);
  if (fitrepPdf.length < 1000) throw new Error("FITREP PDF output too small!");

  const fitrepDispatched = await generateOverlayPdf(fitrepData, fitrepBuffer);
  console.log(`✓ FITREP dispatch via generateOverlayPdf verified (${fitrepDispatched.length} bytes)`);

  console.log("All PDF overlay verifications passed cleanly!");
}

verify().catch((e) => {
  console.error("Verification failed:", e);
  process.exit(1);
});
