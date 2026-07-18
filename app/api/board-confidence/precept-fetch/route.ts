// app/api/board-confidence/precept-fetch/route.ts
//
// Fetch-to-reference for the board precept: downloads a published MyNavyHR
// precept PDF, extracts its text in memory (never persisted), and returns a
// capped excerpt plus a keyword-based flag SUGGESTION for the operator to
// confirm on-screen. READ-ONLY — it does not write board_precepts. The active
// precept is a system-wide scoring input, so setting it stays a privileged
// service-role operation (scripts/set-precept.ts); this route is a reading aid
// any authenticated user may use (it only reads a public document).
//
// The caller supplies the URL, so the host is allow-listed server-side (SSRF).

import { NextRequest, NextResponse } from "next/server";
import { getRouteUserId } from "@/lib/supabaseClient";
import {
  DEFAULT_PRECEPT_URL,
  fetchPreceptText,
  suggestPreceptFlags,
} from "@/lib/boardConfidence/preceptFetch";

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

// One DoD download + parse at a time per worker (same pattern as ladr-fetch).
const MAX_CONCURRENT_FETCHES = 1;
let activeFetches = 0;
const MAX_EXCERPT_CHARS = 20_000;

export async function POST(req: NextRequest) {
  if (activeFetches >= MAX_CONCURRENT_FETCHES)
    return fail("A precept fetch is already in progress. Try again shortly.", 429);
  activeFetches++;
  try {
    const callerId = await getRouteUserId();
    if (!callerId) return fail("Not authenticated.", 401);

    const body = await req.json().catch(() => ({}));
    const url = typeof body.url === "string" && body.url.trim() ? body.url.trim() : DEFAULT_PRECEPT_URL;

    const fetched = await fetchPreceptText(url);
    if (fetched.status === "not_found")
      return fail("No precept PDF at that URL (404).", 404);
    if (fetched.status === "error") {
      // The allow-list / validation messages are safe to surface verbatim.
      const status = /allowed/.test(fetched.message) ? 400 : 502;
      if (status === 502) console.error("Precept fetch failed:", url, fetched.message);
      return fail(status === 400 ? fetched.message : "Could not download the precept.", status);
    }

    return NextResponse.json(
      {
        source_url: url,
        excerpt: fetched.text.slice(0, MAX_EXCERPT_CHARS),
        truncated: fetched.text.length > MAX_EXCERPT_CHARS,
        suggestions: suggestPreceptFlags(fetched.text),
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("Precept fetch route error:", error);
    return fail("Precept fetch failed. See server logs for details.", 500);
  } finally {
    activeFetches--;
  }
}
