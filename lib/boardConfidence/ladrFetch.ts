// lib/boardConfidence/ladrFetch.ts
//
// On-demand LaDR ingestion from Navy COOL (v1.4 — ADDITIVE to the curated
// scripts/seed-ladr.ts path, which stays the higher-fidelity source; spec
// §10.4). Fetches https://www.cool.osd.mil/usn/LaDR/{rating}_e1_e9.pdf,
// extracts text in memory (never persisted), parses the cover version and a
// CONSERVATIVE milestone set (every row flagged detail.source =
// 'auto_extracted'), and stores a NEW versioned ladr_documents row — never
// overwriting an existing (rating, version) issue (§10.3 semantics).
//
// Server-only: uses undici with a pinned public CA chain (see ladrCerts.ts —
// cool.osd.mil omits its TLS intermediate) and a browser User-Agent (the CDN
// rejects non-browser agents).

import { createHash } from "node:crypto";
import { Agent, fetch as undiciFetch } from "undici";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ZEROSSL_INTERMEDIATE_PEM, USERTRUST_ROOT_PEM } from "./ladrCerts";
import { isKnownRating, ratingName } from "./ratings";
import type { LadrCategory } from "./types";

const COOL_BASE = "https://www.cool.osd.mil/usn/LaDR";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MAX_PDF_BYTES = 25 * 1024 * 1024;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export type LadrFetchResult =
  | { status: "ok"; bytes: Uint8Array; sha256: string; sourceUrl: string }
  | { status: "not_found" }
  | { status: "error"; message: string };

export interface ParsedLadrMilestone {
  category: LadrCategory;
  item: string;
  item_code: string | null;
  applies_to_paygrades: number[];
  detail: Record<string, unknown>;
}

export interface ParsedLadr {
  rating_abbrev: string;
  rating_name: string;
  version: string;
  effective_date: string;
  milestones: ParsedLadrMilestone[];
}

export type LadrStoreResult =
  | { status: "stored"; documentId: string; milestones: number }
  | { status: "already_current"; documentId: string; milestones: number };

// Dedicated agent — the pinned CA set applies only to LaDR fetches, never to
// the process-wide dispatcher.
let ladrAgent: Agent | undefined;
function agent(): Agent {
  if (!ladrAgent) {
    ladrAgent = new Agent({
      connect: { ca: [ZEROSSL_INTERMEDIATE_PEM, USERTRUST_ROOT_PEM] },
    });
  }
  return ladrAgent;
}

export async function fetchLadrPdf(rating: string): Promise<LadrFetchResult> {
  if (!isKnownRating(rating))
    return { status: "error", message: `Unknown rating "${rating}".` };
  const sourceUrl = `${COOL_BASE}/${rating.toLowerCase()}_e1_e9.pdf`;
  try {
    const res = await undiciFetch(sourceUrl, {
      dispatcher: agent(),
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
    return {
      status: "ok",
      bytes: new Uint8Array(buf),
      sha256: createHash("sha256").update(buf).digest("hex"),
      sourceUrl,
    };
  } catch (err: any) {
    return { status: "error", message: err?.message || "Fetch failed." };
  }
}

/** In-memory text extraction (unpdf) — the PDF bytes never touch disk. */
export async function extractLadrText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(bytes);
  const { text } = await extractText(doc, { mergePages: true });
  return typeof text === "string" ? text : String(text ?? "");
}

// NELD course → the paygrade block(s) the LaDR ladder assigns it to.
const NELD_PAYGRADES: Record<string, number[]> = {
  "NELD-03": [3, 4],
  "NELD-04": [5],
  "NELD-05": [6],
  "NELD-06": [7],
};

/**
 * Conservative, anchor-based parser. Emits only milestones it can tie to a
 * recognized LaDR structure; every milestone carries detail.source =
 * 'auto_extracted' so the UI can tell curated seeds from automated pulls.
 */
export function parseLadr(text: string, rating: string): ParsedLadr | null {
  const abbrev = rating.toUpperCase();
  const head = text.slice(0, 400);
  // "Yeoman (YN) July 2026" — rating name, abbrev, cover month + year.
  const headMatch = head.match(
    new RegExp(
      `([A-Za-z][A-Za-z' /()-]{2,60}?)\\s*\\(${abbrev}\\)\\s+(${MONTHS.join("|")})\\s+(\\d{4})`,
    ),
  );
  if (!headMatch) return null;
  const month = headMatch[2];
  const year = headMatch[3];
  const version = `${month} ${year}`;
  const effective_date = `${year}-${String(MONTHS.indexOf(month) + 1).padStart(2, "0")}-01`;

  const milestones: ParsedLadrMilestone[] = [];
  const auto = { source: "auto_extracted" as const };
  const seen = new Set<string>();
  const push = (m: ParsedLadrMilestone) => {
    const key = `${m.category}|${m.item.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    milestones.push(m);
  };

  // 1. Enlisted Leadership Development ladder (NELD-03..06 → PME by paygrade).
  for (const [code, paygrades] of Object.entries(NELD_PAYGRADES)) {
    if (text.includes(code)) {
      push({
        category: "pme_required",
        item: `Enlisted Leadership Development ${code}`,
        item_code: code,
        applies_to_paygrades: paygrades,
        detail: { ...auto },
      });
    }
  }

  // 2. Warfare qualification (platform-appropriate).
  if (/Warfare Specialist|warfare qualification/i.test(text)) {
    push({
      category: "qual_warfare",
      item: "Command warfare qualification (platform-appropriate, e.g. ESWS/EAWS/EIWS)",
      item_code: null,
      applies_to_paygrades: [4, 5, 6, 7],
      detail: { ...auto },
    });
  }

  // 3. PQS / watchstation qualifications.
  if (/Personnel Qualification Standards|PQS/.test(text)) {
    push({
      category: "qual_watchstanding",
      item: "Rate and command PQS / watchstation qualifications",
      item_code: null,
      applies_to_paygrades: [3, 4, 5, 6],
      detail: { ...auto },
    });
  }

  // 4. Education (USMAP / college / degree signals).
  if (/USMAP|college enrollment|associate degree|bachelor/i.test(text)) {
    push({
      category: "education_degree",
      item: "Off-duty education progress (USMAP apprenticeship, TA college enrollment, degree)",
      item_code: null,
      applies_to_paygrades: [4, 5, 6, 7],
      detail: { ...auto },
    });
  }

  // 5. COOL credential table: "Target Paygrade Certifying Agency Credential
  //    Title ..." header followed by rows of "E{n} {Agency + Title}".
  const tableHeader = text.search(
    /Target Paygrade\s+Certifying Agency\s+Credential Title/i,
  );
  if (tableHeader >= 0) {
    // Bound the scan: the table region, capped to keep the parser anchored.
    const region = text.slice(tableHeader, tableHeader + 8000);
    const rowRe = /\bE([1-9])\s+((?:(?!\bE[1-9]\s)[\s\S]){10,140}?)(?=\bE[1-9]\s|$)/g;
    let m: RegExpExecArray | null;
    let count = 0;
    while ((m = rowRe.exec(region)) && count < 20) {
      const paygrade = Number(m[1]);
      const title = m[2]
        .replace(/\s+/g, " ")
        .replace(/Date Completed.*$/i, "")
        .trim();
      // Reject fragments that are clearly not credential rows.
      if (title.length < 10 || !/[a-z]/.test(title)) continue;
      push({
        category: "credential",
        item: title,
        item_code: null,
        applies_to_paygrades: [Math.max(2, Math.min(9, paygrade))],
        detail: { ...auto },
      });
      count++;
    }
  }

  return {
    rating_abbrev: abbrev,
    rating_name: ratingName(abbrev) ?? headMatch[1].trim(),
    version,
    effective_date,
    milestones,
  };
}

/**
 * Stores a parsed LaDR as a NEW versioned row. If a document already exists
 * for (rating, version) — from the curated seed OR a prior fetch — nothing is
 * written (never overwrite, §10.3).
 */
export async function storeLadr(
  admin: SupabaseClient,
  parsed: ParsedLadr,
  sourceUrl: string,
  sha256: string,
): Promise<LadrStoreResult> {
  const { data: existing, error: existErr } = await admin
    .from("ladr_documents")
    .select("id")
    .eq("rating_abbrev", parsed.rating_abbrev)
    .eq("version", parsed.version)
    .maybeSingle();
  if (existErr) throw new Error(existErr.message);
  if (existing?.id) {
    const { count } = await admin
      .from("ladr_milestones")
      .select("id", { count: "exact", head: true })
      .eq("ladr_document_id", existing.id);
    return {
      status: "already_current",
      documentId: existing.id,
      milestones: count ?? 0,
    };
  }

  const { data: doc, error: docErr } = await admin
    .from("ladr_documents")
    .insert([
      {
        rating_abbrev: parsed.rating_abbrev,
        rating_name: parsed.rating_name,
        paygrade_range: "E1-E9",
        version: parsed.version,
        effective_date: parsed.effective_date,
        source_url: sourceUrl,
        source_hash: sha256,
      },
    ])
    .select("id")
    .single();
  if (docErr || !doc) throw new Error(docErr?.message || "Document insert failed.");

  if (parsed.milestones.length > 0) {
    const rows = parsed.milestones.map((m, i) => ({
      ladr_document_id: doc.id,
      category: m.category,
      item: m.item,
      item_code: m.item_code,
      applies_to_paygrades: m.applies_to_paygrades,
      detail: m.detail,
      sort_order: i,
    }));
    const { error: msErr } = await admin.from("ladr_milestones").insert(rows);
    if (msErr) {
      // Compensate: never leave a milestone-less half-ingested document.
      await admin.from("ladr_documents").delete().eq("id", doc.id);
      throw new Error(msErr.message);
    }
  }

  return {
    status: "stored",
    documentId: doc.id,
    milestones: parsed.milestones.length,
  };
}
