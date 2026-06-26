// components/report/DetailsTab.tsx
//
// Read-only "Form Details" tab for the report screen, decomposed into small sections.
// A shared <Field> kills the repeated label/value markup; <SignatureRow>/<SignField>
// own the sign-or-display logic. Signing is delegated up via onSign.

import React from 'react'
import { Evaluation } from '@/types'
import { checkCommentFit } from '@/lib/commentFit'
import { SIGNATURE_BLOCKS, SignatureBlockMeta } from '@/lib/signatures'

export type OnSign = (block: number, label: string, signer: string) => void

const PANEL = 'glass-panel rounded-xl p-6'
const H3 = 'text-sm font-bold gold-accent uppercase tracking-wider mb-4 border-b border-slate-800 pb-2'
const LBL = 'text-xs text-slate-500'

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className={LBL}>{label}</div>
      <div className="font-semibold text-white mt-0.5">{value}</div>
    </div>
  )
}

function joinFlags(...flags: (string | false | undefined)[]): string {
  return flags.filter(Boolean).join(' ') || '—'
}

function IdentitySection({ e }: { e: Evaluation }) {
  const bv = e.block_values || {}
  return (
    <div className={PANEL}>
      <h3 className={H3}>Blocks 1 - 19: Identity & Report Occasion</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6 text-sm">
        <Field label="1: Name" value={e.member_name} />
        <Field label="2: Grade/Rate" value={e.grade_rate} />
        <Field label="3: Designator" value={e.designator || 'N/A'} />
        <Field label="4: DoD ID" value={e.dod_id} />
        <Field label="5: Duty Status" value={e.duty_status} />
        <Field label="6: UIC" value={e.uic} />
        <Field label="7: Ship/Station" value={e.ship_station} />
        <Field label="8: Promotion Status" value={e.promotion_status} />
        <Field label="9: Date Reported" value={bv.date_reported || 'N/A'} />
        <Field label="Period of Report" value={`${e.period_from} to ${e.period_to}`} />
        <Field label="Occasion" value={joinFlags(bv.periodic && 'Periodic (10)', bv.detachment_individual && 'Detachment of Individual (11)', bv.promotion_frocking && 'Promotion/Frocking (12)', bv.special && 'Special (13)')} />
        <Field label="Report Type" value={joinFlags(bv.regular_report && 'Regular (17)', bv.concurrent_report && 'Concurrent (18)', bv.not_observed && 'Not Observed (16)')} />
      </div>
    </div>
  )
}

function SignField({ e, block, keyName, label, signer, onSign }: { e: Evaluation; block: number; keyName: string; label: string; signer: string; onSign: OnSign }) {
  const bv = e.block_values || {}
  const signed = bv[keyName]
  const date = bv[`${keyName}_date`]
  if (signed) return <div className="font-semibold text-emerald-300 mt-0.5 truncate">✓ {signed}{date ? ` · ${date}` : ''}</div>
  if (e.status === 'archived' || e.signature_locked) return <div className="font-semibold text-white mt-0.5">— (blank)</div>
  return (
    <button onClick={() => onSign(block, label, signer)} className="mt-1 px-2.5 py-1 rounded bg-[#3e6e99] hover:bg-[#4e82b0] text-white text-[11px] font-semibold transition">
      ✍ Sign
    </button>
  )
}

function CommandContextSection({ e, onSign }: { e: Evaluation; onSign: OnSign }) {
  const bv = e.block_values || {}
  return (
    <div className={PANEL}>
      <h3 className={H3}>Blocks 20 - 32: Command Context & Counseling</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6 text-sm mb-6">
        <Field label="20: Physical Readiness" value={bv.physical_readiness || 'N/A'} />
        <Field label="21: Billet Subcategory" value={bv.billet_subcategory || 'NA'} />
        <Field label="22: Reporting Senior" value={bv.reporting_senior_name || 'N/A'} />
        <Field label="23: RS Grade" value={bv.reporting_senior_grade || 'N/A'} />
        <Field label="24: RS Designator" value={bv.reporting_senior_designator || 'N/A'} />
        <Field label="25: RS Title" value={bv.reporting_senior_title || 'N/A'} />
        <Field label="26: RS UIC" value={bv.reporting_senior_uic || 'N/A'} />
        <Field label="30: Date Counseled" value={bv.date_counseled || 'N/A'} />
        <Field label="31: Counselor" value={bv.counselor || 'N/A'} />
        <div>
          <div className={LBL}>32: Sig of Individual Counseled</div>
          <SignField e={e} block={32} keyName="individual_counseled_signature" label="Signature of Individual Counseled" signer="evaluated member" onSign={onSign} />
        </div>
      </div>
      <div className="space-y-4 text-sm border-t border-slate-800/60 pt-4">
        <div>
          <div className={LBL}>28: Command Employment and Achievements</div>
          <p className="mt-1 text-slate-300 whitespace-pre-wrap">{bv.command_achievements || 'None listed.'}</p>
        </div>
        <div>
          <div className={LBL}>29: Primary/Collateral/Watchstanding Duties</div>
          <p className="mt-1 text-slate-300 whitespace-pre-wrap">{bv.primary_duties || 'None listed.'}</p>
        </div>
      </div>
    </div>
  )
}

function TraitRatingsSection({ e }: { e: Evaluation }) {
  return (
    <div className={PANEL}>
      <h3 className={H3}>Blocks 33 - 40: Trait Ratings Breakdown</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-4 text-center">
        {Object.entries(e.trait_grades || {}).map(([key, val]) => (
          <div key={key} className="bg-slate-950/45 p-3 rounded-lg border border-slate-800/80">
            <div className="text-[10px] text-slate-500 font-semibold uppercase truncate">{key === 'eo' ? 'Climate/EO' : key}</div>
            <div className="text-base font-bold text-white mt-1">{val as string}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function NarrativeSection({ e }: { e: Evaluation }) {
  const pitch = e.block_values?.comment_pitch || '10'
  const fit = checkCommentFit(e.comments || '', pitch)
  return (
    <div className={PANEL}>
      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2">
        <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">Block 43: Narrative Comments</h3>
        <span className="text-[10px] text-slate-500 font-mono">Pitch Selected: {pitch}-Pitch | Lines: {fit.linesUsed} / 18</span>
      </div>
      <div className="w-full bg-slate-950/60 rounded-xl p-5 border border-slate-900 font-mono text-xs overflow-x-auto text-slate-200 min-h-[160px]">
        {fit.wrappedLines.length === 0 ? (
          <p className="italic text-slate-600">No narrative entered.</p>
        ) : (
          <div className="space-y-0.5">
            {fit.wrappedLines.map((line, idx) => (
              <div key={idx} className="flex">
                <span className="w-6 text-[10px] text-slate-700 pr-1.5 mr-2 text-right border-r border-slate-900 select-none">{idx + 1}</span>
                <span className="whitespace-pre">{line}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SignatureRow({ e, s, onSign }: { e: Evaluation; s: SignatureBlockMeta; onSign: OnSign }) {
  const bv = e.block_values || {}
  const signedName = bv[s.key]
  const signedDate = bv[`${s.key}_date`]
  return (
    <div className="flex items-center justify-between gap-3 bg-[#0d1b2a]/40 border border-slate-800/60 rounded-lg px-3 py-2">
      <div className="min-w-0">
        <div className="text-slate-500">{s.block}: {s.label}</div>
        {signedName ? (
          <div className="font-semibold text-emerald-300 mt-0.5 truncate">✓ {signedName}{signedDate ? ` · ${signedDate}` : ''}</div>
        ) : (
          <div className="text-slate-500 mt-0.5 italic">Unsigned</div>
        )}
      </div>
      {!signedName && e.status !== 'archived' && !e.signature_locked && (
        <button onClick={() => onSign(s.block, s.label, s.signer)} className="shrink-0 px-3 py-1.5 rounded bg-[#3e6e99] hover:bg-[#4e82b0] text-white font-semibold transition">
          ✍ Sign
        </button>
      )}
    </div>
  )
}

function RecommendationsSection({ e, onSign }: { e: Evaluation; onSign: OnSign }) {
  const bv = e.block_values || {}
  const recs = (e.career_recommendations || []).filter(Boolean)
  return (
    <div className={PANEL}>
      <h3 className={H3}>Blocks 41, 44 - 52: Recommendations & Signatures</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm mb-6">
        <div>
          <div className={LBL}>Block 41: Career Recommendations</div>
          <ul className="list-disc pl-5 mt-1 font-semibold text-white">
            {recs.length ? recs.map((r, i) => <li key={i}>{r}</li>) : <li className="italic text-slate-600">None</li>}
          </ul>
        </div>
        <Field label="45: Promotion Recommendation" value={e.promotion_recommendation || 'NOB'} />
        <Field label="47: Retention Recommendation" value={e.retention || 'N/A'} />
      </div>
      <div className="mb-6">
        <div className="text-xs text-slate-500 mb-1">44: Qualifications/Achievements</div>
        <p className="text-slate-300 text-sm whitespace-pre-wrap">{bv.qualifications || 'None listed.'}</p>
      </div>
      <div className="mb-4">
        <div className="text-xs text-slate-500 mb-1">48: Reporting Senior Address</div>
        <p className="text-slate-300 text-sm whitespace-pre-wrap">{bv.reporting_senior_address || 'None listed.'}</p>
      </div>
      <p className="text-[11px] text-slate-500 mb-3">Each block is signed here on the report. Signing requires the authorized signer to enter their own credentials.</p>
      <div className="border-t border-slate-800/80 pt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        {SIGNATURE_BLOCKS.filter((s) => s.block !== 32).map((s) => (
          <SignatureRow key={s.key} e={e} s={s} onSign={onSign} />
        ))}
      </div>
    </div>
  )
}

export default function DetailsTab({ evaluation, onSign }: { evaluation: Evaluation; onSign: OnSign }) {
  return (
    <div className="space-y-6">
      <IdentitySection e={evaluation} />
      <CommandContextSection e={evaluation} onSign={onSign} />
      <TraitRatingsSection e={evaluation} />
      <NarrativeSection e={evaluation} />
      <RecommendationsSection e={evaluation} onSign={onSign} />
    </div>
  )
}
