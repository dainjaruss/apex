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
    // Say what the response PROVES, not what we would like it to mean. COOL answers
    // a missing PDF with 403, but 403 is also what a WAF rule, a rate limit or a
    // datacenter-IP filter returns — so "the Navy publishes no LaDR for your rating"
    // is a claim APEX cannot observe, and it is exactly the class of claim this tool
    // exists not to make. Report the observation and let the Sailor check COOL.
    if (fetched.status === "not_found") {
      const r = rating.toUpperCase();
      // Measured 2026-07-29: COOL has no plain <rating>_e7.pdf for the nuclear
      // ratings; EMN/ETN/MMN are split by platform (emn_ss_e7.pdf returns 200) and
      // APEX has no platform input to pick between them. That IS observable, so it
      // stays; the "Navy publishes none" conclusion is not, so it goes.
      const platformSplit = ["EMN", "ETN", "MMN"].includes(r)
        ? ` COOL splits ${r} by platform — try ${r.toLowerCase()}_ss_e7.pdf or ${r.toLowerCase()}_sw_e7.pdf; APEX has no platform input to choose between them.`
        : "";
      return fail(
        `Navy COOL returned no E7 LaDR for ${r} at the published path (HTTP 403 — ` +
          `which is also what COOL returns for a rating it does not publish, so this ` +
          `may be a blocked request rather than a missing document).${platformSplit} ` +
          `You can still run the analysis without LaDR milestones, and you can check ` +
          `cool.osd.mil directly.`,
        404,
      );
    }
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
