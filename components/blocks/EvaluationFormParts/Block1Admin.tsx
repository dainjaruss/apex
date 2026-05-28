// components/blocks/EvaluationFormParts/Block1Admin.tsx
//
// Blocks 1‑32: Identity, command context, and reporting senior fields.

import React from 'react'
import Block1Name from '@/components/blocks/Block1Name'
import { Evaluation, ValidationIssue } from '@/types'

type Props = {
  evalData: Evaluation
  onChange: (fields: Partial<Evaluation>) => void
  issues: ValidationIssue[]
  handleBlockValueChange: (fields: Record<string, any>) => void
}

const LABEL = 'block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1'
const FIELD = 'w-full bg-[#1c2541]/40 border border-slate-700/60 rounded px-3 py-2 text-foreground focus:outline-none focus:border-[#3e6e99] focus:ring-1 focus:ring-[#3e6e99] transition duration-150'

export default function Block1Admin({ evalData, onChange, issues, handleBlockValueChange }: Props) {
  return (
    <>
      <Block1Name evalData={evalData} onChange={onChange} issues={issues} />
      <CommandDetailsSection
        evalData={evalData}
        issues={issues}
        handleBlockValueChange={handleBlockValueChange}
      />
    </>
  )
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
  transform = 'uppercase',
}: {
  label: string
  fieldKey: string
  placeholder: string
  evalData: Evaluation
  handleBlockValueChange: (f: Record<string, any>) => void
  maxLength?: number
  transform?: 'uppercase' | 'digits' | 'none'
}) {
  const xform = (v: string) => {
    if (transform === 'uppercase') return v.toUpperCase()
    if (transform === 'digits') return v.replace(/[^0-9]/g, '')
    return v
  }

  return (
    <div>
      <label className={LABEL}>{label}</label>
      <input
        type="text"
        placeholder={placeholder}
        maxLength={maxLength}
        value={evalData.block_values?.[fieldKey] || ''}
        onChange={(e) => handleBlockValueChange({ [fieldKey]: xform(e.target.value) })}
        className={FIELD}
      />
    </div>
  )
}

/** Command Context & Reporting Senior — Blocks 20‑32 */
function CommandDetailsSection({
  evalData,
  issues,
  handleBlockValueChange,
}: {
  evalData: Evaluation
  issues: ValidationIssue[]
  handleBlockValueChange: (f: Record<string, any>) => void
}) {
  const ROW_1 = [
    { label: 'Block 20: Physical Readiness', fieldKey: 'physical_readiness', placeholder: 'e.g. P/P', maxLength: 10 },
    { label: 'Block 21: Billet Subcategory', fieldKey: 'billet_subcategory', placeholder: 'e.g. NA' },
    { label: 'Block 22: RS Name (Last, First MI)', fieldKey: 'reporting_senior_name', placeholder: 'SENIOR, IM A' },
    { label: 'Block 23: RS Grade', fieldKey: 'reporting_senior_grade', placeholder: 'e.g. CDR' },
  ] as const

  const ROW_2 = [
    { label: 'Block 24: RS Designator', fieldKey: 'reporting_senior_designator', placeholder: 'e.g. 1110', transform: 'digits' as const },
    { label: 'Block 25: RS Title', fieldKey: 'reporting_senior_title', placeholder: 'e.g. COMMANDING OFFICER' },
    { label: 'Block 26: RS UIC', fieldKey: 'reporting_senior_uic', placeholder: 'e.g. 00241', maxLength: 5 },
  ] as const

  return (
    <div className="glass-panel rounded-xl p-6">
      <h3 className="text-lg font-bold gold-accent mb-4 border-b border-slate-700/40 pb-2">
        Command Context &amp; Reporting Senior (Blocks 20 - 32)
      </h3>

      {/* Row 1: Blocks 20‑23 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {ROW_1.map((cfg) => (
          <BlockInput key={cfg.fieldKey} {...cfg} evalData={evalData} handleBlockValueChange={handleBlockValueChange} />
        ))}
      </div>

      {/* Row 2: Blocks 24‑26 + 30 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {ROW_2.map((cfg) => (
          <BlockInput key={cfg.fieldKey} {...cfg} evalData={evalData} handleBlockValueChange={handleBlockValueChange} />
        ))}

        {/* Block 30: Date Counseled (has validation message) */}
        <div>
          <label className={LABEL}>Block 30: Date Counseled</label>
          <input
            type="text"
            placeholder="YYMMMDD or NOT REQ"
            value={evalData.block_values?.date_counseled || ''}
            onChange={(e) => handleBlockValueChange({ date_counseled: e.target.value.toUpperCase() })}
            className={FIELD}
          />
          {issues.find((i) => i.field === 'date_counseled') && (
            <p className="text-red-400 text-xs mt-1">
              {issues.find((i) => i.field === 'date_counseled')?.message}
            </p>
          )}
        </div>
      </div>

      {/* Free‑form text areas: Blocks 28 & 29 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div>
          <label className={LABEL}>Block 28: Command Employment and Achievements</label>
          <textarea
            placeholder="Describe command achievements..."
            value={evalData.block_values?.command_achievements || ''}
            onChange={(e) => handleBlockValueChange({ command_achievements: e.target.value })}
            className={`${FIELD} h-20`}
          />
        </div>
        <div>
          <label className={LABEL}>Block 29: Primary/Collateral/Watchstanding Duties</label>
          <textarea
            placeholder="Describe sailor primary duties..."
            value={evalData.block_values?.primary_duties || ''}
            onChange={(e) => handleBlockValueChange({ primary_duties: e.target.value })}
            className={`${FIELD} h-20`}
          />
        </div>
      </div>
    </div>
  )
}
