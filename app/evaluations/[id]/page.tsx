// app/evaluations/[id]/page.tsx
//
// Page route for viewing evaluation details.
//

"use client"

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getSession } from '@/lib/auth'
import { loadById } from '@/lib/evaluationService'
import { Evaluation } from '@/types'
import { checkCommentFit } from '@/lib/commentFit'

// fallow-ignore-next-line complexity
export default function ViewEvaluationPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [evaluation, setEvaluation] = useState<Evaluation | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
        setEvaluation(data)
      } catch (err: any) {
        console.error('Failed to load evaluation:', err)
        setError(err.message || 'Failed to load evaluation')
      } finally {
        setLoading(false)
      }
    }

    checkAuthAndLoad()
  }, [id, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0b132b] text-[#608bb3] font-mono text-sm">
        Loading evaluation details...
      </div>
    )
  }

  if (error || !evaluation) {
    return (
      <div className="min-h-screen bg-[#0b132b] flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-red-950/35 border border-red-900/40 rounded-xl p-6 max-w-md space-y-4">
          <h3 className="text-lg font-bold text-red-400">Failed to Load Report</h3>
          <p className="text-sm text-slate-400">{error || 'Record not found or access denied.'}</p>
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

  const pitch = evaluation.block_values?.comment_pitch || '10'
  const fitResult = checkCommentFit(evaluation.comments || '', pitch)

  const isOwner = evaluation.created_by === userId;

  return (
    <div className="min-h-screen bg-[#0b132b] text-[#f0f4f8]">
      {/* Header (inlined — previously EvaluationHeader component) */}
      <header className="px-6 py-4 flex items-center justify-between border-b border-[#1c2541] glass-panel mb-6">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-xl tracking-wider text-white">APEX</span>
          <span className={`text-xs px-2.5 py-0.5 rounded-full bg-[#1c2541] text-[#3e6e99]`}>
            {evaluation?.status === 'draft' ? 'VIEW DRAFT' : 'VIEW REPORT'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="text-xs text-slate-400 hover:text-white transition px-3 py-1.5"
          >
            Dashboard
          </button>
          {isOwner && evaluation?.status === 'draft' && (
            <button
              onClick={() => router.push(`/evaluations/${evaluation.id}/edit`)}
              className="px-4 py-1.5 rounded bg-[#3e6e99] hover:bg-[#4e82b0] text-xs font-semibold text-white transition"
            >
              Edit Draft
            </button>
          )}
        </div>
      </header>

      {/* Main Detail Content */}
      <main className="max-w-5xl mx-auto px-4 pb-12 space-y-6">
        {/* Banner metadata */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/40 p-6 rounded-xl border border-slate-800">
          <div>
            <span className="text-[10px] px-2.5 py-0.5 rounded bg-blue-950 text-blue-300 font-bold uppercase tracking-wider border border-blue-900/30">
              {evaluation.status}
            </span>
            <h2 className="text-2xl font-bold text-white mt-2">{evaluation.member_name}</h2>
            <p className="text-xs text-slate-400 mt-1">
              DoD ID: {evaluation.dod_id} | Grade/Rate: {evaluation.grade_rate} | UIC: {evaluation.uic}
            </p>
          </div>

          <div className="flex items-center gap-6 bg-[#111c38]/40 px-6 py-4 rounded-xl border border-slate-800">
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Trait Average</div>
              <div className="text-xl font-black text-emerald-400 mt-1">
                {evaluation.trait_average ? evaluation.trait_average.toFixed(2) : '0.00'}
              </div>
            </div>
            <div className="h-8 w-px bg-slate-800"></div>
            <div className="text-center">
              <div className="text-[10px] text-slate-500 uppercase font-semibold">Promotion Rec</div>
              <div className="text-sm font-bold text-white mt-1">
                {evaluation.promotion_recommendation || 'NOB'}
              </div>
            </div>
          </div>
        </div>

        {/* 1. Identity Grid (Blocks 1-19) */}
        <div className="glass-panel rounded-xl p-6">
          <h3 className="text-sm font-bold gold-accent uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">
            Blocks 1 - 19: Identity & Report Occasion
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6 text-sm">
            <div>
              <div className="text-xs text-slate-500">Block 1: Name</div>
              <div className="font-semibold text-white mt-0.5">{evaluation.member_name}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Block 2: Grade/Rate</div>
              <div className="font-semibold text-white mt-0.5">{evaluation.grade_rate}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Block 3: Designator</div>
              <div className="font-semibold text-white mt-0.5">{evaluation.designator || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Block 4: DoD ID</div>
              <div className="font-semibold text-white mt-0.5">{evaluation.dod_id}</div>
            </div>

            <div>
              <div className="text-xs text-slate-500">Block 5: Duty Status</div>
              <div className="font-semibold text-white mt-0.5">{evaluation.duty_status}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Block 6: UIC</div>
              <div className="font-semibold text-white mt-0.5">{evaluation.uic}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Block 7: Ship/Station</div>
              <div className="font-semibold text-white mt-0.5">{evaluation.ship_station}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Block 8: Promotion Status</div>
              <div className="font-semibold text-white mt-0.5">{evaluation.promotion_status}</div>
            </div>

            <div>
              <div className="text-xs text-slate-500">Block 9: Date Reported</div>
              <div className="font-semibold text-white mt-0.5">{evaluation.block_values?.date_reported || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Period of Report</div>
              <div className="font-semibold text-white mt-0.5">
                {evaluation.period_from} to {evaluation.period_to}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Occasion</div>
              <div className="font-semibold text-white mt-0.5">
                {evaluation.block_values?.periodic ? 'Periodic (Block 10)' : ''}
                {evaluation.block_values?.detachment_individual ? 'Detachment of Individual (Block 11)' : ''}
                {evaluation.block_values?.detachment_senior ? 'Detachment of Senior (Block 12)' : ''}
                {evaluation.block_values?.special ? 'Special (Block 13)' : ''}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Report Type</div>
              <div className="font-semibold text-white mt-0.5 font-mono">
                {evaluation.block_values?.regular_report ? 'Regular (Block 17)' : ''}
                {evaluation.block_values?.concurrent_report ? 'Concurrent (Block 18)' : ''}
                {evaluation.block_values?.ops_commander_report ? 'Ops Commander (Block 19)' : ''}
                {evaluation.block_values?.not_observed ? 'Not Observed (Block 16)' : ''}
              </div>
            </div>
          </div>
        </div>

        {/* 2. Command Details & Reporting Senior (Blocks 20-31) */}
        <div className="glass-panel rounded-xl p-6">
          <h3 className="text-sm font-bold gold-accent uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">
            Blocks 20 - 31: Command Context & Counseling
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6 text-sm mb-6">
            <div>
              <div className="text-xs text-slate-500">Block 20: Physical Readiness</div>
              <div className="font-semibold text-white mt-0.5">{evaluation.block_values?.physical_readiness || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Block 21: Billet Subcategory</div>
              <div className="font-semibold text-white mt-0.5">{evaluation.block_values?.billet_subcategory || 'NA'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Block 22: Reporting Senior</div>
              <div className="font-semibold text-white mt-0.5">{evaluation.block_values?.reporting_senior_name || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Block 23: RS Grade & UIC</div>
              <div className="font-semibold text-white mt-0.5">
                {evaluation.block_values?.reporting_senior_grade || ''} | {evaluation.block_values?.reporting_senior_uic || ''}
              </div>
            </div>

            <div>
              <div className="text-xs text-slate-500">Block 25: RS Title</div>
              <div className="font-semibold text-white mt-0.5">{evaluation.block_values?.reporting_senior_title || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Block 30: Date Counseled</div>
              <div className="font-semibold text-white mt-0.5">{evaluation.block_values?.date_counseled || 'N/A'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Block 31: Counselor</div>
              <div className="font-semibold text-white mt-0.5">{evaluation.block_values?.counselor || 'N/A'}</div>
            </div>
          </div>

          <div className="space-y-4 text-sm border-t border-slate-800/60 pt-4">
            <div>
              <div className="text-xs text-slate-500">Block 28: Command Employment and Achievements</div>
              <p className="mt-1 text-slate-300 whitespace-pre-wrap">{evaluation.block_values?.command_achievements || 'None listed.'}</p>
            </div>
            <div>
              <div className="text-xs text-slate-500">Block 29: Primary/Collateral/Watchstanding Duties</div>
              <p className="mt-1 text-slate-300 whitespace-pre-wrap">{evaluation.block_values?.primary_duties || 'None listed.'}</p>
            </div>
          </div>
        </div>

        {/* 3. Trait Ratings Breakdown (Blocks 33-40) */}
        <div className="glass-panel rounded-xl p-6">
          <h3 className="text-sm font-bold gold-accent uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">
            Blocks 33 - 40: Trait Ratings Breakdown
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-4 text-center">
            {Object.entries(evaluation.trait_grades || {}).map(([key, val]) => (
              <div key={key} className="bg-slate-950/45 p-3 rounded-lg border border-slate-800/80">
                <div className="text-[10px] text-slate-500 font-semibold uppercase truncate">
                  {key === 'eo' ? 'Climate/EO' : key}
                </div>
                <div className="text-base font-bold text-white mt-1">{val}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 4. Narrative Comments (Block 43) */}
        <div className="glass-panel rounded-xl p-6">
          <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
            <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
              Block 43: Narrative Comments
            </h3>
            <span className="text-[10px] text-slate-500 font-mono">
              Pitch Selected: {pitch}-Pitch | Lines: {fitResult.linesUsed} / 18
            </span>
          </div>

          <div className="w-full bg-slate-950/60 rounded-xl p-5 border border-slate-900 font-mono text-xs overflow-x-auto text-slate-200 min-h-[160px]">
            {fitResult.wrappedLines.length === 0 ? (
              <p className="italic text-slate-600">No narrative entered.</p>
            ) : (
              <div className="space-y-0.5">
                {fitResult.wrappedLines.map((line, idx) => (
                  <div key={idx} className="flex">
                    <span className="w-6 text-[10px] text-slate-700 pr-1.5 mr-2 text-right border-r border-slate-900 select-none">
                      {idx + 1}
                    </span>
                    <span className="whitespace-pre">{line}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 5. Recommendations & Signatures (Blocks 44-52) */}
        <div className="glass-panel rounded-xl p-6">
          <h3 className="text-sm font-bold gold-accent uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">
            Blocks 41, 44 - 52: Recommendations & Signatures
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm mb-6">
            <div>
              <div className="text-xs text-slate-500">Block 41: Career Recommendations</div>
              <ul className="list-disc pl-5 mt-1 font-semibold text-white">
                {(evaluation.career_recommendations || []).filter(Boolean).map((rec, i) => (
                  <li key={i}>{rec}</li>
                ))}
                {(!evaluation.career_recommendations || evaluation.career_recommendations.filter(Boolean).length === 0) && (
                  <li className="italic text-slate-600">None</li>
                )}
              </ul>
            </div>
            <div>
              <div className="text-xs text-slate-500">Block 45: Promotion Recommendation</div>
              <div className="font-bold text-white mt-1">{evaluation.promotion_recommendation || 'NOB'}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Block 47: Retention Recommendation</div>
              <div className="font-semibold text-white mt-1">{evaluation.retention || 'N/A'}</div>
            </div>
          </div>

          <div className="mb-6">
            <div className="text-xs text-slate-500 mb-1">Block 44: Qualifications/Achievements</div>
            <p className="text-slate-300 text-sm whitespace-pre-wrap">{evaluation.block_values?.qualifications_achievements || 'None listed.'}</p>
          </div>

          <div className="border-t border-slate-800/80 pt-4 grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6 text-xs">
            <div>
              <div className="text-slate-500">Block 42: Rater Signature</div>
              <div className="font-semibold text-white mt-1">{evaluation.block_values?.rater_signature || 'UNINITIALIZED'}</div>
            </div>
            <div>
              <div className="text-slate-500">Block 48: Senior Rater Signature</div>
              <div className="font-semibold text-white mt-1">{evaluation.block_values?.senior_rater_signature || 'UNINITIALIZED'}</div>
            </div>
            <div>
              <div className="text-slate-500">Block 49: Member Signature</div>
              <div className="font-semibold text-white mt-1">{evaluation.block_values?.member_signature || 'UNINITIALIZED'}</div>
            </div>
            <div>
              <div className="text-slate-500">Block 50: Reporting Senior Signature</div>
              <div className="font-semibold text-white mt-1">{evaluation.block_values?.reporting_senior_signature || 'UNINITIALIZED'}</div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
