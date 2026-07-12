// app/api/sign/route.ts
//
// Server-side ENFORCEMENT point for applying a signature to an evaluation block.
// The signer re-authenticates with their own credentials at signing time; the server
// verifies the password, confirms their role/identity may sign that block, then writes
// the signature with the service-role client and audit-logs it. Block 50 (Reporting
// Senior) additionally locks the report. The handler is a thin orchestrator over the
// helpers in lib/signing.ts.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabaseClient";
import {
  parseSignRequest,
  verifyCredentials,
  loadSignContext,
  authorizeSigner,
  applySignature,
  isSignFailure,
} from "@/lib/signing";

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  try {
    const parsed = parseSignRequest(await req.json());
    if (isSignFailure(parsed)) return fail(parsed.error, parsed.status);
    const {
      evaluationId,
      blockNum,
      key,
      email,
      password,
      typedName,
      signatureDataUrl,
    } = parsed.data;

    const verified = await verifyCredentials(email, password);
    if (isSignFailure(verified)) return fail(verified.error, verified.status);

    const admin = createAdminClient();
    const ctx = await loadSignContext(admin, verified.signerId, evaluationId);
    if (isSignFailure(ctx)) return fail(ctx.error, ctx.status);

    const denied = authorizeSigner(ctx.signer, blockNum, ctx.evaluation);
    if (denied) return fail(denied.error, denied.status);

    const result = await applySignature(
      admin,
      ctx.evaluation,
      blockNum,
      key,
      typedName,
      signatureDataUrl,
      verified.signerId,
      ctx.signer.preferred_role,
    );
    if (isSignFailure(result)) return fail(result.error, result.status);

    return NextResponse.json(
      { ok: true, block_values: result.block_values },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("API Sign Error:", error);
    return fail(error.message || "Failed to apply signature.", 500);
  }
}
