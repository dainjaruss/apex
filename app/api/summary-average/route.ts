// app/api/summary-average/route.ts
//
// Computes the pooled summary-group average (Block 50a) for one evaluation. This runs with the
// service-role client for two reasons: (1) RLS (eval_select_custody) hides peers' evaluations
// from a sailor, so a browser-side pool would under-count; (2) it is the single authorization
// boundary for who may see the value at all.
//
// Authorization (see canViewSummaryAverage): reviewers (the rating chain) may always see it; the
// evaluated member (a Sailor) may NOT see it while the report is still being drafted/reviewed —
// only once it is finalized. The response is only an aggregate number, never any peer's grades.
//
// Body: { evaluationId: string, excludeSelf?: boolean }
//   excludeSelf returns the PEERS-only pool (gradedSum / gradedTraitCount) so the draft form can
//   combine it live with the member's in-progress grades. Omit it to pool the whole group.

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, getRouteUserId } from '@/lib/supabaseClient'
import { computeSummaryGroupAverage } from '@/lib/traitAverage'
import { canViewSummaryAverage } from '@/lib/permissions'

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

export async function POST(req: NextRequest) {
  try {
    const callerId = await getRouteUserId()
    if (!callerId) return fail('Not authenticated.', 401)

    const { evaluationId, excludeSelf } = await req.json()
    if (!evaluationId) return fail('Missing evaluationId.', 400)

    const admin = createAdminClient()
    const [{ data: caller }, { data: ev }] = await Promise.all([
      admin.from('profiles').select('preferred_role').eq('id', callerId).single(),
      admin
        .from('evaluations')
        .select('id, summary_group_id, trait_grades, signature_locked, routing_stage, status')
        .eq('id', evaluationId)
        .single(),
    ])
    if (!ev) return fail('Evaluation not found.', 404)
    if (!canViewSummaryAverage(caller?.preferred_role, ev)) {
      return fail('Not authorized to view the summary group average.', 403)
    }

    // Ungrouped → the member's own individual average (a group of one).
    if (!ev.summary_group_id) {
      return NextResponse.json(computeSummaryGroupAverage([ev.trait_grades]))
    }

    const { data, error } = await admin
      .from('evaluations')
      .select('id, trait_grades')
      .eq('summary_group_id', ev.summary_group_id)
    if (error) return fail(error.message, 500)

    const memberGrades = (data || [])
      .filter((e: any) => !(excludeSelf && e.id === ev.id))
      .map((e: any) => e.trait_grades)

    return NextResponse.json(computeSummaryGroupAverage(memberGrades))
  } catch (error: any) {
    console.error('summary-average API error:', error)
    return fail(error.message || 'Failed to compute summary group average.', 500)
  }
}
