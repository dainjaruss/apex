/**
 * LaDR seed script — versioned LaDR reference data + board precept (spec §10).
 * Usage: npx tsx scripts/seed-ladr.ts [--rating IT] [--reset]
 *   --rating <ABBREV>  limit the run to one rating's dataset
 *   --reset            delete that rating's documents first (cascade removes
 *                      milestones) before re-import; without it, re-runs are
 *                      idempotent upserts
 *
 * Versioning / annual-refresh procedure (spec §10.3):
 * - LaDRs are reviewed annually; the cover month+year is the version key. A
 *   new issue is imported as a NEW ladr_documents row (new effective_date) —
 *   old rows are never mutated or deleted, so historical board_analyses
 *   snapshots remain interpretable (they embed values, not milestone FKs).
 * - assembleRubricInputs always resolves the latest document by
 *   effective_date desc, so new imports take effect immediately.
 * - User checklists key on milestone UUIDs, which change on re-import. After
 *   inserting, this script runs a carry-forward step: for each
 *   member_board_records row of the rating, ladr_checklist entries are
 *   remapped from the previous milestones to the new ones matching on
 *   (category, coalesce(item_code, item)); unmatched entries are dropped —
 *   they simply become "unanswered" (lowers conf_D, never fabricates a status).
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import type { LadrCategory, PreceptFlag } from "@/lib/boardConfidence/types";

export interface LadrSeedMilestone {
  category: LadrCategory;
  item: string;
  item_code: string | null;
  applies_to_paygrades: number[];
  detail?: Record<string, unknown>;
}

export interface LadrSeed {
  document: {
    rating_abbrev: string;
    rating_name: string;
    paygrade_range: "E1" | "E4" | "E5" | "E6" | "E7" | "E8" | "E9" | "E1-E9";
    version: string;
    effective_date: string;
    source_url: string;
    source_hash: string | null;
  };
  milestones: LadrSeedMilestone[];
}

export interface PreceptSeed {
  cycle: string;
  title: string;
  emphasis_flags: Partial<Record<PreceptFlag, boolean>>;
  source_url: string | null;
  active: boolean;
}

import { itE1E9 } from "./ladr-data/it_e1_e9";
import { bmE1E9 } from "./ladr-data/bm_e1_e9";
import { fy27Precept } from "./ladr-data/precept_fy27";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()])
        process.env[m[1].trim()] = m[2].trim();
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const args = process.argv.slice(2);
const reset = args.includes("--reset");
const ratingIdx = args.indexOf("--rating");
const onlyRating =
  ratingIdx >= 0 ? args[ratingIdx + 1]?.toUpperCase() : undefined;
if (ratingIdx >= 0 && !onlyRating) {
  console.error("--rating requires a value, e.g. --rating IT");
  process.exit(1);
}

const seeds = [itE1E9, bmE1E9].filter(
  (s) => !onlyRating || s.document.rating_abbrev === onlyRating,
);
if (!seeds.length) {
  console.error(`No seed dataset for rating '${onlyRating}'`);
  process.exit(1);
}

/** carry-forward match key: (category, coalesce(item_code, item)) — spec §10.3 */
function milestoneKey(m: {
  category: string;
  item: string;
  item_code: string | null;
}) {
  return `${m.category}|${m.item_code ?? m.item}`;
}

async function seedRating(seed: LadrSeed) {
  const rating = seed.document.rating_abbrev;
  console.log(`Seeding ${rating} — ${seed.document.version}`);

  // Capture the outgoing milestones (all document versions of this rating)
  // BEFORE any delete, so checklists survive both --reset and re-import.
  const { data: oldDocs, error: docsErr } = await admin
    .from("ladr_documents")
    .select("id")
    .eq("rating_abbrev", rating);
  if (docsErr) throw new Error(`ladr_documents select: ${docsErr.message}`);
  const oldDocIds = (oldDocs ?? []).map((d) => d.id);

  const oldKeyById = new Map<string, string>();
  if (oldDocIds.length) {
    const { data: oldMs, error } = await admin
      .from("ladr_milestones")
      .select("id, category, item, item_code")
      .in("ladr_document_id", oldDocIds);
    if (error) throw new Error(`ladr_milestones select: ${error.message}`);
    for (const m of oldMs ?? []) oldKeyById.set(m.id, milestoneKey(m));
  }

  if (reset && oldDocIds.length) {
    const { error } = await admin
      .from("ladr_documents")
      .delete()
      .in("id", oldDocIds);
    if (error) throw new Error(`reset delete: ${error.message}`);
    console.log(
      `  reset: removed ${oldDocIds.length} document(s), milestones cascade`,
    );
  }

  // 1. Upsert the document (repo idempotence style, 001:743). Old versions are
  //    never touched — a new effective_date is simply a new row.
  const { data: doc, error: upErr } = await admin
    .from("ladr_documents")
    .upsert(seed.document, {
      onConflict: "rating_abbrev,paygrade_range,effective_date",
    })
    .select("id")
    .single();
  if (upErr || !doc)
    throw new Error(`ladr_documents upsert: ${upErr?.message ?? "no row"}`);

  // 2. Delete-and-reinsert milestones so content stays authoritative to the
  //    dataset (analysis snapshots embed values, not FKs — unaffected).
  const { error: delErr } = await admin
    .from("ladr_milestones")
    .delete()
    .eq("ladr_document_id", doc.id);
  if (delErr) throw new Error(`ladr_milestones delete: ${delErr.message}`);

  const rows = seed.milestones.map((m, i) => ({
    ladr_document_id: doc.id,
    category: m.category,
    item: m.item,
    item_code: m.item_code,
    applies_to_paygrades: m.applies_to_paygrades,
    detail: m.detail ?? {},
    sort_order: i,
  }));
  const { data: inserted, error: insErr } = await admin
    .from("ladr_milestones")
    .insert(rows)
    .select("id, category, item, item_code");
  if (insErr || !inserted)
    throw new Error(`ladr_milestones insert: ${insErr?.message ?? "no rows"}`);
  console.log(`  ${inserted.length} milestone(s)`);

  // 3. Carry-forward (spec §10.3): remap member checklists old-id -> new-id on
  //    (category, coalesce(item_code, item)); unmatched entries are dropped.
  const newIdByKey = new Map(inserted.map((m) => [milestoneKey(m), m.id]));
  const { data: members, error: memErr } = await admin
    .from("member_board_records")
    .select("id, ladr_checklist")
    .eq("rating_abbrev", rating);
  if (memErr) throw new Error(`member_board_records select: ${memErr.message}`);

  let carried = 0;
  for (const member of members ?? []) {
    const checklist = (member.ladr_checklist ?? {}) as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [oldId, entry] of Object.entries(checklist)) {
      const key = oldKeyById.get(oldId);
      const newId = key ? newIdByKey.get(key) : undefined;
      if (newId) next[newId] = entry;
    }
    if (JSON.stringify(next) === JSON.stringify(checklist)) continue;
    const { error } = await admin
      .from("member_board_records")
      .update({ ladr_checklist: next })
      .eq("id", member.id);
    if (error) throw new Error(`member_board_records update: ${error.message}`);
    carried++;
  }
  if (carried) console.log(`  carried forward ${carried} member checklist(s)`);
}

async function seedPrecept(p: PreceptSeed) {
  const { cycle, title, emphasis_flags, source_url } = p;
  const { error } = await admin
    .from("board_precepts")
    .upsert(
      { cycle, title, emphasis_flags, source_url },
      { onConflict: "cycle" },
    );
  if (error) throw new Error(`board_precepts upsert: ${error.message}`);

  if (p.active) {
    // idx_board_precepts_one_active allows one active row — clear others first
    const { error: clearErr } = await admin
      .from("board_precepts")
      .update({ active: false })
      .eq("active", true)
      .neq("cycle", cycle);
    if (clearErr) throw new Error(`board_precepts clear: ${clearErr.message}`);
    const { error: actErr } = await admin
      .from("board_precepts")
      .update({ active: true })
      .eq("cycle", cycle);
    if (actErr) throw new Error(`board_precepts activate: ${actErr.message}`);
  }
  console.log(`  precept: ${cycle}${p.active ? " (active)" : ""}`);
}

async function main() {
  for (const seed of seeds) await seedRating(seed);
  await seedPrecept(fy27Precept);
  console.log("LaDR seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
