// components/Reviewer/ReviewPanel.tsx
//
// Interactive dashboard/panel for evaluation review workflows (Submit, Approve, Return).
//

"use client"

import React, { useEffect, useState } from 'react'
import { Evaluation, Profile } from '@/types'
import { createBrowserClient } from '@/lib/supabaseClient'
import {
  submitForReview,
  approveEvaluation,
  returnForCorrection,
  fetchReviewApprovals
} from '@/lib/evaluationService'

interface ReviewPanelProps {
  evaluation: Evaluation
  currentUser: Profile
  onWorkflowAction: () => void
}

const supabase = createBrowserClient()

// fallow-ignore-next-line complexity
export default function ReviewPanel({ evaluation, currentUser, onWorkflowAction }: ReviewPanelProps) {
  const [reviewers, setReviewers] = useState<Profile[]>([])
  const [selectedReviewerId, setSelectedReviewerId] = useState<string>('')
  const [reviewerComments, setReviewerComments] = useState<string>('')
  const [pastApprovals, setPastApprovals] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const isCreator = evaluation.created_by === currentUser.id
  const isAssignedReviewer = evaluation.reviewer_id === currentUser.id
  const hasReviewerRole = ['Rater', 'Senior Rater', 'Reporting Senior', 'Admin'].includes(currentUser.preferred_role)

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const history = await fetchReviewApprovals(evaluation.id!)
        setPastApprovals(history || [])
      } catch (err: any) {
        console.error('Failed to load review history:', err)
      } finally {
        setLoadingHistory(false)
      }
    }

    const fetchPotentialReviewers = async () => {
      try {
        const { data, error: profError } = await supabase
          .from('profiles')
          .select('*')
          .neq('preferred_role', 'Sailor')
        
        if (profError) throw profError;
        setReviewers(data || [])
        if (data && data.length > 0) {
          setSelectedReviewerId(data[0].id)
        }
      } catch (err: any) {
        console.error('Failed to load eligible reviewers:', err)
      }
    }

    if (evaluation.id) {
      fetchHistory()
    }
    if (evaluation.status === 'draft' && isCreator) {
      fetchPotentialReviewers()
    }
  }, [evaluation.id, evaluation.status, isCreator])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedReviewerId) return;
    setLoading(true)
    setError(null)
    try {
      await submitForReview(evaluation.id!, selectedReviewerId, currentUser.id)
      onWorkflowAction()
    } catch (err: any) {
      setError(err.message || 'Failed to submit report for review.')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async () => {
    setLoading(true)
    setError(null)
    try {
      await approveEvaluation(evaluation.id!, currentUser.id, reviewerComments)
      setReviewerComments('')
      onWorkflowAction()
    } catch (err: any) {
      setError(err.message || 'Failed to approve evaluation.')
    } finally {
      setLoading(false)
    }
  }

  const handleReturn = async () => {
    if (!reviewerComments.trim()) {
      setError('You must specify comments explaining what needs correction before returning.')
      return;
    }
    setLoading(true)
    setError(null)
    try {
      await returnForCorrection(evaluation.id!, currentUser.id, reviewerComments)
      setReviewerComments('')
      onWorkflowAction()
    } catch (err: any) {
      setError(err.message || 'Failed to return evaluation.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Review Actions Panel */}
      <div className="glass-panel border border-slate-800 rounded-xl p-6 space-y-6">
        <div>
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <span className="text-[#3e6e99]">✦</span> Review Action Center
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Current Status: <span className="text-blue-400 font-bold uppercase">{evaluation.status.replace(/_/g, ' ')}</span>
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-950/20 border border-red-900/40 rounded-lg text-xs text-red-300">
            {error}
          </div>
        )}

        {/* 1. Draft creator submits to a Reviewer */}
        {evaluation.status === 'draft' && isCreator && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Select Reviewer / Reporting Senior
              </label>
              {reviewers.length > 0 ? (
                <select
                  value={selectedReviewerId}
                  onChange={(e) => setSelectedReviewerId(e.target.value)}
                  className="w-full bg-[#1c2541] border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {reviewers.map((rev) => (
                    <option key={rev.id} value={rev.id}>
                      {rev.last_name}, {rev.first_name} ({rev.preferred_role} - {rev.navy_rank || 'No Rank'})
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-xs text-amber-400">No reviewers registered yet. Invite other staff officers to register.</p>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || reviewers.length === 0}
              className="w-full py-2.5 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-xs font-bold text-white transition tracking-wide shadow-lg"
            >
              {loading ? 'Submitting...' : 'Submit Evaluation for Review'}
            </button>
          </form>
        )}

        {/* 2. Reviewer performs actions */}
        {evaluation.status === 'ready_for_review' && (isAssignedReviewer || currentUser.preferred_role === 'Admin') && (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Reviewer Remarks / Feedback
              </label>
              <textarea
                value={reviewerComments}
                onChange={(e) => setReviewerComments(e.target.value)}
                placeholder="Enter feedback or corrections here (required to Return for Correction)..."
                rows={4}
                className="w-full bg-[#1c2541] border border-slate-800 rounded-lg p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleReturn}
                disabled={loading}
                className="flex-1 py-2.5 rounded-lg bg-red-950/40 hover:bg-red-900/40 text-red-200 border border-red-900/50 text-xs font-bold transition"
              >
                Return for Correction
              </button>
              <button
                onClick={handleApprove}
                disabled={loading}
                className="flex-1 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-lg"
              >
                Approve & Complete
              </button>
            </div>
          </div>
        )}

        {/* 3. Report is in review but current user is not the reviewer */}
        {evaluation.status === 'ready_for_review' && !isAssignedReviewer && currentUser.preferred_role !== 'Admin' && (
          <div className="p-4 bg-slate-900/40 border border-slate-800 rounded-lg text-xs text-slate-400">
            This evaluation is currently awaiting review by the assigned staff officer.
          </div>
        )}

        {/* 4. Completed reports */}
        {evaluation.status === 'completed' && (
          <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-lg text-xs text-emerald-300">
            This evaluation report is approved and locked. No further modifications or approvals are required.
          </div>
        )}
      </div>

      {/* Review Feedback History */}
      <div className="glass-panel border border-slate-800 rounded-xl p-6 space-y-4">
        <h4 className="text-xs font-bold text-white uppercase tracking-wider">
          Review Feedback History
        </h4>

        {loadingHistory ? (
          <p className="text-xs font-mono text-slate-500">Loading historical feedback...</p>
        ) : pastApprovals.length === 0 ? (
          <p className="text-xs text-slate-500">No review approvals or returns have been recorded yet.</p>
        ) : (
          <div className="relative border-l border-slate-800 ml-2 pl-4 space-y-6">
            {pastApprovals.map((app, idx) => (
              <div key={app.id || idx} className="relative space-y-1">
                <span className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ${
                  app.approval_status === 'approved' ? 'bg-emerald-500' :
                  app.approval_status === 'returned' ? 'bg-red-500' : 'bg-slate-500'
                }`} />
                <div className="flex justify-between items-center text-xs">
                  <span className="font-semibold text-slate-200">
                    {app.profiles?.last_name}, {app.profiles?.first_name} ({app.profiles?.preferred_role})
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border ${
                    app.approval_status === 'approved' ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900/50' :
                    app.approval_status === 'returned' ? 'bg-red-950/40 text-red-400 border-red-900/50' :
                    'bg-slate-800 text-slate-400 border-slate-700'
                  }`}>
                    {app.approval_status}
                  </span>
                </div>
                {app.reviewer_comments && (
                  <p className="text-xs text-slate-400 italic bg-slate-950/30 p-2.5 rounded-lg border border-slate-900/60 mt-1">
                    "{app.reviewer_comments}"
                  </p>
                )}
                <span className="text-[10px] text-slate-500 block">
                  {new Date(app.created_at).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
