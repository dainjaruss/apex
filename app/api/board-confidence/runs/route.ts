// app/api/board-confidence/runs/route.ts
//
// Prior Board Confidence runs for the caller's own record. OWNER-ONLY (v1.1
// review fix): profiles roles are self-asserted, so the former Admin path was
// unsound — deferred until real server-side role authority exists. This route
// remains the canonical read path (RLS ba_select_own serves the same rows).
// Read-only — no audit row.
// Spec: docs/specs/board-confidence-analyzer.md §5.2

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, getRouteUserId } from "@/lib/supabaseClient";

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

export async function GET(req: NextRequest) {
  try {
    const callerId = await getRouteUserId();
    if (!callerId) return fail("Not authenticated.", 401);

    const subjectUserId = req.nextUrl.searchParams.get("userId") || callerId;

    // Owner-only (v1.1 review fix): identical check to the analyze route (§5.1).
    if (subjectUserId !== callerId)
      return fail("Only the record owner may run/view analyses.", 403);

    const admin = createAdminClient();

    const { data: runs, error } = await admin
      .from("board_analyses")
      .select(
        "id, user_id, board_date, overall_score, band, adverse_adjustment, narrative_source, narrative_fallback_reason, model, created_at",
      )
      .eq("user_id", subjectUserId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.error("Board confidence runs query error:", error);
      return fail("Could not load prior runs. See server logs for details.", 500);
    }

    return NextResponse.json({ runs: runs || [] }, { status: 200 });
  } catch (error: any) {
    console.error("Board confidence runs error:", error);
    return fail("Could not load prior runs. See server logs for details.", 500);
  }
}
