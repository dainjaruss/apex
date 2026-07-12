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
