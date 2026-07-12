"use client"

import { useEffect, useState, useMemo } from 'react'
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
  const drafts = evaluations.filter((e) => mine(e) && (e.routing_stage === 'sailor' || !e.routing_stage) && e.status !== 'completed' && e.status !== 'archived')
  const inbox = evaluations.filter((e) => mine(e) && e.routing_stage && e.routing_stage !== 'sailor' && e.routing_stage !== 'locked' && e.status !== 'completed' && e.status !== 'archived')
  const finalized = evaluations.filter((e) => e.status === 'completed' || e.status === 'archived' || e.routing_stage === 'locked')
  return { inbox, drafts, finalized }
}

export default function DashboardPage() {
  const router = useRouter()
  const { evaluations, loading, error } = useEvaluations()
  const [profile, setProfile] = useState<any>(null)
  
  // Search, filter, and sort state
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState('updated_desc')

  useEffect(() => {
    (async () => {
      const session = await getSession()
      if (!session?.user) { router.push('/login'); return }
      const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
      if (data) setProfile(data)
    })()
  }, [router])

  // Filter and sort evaluation list
  const processedEvals = useMemo(() => {
    let list = [...evaluations]

    // 1. Search filter
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((e) => {
        return (
          (e.member_name || '').toLowerCase().includes(q) ||
          (e.dod_id || '').toLowerCase().includes(q) ||
          (e.uic || '').toLowerCase().includes(q) ||
          (e.grade_rate || '').toLowerCase().includes(q)
        )
      })
    }

    // 2. Status filter
    if (statusFilter !== 'all') {
      list = list.filter((e) => e.status === statusFilter)
    }

    // 3. Sort
    list.sort((a, b) => {
      if (sortBy === 'updated_desc') {
        return new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime()
      }
      if (sortBy === 'updated_asc') {
        return new Date(a.updated_at || a.created_at || 0).getTime() - new Date(b.updated_at || b.created_at || 0).getTime()
      }
      if (sortBy === 'name_asc') {
        return (a.member_name || '').localeCompare(b.member_name || '')
      }
      if (sortBy === 'name_desc') {
        return (b.member_name || '').localeCompare(a.member_name || '')
      }
      if (sortBy === 'average_desc') {
        return (b.trait_average || 0) - (a.trait_average || 0)
      }
      if (sortBy === 'average_asc') {
        return (a.trait_average || 0) - (b.trait_average || 0)
      }
      return 0
    })

    return list
  }, [evaluations, search, statusFilter, sortBy])

  const { inbox, drafts, finalized } = partitionEvals(processedEvals, profile?.id)
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

      {/* Welcome + stat tiles */}
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
          <DashboardStat label="Completed & Finalized" value={finalized.length} />
          <DashboardStat label="Total Visible" value={inbox.length + drafts.length + finalized.length} />
        </div>
      </div>

      {/* Search, Filter, and Sort Controls */}
      <div className="glass-panel border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-center justify-between mb-8">
        <div className="relative w-full sm:flex-1">
          <input
            type="text"
            placeholder="Search by member name, DoD ID, UIC, or rate..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#1c2541]/40 border border-slate-700/60 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition"
          />
          <div className="absolute left-3.5 top-2.5 text-slate-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>
        
        <div className="flex flex-wrap gap-2.5 w-full sm:w-auto">
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-[#131b2e] text-white border border-slate-700/60 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 transition cursor-pointer"
          >
            <option value="all" className="bg-[#131b2e] text-white">All Statuses</option>
            <option value="draft" className="bg-[#131b2e] text-white">Draft</option>
            <option value="ready_for_review" className="bg-[#131b2e] text-white">Ready for Review</option>
            <option value="completed" className="bg-[#131b2e] text-white">Completed</option>
            <option value="archived" className="bg-[#131b2e] text-white">Archived</option>
          </select>

          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="bg-[#131b2e] text-white border border-slate-700/60 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-blue-500 transition cursor-pointer"
          >
            <option value="updated_desc" className="bg-[#131b2e] text-white">Recently Updated</option>
            <option value="updated_asc" className="bg-[#131b2e] text-white">Oldest Updated</option>
            <option value="name_asc" className="bg-[#131b2e] text-white">Name (A-Z)</option>
            <option value="name_desc" className="bg-[#131b2e] text-white">Name (Z-A)</option>
            <option value="average_desc" className="bg-[#131b2e] text-white">Trait Avg (High-Low)</option>
            <option value="average_asc" className="bg-[#131b2e] text-white">Trait Avg (Low-High)</option>
          </select>

          {/* Reset Filters button */}
          {(search || statusFilter !== 'all' || sortBy !== 'updated_desc') && (
            <button
              onClick={() => {
                setSearch('')
                setStatusFilter('all')
                setSortBy('updated_desc')
              }}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition"
            >
              Reset
            </button>
          )}
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

        <section className="space-y-4">
          <h2 className="apex-dashboard-section-title">
            <span className="inline-block h-2 w-2 rounded-full bg-slate-400" aria-hidden />
            Completed & Finalized
            {finalized.length > 0 && (
              <span className="ml-1 text-xs font-bold px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/30">
                {finalized.length}
              </span>
            )}
          </h2>
          <EvalGrid loading={loading} evaluations={finalized} emptyMessage="No completed or locked evaluations found." />
        </section>
      </div>
    </AppShell>
  )
}
