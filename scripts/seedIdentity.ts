/**
 * Deterministic identity for seeded rows — the thing that makes `npm run db:seed`
 * idempotent.
 *
 * WHY THIS EXISTS. Every seed write was a bare INSERT, so each run appended a
 * fresh generation instead of replacing the last one: 12 CHIEFEVAL, 14 FITREP
 * and 75 EVAL drafts had stacked up on the hosted project across ~7 runs. Every
 * row was individually valid, but a demo screen showing eleven near-identical
 * "RODRIGUEZ, MARCOS E (ITCS)" drafts reads as a bug — and, worse, the seed
 * could not be re-run to REPAIR data, which is the one thing this epic needed
 * it for, repeatedly.
 *
 * The fix is to derive each fixture's primary key from its own identity, so the
 * second run collides with the first and upserts over it. No migration, no
 * `seed_key` column, no schema change: the id IS the marker. This follows the
 * house pattern in scripts/seed-ladr.ts, which upserts documents on their
 * natural key (rating_abbrev, paygrade_range, effective_date) — same idea,
 * expressed through the primary key because `evaluations` has no natural
 * unique constraint to conflict on.
 *
 * WHAT COUNTS AS IDENTITY. A report's natural key — member, report type,
 * period. Deliberately NOT its custody (routing_stage, status,
 * current_holder_id, participants): a demo signs records and walks them up the
 * chain, and if custody were part of the key the next seed run would write a
 * NEW row rather than resetting the advanced one. That would reintroduce the
 * exact defect this file removes.
 *
 * The output is an RFC 9562 version-8 ("custom", i.e. vendor-defined layout)
 * UUID. Postgres stores any 128 bits, but the version nibble is a free tell:
 * `gen_random_uuid()` only ever emits version 4, so a `…-8xxx-…` id in
 * `evaluations` was written by a seed and nothing else.
 *
 * ponytail: that marker is minted but NOT used as a prune predicate, so as of
 * this PR it protects nothing — all the safety comes from the callers' scoping
 * (member name + author for e2e, dod_id + fixture period for stress). It
 * cannot be used yet: every accumulated generation on hosted is v4 and must
 * stay reachable for the first converging run. Once that run has happened,
 * adding a `id::text like '________-____-8%'` predicate would make a
 * mis-scoped prune structurally incapable of touching a human's row. Worth
 * doing after the hosted cleanup, not before.
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Hash `parts` into a stable v8 UUID. `scope` namespaces the hash so two seeds
 * that happen to describe the same thing still own separate rows.
 *
 * Parts are joined on NUL, which cannot occur in a Postgres text value, so
 * ("A", "BC") and ("AB", "C") cannot hash to the same id.
 */
export function seedUuid(scope: string, ...parts: string[]): string {
  const b = createHash("sha256")
    .update(["apex.seed", scope, ...parts].join("\u0000"))
    .digest()
    .subarray(0, 16);
  b[6] = (b[6] & 0x0f) | 0x80; // version 8 — custom / hash-derived
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = b.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

/** The subset of an evaluation draft that establishes which report it is. */
export interface SeedEvalIdentity {
  member_name?: string | null;
  report_type?: string | null;
  period_from?: string | null;
  period_to?: string | null;
}

/**
 * Primary key for a seeded evaluation.
 *
 * Throws rather than hashing a hole: a draft missing `member_name` would hash
 * the literal "undefined" and silently share an id with every other such draft,
 * so the seed would write one row where it meant to write several.
 */
export function evaluationSeedId(e: SeedEvalIdentity): string {
  const parts = [e.member_name, e.report_type, e.period_from, e.period_to];
  if (parts.some((p) => !p)) {
    throw new Error(
      `evaluationSeedId: incomplete identity — member_name/report_type/period_from/period_to ` +
        `are all required, got ${JSON.stringify(e)}`,
    );
  }
  return seedUuid("evaluations", ...(parts as string[]));
}

/**
 * Stamp deterministic ids onto a batch of drafts.
 *
 * The duplicate check is the load-bearing part: two drafts sharing a natural
 * key would upsert onto each other, and the seed would report seven rows while
 * writing six. Failing here is the only place that is cheap to notice.
 */
export function withSeedIds<T extends SeedEvalIdentity>(
  drafts: T[],
): Array<T & { id: string }> {
  const seenBy = new Map<string, string>();
  return drafts.map((d) => {
    const id = evaluationSeedId(d);
    const prior = seenBy.get(id);
    if (prior) {
      throw new Error(
        `Seed identity collision: "${d.member_name}" and "${prior}" share ` +
          `(member_name, report_type, period_from, period_to) and would upsert onto ` +
          `each other. Give one of them a distinct member name or period.`,
      );
    }
    seenBy.set(id, d.member_name as string);
    return { ...d, id };
  });
}

/**
 * Delete earlier seed generations.
 *
 * `staleIds` must already be scoped by the caller to rows that seed owns — the
 * e2e seed scopes by (fixture member name AND authored by a seeded account),
 * the stress seed by its synthetic `dod_id` block. This helper only handles the
 * part both get wrong on their own: the foreign keys.
 *
 * `audit_logs.evaluation_id` and `review_approvals.evaluation_id` are ON DELETE
 * CASCADE (001:120, 001:133 — verified on hosted), so they need no explicit
 * delete and used to get one anyway.
 *
 * `brag_sheets.evaluation_id` is NO ACTION (006:17), so a referenced row cannot
 * be deleted at all. In the shipped code that is unreachable — the only writer
 * of that column is applyToDraft (lib/bragSheetService.ts:240), which links a
 * sheet to an evaluation it just created, never to a pre-existing seeded one.
 * "Unreachable in today's code" is not a guarantee about data that has been
 * accumulating on hosted for weeks, though, so the referenced rows are skipped
 * and named rather than deleted: a stale demo draft is a cosmetic problem, a
 * failed prune that takes the whole seed down with it is not, and severing a
 * user's brag sheet by nulling the FK would be worse than either.
 */
export async function pruneSeedEvaluations(
  admin: SupabaseClient,
  staleIds: string[],
  label: string,
): Promise<number> {
  if (!staleIds.length) return 0;

  const { data: linked, error: bragError } = await admin
    .from("brag_sheets")
    .select("id, evaluation_id")
    .in("evaluation_id", staleIds);
  if (bragError) throw new Error(`brag_sheets select: ${bragError.message}`);

  const referenced = new Set((linked ?? []).map((b) => b.evaluation_id));
  const deletable = staleIds.filter((id) => !referenced.has(id));

  if (referenced.size) {
    console.warn(
      `  ! kept ${referenced.size} stale ${label} row(s) referenced by a brag sheet ` +
        `(brag_sheets.evaluation_id is NO ACTION): ${Array.from(referenced).join(", ")}`,
    );
  }
  if (!deletable.length) return 0;

  const { error } = await admin
    .from("evaluations")
    .delete()
    .in("id", deletable);
  if (error) throw new Error(`prune ${label}: ${error.message}`);
  console.log(
    `  pruned ${deletable.length} ${label} row(s) from earlier seed generations`,
  );
  return deletable.length;
}
