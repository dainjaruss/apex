// components/EvaluationHeader.tsx
// fallow-ignore-next-line complexity
import React from 'react'
import { Evaluation } from '@/types'
import { useRouter } from 'next/navigation'

type Props = {
  evalData: Evaluation
  isDraft?: boolean
}

export default function EvaluationHeader({ evalData, isDraft = false }: Props) {
  const router = useRouter()
  const isOwner = evalData.created_by === evalData?.created_by // placeholder, actual ownership handled by page

  return (
    <header className="px-6 py-4 flex items-center justify-between border-b border-[#1c2541] glass-panel mb-6">
      <div className="flex items-center gap-3">
        <span className="font-extrabold text-xl tracking-wider text-white">APEX</span>
        <span className={`text-xs px-2.5 py-0.5 rounded-full ${isDraft ? 'bg-[#1c2541] text-[#3e6e99]' : 'bg-[#1c2541] text-[#3e6e99]'}'}>
          {isDraft ? 'VIEW DRAFT' : 'VIEW REPORT'}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/dashboard')}
          className="text-xs text-slate-400 hover:text-white transition px-3 py-1.5"
        >
          Dashboard
        </button>
        {isOwner && evalData.status === 'draft' && (
          <button
            onClick={() => router.push(`/evaluations/${evalData.id}/edit`)}
            className="px-4 py-1.5 rounded bg-[#3e6e99] hover:bg-[#4e82b0] text-xs font-semibold text-white transition"
          >
            Edit Draft
          </button>
        )}
      </div>
    </header>
  )
}
