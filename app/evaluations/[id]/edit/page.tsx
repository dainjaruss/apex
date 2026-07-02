// app/evaluations/[id]/edit/page.tsx
//
// Page route for editing an existing evaluation report draft.
//

"use client"

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { loadById, saveDraft } from '@/lib/evaluationService'
import { getProfile } from '@/lib/profileService'
import EvaluationForm from '@/components/EvaluationForm'
import AppShell from '@/components/layout/AppShell'
import { Evaluation } from '@/types'

// fallow-ignore-next-line complexity
export default function EditEvaluationPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [viewerRole, setViewerRole] = useState<string | undefined>(undefined)
  const [profile, setProfile] = useState<any>(null)

  useEffect(() => {
    // fallow-ignore-next-line complexity
    const checkAuthAndLoad = async () => {
      try {
        const session = await getSession()
        if (!session?.user) {
          router.push('/login')
          return
        }
        setUserId(session.user.id)
        // Role gates Block 50a on the form (sailors don't see it while drafting; reviewers do).
        const viewer = await getProfile(session.user.id).catch(() => null)
        setViewerRole(viewer?.preferred_role)
        setProfile(viewer)

        if (!id) return;
        const data = await loadById(id)
        
        // Authorization check: Only creator can edit
        if (data.created_by !== session.user.id) {
          setError('You are not authorized to edit this evaluation report.')
        } else if (data.status !== 'draft') {
          setError('This report has already been submitted and cannot be edited.')
        } else {
          setEvaluation(data)
        }
      } catch (err: any) {
        console.error('Failed to load evaluation for edit:', err)
        setError(err.message || 'Failed to load evaluation')
      } finally {
        setLoading(false)
      }
    }

    checkAuthAndLoad()
  }, [id, router])

  const handleSave = async (updatedData: Evaluation) => {
    setIsSaving(true)
    try {
      if (!userId) throw new Error('Unauthenticated session')
      await saveDraft(userId, updatedData)
      router.push('/dashboard')
    } catch (err: any) {
      console.error('Failed to save edit:', err)
      throw err
    } finally {
      setIsSaving(false)
    }
  }

  // Persist to the DB but STAY on the edit page (recovered-draft "Save") — no navigation.
  const handleSaveInPlace = async (updatedData: Evaluation) => {
    setIsSaving(true)
    try {
      if (!userId) throw new Error('Unauthenticated session')
      return await saveDraft(userId, updatedData)
    } catch (err: any) {
      console.error('Failed to save edit in place:', err)
      throw err
    } finally {
      setIsSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen text-sm font-mono" style={{ background: 'var(--background)', color: 'var(--muted-foreground)' }}>
        Loading draft for edit...
      </div>
    )
  }

  if (error || !evaluation) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center" style={{ background: 'var(--background)' }}>
        <div className="apex-card p-6 max-w-md space-y-4 border-red-500/30">
          <h3 className="text-lg font-bold text-red-400">Cannot Edit Report</h3>
          <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{error || 'Access denied.'}</p>
          <button type="button" onClick={() => router.push('/dashboard')} className="apex-btn-secondary">
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <AppShell
      profile={profile}
      title="Edit Evaluation Draft"
      subtitle="Modify performance comments or trait grades — validated in real time"
      badge="Edit EVAL"
      maxWidth="6xl"
    >
      <EvaluationForm
        initialData={evaluation}
        onSave={handleSave}
        onSaveInPlace={handleSaveInPlace}
        onCancel={() => router.push('/dashboard')}
        isSaving={isSaving}
        viewerRole={viewerRole}
      />
    </AppShell>
  )
}
