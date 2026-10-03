// src/hooks/useFinalValidation.ts
//
// React hook for executing full BUPERSINST 1610.10H pre-flight validation checks on demand.
// Powers the "Verify Rules" button and final sign-off inspection gate.

import { useState } from "react";
import { Evaluation, ValidationIssue, ValidationResult } from "@/types";
import { runFullValidation } from "@/lib/validationEngine";

export function useFinalValidation() {
  const [isValidating, setIsValidating] = useState(false);
  const [errors, setErrors] = useState<ValidationIssue[]>([]);
  const [warnings, setWarnings] = useState<ValidationIssue[]>([]);
  const [hasChecked, setHasChecked] = useState(false);

  const runCheck = async (evalData: Evaluation): Promise<ValidationResult> => {
    setIsValidating(true);
    // Brief processing pause for authentic military verification audit feel
    await new Promise((resolve) => setTimeout(resolve, 350));

    const result = runFullValidation(evalData);
    setErrors(result.errors);
    setWarnings(result.warnings);
    setHasChecked(true);
    setIsValidating(false);

    return result;
  };

  return {
    isValidating,
    errors,
    warnings,
    isValid: hasChecked && errors.length === 0,
    hasChecked,
    runCheck,
  };
}
