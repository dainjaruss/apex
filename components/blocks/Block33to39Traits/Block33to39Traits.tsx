import React, { useEffect, useMemo } from "react";
import { Evaluation, ValidationIssue } from "@/types";
import TraitRow from "@/components/blocks/Block33to39Traits/TraitRow";
import BupersGuidelinesInline from "@/components/blocks/BupersGuidelinesInline";
import { computeTraitAverage } from "@/lib/traitAverage";
import { FORM_PANEL, FORM_SECTION_TITLE } from "@/lib/formStyles";

interface Block33to39TraitsProps {
  evalData: Evaluation;
  onChange: (fields: Partial<Evaluation>) => void;
  issues: ValidationIssue[];
  onFocusField?: (field: string | null) => void;
  activeField?: string | null;
  // Block 50a — pooled summary group average (live), computed by the parent. Equals the Block 40
  // individual average when the eval isn't in a summary group.
  summaryGroupAverage?: number | null;
  // Whether to show Block 50a at all. Hidden for the drafting member (sailor); shown to reviewers.
  showSummaryGroupAverage?: boolean;
}

const GRADE_VALUES = ["1.0", "2.0", "3.0", "4.0", "5.0", "NOB"] as const;

export default function Block33to39Traits({
  evalData,
  onChange,
  issues,
  onFocusField,
  activeField,
  summaryGroupAverage,
  showSummaryGroupAverage,
}: Block33to39TraitsProps) {
  const isFitrep = useMemo(
    () =>
      evalData.report_type === "FITREP" ||
      evalData.form_definition_id?.startsWith("FITREP") ||
      evalData.form_definition_id?.includes("f1610020") ||
      evalData.form_definition_id?.includes("f1610050"),
    [evalData.report_type, evalData.form_definition_id],
  );

  const isChiefEval = useMemo(
    () =>
      evalData.report_type === "CHIEFEVAL" ||
      evalData.form_definition_id?.startsWith("CHIEFEVAL") ||
      evalData.form_definition_id?.includes("c1616270"),
    [evalData.report_type, evalData.form_definition_id],
  );

  // The form the trait list below is built for. Passing the raw `report_type`
  // instead would split the row in half on a draft identified only by
  // form_definition_id: officer headings from `isFitrep`, EVAL descriptor prose and
  // EVAL block numbers from an undefined report type. One resolved value, one form.
  const formType = useMemo(
    () => (isChiefEval ? "CHIEFEVAL" : isFitrep ? "FITREP" : "EVAL"),
    [isFitrep, isChiefEval],
  );

  const traitList = useMemo(() => {
    if (isChiefEval) {
      // NAVPERS 1616/27 (REV 05-2025), Blocks 33–39 as printed on
      // public/chiefEvalBlank.pdf. Categories: COMPETENCY 33–34, CHARACTER 35–37,
      // CULTURE 38–39. Block 37 is ACCOUNTABILITY (the 3.0 advancement gate) — the
      // CHIEFEVAL prints no Equal Opportunity or Command Climate trait.
      return [
        { key: "technical_mastery", label: "Technical Mastery (33)" },
        { key: "institutional_expertise", label: "Institutional Expertise (34)" },
        { key: "professionalism", label: "Professionalism (35)" },
        { key: "integrity", label: "Integrity (36)" },
        { key: "accountability", label: "Accountability (37)" },
        { key: "deckplate_leadership", label: "Deckplate Leadership (38)" },
        { key: "team_effectiveness", label: "Team Effectiveness (39)" },
      ];
    }

    // Blocks 33–39 as printed on NAVPERS 1610/2 (REV 05-2025) — seven traits, no
    // Quality of Work (that is an EVAL trait), Tactical Performance at Block 39.
    if (isFitrep) {
      return [
        { key: "knowledge", label: "Professional Expertise (33)" },
        { key: "eo", label: "Command or Organizational Climate (34)" },
        { key: "bearing", label: "Military Bearing / Character (35)" },
        { key: "teamwork", label: "Teamwork (36)" },
        {
          key: "accomplishment",
          label: "Mission Accomplishment and Initiative (37)",
        },
        { key: "leadership", label: "Leadership (38)" },
        {
          key: "tactical_performance",
          label: "Tactical Performance (39) — warfare qualified officers only",
        },
      ];
    }

    // NAVPERS 1616/26 (EVAL).
    return [
      { key: "knowledge", label: "Professional Knowledge (33)" },
      { key: "work", label: "Quality of Work (34)" },
      { key: "eo", label: "Command Climate / Equal Opportunity (35)" },
      { key: "bearing", label: "Military Bearing / Character (36)" },
      {
        key: "accomplishment",
        label: "Personal Job Accomplishment / Initiative (37)",
      },
      { key: "teamwork", label: "Teamwork (38)" },
      { key: "leadership", label: "Leadership (39)" },
    ];
  }, [isFitrep, isChiefEval]);

  // Only the grades the rater has actually set. Per EVALMAN an untouched trait is blank
  // and ungraded (excluded from the average) — never a silent 3.0 default.
  const currentGrades = useMemo(
    () => (evalData.trait_grades || {}) as Record<string, string | undefined>,
    [evalData.trait_grades],
  );

  // Sync the Block 40 average over the graded traits only. Null = nothing graded yet
  // (stored as 0, the "none graded" sentinel).
  useEffect(() => {
    const { average } = computeTraitAverage(currentGrades);
    const next = average ?? 0;
    if (evalData.trait_average !== next) {
      onChange({ trait_average: next });
    }
  }, [currentGrades, evalData.trait_average, onChange]);

  // The parent's handleFieldChange does a SHALLOW merge, so sending only the changed
  // trait would replace the whole trait_grades object and wipe its siblings (collapsing
  // the average to the last grade clicked). Merge with the other current grades first.
  const handleTraitChange = (fields: Partial<Evaluation>) => {
    if (fields.trait_grades) {
      onChange({
        ...fields,
        trait_grades: { ...currentGrades, ...fields.trait_grades },
      });
    } else {
      onChange(fields);
    }
  };

  // Live Block 40 average for the header — computed from the grades directly so it never
  // lags the stored round-trip (null = a fully NOB report).
  const { average: liveAverage } = computeTraitAverage(currentGrades);

  const getError = (trait: string) => {
    return issues.find((i) => i.field === `trait_grades.${trait}`)?.message;
  };

  return (
    <div className={`${FORM_PANEL} mb-6`}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b apex-report-divider pb-2">
        <h2 className="apex-form-wizard-section-title">
          <span
            className="h-2 w-2 rounded-full bg-[var(--accent-cyan)]"
            aria-hidden
          />
          Trait Performance Ratings (Blocks 33 - 39)
        </h2>
        <div className="mt-2 sm:mt-0 flex flex-wrap items-center gap-2">
          <div
            className="px-4 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-2"
            style={{
              background: "var(--form-input-bg)",
              border: "1px solid var(--border)",
            }}
          >
            <span className="apex-trait-stat-label">
              Trait Average (40):
            </span>
            <span className="apex-trait-stat-value">
              {liveAverage != null ? liveAverage.toFixed(2) : "—"}
            </span>
          </div>
          {showSummaryGroupAverage && (
            <div
              className="px-4 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-2"
              style={{
                background: "var(--form-input-bg)",
                border: "1px solid var(--border)",
              }}
              title="Block 50a — pooled summary group average. Equals the Block 40 average when this report isn't in a summary group."
            >
              <span className="apex-trait-stat-label">
                Summary Group Avg (50a):
              </span>
              <span className="apex-trait-stat-value apex-trait-stat-value--group">
                {summaryGroupAverage != null
                  ? summaryGroupAverage.toFixed(2)
                  : "—"}
              </span>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs apex-text-muted mb-4 -mt-2">
        Click a grade to set it; click the selected grade again to clear it.
        Untouched traits stay ungraded and are excluded from the Block 40
        average (per BUPERSINST 1610.10H).
      </p>

      <BupersGuidelinesInline
        activeField={activeField || null}
        sectionFields={traitList.map((t) => `trait_grades.${t.key}`)}
      />

      <div className="space-y-4">
        {traitList.map(({ key, label }) => (
          <TraitRow
            key={key}
            traitKey={key}
            label={label}
            value={currentGrades[key] || ""}
            error={getError(key)}
            onChange={handleTraitChange}
            gradeValues={GRADE_VALUES}
            onFocus={() => onFocusField?.(`trait_grades.${key}`)}
            reportType={formType}
          />
        ))}
      </div>
    </div>
  );
}
