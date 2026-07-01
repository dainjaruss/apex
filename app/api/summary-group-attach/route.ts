// app/api/summary-group-attach/route.ts
//
// Server-side enforcement for summary-group attachment. RLS allows the current
// holder to set summary_group_id directly, but that bypasses BUPERS eligibility;
// this route validates membership criteria before writing with the service role.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, getRouteUserId } from '@/lib/supabaseClient'
import { hasPermission } from '@/lib/permissions'
import { isEvalEligibleForSummaryGroup, SummaryGroupWithRs } from '@/lib/summaryGroupEligibility'

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function POST(req: NextRequest) {
  try {
    const callerId = await getRouteUserId()
    if (!callerId) return fail('Not authenticated.', 401)

    const { evaluationId, groupId } = await req.json()
    if (!evaluationId) return fail('Missing evaluationId.', 400)

    const admin = createAdminClient()
    const { data: caller } = await admin.from('profiles').select('*').eq('id', callerId).single()
    const { data: ev } = await admin.from('evaluations').select('*').eq('id', evaluationId).single()
    if (!caller || !ev) return fail('Evaluation or caller not found.', 404)
    if (ev.signature_locked) return fail('This report is locked.', 409)

    const isHolder = ev.current_holder_id === callerId
    const oversight = hasPermission(caller.preferred_role, 'view_all_evaluations')
    if (!isHolder && !oversight) return fail('Only the current holder may attach a summary group.', 403)

    if (groupId === null || groupId === '') {
      await admin.from('evaluations').update({ summary_group_id: null, updated_at: new Date().toISOString() }).eq('id', evaluationId)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const { data: groupRow, error: groupErr } = await admin
      .from('summary_groups')
      .select('*, reporting_senior:profiles!reporting_senior_id(dod_id)')
      .eq('id', groupId)
      .single()
    if (groupErr || !groupRow) return fail('Summary group not found.', 404)

    const group: SummaryGroupWithRs = {
      ...groupRow,
      reporting_senior_dod_id: (groupRow as any).reporting_senior?.dod_id ?? null,
    }

    if (!isEvalEligibleForSummaryGroup(ev, group)) {
      return fail(
        'This evaluation is not eligible for that summary group (paygrade, promotion status, ending date, report type, UIC, or reporting senior must match per BUPERSINST 1610.10H).',
        400,
      )
    }

    await admin.from('evaluations').update({ summary_group_id: groupId, updated_at: new Date().toISOString() }).eq('id', evaluationId)
    await admin.from('audit_logs').insert([{
      evaluation_id: evaluationId,
      user_id: callerId,
      action: 'SUMMARY_GROUP_ATTACHED',
      details: { group_id: groupId, group_name: group.name },
    }])
    return NextResponse.json({ ok: true }, { status: 200 })
  } catch (error: any) {
    console.error('API Summary Group Attach Error:', error)
    return fail(error.message || 'Summary group attachment failed.', 500)
  }
}
