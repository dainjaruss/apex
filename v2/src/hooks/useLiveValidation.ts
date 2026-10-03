// src/hooks/useLiveValidation.ts
//
// Dynamic React hook executing live, synchronous in-form validation schema checks
// on every keystroke by dispatching to the core BUPERSINST 1610.10H / Zod engine.

import { useMemo } from "react";
import { Evaluation, ValidationIssue, ValidationResult } from "@/types";
import { runFullValidation } from "@/lib/validationEngine";

export function useLiveValidation(evalData: Evaluation) {
  const result: ValidationResult = useMemo(() => {
    if (!evalData) {
      return {
        success: true,
        errors: [],
        warnings: [],
      };
    }
    return runFullValidation(evalData);
  }, [
    evalData.member_name,
    evalData.grade_rate,
    evalData.designator,
    evalData.dod_id,
    evalData.duty_status,
    evalData.uic,
    evalData.ship_station,
    evalData.promotion_status,
    evalData.period_from,
    evalData.period_to,
    evalData.comments,
    evalData.promotion_recommendation,
    evalData.retention,
    evalData.report_type,
    evalData.trait_grades,
    evalData.block_values,
    evalData.career_recommendations,
    evalData.updated_at,
    evalData,
  ]);

  return {
    isValid: result.errors.length === 0,
    errors: result.errors,
    warnings: result.warnings,
    allIssues: [...result.errors, ...result.warnings],
    zodIssues: result.errors.filter((i) => i.field !== "comments"),
    commentIssues: result.errors.filter((i) => i.field === "comments"),
  };
}
