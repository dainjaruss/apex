import React, { useEffect, useMemo } from 'react'
import { Evaluation, ValidationIssue } from '@/types'
import TraitRow from '@/components/blocks/Block33to39Traits/TraitRow'
import BupersGuidelinesInline from '@/components/blocks/BupersGuidelinesInline'
import { computeTraitAverage } from '@/lib/traitAverage'
import { FORM_PANEL, FORM_SECTION_TITLE } from '@/lib/formStyles'

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

const TRAIT_KEYS = [
  { key: 'knowledge', label: 'Professional Knowledge (33)' },
  { key: 'work', label: 'Quality of Work (34)' },
  { key: 'eo', label: 'Command Climate / Equal Opportunity (35)' },
  { key: 'bearing', label: 'Military Bearing / Character (36)' },
  { key: 'accomplishment', label: 'Personal Job Accomplishment / Initiative (37)' },
  { key: 'teamwork', label: 'Teamwork (38)' },
  { key: 'leadership', label: 'Leadership (39)' },
] as const

const GRADE_VALUES = ['1.0', '2.0', '3.0', '4.0', '5.0', 'NOB'] as const

export default function Block33to39Traits({ evalData, onChange, issues, onFocusField, activeField, summaryGroupAverage, showSummaryGroupAverage }: Block33to39TraitsProps) {
  // Only the grades the rater has actually set. Per EVALMAN an untouched trait is blank
  // and ungraded (excluded from the average) — never a silent 3.0 default.
  const currentGrades = useMemo(
    () => (evalData.trait_grades || {}) as Record<string, string | undefined>,
    [evalData.trait_grades],
  )

  // Sync the Block 40 average over the graded traits only. Null = nothing graded yet
  // (stored as 0, the "none graded" sentinel).
  useEffect(() => {
    const { average } = computeTraitAverage(currentGrades)
    const next = average ?? 0
    if (evalData.trait_average !== next) {
      onChange({ trait_average: next })
    }
  }, [currentGrades, evalData.trait_average, onChange])

  // The parent's handleFieldChange does a SHALLOW merge, so sending only the changed
  // trait would replace the whole trait_grades object and wipe its siblings (collapsing
  // the average to the last grade clicked). Merge with the other current grades first.
  const handleTraitChange = (fields: Partial<Evaluation>) => {
    if (fields.trait_grades) {
      onChange({ ...fields, trait_grades: { ...currentGrades, ...fields.trait_grades } })
    } else {
      onChange(fields)
    }
  }

  // Live Block 40 average for the header — computed from the grades directly so it never
  // lags the stored round-trip (null = a fully NOB report).
  const { average: liveAverage } = computeTraitAverage(currentGrades)

  const getError = (trait: string) => {
    return issues.find((i) => i.field === `trait_grades.${trait}`)?.message
  }

  return (
    <div className={`${FORM_PANEL} mb-6`}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b border-slate-700/40 pb-2">
        <h3 className={FORM_SECTION_TITLE}>
          <span className="h-2 w-2 rounded-full bg-[var(--accent-cyan)]" aria-hidden />
          Trait Performance Ratings (Blocks 33 - 39)
        </h3>
        <div className="mt-2 sm:mt-0 flex flex-wrap items-center gap-2">
          <div className="px-4 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-2" style={{ background: 'var(--form-input-bg)', border: '1px solid var(--border)' }}>
            <span className="text-slate-400 text-xs uppercase">Trait Average (40):</span>
            <span className="text-emerald-400 font-bold font-mono text-base">
              {liveAverage != null ? liveAverage.toFixed(2) : '—'}
            </span>
          </div>
          {showSummaryGroupAverage && (
            <div className="px-4 py-1.5 rounded-lg text-sm font-semibold flex items-center gap-2" style={{ background: 'var(--form-input-bg)', border: '1px solid var(--border)' }}
              title="Block 50a — pooled summary group average. Equals the Block 40 average when this report isn't in a summary group.">
              <span className="text-slate-400 text-xs uppercase">Summary Group Avg (50a):</span>
              <span className="text-sky-300 font-bold font-mono text-base">
                {summaryGroupAverage != null ? summaryGroupAverage.toFixed(2) : '—'}
              </span>
            </div>
          )}
        </div>
      </div>

      <p className="text-xs text-slate-500 mb-4 -mt-2">
        Click a grade to set it; click the selected grade again to clear it. Untouched traits stay ungraded
        and are excluded from the Block 40 average (per BUPERSINST 1610.10H).
      </p>

      <BupersGuidelinesInline
        activeField={activeField || null}
        sectionFields={[
          'trait_grades.knowledge',
          'trait_grades.work',
          'trait_grades.eo',
          'trait_grades.bearing',
          'trait_grades.accomplishment',
          'trait_grades.teamwork',
          'trait_grades.leadership'
        ]}
      />

      <div className="space-y-4">
        {TRAIT_KEYS.map(({ key, label }) => (
          <TraitRow
            key={key}
            traitKey={key}
            label={label}
            value={currentGrades[key] || ''}
            error={getError(key)}
            onChange={handleTraitChange}
            gradeValues={GRADE_VALUES}
            onFocus={() => onFocusField?.(`trait_grades.${key}`)}
          />
        ))}
      </div>
    </div>
  )
}
