// app/api/board-confidence/ladr-fetch/route.ts
//
// On-demand LaDR ingestion (v1.4, spec §10.4): fetches the official LaDR PDF
// for a rating from Navy COOL, parses it in memory (the PDF is never
// persisted), and stores a versioned ladr_documents row + auto-extracted
// milestones. Additive to the curated seed path; never overwrites an existing
// (rating, version) issue. Any authenticated user may trigger it — LaDRs are
// public documents.

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient, getRouteUserId } from "@/lib/supabaseClient";
import {
  extractLadrText,
  fetchLadrPdf,
  parseLadr,
  storeLadr,
} from "@/lib/boardConfidence/ladrFetch";
import { isKnownRating } from "@/lib/boardConfidence/ratings";

const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

// One 4-25MB DoD download + parse at a time per worker.
// ponytail: in-process counter, same pattern as the sibling routes.
const MAX_CONCURRENT_FETCHES = 1;
let activeFetches = 0;

export async function POST(req: NextRequest) {
  if (activeFetches >= MAX_CONCURRENT_FETCHES) {
    return fail("A LaDR fetch is already in progress. Try again shortly.", 429);
  }
  activeFetches++;
  try {
    const callerId = await getRouteUserId();
    if (!callerId) return fail("Not authenticated.", 401);

    const { rating } = await req.json();
    if (typeof rating !== "string" || !isKnownRating(rating))
      return fail("Unknown or missing rating.", 400);

    const fetched = await fetchLadrPdf(rating);
    if (fetched.status === "not_found")
      return fail(
        `Navy COOL has no combined E1-E9 LaDR file for ${rating.toUpperCase()}.`,
        404,
      );
    if (fetched.status === "error") {
      console.error("LaDR fetch failed:", rating, fetched.message);
      return fail("Could not download the LaDR from Navy COOL.", 502);
    }

    const text = await extractLadrText(fetched.bytes);
    const parsed = parseLadr(text, rating);
    if (!parsed) {
      console.error("LaDR parse failed for", rating, "- head:", text.slice(0, 120));
      return fail("Downloaded a PDF but could not parse its LaDR structure.", 502);
    }

    const admin = createAdminClient();
    const stored = await storeLadr(admin, parsed, fetched.sourceUrl, fetched.sha256);

    return NextResponse.json(
      {
        status: stored.status,
        rating: parsed.rating_abbrev,
        version: parsed.version,
        milestones: stored.milestones,
      },
      { status: 200 },
    );
  } catch (error: any) {
    console.error("LaDR fetch route error:", error);
    return fail("LaDR fetch failed. See server logs for details.", 500);
  } finally {
    activeFetches--;
  }
}
