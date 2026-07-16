// components/blocks/EvaluationFormParts/Block1Admin.tsx
//
// Blocks 1‑32: Identity, command context, and reporting senior fields.

import React from "react";
import Block1Name from "@/components/blocks/Block1Name";
import BupersGuidelinesInline from "@/components/blocks/BupersGuidelinesInline";
import MeasuredCourierField from "@/components/blocks/MeasuredCourierField";
import { Evaluation, ValidationIssue } from "@/types";
import {
  BILLET_SUBCATEGORY_OPTIONS,
  STARRED_BILLET_SUBCATEGORIES,
  COUNSELOR_MAX,
} from "@/types/navpers";
import {
  FIELD_FIT,
  PRIMARY_DUTY_ABBREV_MAX,
  getPrimaryDutiesFieldFit,
} from "@/lib/commentFit";

type Props = {
  evalData: Evaluation;
  onChange: (fields: Partial<Evaluation>) => void;
  issues: ValidationIssue[];
  handleBlockValueChange: (fields: Record<string, any>) => void;
  onFocusField?: (field: string | null) => void;
  activeField?: string | null;
};

// Fields covered by the inline BUPERS guideline banner in the command/RS section.
const COMMAND_SECTION_FIELDS = [
  "physical_readiness",
  "billet_subcategory",
  "reporting_senior_name",
  "reporting_senior_grade",
  "reporting_senior_designator",
  "reporting_senior_title",
  "reporting_senior_uic",
  "reporting_senior_dod_id",
  "command_achievements",
  "primary_duties",
  "date_counseled",
  "counselor",
];

import {
  FORM_PANEL,
  FORM_LABEL,
  FORM_SUBLABEL,
  FORM_SECTION_TITLE,
  formFieldClass,
  evalFieldId,
} from "@/lib/formStyles";

export default function Block1Admin({
  evalData,
  onChange,
  issues,
  handleBlockValueChange,
  onFocusField,
  activeField,
}: Props) {
  return (
    <div className={FORM_PANEL}>
      <h2 className="apex-form-wizard-section-title">
        <span
          className="h-2 w-2 rounded-full bg-[var(--accent-cyan)]"
          aria-hidden
        />
        Administrative Info
      </h2>
      <Block1Name
        evalData={evalData}
        onChange={onChange}
        issues={issues}
        onFocusField={onFocusField}
        activeField={activeField}
      />
      <CommandDetailsSection
        evalData={evalData}
        issues={issues}
        handleBlockValueChange={handleBlockValueChange}
        onFocusField={onFocusField}
        activeField={activeField}
      />
    </div>
  );
}

/* ── Sub‑helpers ─────────────────────────────────── */

/** Data‑driven text input row for block_values fields. */
function BlockInput({
  label,
  fieldKey,
  placeholder,
  evalData,
  handleBlockValueChange,
  maxLength,
  transform = "uppercase",
  issues,
  onFocusField,
}: {
  label: string;
  fieldKey: string;
  placeholder: string;
  evalData: Evaluation;
  handleBlockValueChange: (f: Record<string, any>) => void;
  maxLength?: number;
  transform?: "uppercase" | "digits" | "pfa" | "none";
  issues: ValidationIssue[];
  onFocusField?: (field: string | null) => void;
}) {
  const xform = (v: string) => {
    if (transform === "uppercase") return v.toUpperCase();
    if (transform === "digits") return v.replace(/[^0-9]/g, "");
    // Block 20 PFA codes: uppercase and strip anything that isn't a valid code.
    if (transform === "pfa") return v.toUpperCase().replace(/[^PBFMWN]/g, "");
    return v;
  };

  const hasError = issues.some(
    (i) => i.field === fieldKey && i.severity === "error",
  );

  const inputId = evalFieldId(`bv-${fieldKey}`);
  return (
    <div>
      <label className={FORM_LABEL} htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        type="text"
        placeholder={placeholder}
        maxLength={maxLength}
        value={evalData.block_values?.[fieldKey] || ""}
        onChange={(e) =>
          handleBlockValueChange({ [fieldKey]: xform(e.target.value) })
        }
        onFocus={() => onFocusField?.(fieldKey)}
        className={formFieldClass(hasError)}
      />
      {hasError && (
        <p className="apex-text-field-error text-xs mt-1">
          {
            issues.find((i) => i.field === fieldKey && i.severity === "error")
              ?.message
          }
        </p>
      )}
    </div>
  );
}

/** Dropdown for block_values fields with a fixed option set (e.g. Block 21). */
function BlockSelect({
  label,
  fieldKey,
  options,
  evalData,
  handleBlockValueChange,
  issues,
  onFocusField,
  renderLabel,
  deriveChanges,
}: {
  label: string;
  fieldKey: string;
  options: string[];
  evalData: Evaluation;
  handleBlockValueChange: (f: Record<string, any>) => void;
  issues: ValidationIssue[];
  onFocusField?: (field: string | null) => void;
  // Display-only label transform (the stored option value is unchanged).
  renderLabel?: (opt: string) => string;
  // Optional side-effect: derive additional block_values to set from the new selection.
  deriveChanges?: (value: string) => Record<string, any>;
}) {
  const hasError = issues.some(
    (i) => i.field === fieldKey && i.severity === "error",
  );
  const selectId = evalFieldId(`bv-${fieldKey}`);
  return (
    <div>
      <label className={FORM_LABEL} htmlFor={selectId}>
        {label}
      </label>
      <select
        id={selectId}
        value={evalData.block_values?.[fieldKey] || ""}
        onChange={(e) =>
          handleBlockValueChange({
            [fieldKey]: e.target.value,
            ...deriveChanges?.(e.target.value),
          })
        }
        onFocus={() => onFocusField?.(fieldKey)}
        className={formFieldClass(hasError)}
      >
        <option value="">Select…</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {renderLabel ? renderLabel(opt) : opt}
          </option>
        ))}
      </select>
      {hasError && (
        <p className="apex-text-field-error text-xs mt-1">
          {
            issues.find((i) => i.field === fieldKey && i.severity === "error")
              ?.message
          }
        </p>
      )}
    </div>
  );
}

/** Command Context & Reporting Senior — Blocks 20‑32 */
function CommandDetailsSection({
  evalData,
  issues,
  handleBlockValueChange,
  onFocusField,
  activeField,
}: {
  evalData: Evaluation;
  issues: ValidationIssue[];
  handleBlockValueChange: (f: Record<string, any>) => void;
  onFocusField?: (field: string | null) => void;
  activeField?: string | null;
}) {
  const primaryDutiesFit = getPrimaryDutiesFieldFit(evalData.report_type);
  return (
    <>
      <BupersGuidelinesInline
        activeField={activeField || null}
        sectionFields={COMMAND_SECTION_FIELDS}
      />

      {/* Row 1: Blocks 20‑23 */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
        <div className="md:col-span-2">
          <BlockInput
            label="20: Physical Readiness"
            fieldKey="physical_readiness"
            placeholder="e.g. PPP"
            transform="pfa"
            maxLength={10}
            evalData={evalData}
            handleBlockValueChange={handleBlockValueChange}
            issues={issues}
            onFocusField={onFocusField}
          />
        </div>
        <div className="md:col-span-2">
          <BlockSelect
            label="21: Billet Subcategory"
            fieldKey="billet_subcategory"
            options={BILLET_SUBCATEGORY_OPTIONS}
            evalData={evalData}
            handleBlockValueChange={handleBlockValueChange}
            issues={issues}
            onFocusField={onFocusField}
            // Annotate starred standard subcategories with "*" (must match Block 29).
            renderLabel={(opt) =>
              (STARRED_BILLET_SUBCATEGORIES as readonly string[]).includes(opt)
                ? `${opt}*`
                : opt
            }
            // A starred Block 21 code must match Block 29 — auto-fill 29A with the code.
            // Switching to a non-starred code clears a previously auto-filled code.
            deriveChanges={(value) => {
              const starred = (
                STARRED_BILLET_SUBCATEGORIES as readonly string[]
              ).includes(value);
              if (starred) return { primary_duty_abbrev: value };
              const current = evalData.block_values?.primary_duty_abbrev || "";
              if (
                (STARRED_BILLET_SUBCATEGORIES as readonly string[]).includes(
                  current,
                )
              ) {
                return { primary_duty_abbrev: "" };
              }
              return {};
            }}
          />
        </div>
        <div className="md:col-span-5">
          <BlockInput
            label="22: RS Name (Last, FI MI)"
            fieldKey="reporting_senior_name"
            placeholder="STJOHN, O F"
            evalData={evalData}
            handleBlockValueChange={handleBlockValueChange}
            issues={issues}
            onFocusField={onFocusField}
          />
        </div>
        <div className="md:col-span-3">
          <BlockInput
            label="23: RS Grade"
            fieldKey="reporting_senior_grade"
            placeholder="e.g. CDR"
            maxLength={5}
            evalData={evalData}
            handleBlockValueChange={handleBlockValueChange}
            issues={issues}
            onFocusField={onFocusField}
          />
        </div>
      </div>

      {/* Row 2: Blocks 24‑26 (Reporting Senior designator, title, UIC) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
        <div className="md:col-span-3">
          <BlockInput
            label="24: RS Designator"
            fieldKey="reporting_senior_designator"
            placeholder="e.g. 1110 / USAF"
            transform="uppercase"
            maxLength={4}
            evalData={evalData}
            handleBlockValueChange={handleBlockValueChange}
            issues={issues}
            onFocusField={onFocusField}
          />
        </div>
        <div className="md:col-span-4">
          <BlockInput
            label="25: RS Title (max 14)"
            fieldKey="reporting_senior_title"
            placeholder="e.g. CO"
            maxLength={14}
            evalData={evalData}
            handleBlockValueChange={handleBlockValueChange}
            issues={issues}
            onFocusField={onFocusField}
          />
        </div>
        <div className="md:col-span-2">
          <BlockInput
            label="26: RS UIC"
            fieldKey="reporting_senior_uic"
            placeholder="e.g. 00241"
            maxLength={5}
            evalData={evalData}
            handleBlockValueChange={handleBlockValueChange}
            issues={issues}
            onFocusField={onFocusField}
          />
        </div>
        <div className="md:col-span-3">
          <BlockInput
            label="27: RS DoD ID"
            fieldKey="reporting_senior_dod_id"
            placeholder="10-digit DoD ID"
            transform="digits"
            maxLength={10}
            evalData={evalData}
            handleBlockValueChange={handleBlockValueChange}
            issues={issues}
            onFocusField={onFocusField}
          />
        </div>
      </div>

      {/* Block 28 — Command Employment and Achievements (measured canvas, 95 CPL x 3 lines) */}
      <div className="mb-6">
        <MeasuredCourierField
          label="28: Command Employment and Achievements"
          value={evalData.block_values?.command_achievements || ""}
          onChange={(v) => handleBlockValueChange({ command_achievements: v })}
          charsPerLine={FIELD_FIT.command_achievements.charsPerLine}
          maxLines={FIELD_FIT.command_achievements.maxLines}
          placeholder="DESCRIBE COMMAND EMPLOYMENT AND ACHIEVEMENTS…"
          onFocus={() => onFocusField?.("command_achievements")}
          error={
            issues.find((i) => i.field === "command_achievements")?.message
          }
          fieldId={evalFieldId("bv-command_achievements")}
        />
      </div>

      <div className="mb-6">
        <p className={FORM_LABEL}>
          29: Primary/Collateral/Watchstanding Duties
          <span className="font-normal text-xs apex-text-muted ml-2">
            (29B: {primaryDutiesFit.maxLines} lines × {primaryDutiesFit.charsPerLine} CPL
            {primaryDutiesFit.firstLineLead
              ? `, line 1 −${primaryDutiesFit.firstLineLead} for 29A`
              : ""}
            )
          </span>
        </p>
        <div className="mb-4">
          <label className={FORM_SUBLABEL} htmlFor={evalFieldId("bv-primary_duty_abbrev")}>
            29A · Most-significant primary duty abbreviation (max{" "}
            {PRIMARY_DUTY_ABBREV_MAX})
          </label>
          <div
            className={`apex-measured-courier-shell ${
              issues.some(
                (i) =>
                  i.field === "primary_duty_abbrev" && i.severity === "error",
              )
                ? "!border-[var(--field-invalid-border)]"
                : "focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--focus-ring)]"
            }`}
          >
            <input
              id={evalFieldId("bv-primary_duty_abbrev")}
              type="text"
              maxLength={PRIMARY_DUTY_ABBREV_MAX}
              placeholder="IT COMM TECH"
              value={evalData.block_values?.primary_duty_abbrev || ""}
              onChange={(e) =>
                handleBlockValueChange({
                  primary_duty_abbrev: e.target.value.toUpperCase(),
                })
              }
              onFocus={() => onFocusField?.("primary_duty_abbrev")}
              spellCheck={false}
              className="apex-measured-courier-input mx-3 placeholder:opacity-50"
              style={{
                fontFamily:
                  "'Courier Prime', 'Courier New', Courier, monospace",
                fontSize: "13px",
                lineHeight: "22px",
                width: `${PRIMARY_DUTY_ABBREV_MAX}ch`,
              }}
            />
          </div>
          {issues.find((i) => i.field === "primary_duty_abbrev") && (
            <p className="apex-text-field-error text-xs mt-2">
              {issues.find((i) => i.field === "primary_duty_abbrev")?.message}
            </p>
          )}
        </div>
        <MeasuredCourierField
          label="29B · Duties narrative"
          fieldId={evalFieldId("bv-primary_duties")}
          value={evalData.block_values?.primary_duties || ""}
          onChange={(v) => handleBlockValueChange({ primary_duties: v })}
          charsPerLine={primaryDutiesFit.charsPerLine}
          maxLines={primaryDutiesFit.maxLines}
          firstLineLead={primaryDutiesFit.firstLineLead}
          placeholder="PRI: …; COLL: …; JOB SCOPE: …; PFA …"
          onFocus={() => onFocusField?.("primary_duties")}
          error={issues.find((i) => i.field === "primary_duties")?.message}
        />
      </div>

      <p className="text-xs font-semibold uppercase tracking-wider apex-text-muted mb-2">
        Mid‑Term Counseling (Blocks 30 - 31)
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div>
          <label className={FORM_LABEL} htmlFor={evalFieldId("bv-date_counseled")}>
            30: Date Counseled
          </label>
          {(() => {
            const dc = evalData.block_values?.date_counseled || "";
            const isDate = /^\d{4}-\d{2}-\d{2}$/.test(dc);
            const hasError = issues.some(
              (i) => i.field === "date_counseled" && i.severity === "error",
            );
            return (
              <>
                <input
                  id={evalFieldId("bv-date_counseled")}
                  type="date"
                  value={isDate ? dc : ""}
                  onChange={(e) =>
                    handleBlockValueChange({ date_counseled: e.target.value })
                  }
                  onFocus={() => onFocusField?.("date_counseled")}
                  className={formFieldClass(hasError)}
                />
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="text-[10px] uppercase tracking-wider apex-text-muted">
                    If not counseled:
                  </span>
                  {(["NOT REQ", "NOT PERF"] as const).map((code) => {
                    const active = dc.toUpperCase() === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => {
                          onFocusField?.("date_counseled");
                          handleBlockValueChange({
                            date_counseled: active ? "" : code,
                          });
                        }}
                        className={`apex-grade-pill text-[11px] px-2 py-1 ${
                          active
                            ? "apex-grade-pill--active"
                            : "apex-grade-pill--idle"
                        }`}
                      >
                        {code}
                      </button>
                    );
                  })}
                </div>
              </>
            );
          })()}
          {issues.find((i) => i.field === "date_counseled") && (
            <p className="apex-text-field-error text-xs mt-1">
              {issues.find((i) => i.field === "date_counseled")?.message}
            </p>
          )}
        </div>

        <div>
          <label className={FORM_LABEL} htmlFor={evalFieldId("bv-counselor")}>
            31: Counselor
          </label>
          <input
            id={evalFieldId("bv-counselor")}
            type="text"
            placeholder="COUNSELOR, FI"
            maxLength={COUNSELOR_MAX}
            value={evalData.block_values?.counselor || ""}
            onChange={(e) =>
              handleBlockValueChange({
                counselor: e.target.value.toUpperCase(),
              })
            }
            onFocus={() => onFocusField?.("counselor")}
            className={formFieldClass(
              issues.some(
                (i) => i.field === "counselor" && i.severity === "error",
              ),
            )}
          />
          {issues.find((i) => i.field === "counselor") && (
            <p className="apex-text-field-error text-xs mt-1">
              {issues.find((i) => i.field === "counselor")?.message}
            </p>
          )}
        </div>
      </div>

      <p className="apex-text-muted text-[10px] mb-2">
        Block 32 (Signature of Individual Counseled) is signed by the member on
        the report screen after saving. Per BUPERSINST 1610.10H it is optional
        and may be left blank.
      </p>
    </>
  );
}
