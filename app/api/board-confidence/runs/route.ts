// app/api/board-confidence/runs/route.ts
//
// Prior Board Confidence runs for a subject user. Service role is required for the
// Admin-views-another-user case that RLS (ba_select_own) cannot serve from the
// browser. Read-only — no audit row.
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

    const admin = createAdminClient();

    // Owner-or-Admin: identical check to the analyze route (§5.1).
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
        return fail("Only the record owner or an Admin may view runs.", 403);
    }

    const { data: runs, error } = await admin
      .from("board_analyses")
      .select(
        "id, user_id, board_date, overall_score, band, narrative_source, model, created_at",
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
