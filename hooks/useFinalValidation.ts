// hooks/useFinalValidation.ts
//
// React hook for executing full validation checks on-demand.
//

import { useState } from "react";
import { Evaluation, ValidationIssue } from "@/types";
import { runFullValidation } from "@/lib/validationEngine";

export function useFinalValidation() {
  const [isValidating, setIsValidating] = useState(false);
  const [errors, setErrors] = useState<ValidationIssue[]>([]);
  const [warnings, setWarnings] = useState<ValidationIssue[]>([]);
  const [hasChecked, setHasChecked] = useState(false);

  const runCheck = async (evalData: Evaluation) => {
    setIsValidating(true);
    // Simulate brief processing time for user feedback
    await new Promise((resolve) => setTimeout(resolve, 300));

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
