// app/api/board-confidence/analyze/route.ts
//
// Runs a Board Confidence analysis for a subject user: assembles rubric inputs
// server-side, scores, generates the narrative, and persists the snapshot with a
// fail-closed audit row. Owner-or-Admin only.
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

    const admin = createAdminClient();

    // Owner-or-Admin: only the Sailor themself or an Admin may analyze a record.
    if (subjectUserId !== callerId) {
      const { data: caller } = await admin
        .from("profiles")
        .select("preferred_role, assigned_roles")
        .eq("id", callerId)
        .single();
      const isAdmin =
        caller?.preferred_role === "Admin" ||
        (caller?.assigned_roles || []).includes("Admin");
      if (!isAdmin)
        return fail("Only the record owner or an Admin may run an analysis.", 403);
    }

    const { data: subject } = await admin
      .from("profiles")
      .select("id")
      .eq("id", subjectUserId)
      .single();
    if (!subject) return fail("Subject profile not found.", 404);

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
