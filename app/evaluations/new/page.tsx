// app/evaluations/new/page.tsx
//
// Page route for creating a new NAVPERS 1616/26 evaluation draft.
//

"use client"

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { createBrowserClient } from '@/lib/supabaseClient'
import { getEvalSeed } from '@/lib/formDefinitions'
import { saveDraft } from '@/lib/evaluationService'
import EvaluationForm from '@/components/EvaluationForm'
import { Evaluation } from '@/types'

const supabase = createBrowserClient()

export default function NewEvaluationPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [initialData, setInitialData] = useState<Evaluation | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // fallow-ignore-next-line complexity
    const checkAuthAndInitialize = async () => {
      const session = await getSession()
      if (!session?.user) {
        router.push('/login')
        return
      }

      // Fetch user profile to pre-fill admin blocks
      const { data: profData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single()

      if (profData) {
        setProfile(profData)
        
        // Seed new evaluation
        const seed = getEvalSeed() as any
        
        // Format name as LAST, FIRST MI
        const mi = profData.middle_initial ? ` ${profData.middle_initial}` : ''
        seed.member_name = `${profData.last_name}, ${profData.first_name}${mi}`.toUpperCase().trim()
        seed.dod_id = profData.dod_id || ''
        seed.grade_rate = profData.navy_rank || ''
        seed.ship_station = profData.command || ''
        seed.uic = profData.uic || ''
        seed.created_by = session.user.id
        
        setInitialData(seed)
      } else {
        // Fallback seed
        setInitialData(getEvalSeed() as any)
      }
      setLoading(false)
    }

    checkAuthAndInitialize()
  }, [router])

  const handleSave = async (data: Evaluation) => {
    setIsSaving(true)
    try {
      const session = await getSession()
      if (!session?.user) throw new Error('Unauthenticated session')

      const saved = await saveDraft(session.user.id, data)
      // Land on the report screen (the workflow hub) rather than the dashboard.
      router.push(saved?.id ? `/evaluations/${saved.id}` : '/dashboard')
    } catch (err: any) {
      console.error('Failed to create new draft:', err)
      throw err
    } finally {
      setIsSaving(false)
    }
  }

  // Persist to the DB but STAY on this page (recovered-draft "Save"). Returns the saved record
  // so the form can adopt its new id and later saves update the same row instead of inserting.
  const handleSaveInPlace = async (data: Evaluation) => {
    setIsSaving(true)
    try {
      const session = await getSession()
      if (!session?.user) throw new Error('Unauthenticated session')
      return await saveDraft(session.user.id, data)
    } catch (err: any) {
      console.error('Failed to save draft in place:', err)
      throw err
    } finally {
      setIsSaving(false)
    }
  }

  if (loading || !initialData) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0b132b] text-[#608bb3] font-mono text-sm">
        Initializing NAVPERS 1616/26 form template...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b132b] text-[#f0f4f8]">
      {/* Navigation Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-[#1c2541] glass-panel mb-6">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-xl tracking-wider text-white">APEX</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#1c2541] text-[#3e6e99]">NEW EVAL</span>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-xs text-slate-400 hover:text-white transition"
        >
          Back to Dashboard
        </button>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 py-2">
        <div className="mb-6 px-4">
          <h2 className="text-2xl font-bold text-white tracking-wide">Draft New Evaluation</h2>
          <p className="text-sm text-[#91aec9]">Complete the blocks below. Navy policy rules will be verified in real time.</p>
        </div>

        <EvaluationForm
          initialData={initialData}
          onSave={handleSave}
          onSaveInPlace={handleSaveInPlace}
          onCancel={() => router.push('/dashboard')}
          isSaving={isSaving}
          viewerRole={profile?.preferred_role}
        />
      </main>
    </div>
  )
}
