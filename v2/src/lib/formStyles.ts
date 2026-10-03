/** Mockup 2 form styling — shared across eval wizard blocks. */

/** Stable id for label/htmlFor association (EVAL / CHIEFEVAL / FITREP wizard). */
export function evalFieldId(key: string): string {
  return `eval-field-${key.replace(/[^a-zA-Z0-9_]+/g, "-")}`;
}

export const FORM_PANEL = "apex-form-panel space-y-6";
export const FORM_LABEL = "apex-label mb-1.5";
export const FORM_SUBLABEL = "apex-label mb-1.5 text-[10px]";
export const FORM_SECTION_TITLE =
  "text-base font-bold gold-accent mb-4 pb-2 border-b flex items-center gap-2";
export const FORM_SECTION_BORDER = "border-[var(--border)]";

export function formFieldClass(hasError?: boolean): string {
  return `apex-input ${hasError ? "!border-red-500/80 focus:!border-red-400" : ""}`;
}

export function formSelectClass(hasError?: boolean): string {
  return formFieldClass(hasError);
}

export function formFieldsetClass(hasError?: boolean): string {
  return `rounded-lg border p-3 apex-form-fieldset ${hasError ? "border-red-500/70" : ""}`;
}
