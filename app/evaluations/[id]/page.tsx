// app/evaluations/[id]/page.tsx
//
// The report screen — the workflow hub for a single evaluation. Loads the eval,
// profile, and audit logs, then composes the decomposed report pieces. Signing is
// owned here (one CredentialSignatureModal instance) and delegated down via onSign.

"use client"

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { loadById } from '@/lib/evaluationService'
import { getProfile } from '@/lib/profileService'
import { fetchAuditLogs, AuditLog } from '@/lib/auditService'
import { Evaluation, Profile } from '@/types'
import ReviewPanel from '@/components/Reviewer/ReviewPanel'
import CredentialSignatureModal from '@/components/CredentialSignatureModal'
import DetailsTab, { OnSign } from '@/components/report/DetailsTab'
import AuditTab from '@/components/report/AuditTab'
import { ReportHeader, ReportBanner, ReportTabs, ReportTab } from '@/components/report/ReportChrome'

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
      setProfile(await getProfile(session.user.id))
      if (!id) return
      setEvaluation(await loadById(id))
      // Audit logs are a secondary tab — never let their failure block the whole report.
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

  if (loading) return <CenterMessage text="Loading evaluation details..." />
  if (error || !evaluation || !profile) return <LoadError message={error} onBack={() => router.push('/dashboard')} />

  const isOwner = evaluation.created_by === profile.id
  const onSign: OnSign = (block, label, signer) => setSigning({ block, label, signer })

  return (
    <div className="min-h-screen bg-[#0b132b] text-[#f0f4f8]">
      <ReportHeader
        evaluation={evaluation}
        isOwner={isOwner}
        onDashboard={() => router.push('/dashboard')}
        onEdit={() => router.push(`/evaluations/${evaluation.id}/edit`)}
        onExport={() => router.push(`/evaluations/${evaluation.id}/export`)}
      />
      <main className="max-w-5xl mx-auto px-4 pb-12 space-y-6">
        <ReportBanner evaluation={evaluation} />
        <ReportTabs active={activeTab} onChange={setActiveTab} />

        {activeTab === 'details' && <DetailsTab evaluation={evaluation} onSign={onSign} />}
        {activeTab === 'review' && <ReviewPanel evaluation={evaluation} currentUser={profile} onWorkflowAction={loadAllData} />}
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
      </main>
    </div>
  )
}

function CenterMessage({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-[#0b132b] text-[#608bb3] font-mono text-sm">{text}</div>
  )
}

function LoadError({ message, onBack }: { message: string | null; onBack: () => void }) {
  return (
    <div className="min-h-screen bg-[#0b132b] flex flex-col items-center justify-center p-6 text-center">
      <div className="bg-red-950/35 border border-red-900/40 rounded-xl p-6 max-w-md space-y-4">
        <h3 className="text-lg font-bold text-red-400">Failed to Load Report</h3>
        <p className="text-sm text-slate-400">{message || 'Record not found or access denied.'}</p>
        <button onClick={onBack} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs text-white transition">
          Return to Dashboard
        </button>
      </div>
    </div>
  )
}
