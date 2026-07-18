// lib/navfit98/validateNavfitExport.ts
//
// NAVFIT-specific export gate (spec §6, hard failures 3-5) layered on top of
// runFullValidation: Access length caps tighter than APEX's own, trait/NOB
// consistency, exclusive checkbox groups. Rejects — never truncates (a truncated
// official record is worse than no record). The runFullValidation re-run and the
// completed-status gate (§6 items 1-2) belong to the export API route, not here.
// Spec: docs/specs/navfit98-field-mapping.md

import { Evaluation, ValidationIssue } from "@/types";
import { getBlockForField } from "@/lib/validationEngine";
import {
  DUTY_STATUS_OPTIONS,
  PROMOTION_RECOMMENDATIONS,
  RETENTION_OPTIONS,
} from "@/types/navpers";
import { NavfitValidationResult } from "./types";
import { NAVFIT_TRAIT_MAP } from "./constants";
import { formatNavpersDate } from "./mapEvaluationToNavfit";

const VALID_GRADES = new Set(["1.0", "2.0", "3.0", "4.0", "5.0", "NOB"]);

export function validateNavfitExport(
  evaluation: Evaluation,
): NavfitValidationResult {
  const errors: ValidationIssue[] = [];
  const bv = evaluation.block_values || {};
  const err = (field: string, block: number | undefined, message: string) =>
    errors.push({ field, block, message, severity: "error" });

  // §6.3 — Access length caps tighter than APEX's own.
  // [field, value, NAVFIT column, max chars, block for fields outside the
  //  validationEngine field→block map (signature blocks per lib/signatures.ts)]
  const caps: [string, string | undefined, string, number, number?][] = [
    ["member_name", evaluation.member_name, "FullName", 27],
    ["grade_rate", evaluation.grade_rate, "Rate", 5],
    ["ship_station", evaluation.ship_station, "ShipStation", 18],
    ["physical_readiness", bv.physical_readiness, "PhysicalReadiness", 4],
    ["billet_subcategory", bv.billet_subcategory, "BilletSubcat", 10],
    ["reporting_senior_name", bv.reporting_senior_name, "ReportingSenior", 18],
    // APEX allows 22 here (COUNSELOR_MAX); NAVFIT's column holds 20 — reject 21-22.
    ["counselor", bv.counselor, "Counseler", 20],
    ["rater_signature", bv.rater_signature, "Rater", 28, 42],
    ["senior_rater_signature", bv.senior_rater_signature, "SeniorRater", 28, 49],
    // Columns whose caps neither APEX validation nor the rows above cover —
    // without these a long value only fails inside the Java sidecar (a 500,
    // not a block-numbered 422).
    ["uic", evaluation.uic, "UIC", 5],
    ["designator", evaluation.designator, "Desig", 12],
    ["promotion_status", evaluation.promotion_status, "PromotionStatus", 8],
    ["reporting_senior_grade", bv.reporting_senior_grade, "RSGrade", 5],
    ["reporting_senior_designator", bv.reporting_senior_designator, "RSDesig", 5],
    ["reporting_senior_title", bv.reporting_senior_title, "RSTitle", 14],
    ["reporting_senior_uic", bv.reporting_senior_uic, "RSUIC", 5],
    ["primary_duty_abbrev", bv.primary_duty_abbrev, "PrimaryDuty", 14],
    // Checked post-transform: ISO input becomes YYMMMDD (7 chars); anything
    // that still exceeds 8 (e.g. a malformed date) must be fixed, not truncated.
    ["date_counseled", formatNavpersDate(bv.date_counseled), "DateCounseled", 8, 30],
  ];
  for (const [field, value, column, max, block] of caps) {
    if (value && value.length > max) {
      err(
        field,
        block ?? getBlockForField(field),
        `Value is ${value.length} characters but NAVFIT column ${column} holds at most ${max}. Shorten it — the export rejects rather than truncates.`,
      );
    }
  }

  (evaluation.career_recommendations || []).forEach((rec, i) => {
    if (rec && rec.length > 20) {
      err(
        "career_recommendations",
        getBlockForField("career_recommendations"),
        `Career recommendation ${i + 1} is ${rec.length} characters; NAVFIT allows at most 20 (Block 41).`,
      );
    }
  });

  // §6.3 — summary counts must fit NAVFIT's Text(3) columns
  for (const [category, n] of Object.entries(
    evaluation.summary_group_distribution || {},
  )) {
    if (n > 999) {
      err(
        "summary_group_distribution",
        46,
        `Summary group count for "${category}" (${n}) exceeds NAVFIT's 3-digit limit (Block 46).`,
      );
    }
  }

  // §6.4 — trait/NOB consistency for this report type's blocks 33-39: every trait
  // is 1.0-5.0 or NOB; ungraded only when the report is Not Observed (Block 16).
  const tg = (evaluation.trait_grades || {}) as Record<
    string,
    string | undefined
  >;
  for (const { block, key } of NAVFIT_TRAIT_MAP[evaluation.report_type]) {
    const grade = tg[key];
    if (!grade) {
      if (!bv.not_observed) {
        err(
          `trait_grades.${key}`,
          block,
          `Trait (Block ${block}) is ungraded; NAVFIT export requires 1.0-5.0 or NOB unless the report is Not Observed.`,
        );
      }
    } else if (!VALID_GRADES.has(grade)) {
      err(
        `trait_grades.${key}`,
        block,
        `Trait grade "${grade}" (Block ${block}) is not a NAVFIT value (1.0-5.0 or NOB).`,
      );
    }
  }

  // PromotionRecom is a radio index 0-5 with no "unset" representation; a null
  // here would silently export as 0 = NOB on an observed report. runFullValidation
  // masks a null by defaulting its payload to "Promotable", so gate it here.
  if (
    !(PROMOTION_RECOMMENDATIONS as readonly string[]).includes(
      evaluation.promotion_recommendation || "",
    )
  ) {
    err(
      "promotion_recommendation",
      getBlockForField("promotion_recommendation"),
      `Promotion recommendation "${evaluation.promotion_recommendation || ""}" must be set to one of the Block 45 categories before NAVFIT export (an unset value would export as NOB).`,
    );
  }

  // §6.5 — exclusive checkbox groups. Duty status must map to exactly one of the
  // four Active/TAR/Inactive/AT-ADSW bits (rows 11-14).
  if (
    !(DUTY_STATUS_OPTIONS as readonly string[]).includes(
      evaluation.duty_status || "",
    )
  ) {
    err(
      "duty_status",
      getBlockForField("duty_status"),
      `Duty status "${evaluation.duty_status || ""}" does not map to exactly one NAVFIT checkbox (ACT, TAR, INACT, or AT/ADOS) (Block 5).`,
    );
  }

  // Statement intent: both bits zero is allowed only when unset; a set intent must
  // parse to exactly one of StatementYes/StatementNo (same parse as the PDF overlay).
  const stmt: string = (bv.member_statement_intent || "").toUpperCase();
  if (stmt && !stmt.includes("NOT") && !stmt.includes("INTEND")) {
    err(
      "member_statement_intent",
      51, // Block 51 member statement
      `Member statement intent "${bv.member_statement_intent}" maps to neither the Intend nor the Do-Not-Intend checkbox (Block 51).`,
    );
  }

  // EVAL only: exactly one of RetentionYes/RetentionNo (CHIEFEVAL/FITREP have no
  // retention block; the mapper writes 0/0 there).
  if (
    evaluation.report_type === "EVAL" &&
    !(RETENTION_OPTIONS as readonly string[]).includes(evaluation.retention || "")
  ) {
    err(
      "retention",
      getBlockForField("retention"),
      `Retention must be "Recommended" or "Not Recommended" to set exactly one NAVFIT retention checkbox (Block 47).`,
    );
  }

  return { ok: errors.length === 0, errors };
}
