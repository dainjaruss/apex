// components/blocks/Block33to39Traits/TraitRow.tsx
// This sub‑component renders a single trait row (label + grade selector) for the Block33to39Traits component.
import React from 'react'
import { Evaluation } from '@/types'

type TraitRowProps = {
  traitKey: keyof Evaluation['trait_grades']
  label: string
  value: string
  error?: string
  onChange: (fields: Partial<Evaluation>) => void
  gradeValues: readonly string[]
}

export default function TraitRow({ traitKey, label, value, error, onChange, gradeValues }: TraitRowProps) {
  const handleGradeChange = (newVal: string) => {
    onChange({
      trait_grades: {
        // Preserve existing grades; the parent component will spread currentGrades
        [traitKey]: newVal,
      },
    })
  }

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between p-3.5 rounded-lg bg-slate-900/30 border border-slate-800/40 hover:border-slate-700/40 transition duration-150">
      <div className="mb-2 md:mb-0">
        <span className="text-sm font-medium text-slate-200">{label}</span>
        {error && <p className="text-red-400 text-xs mt-0.5">{error}</p>}
      </div>

      {/* Radio options grid */}
      <div className="flex flex-wrap items-center gap-1.5 font-mono">
        {gradeValues.map((gOpt) => {
          const active = value === gOpt
          return (
            <button
              key={gOpt}
              type="button"
              onClick={() => handleGradeChange(gOpt)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition duration-150 min-w-[48px] text-center ${
                active
                  ? 'bg-[#3e6e99] text-white shadow-md shadow-[#3e6e99]/20'
                  : 'bg-[#1c2541]/40 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              {gOpt}
            </button>
          )
        })}
      </div>
    </div>
  )
}
