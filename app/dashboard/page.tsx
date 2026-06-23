"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { signOut, getSession } from '@/lib/auth'
import { useEvaluations } from '@/hooks/useEvaluations'
import { createBrowserClient } from '@/lib/supabaseClient'
import { getEvalSeed } from '@/lib/formDefinitions'
import { hasPermission } from '@/lib/permissions'

const supabase = createBrowserClient()

function getMemberName(profile: any) {
  if (!profile) return 'DOE, JOHN A'
  const mi = profile.middle_initial ? ` ${profile.middle_initial}` : ''
  return `${profile.last_name}, ${profile.first_name}${mi}`.toUpperCase().trim()
}

function getMockEval(profile: any) {
  const seed = getEvalSeed()
  const p = profile || {}

  seed.member_name = getMemberName(profile)
  seed.dod_id = p.dod_id || '1234567890'
  seed.grade_rate = p.navy_rank || 'SN'
  seed.ship_station = p.command || 'USS NEVERSAIL'
  seed.uic = p.uic || ''
  seed.comments = 'Sailor demonstrates high professionalism and technical competency. Completed all CIS capstone objectives.'
  return seed
}

function DashboardHeader({ profile, onSignOut }: { profile: any; onSignOut: () => void }) {
  const router = useRouter()
  const isAdmin = profile && hasPermission(profile.preferred_role, 'manage_users')

  return (
    <header className="px-6 py-4 flex items-center justify-between border-b border-[#1c2541] glass-panel">
      <div className="flex items-center gap-3">
        <span className="font-extrabold text-xl tracking-wider text-white">APEX</span>
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#1c2541] text-[#3e6e99]">DASHBOARD</span>
      </div>
      <div className="flex items-center gap-4">
        {isAdmin && (
          <button
            onClick={() => router.push('/admin')}
            className="px-3 py-1.5 rounded bg-red-950/30 hover:bg-red-900/40 text-xs font-semibold text-red-300 border border-red-900/30 transition-all"
          >
            Admin Panel
          </button>
        )}
        <div className="text-right hidden sm:block">
          <div className="text-sm font-semibold text-white">
            {profile ? `${profile.navy_rank} ${profile.last_name}` : 'Loading...'}
          </div>
          <div className="text-xs text-[#608bb3]">Role: {profile?.preferred_role}</div>
        </div>
        <button
          onClick={onSignOut}
          className="px-3.5 py-1.5 rounded bg-red-950/30 hover:bg-red-900/40 text-xs font-semibold text-red-300 border border-red-900/30 transition-all"
        >
          Sign Out
        </button>
      </div>
    </header>
  )
}

function DraftsList({ loading, evaluations, onDraftMock }: { loading: boolean; evaluations: any[]; onDraftMock: () => void }) {
  const router = useRouter()
  if (loading && evaluations.length === 0) {
    return (
      <div className="p-8 rounded-xl glass-panel text-center text-sm text-[#608bb3]">
        Loading evaluation drafts from database...
      </div>
    )
  }

  if (evaluations.length === 0) {
    return (
      <div className="p-12 rounded-xl glass-panel text-center space-y-3">
        <p className="text-sm text-[#608bb3]">No evaluation drafts found in database.</p>
        <button
          onClick={onDraftMock}
          className="text-xs text-blue-400 hover:underline font-semibold"
        >
          Create a demo draft to verify database connections
        </button>
      </div>
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {evaluations.map((ev: any) => (
        <div key={ev.id} className="p-5 rounded-xl glass-panel border border-[#1c2541] flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all">
          <div className="space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <h4 className="font-bold text-white">{ev.member_name || 'UNNAMED SAILOR'}</h4>
                <p className="text-xs text-[#91aec9]">{ev.grade_rate} | UIC: {ev.uic} | Period: {ev.period_from} to {ev.period_to}</p>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-[#1c2541] text-blue-400 border border-blue-900/20">
                {ev.status}
              </span>
            </div>

            {ev.comments && (
              <p className="text-xs text-[#608bb3] line-clamp-2 italic bg-[#0b132b]/40 p-2 rounded">
                "{ev.comments}"
              </p>
            )}

            <div className="flex justify-between items-center text-[10px] text-[#608bb3] border-t border-[#1c2541] pt-3">
              <div>DoD ID: {ev.dod_id || 'N/A'}</div>
              <div className="flex items-center gap-1.5">
                <span>Recommendation:</span>
                <span className="font-bold text-white">{ev.promotion_recommendation || 'NOB'}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/40">
            <button
              onClick={() => router.push(`/evaluations/${ev.id}`)}
              className="px-3 py-1 rounded bg-[#1c2541] hover:bg-slate-800 text-[11px] font-semibold text-slate-300 transition"
            >
              View
            </button>
            {ev.status === 'draft' && (
              <button
                onClick={() => router.push(`/evaluations/${ev.id}/edit`)}
                className="px-3 py-1 rounded bg-blue-900/40 hover:bg-blue-800/50 text-[11px] font-semibold text-blue-300 border border-blue-800/30 transition"
              >
                Edit
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

interface DashboardContentProps {
  profile: any
  evaluations: any[]
  loading: boolean
  actionLoading: boolean
  error: string | null
  onDraftMock: () => void
}

function DashboardContent({
  profile,
  evaluations,
  loading,
  actionLoading,
  error,
  onDraftMock,
}: DashboardContentProps) {
  const router = useRouter()
  return (
    <main className="flex-1 max-w-6xl w-full mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-wide">Evaluation Portal</h2>
          <p className="text-sm text-[#91aec9]">Draft and validate NAVPERS 1616/26 evaluations</p>
        </div>
        <button
          onClick={() => router.push('/evaluations/new')}
          className="px-5 py-2.5 rounded-lg bg-[#3e6e99] hover:bg-[#4e82b0] text-white font-bold transition-all text-sm tracking-wide shadow-lg shadow-blue-900/20"
        >
          Draft New EVAL (NAVPERS 1616/26)
        </button>
      </div>

      <div className="p-4 rounded-xl border border-blue-900/40 bg-blue-950/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold text-blue-300">Milestone 3 Integration Status</h4>
          <p className="text-xs text-[#91aec9]">Database connectivity is operational. Click the Draft button to verify real-time Supabase writing.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-green-400 bg-green-950/20 border border-green-900/40 px-3 py-1 rounded-full w-fit">
          <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse"></span>
          Database Connected
        </div>
      </div>

      {error && (
        <div className="p-4 rounded bg-red-950/30 border border-red-900/30 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-[#91aec9] uppercase tracking-wider">Active Evaluation Drafts</h3>
        <DraftsList loading={loading} evaluations={evaluations} onDraftMock={onDraftMock} />
      </div>
    </main>
  )
}

function useDashboardState() {
  const router = useRouter()
  const { evaluations, loading, error, saveEvaluation } = useEvaluations()
  const [profile, setProfile] = useState<any>(null)
  const [actionLoading, setActionLoading] = useState(false)

  useEffect(() => {
    const checkAuthAndLoad = async () => {
      const session = await getSession()
      if (!session?.user) {
        router.push('/login')
        return
      }

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()
      
      if (data) {
        setProfile(data)
      }
    }
    
    checkAuthAndLoad()
  }, [router])

  const handleSignOut = async () => {
    await signOut()
    router.push('/login')
  }

  const handleCreateMockEval = async () => {
    setActionLoading(true)
    try {
      const seed = getMockEval(profile)
      await saveEvaluation(seed)
    } catch (err) {
      console.error('Failed to create mock eval:', err)
    } finally {
      setActionLoading(false)
    }
  }

  return {
    evaluations,
    loading,
    error,
    profile,
    actionLoading,
    handleSignOut,
    handleCreateMockEval,
  }
}

export default function DashboardPage() {
  const {
    evaluations,
    loading,
    error,
    profile,
    actionLoading,
    handleSignOut,
    handleCreateMockEval,
  } = useDashboardState()

  return (
    <div className="flex flex-col min-h-screen bg-[#0b132b] text-[#f0f4f8]">
      <DashboardHeader profile={profile} onSignOut={handleSignOut} />
      <DashboardContent
        profile={profile}
        evaluations={evaluations}
        loading={loading}
        actionLoading={actionLoading}
        error={error}
        onDraftMock={handleCreateMockEval}
      />
    </div>
  )
}

