/**
 * BM (Boatswain's Mate) E1-E9 LaDR seed dataset — PARTLY REPRESENTATIVE
 * (spec §10.2). The credential/qual/PME rows below were never verified against
 * a source PDF and keep detail.source = "representative"; the
 * advancement_consideration rows appended at the end ARE transcribed from the
 * source PDF and carry detail.source = "transcribed".
 */
import type { LadrSeed } from "../seed-ladr";
import { considerations } from "./advancement";

const representative = { source: "representative" };

// "Considerations for advancement" — BM CAREER PATH (SW), i.e. the ACTIVE
// component, pp. 2-6 of bm_e1_e9.pdf (sha256
// 509d908591507dec715467e58d91356d948782952237f60c2cdb1cd9eebeed5f, cover
// "July 2026", career-path pages footed "Revised: May 2025"). The same three
// sections are printed again for TAR and for SELRES with different text; those
// are NOT transcribed — see advancement.ts.
//
// BM's section prints NO Fully Qualified / Best Qualified split (unlike IT and
// HM) — it is organized as "1. Sea Assignments" (by platform group a.–g.) and
// "2. Shore Assignments (all)". The tier is therefore recorded as
// "unspecified": it is not inferred. One milestone per assignment group keeps
// the platform-specific groups answerable as N/A by a Sailor who never served
// that platform; every bullet of the group is preserved verbatim in
// detail.notes.
const BM_COMPONENT = "BM CAREER PATH (SW)";
const BM_REVISION = "May 2025";

/** Verbatim bullet list of one assignment group, one bullet per line. */
const bullets = (...lines: string[]) => lines.map((l) => `- ${l}`).join("\n");

const bmAdvancement = [
  ...considerations(
    {
      step: "E6 to E7",
      paygrade: 7,
      component: BM_COMPONENT,
      seaShore: null,
      seaShoreScope: "row",
      pageRevision: BM_REVISION,
    },
    [
      {
        item: "Sea — all ship classes",
        tier: "unspecified",
        group: "1. Sea Assignments: a. ALL SHIP CLASSES",
        notes: bullets(
          "Should obtain ESWS and/or any warfare devices available at current command",
          "Should be assigned LPO/ALPO/WCS of a Deck Division with documented performance",
          "Should be Deck Special Evolutions POIC qualified",
          "Should be Davit Captain qualified",
          "Should be UNREP Rig Captain qualified",
          "Deck Safety Observer qualification",
          "UNREP Safety Observer qualification",
          "STT/DCTT/ATTT member/training team involvement",
          "Repair Locker Leader qualification",
          "OOD (I/P) qualification",
          "Duty Section watchbill coordinator",
          "Asst Command Collateral (ie: ACFL, Asst. CMEO, Asst. DAPA, Dept. Mentorship Coord, Dept ESWS/EAWS coord, FCPOA involvement)",
        ),
        examples: [
          "ie: ACFL, Asst. CMEO, Asst. DAPA, Dept. Mentorship Coord, Dept ESWS/EAWS coord, FCPOA involvement",
        ],
      },
      {
        item: "Sea — CVN",
        tier: "unspecified",
        group: "1. Sea Assignments: b. CVN",
        notes: bullets(
          "Navy Standard Fuel Delivery Winch Operator qualification",
          "Enlisted Section Leader qualification/designation",
          "CPI Program Involvement/Qualifications (Green Belt/Yellow Belt/etc)",
        ),
        examples: ["Green Belt/Yellow Belt/etc"],
      },
      {
        item: "Sea — DDG/CG/ESB",
        tier: "unspecified",
        group: "1. Sea Assignments: c. DDG/CG/ESB",
        notes: bullets("Flight Deck Officer qualification/designation"),
      },
      {
        item: "Sea — LPD/LSD/LHD/LHA",
        tier: "unspecified",
        group: "1. Sea Assignments: d. LPD/LSD/LHD/LHA",
        notes: bullets(
          "Should be Well Deck POIC/LCAC Ramp Marshall qualified",
          "Well Deck Safety Observer qualification",
          "Well Deck Control designation",
          "Crane Operator (LPD/LSD)",
          "Crane Safety Observer (LPD/LSD)",
          "Flight Deck Officer (LSD)",
        ),
      },
      {
        item: "Sea — LCS/PC/MCM",
        tier: "unspecified",
        group: "1. Sea Assignments: e. LCS/PC/MCM",
        notes: bullets(
          "CICWO qualification/designation",
          "Flight Deck Officer qualification/designation",
          "Mission Bay POIC",
        ),
      },
      {
        item: "Sea — ACU/BMU/NBU/ACB/MESG/MSRON, NSW",
        tier: "unspecified",
        group: "1. Sea Assignments: f. ACU/BMU/NBU/ACB/MESG/MSRON, NSW",
        notes: bullets(
          "Craft Master (minus ACU 4/5, NBU 7 LCAC)",
          "Load Master",
          "Salvage Petty Officer (BMU)",
          "Beach Party Team Commander (BMU)",
          "Senior Ramp Marshall (BMU)",
          "INLS Operator (ACB)",
          "Qualify Coxswain (MK IV)/Patrol Leader",
          "Boat Team Leader (CRF)",
          "Weapons Line Coach (CRF)",
          "CDO/SDO",
        ),
      },
      {
        item: "Sea — staff duty (CSG/DESRON/PHIBRON)",
        tier: "unspecified",
        group: "1. Sea Assignments: g. STAFF DUTY (CSG/DESRON/PHIBRON)",
        notes: bullets(
          "SDO",
          "Documented performance in shipboard evolutions/assessments (not just a ship rider)",
        ),
      },
      {
        item: "Shore assignments (all)",
        tier: "unspecified",
        group: "2. Shore Assignments (all)",
        notes: bullets(
          "Detailer",
          "Training Teams (ATG/NFMT)",
          "Instructor Duty (MTS at completion-all ranks)",
          "Recruiter Duty LPO",
          "Port Operations Quals (Dock Master/Oil Spill Response Team Leader/SIBC/PODO)",
          "Major Command Collateral",
          "Range Safety Officer (RSO), Small Arms Instructor, Crew Served Weapons Instructor (CRF)",
          "CRG TEU Training Team Lead",
          "MTS is a NETC program. All learning center instructors fall under NETC as TYCOM. Other organizations (ATG/CRG/etc.) although have valid 805A billets, do not fall under NETC as TYCOM and MTS is not a requirement",
          "ATS is an Afloat Training Group Program. Personnel assigned to ATG should qualify ATS if avalible at current command",
          "Port Operations Tug Master",
        ),
        examples: ["Dock Master/Oil Spill Response Team Leader/SIBC/PODO"],
      },
    ],
  ),
  ...considerations(
    {
      step: "E7 to E8",
      paygrade: 8,
      component: BM_COMPONENT,
      seaShore: null,
      seaShoreScope: "row",
      pageRevision: BM_REVISION,
    },
    [
      {
        item: "Sea — all ship classes",
        tier: "unspecified",
        group: "1. Sea Assignments: a. ALL SHIP CLASSES",
        notes: bullets(
          "Should obtain ESWS and/or any warfare devices available at current command",
          "Should be assigned Divisional/Department LCPO",
          "Should be Deck Safety Observer qualified",
          "Should be UNREP Safety Observer qualified",
          "Should be OOD (I/P) qualified",
          "Qualified Duty Section Leader",
          "ATTWO qualification/designation if available",
          "STT Coord, DCTT, ATTT, ITT team or other Training Team member",
          "Repair locker leader or other Damage Control organization involvement",
          "Command Collateral with documented impact (CFL, CMEO, CFS, DAPA, Mentorship, Sponsor)",
          "CPOA involvement",
          "Sailor 360 involvement",
          "Enlisted watchbill coordinator",
        ),
        examples: ["CFL, CMEO, CFS, DAPA, Mentorship, Sponsor"],
      },
      {
        item: "Sea — CVN",
        tier: "unspecified",
        group: "1. Sea Assignments: b. CVN",
        notes: bullets(
          "Navy Standard Fuel Delivery Winch Operator Qualification",
        ),
      },
      {
        item: "Sea — DDG/CG/ESB",
        tier: "unspecified",
        group: "1. Sea Assignments: c. DDG/CG/ESB",
        notes: bullets(
          "Flight Deck Officer qualification/designation",
          "Helicopter Control Officer qualification/designation",
        ),
      },
      {
        item: "Sea — LPD/LSD/LHD/LHA",
        tier: "unspecified",
        group: "1. Sea Assignments: d. LPD/LSD/LHD/LHA",
        notes: bullets(
          "Should be Well Deck Safety Observer qualified",
          "Well Deck Control/Docking Officer qualification/designation",
          "Should be Crane Safety Observer qualified (LPD/LSD)",
        ),
      },
      {
        item: "Sea — LCS/PC/MCM",
        tier: "unspecified",
        group: "1. Sea Assignments: e. LCS/PC/MCM",
        notes: bullets(
          "CICWO qualification/designation",
          "JOOD",
          "HCO",
          "Mission Bay Control Officer/Designation (equivalent to WDCO)",
          "Embarcation Officer",
          "SAR officer",
        ),
      },
      {
        item: "Sea — ACU/BMU/NBU/ACB/CRG/CRF/NSW",
        tier: "unspecified",
        group: "1. Sea Assignments: f. ACU/BMU/NBU/ACB/CRG/CRF/NSW",
        notes: bullets(
          "Craft Master",
          "Salvage Officer (BMU)",
          "Beach Party Team Commander (BMU)",
          "Senior Ramp Marshall (BMU)/Salvage Officer (BMU)",
          "Range Safety Officer or Range OIC (CRF/BMU)",
          "Boat Captain (MK VI) and or Patrol Officer (SEA ARK)",
          "CDO/SDO",
        ),
      },
      {
        item: "Sea — staff duty (CSG/DESRON/PHIBRON)",
        tier: "unspecified",
        group: "1. Sea Assignments: g. STAFF DUTY (CSG/DESRON/PHIBRON)",
        notes: bullets(
          "SDO",
          "Documented performance in shipboard evolutions/assessments (not just a ship rider)",
        ),
      },
      {
        item: "Shore assignments (all)",
        tier: "unspecified",
        group: "2. Shore Assignments (all)",
        notes: bullets(
          "Detailer, Rating Specialist",
          "Instructor Duty/Course Supervisor/Training Safety Officer",
          "Recruit Division Commander/FQA",
          "Recruiting/MEPS",
          "Port Operations Quals/LCPO Port Ops/Tug Master/Harbor Pilot",
          "Major Command Collateral",
          "Range Safety Officer (RSO), Small Arms Instructor, Crew Served Weapons Instructor (CRF)",
          "CRG TEU Training Cell LCPO",
          "SDO/CDO",
          "ATG Team Lead",
          "TYCOM",
          "MTS is a NETC program. All learning center instructors fall under NETC as TYCOM. Other organizations (ATG/CRG/etc.) although have valid 805A billets, do not fall under NETC as TYCOM and MTS is not a requirement.",
          "ATS is an Afloat Training Group Program. Personnel assigned to ATG should qualify ATS if avalible at currnent command",
          "Port Operations Tug Master",
        ),
      },
    ],
  ),
  ...considerations(
    {
      step: "E8 to E9",
      paygrade: 9,
      component: BM_COMPONENT,
      seaShore: null,
      seaShoreScope: "row",
      pageRevision: BM_REVISION,
    },
    [
      {
        item: "Sea — all ship classes",
        tier: "unspecified",
        group: "1. Sea Assignments: a. ALL SHIP CLASSES",
        notes: bullets(
          "Should obtain ESWS and/or any warfare devices available at current command",
          "Should be assigned Department LCPO",
          "Should be Deck Safety Observer qualified",
          "Should be UNREP Safety Observer qualified",
          "Should be OOD (I/P) qualified",
          "Qualified Duty Section Leader",
          "ATTWO qualification/designation if available",
          "STT Coord, DCTT, ATTT, ITT team or other Training Team member",
          "Repair locker leader or other Damage Control organization involvement",
          "Command Collateral with documented impact (Warfare Program, CFL, CMEO, CFS, DAPA, Mentorship, Sponsor)",
          "CPOA involvement",
          "Sailor 360 involvement",
          "Senior Enlisted watchbill coordinator",
        ),
        examples: [
          "Warfare Program, CFL, CMEO, CFS, DAPA, Mentorship, Sponsor",
        ],
      },
      {
        item: "Sea — CVN",
        tier: "unspecified",
        group: "1. Sea Assignments: b. CVN",
        notes: bullets(
          "Navy Standard Fuel Delivery Winch Operator Qualification",
          "Senior Enlisted Section Leader",
        ),
      },
      {
        item: "Sea — DDG/CG/ESB",
        tier: "unspecified",
        group: "1. Sea Assignments: c. DDG/CG/ESB",
        notes: bullets(
          "Flight Deck Officer qualification/designation",
          "Helicopter Control Officer qualification/designation",
        ),
      },
      {
        item: "Sea — LPD/LSD/LHD/LHA",
        tier: "unspecified",
        group: "1. Sea Assignments: d. LPD/LSD/LHD/LHA",
        notes: bullets(
          "Should be Well Deck Safety Observer qualified",
          "Well Deck Control/Docking Officer qualification/designation",
          "Should be Crane Safety Observer qualified (LPD/LSD)",
        ),
      },
      {
        item: "Sea — LCS/PC/MCM",
        tier: "unspecified",
        group: "1. Sea Assignments: e. LCS/PC/MCM",
        notes: bullets(
          "CICWO qualification/designation",
          "JOOD",
          "HCO",
          "Mission Bay Control Officer/Designation (equivalent to WDCO)",
          "Embarcation Officer",
          "SAR officer",
        ),
      },
      {
        item: "Sea — ACU/BMU/NBU/ACB/MESG",
        tier: "unspecified",
        group: "1. Sea Assignments: f. ACU/BMU/NBU/ACB/MESG",
        notes: bullets(
          "Craft Master",
          "Salvage Officer (BMU)",
          "Range Safety Officer or Range OIC (CRF)",
          "Platoon/Company LCPO (CRF)",
          "Should be qualified up to Patrol Officer (CRF)",
          "DET OIC (CRF/BMU/ACU/ACB)",
          "CDO/SDO",
        ),
      },
      {
        item: "Sea — staff duty (CSG/DESRON/PHIBRON)",
        tier: "unspecified",
        group: "1. Sea Assignments: g. STAFF DUTY (CSG/DESRON/PHIBRON)",
        notes: bullets(
          "SDO",
          "Documented performance in shipboard evolutions/assessments (not just a ship rider)",
        ),
      },
      {
        item: "Shore assignments (all)",
        tier: "unspecified",
        group: "2. Shore Assignments (all)",
        notes: bullets(
          "LCPO/SEL at large training command or Port OPS/Tug Master/Harbor Pilot",
          "Lead Detailer/Special Programs/ECM Tech Ad/Rating Specialist",
          "Learning Center Rating Lead",
          "Recruiting/MEPS SEL",
          "ATG Team Lead",
          "TYCOM",
          "Recruit Division Commander/FQA/Ship LCPO",
          "SDO/CDO",
          "Sailor 360 involvement",
          "Range OIC (CRF)",
          "LCPO/SEL of MESG TEU",
          "Major Command Collateral",
          "MTS is a NETC program. All learning center instructors fall under NETC as TYCOM. Other organizations (ATG/MESG/etc.) although have valid 805A billets, do not fall under NETC as TYCOM and MTS is not a requirement",
          "ATS is an Afloat Training Group Program. Personnel assigned to ATG should qualify ATS if avalible at current command",
        ),
      },
    ],
  ),
];

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
    ...bmAdvancement,
  ],
};
