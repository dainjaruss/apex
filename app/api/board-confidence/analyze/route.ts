// app/api/board-confidence/analyze/route.ts
//
// Runs a Board Confidence analysis for the caller's own record: assembles rubric
// inputs server-side, scores, generates the narrative, and persists the snapshot
// with a fail-closed audit row. OWNER-ONLY (v1.1 review fix): profiles roles are
// self-asserted (RoleGuard is client-side UX, not authority), so an
// Admin-on-behalf path is deferred until real server-side role authority exists.
// Spec: docs/specs/board-confidence-analyzer.md §5.1

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, getRouteUserId } from "@/lib/supabaseClient";
import { runBoardAnalysis } from "@/lib/boardConfidence/service";

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

// Each run fans out several admin queries and may call the Anthropic API; cap
// concurrent runs exactly like the NAVFIT export route (navfit98/route.ts:27-34).
// ponytail: in-process counter — move to shared rate limiting if this route ever
// runs across multiple workers.
const MAX_CONCURRENT_ANALYSES = 2;
let activeAnalyses = 0;

export async function POST(req: NextRequest) {
  if (activeAnalyses >= MAX_CONCURRENT_ANALYSES) {
    return fail("Too many analyses in progress. Try again shortly.", 429);
  }
  activeAnalyses++;
  try {
    const callerId = await getRouteUserId();
    if (!callerId) return fail("Not authenticated.", 401);

    const { userId, boardDate } = await req.json();
    const subjectUserId = userId || callerId;
    const T = boardDate || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(T) || Number.isNaN(Date.parse(T)))
      return fail("Invalid boardDate (expected YYYY-MM-DD).", 400);

    // Owner-only (v1.1 review fix): profiles.preferred_role/assigned_roles are
    // user-editable, so an "Admin" check against them authorizes nothing.
    if (subjectUserId !== callerId)
      return fail("Only the record owner may run/view analyses.", 403);

    const admin = createAdminClient();

    const { data: subject } = await admin
      .from("profiles")
      .select("id")
      .eq("id", subjectUserId)
      .single();
    if (!subject) return fail("Subject profile not found.", 404);

    // Explicit informed consent (first-use modal) is server-enforced: an
    // analysis processes the member's record and may call an external AI API.
    const { data: consentRow } = await admin
      .from("member_board_records")
      .select("consented_at")
      .eq("user_id", subjectUserId)
      .maybeSingle();
    if (!consentRow?.consented_at)
      return fail(
        "Consent required. Review and accept the Board Confidence Analyzer terms before running an analysis.",
        403,
      );

    const row = await runBoardAnalysis(admin, subjectUserId, callerId, T);
    return NextResponse.json(row, { status: 200 });
  } catch (error: any) {
    // May carry DB/Anthropic internals — log them, never echo them.
    console.error("Board confidence analysis error:", error);
    return fail("Board confidence analysis failed. See server logs for details.", 500);
  } finally {
    activeAnalyses--;
  }
}
