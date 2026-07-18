// app/api/board-confidence/record-extract/route.ts
//
// v1.5: multipart ESR/PSR/OMPF PDF → in-memory text extraction → structured
// record suggestions (awards, NECs, education, PFA) so uploads feed the board
// confidence determination. Same invariants as brag-sheet extract: the file is
// NEVER persisted (formData → Uint8Array → unpdf, nothing touches disk,
// storage, or logs), no AI call, no audit row (read-only transform). All
// suggestions return verified_in_ompf=false — the member reviews them in the
// Record Entry form before anything is saved or scored.

import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/supabaseClient";
import { extractPdfText } from "@/lib/bragSheet/extract";
import { suggestRecordFromText } from "@/lib/boardConfidence/recordExtract";

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

const MAX_EXTRACT_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_TEXT_CHARS = 2 * 1024 * 1024; // 2 MB of extracted text is plenty

export async function POST(req: NextRequest) {
  const callerId = await getRouteUserId();
  if (!callerId) return fail("Not authenticated.", 401);
  // Reject oversize bodies BEFORE buffering the multipart payload (formData()
  // reads the whole request into memory first). Content-Length can be spoofed,
  // but the real cap is re-checked on file.size below; this just refuses the
  // obvious multi-GB body up front.
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_EXTRACT_BYTES)
    return fail("File too large (10 MB max).", 413);
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("Missing file.", 400);
  if (file.type !== "application/pdf")
    return fail("Only PDF files are supported.", 400);
  if (file.size > MAX_EXTRACT_BYTES)
    return fail("File too large (10 MB max).", 413);
  try {
    const text = await extractPdfText(new Uint8Array(await file.arrayBuffer()));
    if (!text.trim())
      return fail(
        "Could not extract text — scanned or image-only PDFs are not supported.",
        422,
      );
    // Cap extracted text: a decompression-bomb PDF can expand a few MB into
    // gigabytes of text. A real ESR/PSR/OMPF is well under 2 MB of text; the
    // heuristics only need the front matter.
    return NextResponse.json(suggestRecordFromText(text.slice(0, MAX_TEXT_CHARS)), {
      status: 200,
    });
  } catch {
    return fail("Could not read that PDF.", 422);
  }
}
