// components/CredentialSignatureModal.tsx
//
// Reusable "sign with credentials" popup. The signer re-authenticates with their own
// username (email) + password at signing time; submission POSTs to /api/sign which
// verifies the credentials and the signer's authorization server-side before applying
// the signature. Overlay pattern mirrors components/ConsentModal.tsx.
//

"use client"

import React, { useEffect, useRef, useState, useCallback } from 'react'

interface CredentialSignatureModalProps {
  evaluationId: string
  block: number
  blockLabel: string
  /** human description of who may sign, e.g. "Senior Rater" */
  signer: string
  defaultTypedName?: string
  onSigned: () => void
  onClose: () => void
}

export default function CredentialSignatureModal({
  evaluationId,
  block,
  blockLabel,
  signer,
  defaultTypedName,
  onSigned,
  onClose,
}: CredentialSignatureModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [typedName, setTypedName] = useState(defaultTypedName || '')
  const [consent, setConsent] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Canvas setup (high-DPI)
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }, [])

  useEffect(() => { initCanvas() }, [initCanvas])

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const point = 'touches' in e ? e.touches[0] : e
    return { x: point.clientX - rect.left, y: point.clientY - rect.top }
  }

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    setIsDrawing(true)
  }

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { x, y } = getPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    setHasDrawn(true)
  }

  const endDraw = () => setIsDrawing(false)

  const clearCanvas = () => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }

  const handleSubmit = async () => {
    setError(null)
    if (!typedName.trim()) { setError('Enter your typed name.'); return }
    if (!email.trim() || !password) { setError('Enter your username (email) and password to sign.'); return }
    if (!consent) { setError('You must certify the signature to proceed.'); return }

    setSubmitting(true)
    try {
      const signatureDataUrl = hasDrawn ? (canvasRef.current?.toDataURL('image/png') || '') : ''
      const res = await fetch('/api/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ evaluationId, block, email: email.trim(), password, typedName: typedName.trim(), signatureDataUrl }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'Failed to apply signature.')
        return
      }
      onSigned()
    } catch (err: any) {
      setError(err.message || 'Network error while signing.')
    } finally {
      setSubmitting(false)
    }
  }

  const FIELD = 'w-full bg-[#1c2541]/40 border border-slate-700/60 rounded px-3 py-2 text-sm text-foreground focus:outline-none focus:border-[#3e6e99] focus:ring-1 focus:ring-[#3e6e99] transition'
  const LABEL = 'block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1'

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#0b132b]/80 backdrop-blur-sm">
      <div className="w-full max-w-lg p-6 rounded-2xl glass-panel space-y-4 border border-[#3e6e99]/30 shadow-2xl">
        <div className="border-b border-slate-700/40 pb-3">
          <h3 className="text-lg font-bold gold-accent">Sign Block {block}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{blockLabel} — to be signed by the {signer}. Enter your own credentials to certify.</p>
        </div>

        <div>
          <label className={LABEL}>Typed Name (Last, First MI)</label>
          <input className={FIELD} placeholder="DOE, JOHN A" value={typedName}
            onChange={(e) => setTypedName(e.target.value.toUpperCase())} />
        </div>

        <div>
          <label className={LABEL}>Signature (optional)</label>
          <canvas
            ref={canvasRef}
            className="w-full h-24 bg-white rounded border border-slate-700/60 touch-none cursor-crosshair"
            onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
            onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
          />
          {hasDrawn && (
            <button type="button" onClick={clearCanvas} className="mt-1 text-[10px] text-slate-400 hover:text-white">Clear drawing</button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className={LABEL}>Username (email)</label>
            <input className={FIELD} type="email" autoComplete="off" placeholder="you@navy.mil" value={email}
              onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className={LABEL}>Password</label>
            <input className={FIELD} type="password" autoComplete="off" placeholder="••••••••" value={password}
              onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>

        <label className="flex items-start gap-2 cursor-pointer">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 accent-blue-500" />
          <span className="text-[10px] text-slate-400 leading-tight">
            I certify that this electronic signature is a true and accurate representation of my signature and
            constitutes my legal sign-off on this evaluation record.
          </span>
        </label>

        {error && <p className="text-red-400 text-xs font-semibold">{error}</p>}

        <div className="pt-2 flex justify-end gap-3 border-t border-slate-700/40">
          <button onClick={onClose} disabled={submitting}
            className="px-4 py-2 rounded text-xs font-semibold text-slate-400 hover:text-white transition">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className="px-5 py-2 rounded bg-[#3e6e99] hover:bg-[#4e82b0] disabled:opacity-50 text-white font-bold text-xs transition">
            {submitting ? 'Verifying…' : 'Sign & Certify'}
          </button>
        </div>
      </div>
    </div>
  )
}
