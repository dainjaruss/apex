/**
 * HM (Hospital Corpsman) E1-E9 LaDR seed dataset.
 * Verified against the July 2026 HM E1-E9 LaDR (cool.osd.mil). Spec §10.2.
 * applies_to_paygrades = paygrade block(s) where the LaDR lists the item;
 * credentials use the printed "Target Paygrade". NEC rows use the LaDR's
 * L-series HM NEC codes with their CIN under detail.course.
 */
import type { LadrSeed } from "../seed-ladr";
import { considerations } from "./advancement";

// "CONSIDERATIONS FOR ADVANCEMENT", appended below as advancement_consideration
// milestones — HM CAREER PATH (active component), pp.
// 2-5 of hm_e1_e9.pdf (sha256 fdbf96d5…e7e7aa — the same hash already recorded
// in document.source_hash below, so this transcription and the existing
// dataset came from the identical issue; cover "July 2026", career-path pages
// footed "Revised: May 2025"). HM prints the section again for SELRES with
// different text; that is NOT transcribed — see advancement.ts.
//
// Unlike IT/BM, HM prints no per-step "Sea/Shore assignment considerations"
// heading. Its sea/shore guidance is rating-level, so detail.sea_shore carries
// the source's own Rating Notes 2 and 4 plus the three "Special Note*"
// paragraphs those notes point at — each kept verbatim under its own source
// numbering rather than spliced together.
//
// NOT transcribed, disclosed here rather than left silent: Rating Note 2's
// accompanying table of no-sea-duty NECs (tabular), and Rating Notes 1, 3 and
// 5 — general board-emphasis doctrine rather than sea/shore guidance (Note 1:
// "Performance in assigned duties should ALWAYS be the primary factor in
// determining selection to the next higher paygrade in alignment with the
// annual Convening Order and Board Precepts."; Note 3: NEC-driven limits on
// career-enhancing opportunities and peer ranking; Note 5: mess/association
// and collateral-duty involvement).
const HM_COMPONENT = "HM CAREER PATH (active component)";
const HM_REVISION = "May 2025";
const HM_SEA_SHORE = [
  "2. HM is a shore-centric rate. The HM rating promotes by rate, not by NEC. Traditional sea shore flow for Hospital Corpsman is 36/36, however, assignment and distribution is typically dictated by billet availability. Many NEC’s within the rating have minimal or no sea duty opportunity while some are sea centric. Many NECs are closed looped which are distributable skillsets of personnel who are projected and assigned to consecutive tours within that NEC skill area. In lieu of traditional sea duty, sailors should refer to the Special Notes* at the end of this document for other opportunities.",
  "4. In the absence of sea duty and OCONUS opportunities Sailors should pursue Sea/Shore special programs or commands that support the Navy and Navy Medicine mission. See Special Notes.",
  "Special Note* Sea Special Programs are considered duties in new ship construction, Fleet Decommissioning and Disestablishment, Naval Special Warfare Development Group, SSN-23, Specialized Research Diving Detachment (SRDD).",
  "Special Note* Serving a tour in a Shore Special Program billet will provide a unique opportunity to serve in one of 26 programs, including Production Recruiter, Recruit Division Commander or Company Chief, serve on the crew of USS CONSTITUTION or on the USS ARIZONA memorial, Detailers, MEPS, on Brig or TPU staff duty, Embassy or Personnel Exchange Program (PEP) assignment, SERE Instructor, and Professional Development Instructor, to name a few. MILPERSMAN article 1306-900 contains a complete list of special programs available.",
  "Special Note* Serving a successful tour in a Navy Medicine billet at training sites, remote sites (i.e., Diego Garcia, San Clemente Island, etc.), flag headquarters duty, White House Medical Unit (WHMO), or the Congressional Office of the Attending Physician provides valuable operational and strategic experience that may be considered favorably for career progression and competitive programs outside the traditional sea/shore rotation.",
].join("\n");

const hmAdvancement = [
  ...considerations(
    {
      step: "E6 to E7",
      paygrade: 7,
      component: HM_COMPONENT,
      seaShore: HM_SEA_SHORE,
      seaShoreScope: "rating",
      preamble:
        "Experience of increased responsibility and complexity in primary Hospital Corpsman or NEC responsibility assignments. Demonstrated impact in non-traditional billets outside of the Hospital Corps (ex. Recruiting, state department, RDC, etc).",
      pageRevision: HM_REVISION,
    },
    [
      {
        item: "Advanced knowledge / known Subject Matter Expert",
        tier: "fully_qualified",
        notes:
          "Must have demonstrated advanced knowledge and be a known Subject Matter Expert.",
      },
      {
        item: "Documented leadership results and impact on command mission",
        tier: "fully_qualified",
        notes:
          "Must have documented results of leadership, demonstrate leadership skills, and impact on command mission within primary duty (may be assigned to medical or non-medical role).",
      },
      {
        item: "Technical expertise on platform served",
        tier: "fully_qualified",
        notes:
          "Must demonstrate technical expertise on platform served with documented impact.",
      },
      {
        item: "Primary Warfare qualification",
        tier: "fully_qualified",
        notes:
          "Must have qualified on primary Warfare (if assigned to a qualifying command and per required timeline). (Currently no availability on T-AH or PRECOM Platforms for warfare qualification).",
        examples: [
          "Currently no availability on T-AH or PRECOM Platforms for warfare qualification",
        ],
      },
      {
        item: "Sustained superior leadership developing HMs/Sailors",
        tier: "fully_qualified",
        notes:
          "Should demonstrate sustained superior leadership and competency in developing HM’s/Sailors/or other services as measured by qualifications, advancement results, retention/attrition, and the extent to which the candidate trains and educates peer/subordinates on technical proficiency.",
      },
      {
        item: "Sailor of the Year finalist at Echelon 2/3",
        tier: "best_qualified",
        notes:
          "Consideration should be given to SOY finalists at Echelon 2 and Echelon 3 (i.e. winners at : NMFL, NMFP, NMFDC, NSW Group, MARFORCOM/PAC, SURFPAC/LANT, AIRPAC/LANT, SUBLANT/PAC, NECC, CNIC Regions, NAVIFOR, NETC).",
        examples: [
          "i.e. winners at : NMFL, NMFP, NMFDC, NSW Group, MARFORCOM/PAC, SURFPAC/LANT, AIRPAC/LANT, SUBLANT/PAC, NECC, CNIC Regions, NAVIFOR, NETC",
        ],
      },
      {
        item: "Qualifications outside normal job scope/rate",
        tier: "best_qualified",
        notes:
          "Consideration should be given for those who earn qualifications outside their normal job scope/rate to enhance unit mission readiness. Some examples include but NOT limited to: OOD-U/W, SSL, ATTWO, COW, DOOW, PILOT, MTT, 3MC, DCTT, CONN, SCUBA Supervisor, Air Diving Supervisor, Jump Master, RSO/Range OIC, etc....",
        examples: [
          "Some examples include but NOT limited to: OOD-U/W, SSL, ATTWO, COW, DOOW, PILOT, MTT, 3MC, DCTT, CONN, SCUBA Supervisor, Air Diving Supervisor, Jump Master, RSO/Range OIC, etc....",
        ],
      },
      {
        item: "Instructor NEC with ATS or MTS qualification",
        tier: "best_qualified",
        notes:
          // Parent bullet ends without punctuation in the source; the sub-bullet
          // stays on its own line rather than being joined with an invented ".".
          "Consideration should be given for candidates with the instructor NEC who have qualified for Afloat Training Specialist or Master Training Specialist\nFailure of enlisted personnel to obtain MTS qualification when a valid program does not exist shall not be interpreted as an indication of unsatisfactory or adverse leadership.",
      },
      {
        item: "Challenging duty or special program assignment",
        tier: "best_qualified",
        notes:
          "Consideration should be given to personnel assigned to challenging duty or special program assignments with document impact to mission.",
      },
      {
        item: "Professional certification/licensure",
        tier: "best_qualified",
        notes:
          "Consideration should be given to those who have professional certification/licensure, especially if aligned with NEC or rating.",
      },
      {
        item: "Lead/facilitate professional or personal development programs",
        tier: "best_qualified",
        notes:
          "Consideration should be given to those who lead and facilitate professional or personal development programs.",
      },
      {
        item: "Rank-specific mess or FCPOA position",
        tier: "best_qualified",
        notes:
          "Consideration should be given to those who hold rank specific mess or FCPOA position with impact to command morale and welfare.",
      },
      {
        item: "Documented impact in process improvement",
        tier: "best_qualified",
        notes:
          "Consideration should be given to those with documented impact in process improvement.",
      },
    ],
  ),
  ...considerations(
    {
      step: "E7 to E8",
      paygrade: 8,
      component: HM_COMPONENT,
      seaShore: HM_SEA_SHORE,
      seaShoreScope: "rating",
      preamble:
        "Experience of increased responsibility and complexity in primary assignments to include demonstration in non-traditional billet.",
      pageRevision: HM_REVISION,
    },
    [
      {
        item: "Preceding E7 FULLY QUALIFIED criteria",
        tier: "fully_qualified",
        notes: "Must meet preceding E7 FULLY QUALIFIED criteria.",
      },
      {
        item: "CPO-LDC completed",
        tier: "fully_qualified",
        notes: "Must have completed CPO-LDC.",
      },
      {
        item: "Ability to lead Chiefs and develop Junior Officers",
        tier: "fully_qualified",
        notes:
          "Must have demonstrated the ability to lead Chiefs, and develop Junior Officers.",
      },
      {
        item: "Preceding E7 BEST QUALIFIED criteria",
        tier: "best_qualified",
        notes: "Consideration of preceding E7 BEST QUALIFIED criteria.",
      },
      {
        item: "Billeted CSEL position under a Milestone CO",
        tier: "best_qualified",
        notes:
          "Special Consideration should be given to those filling billeted CSEL positions under Milestone COs.",
      },
      {
        item: "Rating involvement in rating modernization functions",
        tier: "best_qualified",
        notes:
          "Consideration should be given to HMs who demonstrate rating involvement through participation in important rating modernization functions, including but not limited to: Occupational Standards Review, PQS Development, Selection Board, Navy Tactics Techniques and Procedures Revisions, Naval Publication revisions, Joint Publication Revisions, Advancement Exam Readiness Review, Course Curriculum Development, Rating Strategy Councils, NEC Enlisted Technical Leader, Defense Committee on Trauma, Executive Medical Department Enlisted Course (EMDEC) Facilitation and Training.",
        examples: [
          "including but not limited to: Occupational Standards Review, PQS Development, Selection Board, Navy Tactics Techniques and Procedures Revisions, Naval Publication revisions, Joint Publication Revisions, Advancement Exam Readiness Review, Course Curriculum Development, Rating Strategy Councils, NEC Enlisted Technical Leader, Defense Committee on Trauma, Executive Medical Department Enlisted Course (EMDEC) Facilitation and Training",
        ],
      },
      {
        item: "Challenging duty and special duty assignment",
        tier: "best_qualified",
        notes:
          "Consideration should be given to personnel assigned to challenging duty and special duty assignments with document impact to mission.",
      },
      {
        item: "ELD Facilitator with documented impact",
        tier: "best_qualified",
        notes:
          "Consideration should be given to ELD-Facilitators with documented impact.",
      },
      {
        item: "TCCC Instructor with documented impact",
        tier: "best_qualified",
        notes:
          "Consideration should be given to TCCC-Instructors with documented impact.",
      },
      {
        item: "Facilitating/instructing continuing medical education",
        tier: "best_qualified",
        notes:
          "Consideration for those who seek out and perform duties in facilitating and instructing continuing medical education with documented impact.",
      },
      {
        item: "Selected to lead CPO Initiation or committee",
        tier: "best_qualified",
        notes:
          "Consideration for those selected to lead CPO Initiation or committee.",
      },
      {
        item: "Mess or CPOA position contributing to morale and welfare",
        tier: "best_qualified",
        notes:
          "Consideration for those who hold a mess or CPOA position with impact to contributing to command morale and welfare.",
      },
    ],
  ),
  ...considerations(
    {
      step: "E8 to E9",
      paygrade: 9,
      component: HM_COMPONENT,
      seaShore: HM_SEA_SHORE,
      seaShoreScope: "rating",
      preamble:
        "Proven ability to lead and direct junior enlisted, chiefs, officers and civilians in tough, highly visible, and challenging environments.",
      pageRevision: HM_REVISION,
    },
    [
      {
        item: "Preceding E8 FULLY QUALIFIED criteria",
        tier: "fully_qualified",
        notes: "Must meet preceding E8 FULLY QUALIFIED criteria.",
      },
      {
        item: "Senior Enlisted Academy completed",
        tier: "fully_qualified",
        notes: "Must have completed Senior Enlisted Academy.",
      },
      {
        item: "Ability to lead Chiefs, Senior Chiefs and develop Officers",
        tier: "fully_qualified",
        notes:
          "Must have demonstrated the ability to lead Chiefs, Senior Chiefs, and develop Officers.",
      },
      {
        item: "Documented progression in leadership roles",
        tier: "fully_qualified",
        notes:
          "Must have documented progression in leadership roles, with documented impact. (i.e. Div LCPO to Dept LCPO, Bn LCPO to Regt SEL etc)",
        examples: ["i.e. Div LCPO to Dept LCPO, Bn LCPO to Regt SEL etc"],
      },
      {
        item: "Preceding E8 BEST QUALIFIED criteria",
        tier: "best_qualified",
        notes: "Consideration of preceding E8 BEST QUALIFIED criteria.",
      },
      {
        item: "Billeted CSEL position under a Milestone CO",
        tier: "best_qualified",
        notes:
          "Special Consideration should be given to those filling billeted CSEL positions under Milestone COs.",
      },
      {
        item: "Executive Medical Department Enlisted Course (EMDEC)",
        tier: "best_qualified",
        notes:
          "Consideration should be given to those who have completed Executive Medical Department Enlisted Course (EMDEC).",
      },
      {
        item: "DHA Intermediate Executive Skills Course",
        tier: "best_qualified",
        notes:
          "Consideration should be given to those assigned to DHA MTFs who have completed the Defense Health Agency Intermediate Executive Skills Course.",
      },
      {
        item: "Documented completion of the CMC/COB PQS",
        tier: "best_qualified",
        notes:
          "Consideration should be given to those who have documented completion of the CMC/COB PQS. Hospital Corpsmen (HMs) assigned to submarines should be allowed to complete the CMC/COB PQS and apply directly to the CMC Program, bypassing the COB pathway. Sailors serving in a COB role contribute to a strain on undermanned HM skillsets. However, Sailors selected for the CMC program do not impact manning levels, as their rating is officially changed.",
      },
    ],
  ),
];

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
      item: 'Hospital Corpsman Basic ("A" School)',
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
    ...hmAdvancement,
  ],
};
