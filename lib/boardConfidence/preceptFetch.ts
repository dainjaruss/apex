// lib/boardConfidence/preceptFetch.ts
//
// Fetch-to-reference for board precepts (§7 Factor 6). Precepts are published
// on MyNavyHR as PDFs, like the LaDR — but a precept is a formal convening
// order in broad prose, NOT a clean checklist, so unlike the LaDR parser this
// does NOT deterministically derive the 5 emphasis flags. It fetches the PDF,
// extracts the text in memory (never persisted), and returns a keyword-based
// SUGGESTION of which flags the precept emphasizes for a human to confirm
// against the on-screen text. The operator sets the real flags; the score
// stays deterministic (an AI/heuristic never sets a scoring input unreviewed).
//
// Server-only. MyNavyHR serves a publicly-trusted cert (no CA pinning needed)
// but blocks non-browser agents, so a browser User-Agent is sent. The caller
// supplies the URL, so the host is allow-listed (SSRF guard).

import { extractLadrText } from "./ladrFetch";
import type { PreceptFlag } from "./types";

const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MAX_PDF_BYTES = 25 * 1024 * 1024;

/** The published FY-27 Active-Duty senior-enlisted precept (default source). */
export const DEFAULT_PRECEPT_URL =
  "https://www.mynavyhr.navy.mil/Portals/55/Boards/Active%20Duty%20Enlisted/Documents/FY27_AD/FY27_Enlisted_Precept.pdf";

/** SSRF guard: only official Navy hosts may be fetched server-side. */
export function isAllowedPreceptHost(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== "https:") return false;
    const h = u.hostname.toLowerCase();
    return h === "mynavyhr.navy.mil" || h === "www.mynavyhr.navy.mil";
  } catch {
    return false;
  }
}

export type PreceptFetchResult =
  | { status: "ok"; text: string }
  | { status: "not_found" }
  | { status: "error"; message: string };

export async function fetchPreceptText(url: string): Promise<PreceptFetchResult> {
  if (!isAllowedPreceptHost(url))
    return { status: "error", message: "Only mynavyhr.navy.mil precept URLs are allowed." };
  try {
    // Lazy import (see ladrFetch) — keeps undici out of the module graph for
    // consumers of the pure suggestPreceptFlags/isAllowedPreceptHost helpers.
    const { fetch: undiciFetch } = await import("undici");
    const res = await undiciFetch(url, {
      headers: { "User-Agent": BROWSER_UA },
      signal: AbortSignal.timeout(60_000),
    });
    if (res.status === 404) return { status: "not_found" };
    if (!res.ok) return { status: "error", message: `HTTP ${res.status}` };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_PDF_BYTES)
      return { status: "error", message: "PDF exceeds the 25 MB limit." };
    if (buf.slice(0, 5).toString() !== "%PDF-")
      return { status: "error", message: "Response is not a PDF." };
    const text = await extractLadrText(new Uint8Array(buf));
    if (!text.trim())
      return { status: "error", message: "Could not extract text (scanned/image PDF?)." };
    return { status: "ok", text };
  } catch (err: any) {
    return { status: "error", message: err?.message || "Fetch failed." };
  }
}

export interface PreceptSuggestion {
  flag: PreceptFlag;
  /** A short quote from the precept that triggered the suggestion. */
  evidence: string;
}

// Broad keyword cues per flag. LOW precision by design — precept prose is broad
// ("whole person", "sustained superior performance") and rarely maps cleanly to
// these five areas, so every hit is a SUGGESTION the operator confirms, with the
// triggering quote shown next to it.
const FLAG_CUES: Record<PreceptFlag, RegExp> = {
  warfighting: /\b(warfare qualif\w*|warfighting|lethality|combat readiness|tactical proficiency)\b/i,
  leadership_positions: /\b(leadership positions?|leading Sailors|billets? of (?:increasing )?responsibility|deckplate leadership)\b/i,
  sea_duty: /\b(sea duty|sea tours?|arduous sea|at[- ]sea|afloat|operational tours?)\b/i,
  // NOT bare "degree" — the FY27 precept says "fourth degree of kinship"
  // (a recusal clause), a false positive that proves suggestions need review.
  education: /\b(off[- ]duty education|college degree|academic (?:degree|achievement)|USMAP|educational advancement|associate'?s? degree|bachelor'?s?|master'?s? degree)\b/i,
  technical_expertise: /\b(technical expertise|in[- ]rate (?:knowledge|proficiency)|rating knowledge|NEC\b|subject matter expert)\b/i,
};

/**
 * Suggest which emphasis flags a precept names. Returns each matched flag with
 * a short quote as evidence. Empty result is common and honest — set the flags
 * from the on-screen text, not from this alone.
 */
export function suggestPreceptFlags(text: string): PreceptSuggestion[] {
  const out: PreceptSuggestion[] = [];
  for (const [flag, re] of Object.entries(FLAG_CUES) as [PreceptFlag, RegExp][]) {
    const m = text.match(re);
    if (!m || m.index == null) continue;
    const start = Math.max(0, m.index - 40);
    const evidence = text
      .slice(start, m.index + m[0].length + 40)
      .replace(/\s+/g, " ")
      .trim();
    out.push({ flag, evidence: `…${evidence}…` });
  }
  return out;
}
