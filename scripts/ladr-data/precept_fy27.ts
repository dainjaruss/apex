/**
 * FY27 board precept seed row (spec §10.2). Emphasis flags are MODELED, not
 * transcribed from a convening order; keys are the spec §7 Factor 6 set.
 */
import type { PreceptSeed } from "../seed-ladr";

export const fy27Precept: PreceptSeed = {
  cycle: "FY27 Active-Duty E7",
  title: "FY27 CPO Selection Board emphasis (modeled)",
  emphasis_flags: {
    warfighting: true,
    leadership_positions: true,
    sea_duty: true,
  },
  source_url: null,
  active: true,
};
