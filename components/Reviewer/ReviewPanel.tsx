// components/Reviewer/ReviewPanel.tsx
//
// Routing panel for the report screen's "Review Workflow" tab. Renders the action(s)
// available at the eval's current routing_stage to the current custodian (route
// forward / recycle / begin debrief / minor corrections / unlock), a status banner for
// everyone else, and the recycle-comment feedback timeline. Each piece is a small
// sub-component to maintain readability and separation of concerns.

"use client"

import React, { useEffect, useState } from 'react'
import { Evaluation, Profile } from '@/types'
import { createBrowserClient } from '@/lib/supabaseClient'
import { hasPermission } from '@/lib/permissions'
import { NEXT_ROLE_BY_STAGE, MINOR_CORRECTION_KEYS } from '@/lib/routing'
import {
  routeForward, recycleForCorrection, beginDebrief, applyMinorCorrection, setLock, fetchReviewApprovals,
} from '@/lib/evaluationService'
import { listOpenGroups, attachSummaryGroup } from '@/lib/summaryGroupService'
import { describeSummaryGroup, visibleSummaryGroupsForEval } from '@/lib/summaryGroupEligibility'
import { paygradeOf } from '@/lib/paygrade'

const BTN_PRIMARY = 'apex-btn-primary'
const BTN_SECONDARY = 'apex-btn-secondary'
const BTN_DANGER = 'apex-btn-danger'
const FIELD = 'apex-input'
const STAGE_LABEL: Record<string, string> = {
  sailor: 'Sailor (draft)', rater: 'Rater', senior_rater: 'Senior Rater',
  reporting_senior: 'Reporting Senior', admin: 'Admin', debrief: 'Debrief', locked: 'Locked',
}
type Run = (fn: () => Promise<any>) => void

interface Props { evaluation: Evaluation; currentUser: Profile; onWorkflowAction: () => void }

export default function ReviewPanel({ evaluation, currentUser, onWorkflowAction }: Props) {
  const [approvals, setApprovals] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (evaluation.id) fetchReviewApprovals(evaluation.id).then((d) => setApprovals(d || [])).catch(() => {})
  }, [evaluation.id])

  const stage = evaluation.routing_stage || 'sailor'
  const isHolder = evaluation.current_holder_id === currentUser.id
  const locked = !!evaluation.signature_locked || stage === 'locked'
  const canDebrief = hasPermission(currentUser.preferred_role, 'debrief_evaluation')

  const run: Run = async (fn) => {
    setLoading(true); setError(null)
    try { await fn(); onWorkflowAction() }
    catch (e: any) { setError(e.message || 'Action failed.') }
    finally { setLoading(false) }
  }

  return (
    <div className="apex-card p-6 space-y-6">
      <div className="border-b pb-3" style={{ borderColor: 'var(--border)' }}>
        <h3 className="apex-section-title">Routing Workflow</h3>
        <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
          Current stage: <span className="font-semibold text-white">{STAGE_LABEL[stage] || stage}</span>
          {locked && <span className="ml-2 text-amber-400 font-semibold">· Locked</span>}
        </p>
      </div>

      {error && <p className="text-red-400 text-xs font-semibold">{error}</p>}

      {locked ? (
        <LockedBanner canDebrief={canDebrief} loading={loading} onUnlock={() => run(() => setLock(evaluation.id!, false))} />
      ) : stage === 'debrief' ? (
        <DebriefActions evaluation={evaluation} currentUser={currentUser} run={run} loading={loading} />
      ) : isHolder ? (
        <HolderActions evaluation={evaluation} stage={stage} canDebrief={canDebrief} run={run} loading={loading} />
      ) : (
        <p className="text-sm rounded-lg p-4 apex-card" style={{ color: 'var(--muted-foreground)' }}>
          This report is currently with the <span className="font-semibold text-white">{STAGE_LABEL[stage] || stage}</span>. You'll
          regain access if it is recycled to you or opened for debrief corrections.
        </p>
      )}

      <FeedbackTimeline approvals={approvals} />
    </div>
  )
}

/* ── Stage actions for the current holder ─────────────────────────────────── */

function HolderActions({ evaluation, stage, canDebrief, run, loading }: {
  evaluation: Evaluation; stage: string; canDebrief: boolean; run: Run; loading: boolean
}) {
  return (
    <div className="space-y-5">
      <RouteForward evaluation={evaluation} stage={stage} run={run} loading={loading} />
      {stage !== 'sailor' && <RecycleAction evaluation={evaluation} run={run} loading={loading} />}
      {(stage === 'reporting_senior' || stage === 'admin') && canDebrief && (
        <button className={`${BTN_PRIMARY} !bg-amber-600 hover:!bg-amber-500`} disabled={loading}
          onClick={() => run(() => beginDebrief(evaluation.id!))}>
          Begin Debrief
        </button>
      )}
    </div>
  )
}

function RouteForward({ evaluation, stage, run, loading }: {
  evaluation: Evaluation; stage: string; run: Run; loading: boolean
}) {
  const role = NEXT_ROLE_BY_STAGE[stage]
  const [targets, setTargets] = useState<any[]>([])
  const [sel, setSel] = useState('')

  useEffect(() => {
    if (!role) return
    createBrowserClient().from('profiles').select('id,first_name,last_name,preferred_role').eq('preferred_role', role)
      .then(({ data }) => {
        const list = data || []
        setTargets(list)
        // Keep an existing pick (manual or programmatic) when the list refreshes.
        setSel((prev) => (prev && list.some((t) => t.id === prev) ? prev : list[0]?.id ?? ''))
      })
  }, [role])

  if (!role) return null
  return (
    <div className="space-y-2">
      {stage === 'sailor' && <GroupPicker evaluation={evaluation} run={run} loading={loading} />}
      <label className="apex-label">Route forward to a {role}</label>
      <select className={FIELD} value={sel} onChange={(e) => setSel(e.target.value)}>
        {targets.length === 0 && <option value="">No {role} found</option>}
        {targets.map((t) => <option key={t.id} value={t.id}>{t.last_name}, {t.first_name}</option>)}
      </select>
      <button className={BTN_PRIMARY} disabled={loading || !sel}
        onClick={() => run(() => routeForward(evaluation.id!, sel))}>
        Route Forward →
      </button>
    </div>
  )
}

function GroupPicker({ evaluation, run, loading }: { evaluation: Evaluation; run: Run; loading: boolean }) {
  const [groups, setGroups] = useState<Awaited<ReturnType<typeof listOpenGroups>>>([])
  const [loaded, setLoaded] = useState(false)
  const [sel, setSel] = useState(evaluation.summary_group_id || '')
  useEffect(() => {
    listOpenGroups()
      .then(setGroups)
      .catch(() => {})
      .finally(() => setLoaded(true))
  }, [])
  const visible = visibleSummaryGroupsForEval(evaluation, groups)
  const memberPaygrade = paygradeOf(evaluation.grade_rate)
  if (!loaded) return null
  return (
    <div className="space-y-2 pb-3 mb-1 border-b" style={{ borderColor: 'var(--border)' }}>
      <label className="apex-label">Summary Group (optional)</label>
      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--subtle)' }}>
        Only groups matching your paygrade, promotion status, ending date, and reporting senior are shown
        {memberPaygrade ? ` (${evaluation.grade_rate} · ${memberPaygrade})` : ''}.
      </p>
      {visible.length === 0 ? (
        <p className="text-xs text-slate-500 italic">No eligible open summary groups for this report.</p>
      ) : (
        <select className={FIELD} value={sel} onChange={(e) => setSel(e.target.value)}>
          <option value="">— None —</option>
          {visible.map((g) => <option key={g.id} value={g.id}>{describeSummaryGroup(g)}</option>)}
        </select>
      )}
      <button className={BTN_SECONDARY} disabled={loading || (sel !== '' && !visible.some((g) => g.id === sel))}
        onClick={() => run(() => attachSummaryGroup(evaluation.id!, sel || null))}>
        Attach Group
      </button>
    </div>
  )
}

function RecycleAction({ evaluation, run, loading }: { evaluation: Evaluation; run: Run; loading: boolean }) {
  const [comments, setComments] = useState('')
  return (
    <div className="space-y-2 border-t pt-4" style={{ borderColor: 'var(--border)' }}>
      <label className="apex-label">Recycle for correction (one step back)</label>
      <textarea className={`${FIELD} h-16`} placeholder="What needs correcting?" value={comments} onChange={(e) => setComments(e.target.value)} />
      <button className={BTN_DANGER} disabled={loading || !comments.trim()}
        onClick={() => run(() => recycleForCorrection(evaluation.id!, comments))}>
        ← Recycle to Previous Holder
      </button>
    </div>
  )
}

function DebriefActions({ evaluation, currentUser, run, loading }: {
  evaluation: Evaluation; currentUser: Profile; run: Run; loading: boolean
}) {
  const isParticipant = (evaluation.participants || []).includes(currentUser.id)
  return (
    <div className="space-y-4">
      <p className="text-sm text-amber-300 bg-amber-950/20 border border-amber-900/40 rounded-lg p-3">
        Debrief in progress — participants may make minor corrections. The Reporting Senior signs Block 50 (Details tab) to lock the report.
      </p>
      {isParticipant
        ? <MinorCorrectionForm evaluation={evaluation} run={run} loading={loading} />
        : <p className="text-xs text-slate-500">Only people who handled this report may make corrections.</p>}
    </div>
  )
}

function MinorCorrectionForm({ evaluation, run, loading }: { evaluation: Evaluation; run: Run; loading: boolean }) {
  const bv = evaluation.block_values || {}
  const [patch, setPatch] = useState<Record<string, string>>({
    comments: evaluation.comments || '',
    qualifications: bv.qualifications || '',
  })
  const set = (k: string, v: string) => setPatch((p) => ({ ...p, [k]: v }))
  return (
    <div className="space-y-2">
      <label className="apex-label">Block 43: Comments</label>
      <textarea className={`${FIELD} h-20`} value={patch.comments} onChange={(e) => set('comments', e.target.value)} />
      <label className="apex-label">Block 44: Qualifications</label>
      <textarea className={`${FIELD} h-14`} value={patch.qualifications} onChange={(e) => set('qualifications', e.target.value)} />
      <button className={BTN_PRIMARY} disabled={loading}
        onClick={() => run(() => applyMinorCorrection(evaluation.id!, patch))}>
        Apply Minor Corrections
      </button>
      <p className="text-[10px] text-slate-500">Only {MINOR_CORRECTION_KEYS.length} whitelisted fields are editable during debrief.</p>
    </div>
  )
}

function LockedBanner({ canDebrief, loading, onUnlock }: { canDebrief: boolean; loading: boolean; onUnlock: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-emerald-300 bg-emerald-950/20 border border-emerald-900/40 rounded-lg p-3">
        ✓ Signed by the Reporting Senior and locked for editing. Export it from the report header for transmission to PERS-32 or printing.
      </p>
      {canDebrief && (
        <button className={BTN_SECONDARY} disabled={loading} onClick={onUnlock}>
          Unlock / Release for Correction
        </button>
      )}
    </div>
  )
}

function FeedbackTimeline({ approvals }: { approvals: any[] }) {
  if (!approvals.length) return null
  return (
    <div className="border-t border-slate-800 pt-4 space-y-3">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Recycle / Review History</h4>
      <div className="space-y-3 pl-5 border-l border-slate-800">
        {approvals.map((a, idx) => (
          <div key={a.id || idx} className="relative space-y-1">
            <span className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ${a.approval_status === 'approved' ? 'bg-emerald-500' : a.approval_status === 'returned' ? 'bg-red-500' : 'bg-slate-500'}`} />
            <div className="flex justify-between items-center text-xs">
              <span className="font-semibold text-slate-200">{a.profiles?.last_name}, {a.profiles?.first_name} ({a.profiles?.preferred_role})</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border bg-slate-800 text-slate-400 border-slate-700">{a.approval_status}</span>
            </div>
            {a.reviewer_comments && <p className="text-xs text-slate-400 italic bg-slate-950/30 p-2.5 rounded-lg border border-slate-900/60 mt-1">"{a.reviewer_comments}"</p>}
            <span className="text-[10px] text-slate-500 block">{new Date(a.created_at).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
