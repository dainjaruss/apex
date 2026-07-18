/**
 * BM (Boatswain's Mate) E1-E9 LaDR seed dataset — REPRESENTATIVE (spec §10.2).
 * Only IT's rate-specific content was verified from a source PDF; every BM row
 * therefore carries detail.source = "representative". Rating-independent rows
 * (watchstanding quals, warfare qual, PME, ELD, degree) mirror the IT dataset;
 * rate-specific rows are placeholders pending transcription of the BM LaDR.
 */
import type { LadrSeed } from "../seed-ladr";

const representative = { source: "representative" };

export const bmE1E9: LadrSeed = {
  document: {
    rating_abbrev: "BM",
    rating_name: "Boatswain's Mate",
    paygrade_range: "E1-E9",
    version: "July 2026",
    effective_date: "2026-07-01",
    source_url: "https://www.cool.osd.mil/usn/LaDR/bm_e1_e9.pdf",
    source_hash: null,
  },
  milestones: [
    // rate-specific placeholders
    {
      category: "credential",
      item: "Able Seafarer — Deck (USCG)",
      item_code: null,
      applies_to_paygrades: [5],
      detail: representative,
    },
    {
      category: "qual_rate_specific",
      item: "Boat Coxswain PQS",
      item_code: null,
      applies_to_paygrades: [4, 5],
      detail: representative,
    },
    // rating-independent rows (shared with IT dataset)
    {
      category: "pme_required",
      item: "CPO Selectee Leadership Course",
      item_code: null,
      applies_to_paygrades: [7],
      detail: representative,
    },
    {
      category: "pme_required",
      item: "CPO Leader Development Course",
      item_code: "NELD-06",
      applies_to_paygrades: [7],
      detail: representative,
    },
    {
      category: "qual_watchstanding",
      item: "Basic Damage Control",
      item_code: null,
      applies_to_paygrades: [1, 2, 3],
      detail: representative,
    },
    {
      category: "qual_watchstanding",
      item: "Advanced Damage Control",
      item_code: null,
      applies_to_paygrades: [4],
      detail: representative,
    },
    {
      category: "qual_watchstanding",
      item: "3M Maintenance Person (301)",
      item_code: null,
      applies_to_paygrades: [1, 2, 3, 4],
      detail: representative,
    },
    {
      category: "qual_watchstanding",
      item: "3M Work Center Supervisor (303)",
      item_code: null,
      applies_to_paygrades: [7],
      detail: representative,
    },
    {
      category: "qual_watchstanding",
      item: "MOOW / POOW",
      item_code: null,
      applies_to_paygrades: [3, 4],
      detail: representative,
    },
    {
      category: "qual_watchstanding",
      item: "Section Leader",
      item_code: null,
      applies_to_paygrades: [7],
      detail: representative,
    },
    {
      category: "qual_warfare",
      item: "Surface Warfare (ESWS)",
      item_code: "SW",
      applies_to_paygrades: [4],
      detail: representative,
    },
    {
      category: "education_degree",
      item: "Occupational-related Associate degree",
      item_code: null,
      applies_to_paygrades: [5],
      detail: representative,
    },
    {
      category: "pme_recommended",
      item: "Enlisted Leader Development — Intermediate",
      item_code: null,
      applies_to_paygrades: [5],
      detail: representative,
    },
    {
      category: "pme_recommended",
      item: "Enlisted Leader Development — Advanced",
      item_code: null,
      applies_to_paygrades: [6],
      detail: representative,
    },
    {
      category: "skill_training_recommended",
      item: "NAVEDTRA self-paced modules (rating-relevant)",
      item_code: null,
      applies_to_paygrades: [3, 4, 5],
      detail: representative,
    },
  ],
};
