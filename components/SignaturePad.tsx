// components/SignaturePad.tsx
//
// HTML5 Canvas-based signature capture component.
// Supports mouse and touch input for drawing wet signatures.
// Outputs a base64-encoded PNG data URL on save.
//

"use client"

import React, { useRef, useState, useEffect, useCallback } from 'react'

interface SignaturePadProps {
  label: string
  blockNumber: number
  existingSignature?: string | null   // base64 data URL if already signed
  existingTypedName?: string | null   // typed name text
  onSave: (data: { signatureDataUrl: string; typedName: string; dateSigned: string }) => void
  onClear: () => void
  disabled?: boolean
}

export default function SignaturePad({
  label,
  blockNumber,
  existingSignature,
  existingTypedName,
  onSave,
  onClear,
  disabled = false,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [typedName, setTypedName] = useState(existingTypedName || '')
  const [showPad, setShowPad] = useState(false)
  const [consent, setConsent] = useState(false)

  // Canvas setup
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // High-DPI support
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    // Drawing style
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  useEffect(() => {
    if (showPad) {
      // Small delay to let the DOM render the canvas
      const timer = setTimeout(initCanvas, 50)
      return () => clearTimeout(timer)
    }
  }, [showPad, initCanvas])

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      }
    }
    return {
      x: (e as React.MouseEvent).clientX - rect.left,
      y: (e as React.MouseEvent).clientY - rect.top,
    }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
    setIsDrawing(true)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled) return
    e.preventDefault()
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    setHasDrawn(true)
  }

  const endDraw = () => {
    setIsDrawing(false)
  }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }

  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas || !typedName.trim()) return

    const dataUrl = canvas.toDataURL('image/png')
    const now = new Date()
    const dateSigned = now.toISOString().split('T')[0]

    onSave({
      signatureDataUrl: hasDrawn ? dataUrl : '',
      typedName: typedName.trim(),
      dateSigned,
    })
    setShowPad(false)
  }

  const handleClearSignature = () => {
    onClear()
    setTypedName('')
    setHasDrawn(false)
    setConsent(false)
  }

  // Already signed — show preview
  if (existingSignature || existingTypedName) {
    return (
      <div className="space-y-2">
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
          Block {blockNumber}: {label}
        </label>
        <div className="bg-[#0d1b2a] border border-emerald-900/40 rounded-lg p-3 space-y-2">
          {existingSignature && (
            <img
              src={existingSignature}
              alt={`${label} signature`}
              className="h-12 w-auto bg-white/90 rounded px-2 py-1"
            />
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-emerald-400 font-semibold">
              ✓ Signed: {existingTypedName}
            </span>
            {!disabled && (
              <button
                type="button"
                onClick={handleClearSignature}
                className="text-[10px] text-red-400 hover:text-red-300 underline transition"
              >
                Clear Signature
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Not signed yet — show button or pad
  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
        Block {blockNumber}: {label}
      </label>

      {!showPad ? (
        <button
          type="button"
          onClick={() => !disabled && setShowPad(true)}
          disabled={disabled}
          className="w-full py-3 rounded-lg border-2 border-dashed border-slate-700 hover:border-blue-500/60
                     bg-[#0d1b2a]/60 text-xs text-slate-400 hover:text-blue-300 transition disabled:opacity-40"
        >
          ✍ Tap to Sign
        </button>
      ) : (
        <div className="bg-[#0d1b2a] border border-slate-700 rounded-xl p-4 space-y-3">
          {/* Drawing canvas */}
          <div className="relative">
            <canvas
              ref={canvasRef}
              className="w-full h-28 bg-white/95 rounded-lg cursor-crosshair touch-none"
              style={{ display: 'block' }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
            {!hasDrawn && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="text-slate-400/60 text-xs italic">Draw your signature here</span>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={clearCanvas}
            className="text-[10px] text-slate-500 hover:text-slate-300 underline transition"
          >
            Clear Drawing
          </button>

          {/* Typed name */}
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              Typed Name (required)
            </label>
            <input
              type="text"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder="LAST, FIRST MI"
              className="w-full bg-[#1c2541]/40 border border-slate-700/60 rounded px-3 py-1.5
                         text-xs text-white focus:outline-none focus:border-blue-500 transition"
            />
          </div>

          {/* Consent checkbox */}
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 accent-blue-500"
            />
            <span className="text-[10px] text-slate-400 leading-tight">
              I certify that this electronic signature is a true and accurate representation
              of my signature and constitutes my legal sign-off on this evaluation record.
            </span>
          </label>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowPad(false)}
              className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!typedName.trim() || !consent}
              className="flex-1 py-2 rounded-lg bg-blue-700 hover:bg-blue-600 disabled:opacity-40
                         text-xs font-bold text-white transition shadow-lg"
            >
              Apply Signature
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
