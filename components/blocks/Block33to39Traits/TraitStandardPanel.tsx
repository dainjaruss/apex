// components/blocks/Block33to39Traits/TraitStandardPanel.tsx
//
// Shows the official NAVPERS 1616/26 performance-standard verbiage for the grade a rater
// has selected on a trait row. The 1.0, 3.0, and 5.0 marks carry per-trait bullet text
// (from the printed grid); 2.0, 4.0, and NOB show the scale legend instead. Marks of 1.0
// and 5.0 surface the written-justification reminder (Block 43).

import React from 'react'
import {
  TRAIT_STANDARDS,
  TRAIT_GRADE_LABELS,
  GRADE_SCALE_NOTE,
  ANCHOR_GRADES,
  SUBSTANTIATION_NOTE,
  TraitKey,
  AnchorGrade,
} from '@/lib/traitStandards'

const THEME: Record<string, { border: string; heading: string; dot: string }> = {
  '1.0': { border: 'border-amber-500/30', heading: 'text-amber-300', dot: 'text-amber-400' },
  '3.0': { border: 'border-[#3e6e99]/40', heading: 'text-sky-300', dot: 'text-sky-400' },
  '5.0': { border: 'border-emerald-500/30', heading: 'text-emerald-300', dot: 'text-emerald-400' },
}

const NEUTRAL = { border: 'border-slate-700/40', heading: 'text-slate-300', dot: 'text-slate-500' }

export default function TraitStandardPanel({ traitKey, grade }: { traitKey: TraitKey; grade: string }) {
  const std = TRAIT_STANDARDS[traitKey]
  if (!std) return null

  const isAnchor = (ANCHOR_GRADES as readonly string[]).includes(grade)
  const theme = THEME[grade] ?? NEUTRAL
  const needsJustification = grade === '1.0' || grade === '5.0'

  return (
    <div className={`mt-3 rounded-lg border ${theme.border} bg-slate-950/40 p-3`}>
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <span className={`text-xs font-bold uppercase tracking-wider ${theme.heading}`}>
          {grade} — {TRAIT_GRADE_LABELS[grade] ?? grade}
        </span>
        {needsJustification && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-300/90 bg-amber-500/10 border border-amber-500/30 rounded px-1.5 py-0.5">
            Requires written justification (Block 43)
          </span>
        )}
      </div>

      {isAnchor ? (
        <ul className="space-y-1">
          {std.anchors[grade as AnchorGrade].map((bullet, i) => (
            <li key={i} className="flex gap-2 text-xs text-slate-300 leading-snug">
              <span className={`${theme.dot} mt-px select-none`}>•</span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs italic text-slate-400 leading-snug">
          {GRADE_SCALE_NOTE[grade] ?? 'Select a grade to view its performance standard.'}
        </p>
      )}

      {needsJustification && (
        <p className="mt-2 pt-2 border-t border-slate-800/60 text-[11px] text-slate-500 leading-snug">
          {SUBSTANTIATION_NOTE}
        </p>
      )}
    </div>
  )
}
