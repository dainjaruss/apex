// app/evaluations/[id]/export/page.tsx
//
// Export & Gating page for final validation checks and PDF production.
//

"use client"

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { loadById, updateStatus } from '@/lib/evaluationService'
import { fetchGroupAveragePool, fetchGroupDistribution } from '@/lib/summaryGroupService'
import { getProfile } from '@/lib/profileService'
import { canViewSummaryAverage } from '@/lib/permissions'
import { runFullValidation } from '@/lib/validationEngine'
import { checkForcedDistribution, ForcedDistributionResult } from '@/lib/forcedDistribution'
import { Evaluation, ValidationResult } from '@/types'
import PDFPreview from '@/components/PDFPreview'

// fallow-ignore-next-line complexity
export default function EvaluationExportPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [forcedDist, setForcedDist] = useState<ForcedDistributionResult | null>(null)
  const [isFinalizing, setIsFinalizing] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      try {
        const session = await getSession()
        if (!session?.user) {
          router.push('/login')
          return
        }
        setUserId(session.user.id)

        const viewer = await getProfile(session.user.id)
        if (!id) return;
        const data = await loadById(id)

        // Block 50a on the rendered PDF: populate only when this viewer may see it — reviewers
        // always; the evaluated member only once the report is finalized (so a sailor exporting
        // their own draft does not see it). The service-role route enforces the same rule and
        // returns the individual average for an ungrouped eval (a group of one).
        if (canViewSummaryAverage(viewer.preferred_role, data)) {
          try {
            data.summary_group_average = (await fetchGroupAveragePool(data.id!)).average
          } catch (e) {
            console.warn('Could not compute summary group average:', e)
          }
          // Block 46 distribution + the EVALMAN forced-distribution check (used to hard-block
          // finalize). Only meaningful when the eval is in a summary group.
          if (data.summary_group_id) {
            try {
              const { distribution } = await fetchGroupDistribution(data.id!)
              data.summary_group_distribution = distribution
              setForcedDist(checkForcedDistribution(distribution, data.grade_rate))
            } catch (e) {
              console.warn('Could not compute summary group distribution:', e)
            }
          }
        }
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
    // Hard block: a report cannot be finalized while its summary group exceeds the EVALMAN
    // forced-distribution caps (BUPERSINST 1610.10H Table 1-2).
    if (forcedDist && !forcedDist.compliant) return;
    setIsFinalizing(true)
    try {
      await updateStatus(evaluation.id!, 'completed', userId || undefined)
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

        {/* Forced-distribution status (BUPERSINST 1610.10H Table 1-2) — a hard blocker for finalize */}
        {forcedDist && (
          <div className={`glass-panel rounded-xl p-6 border space-y-3 ${forcedDist.compliant ? 'border-slate-800' : 'border-red-500/30'}`}>
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">Summary Group Forced Distribution</h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider border ${
                forcedDist.compliant
                  ? 'bg-emerald-950 text-emerald-400 border-emerald-900/40'
                  : 'bg-red-950 text-red-400 border-red-900/40'
              }`}>
                {forcedDist.compliant ? 'WITHIN LIMITS' : 'OVER LIMIT'}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Observed group size: <span className="text-white font-semibold">{forcedDist.observedCount}</span> · Max Early Promote:{' '}
              <span className="text-white font-semibold">{forcedDist.earlyPromoteMax}</span>
              {forcedDist.combinedMax != null && (
                <> · Max Early + Must Promote (E5–E6): <span className="text-white font-semibold">{forcedDist.combinedMax}</span></>
              )}
            </p>
            {!forcedDist.compliant && (
              <ul className="space-y-2">
                {forcedDist.violations.map((v, i) => (
                  <li key={i} className="p-3 bg-red-950/10 border border-red-900/20 rounded-lg text-xs text-red-200 flex items-start gap-2.5">
                    <span className="text-red-400 font-bold mt-0.5">✕</span>
                    <span>{v.message} This report cannot be finalized until the Reporting Senior brings the group within limits.</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Real-time PDF Preview — always available so anyone can see the report's progress,
            even before it passes validation. Only the official download/finalize stay gated. */}
        <div id="apex-pdf-preview-section" className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
              {success ? 'Official NAVPERS 1616/26 Document Preview' : 'Draft Preview (Not Finalized)'}
            </h3>
            {!success && (
              <span className="px-2.5 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-900/40 text-[10px] font-bold tracking-wider">
                WORK IN PROGRESS
              </span>
            )}
          </div>
          {!success && (
            <p className="text-xs text-amber-300/80 leading-relaxed">
              Live preview of the report as drafted, so you can track progress. It still has open
              validation blockers and cannot be downloaded or finalized until they are resolved.
            </p>
          )}
          <PDFPreview evaluation={evaluation} allowDownload={success} />
        </div>

        {/* Action Panel */}
        <div className="glass-panel rounded-xl p-6 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div>
            <h4 className="text-sm font-semibold text-white">
              {success ? 'Export & Production Actions' : 'In Progress — Preview Available'}
            </h4>
            <p className="text-xs text-slate-400 mt-1">
              {success
                ? 'Generate high-fidelity PDF copy or submit report to finalize status.'
                : 'Preview the report below to track progress. Resolve the blockers above to download or finalize.'}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                const el = document.getElementById('apex-pdf-preview-section')
                el?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="px-5 py-2.5 rounded-lg bg-[#3e6e99] hover:bg-[#4e82b0] text-xs font-bold text-white transition shadow-lg"
            >
              View Document Preview
            </button>
            {!success ? (
              <button
                onClick={() => router.push(`/evaluations/${evaluation.id}/edit`)}
                className="px-5 py-2.5 rounded-lg bg-blue-700 hover:bg-blue-600 text-white font-bold transition text-xs tracking-wide shadow-lg"
              >
                Edit Draft
              </button>
            ) : (
              <button
                onClick={handleFinalize}
                disabled={isFinalizing || evaluation.status === 'completed' || (forcedDist != null && !forcedDist.compliant)}
                title={forcedDist != null && !forcedDist.compliant ? 'Blocked: summary group exceeds the forced-distribution caps' : undefined}
                className="px-5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-white transition border border-slate-700"
              >
                {isFinalizing ? 'Finalizing...' : evaluation.status === 'completed' ? 'Finalized' : 'Finalize & Submit'}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
