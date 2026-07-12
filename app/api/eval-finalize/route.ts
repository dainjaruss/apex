// app/api/eval-finalize/route.ts
//
// Server-side finalize — sets status to completed after RS signature lock. Browser
// RLS forbids UPDATE on signature_locked rows, so the owner must finalize via service role.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, getRouteUserId } from "@/lib/supabaseClient";

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  try {
    const callerId = await getRouteUserId();
    if (!callerId) return fail("Not authenticated.", 401);
    const { evaluationId } = await req.json();
    if (!evaluationId) return fail("Missing evaluationId.", 400);

    const admin = createAdminClient();
    const { data: ev } = await admin
      .from("evaluations")
      .select("*")
      .eq("id", evaluationId)
      .single();
    if (!ev) return fail("Evaluation not found.", 404);
    if (ev.created_by !== callerId)
      return fail("Only the report owner may finalize.", 403);
    if (!ev.signature_locked && ev.routing_stage !== "locked") {
      return fail("Report must be signed and locked before finalizing.", 409);
    }
    if (ev.status === "completed")
      return fail("Report is already finalized.", 409);

    const { error } = await admin
      .from("evaluations")
      .update({
        status: "completed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", evaluationId);
    if (error) return fail(error.message, 500);

    await admin.from("audit_logs").insert([
      {
        evaluation_id: evaluationId,
        user_id: callerId,
        action: "STATUS_CHANGED",
        details: { new_status: "completed" },
      },
    ]);
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error: any) {
    console.error("API Finalize Error:", error);
    return fail(error.message || "Finalize failed.", 500);
  }
}
