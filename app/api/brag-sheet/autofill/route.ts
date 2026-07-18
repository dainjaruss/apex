// app/api/brag-sheet/autofill/route.ts
//
// POST: runs the audited AI auto-fill for the caller's OWN brag sheet — owner-
// only (self-asserted profile roles authorize nothing, board-confidence §2 item
// 4), server-enforced consent gate, keyless ⇒ 503 with no fallback draft
// (invariant §1.2 item 9). This route never writes to evaluations — its only
// writes are brag_sheets.last_autofill and the audit row (via the service).
// GET: availability probe so keyless servers hide the Generate button.
// Spec: docs/specs/brag-sheet.md §5.2

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, getRouteUserId } from "@/lib/supabaseClient";
import { resolveAiModel } from "@/lib/aiProvider";
import { DEFAULT_NARRATIVE_MODEL } from "@/lib/boardConfidence/narrative";
import { AutofillModelError, BRAG_AI_ENV } from "@/lib/bragSheet/autofill";
import { runBragAutofill } from "@/lib/bragSheet/service";

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

const BodySchema = z.object({
  bragSheetId: z.string().uuid(),
  pitch: z.enum(["10", "12"]).default("10"),
});

// AI-calling route: same in-process cap as board-confidence analyze (its lines 21-27).
// ponytail: in-process counter — shared rate limiting if this ever runs multi-worker.
const MAX_CONCURRENT_AUTOFILLS = 2;
let active = 0;

export async function GET() {
  const callerId = await getRouteUserId();
  if (!callerId) return fail("Not authenticated.", 401);
  const resolved = resolveAiModel(BRAG_AI_ENV, DEFAULT_NARRATIVE_MODEL);
  return NextResponse.json(
    { available: !!resolved, model: resolved?.modelId ?? null },
    { status: 200 },
  );
}

export async function POST(req: NextRequest) {
  if (active >= MAX_CONCURRENT_AUTOFILLS)
    return fail("Too many drafts in progress. Try again shortly.", 429);
  active++;
  try {
    const callerId = await getRouteUserId();
    if (!callerId) return fail("Not authenticated.", 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return fail("Invalid request body.", 400);

    if (!resolveAiModel(BRAG_AI_ENV, DEFAULT_NARRATIVE_MODEL))
      return fail("AI drafting is not configured on this server.", 503);

    const admin = createAdminClient();
    const { data: sheet } = await admin
      .from("brag_sheets")
      .select("*")
      .eq("id", parsed.data.bragSheetId)
      .maybeSingle();
    if (!sheet) return fail("Brag sheet not found.", 404);

    // Owner-only: profile roles are self-asserted and authorize nothing
    // (board-confidence §2 item 4).
    if (sheet.user_id !== callerId)
      return fail("Only the brag sheet owner may generate drafts.", 403);

    // Server-enforced consent gate (board-confidence analyze route pattern).
    if (!sheet.consented_at)
      return fail(
        "Consent required. Review and accept the AI drafting terms before generating.",
        403,
      );

    const response = await runBragAutofill(
      admin,
      callerId,
      sheet,
      parsed.data.pitch,
    );
    return NextResponse.json(response, { status: 200 });
  } catch (error: any) {
    if (error instanceof AutofillModelError)
      return fail("The AI model returned unusable output. Try again.", 502);
    // May carry DB/model internals — log them, never echo them.
    console.error("Brag autofill error:", error);
    return fail("Draft generation failed. See server logs for details.", 500);
  } finally {
    active--;
  }
}
