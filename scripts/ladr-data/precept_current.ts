/**
 * The REAL active board precept — the one `npm run seed:precept` writes.
 *
 * Fill this in from the actual convening order / board precept for the cycle
 * you are preparing for, then run `npm run seed:precept`. The five emphasis
 * flags are the spec §7 Factor 6 set; set a flag `true` when the board's
 * precept names that area as an emphasis, `false` otherwise. Only the `true`
 * flags are scored (each as a 0–1 indicator from the member's record):
 *
 *   warfighting          → warfare-qual completion
 *   leadership_positions → documented leadership tours
 *   sea_duty             → sea months in the last 6 years
 *   education            → degrees + credentials
 *   technical_expertise  → NECs + rate-specific quals
 *
 * The script refuses to run while `cycle` is still the REPLACE_ME sentinel, so
 * it can't accidentally activate a placeholder. Set `source_url` to the
 * convening-order link when you have it (leave null for a modeled precept).
 */
import type { PreceptSeed } from "../seed-ladr";

export const currentPrecept: PreceptSeed = {
  cycle: "REPLACE_ME", // e.g. "FY27 Active-Duty E7" — MUST be edited before running
  title: "",
  emphasis_flags: {
    warfighting: false,
    leadership_positions: false,
    sea_duty: false,
    education: false,
    technical_expertise: false,
  },
  source_url: null,
  active: true,
};
