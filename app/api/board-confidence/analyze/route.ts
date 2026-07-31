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

const ISO_DATE = (s: unknown): s is string =>
  typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

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

    const { userId, boardDate, asOf } = await req.json();
    const subjectUserId = userId || callerId;
    const T = boardDate || new Date().toISOString().slice(0, 10);
    if (!ISO_DATE(T))
      return fail("Invalid boardDate (expected YYYY-MM-DD).", 400);

    // asOf is the readiness layer's "today" and a TRUST BOUNDARY: the engine
    // reads no clock, so a client hands it in. Malformed, it would make
    // monthsBefore return NaN, every `typical_months <= NaN` compare false, and
    // silently push every action to "next cycle" — reject it rather than let it
    // become NaN. Absent, the server's own date is used.
    const asOfDate = asOf ?? new Date().toISOString().slice(0, 10);
    if (!ISO_DATE(asOfDate))
      return fail("Invalid asOf (expected YYYY-MM-DD).", 400);

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
        "Consent required. Review and accept the Record Readiness Review terms before running an analysis.",
        403,
      );

    // The returned row carries the run's ReadinessReport at input.readiness —
    // built and snapshotted inside runBoardAnalysis, where the (result, inputs,
    // config) triple is formed and can be asserted self-consistent.
    const row = await runBoardAnalysis(admin, subjectUserId, callerId, T, asOfDate);
    return NextResponse.json(row, { status: 200 });
  } catch (error: any) {
    // May carry DB/Anthropic internals — log them, never echo them.
    console.error("Board confidence analysis error:", error);
    return fail("Board confidence analysis failed. See server logs for details.", 500);
  } finally {
    activeAnalyses--;
  }
}
