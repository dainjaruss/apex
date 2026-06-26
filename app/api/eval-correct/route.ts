// app/api/eval-correct/route.ts
//
// Server-side ENFORCEMENT for debrief MINOR corrections. RLS can't restrict which
// JSONB keys are editable, so this route is the only path: it checks the caller is a
// routing participant, the eval is in the debrief stage and unlocked, and the patch is
// intersected with a strict allowlist (no trait grades / recommendations / signatures).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, getRouteUserId } from '@/lib/supabaseClient'
import { MINOR_CORRECTION_KEYS } from '@/lib/routing'

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

// Keys that are top-level evaluation columns rather than block_values entries.
const TOP_LEVEL_KEYS = new Set(['comments'])

export async function POST(req: NextRequest) {
  try {
    const callerId = await getRouteUserId()
    if (!callerId) return fail('Not authenticated.', 401)
    const { evaluationId, patch } = await req.json()
    if (!evaluationId || !patch || typeof patch !== 'object') return fail('Missing required fields.', 400)

    const admin = createAdminClient()
    const { data: ev } = await admin.from('evaluations').select('*').eq('id', evaluationId).single()
    if (!ev) return fail('Evaluation not found.', 404)
    if (ev.signature_locked) return fail('This report is locked.', 409)
    if (ev.routing_stage !== 'debrief') return fail('Corrections are only open during debrief.', 409)
    if (!(ev.participants || []).includes(callerId)) return fail('Only people who handled this report may make corrections.', 403)

    const update: Record<string, any> = { updated_at: new Date().toISOString() }
    const block_values = { ...(ev.block_values || {}) }
    let applied = 0
    for (const key of MINOR_CORRECTION_KEYS) {
      if (!(key in patch)) continue
      if (TOP_LEVEL_KEYS.has(key)) update[key] = patch[key]
      else block_values[key] = patch[key]
      applied++
    }
    if (applied === 0) return fail('No editable fields in the patch.', 400)
    update.block_values = block_values

    await admin.from('evaluations').update(update).eq('id', evaluationId)
    await admin.from('audit_logs').insert([{
      evaluation_id: evaluationId, user_id: callerId, action: 'MINOR_CORRECTION_APPLIED',
      details: { keys: Object.keys(patch).filter((k) => MINOR_CORRECTION_KEYS.includes(k)) },
    }])
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error: any) {
    console.error('API Correct Error:', error)
    return fail(error.message || 'Correction failed.', 500)
  }
}
