// components/blocks/Block33to39Traits/TraitRow.tsx
// This sub‑component renders a single trait row (label + grade selector) for the Block33to39Traits component.
import React from "react";
import { Evaluation } from "@/types";
import TraitStandardPanel from "@/components/blocks/Block33to39Traits/TraitStandardPanel";
import { TRAIT_STANDARDS, TraitKey } from "@/lib/traitStandards";

type TraitRowProps = {
  traitKey: keyof Evaluation["trait_grades"];
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
        // Preserve existing grades; the parent (Block33to39Traits) merges currentGrades.
        // `undefined` clears the grade — per EVALMAN a deselected trait is left ungraded.
        [traitKey]: newVal,
      },
    });
  };

  return (
    <div
      onClick={onFocus}
      onFocus={onFocus}
      className={`flex flex-col p-3.5 rounded-lg bg-slate-900/30 border hover:border-slate-700/40 transition duration-150 cursor-pointer ${
        error
          ? "border-red-500/80 focus-within:border-red-400"
          : "border-slate-800/40 focus-within:border-[#3e6e99]"
      }`}
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
        <div className="mb-2 md:mb-0">
          <span className="text-sm font-medium text-slate-200">{label}</span>
          {std?.definition && (
            <p className="text-xs text-slate-500 mt-0.5">{std.definition}</p>
          )}
          {error && <p className="text-red-400 text-xs mt-0.5">{error}</p>}
        </div>

        {/* Radio options grid */}
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
                  // Toggle: clicking the active grade clears it (leaves the trait ungraded).
                  handleGradeChange(active ? undefined : gOpt);
                  onFocus?.();
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition duration-150 min-w-[48px] text-center ${
                  active
                    ? "bg-[#3e6e99] text-white shadow-md shadow-[#3e6e99]/20"
                    : "bg-[#1c2541]/40 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                {gOpt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Official performance-standard verbiage for the selected grade */}
      {value && (
        <TraitStandardPanel traitKey={traitKey as TraitKey} grade={value} />
      )}
    </div>
  );
}
