// app/api/summary-distribution/route.ts
//
// Block 46 promotion-recommendation distribution (counts per observed category) for a summary
// group. Service-role so peers are counted despite RLS, and gated by the same rule as the summary
// average (canViewSummaryAverage): reviewers always; the evaluated member only once finalized.
//
// Body: { evaluationId: string, excludeSelf?: boolean }
//   excludeSelf returns the PEERS-only tally so the draft form can add the member's live
//   recommendation client-side; omit it to count the whole group.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, getRouteUserId } from "@/lib/supabaseClient";
import { canViewSummaryAverage } from "@/lib/permissions";
import { tallyRecommendations } from "@/lib/forcedDistribution";

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  try {
    const callerId = await getRouteUserId();
    if (!callerId) return fail("Not authenticated.", 401);

    const { evaluationId, excludeSelf } = await req.json();
    if (!evaluationId) return fail("Missing evaluationId.", 400);

    const admin = createAdminClient();
    const [{ data: caller }, { data: ev }] = await Promise.all([
      admin
        .from("profiles")
        .select("preferred_role")
        .eq("id", callerId)
        .single(),
      admin
        .from("evaluations")
        .select("id, summary_group_id, signature_locked, routing_stage, status")
        .eq("id", evaluationId)
        .single(),
    ]);
    if (!ev) return fail("Evaluation not found.", 404);
    if (!canViewSummaryAverage(caller?.preferred_role, ev)) {
      return fail(
        "Not authorized to view the summary group distribution.",
        403,
      );
    }

    if (!ev.summary_group_id) {
      return NextResponse.json(tallyRecommendations([]));
    }

    const { data, error } = await admin
      .from("evaluations")
      .select("id, promotion_recommendation")
      .eq("summary_group_id", ev.summary_group_id);
    if (error) return fail(error.message, 500);

    const recs = (data || [])
      .filter((e: any) => !(excludeSelf && e.id === ev.id))
      .map((e: any) => e.promotion_recommendation);

    return NextResponse.json(tallyRecommendations(recs));
  } catch (error: any) {
    console.error("summary-distribution API error:", error);
    return fail(
      error.message || "Failed to compute summary group distribution.",
      500,
    );
  }
}
