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
  // Trait keys are the real NAVPERS 1616/27 (REV 05-2025) ones, transcribed from
  // public/chiefEvalBlank.pdf (see lib/traitStandards.ts). The block→column pairing
  // is unchanged and still a POSITIONAL map inferred from navfit99-js's older Chief
  // form — verify against a real NAVFIT 98A v30+ Chief report before shipping
  // (spec §8, open question 2).
  CHIEFEVAL: [
    { block: 33, key: "technical_mastery", column: "LEAD" },
    { block: 34, key: "institutional_expertise", column: "TAC" },
    { block: 35, key: "professionalism", column: "PROF" },
    { block: 36, key: "integrity", column: "MIS" },
    { block: 37, key: "accountability", column: "EO" },
    { block: 38, key: "deckplate_leadership", column: "TEAM" },
    { block: 39, key: "team_effectiveness", column: "MIL" },
  ],
  // Block 34 is `eo` (COMMAND OR ORGANIZATIONAL CLIMATE). 1610/2 has no Quality of
  // Work trait, so QUAL stays NULL; TAC carries Block 39 Tactical Performance.
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
