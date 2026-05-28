// components/blocks/EvaluationFormParts/Block42Signatures.tsx
//
// Handles Blocks 41 (career recommendations), 44 (qualifications),
// 45 (promotion), 47 (retention), and 42/48-50 (signatures).

import React from 'react'
import { Evaluation, ValidationIssue } from '@/types'
import { PROMOTION_RECOMMENDATIONS, RETENTION_OPTIONS } from '@/types/navpers'

type Props = {
  evalData: Evaluation
  onChange: (fields: Partial<Evaluation>) => void
  handleBlockValueChange: (fields: Record<string, any>) => void
  issues: ValidationIssue[]
}

const LABEL = 'block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1'
const FIELD = 'w-full bg-[#1c2541]/40 border border-slate-700/60 rounded px-3 py-2 text-foreground focus:outline-none focus:border-[#3e6e99] focus:ring-1 focus:ring-[#3e6e99] transition duration-150'

export default function Block42Signatures({ evalData, onChange, handleBlockValueChange, issues }: Props) {
  const issueFor = (field: string) => issues.find((i) => i.field === field)

  return (
    <div className="glass-panel rounded-xl p-6">
      <h3 className="text-lg font-bold gold-accent mb-4 border-b border-slate-700/40 pb-2">
        Recommendations &amp; Signatures (Blocks 41 - 52)
      </h3>

      {/* Block 41 / 45 / 47 */}
      <RecommendationsRow evalData={evalData} onChange={onChange} issueFor={issueFor} />

      {/* Block 44 Qualifications */}
      <div className="mb-6">
        <label className={LABEL}>Block 44: Qualifications / Achievements</label>
        <textarea
          placeholder="List qualifications, degrees, designations, etc."
          value={evalData.block_values?.qualifications_achievements || ''}
          onChange={(e) => handleBlockValueChange({ qualifications_achievements: e.target.value })}
          className={`${FIELD} h-20`}
        />
      </div>

      {/* Signature Blocks 42, 48, 49, 50 */}
      <SignatureRow handleBlockValueChange={handleBlockValueChange} evalData={evalData} />
    </div>
  )
}

/* ── Sub‑helpers (reduce main function LOC) ──────── */

function RecommendationsRow({
  evalData,
  onChange,
  issueFor,
}: {
  evalData: Evaluation
  onChange: (fields: Partial<Evaluation>) => void
  issueFor: (f: string) => ValidationIssue | undefined
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      {/* Block 41 */}
      <div>
        <label className={LABEL}>Block 41: Career Recommendations (One per line)</label>
        <textarea
          placeholder={'e.g. NAVY RECRUITER\nSEAL CHALLENGE'}
          value={evalData.career_recommendations?.join('\n') || ''}
          onChange={(e) => onChange({ career_recommendations: e.target.value.split('\n') })}
          className={`${FIELD} h-24`}
        />
      </div>

      {/* Block 45 */}
      <div>
        <label className={LABEL}>Block 45: Promotion Recommendation</label>
        <select
          value={evalData.promotion_recommendation}
          onChange={(e) => onChange({ promotion_recommendation: e.target.value as any })}
          className={FIELD}
        >
          {PROMOTION_RECOMMENDATIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
        {issueFor('promotion_recommendation') && (
          <p className="text-red-400 text-xs mt-1 font-semibold">
            ⚠️ {issueFor('promotion_recommendation')?.message}
          </p>
        )}
      </div>

      {/* Block 47 */}
      <div>
        <label className={LABEL}>Block 47: Retention Recommendation</label>
        <select
          value={evalData.retention}
          onChange={(e) => onChange({ retention: e.target.value as any })}
          className={FIELD}
        >
          {RETENTION_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

function SignatureRow({
  evalData,
  handleBlockValueChange,
}: {
  evalData: Evaluation
  handleBlockValueChange: (fields: Record<string, any>) => void
}) {
  const sigs = [
    { block: 42, label: 'Rater Signature', key: 'rater_signature' },
    { block: 48, label: 'Senior Rater Signature', key: 'senior_rater_signature' },
    { block: 49, label: 'Member Signature', key: 'member_signature' },
    { block: 50, label: 'Reporting Senior Signature', key: 'reporting_senior_signature' },
  ] as const

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-800/60 pt-4">
      {sigs.map(({ block, label, key }) => (
        <div key={key}>
          <label className={LABEL}>Block {block}: {label}</label>
          <input
            type="text"
            placeholder="e.g. Signature on file"
            value={evalData.block_values?.[key] || ''}
            onChange={(e) => handleBlockValueChange({ [key]: e.target.value })}
            className={FIELD}
          />
        </div>
      ))}
    </div>
  )
}
