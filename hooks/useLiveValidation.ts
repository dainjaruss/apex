// hooks/useLiveValidation.ts
//
// Dynamic React hook executing live, in-form validation schema evaluations
// by calling the core validation engine.
//

import { useState, useEffect } from "react";
import { Evaluation, ValidationIssue } from "@/types";
import { runFullValidation } from "@/lib/validationEngine";

/**
 * Custom React hook that runs validation against an evaluation draft on change.
 */
export function useLiveValidation(evalData: Evaluation) {
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [warnings, setWarnings] = useState<ValidationIssue[]>([]);

  useEffect(() => {
    if (!evalData) return;

    const result = runFullValidation(evalData);
    setIssues(result.errors);
    setWarnings(result.warnings);
  }, [evalData]);

  const allIssues = [...issues, ...warnings];

  return {
    isValid: issues.length === 0,
    issues: allIssues,
    zodIssues: issues.filter((i) => i.field !== "comments"),
    commentIssues: issues.filter((i) => i.field === "comments"),
    warnings,
  };
}
