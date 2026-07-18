// lib/navfit98/constants.ts
//
// Shared NAVFIT 98A export constants.
// Spec: docs/specs/navfit98-field-mapping.md §4.3 — trait block→column maps.

export interface NavfitTraitEntry {
  /** NAVPERS form block number (33–39) — for validation error anchoring */
  block: number;
  /** APEX trait_grades key rendered in this block on this form */
  key: string;
  /** Access Reports column NAVFIT stores this block's grade in */
  column: string;
}

// Assignment is by BLOCK number, not trait name — NAVFIT renders block N of each
// form from a fixed Access column and the assignment differs per form (spec §4.3).
// Unlisted trait columns (EVAL: MIS/TAC; CHIEFEVAL & FITREP: QUAL/PA) stay NULL.
export const NAVFIT_TRAIT_MAP: Record<
  "EVAL" | "CHIEFEVAL" | "FITREP",
  NavfitTraitEntry[]
> = {
  EVAL: [
    { block: 33, key: "knowledge", column: "PROF" },
    { block: 34, key: "work", column: "QUAL" },
    { block: 35, key: "eo", column: "EO" },
    { block: 36, key: "bearing", column: "MIL" },
    { block: 37, key: "accomplishment", column: "PA" },
    { block: 38, key: "teamwork", column: "TEAM" },
    { block: 39, key: "leadership", column: "LEAD" },
  ],
  // Positional map inferred from navfit99-js's older Chief form — verify against
  // a real NAVFIT 98A v30+ Chief report before shipping (spec §8, open question 2).
  CHIEFEVAL: [
    { block: 33, key: "deckplate_leadership", column: "LEAD" },
    { block: 34, key: "professionalism", column: "TAC" },
    { block: 35, key: "mission_accomplishment", column: "PROF" },
    { block: 36, key: "human_development", column: "MIS" },
    { block: 37, key: "eo_climate", column: "EO" },
    { block: 38, key: "teamwork", column: "TEAM" },
    { block: 39, key: "leadership", column: "MIL" },
  ],
  // Excludes the legacy `work` → 34 alias in fitrepTraitBlockMap — block 34 is `eo`.
  FITREP: [
    { block: 33, key: "knowledge", column: "PROF" },
    { block: 34, key: "eo", column: "EO" },
    { block: 35, key: "bearing", column: "MIL" },
    { block: 36, key: "teamwork", column: "TEAM" },
    { block: 37, key: "accomplishment", column: "MIS" },
    { block: 38, key: "leadership", column: "LEAD" },
    { block: 39, key: "tactical_performance", column: "TAC" },
  ],
};
