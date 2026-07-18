// app/api/board-confidence/precept-extract/route.ts
//
// Upload path for the precept fetch-to-reference (v1.6.1). The server-side
// fetch (precept-fetch) needs outbound access to mynavyhr.navy.mil, which many
// runtimes block (proxy / firewall / DoD IP filtering) even when the operator's
// browser can open the PDF. This accepts the PDF as an upload instead: the
// browser already has the file, so the server needs ZERO egress. Same
// invariants as the record-extract route — the file is NEVER persisted
// (formData → Uint8Array → unpdf), nothing is logged, no DB write. Read-only;
// returns the text excerpt + keyword flag suggestions to confirm on-screen.

import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/supabaseClient";
import { extractPdfText } from "@/lib/bragSheet/extract";
import { suggestPreceptFlags } from "@/lib/boardConfidence/preceptFetch";

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

const MAX_EXTRACT_BYTES = 25 * 1024 * 1024; // precepts are small; 25 MB is ample
const MAX_TEXT_CHARS = 2 * 1024 * 1024;
const MAX_EXCERPT_CHARS = 20_000;

export async function POST(req: NextRequest) {
  const callerId = await getRouteUserId();
  if (!callerId) return fail("Not authenticated.", 401);

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(declared) && declared > MAX_EXTRACT_BYTES)
    return fail("File too large (25 MB max).", 413);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail("Missing file.", 400);
  if (file.type !== "application/pdf")
    return fail("Only PDF files are supported.", 400);
  if (file.size > MAX_EXTRACT_BYTES)
    return fail("File too large (25 MB max).", 413);

  try {
    const text = (
      await extractPdfText(new Uint8Array(await file.arrayBuffer()))
    ).slice(0, MAX_TEXT_CHARS);
    if (!text.trim())
      return fail(
        "Could not extract text — scanned or image-only PDFs are not supported.",
        422,
      );
    return NextResponse.json(
      {
        source_url: file.name,
        excerpt: text.slice(0, MAX_EXCERPT_CHARS),
        truncated: text.length > MAX_EXCERPT_CHARS,
        suggestions: suggestPreceptFlags(text),
      },
      { status: 200 },
    );
  } catch {
    return fail("Could not read that PDF.", 422);
  }
}
