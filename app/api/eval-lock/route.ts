// app/api/eval-lock/route.ts
//
// Server-side ENFORCEMENT for the reporting-senior lock/unlock. A locked row can't be
// updated by anyone via RLS (including the RS), so the toggle must run through the
// service-role client. Locking on block-50 signature happens inside /api/sign; this
// route is the deliberate RS/Admin unlock (and an explicit lock if needed).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, getRouteUserId } from '@/lib/supabaseClient'
import { hasPermission } from '@/lib/permissions'

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function POST(req: NextRequest) {
  try {
    const callerId = await getRouteUserId()
    if (!callerId) return fail('Not authenticated.', 401)
    const { evaluationId, lock } = await req.json()
    if (!evaluationId || typeof lock !== 'boolean') return fail('Missing required fields.', 400)

    const admin = createAdminClient()
    const { data: caller } = await admin.from('profiles').select('*').eq('id', callerId).single()
    const { data: ev } = await admin.from('evaluations').select('id').eq('id', evaluationId).single()
    if (!caller || !ev) return fail('Evaluation or caller not found.', 404)
    if (!hasPermission(caller.preferred_role, 'debrief_evaluation')) {
      return fail('Only the reporting senior or an admin may lock/unlock this report.', 403)
    }

    await admin.from('evaluations').update({
      signature_locked: lock,
      routing_stage: lock ? 'locked' : 'debrief',
      updated_at: new Date().toISOString(),
    }).eq('id', evaluationId)
    await admin.from('audit_logs').insert([{
      evaluation_id: evaluationId, user_id: callerId, action: lock ? 'EVAL_LOCKED' : 'EVAL_UNLOCKED', details: {},
    }])
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error: any) {
    console.error('API Lock Error:', error)
    return fail(error.message || 'Lock toggle failed.', 500)
  }
}
