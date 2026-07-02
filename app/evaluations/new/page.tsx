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
import AppShell from '@/components/layout/AppShell'
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
      <div className="flex items-center justify-center min-h-screen text-sm font-mono" style={{ background: 'var(--background)', color: 'var(--muted-foreground)' }}>
        Initializing NAVPERS 1616/26 form template...
      </div>
    )
  }

  return (
    <AppShell
      profile={profile}
      title="Draft New Evaluation"
      subtitle="Complete the blocks below — Navy policy rules verified in real time"
      badge="New EVAL"
      maxWidth="6xl"
    >
      <EvaluationForm
        initialData={initialData}
        onSave={handleSave}
        onSaveInPlace={handleSaveInPlace}
        onCancel={() => router.push('/dashboard')}
        isSaving={isSaving}
        viewerRole={profile?.preferred_role}
      />
    </AppShell>
  )
}
