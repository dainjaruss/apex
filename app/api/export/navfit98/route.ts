// app/api/export/navfit98/route.ts
//
// NAVFIT 98A .accdb export for one finalized evaluation. Service role reads the DB
// row (never a client-supplied body), re-runs the full APEX validation gate plus the
// NAVFIT-specific export checks, then produces the file via the Java sidecar writer.
// Spec: docs/specs/navfit98-field-mapping.md

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createAdminClient, getRouteUserId } from "@/lib/supabaseClient";
import { runFullValidation } from "@/lib/validationEngine";
import { tallyRecommendations } from "@/lib/forcedDistribution";
import { mapEvaluationToNavfit } from "@/lib/navfit98/mapEvaluationToNavfit";
import { validateNavfitExport } from "@/lib/navfit98/validateNavfitExport";
import {
  isNavfitWriterAvailable,
  writeNavfitAccdb,
} from "@/lib/navfit98/writeAccdb";

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
      return fail("Only the report owner may export.", 403);
    if (
      ev.status !== "completed" &&
      !ev.signature_locked &&
      ev.routing_stage !== "locked"
    ) {
      return fail(
        "Report must be signed and locked or finalized before NAVFIT 98 export.",
        409,
      );
    }

    // Block 46 summary counts (Summary* columns) — recomputed server-side from the
    // group, same query as app/api/summary-distribution. Transient field, not a column.
    if (ev.summary_group_id) {
      const { data: peers, error: groupError } = await admin
        .from("evaluations")
        .select("id, promotion_recommendation")
        .eq("summary_group_id", ev.summary_group_id);
      if (groupError) return fail(groupError.message, 500);
      ev.summary_group_distribution = tallyRecommendations(
        (peers || []).map((e: any) => e.promotion_recommendation),
      ).distribution;
    }

    const apexResult = runFullValidation(ev);
    if (!apexResult.success)
      return NextResponse.json({ errors: apexResult.errors }, { status: 422 });
    const navfitResult = validateNavfitExport(ev);
    if (!navfitResult.ok)
      return NextResponse.json(
        { errors: navfitResult.errors },
        { status: 422 },
      );

    if (!(await isNavfitWriterAvailable())) {
      return fail(
        "NAVFIT 98 export requires a Java runtime on the server. This host has none (e.g. Vercel).",
        501,
      );
    }

    const accdb = await writeNavfitAccdb([mapEvaluationToNavfit(ev)]);
    const filename = `NAVFIT98_${(ev.member_name || "REPORT").replace(/[^a-zA-Z0-9]/g, "_")}.accdb`;

    await admin.from("audit_logs").insert([
      {
        evaluation_id: evaluationId,
        user_id: callerId,
        action: "NAVFIT_EXPORTED",
        details: {
          report_type: ev.report_type,
          sha256: createHash("sha256").update(accdb).digest("hex"),
          filename,
        },
      },
    ]);

    return new NextResponse(new Uint8Array(accdb), {
      status: 200,
      headers: {
        "Content-Type": "application/msaccess",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("NAVFIT 98 export error:", error);
    return fail(error.message || "NAVFIT 98 export failed.", 500);
  }
}
