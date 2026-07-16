// components/blocks/EvaluationFormParts/Block42Signatures.tsx
//
// Authoring fields for Blocks 41 (career recommendations), 45 (promotion),
// 47 (retention), and 48 (reporting senior address). Block 44 (qualifications) is
// authored in section 3 (Block43Comments) — it is NOT duplicated here.
// Signatures (Blocks 42/49/50/51/52) are NOT captured here — they are applied on
// the report screen with credential verification (see app/evaluations/[id]/page.tsx
// and components/CredentialSignatureModal.tsx).

import React from "react";
import { Evaluation, ValidationIssue } from "@/types";
import {
  PROMOTION_RECOMMENDATIONS,
  RETENTION_OPTIONS,
  CAREER_REC_MAX,
} from "@/types/navpers";
import { FIELD_FIT } from "@/lib/commentFit";
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

// Fields in this section that have BUPERSINST field-guide entries (Blocks 41, 45, 47, 48).
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

  const isChiefevalOrFitrep =
    evalData.report_type === "CHIEFEVAL" ||
    evalData.report_type === "FITREP" ||
    evalData.form_definition_id?.startsWith("CHIEFEVAL") ||
    evalData.form_definition_id?.startsWith("FITREP") ||
    evalData.form_definition_id?.includes("c1616270") ||
    evalData.form_definition_id?.includes("f1610020") ||
    evalData.form_definition_id?.includes("f1610050");

  const activeSectionFields = isChiefevalOrFitrep
    ? [
        "career_recommendations",
        "promotion_recommendation",
        "reporting_senior_address",
      ]
    : SECTION_FIELDS;

  return (
    <div className={FORM_PANEL}>
      <h3 className={FORM_SECTION_TITLE}>
        <span
          className="h-2 w-2 rounded-full bg-[var(--accent-cyan)]"
          aria-hidden
        />
        {isChiefevalOrFitrep
          ? "Recommendations & Reporting Senior (Blocks 41, 45, 48)"
          : "Recommendations & Reporting Senior (Blocks 41, 45 - 48)"}
      </h3>

      {/* Contextual BUPERS field guide for whichever section-4 field is focused. */}
      <BupersGuidelinesInline
        activeField={activeField || null}
        sectionFields={activeSectionFields}
      />

      {/* Block 41 / 45 / (47 if EVAL) */}
      <RecommendationsRow
        evalData={evalData}
        onChange={onChange}
        issueFor={issueFor}
        onFocusField={onFocusField}
        isChiefevalOrFitrep={Boolean(isChiefevalOrFitrep)}
      />

      {/* Block 48: Reporting Senior Address (text field, NOT a signature) — measured
          Courier canvas so it wraps on screen exactly as the printed form's narrow cell
          ({addrSpec.charsPerLine} chars/line × {addrSpec.maxLines} lines). */}
      <div className="mb-2">
        <label className={FORM_LABEL}>48: Reporting Senior Address</label>
        <MeasuredCourierField
          value={evalData.block_values?.reporting_senior_address || ""}
          onChange={(v) =>
            handleBlockValueChange({ reporting_senior_address: v })
          }
          charsPerLine={addrSpec.charsPerLine}
          maxLines={addrSpec.maxLines}
          placeholder="COMMAND MAILING ADDRESS OF THE REPORTING SENIOR"
          onFocus={() => onFocusField?.("reporting_senior_address")}
          error={issueFor("reporting_senior_address")?.message}
          ariaLabel="Block 48 Reporting Senior Address"
        />
      </div>

      {/* Signatures (Blocks 42, 49, 50, 51, 52) are applied on the report screen */}
      <p className="text-[11px] text-slate-500 border-t border-slate-800/60 pt-3 mt-4">
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
  isChiefevalOrFitrep,
}: {
  evalData: Evaluation;
  onChange: (fields: Partial<Evaluation>) => void;
  issueFor: (f: string) => ValidationIssue | undefined;
  onFocusField?: (field: string | null) => void;
  isChiefevalOrFitrep: boolean;
}) {
  return (
    <div
      className={`grid grid-cols-1 ${
        isChiefevalOrFitrep ? "md:grid-cols-2" : "md:grid-cols-3"
      } gap-6 mb-6`}
    >
      {/* Block 41 — exactly two slots (slot 1 required, slot 2 optional), max 20 chars each
          per BUPERSINST 1610.10H. "Do not leave blank" — enter NA/NONE if none applies. */}
      <div>
        <label className={FORM_LABEL}>41: Career Recommendations</label>
        {[0, 1].map((i) => {
          const recs = evalData.career_recommendations || [];
          const val = recs[i] || "";
          return (
            <div key={i} className="mb-2 last:mb-0">
              <input
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
                <span className="text-[10px] text-slate-500">
                  {i === 0 ? "Required" : "Optional"}
                </span>
                <span className="text-[10px] text-slate-500">
                  {val.length}/{CAREER_REC_MAX}
                </span>
              </div>
            </div>
          );
        })}
        {issueFor("career_recommendations") && (
          <p className="text-red-400 text-xs mt-1">
            {issueFor("career_recommendations")?.message}
          </p>
        )}
      </div>

      {/* Block 45 */}
      <div>
        <label className={FORM_LABEL}>45: Promotion Recommendation</label>
        <select
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
          <p className="text-red-400 text-xs mt-1 font-semibold">
            ⚠️ {issueFor("promotion_recommendation")?.message}
          </p>
        )}
      </div>

      {/* Block 47 (EVAL only) */}
      {!isChiefevalOrFitrep && (
        <div>
          <label className={FORM_LABEL}>47: Retention Recommendation</label>
          <select
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
            <p className="text-red-400 text-xs mt-1">
              {issueFor("retention")?.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
