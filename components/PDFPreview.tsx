// components/PDFPreview.tsx
//
// Component for rendering a high-fidelity PDF preview in an iframe.
// Implements secure memory management on unmount.
//

"use client"

import React, { useEffect, useState } from 'react'
import { Evaluation } from '@/types'

interface PDFPreviewProps {
  evaluation: Evaluation
  // Whether the official PDF may be downloaded. Off for an unvalidated draft preview, where the
  // document can be viewed (to track progress) but not yet exported as a finished artifact.
  allowDownload?: boolean
}

export default function PDFPreview({ evaluation, allowDownload = true }: PDFPreviewProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let currentUrl: string | null = null

    const fetchPdf = async () => {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch('/api/pdf', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(evaluation),
        })

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}))
          throw new Error(errData.error || 'Failed to generate preview PDF.')
        }

        const blob = await response.blob()
        if (active) {
          currentUrl = URL.createObjectURL(blob)
          setPdfUrl(currentUrl)
        }
      } catch (err: any) {
        console.error('Error fetching PDF preview:', err)
        if (active) {
          setError(err.message || 'Failed to fetch PDF preview.')
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    fetchPdf()

    // Clean up memory URL on unmount
    return () => {
      active = false
      if (currentUrl) {
        URL.revokeObjectURL(currentUrl)
      }
    }
  }, [evaluation])

  const handleDownload = () => {
    if (!pdfUrl) return
    const link = document.createElement('a')
    link.href = pdfUrl
    link.download = `EVAL_${(evaluation.member_name || 'REPORT').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] bg-slate-950/20 border border-slate-800 rounded-xl">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#608bb3] mb-4"></div>
        <p className="text-xs text-slate-400 font-mono animate-pulse">
          Generating high-fidelity PDF canvas overlay...
        </p>
      </div>
    )
  }

  if (error || !pdfUrl) {
    return (
      <div className="flex flex-col items-center justify-center h-[500px] bg-red-950/10 border border-red-900/30 rounded-xl p-6 text-center">
        <span className="text-red-400 font-bold mb-2">Failed to Generate Preview</span>
        <p className="text-xs text-slate-400 max-w-sm mb-4">{error || 'Unknown error occurred.'}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[650px] bg-slate-900/40 rounded-xl border border-slate-800 overflow-hidden">
      {/* Control bar */}
      <div className="px-4 py-3 bg-slate-950/50 border-b border-slate-800 flex items-center justify-between">
        <span className="text-xs font-mono text-slate-400">
          Document Output: 2 Pages (Letter Size)
        </span>
        {allowDownload ? (
          <button
            onClick={handleDownload}
            className="px-3.5 py-1.5 rounded bg-[#3e6e99] hover:bg-[#4e82b0] text-xs font-bold text-white transition flex items-center gap-1.5 shadow"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download PDF Document
          </button>
        ) : (
          <span className="text-[11px] text-slate-500 italic">Download unlocks once validation passes</span>
        )}
      </div>

      {/* Frame container */}
      <div className="flex-1 bg-slate-950/10 relative">
        <iframe
          src={`${pdfUrl}#toolbar=0&navpanes=0`}
          title="PDF Document Preview"
          className="w-full h-full border-none"
        />
      </div>
    </div>
  )
}
