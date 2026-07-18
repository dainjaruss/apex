/**
 * IT (Information Systems Technician) E1-E9 LaDR seed dataset.
 * Verified against the July 2026 IT E1-E9 LaDR (cool.osd.mil). Spec §10.2.
 * applies_to_paygrades = paygrade block(s) where the LaDR lists the item;
 * credentials use the printed "Target Paygrade".
 */
import type { LadrSeed } from "../seed-ladr";

export const itE1E9: LadrSeed = {
  document: {
    rating_abbrev: "IT",
    rating_name: "Information Systems Technician",
    paygrade_range: "E1-E9",
    version: "July 2026",
    effective_date: "2026-07-01",
    source_url: "https://www.cool.osd.mil/usn/LaDR/it_e1_e9.pdf",
    source_hash: null,
  },
  milestones: [
    {
      category: "credential",
      item: "CompTIA A+",
      item_code: null,
      applies_to_paygrades: [3],
    },
    {
      category: "credential",
      item: "CompTIA Security+",
      item_code: null,
      applies_to_paygrades: [4],
    },
    {
      category: "credential",
      item: "CompTIA Network+",
      item_code: null,
      applies_to_paygrades: [4],
    },
    {
      category: "credential",
      item: "CompTIA Linux+",
      item_code: null,
      applies_to_paygrades: [4],
    },
    {
      category: "credential",
      item: "Cisco CCNA",
      item_code: null,
      applies_to_paygrades: [5],
    },
    {
      category: "credential",
      item: "CompTIA Server+",
      item_code: null,
      applies_to_paygrades: [5],
    },
    {
      category: "credential",
      item: "CompTIA CySA+",
      item_code: null,
      applies_to_paygrades: [6],
    },
    {
      category: "credential",
      item: "Cisco CCNP",
      item_code: null,
      applies_to_paygrades: [6],
    },
    {
      category: "credential",
      item: "CompTIA SecurityX",
      item_code: null,
      applies_to_paygrades: [7],
    },
    {
      category: "nec_opportunity",
      item: "Systems Administration",
      item_code: "746A",
      applies_to_paygrades: [4, 5, 6],
      detail: { course: "A-150-1980" },
    },
    {
      category: "qual_rate_specific",
      item: "CANES PQS",
      item_code: "43355-11A",
      applies_to_paygrades: [4, 5, 6],
    },
    {
      category: "qual_rate_specific",
      item: "KOAM PQS",
      item_code: "43462-2B",
      applies_to_paygrades: [5, 6],
    },
    {
      category: "pme_required",
      item: "CPO Selectee Leadership Course",
      item_code: null,
      applies_to_paygrades: [7],
    },
    {
      category: "pme_required",
      item: "CPO Leader Development Course",
      item_code: "NELD-06",
      applies_to_paygrades: [7],
    },
    {
      category: "qual_watchstanding",
      item: "Basic Damage Control",
      item_code: null,
      applies_to_paygrades: [1, 2, 3],
    },
    {
      category: "qual_watchstanding",
      item: "Advanced Damage Control",
      item_code: null,
      applies_to_paygrades: [4],
    },
    {
      category: "qual_watchstanding",
      item: "3M Maintenance Person (301)",
      item_code: null,
      applies_to_paygrades: [1, 2, 3, 4],
    },
    {
      category: "qual_watchstanding",
      item: "3M Work Center Supervisor (303)",
      item_code: null,
      applies_to_paygrades: [7],
    },
    {
      category: "qual_watchstanding",
      item: "MOOW / POOW",
      item_code: null,
      applies_to_paygrades: [3, 4],
    },
    {
      category: "qual_watchstanding",
      item: "Section Leader",
      item_code: null,
      applies_to_paygrades: [7],
    },
    {
      category: "qual_warfare",
      item: "Information Warfare (EIWS)",
      item_code: "IW",
      applies_to_paygrades: [4],
    },
    {
      category: "qual_warfare",
      item: "Surface Warfare (ESWS) — if afloat",
      item_code: "SW",
      applies_to_paygrades: [4],
    },
    {
      category: "education_degree",
      item: "Occupational-related Associate degree",
      item_code: null,
      applies_to_paygrades: [5],
    },
    {
      category: "pme_recommended",
      item: "Enlisted Leader Development — Intermediate",
      item_code: null,
      applies_to_paygrades: [5],
    },
    {
      category: "pme_recommended",
      item: "Enlisted Leader Development — Advanced",
      item_code: null,
      applies_to_paygrades: [6],
    },
    {
      category: "skill_training_recommended",
      item: "NAVEDTRA self-paced modules (rating-relevant)",
      item_code: null,
      applies_to_paygrades: [3, 4, 5],
    },
  ],
};
