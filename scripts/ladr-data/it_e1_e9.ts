/**
 * IT (Information Systems Technician) E1-E9 LaDR seed dataset.
 * Verified against the July 2026 IT E1-E9 LaDR (cool.osd.mil). Spec §10.2.
 * applies_to_paygrades = paygrade block(s) where the LaDR lists the item;
 * credentials use the printed "Target Paygrade".
 */
import type { LadrSeed } from "../seed-ladr";
import { considerations } from "./advancement";

// "Considerations for advancement", appended below as advancement_consideration
// milestones — IT CAREER PATH (IW/SW/AW/EXW), i.e. the
// ACTIVE component, pp. 6-8 of it_e1_e9.pdf (sha256
// 6cffc40dae8afb617c951bf8e1ef588f3a6020efc311feb3a44e59f798564640, cover
// "July 2026", career-path pages footed "Revised: May 2025"). The same three
// sections are printed again for TAR and for SELRES with materially different
// text; those are NOT transcribed — see advancement.ts.
const COMPONENT = "IT CAREER PATH (IW/SW/AW/EXW)";
const REVISION = "May 2025";

const itAdvancement = [
  ...considerations(
    {
      step: "E6 to E7",
      paygrade: 7,
      component: COMPONENT,
      seaShore:
        "Sea/Shore assignment considerations: Tours of duty aboard surface units (e.g., DDG/CVN, etc…); expeditionary units (e.g., JCU/NSW); Screened shore assignments (e.g., WHCA, IWTC); or Operational shore assignments (e.g., MOC, NCTAMS, IWTG, CPT, etc…).",
      pageRevision: REVISION,
    },
    [
      {
        item: "Leadership, mission and in-rate technical impact in key leadership positions",
        tier: "fully_qualified",
        notes:
          "Show strong documented leadership, mission and in-rate technical impact while serving in key leadership positions",
      },
      {
        item: "Technical knowledge in assigned billet",
        tier: "fully_qualified",
        notes: "Show strong documented technical knowledge in assigned billet",
      },
      {
        item: "Paygrade commensurate watch/job qualifications",
        tier: "fully_qualified",
        notes:
          "Complete paygrade commensurate watch/job qualifications when available by assignment (e.g., CWO, ISWO, Expeditionary Communicator, Combat System Watch Officer (CSWO), MTS/ATS, JFTOC WATCH SUPE, JFTOCWO, PMCWO, NOCWO, TCCOW, NCCC WO..etc…)",
        examples: [
          "e.g., CWO, ISWO, Expeditionary Communicator, Combat System Watch Officer (CSWO), MTS/ATS, JFTOC WATCH SUPE, JFTOCWO, PMCWO, NOCWO, TCCOW, NCCC WO..etc…",
        ],
      },
      {
        item: "Enlisted Warfare Qualifications (and/or MTS/ATS as instructor)",
        tier: "fully_qualified",
        notes:
          "Complete Enlisted Warfare Qualifications, when available, and/or MTS/ATS if serving as instructor, Afloat Trainer or Accessor at IWTG, or IWTC (e.g., ESWS, EAWS, EIWS, etc…)",
        examples: ["e.g., ESWS, EAWS, EIWS, etc…"],
      },
      {
        item: "Strong operational and/or command-wide impact",
        tier: "best_qualified",
        notes: "Demonstrate strong operational and/or command-wide impact",
      },
      {
        item: "Contribute to IT rating improvement",
        tier: "best_qualified",
        notes:
          "Contribute to IT rating improvement by participating in one or more of the following events: (i.e., OCCSTDs, AERR, MPT, JDTA, TRR, PQS Workshops, etc...)",
        examples: [
          "i.e., OCCSTDs, AERR, MPT, JDTA, TRR, PQS Workshops, etc...",
        ],
      },
      {
        item: "Training Team leader/member with documented impact",
        tier: "best_qualified",
        notes:
          "Serve as a Training Team (e.g., CSTT, 3MTT, DCTT, etc…) leader/member with documented impact, when available",
        examples: ["e.g., CSTT, 3MTT, DCTT, etc…"],
      },
    ],
  ),
  ...considerations(
    {
      step: "E7 to E8",
      paygrade: 8,
      component: COMPONENT,
      seaShore:
        "Sea/Shore assignment considerations: Tours of duty aboard surface units (e.g., LPD/LHA/CVN, etc…); expeditionary units (e.g., JCU/NSW); Screened shore assignments (e.g., WHCA, IWTC); or Operational shore assignments (e.g., MOC, NCTAMS, IWTG, CPT, etc…).",
      pageRevision: REVISION,
    },
    [
      {
        item: "Leadership and technical impact as LCPO or other key leadership position",
        tier: "fully_qualified",
        notes:
          "Show strong documented leadership, mission and in-rate technical impact while serving as a LCPO and/or as assigned to another key leadership position (e.g., Training Manager, Course Manager, Lead Instructor, Lead Assessor, or other key leadership positions",
        examples: [
          "e.g., Training Manager, Course Manager, Lead Instructor, Lead Assessor, or other key leadership positions",
        ],
      },
      {
        item: "Technical knowledge in assigned billet",
        tier: "fully_qualified",
        notes: "Demonstrate technical knowledge in assigned billet",
      },
      {
        item: "Paygrade commensurate watch/job qualifications",
        tier: "fully_qualified",
        notes:
          "Complete paygrade commensurate watch/job qualifications when available by assignment (e.g., CWO, ISWO, Expeditionary Communicator, Combat System Watch Officer (CSWO), JFTOCWO, PMCWO, NCCC WO..etc)",
        examples: [
          "e.g., CWO, ISWO, Expeditionary Communicator, Combat System Watch Officer (CSWO), JFTOCWO, PMCWO, NCCC WO..etc",
        ],
      },
      {
        item: "Enlisted Warfare Qualifications (and/or MTS/ATS as instructor)",
        tier: "fully_qualified",
        notes:
          "Complete Enlisted Warfare Qualifications, when available, and/or MTS/ATS if serving as instructor, Afloat Trainer or Accessor at IWTG, or IWTC",
      },
      {
        item: "Operational and/or command-wide impact",
        tier: "best_qualified",
        notes: "Demonstrate operational and/or command-wide impact",
      },
      {
        item: "Contribute to IT rating improvement",
        tier: "best_qualified",
        notes:
          "Contribute to IT rating improvement by participating in one or more of the following events: (OCCSTDS, AERR, MPT, JDTA, TRR, PQS Workshop, etc.)",
        examples: ["OCCSTDS, AERR, MPT, JDTA, TRR, PQS Workshop, etc."],
      },
      {
        item: "Training Team leader/member with documented impact",
        tier: "best_qualified",
        notes:
          "Serve as a Training Team leader/member with documented impact (e.g., CSTT, 3MTT, DCTT, etc…)",
        examples: ["e.g., CSTT, 3MTT, DCTT, etc…"],
      },
      {
        item: "Lead a significant Command Collateral",
        tier: "best_qualified",
        notes: "Lead a significant Command Collateral with documented impact",
      },
    ],
  ),
  ...considerations(
    {
      step: "E8 to E9",
      paygrade: 9,
      component: COMPONENT,
      seaShore:
        "Sea/Shore assignment considerations: Tours of duty aboard surface units (e.g., LPD/LHA/CVN, etc…); expeditionary units (e.g., JCU/NSW); Screened shore assignments (e.g., WHCA, CIWT, etc…); or Operational shore assignments (e.g., PACFLT, MOC, NCTAMS, IWTG, CPT, etc…).",
      pageRevision: REVISION,
    },
    [
      {
        item: "Leadership and technical impact as DLCPO/BLCPO or other key leadership position",
        tier: "fully_qualified",
        notes:
          "Show strong documented leadership, mission and in-rate technical impact while serving as a DLCPO/BLCPO and/or as assigned to another key leadership position (e.g., Training Manager, Course Manager, Instructor, Assessor, etc…)",
        examples: [
          "e.g., Training Manager, Course Manager, Instructor, Assessor, etc…",
        ],
      },
      {
        item: "Technical knowledge in assigned billet",
        tier: "fully_qualified",
        notes: "Show strong documented technical knowledge in assigned billet",
      },
      {
        item: "Paygrade commensurate watch/job qualifications",
        tier: "fully_qualified",
        notes:
          "Complete paygrade commensurate watch/job qualifications when available by assignment (e.g., CWO, ISWO, Expeditionary Communicator, Combat System Watch Officer (CSWO), MTS/ATS, JFTOC WO, NCCC WO etc…)",
        examples: [
          "e.g., CWO, ISWO, Expeditionary Communicator, Combat System Watch Officer (CSWO), MTS/ATS, JFTOC WO, NCCC WO etc…",
        ],
      },
      {
        item: "Enlisted Warfare Qualifications (and/or MTS/ATS as instructor)",
        tier: "fully_qualified",
        notes:
          "Complete Enlisted Warfare Qualifications, when available, and/or MTS/ATS if serving as instructor, Afloat Trainer or Accessor at IWTG, or IWTC",
      },
      {
        item: "Operational and/or command-wide impact",
        tier: "best_qualified",
        notes: "Demonstrate operational and/or command-wide impact",
      },
      {
        item: "Contribute to IT rating improvement",
        tier: "best_qualified",
        notes:
          "Contribute to IT rating improvement by participating in one or more of the following events: (OCCSTDS, AERR, MPT, JDTA, TRR, PQS Workshop, etc.)",
        examples: ["OCCSTDS, AERR, MPT, JDTA, TRR, PQS Workshop, etc."],
      },
      {
        item: "Training Team leader/member with documented impact",
        tier: "best_qualified",
        notes:
          "Serve as a Training Team leader/member with documented impact (e.g., CSTT, 3MTT, DCTT, etc…)",
        examples: ["e.g., CSTT, 3MTT, DCTT, etc…"],
      },
    ],
  ),
];

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
    ...itAdvancement,
  ],
};
