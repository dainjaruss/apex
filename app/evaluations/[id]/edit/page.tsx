// app/evaluations/[id]/edit/page.tsx
//
// Page route for editing an existing evaluation report draft.
//

"use client"

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { loadById, saveDraft } from '@/lib/evaluationService'
import EvaluationForm from '@/components/EvaluationForm'
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0b132b] text-[#608bb3] font-mono text-sm">
        Loading draft for edit...
      </div>
    )
  }

  if (error || !evaluation) {
    return (
      <div className="min-h-screen bg-[#0b132b] flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-950/35 border border-red-900/40 rounded-xl p-6 max-w-md space-y-4">
          <h3 className="text-lg font-bold text-red-400">Cannot Edit Report</h3>
          <p className="text-sm text-slate-400">{error || 'Access denied.'}</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs text-white transition"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0b132b] text-[#f0f4f8]">
      {/* Header */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-[#1c2541] glass-panel mb-6">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-xl tracking-wider text-white">APEX</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#1c2541] text-[#3e6e99]">EDIT EVAL</span>
        </div>
        <button
          onClick={() => router.push('/dashboard')}
          className="text-xs text-slate-400 hover:text-white transition"
        >
          Back to Dashboard
        </button>
      </header>

      {/* Container */}
      <main className="max-w-6xl mx-auto px-4 py-2">
        <div className="mb-6 px-4">
          <h2 className="text-2xl font-bold text-white tracking-wide">Edit Evaluation Draft</h2>
          <p className="text-sm text-[#91aec9]">Modify your performance comments or trait grades. Changes will be validated on-the-fly.</p>
        </div>

        <EvaluationForm
          initialData={evaluation}
          onSave={handleSave}
          onCancel={() => router.push('/dashboard')}
          isSaving={isSaving}
        />
      </main>
    </div>
  )
}
