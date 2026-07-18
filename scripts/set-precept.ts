/**
 * set-precept.ts — write the single ACTIVE board precept (service-role only).
 *
 * The Precept Alignment factor (rubric §7 Factor 6) scores a member's record
 * against the active board precept's emphasized areas. Because APEX roles are
 * self-asserted (any user can set their own role to Admin), there is NO
 * in-app write path for this system-wide config — it is set by whoever holds
 * the service-role key, exactly like board_rubric_config tuning.
 *
 * Usage:
 *   1. Edit scripts/ladr-data/precept_current.ts with the real board emphasis.
 *   2. npm run seed:precept
 *
 * Idempotent: upserts on `cycle`, then makes that the only active row.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { currentPrecept } from "./ladr-data/precept_current";

for (const file of [".env.local", ".env"]) {
  const path = resolve(process.cwd(), file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const p = currentPrecept;
if (!p.cycle || p.cycle === "REPLACE_ME") {
  console.error(
    "scripts/ladr-data/precept_current.ts is still a template — set `cycle` and the emphasis flags to the real board precept before running.",
  );
  process.exit(1);
}
const emphasized = Object.entries(p.emphasis_flags)
  .filter(([, v]) => v)
  .map(([k]) => k);
if (emphasized.length === 0) {
  console.error(
    "No emphasis flags are set to true — the Precept Alignment factor would score 0. Set at least one area the board emphasizes.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { error: upErr } = await admin
    .from("board_precepts")
    .upsert(
      {
        cycle: p.cycle,
        title: p.title,
        emphasis_flags: p.emphasis_flags,
        source_url: p.source_url,
      },
      { onConflict: "cycle" },
    );
  if (upErr) throw new Error(`board_precepts upsert: ${upErr.message}`);

  if (p.active) {
    // idx_board_precepts_one_active allows a single active row — clear others.
    const { error: clearErr } = await admin
      .from("board_precepts")
      .update({ active: false })
      .eq("active", true)
      .neq("cycle", p.cycle);
    if (clearErr) throw new Error(`board_precepts clear: ${clearErr.message}`);
    const { error: actErr } = await admin
      .from("board_precepts")
      .update({ active: true })
      .eq("cycle", p.cycle);
    if (actErr) throw new Error(`board_precepts activate: ${actErr.message}`);
  }

  console.log(
    `Precept set: ${p.cycle}${p.active ? " (active)" : ""} — emphasizing ${emphasized.join(", ")}${
      p.source_url ? "" : " [modeled: no source_url]"
    }`,
  );
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
