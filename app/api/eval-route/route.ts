// app/api/eval-route/route.ts
//
// Server-side ENFORCEMENT for custody transitions (route forward / recycle / begin
// debrief). The caller is identified from their session cookie; the transition is
// authorized + validated, then written with the service-role client (the RLS WITH
// CHECK forbids handing custody to someone else from the browser).

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, getRouteUserId } from '@/lib/supabaseClient'
import { hasPermission } from '@/lib/permissions'
import { nextStage, prevStage, NEXT_ROLE_BY_STAGE } from '@/lib/routing'

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })
const ok = () => NextResponse.json({ ok: true }, { status: 200 })
type Admin = ReturnType<typeof createAdminClient>

async function audit(admin: Admin, evalId: string, userId: string, action: string, details: any) {
  await admin.from('audit_logs').insert([{ evaluation_id: evalId, user_id: userId, action, details }])
}

export async function POST(req: NextRequest) {
  try {
    const callerId = await getRouteUserId()
    if (!callerId) return fail('Not authenticated.', 401)
    const { evaluationId, action, toUserId, comments } = await req.json()
    if (!evaluationId || !action) return fail('Missing required fields.', 400)

    const admin = createAdminClient()
    const { data: caller } = await admin.from('profiles').select('*').eq('id', callerId).single()
    const { data: ev } = await admin.from('evaluations').select('*').eq('id', evaluationId).single()
    if (!caller || !ev) return fail('Evaluation or caller not found.', 404)
    if (ev.signature_locked) return fail('This report is locked.', 409)

    if (action === 'route_forward') return await handleRouteForward(admin, caller, ev, toUserId)
    if (action === 'recycle') return await handleRecycle(admin, caller, ev, comments)
    if (action === 'begin_debrief') return await handleBeginDebrief(admin, caller, ev)
    return fail(`Unknown action: ${action}`, 400)
  } catch (error: any) {
    console.error('API Route Error:', error)
    return fail(error.message || 'Routing failed.', 500)
  }
}

async function handleRouteForward(admin: Admin, caller: any, ev: any, toUserId?: string) {
  if (ev.current_holder_id !== caller.id) return fail('Only the current holder may route this report.', 403)
  const next = nextStage(ev.routing_stage)
  if (!next) return fail('This report cannot be routed further.', 409)
  if (!toUserId) return fail('Select who to route to.', 400)

  const { data: target } = await admin.from('profiles').select('*').eq('id', toUserId).single()
  if (!target) return fail('Target user not found.', 404)
  const requiredRole = NEXT_ROLE_BY_STAGE[ev.routing_stage]
  if (requiredRole && target.preferred_role !== requiredRole) return fail(`The next holder must be a ${requiredRole}.`, 400)

  // If grouped, the Reporting Senior hop is fixed to the group's RS.
  if (next === 'reporting_senior' && ev.summary_group_id) {
    const { data: g } = await admin.from('summary_groups').select('reporting_senior_id').eq('id', ev.summary_group_id).single()
    if (g && toUserId !== g.reporting_senior_id) return fail("This eval is in a summary group; route to the group's Reporting Senior.", 400)
  }

  const participants = Array.from(new Set([...(ev.participants || []), toUserId]))
  await admin.from('evaluations').update({
    current_holder_id: toUserId, previous_holder_id: caller.id, routing_stage: next,
    participants, updated_at: new Date().toISOString(),
  }).eq('id', ev.id)
  await audit(admin, ev.id, caller.id, 'ROUTED_FORWARD', { from: ev.routing_stage, to: next, to_user: toUserId })
  return ok()
}

async function handleRecycle(admin: Admin, caller: any, ev: any, comments?: string) {
  const isHolder = ev.current_holder_id === caller.id
  const oversight = hasPermission(caller.preferred_role, 'view_all_evaluations')
  if (!isHolder && !oversight) return fail('You cannot recycle this report.', 403)
  if (!comments?.trim()) return fail('Provide correction comments before recycling.', 400)
  const prev = prevStage(ev.routing_stage)
  if (!prev || !ev.previous_holder_id) return fail('There is no previous holder to recycle to.', 409)

  await admin.from('evaluations').update({
    current_holder_id: ev.previous_holder_id, routing_stage: prev, updated_at: new Date().toISOString(),
  }).eq('id', ev.id)
  await admin.from('review_approvals').insert([{
    evaluation_id: ev.id, reviewer_id: caller.id, approval_status: 'returned', reviewer_comments: comments,
  }])
  await audit(admin, ev.id, caller.id, 'RECYCLED_FOR_CORRECTION', { to: prev, comments })
  return ok()
}

async function handleBeginDebrief(admin: Admin, caller: any, ev: any) {
  if (!hasPermission(caller.preferred_role, 'debrief_evaluation')) return fail('You are not permitted to debrief.', 403)
  if (ev.routing_stage !== 'reporting_senior' && ev.routing_stage !== 'admin') {
    return fail('Debrief can only begin once the report reaches the reporting senior.', 409)
  }
  const participants = Array.from(new Set([...(ev.participants || []), caller.id]))
  await admin.from('evaluations').update({
    routing_stage: 'debrief', current_holder_id: caller.id, participants, updated_at: new Date().toISOString(),
  }).eq('id', ev.id)
  await audit(admin, ev.id, caller.id, 'DEBRIEF_STARTED', {})
  return ok()
}
