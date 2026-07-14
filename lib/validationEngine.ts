// lib/validationEngine.ts
//
// Core validation engine for APEX. Dispatches to the correct Zod schema and
// trait map based on report_type (EVAL, CHIEFEVAL, or FITREP), then runs
// block-level cross-field checks against BUPERSINST 1610.10H.
//

import { Evaluation, ValidationIssue, ValidationResult } from "../types";
import {
  EvalSchema,
  ChiefEvalSchema,
  FitrepSchema,
  STARRED_BILLET_SUBCATEGORIES,
} from "../types/navpers";
import { checkCommentFit, measureTextFit, FIELD_FIT } from "./commentFit";

// Static lookup table mapping field names to NAVPERS block numbers
const fieldBlockMap: Record<string, number> = {
  member_name: 1,
  grade_rate: 2,
  designator: 3,
  dod_id: 4,
  duty_status: 5,
  uic: 6,
  ship_station: 7,
  promotion_status: 8,
  date_reported: 9,
  period_from: 14,
  period_to: 15,
  physical_readiness: 20,
  billet_subcategory: 21,
  reporting_senior_name: 22,
  reporting_senior_grade: 23,
  reporting_senior_designator: 24,
  reporting_senior_title: 25,
  reporting_senior_uic: 26,
  reporting_senior_dod_id: 27,
  command_achievements: 28,
  primary_duty_abbrev: 29,
  primary_duties: 29,
  date_counseled: 30,
  counselor: 31,
  career_recommendations: 41,
  comments: 43,
  promotion_recommendation: 45,
  retention: 47,
};

// Each of the seven performance traits maps to its own NAVPERS block (33-39).
const traitBlockMap: Record<string, number> = {
  knowledge: 33, // Professional Knowledge
  work: 34, // Quality of Work
  eo: 35, // Command or Organizational Climate/Equal Opportunity
  bearing: 36, // Military Bearing/Character
  accomplishment: 37, // Personal Job Accomplishment/Initiative
  teamwork: 38, // Teamwork
  leadership: 39, // Leadership
};

// CPO trait block map — NAVPERS 1616/27 (CHIEFEVAL)
const chiefEvalTraitBlockMap: Record<string, number> = {
  deckplate_leadership: 33,
  professionalism: 34,
  mission_accomplishment: 35,
  human_development: 36,
  eo_climate: 37, // EO/Character gate for CHIEFEVAL
  teamwork: 38,
  leadership: 39,
};

// Officer trait block map — NAVPERS 1610/2 (FITREP)
const fitrepTraitBlockMap: Record<string, number> = {
  knowledge: 33,
  work: 34,
  eo: 35,
  bearing: 36,
  accomplishment: 37,
  teamwork: 38,
  leadership: 39,
  tactical_performance: 39, // Officer-specific 8th trait (shares Block 39 area)
};

/**
 * Maps a Zod schema path string to the corresponding official NAVPERS 1616/26 block number.
 */
export function getBlockForField(field: string): number | undefined {
  if (field.startsWith("trait_grades")) {
    // Path may be "trait_grades" or "trait_grades.<key>" depending on Zod flatten depth.
    const key = field.split(".")[1];
    return (key && traitBlockMap[key]) || 33;
  }
  return fieldBlockMap[field];
}

/**
 * Returns the active trait block map for the given report_type.
 */
function getTraitMap(reportType?: string): Record<string, number> {
  if (reportType === "CHIEFEVAL") return chiefEvalTraitBlockMap;
  if (reportType === "FITREP") return fitrepTraitBlockMap;
  return traitBlockMap;
}

/**
 * Runs complete validation checks against the evaluation record.
 * Dispatches to the appropriate Zod schema based on report_type.
 */
export function runFullValidation(evalData: Evaluation): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // 1. Map current evaluation object to the shape required by the schema
  const isFitrep = evalData.report_type === "FITREP";
  const isChiefEval = evalData.report_type === "CHIEFEVAL";

  const activeTraitMap = getTraitMap(evalData.report_type);

  // Build trait_grades payload from the active trait map keys.
  const traitGradesPayload: Record<string, string> = {};
  Object.keys(activeTraitMap).forEach((k) => {
    traitGradesPayload[k] = (evalData.trait_grades as Record<string, string>)?.[k] || "3.0";
  });

  const validationPayload = {
    member_name: evalData.member_name || "",
    grade_rate: evalData.grade_rate || "",
    designator: evalData.designator || "",
    dod_id: evalData.dod_id || "",
    duty_status: evalData.duty_status || "",
    uic: evalData.uic || "",
    ship_station: evalData.ship_station || "",
    promotion_status: evalData.promotion_status || "",
    period_from: evalData.period_from || "",
    period_to: evalData.period_to || "",
    physical_readiness: evalData.block_values?.physical_readiness || "",
    date_reported: evalData.block_values?.date_reported || "",
    billet_subcategory: evalData.block_values?.billet_subcategory || "",
    reporting_senior_name: evalData.block_values?.reporting_senior_name || "",
    reporting_senior_grade: evalData.block_values?.reporting_senior_grade || "",
    reporting_senior_designator: evalData.block_values?.reporting_senior_designator || "",
    reporting_senior_title: evalData.block_values?.reporting_senior_title || "",
    reporting_senior_uic: evalData.block_values?.reporting_senior_uic || "",
    reporting_senior_dod_id: evalData.block_values?.reporting_senior_dod_id || "",
    command_achievements: evalData.block_values?.command_achievements || "",
    primary_duty_abbrev: evalData.block_values?.primary_duty_abbrev || "",
    primary_duties: evalData.block_values?.primary_duties || "",
    date_counseled: evalData.block_values?.date_counseled || "",
    counselor: evalData.block_values?.counselor || "",
    trait_grades: traitGradesPayload,
    comments: evalData.comments || "",
    career_recommendations: (evalData.career_recommendations || []).filter(
      (r) => (r || "").trim() !== "",
    ),
    promotion_recommendation: evalData.promotion_recommendation || "Promotable",
    // Only EVAL includes retention; CHIEFEVAL and FITREP omit it.
    ...(!isChiefEval && !isFitrep ? { retention: evalData.retention || "Recommended" } : {}),
  };

  // 2. Parse payload using the schema appropriate for this report_type
  const schema = isChiefEval
    ? ChiefEvalSchema
    : isFitrep
      ? FitrepSchema
      : EvalSchema;
  const parsed = schema.safeParse(validationPayload);
  if (!parsed.success) {
    const fieldErrors = parsed.error.flatten().fieldErrors;
    Object.entries(fieldErrors).forEach(([field, messages]) => {
      if (messages && messages.length > 0) {
        errors.push({
          field,
          block: getBlockForField(field),
          message: messages[0],
          severity: "error",
        });
      }
    });
  }

  // 3. Courier narrative comment fit/overflow check (Block 43)
  const pitch = evalData.block_values?.comment_pitch || "10";
  const fitResult = checkCommentFit(evalData.comments || "", pitch);
  if (!fitResult.fit) {
    errors.push({
      field: "comments",
      block: 43,
      message: `Comment text exceeds maximum physical box capacity of ${fitResult.maxLines} lines (currently wrapped to ${fitResult.linesUsed} lines at ${pitch}-pitch).`,
      severity: "error",
    });
  }

  // 4. Designator warning — EVAL and CHIEFEVAL only (officers always have a designator)
  if (!evalData.designator && !isFitrep) {
    warnings.push({
      field: "designator",
      block: 3,
      message: "Designator/Warfare Qual is empty. Ensure this is intentional.",
      severity: "warning",
    });
  }

  const bv = evalData.block_values || {};

  // Block 9 (Date Reported: required + valid past date), Block 21 (valid table 1-1 code),
  // and Block 29A (≤14 chars) are enforced by the Zod schema above. The engine adds the
  // cross-field and multi-select rules Zod can't express, below.

  // 6. Occasion for Report (Blocks 10-13) — multi-select. More than one occasion may
  //    apply, EXCEPT "Special" (13) cannot be combined with another occasion
  //    (BUPERSINST 1610.10H, Enclosure 2).
  const occasionCount = [
    bv.periodic,
    bv.detachment_individual,
    bv.promotion_frocking,
    bv.special,
  ].filter(Boolean).length;
  if (occasionCount === 0) {
    errors.push({
      field: "occasion",
      block: 10,
      message: "Select at least one Occasion for Report (Blocks 10-13).",
      severity: "error",
    });
  } else if (bv.special && occasionCount > 1) {
    errors.push({
      field: "occasion",
      block: 13,
      message:
        "Special (Block 13) cannot be combined with another occasion. Do not submit a Special report if another occasion applies (BUPERSINST 1610.10H).",
      severity: "error",
    });
  }

  // 7. Type of Report (Blocks 16-18) — multi-select. Not Observed (16), Regular (17),
  //    Concurrent (18). Combinations are valid (e.g., a Concurrent/Regular report
  //    marks both 17 and 18).
  const typeCount = [
    bv.not_observed,
    bv.regular_report,
    bv.concurrent_report,
  ].filter(Boolean).length;
  if (typeCount === 0) {
    errors.push({
      field: "type",
      block: 16,
      message: "Select at least one Type of Report (Blocks 16-18).",
      severity: "error",
    });
  }
  // A wholly Not Observed (Block 16) report has strict downstream constraints.
  if (bv.not_observed) {
    warnings.push({
      field: "type",
      block: 16,
      message:
        "Not Observed (Block 16): trait grades must be left blank and the promotion recommendation must be NOB (BUPERSINST 1610.10H, ch. 6).",
      severity: "warning",
    });
  }

  // 8. Fixed-width narrative fit (Blocks 28, 29B, 44, 48) — uses the same wrap as the
  //    on-screen measuring canvas and the PDF renderer so all three agree.
  (
    [
      ["command_achievements", bv.command_achievements],
      ["primary_duties", bv.primary_duties],
      ["qualifications", bv.qualifications],
      ["reporting_senior_address", bv.reporting_senior_address],
    ] as [string, string | undefined][]
  ).forEach(([field, value]) => {
    const spec = FIELD_FIT[field];
    const fit = measureTextFit(
      value || "",
      spec.charsPerLine,
      spec.maxLines,
      spec.firstLineLead ?? 0,
    );
    if (!fit.fit) {
      errors.push({
        field,
        block: spec.block,
        message: `${spec.label} (Block ${spec.block}) exceeds ${spec.maxLines} line(s) at ${spec.charsPerLine} chars/line (currently ${fit.linesUsed} lines).`,
        severity: "error",
      });
    }
  });

  // 9. Block 21 ↔ Block 29 match — standard billet subcategories annotated with an
  //     "*" in table 1-1 (CRF, CANVASSER, RESIDENT, INTERN, STUDENT) should match an
  //     entry in Block 29 (BUPERSINST 1610.10H, page 1-8). "Should," so this warns.
  const subcategory = (bv.billet_subcategory || "").toUpperCase().trim();
  if (
    (STARRED_BILLET_SUBCATEGORIES as readonly string[]).includes(subcategory)
  ) {
    const block29 =
      `${bv.primary_duty_abbrev || ""} ${bv.primary_duties || ""}`.toUpperCase();
    // Word-boundary match so e.g. INTERN does not spuriously satisfy "INTERNATIONAL".
    if (!new RegExp(`\\b${subcategory}\\b`).test(block29)) {
      warnings.push({
        field: "billet_subcategory",
        block: 21,
        message: `Billet subcategory "${subcategory}" (Block 21) is a starred standard subcategory and should match an entry in Block 29 (BUPERSINST 1610.10H). Add "${subcategory}" to Block 29.`,
        severity: "warning",
      });
    }
  }

  // 10. Block 43 substantiation (BUPERSINST 1610.10H / form footnote): a 1.0 in any trait,
  //     three or more 2.0 marks, or a 2.0 in Block 35 (Command/Org Climate/EO) must be
  //     specifically substantiated in the Block 43 comments. We can verify presence, not
  //     prose — so empty comments with a triggering mark is a hard error, while present
  //     comments yield a warning naming the marks the rater must address. NOB reports
  //     leave traits blank, so the rule does not apply.
  const grades = (evalData.trait_grades || {}) as Record<string, string>;
  const onesBlocks = (Object.keys(traitBlockMap) as string[])
    .filter((k) => grades[k] === "1.0")
    .map((k) => `Block ${traitBlockMap[k]}`);
  const twoCount = (Object.keys(traitBlockMap) as string[]).filter(
    (k) => grades[k] === "2.0",
  ).length;

  const substReasons: string[] = [];
  if (onesBlocks.length)
    substReasons.push(`a 1.0 mark in ${onesBlocks.join(", ")}`);
  if (twoCount >= 3)
    substReasons.push(`three or more 2.0 marks (${twoCount} present)`);
  if (grades.eo === "2.0")
    substReasons.push("a 2.0 in Block 35 (Command/Organizational Climate/EO)");

  const substApplies =
    substReasons.length > 0 &&
    evalData.promotion_recommendation !== "NOB" &&
    !bv.not_observed;
  if (substApplies) {
    const reasonText = substReasons.join("; ");
    if (!(evalData.comments || "").trim()) {
      errors.push({
        field: "comments",
        block: 43,
        message: `Block 43 comments must specifically substantiate ${reasonText} (BUPERSINST 1610.10H), but comments are empty.`,
        severity: "error",
      });
    } else {
      warnings.push({
        field: "comments",
        block: 43,
        message: `Block 43 comments must specifically substantiate ${reasonText} (BUPERSINST 1610.10H). Comments must be verifiable.`,
        severity: "warning",
      });
    }
  }

  // 11. Each trait must be graded (1.0-5.0 or NOB) on an observed report.
  //     Uses the active trait map for the current form type.
  if (!bv.not_observed) {
    const tg = (evalData.trait_grades || {}) as Record<string, string | undefined>;
    Object.keys(activeTraitMap).forEach((key) => {
      if (!tg[key]) {
        errors.push({
          field: `trait_grades.${key}`,
          block: activeTraitMap[key],
          message: `Trait must be graded 1.0–5.0 or NOB (Block ${activeTraitMap[key]}).`,
          severity: "error",
        });
      }
    });
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Formats a validation result into a readable plain-text report.
 */
export function generateErrorReport(result: ValidationResult): string {
  if (result.success && result.warnings.length === 0) {
    return "✓ Validation Complete: All rules satisfied. Ready for final export.";
  }

  const lines: string[] = [];

  if (result.errors.length > 0) {
    lines.push(`=== Validation Errors (${result.errors.length}) ===`);
    result.errors.forEach((err) => {
      const blockStr = err.block ? `[Block ${err.block}]` : "[General]";
      lines.push(`  • ${blockStr} ${err.message}`);
    });
  }

  if (result.warnings.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`=== Validation Warnings (${result.warnings.length}) ===`);
    result.warnings.forEach((warn) => {
      const blockStr = warn.block ? `[Block ${warn.block}]` : "[General]";
      lines.push(`  • ${blockStr} ${warn.message}`);
    });
  }

  return lines.join("\n");
}
