// components/blocks/Block1Name/Block1Fields.tsx
// fallow-ignore-next-line complexity
import React from 'react'
import { Evaluation, ValidationIssue } from '@/types'

type Props = {
  evalData: Evaluation
  onChange: (fields: Partial<Evaluation>) => void
  issues: ValidationIssue[]
}

export default function Block1Fields({ evalData, onChange, issues }: Props) {
  const getError = (field: string) => issues.find(i => i.field === field)?.message
  const fieldClass = (hasError: boolean) =>
    `w-full bg-[#1c2541]/40 border rounded px-3 py-2 text-foreground focus:outline-none transition duration-150 ${
      hasError
        ? 'border-red-500/80 focus:border-red-400 focus:ring-1 focus:ring-red-400'
        : 'border-slate-700/60 focus:border-[#3e6e99] focus:ring-1 focus:ring-[#3e6e99]'
    }`
  const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1'

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      {/* Block 1 – Name */}
      <div>
        <label className={labelClass}>Block 1: Name (Last, First MI)</label>
        <input
          type="text"
          placeholder="DAIN, FRANKLYN A"
          value={evalData.member_name}
          onChange={e => onChange({ member_name: e.target.value.toUpperCase() })}
          className={fieldClass(!!getError('member_name'))}
        />
        {getError('member_name') && (
          <p className="text-red-400 text-xs mt-1">{getError('member_name')}</p>
        )}
      </div>
      {/* Block 2 – Grade/Rate */}
      <div>
        <label className={labelClass}>Block 2: Grade/Rate</label>
        <input
          type="text"
          placeholder="PO2"
          value={evalData.grade_rate}
          onChange={e => onChange({ grade_rate: e.target.value.toUpperCase() })}
          className={fieldClass(!!getError('grade_rate'))}
        />
        {getError('grade_rate') && (
          <p className="text-red-400 text-xs mt-1">{getError('grade_rate')}</p>
        )}
      </div>
      {/* Block 3 – Designator */}
      <div>
        <label className={labelClass}>Block 3: Designator</label>
        <input
          type="text"
          placeholder="1110"
          value={evalData.designator || ''}
          onChange={e => onChange({ designator: e.target.value.toUpperCase() })}
          className={fieldClass(!!getError('designator'))}
        />
        {getError('designator') && (
          <p className="text-red-400 text-xs mt-1">{getError('designator')}</p>
        )}
      </div>
      {/* Block 4 – DoD ID */}
      <div>
        <label className={labelClass}>Block 4: DoD ID</label>
        <input
          type="text"
          placeholder="10-digit number"
          maxLength={10}
          value={evalData.dod_id}
          onChange={e => onChange({ dod_id: e.target.value.replace(/[^0-9]/g, '') })}
          className={fieldClass(!!getError('dod_id'))}
        />
        {getError('dod_id') && (
          <p className="text-red-400 text-xs mt-1">{getError('dod_id')}</p>
        )}
      </div>
    </div>
  )
}
