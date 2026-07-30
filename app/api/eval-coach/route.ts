// app/api/eval-coach/route.ts
//
// POST: coaches the Block 43 narrative the caller is currently writing —
// authenticated, consent-gated, and NEVER-PERSIST. Model unavailable ⇒ 503 and
// the screen degrades to its normal behaviour; the Sailor is never blocked from
// writing. GET: availability probe so keyless servers hide the button.
//
// This route reads NO database row and writes NONE — not the draft, not the
// narrative, not the coaching. It never constructs a Supabase admin client at
// all (tests/unit/evalCoach.test.ts asserts that), so "the narrative is not
// stored" is true by construction rather than by policy. The draft lives in
// localStorage until the user saves it (components/EvaluationForm.tsx), so
// there is no server-side row to own or to check ownership against: the caller
// supplies their own working text and gets coaching on it back. Authentication
// is required so the route is not an open model proxy. Privacy posture in full:
// docs/EVAL-COACH.md.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRouteUserId } from "@/lib/supabaseClient";
import { resolveAiModel } from "@/lib/aiProvider";
import { DEFAULT_NARRATIVE_MODEL } from "@/lib/boardConfidence/narrative";
import {
  buildCallModel,
  COACH_AI_ENV,
  CoachModelError,
  runEvalCoach,
} from "@/lib/evalCoach/coach";

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

// Block 43 is a fixed-size block; 5000 chars is generous room over the 18 × 90
// maximum so an overflowing draft is still coachable, and it caps the payload.
const BodySchema = z.object({
  report_type: z.enum(["EVAL", "CHIEFEVAL", "FITREP"]),
  pitch: z.enum(["10", "12"]).default("10"),
  comments: z.string().max(5000),
  // Unknown keys are dropped downstream by TRAIT_STANDARDS_LOOKUP, so this is
  // the whole validation the map needs.
  trait_grades: z.record(z.string(), z.string()).default({}),
  // Server-enforced consent gate. There is no stored consent row to check
  // (this route owns no table), so the acknowledgement travels with the request
  // that carries the text — see docs/EVAL-COACH.md.
  consent: z.literal(true),
});

// AI-calling route: same in-process cap as board-confidence analyze and
// brag-sheet autofill.
// ponytail: in-process counter — shared rate limiting if this runs multi-worker.
const MAX_CONCURRENT_COACHINGS = 2;
let active = 0;

export async function GET() {
  const callerId = await getRouteUserId();
  if (!callerId) return fail("Not authenticated.", 401);
  const resolved = resolveAiModel(COACH_AI_ENV, DEFAULT_NARRATIVE_MODEL);
  return NextResponse.json(
    { available: !!resolved, model: resolved?.modelId ?? null },
    { status: 200 },
  );
}

export async function POST(req: NextRequest) {
  if (active >= MAX_CONCURRENT_COACHINGS)
    return fail("Too many coaching runs in progress. Try again shortly.", 429);
  active++;
  try {
    const callerId = await getRouteUserId();
    if (!callerId) return fail("Not authenticated.", 401);

    const parsed = BodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success)
      return fail(
        "Invalid request body. Narrative coaching requires explicit consent.",
        400,
      );

    const resolved = resolveAiModel(COACH_AI_ENV, DEFAULT_NARRATIVE_MODEL);
    if (!resolved)
      return fail("Narrative coaching is not configured on this server.", 503);

    const { consent: _consent, ...request } = parsed.data;
    const { payload, ...result } = await runEvalCoach(
      request,
      buildCallModel(resolved),
    );
    return NextResponse.json(
      { ...result, model: resolved.modelId, budget: payload.budget },
      { status: 200 },
    );
  } catch (error: any) {
    if (error instanceof CoachModelError)
      return fail("The coach returned unusable output. Try again.", 502);
    // May carry model internals — log them, never echo them.
    console.error("Eval coach error:", error);
    return fail("Narrative coaching failed. See server logs for details.", 502);
  } finally {
    active--;
  }
}
