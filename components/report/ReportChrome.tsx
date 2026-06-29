// components/report/ReportChrome.tsx
//
// Presentational chrome for the report screen: header, banner, and tab strip.

import React from 'react'
import { Evaluation } from '@/types'

export type ReportTab = 'details' | 'preview' | 'review' | 'audit'

export function ReportHeader({ evaluation, isOwner, onDashboard, onEdit, onExport }: {
  evaluation: Evaluation; isOwner: boolean; onDashboard: () => void; onEdit: () => void; onExport: () => void
}) {
  return (
    <header className="px-6 py-4 flex items-center justify-between border-b border-[#1c2541] glass-panel mb-6">
      <div className="flex items-center gap-3">
        <span className="font-extrabold text-xl tracking-wider text-white">APEX</span>
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#1c2541] text-[#3e6e99]">
          {evaluation?.status === 'draft' ? 'VIEW DRAFT' : 'VIEW REPORT'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button onClick={onDashboard} className="text-xs text-slate-400 hover:text-white transition px-3 py-1.5">Dashboard</button>
        {isOwner && evaluation?.status === 'draft' && (
          <button onClick={onEdit} className="px-4 py-1.5 rounded bg-[#3e6e99] hover:bg-[#4e82b0] text-xs font-semibold text-white transition">Edit Draft</button>
        )}
        {isOwner && (
          <button onClick={onExport} className="px-4 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 text-xs font-semibold text-white transition shadow-md">Verify & Export</button>
        )}
      </div>
    </header>
  )
}

export function ReportBanner({ evaluation, showSummaryAverage }: { evaluation: Evaluation; showSummaryAverage?: boolean }) {
  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/40 p-6 rounded-xl border border-slate-800">
      <div>
        <span className="text-[10px] px-2.5 py-0.5 rounded bg-blue-950 text-blue-300 font-bold uppercase tracking-wider border border-blue-900/30">
          {evaluation.status}
        </span>
        <h2 className="text-2xl font-bold text-white mt-2">{evaluation.member_name}</h2>
        <p className="text-xs text-slate-400 mt-1">
          DoD ID: {evaluation.dod_id} | Grade/Rate: {evaluation.grade_rate} | UIC: {evaluation.uic}
        </p>
      </div>
      <div className="flex items-center gap-6 bg-[#111c38]/40 px-6 py-4 rounded-xl border border-slate-800">
        <div className="text-center">
          <div className="text-[10px] text-slate-500 uppercase font-semibold">Trait Average (40)</div>
          <div className="text-xl font-black text-emerald-400 mt-1">{evaluation.trait_average ? evaluation.trait_average.toFixed(2) : '0.00'}</div>
        </div>
        {showSummaryAverage && (
          <>
            <div className="h-8 w-px bg-slate-800"></div>
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Summary Group Avg (50a)</div>
              <div className="text-xl font-black text-sky-300 mt-1">{evaluation.summary_group_average != null ? evaluation.summary_group_average.toFixed(2) : '—'}</div>
            </div>
          </>
        )}
        <div className="h-8 w-px bg-slate-800"></div>
        <div className="text-center">
          <div className="text-[10px] text-slate-500 uppercase font-semibold">Promotion Rec</div>
          <div className="text-sm font-bold text-white mt-1">{evaluation.promotion_recommendation || 'NOB'}</div>
        </div>
      </div>
    </div>
  )
}

const TABS: { id: ReportTab; label: string }[] = [
  { id: 'details', label: 'Form Details' },
  { id: 'preview', label: 'Document Preview' },
  { id: 'review', label: 'Review Workflow' },
  { id: 'audit', label: 'Audit History' },
]

export function ReportTabs({ active, onChange }: { active: ReportTab; onChange: (t: ReportTab) => void }) {
  return (
    <div className="flex border-b border-slate-800 gap-1">
      {TABS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 py-2.5 text-sm font-semibold transition border-b-2 -mb-px ${
            active === t.id ? 'border-[#3e6e99] text-white' : 'border-transparent text-slate-500 hover:text-slate-300'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
