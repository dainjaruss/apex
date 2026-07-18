// app/api/brag-sheet/extract/route.ts
//
// Multipart PDF → in-memory text extraction → brag sheet suggestions. NEVER
// persists the file (invariant §1.2 item 1): formData → Uint8Array → unpdf;
// nothing touches disk, storage, or logs (extracted text is never logged).
// No consent gate (no AI call, no persistence), no audit row (read-only
// transform), no concurrency cap (extraction is cheap and local).
// Node runtime (default) — unpdf's getDocumentProxy needs Node for large PDFs.
// Spec: docs/specs/brag-sheet.md §5.1

import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/supabaseClient";
import { extractPdfText, suggestFromText } from "@/lib/bragSheet/extract";

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

// NOT exported: Next.js App Router type-checks route files and rejects any
// export other than HTTP methods / segment config ("not a valid Route export
// field" at next build). Same reason board-confidence keeps
// MAX_CONCURRENT_ANALYSES un-exported. Tests assert the literal 10 MB (§9.4).
const MAX_EXTRACT_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const callerId = await getRouteUserId();
  if (!callerId) return fail("Not authenticated.", 401);
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
    return NextResponse.json(suggestFromText(text), { status: 200 });
  } catch {
    return fail("Could not read that PDF.", 422);
  }
}
