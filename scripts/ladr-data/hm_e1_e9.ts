/**
 * HM (Hospital Corpsman) E1-E9 LaDR seed dataset.
 * Verified against the July 2026 HM E1-E9 LaDR (cool.osd.mil). Spec §10.2.
 * applies_to_paygrades = paygrade block(s) where the LaDR lists the item;
 * credentials use the printed "Target Paygrade". NEC rows use the LaDR's
 * L-series HM NEC codes with their CIN under detail.course.
 */
import type { LadrSeed } from "../seed-ladr";

export const hmE1E9: LadrSeed = {
  document: {
    rating_abbrev: "HM",
    rating_name: "Hospital Corpsman",
    paygrade_range: "E1-E9",
    version: "July 2026",
    effective_date: "2026-07-01",
    source_url: "https://www.cool.osd.mil/usn/LaDR/hm_e1_e9.pdf",
    source_hash:
      "fdbf96d5749e6f6c692f4845aa9ab9083a216aee0d55385d31e553ebc3a7e7aa",
  },
  milestones: [
    {
      category: "credential",
      item: "NREMT Emergency Medical Responder (EMR)",
      item_code: null,
      applies_to_paygrades: [3],
    },
    {
      category: "credential",
      item: "NREMT Emergency Medical Technician (EMT)",
      item_code: null,
      applies_to_paygrades: [3],
    },
    {
      category: "credential",
      item: "NREMT National Registered Paramedic (NRP)",
      item_code: null,
      applies_to_paygrades: [4],
    },
    {
      category: "credential",
      item: "Certified EKG Technician (CET)",
      item_code: null,
      applies_to_paygrades: [3],
    },
    {
      category: "credential",
      item: "Certified Clinical Medical Assistant (CCMA)",
      item_code: null,
      applies_to_paygrades: [3],
    },
    {
      category: "credential",
      item: "Certified Phlebotomy Technician (CPT)",
      item_code: null,
      applies_to_paygrades: [3],
    },
    {
      category: "credential",
      item: "Certified Surgical Technologist (CST)",
      item_code: null,
      applies_to_paygrades: [3],
    },
    {
      category: "credential",
      item: "Certified Clinical Hemodialysis Technician (CCHT)",
      item_code: null,
      applies_to_paygrades: [4],
    },
    {
      category: "credential",
      item: "Nursing Assistant Certification (NAC)",
      item_code: null,
      applies_to_paygrades: [5],
    },
    {
      category: "credential",
      item: "Certified Clinical Hemodialysis Technician — Advanced (CCHT-A)",
      item_code: null,
      applies_to_paygrades: [6],
    },
    {
      category: "nec_opportunity",
      item: "Field Medical Service Technician",
      item_code: "L03A",
      applies_to_paygrades: [1, 2, 3, 4, 5, 6, 7],
      detail: { course: "B-300-0013" },
    },
    {
      category: "nec_opportunity",
      item: "Search and Rescue Medical Technician",
      item_code: "L00A",
      applies_to_paygrades: [1, 2, 3, 4, 5],
      detail: { course: "B-300-0075" },
    },
    {
      category: "nec_opportunity",
      item: "Preventive Medicine Technician",
      item_code: "L12A",
      applies_to_paygrades: [1, 2, 3, 4, 5, 6],
      detail: { course: "B-322-0012" },
    },
    {
      category: "nec_opportunity",
      item: "Surface Force Independent Duty Corpsman",
      item_code: "L10A",
      applies_to_paygrades: [4, 5, 6, 7],
      detail: { course: "B-300-0019" },
    },
    {
      category: "nec_opportunity",
      item: "Submarine Force Independent Duty Corpsman",
      item_code: "L01A",
      applies_to_paygrades: [5, 6, 7],
      detail: { course: "B-300-0001" },
    },
    {
      category: "skill_training_required",
      item: "Hospital Corpsman Basic (\"A\" School)",
      item_code: "B-300-0010",
      applies_to_paygrades: [1, 2, 3],
    },
    {
      category: "skill_training_required",
      item: "Tactical Combat Casualty Care (TCCC) Provider Course",
      item_code: null,
      applies_to_paygrades: [1, 2, 3],
    },
    {
      category: "qual_rate_specific",
      item: "Personnel Qualification Standard for Hospital Corpsmen",
      item_code: "43699-2A",
      applies_to_paygrades: [1, 2, 3],
    },
    {
      category: "qual_rate_specific",
      item: "Personnel Qualification Standard for Basic Dental Assistant",
      item_code: "43699-1",
      applies_to_paygrades: [1, 2, 3],
    },
    {
      category: "qual_rate_specific",
      item: "Medical Department JQR/PQS",
      item_code: null,
      applies_to_paygrades: [1, 2, 3, 4, 5, 6],
    },
    {
      category: "pme_required",
      item: "Foundational Leader Development Course",
      item_code: "NELD-03",
      applies_to_paygrades: [3, 4],
    },
    {
      category: "pme_required",
      item: "Intermediate Leader Development Course",
      item_code: "NELD-04",
      applies_to_paygrades: [5],
    },
    {
      category: "pme_required",
      item: "Advanced Leader Development Course",
      item_code: "NELD-05",
      applies_to_paygrades: [6],
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
      applies_to_paygrades: [6, 7],
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
      applies_to_paygrades: [6, 7],
    },
    {
      category: "qual_warfare",
      item: "Fleet Marine Force Warfare (FMF) — if assigned FMF",
      item_code: "FMF",
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
      category: "skill_training_recommended",
      item: "Field Medical Service Technician (FMST)",
      item_code: "B-300-0013",
      applies_to_paygrades: [1, 2, 3, 4, 5],
    },
    {
      category: "skill_training_recommended",
      item: "Sickcall Screener Course",
      item_code: null,
      applies_to_paygrades: [3, 4, 5],
    },
    {
      category: "skill_training_recommended",
      item: "Hospital Corpsman Rate Training Manual (NRTC)",
      item_code: "NAVEDTRA 14295B",
      applies_to_paygrades: [3, 4, 5],
    },
  ],
};
