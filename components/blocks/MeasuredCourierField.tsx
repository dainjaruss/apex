// components/blocks/MeasuredCourierField.tsx
//
// Reusable Block-43-style measuring canvas: a Courier-monospace textarea sized to exactly
// `charsPerLine`, so it wraps on screen the same way the printed form/PDF will, with a live
// line-number gutter, line counter, and overflow styling. Used by Blocks 28, 29, 43, and 44.

"use client"

import React, { useEffect, useRef } from 'react'
import { measureTextFit } from '@/lib/commentFit'

const LINE_PX = 22

interface Props {
  value: string
  onChange: (value: string) => void
  charsPerLine: number
  maxLines: number
  placeholder?: string
  onFocus?: () => void
  /** External validation message to show under the canvas. */
  error?: string | null
  /** Accessible label / aria for the textarea. */
  ariaLabel?: string
  /** Optional caption rendered inline with the line counter (keeps the box tight to the label). */
  label?: string
  /** Characters reserved on line 1 for an inline lead box (e.g. Block 29A). */
  firstLineLead?: number
}

export default function MeasuredCourierField({
  value,
  onChange,
  charsPerLine,
  maxLines,
  placeholder,
  onFocus,
  error,
  ariaLabel,
  label,
  firstLineLead = 0,
}: Props) {
  const fit = measureTextFit(value || '', charsPerLine, maxLines, firstLineLead)
  const rows = Math.max(maxLines, fit.linesUsed)
  const over = !fit.fit
  const taRef = useRef<HTMLTextAreaElement>(null)

  // Grow the textarea to fit its content (never shorter than the printed line budget).
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = `${Math.max(ta.scrollHeight, maxLines * LINE_PX)}px`
  }, [value, charsPerLine, maxLines])

  const counterColor = over
    ? 'text-red-500 font-extrabold'
    : fit.linesUsed >= maxLines
    ? 'text-amber-500 font-bold'
    : 'text-slate-400'

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        {label ? (
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</span>
        ) : (
          <span />
        )}
        <span className={`text-xs ${counterColor}`}>Lines: {fit.linesUsed} / {maxLines}</span>
      </div>

      <div className={`flex w-fit max-w-full bg-slate-950/60 border rounded-xl overflow-x-auto py-3 ${
        over ? 'border-red-500/80' : 'border-slate-800 focus-within:border-[#3e6e99] focus-within:ring-1 focus-within:ring-[#3e6e99]'
      }`}>
        <div className="select-none bg-slate-950/80 border-r border-slate-900 pl-2 pr-2 text-right">
          {Array.from({ length: rows }, (_, i) => (
            <div
              key={i}
              className={`text-[10px] ${i + 1 > maxLines ? 'text-red-500 font-bold' : 'text-slate-600'}`}
              style={{ height: LINE_PX, lineHeight: `${LINE_PX}px` }}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          spellCheck={false}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className="block bg-transparent text-slate-100 p-0 ml-3 mr-3 resize-none focus:outline-none overflow-hidden"
          style={{
            fontFamily: "'Courier Prime', 'Courier New', Courier, monospace",
            fontSize: '13px',
            lineHeight: `${LINE_PX}px`,
            width: `${charsPerLine}ch`,
            minHeight: maxLines * LINE_PX,
            // Reserve the inline lead box (e.g. Block 29A) on line 1 so the on-screen
            // wrap matches the PDF's shortened first line.
            textIndent: firstLineLead > 0 ? `${firstLineLead}ch` : undefined,
          }}
        />
      </div>

      {(error || over) && (
        <p className="text-red-400 text-xs mt-2">
          {error || `Text exceeds ${maxLines} printed line(s) at ${charsPerLine} chars/line — trim it to fit.`}
        </p>
      )}
    </div>
  )
}
