// components/blocks/EvaluationFormParts/Block42Signatures.tsx
//
// Authoring fields for career recommendations, the promotion recommendation,
// retention (EVAL only), and the reporting senior address. Printed block numbers
// come from lib/traitStandards.ts. Qualifications (EVAL Block 44) are authored
// in section 3. Signature buttons use the stored keys 42/49/50/51/52 and are
// applied on the report screen — those keys are not relabeled here.

import React from "react";
import { Evaluation, ValidationIssue } from "@/types";
import {
  PROMOTION_RECOMMENDATIONS,
  RETENTION_OPTIONS,
  CAREER_REC_MAX,
} from "@/types/navpers";
import { FIELD_FIT } from "@/lib/commentFit";
import {
  careerRecommendationLabel,
  promotionBlock,
  reportingSeniorAddressBlock,
  resolveReportType,
} from "@/lib/traitStandards";
import MeasuredCourierField from "@/components/blocks/MeasuredCourierField";
import BupersGuidelinesInline from "@/components/blocks/BupersGuidelinesInline";

type Props = {
  evalData: Evaluation;
  onChange: (fields: Partial<Evaluation>) => void;
  handleBlockValueChange: (fields: Record<string, any>) => void;
  issues: ValidationIssue[];
  onFocusField?: (field: string | null) => void;
  activeField?: string | null;
};

// Fields in this section that have BUPERSINST field-guide entries.
const SECTION_FIELDS = [
  "career_recommendations",
  "promotion_recommendation",
  "retention",
  "reporting_senior_address",
];

import {
  FORM_PANEL,
  FORM_SECTION_TITLE,
  FORM_LABEL,
  formFieldClass,
  evalFieldId,
} from "@/lib/formStyles";

export default function Block42Signatures({
  evalData,
  onChange,
  handleBlockValueChange,
  issues,
  onFocusField,
  activeField,
}: Props) {
  const issueFor = (field: string) =>
    issues.find((i) => i.field === field && i.severity === "error");
  const addrSpec = FIELD_FIT.reporting_senior_address;

  const reportType = resolveReportType(evalData);
  const isEval = reportType === "EVAL";
  const careerLabel = careerRecommendationLabel(reportType);
  const promoBlock = promotionBlock(reportType);
  const addressBlock = reportingSeniorAddressBlock(reportType);

  const activeSectionFields = isEval
    ? SECTION_FIELDS
    : [
        "career_recommendations",
        "promotion_recommendation",
        "reporting_senior_address",
      ];

  return (
    <div className={FORM_PANEL}>
      <h2 className="apex-form-wizard-section-title">
        <span
          className="h-2 w-2 rounded-full bg-[var(--accent-cyan)]"
          aria-hidden
        />
        {`Recommendations & Reporting Senior (${careerLabel}, Block ${promoBlock}${
          isEval ? ", Block 47" : ""
        }, Block ${addressBlock})`}
      </h2>

      {/* Contextual BUPERS field guide for whichever section-4 field is focused. */}
      <BupersGuidelinesInline
        activeField={activeField || null}
        sectionFields={activeSectionFields}
      />

      <RecommendationsRow
        evalData={evalData}
        onChange={onChange}
        issueFor={issueFor}
        onFocusField={onFocusField}
        isEval={isEval}
        careerLabel={careerLabel}
        promoBlock={promoBlock}
      />

      {/* Block 48: Reporting Senior Address (text field, NOT a signature) — measured
          Courier canvas so it wraps on screen exactly as the printed form's narrow cell
          ({addrSpec.charsPerLine} chars/line × {addrSpec.maxLines} lines). */}
      <div className="mb-2">
        <MeasuredCourierField
          label={`${addressBlock}: Reporting Senior Address`}
          fieldId={evalFieldId("bv-reporting_senior_address")}
          value={evalData.block_values?.reporting_senior_address || ""}
          onChange={(v) =>
            handleBlockValueChange({ reporting_senior_address: v })
          }
          charsPerLine={addrSpec.charsPerLine}
          maxLines={addrSpec.maxLines}
          placeholder="COMMAND MAILING ADDRESS OF THE REPORTING SENIOR"
          onFocus={() => onFocusField?.("reporting_senior_address")}
          error={issueFor("reporting_senior_address")?.message}
        />
      </div>

      <p className="text-[11px] apex-text-muted border-t apex-report-divider pt-3 mt-4">
        Signatures (Blocks 42, 49, 50, 51, 52) are applied on the report screen
        after saving — each signer certifies their block with their own
        credentials.
      </p>
    </div>
  );
}

/* ── Sub‑helpers (reduce main function LOC) ──────── */

function RecommendationsRow({
  evalData,
  onChange,
  issueFor,
  onFocusField,
  isEval,
  careerLabel,
  promoBlock,
}: {
  evalData: Evaluation;
  onChange: (fields: Partial<Evaluation>) => void;
  issueFor: (f: string) => ValidationIssue | undefined;
  onFocusField?: (field: string | null) => void;
  isEval: boolean;
  careerLabel: string;
  promoBlock: number;
}) {
  return (
    <div
      className={`grid grid-cols-1 ${
        isEval ? "md:grid-cols-3" : "md:grid-cols-2"
      } gap-6 mb-6`}
    >
      {/* Block 41 — exactly two slots (slot 1 required, slot 2 optional), max 20 chars each
          per BUPERSINST 1610.10H. "Do not leave blank" — enter NA/NONE if none applies. */}
      <fieldset className="border-0 p-0 m-0 min-w-0">
        <legend className={`${FORM_LABEL} float-left w-full mb-1.5`}>
          {careerLabel}: Career Recommendations
        </legend>
        {[0, 1].map((i) => {
          const recs = evalData.career_recommendations || [];
          const val = recs[i] || "";
          const inputId = evalFieldId(`career_rec_${i}`);
          return (
            <div key={i} className="mb-2 last:mb-0 clear-both">
              <label className="text-[10px] apex-text-muted" htmlFor={inputId}>
                {i === 0 ? "Slot 1 (required)" : "Slot 2 (optional)"}
              </label>
              <input
                id={inputId}
                type="text"
                maxLength={CAREER_REC_MAX}
                placeholder={
                  i === 0
                    ? "e.g. RECRUITER (required)"
                    : "e.g. RETAIN (optional)"
                }
                value={val}
                onFocus={() => onFocusField?.("career_recommendations")}
                onChange={(e) => {
                  const next = [recs[0] || "", recs[1] || ""];
                  next[i] = e.target.value;
                  onChange({ career_recommendations: next });
                }}
                className={formFieldClass(!!issueFor("career_recommendations"))}
              />
              <div className="flex justify-between mt-0.5">
                <span className="text-[10px] apex-text-muted">
                  {val.length}/{CAREER_REC_MAX}
                </span>
              </div>
            </div>
          );
        })}
        {issueFor("career_recommendations") && (
          <p className="apex-text-field-error text-xs mt-1">
            {issueFor("career_recommendations")?.message}
          </p>
        )}
      </fieldset>

      <div>
        <label
          className={FORM_LABEL}
          htmlFor={evalFieldId("promotion_recommendation")}
        >
          {promoBlock}: Promotion Recommendation
        </label>
        <select
          id={evalFieldId("promotion_recommendation")}
          value={evalData.promotion_recommendation}
          onFocus={() => onFocusField?.("promotion_recommendation")}
          onChange={(e) =>
            onChange({ promotion_recommendation: e.target.value as any })
          }
          className={formFieldClass(!!issueFor("promotion_recommendation"))}
        >
          {PROMOTION_RECOMMENDATIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        {issueFor("promotion_recommendation") && (
          <p className="apex-text-field-error text-xs mt-1 font-semibold">
            ⚠️ {issueFor("promotion_recommendation")?.message}
          </p>
        )}
      </div>

      {isEval && (
        <div>
          <label className={FORM_LABEL} htmlFor={evalFieldId("retention")}>
            47: Retention Recommendation
          </label>
          <select
            id={evalFieldId("retention")}
            value={evalData.retention}
            onFocus={() => onFocusField?.("retention")}
            onChange={(e) => onChange({ retention: e.target.value as any })}
            className={formFieldClass(!!issueFor("retention"))}
          >
            {RETENTION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {issueFor("retention") && (
            <p className="apex-text-field-error text-xs mt-1">
              {issueFor("retention")?.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
