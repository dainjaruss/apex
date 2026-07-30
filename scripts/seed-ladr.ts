/**
 * LaDR seed script — versioned LaDR reference data (spec §10).
 *
 * Seeds LaDR documents and milestones ONLY. It used to activate the shipped
 * MODELED FY27 precept as an unconditional side effect, so nobody could load
 * the transcribed milestones without also publishing three fabricated emphasis
 * flags to every user. Precepts have their own entry point —
 * `npm run seed:precept` (scripts/set-precept.ts), which carries the identical
 * upsert + one-active-row logic and refuses to run while the cycle is still
 * the REPLACE_ME placeholder.
 *
 * Usage: npx tsx scripts/seed-ladr.ts [--rating IT] [--reset] [--dry-run]
 *   --rating <ABBREV>  limit the run to one rating's dataset
 *   --reset            delete that rating's documents first (cascade removes
 *                      milestones) before re-import; without it, re-runs are
 *                      idempotent upserts
 *   --dry-run          build and validate the insert payload without touching
 *                      (or requiring credentials for) a database
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
import { hmE1E9 } from "./ladr-data/hm_e1_e9";

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

const args = process.argv.slice(2);
const reset = args.includes("--reset");
// --dry-run builds and validates the exact insert payload without a database,
// so a dataset change is reviewable where no local/dev Supabase is configured.
const dryRun = args.includes("--dry-run");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!dryRun && (!url || !serviceKey)) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

// Never contacted under --dry-run; the placeholders only keep createClient happy.
const admin = createClient(
  url ?? "http://dry-run.invalid",
  serviceKey ?? "dry-run",
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const ratingIdx = args.indexOf("--rating");
const onlyRating =
  ratingIdx >= 0 ? args[ratingIdx + 1]?.toUpperCase() : undefined;
if (ratingIdx >= 0 && !onlyRating) {
  console.error("--rating requires a value, e.g. --rating IT");
  process.exit(1);
}

const seeds = [itE1E9, bmE1E9, hmE1E9].filter(
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


/**
 * --dry-run: build the exact ladr_milestones payload seedRating() would insert
 * and assert the 004 NOT NULL / smallint[] / jsonb constraints plus the §10.3
 * carry-forward key uniqueness. Throws on the first violation.
 */
function dryRunRating(seed: LadrSeed) {
  const rows = seed.milestones.map((m, i) => ({
    category: m.category,
    item: m.item,
    item_code: m.item_code,
    applies_to_paygrades: m.applies_to_paygrades,
    detail: m.detail ?? {},
    sort_order: i,
  }));
  const keys = new Set<string>();
  for (const r of rows) {
    const where = `${seed.document.rating_abbrev} "${r.item}"`;
    if (!r.item.trim()) throw new Error(`${where}: empty item`);
    if (!r.applies_to_paygrades.length)
      throw new Error(`${where}: empty applies_to_paygrades`);
    if (
      r.applies_to_paygrades.some((p) => !Number.isInteger(p) || p < 1 || p > 9)
    )
      throw new Error(`${where}: paygrade outside E1-E9`);
    JSON.stringify(r.detail); // jsonb round-trip (throws on cycles/BigInt)
    const key = milestoneKey(r);
    if (keys.has(key))
      throw new Error(`${where}: duplicate carry-forward key '${key}'`);
    keys.add(key);
  }
  const byCategory = new Map<string, number>();
  for (const r of rows)
    byCategory.set(r.category, (byCategory.get(r.category) ?? 0) + 1);
  console.log(
    `  ${rows.length} milestone(s) valid — ` +
      Array.from(byCategory)
        .map(([c, n]) => `${c}:${n}`)
        .join(", "),
  );
}

async function main() {
  if (dryRun) {
    for (const seed of seeds) {
      console.log(
        `Dry run ${seed.document.rating_abbrev} — ${seed.document.version}`,
      );
      dryRunRating(seed);
    }
    console.log("LaDR dry run complete — no database contacted.");
    return;
  }
  for (const seed of seeds) await seedRating(seed);
  console.log("LaDR seed complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
