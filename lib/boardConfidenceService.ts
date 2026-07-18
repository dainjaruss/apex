// lib/boardConfidenceService.ts
//
// Browser service for the Board Confidence Analyzer: member board-record CRUD
// (RLS owner-only), LaDR/precept reference reads, prior-run listing, the analyze
// POST, and reference-only attachments in the private 'board-docs' bucket
// (stored, listed, deleted — never parsed, spec §12). Spec §4.5.

import { createBrowserClient } from "./supabaseClient";
import type {
  BoardAnalysisRow,
  BoardPrecept,
  LadrDocument,
  LadrMilestone,
  MemberBoardRecord,
} from "@/lib/boardConfidence/types";

const supabase = createBrowserClient();

async function postRoute(url: string, body: Record<string, any>) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
}

/** The member's structured PSR/ESR record entry, or null when never saved. */
export const getMemberBoardRecord = async (
  userId: string,
): Promise<MemberBoardRecord | null> => {
  const { data, error } = await supabase
    .from("member_board_records")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error(`getMemberBoardRecord failed for ${userId}:`, error.message);
    throw new Error(error.message);
  }
  return data as MemberBoardRecord | null;
};

/** Upsert the member's record entry (RLS mbr_* policies make this owner-only). */
export const saveMemberBoardRecord = async (
  userId: string,
  patch: Partial<MemberBoardRecord>,
): Promise<MemberBoardRecord> => {
  const { data, error } = await supabase
    .from("member_board_records")
    .upsert({ user_id: userId, ...patch }, { onConflict: "user_id" })
    .select()
    .single();
  if (error) {
    console.error(`saveMemberBoardRecord failed for ${userId}:`, error.message);
    throw new Error(error.message);
  }
  return data as MemberBoardRecord;
};

/** The single active board precept, or null when none is configured. */
export const getActivePrecept = async (): Promise<BoardPrecept | null> => {
  const { data, error } = await supabase
    .from("board_precepts")
    .select("*")
    .eq("active", true)
    .maybeSingle();
  if (error) {
    console.error("getActivePrecept failed:", error.message);
    throw new Error(error.message);
  }
  return data as BoardPrecept | null;
};

/** Latest LaDR issue for a rating (E1-E9 range) with its milestones. */
export const getLatestLadr = async (
  ratingAbbrev: string,
): Promise<{ document: LadrDocument; milestones: LadrMilestone[] } | null> => {
  const { data: document, error } = await supabase
    .from("ladr_documents")
    .select("*")
    .eq("rating_abbrev", ratingAbbrev)
    .eq("paygrade_range", "E1-E9")
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`getLatestLadr failed for ${ratingAbbrev}:`, error.message);
    throw new Error(error.message);
  }
  if (!document) return null;

  const { data: milestones, error: msError } = await supabase
    .from("ladr_milestones")
    .select("*")
    .eq("ladr_document_id", document.id)
    .order("sort_order");
  if (msError) {
    console.error(`getLatestLadr milestones failed for ${ratingAbbrev}:`, msError.message);
    throw new Error(msError.message);
  }
  return {
    document: document as LadrDocument,
    milestones: (milestones || []) as LadrMilestone[],
  };
};

/** The caller's prior analysis runs, newest first (RLS-scoped anyway). */
export const listMyAnalyses = async (
  userId: string,
): Promise<BoardAnalysisRow[]> => {
  const { data, error } = await supabase
    .from("board_analyses")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) {
    console.error(`listMyAnalyses failed for ${userId}:`, error.message);
    throw new Error(error.message);
  }
  return (data || []) as BoardAnalysisRow[];
};

/** Run an analysis via the audited server route; returns the stored snapshot. */
export const runBoardAnalysis = async (body: {
  userId?: string;
  boardDate?: string;
}): Promise<BoardAnalysisRow> => {
  return (await postRoute(
    "/api/board-confidence/analyze",
    body,
  )) as BoardAnalysisRow;
};

/** v1.4: fetch + store the official LaDR for a rating from Navy COOL. */
export const fetchLadr = async (
  rating: string,
): Promise<{ status: "stored" | "already_current"; rating: string; version: string; milestones: number }> => {
  return (await postRoute("/api/board-confidence/ladr-fetch", { rating })) as {
    status: "stored" | "already_current";
    rating: string;
    version: string;
    milestones: number;
  };
};

/* ── Reference-only attachments (private 'board-docs' bucket) ──────────────── */

/** Upload an attachment under the caller's own folder; returns the storage path. */
export const uploadBoardDoc = async (
  userId: string,
  file: File,
): Promise<string> => {
  const { data, error } = await supabase.storage
    .from("board-docs")
    .upload(`${userId}/${file.name}`, file, { upsert: true });
  if (error) {
    console.error(`uploadBoardDoc failed for ${userId}:`, error.message);
    throw new Error(error.message);
  }
  return data.path;
};

/** List the caller's stored attachments (names only). */
export const listBoardDocs = async (
  userId: string,
): Promise<{ name: string }[]> => {
  const { data, error } = await supabase.storage.from("board-docs").list(userId);
  if (error) {
    console.error(`listBoardDocs failed for ${userId}:`, error.message);
    throw new Error(error.message);
  }
  return (data || []).map((f) => ({ name: f.name }));
};

/** Delete one of the caller's stored attachments. */
export const deleteBoardDoc = async (
  userId: string,
  name: string,
): Promise<void> => {
  const { error } = await supabase.storage
    .from("board-docs")
    .remove([`${userId}/${name}`]);
  if (error) {
    console.error(`deleteBoardDoc failed for ${userId}:`, error.message);
    throw new Error(error.message);
  }
};
