// components/blocks/Block33to39Traits/TraitRow.tsx
import React from "react";
import { Evaluation } from "@/types";
import TraitStandardPanel from "@/components/blocks/Block33to39Traits/TraitStandardPanel";
import { TRAIT_STANDARDS, TraitKey } from "@/lib/traitStandards";

type TraitRowProps = {
  traitKey: string;
  label: string;
  value: string;
  error?: string;
  onChange: (fields: Partial<Evaluation>) => void;
  gradeValues: readonly string[];
  onFocus?: () => void;
};

export default function TraitRow({
  traitKey,
  label,
  value,
  error,
  onChange,
  gradeValues,
  onFocus,
}: TraitRowProps) {
  const std = TRAIT_STANDARDS[traitKey as TraitKey];

  const handleGradeChange = (newVal: string | undefined) => {
    onChange({
      trait_grades: {
        [traitKey]: newVal,
      },
    });
  };

  return (
    <div
      onClick={onFocus}
      onFocus={onFocus}
      className={`apex-trait-row ${error ? "apex-trait-row--error" : ""}`}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div className="mb-2 md:mb-0">
          <span className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
            {label}
          </span>
          {std?.definition && (
            <p className="text-xs mt-0.5" style={{ color: "var(--subtle)" }}>
              {std.definition}
            </p>
          )}
          {error && (
            <p className="text-xs mt-0.5" style={{ color: "var(--destructive)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5 font-mono">
          {gradeValues.map((gOpt) => {
            const active = value === gOpt;
            return (
              <button
                key={gOpt}
                type="button"
                aria-pressed={active}
                title={active ? "Click to clear this grade" : `Grade ${gOpt}`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleGradeChange(active ? undefined : gOpt);
                  onFocus?.();
                }}
                className={`apex-grade-pill ${active ? "apex-grade-pill--active" : "apex-grade-pill--idle"}`}
              >
                {gOpt}
              </button>
            );
          })}
        </div>
      </div>

      {value && (
        <TraitStandardPanel traitKey={traitKey as TraitKey} grade={value} />
      )}
    </div>
  );
}