// app/evaluations/[id]/page.tsx
//
// The report screen — workflow hub for a single evaluation.

"use client"

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { loadById } from '@/lib/evaluationService'
import { getProfile } from '@/lib/profileService'
import { fetchGroupAveragePool, fetchGroupDistribution } from '@/lib/summaryGroupService'
import { canPerformAction, canViewSummaryAverage } from '@/lib/permissions'
import { fetchAuditLogs, AuditLog } from '@/lib/auditService'
import { Evaluation, Profile } from '@/types'
import AppShell from '@/components/layout/AppShell'
import ReviewPanel from '@/components/Reviewer/ReviewPanel'
import PDFPreview from '@/components/PDFPreview'
import CredentialSignatureModal from '@/components/CredentialSignatureModal'
import DetailsTab, { OnSign } from '@/components/report/DetailsTab'
import AuditTab from '@/components/report/AuditTab'
import { ReportHeaderActions, ReportBanner, ReportTabs, ReportTab } from '@/components/report/ReportChrome'

export default function ViewEvaluationPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<ReportTab>('details')
  const [signing, setSigning] = useState<{ block: number; label: string; signer: string } | null>(null)

  const loadAllData = async () => {
    try {
      const session = await getSession()
      if (!session?.user) { router.push('/login'); return }
      const viewer = await getProfile(session.user.id)
      setProfile(viewer)
      if (!id) return
      const ev = await loadById(id)
      if (canViewSummaryAverage(viewer.preferred_role, ev)) {
        try {
          ev.summary_group_average = (await fetchGroupAveragePool(ev.id!)).average
        } catch (e) {
          console.warn('Could not compute summary group average:', e)
        }
        if (ev.summary_group_id) {
          try {
            ev.summary_group_distribution = (await fetchGroupDistribution(ev.id!)).distribution
          } catch (e) {
            console.warn('Could not compute summary group distribution:', e)
          }
        }
      }
      setEvaluation(ev)
      try {
        setAuditLogs(((await fetchAuditLogs(id)) || []) as AuditLog[])
      } catch (auditErr) {
        console.error('Audit log load failed (non-fatal):', auditErr)
        setAuditLogs([])
      }
    } catch (err: any) {
      console.error('Failed to load evaluation context:', err)
      setError(err.message || 'Failed to load evaluation')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAllData() }, [id, router])

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab === 'details' || tab === 'preview' || tab === 'review' || tab === 'audit') {
      setActiveTab(tab)
    }
  }, [])

  if (loading) return <CenterMessage text="Loading evaluation details..." />
  if (error || !evaluation || !profile) return <LoadError message={error} onBack={() => router.push('/dashboard')} />

  const canEdit = canPerformAction(profile, 'edit_evaluation', evaluation)
  const canSeeSummaryAvg = canViewSummaryAverage(profile.preferred_role, evaluation)
  const onSign: OnSign = (block, label, signer) => setSigning({ block, label, signer })

  return (
    <AppShell
      profile={profile}
      title={evaluation.member_name}
      subtitle="NAVPERS 1616/26 · Performance Evaluation Report"
      badge={evaluation.status === 'draft' ? 'View Draft' : 'View Report'}
      maxWidth="5xl"
      headerActions={
        <ReportHeaderActions
          evaluation={evaluation}
          canEdit={canEdit}
          onEdit={() => router.push(`/evaluations/${evaluation.id}/edit`)}
          onExport={() => router.push(`/evaluations/${evaluation.id}/export`)}
        />
      }
    >
      <div className="space-y-6">
        <ReportBanner evaluation={evaluation} showSummaryAverage={canSeeSummaryAvg} />
        <ReportTabs active={activeTab} onChange={setActiveTab} />

        {activeTab === 'details' && <DetailsTab evaluation={evaluation} onSign={onSign} />}
        {activeTab === 'preview' && <PDFPreview evaluation={evaluation} allowDownload={false} />}
        {activeTab === 'review' && (
          <div className="space-y-4">
            <p className="apex-info-box">
              <span className="font-semibold text-[var(--accent-cyan)]">Review Workflow</span>
              {' '}— route this report through the chain of command, attach summary groups, recycle for correction, or begin debrief.
            </p>
            <ReviewPanel evaluation={evaluation} currentUser={profile} onWorkflowAction={loadAllData} />
          </div>
        )}
        {activeTab === 'audit' && <AuditTab auditLogs={auditLogs} />}

        {signing && (
          <CredentialSignatureModal
            evaluationId={evaluation.id!}
            block={signing.block}
            blockLabel={signing.label}
            signer={signing.signer}
            defaultTypedName={signing.block === 51 || signing.block === 32 ? evaluation.member_name : ''}
            onClose={() => setSigning(null)}
            onSigned={() => { setSigning(null); loadAllData() }}
          />
        )}
      </div>
    </AppShell>
  )
}

function CenterMessage({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen text-sm font-mono" style={{ background: 'var(--background)', color: 'var(--muted-foreground)' }}>
      {text}
    </div>
  )
}

function LoadError({ message, onBack }: { message: string | null; onBack: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center" style={{ background: 'var(--background)' }}>
      <div className="apex-card p-6 max-w-md space-y-4 border-red-500/30">
        <h3 className="text-lg font-bold text-red-400">Failed to Load Report</h3>
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{message || 'Record not found or access denied.'}</p>
        <button type="button" onClick={onBack} className="apex-btn-secondary">Return to Dashboard</button>
      </div>
    </div>
  )
}
