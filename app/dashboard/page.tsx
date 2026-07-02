"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { useEvaluations } from '@/hooks/useEvaluations'
import { createBrowserClient } from '@/lib/supabaseClient'
import AppShell from '@/components/layout/AppShell'
import UserAvatar, { getMemberInitials } from '@/components/brand/UserAvatar'

const supabase = createBrowserClient()

const STAGE_LABEL: Record<string, string> = {
  sailor: 'Sailor',
  rater: 'Rater',
  senior_rater: 'Senior Rater',
  reporting_senior: 'Reporting Senior',
  admin: 'Admin',
  debrief: 'Debrief',
  locked: 'Locked',
}

function statusBadgeClass(status: string, routingStage?: string) {
  if (routingStage === 'locked' || status === 'completed' || status === 'archived') return 'apex-badge-locked'
  if (routingStage && routingStage !== 'sailor') return 'apex-badge-routing'
  if (status === 'ready_for_review') return 'apex-badge-review'
  return 'apex-badge-draft'
}

function statusLabel(status: string, routingStage?: string) {
  if (routingStage && routingStage !== 'sailor' && routingStage !== 'locked') {
    return STAGE_LABEL[routingStage] || routingStage.replace(/_/g, ' ')
  }
  return status.replace(/_/g, ' ')
}

function DashboardStat({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className="apex-dashboard-stat">
      <span className="apex-dashboard-stat-value" style={highlight ? { color: '#fbbf24' } : undefined}>{value}</span>
      <span className="apex-dashboard-stat-label">{label}</span>
    </div>
  )
}

function evalAvatarTone(status: string, routingStage?: string): 'blue' | 'amber' | 'cyan' | 'slate' {
  if (routingStage === 'locked' || status === 'completed' || status === 'archived') return 'slate'
  if (routingStage && routingStage !== 'sailor') return 'amber'
  if (status === 'ready_for_review') return 'cyan'
  return 'blue'
}

function EvalCard({ ev, onView, onEdit, showEdit }: {
  ev: any; onView: () => void; onEdit?: () => void; showEdit?: boolean
}) {
  const badgeClass = statusBadgeClass(ev.status, ev.routing_stage)
  const badgeText = statusLabel(ev.status, ev.routing_stage).toUpperCase()

  return (
    <article className="apex-dashboard-card">
      <div className="flex justify-between items-start gap-3">
        <div className="flex gap-3 min-w-0 flex-1">
          <UserAvatar
            initials={getMemberInitials(ev.member_name)}
            tone={evalAvatarTone(ev.status, ev.routing_stage)}
            size="md"
            className="mt-0.5"
          />
          <div className="min-w-0 space-y-1">
            <h4 className="text-lg font-bold text-white truncate leading-tight">
              {ev.member_name || 'UNNAMED SAILOR'}
            </h4>
            <p className="text-sm font-medium" style={{ color: 'var(--label)' }}>
              {ev.grade_rate}
              <span style={{ color: 'var(--subtle)' }}> · </span>
              UIC {ev.uic || '—'}
            </p>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Period {ev.period_from} – {ev.period_to}
            </p>
          </div>
        </div>
        <span className={`${badgeClass} shrink-0 px-2.5 py-1 text-[10px]`}>{badgeText}</span>
      </div>

      {ev.comments && (
        <blockquote
          className="text-sm line-clamp-2 italic rounded-lg px-3 py-2.5 border-l-2"
          style={{
            color: 'var(--muted-foreground)',
            background: 'rgba(0,0,0,0.25)',
            borderColor: '#3b82f6',
          }}
        >
          {ev.comments}
        </blockquote>
      )}

      <div
        className="grid grid-cols-2 gap-3 text-xs rounded-lg px-3 py-2.5"
        style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)' }}
      >
        <div>
          <div className="uppercase tracking-wider font-semibold mb-0.5" style={{ color: 'var(--subtle)' }}>DoD ID</div>
          <div className="font-mono text-white">{ev.dod_id || 'N/A'}</div>
        </div>
        <div>
          <div className="uppercase tracking-wider font-semibold mb-0.5" style={{ color: 'var(--subtle)' }}>Promotion Rec</div>
          <div className="font-bold text-white">{ev.promotion_recommendation || 'NOB'}</div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onView} className="apex-btn-secondary py-2 px-4 text-sm">
          View Report
        </button>
        {showEdit && onEdit && (
          <button type="button" onClick={onEdit} className="apex-btn-dashboard py-2 px-4 text-sm">
            Edit Draft
          </button>
        )}
      </div>
    </article>
  )
}

function EvalGrid({ loading, evaluations, emptyMessage, showEdit }: {
  loading: boolean
  evaluations: any[]
  emptyMessage: string
  showEdit?: boolean
}) {
  const router = useRouter()

  if (loading && evaluations.length === 0) {
    return (
      <div className="apex-dashboard-card p-10 text-center">
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>Loading evaluations…</p>
      </div>
    )
  }

  if (evaluations.length === 0) {
    return (
      <div className="apex-dashboard-card p-12 text-center">
        <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-2">
      {evaluations.map((ev) => (
        <EvalCard
          key={ev.id}
          ev={ev}
          showEdit={showEdit}
          onView={() => router.push(`/evaluations/${ev.id}`)}
          onEdit={() => router.push(`/evaluations/${ev.id}/edit`)}
        />
      ))}
    </div>
  )
}

function partitionEvals(evaluations: any[], profileId?: string) {
  const mine = (e: any) => e.current_holder_id === profileId
  const drafts = evaluations.filter((e) => mine(e) && (e.routing_stage === 'sailor' || !e.routing_stage))
  const inbox = evaluations.filter((e) => mine(e) && e.routing_stage && e.routing_stage !== 'sailor' && e.routing_stage !== 'locked')
  return { inbox, drafts }
}

export default function DashboardPage() {
  const router = useRouter()
  const { evaluations, loading, error } = useEvaluations()
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => {
    (async () => {
      const session = await getSession()
      if (!session?.user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      if (data) setProfile(data)
    })()
  }, [router])

  const { inbox, drafts } = partitionEvals(evaluations, profile?.id)
  const displayName = profile ? `${profile.navy_rank || ''} ${profile.last_name || ''}`.trim() : ''

  return (
    <AppShell
      profile={profile}
      title="Evaluation Portal"
      subtitle="Draft and validate NAVPERS 1616/26 evaluations"
      badge="Dashboard"
      maxWidth="7xl"
      headerActions={
        <button type="button" onClick={() => router.push('/evaluations/new')} className="apex-btn-dashboard">
          + Draft New EVAL
        </button>
      }
    >
      {error && (
        <div className="mb-6 p-4 rounded-lg text-xs text-red-300 border border-red-500/30 bg-red-950/30">
          {error}
        </div>
      )}

      {/* Mockup 1 — welcome + stat tiles */}
      <div className="mb-8 space-y-5">
        {displayName && (
          <div className="flex items-center gap-3">
            <UserAvatar
              firstName={profile?.first_name}
              lastName={profile?.last_name}
              size="lg"
              plain
            />
            <p className="text-base" style={{ color: 'var(--muted-foreground)' }}>
              Welcome back, <span className="font-bold text-white">{displayName}</span>
              {profile?.preferred_role && (
                <span className="ml-2 apex-badge-draft normal-case">{profile.preferred_role}</span>
              )}
            </p>
          </div>
        )}
        <div className="flex flex-wrap gap-4">
          <DashboardStat label="Awaiting Action" value={inbox.length} highlight={inbox.length > 0} />
          <DashboardStat label="My Drafts" value={drafts.length} />
          <DashboardStat label="Total Visible" value={inbox.length + drafts.length} />
        </div>
      </div>

      <div className="space-y-10">
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <h2 className="apex-dashboard-section-title">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" aria-hidden />
              Awaiting Your Action
              {inbox.length > 0 && (
                <span className="ml-1 text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {inbox.length}
                </span>
              )}
            </h2>
          </div>
          <EvalGrid loading={loading} evaluations={inbox} emptyMessage="Nothing is awaiting your action." />
        </section>

        <section className="space-y-4">
          <h2 className="apex-dashboard-section-title">
            <span className="inline-block h-2 w-2 rounded-full bg-blue-400" aria-hidden />
            My Drafts
            {drafts.length > 0 && (
              <span className="ml-1 text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {drafts.length}
              </span>
            )}
          </h2>
          <EvalGrid loading={loading} evaluations={drafts} emptyMessage="No evaluation drafts found." showEdit />
        </section>
      </div>
    </AppShell>
  )
}
