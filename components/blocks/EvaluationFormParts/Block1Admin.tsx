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
import { FIELD_FIT, PRIMARY_DUTY_ABBREV_MAX } from "@/lib/commentFit";

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
      <h3 className={FORM_SECTION_TITLE}>
        <span
          className="h-2 w-2 rounded-full bg-[var(--accent-cyan)]"
          aria-hidden
        />
        Administrative Info
      </h3>
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

  return (
    <div>
      <label className={FORM_LABEL}>{label}</label>
      <input
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
        <p className="text-red-400 text-xs mt-1">
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
  return (
    <div>
      <label className={FORM_LABEL}>{label}</label>
      <select
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
        <p className="text-red-400 text-xs mt-1">
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
          ariaLabel="Block 28 Command Employment and Achievements"
        />
      </div>

      {/* Block 29 — (A) 14-char primary-duty abbreviation + (B) narrative (95 CPL x 3 lines) */}
      <div className="mb-6">
        <label className={FORM_LABEL}>
          29: Primary/Collateral/Watchstanding Duties
        </label>
        <div className="mb-4">
          <span className={FORM_SUBLABEL}>
            29A · Most-significant primary duty abbreviation (max{" "}
            {PRIMARY_DUTY_ABBREV_MAX})
          </span>
          {/* Matches the 28 / 29B Courier box styling, minus the line-number gutter. */}
          <div
            className={`flex w-fit max-w-full bg-slate-950/60 border rounded-xl py-3 ${
              issues.some(
                (i) =>
                  i.field === "primary_duty_abbrev" && i.severity === "error",
              )
                ? "border-red-500/80"
                : "border-[var(--border-strong)] focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--focus-ring)]"
            }`}
          >
            <input
              type="text"
              maxLength={PRIMARY_DUTY_ABBREV_MAX}
              placeholder="IT COMM TECH"
              value={evalData.block_values?.primary_duty_abbrev || ""}
              onChange={(e) =>
                handleBlockValueChange({
                  primary_duty_abbrev: e.target.value.toUpperCase(),
                })
              }
              onFocus={() => onFocusField?.("primary_duties")}
              spellCheck={false}
              aria-label="Block 29A most-significant primary duty abbreviation"
              className="block bg-transparent text-slate-100 p-0 mx-3 focus:outline-none placeholder:text-slate-600"
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
            <p className="text-red-400 text-xs mt-2">
              {issues.find((i) => i.field === "primary_duty_abbrev")?.message}
            </p>
          )}
        </div>
        <MeasuredCourierField
          label="29B · Duties narrative"
          value={evalData.block_values?.primary_duties || ""}
          onChange={(v) => handleBlockValueChange({ primary_duties: v })}
          charsPerLine={FIELD_FIT.primary_duties.charsPerLine}
          maxLines={FIELD_FIT.primary_duties.maxLines}
          firstLineLead={FIELD_FIT.primary_duties.firstLineLead}
          placeholder="PRI: …; COLL: …; JOB SCOPE: …; PFA …"
          onFocus={() => onFocusField?.("primary_duties")}
          error={issues.find((i) => i.field === "primary_duties")?.message}
          ariaLabel="Block 29 Primary Duties narrative"
        />
      </div>

      {/* Mid‑Term Counseling — Blocks 30‑31 (Block 32 signature is applied on the report screen) */}
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
        Mid‑Term Counseling (Blocks 30 - 31)
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* Block 30: Date Counseled — calendar picker (ISO), or NOT REQ / NOT PERF */}
        <div>
          <label className={FORM_LABEL}>30: Date Counseled</label>
          {(() => {
            const dc = evalData.block_values?.date_counseled || "";
            const isDate = /^\d{4}-\d{2}-\d{2}$/.test(dc);
            const hasError = issues.some(
              (i) => i.field === "date_counseled" && i.severity === "error",
            );
            return (
              <>
                <input
                  type="date"
                  value={isDate ? dc : ""}
                  onChange={(e) =>
                    handleBlockValueChange({ date_counseled: e.target.value })
                  }
                  onFocus={() => onFocusField?.("date_counseled")}
                  className={formFieldClass(hasError)}
                />
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="text-[10px] uppercase tracking-wider text-slate-500">
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
            <p className="text-red-400 text-xs mt-1">
              {issues.find((i) => i.field === "date_counseled")?.message}
            </p>
          )}
        </div>

        {/* Block 31: Counselor (required — has validation message) */}
        <div>
          <label className={FORM_LABEL}>31: Counselor</label>
          <input
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
            <p className="text-red-400 text-xs mt-1">
              {issues.find((i) => i.field === "counselor")?.message}
            </p>
          )}
        </div>
      </div>

      {/* Block 32: Signature of Individual Counseled — signed on the report screen (optional per EVALMAN) */}
      <p className="text-slate-500 text-[10px] mb-2">
        Block 32 (Signature of Individual Counseled) is signed by the member on
        the report screen after saving. Per BUPERSINST 1610.10H it is optional
        and may be left blank.
      </p>
    </>
  );
}
