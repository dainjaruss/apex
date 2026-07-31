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
import {
  checkCommentFit,
  measureTextFit,
  FIELD_FIT,
  getPrimaryDutiesFieldFit,
  resolveCommentPitch,
} from "./commentFit";
import { getCommentsBlock } from "./traitStandards";

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

// CPO trait block map — NAVPERS 1616/27 (CHIEFEVAL, REV 05-2025), transcribed from
// public/chiefEvalBlank.pdf. See lib/traitStandards.ts / docs/navy-reference.md §3.1.
const chiefEvalTraitBlockMap: Record<string, number> = {
  technical_mastery: 33,
  institutional_expertise: 34,
  professionalism: 35,
  integrity: 36,
  // 1610.10H Encl (2) ch. 1, p. 1-16: "Command or Organizational Climate and Equal
  // Opportunity (FITREP/EVAL) and Accountability (CHIEFEVAL) must be evaluated as
  // 3.0 or higher to maintain eligibility for advancement and receive a
  // recommendation of Promotable." On 1616/27 that gate is Block 37 ACCOUNTABILITY —
  // there is no separately-named EO trait on the E7–E9 form (navy-reference §3.2).
  accountability: 37,
  deckplate_leadership: 38,
  team_effectiveness: 39,
};

// Officer trait block map — the seven traits printed at Blocks 33–39 of
// NAVPERS 1610/2 (REV 05-2025). Source: public/fitrepBlank.pdf.
const fitrepTraitBlockMap: Record<string, number> = {
  knowledge: 33, // PROFESSIONAL EXPERTISE
  eo: 34, // COMMAND OR ORGANIZATIONAL CLIMATE (substantiation footnote Block 34)
  bearing: 35, // MILITARY BEARING/CHARACTER
  teamwork: 36, // TEAMWORK
  accomplishment: 37, // MISSION ACCOMPLISHMENT AND INITIATIVE
  leadership: 38, // LEADERSHIP
  tactical_performance: 39, // TACTICAL PERFORMANCE (warfare qualified officers only)
};

/**
 * Maps a Zod schema path string to the corresponding official NAVPERS 1616/26 block number.
 */
export function getBlockForField(field: string): number | undefined {
  if (field.startsWith("trait_grades")) {
    // Path may be "trait_grades" or "trait_grades.<key>" depending on Zod flatten depth.
    const key = field.split(".")[1];
    return (
      (key &&
        (traitBlockMap[key] ||
          chiefEvalTraitBlockMap[key] ||
          fitrepTraitBlockMap[key])) ||
      33
    );
  }
  return fieldBlockMap[field];
}

/**
 * Returns the active trait block map for the given report_type.
 *
 * Exported because it is the ONLY report-type-aware trait→block mapping in the
 * repo. `TRAIT_STANDARDS_LOOKUP` merges all three forms into one flat record, so
 * its `block` field collides where forms disagree — on FITREP `leadership` is
 * Block 38 and `tactical_performance` is Block 39, but the merged lookup reports
 * 39 for both. Anything rendering a block number next to a trait must resolve it
 * here, not from the merged table.
 */
export function getTraitMap(reportType?: string): Record<string, number> {
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

  // Only include trait grades the rater has set — blank traits stay ungraded (rule 11).
  const traitGradesPayload: Record<string, string> = {};
  Object.keys(activeTraitMap).forEach((k) => {
    const v = (evalData.trait_grades as Record<string, string | undefined>)?.[k];
    if (v) traitGradesPayload[k] = v;
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
    for (const issue of parsed.error.issues) {
      const field = issue.path.join(".");
      const uiField = field.replace(
        /^career_recommendations\.\d+$/,
        "career_recommendations",
      );
      errors.push({
        field: uiField,
        block: getBlockForField(uiField),
        message: issue.message,
        severity: "error",
      });
    }
  }

  // 3. Courier narrative comment fit/overflow check. Capacity AND block number are both
  //    per form: EVAL 43 / CHIEFEVAL 40 / FITREP 41, and 14 / 6 / 16 lines at 10-pitch.
  //    This used to check every form against the EVAL's line count and label the error
  //    "Block 43", so a CHIEFEVAL passed validation at 18 lines and the printed form
  //    silently dropped ten of them.
  //    resolveCommentPitch, not block_values.comment_pitch: a draft saved before the
  //    pitch-label fix means something different by "10" and must be read as 12-pitch.
  const pitch = resolveCommentPitch(evalData.block_values);
  const fitResult = checkCommentFit(
    evalData.comments || "",
    pitch,
    evalData.report_type,
  );
  if (!fitResult.fit) {
    const commentsBlock = getCommentsBlock(evalData.report_type);
    errors.push({
      field: "comments",
      block: commentsBlock,
      message: `Comment text exceeds the physical capacity of Block ${commentsBlock} on this form — ${fitResult.maxLines} lines at ${pitch}-pitch (currently wrapped to ${fitResult.linesUsed}). Anything past line ${fitResult.maxLines} will not print.`,
      severity: "error",
    });
  }

  // 4. Designator — enlisted/CPO: optional warfare qual (warn if blank). Officers: required in Zod.
  if (!isFitrep && !evalData.designator) {
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
  const primaryDutiesSpec = getPrimaryDutiesFieldFit(evalData.report_type);
  (
    [
      ["command_achievements", bv.command_achievements, FIELD_FIT.command_achievements],
      ["primary_duties", bv.primary_duties, primaryDutiesSpec],
      ["qualifications", bv.qualifications, FIELD_FIT.qualifications],
      [
        "reporting_senior_address",
        bv.reporting_senior_address,
        FIELD_FIT.reporting_senior_address,
      ],
    ] as [string, string | undefined, (typeof FIELD_FIT)[string]][]
  ).forEach(([field, value, spec]) => {
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
        message: `${spec.label} (Block ${field === "primary_duties" ? "29B" : spec.block}) exceeds ${spec.maxLines} line(s) at ${spec.charsPerLine} chars/line (currently ${fit.linesUsed} lines).`,
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
  const traitKeys = Object.keys(activeTraitMap) as string[];
  // The instruction counts TRAITS, and a trait is a block on the form — so count distinct
  // blocks, not map keys. The FITREP map has eight keys for seven blocks (the legacy `work`
  // key and `eo` both address Block 34), which would otherwise let one physical trait be
  // tallied twice and named twice in the message.
  const blocksGraded = (grade: string) =>
    Array.from(
      new Set(
        traitKeys
          .filter((k) => grades[k] === grade)
          .map((k) => `Block ${activeTraitMap[k]}`),
      ),
    );
  const onesBlocks = blocksGraded("1.0");
  const twoBlocks = blocksGraded("2.0");
  const twoCount = twoBlocks.length;

  const substReasons: string[] = [];
  const eoKey = isChiefEval ? "accountability" : "eo";
  const eoBlock = isChiefEval ? 37 : isFitrep ? 34 : 35;

  if (isChiefEval) {
    // NAVPERS 1616/27 (REV 05-2025) footnote: all 1.0 and all 2.0 marks in Blocks 33–39.
    if (onesBlocks.length)
      substReasons.push(`a 1.0 mark in ${onesBlocks.join(", ")}`);
    if (twoBlocks.length)
      substReasons.push(
        `2.0 mark(s) in ${twoBlocks.join(", ")} (CHIEFEVAL requires substantiation for every 2.0)`,
      );
  } else if (isFitrep) {
    // NAVPERS 1610/2 footnote: 1.0 marks, three+ 2.0 marks, and 2.0 in Block 34 (climate/EO).
    if (onesBlocks.length)
      substReasons.push(`a 1.0 mark in ${onesBlocks.join(", ")}`);
    if (twoCount >= 3)
      substReasons.push(`three or more 2.0 marks (${twoCount} present)`);
    if (grades[eoKey] === "2.0")
      substReasons.push(
        `a 2.0 in Block ${eoBlock} (Command or Organizational Climate/EO)`,
      );
  } else {
    if (onesBlocks.length)
      substReasons.push(`a 1.0 mark in ${onesBlocks.join(", ")}`);
    if (twoCount >= 3)
      substReasons.push(`three or more 2.0 marks (${twoCount} present)`);
    if (grades[eoKey] === "2.0")
      substReasons.push(
        `a 2.0 in Block ${eoBlock} (Command/Organizational Climate/EO)`,
      );
  }

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

  // 12. Three or more 2.0 trait grades bar Promotable outright.
  //     BUPERSINST 1610.10H, Encl (2), ch. 1, para 1-2, p. 1-16 ("EVAL BLOCK 45 /
  //     [FITREP/CHIEFEVAL] BLOCK 48"), verbatim:
  //       "A Promotable promotion recommendation allows up to two traits, excluding Character
  //        or Equal Opportunity to be assessed as Progressing (2.0) and still maintain an
  //        overall evaluation and promotion recommendation of Promotable. This means a member
  //        who receives one or two 2.0 trait grades cannot receive a promotion recommendation
  //        higher than Promotable."
  //     "Up to two" therefore means a THIRD 2.0 removes Promotable itself — the case the Zod
  //     refinement (`refinePromotionRecommendation`) never covered: it caps at Promotable for
  //     any 2.0 but never bars Promotable on count.
  //     Every trait is counted, i.e. "excluding Character or Equal Opportunity" is read as
  //     naming which traits the two-mark allowance covers, not as removing them from the tally.
  //     The other reading gives the same verdict on every input, because a 2.0 in Character or
  //     Climate/EO is already barred at ONE mark by the Zod gate — so nothing turns on it.
  //     (Weak support, not proof: Encl (1), para 13a, p. 9 writes the threshold as a bare
  //     "three 2.0 grades". That is a substantiation requirement rather than a promotion bar,
  //     and it lists Character/Climate-EO separately, which arguably cuts the other way.)
  //     (Not cited: Encl (2) para 6-3 uses the same "three 2.0 trait grades" wording but is
  //     scoped to Observed reports carrying an NOB promotion recommendation — a case this
  //     rule excludes via `!bv.not_observed`.)
  //     Same threshold and same `twoCount` already used by the Block 43 substantiation rule.
  if (
    twoCount >= 3 &&
    !bv.not_observed &&
    ["Promotable", "Must Promote", "Early Promote"].includes(
      evalData.promotion_recommendation,
    )
  ) {
    errors.push({
      field: "promotion_recommendation",
      block: 45,
      message: `${twoCount} trait grades of 2.0 (${twoBlocks.join(", ")}) bar a promotion recommendation of Promotable or higher — a Promotable recommendation allows at most two 2.0 trait grades (BUPERSINST 1610.10H, Encl (2), ch. 1, p. 1-16).`,
      severity: "error",
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
