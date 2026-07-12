// components/report/ReportChrome.tsx
//
// Presentational chrome for the report screen (mockup 3 workflow layout).

import React from 'react'
import { Evaluation } from '@/types'

export type ReportTab = 'details' | 'preview' | 'review' | 'audit'

export function ReportHeaderActions({ evaluation, canEdit, onEdit, onExport }: {
  evaluation: Evaluation; canEdit: boolean; onEdit: () => void; onExport: () => void
}) {
  return (
    <>
      {canEdit && (
        <button type="button" onClick={onEdit} className="apex-btn-secondary">
          {evaluation?.status === 'draft' ? 'Edit Draft' : 'Edit Report'}
        </button>
      )}
      <button type="button" onClick={onExport} className="apex-btn-success">Verify & Export</button>
    </>
  )
}

export function ReportBanner({ evaluation, showSummaryAverage }: { evaluation: Evaluation; showSummaryAverage?: boolean }) {
  const stage = evaluation.routing_stage?.replace(/_/g, ' ') || 'sailor'
  return (
    <div className="apex-card-elevated p-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <span className="apex-badge">{evaluation.status}</span>
          {evaluation.routing_stage && <span className="apex-badge-amber">{stage}</span>}
        </div>
        <h2 className="text-2xl font-bold text-white">{evaluation.member_name}</h2>
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>
          DoD ID {evaluation.dod_id} · {evaluation.grade_rate} · UIC {evaluation.uic}
        </p>
      </div>
      <div
        className="flex items-center gap-6 rounded-xl px-6 py-4 w-full lg:w-auto"
        style={{ background: 'var(--form-panel)', border: '1px solid var(--border-strong)' }}
      >
        <Stat label="Trait Avg (40)" value={evaluation.trait_average ? evaluation.trait_average.toFixed(2) : '0.00'} accent="text-emerald-400" />
        {showSummaryAverage && (
          <>
            <Divider />
            <Stat label="Group Avg (50a)" value={evaluation.summary_group_average != null ? evaluation.summary_group_average.toFixed(2) : '—'} accent="" style={{ color: 'var(--accent-cyan)' }} />
          </>
        )}
        <Divider />
        <Stat label="Promotion Rec" value={evaluation.promotion_recommendation || 'NOB'} accent="text-white text-sm" />
      </div>
    </div>
  )
}

function Stat({ label, value, accent, style }: { label: string; value: string; accent: string; style?: React.CSSProperties }) {
  return (
    <div className="text-center flex-1 lg:flex-none">
      <div className="text-[10px] uppercase font-bold tracking-wider" style={{ color: 'var(--subtle)' }}>{label}</div>
      <div className={`text-2xl font-black mt-0.5 ${accent}`} style={style}>{value}</div>
    </div>
  )
}

function Divider() {
  return <div className="h-10 w-px" style={{ background: 'var(--border)' }} />
}

/** Mockup 3 order — Review Workflow is the hub, placed early. */
const TABS: { id: ReportTab; label: string; workflow?: boolean }[] = [
  { id: 'details', label: 'Form Details' },
  { id: 'review', label: 'Review Workflow', workflow: true },
  { id: 'preview', label: 'Document Preview' },
  { id: 'audit', label: 'Audit History' },
]

export function ReportTabs({ active, onChange }: { active: ReportTab; onChange: (t: ReportTab) => void }) {
  return (
    <div className="apex-tabs" role="tablist">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={active === t.id}
          onClick={() => onChange(t.id)}
          className={`apex-tab ${active === t.id ? 'apex-tab-active' : ''} ${t.workflow && active !== t.id ? 'text-[var(--accent-gold)]/80' : ''}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
