// app/pdf-preview/page.tsx
//
// TEMPORARY QA preview: renders the generated NAVPERS PDF (via /api/pdf) for a fully
// populated sample evaluation, embedded in the browser. Click "Regenerate" after any
// pdfGenerator change to re-render. Safe to delete once PDF QA is complete.

"use client"

import React, { useCallback, useEffect, useState } from 'react'

const SAMPLE = {
  member_name: 'ARMSTEAD, AMBRIELLE',
  grade_rate: 'IT1',
  designator: '',
  dod_id: '1023456789',
  duty_status: 'INACT',
  uic: '83436',
  ship_station: 'NR NCTAMS LANT',
  promotion_status: 'Regular',
  period_from: '2017-04-01',
  period_to: '2017-11-15',
  trait_grades: { knowledge: '4.0', work: '4.0', eo: '4.0', bearing: '5.0', accomplishment: '5.0', teamwork: '4.0', leadership: '5.0' },
  trait_average: 4.29,
  comments:
    '*** STAR PERFORMER. MY #2 OF 7 HIGHLY COMPETITIVE FIRST CLASS PETTY OFFICERS ***\n* PROVEN LEADER WHO CONSISTENTLY PERFORMS WELL ABOVE HER PAYGRADE-NO DOUBT FRONT RUNNER *\nSUPERB LEADER. Lead three Sailors in the tracking, managing, and maintenance of the Command\'s Administrative correspondence resulting in the creation of a more robust Unit Collateral Duty list.\nREADY TO LEAD AT COMMAND LEVEL - MAKE CHIEF NOW!',
  career_recommendations: ['CPO', 'CCC'],
  promotion_recommendation: 'Must Promote',
  retention: 'Recommended',
  block_values: {
    date_reported: '2017-04-01',
    periodic: true,
    regular_report: true,
    physical_readiness: 'PP',
    billet_subcategory: 'NA',
    reporting_senior_name: 'PHELPS, C J',
    reporting_senior_grade: 'CDR',
    reporting_senior_designator: '1825',
    reporting_senior_title: 'CO',
    reporting_senior_uic: '83436',
    reporting_senior_dod_id: '9988776655',
    command_achievements:
      'NR NCTAMS LANT operates and defends responsive, resilient, and secure computer and telecommunications systems, providing information superiority for global maritime and joint forces.',
    primary_duty_abbrev: 'IT COMM TECH',
    primary_duties:
      'PRI: Watchstander, COLL: CFL-8, SSR-4. JOB SCOPE: Perform watch standing duties for NCTAMS LANT. UMUIC: Local TRUIC Billet. PFA 17-1/17-2.',
    qualifications:
      'Completed 25 college credit hours towards Comp Info Sys BS Degree. Completed ISSM course for NEC 2779. Volunteered 25 hours for United Way VITA tax preparation program.',
    date_counseled: 'NOT PERF',
    counselor: 'NONE PROVIDED',
    reporting_senior_address: '6476 ASHBY GROVE LOOP, HAYMARKET, VA 20169-3210',
    member_statement_intent: 'I do not intend to submit a statement',
  },
}

export default function PdfPreviewPage() {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const generate = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(SAMPLE),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      const blob = await res.blob()
      setUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(blob)
      })
    } catch (e: any) {
      setError(e.message || 'Failed to generate PDF')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { generate() }, [generate])

  return (
    <div className="min-h-screen bg-[#0b132b] text-[#f0f4f8] flex flex-col">
      <header className="px-6 py-3 flex items-center justify-between border-b border-[#1c2541] glass-panel">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-lg tracking-wider text-white">APEX</span>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#1c2541] text-[#3e6e99]">PDF QA PREVIEW</span>
        </div>
        <div className="flex items-center gap-3">
          {url && <a href={url} download="EVAL_PREVIEW.pdf" className="text-xs text-slate-300 hover:text-white">Download</a>}
          <button onClick={generate} disabled={loading} className="px-4 py-1.5 bg-[#3e6e99] hover:bg-[#4e82b0] disabled:opacity-50 text-xs font-semibold text-white rounded-lg transition">
            {loading ? 'Generating…' : 'Regenerate'}
          </button>
        </div>
      </header>
      {error && <p className="text-red-400 text-sm p-4 font-mono">{error}</p>}
      <div className="flex-1">
        {url ? (
          <iframe src={url} title="EVAL PDF" className="w-full h-full" style={{ minHeight: 'calc(100vh - 52px)' }} />
        ) : (
          !error && <p className="text-slate-400 text-sm p-6">Generating preview…</p>
        )}
      </div>
    </div>
  )
}
