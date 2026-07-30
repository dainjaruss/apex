// lib/routing.ts
//
// Pure helpers for the custodian routing chain. No React / no DB — shared by the
// UI (next-holder dropdown), the routing service wrappers, and the /api/eval-route
// enforcement handler.

import { RoutingStage } from "@/types";

// Module-private — the exported stage helpers below are the public surface.
const CHAIN: RoutingStage[] = [
  "sailor",
  "rater",
  "senior_rater",
  "reporting_senior",
  "admin",
];

// The role expected to receive the eval at the NEXT stage (drives the holder-picks
// dropdown and the server-side target-role validation).
export const NEXT_ROLE_BY_STAGE: Record<string, string> = {
  sailor: "Rater",
  rater: "Senior Rater",
  senior_rater: "Reporting Senior",
  reporting_senior: "Admin",
};

/**
 * The `participants[]` set an evaluation actually carries once it has been routed
 * up to `stage` — the creator plus every holder it passed through, in order.
 *
 * This mirrors what the runtime produces: lib/evaluationService.ts saveDraft()
 * seeds `[creator]` on insert, and app/api/eval-route/route.ts appends each new
 * holder (`Array.from(new Set([...ev.participants, toUserId]))`). Nothing else
 * writes the column; it defaults to '{}' with no INSERT trigger (migration 002).
 *
 * Exported because the seed scripts wrote `participants` literally and drifted
 * from that — a two-element `[creator, holder]` set, or `[creator]` alone, which
 * canSignBlock correctly refuses to treat as a rating chain. The seeds call this
 * so their custody is honest about runtime behaviour by construction.
 *
 * `holders` maps a chain stage to whoever held it; `sailor` is the creator.
 */
export function participantsThrough(
  stage: RoutingStage,
  holders: Partial<Record<RoutingStage, string>>,
): string[] {
  // debrief/locked are terminal states entered from reporting_senior, so they
  // carry the whole chain (see handleDebrief in app/api/eval-route/route.ts).
  const end: RoutingStage =
    stage === "debrief" || stage === "locked" ? "reporting_senior" : stage;
  const idx = CHAIN.indexOf(end);
  const reached = idx >= 0 ? CHAIN.slice(0, idx + 1) : (["sailor"] as const);
  return Array.from(
    new Set(reached.map((s) => holders[s]).filter(Boolean) as string[]),
  );
}

export function nextStage(stage: RoutingStage): RoutingStage | null {
  const i = CHAIN.indexOf(stage);
  return i >= 0 && i < CHAIN.length - 1 ? CHAIN[i + 1] : null;
}

export function prevStage(stage: RoutingStage): RoutingStage | null {
  const i = CHAIN.indexOf(stage);
  return i > 0 ? CHAIN[i - 1] : null;
}

// block_values keys a participant may edit during the debrief minor-correction window.
// Deliberately excludes trait grades, recommendations, and every signature key.
export const MINOR_CORRECTION_KEYS = [
  "comments",
  "counselor",
  "date_counseled",
  "qualifications",
  "command_achievements",
  "primary_duties",
];
