// app/evaluations/[id]/export/page.tsx
//
// Export & Gating page for final validation checks and PDF production.
//

"use client"

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { loadById, updateStatus } from '@/lib/evaluationService'
import { runFullValidation } from '@/lib/validationEngine'
import { Evaluation, ValidationResult } from '@/types'
import PDFPreview from '@/components/PDFPreview'

// fallow-ignore-next-line complexity
export default function EvaluationExportPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [isFinalizing, setIsFinalizing] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      try {
        const session = await getSession()
        if (!session?.user) {
          router.push('/login')
          return
        }

        if (!id) return;
        const data = await loadById(id)
        setEvaluation(data)
        
        // Run full validation
        const valRes = runFullValidation(data)
        setValidationResult(valRes)
      } catch (err: any) {
        console.error('Failed to load evaluation for export:', err)
        setError(err.message || 'Failed to load evaluation details.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [id, router])

  const handleFinalize = async () => {
    if (!evaluation || !validationResult?.success) return;
    setIsFinalizing(true)
    try {
      await updateStatus(evaluation.id!, 'completed')
      setEvaluation((prev) => prev ? { ...prev, status: 'completed' } : null)
      router.push('/dashboard')
    } catch (err: any) {
      console.error('Failed to finalize report:', err)
      alert('Failed to finalize evaluation report status.')
    } finally {
      setIsFinalizing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0b132b] text-[#608bb3] font-mono text-sm">
        Executing final validation checks...
      </div>
    )
  }

  if (error || !evaluation || !validationResult) {
    return (
      <div className="min-h-screen bg-[#0b132b] flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-950/35 border border-red-900/40 rounded-xl p-6 max-w-md space-y-4">
          <h3 className="text-lg font-bold text-red-400">Error Loading Export Portal</h3>
          <p className="text-sm text-slate-400">{error || 'Record could not be loaded.'}</p>
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

  const { success, errors, warnings } = validationResult

  return (
    <div className="min-h-screen bg-[#0b132b] text-[#f0f4f8]">
      <header className="px-6 py-4 flex items-center justify-between border-b border-[#1c2541] glass-panel mb-6">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-xl tracking-wider text-white">APEX</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#1c2541] text-[#3e6e99]">EXPORT PORTAL</span>
        </div>
        <button
          onClick={() => router.push(`/evaluations/${evaluation.id}`)}
          className="text-xs text-slate-400 hover:text-white transition px-3 py-1.5"
        >
          Back to View
        </button>
      </header>

      <main className="max-w-3xl mx-auto px-4 pb-12 space-y-6">
        <div className="bg-slate-900/40 p-6 rounded-xl border border-slate-800 space-y-2">
          <h2 className="text-2xl font-bold text-white">Export & Submit Evaluation</h2>
          <p className="text-xs text-slate-400">
            Member: <span className="text-white font-semibold">{evaluation.member_name}</span> | Grade/Rate: {evaluation.grade_rate} | Status: <span className="text-blue-400 uppercase font-bold">{evaluation.status}</span>
          </p>
        </div>

        {/* Validation Check Results */}
        <div className="glass-panel rounded-xl p-6 border border-slate-800 space-y-6">
          <div className="flex justify-between items-center border-b border-slate-800 pb-4">
            <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
              EVALMAN Validation Check Results
            </h3>
            {success ? (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-900/40 text-[10px] font-bold tracking-wider">
                PASSED
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full bg-red-950 text-red-400 border border-red-900/40 text-[10px] font-bold tracking-wider">
                FAILED
              </span>
            )}
          </div>

          {success ? (
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/20 space-y-2">
              <h4 className="text-sm font-bold text-emerald-200 flex items-center gap-2">
                <span>✓</span> Report Ready for Submission
              </h4>
              <p className="text-xs text-emerald-300/80 leading-relaxed">
                All BUPERSINST 1610.10H constraints, including administrative rules, trait rating promotion gates, and the Block 43 Courier text bounds, have passed successfully.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-red-500/20 bg-red-950/20 space-y-2">
              <h4 className="text-sm font-bold text-red-200 flex items-center gap-2">
                <span>⚠️</span> Pre-Export Blockers Detected ({errors.length})
              </h4>
              <p className="text-xs text-red-300/80 leading-relaxed">
                The evaluation has failed the pre-export quality checks. You must resolve these issues before you can download or finalize this evaluation report.
              </p>
            </div>
          )}

          {/* List of blockers/warnings */}
          <div className="space-y-4">
            {errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider">Blocker Errors</h4>
                <ul className="space-y-2">
                  {errors.map((err, idx) => (
                    <li key={idx} className="p-3 bg-red-950/10 border border-red-900/20 rounded-lg text-xs text-red-200 flex items-start gap-2.5">
                      <span className="text-red-400 font-bold mt-0.5">✕</span>
                      <div>
                        <span className="font-semibold text-red-300 block mb-0.5">
                          {err.block ? `Block ${err.block}` : 'General'}
                        </span>
                        {err.message}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {warnings.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider">Policy Advisories / Warnings</h4>
                <ul className="space-y-2">
                  {warnings.map((warn, idx) => (
                    <li key={idx} className="p-3 bg-amber-950/10 border border-amber-900/20 rounded-lg text-xs text-amber-200 flex items-start gap-2.5">
                      <span className="text-amber-400 font-bold mt-0.5">•</span>
                      <div>
                        <span className="font-semibold text-amber-300 block mb-0.5">
                          {warn.block ? `Block ${warn.block}` : 'General'}
                        </span>
                        {warn.message}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Real-time PDF Preview component */}
        {success && (
          <div id="apex-pdf-preview-section" className="space-y-4">
            <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
              Official NAVPERS 1616/26 Document Preview
            </h3>
            <PDFPreview evaluation={evaluation} />
          </div>
        )}

        {/* Action Panel */}
        <div className="glass-panel rounded-xl p-6 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-white">
              {success ? 'Export & Production Actions' : 'Corrections Required'}
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              {success
                ? 'Generate high-fidelity PDF copy or submit report to finalize status.'
                : 'Click Edit Draft below to resolve the validation failures.'}
            </p>
          </div>

          <div className="flex gap-3">
            {!success ? (
              <button
                onClick={() => router.push(`/evaluations/${evaluation.id}/edit`)}
                className="px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold transition text-xs tracking-wide shadow-lg"
              >
                Edit Draft
              </button>
            ) : (
              <>
                <button
                  onClick={handleFinalize}
                  disabled={isFinalizing || evaluation.status === 'completed'}
                  className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-white transition border border-slate-700"
                >
                  {isFinalizing ? 'Finalizing...' : evaluation.status === 'completed' ? 'Finalized' : 'Finalize & Submit'}
                </button>
                <button
                  onClick={() => {
                    const el = document.getElementById('apex-pdf-preview-section')
                    el?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="px-5 py-2.5 rounded-lg bg-[#3e6e99] hover:bg-[#4e82b0] text-xs font-bold text-white transition shadow-lg"
                >
                  View Document Preview
                </button>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
