/**
 * APEX Stress Test Seed Script
 * Generates 19 realistic test users across 5 roles (all @franklyn.dev) and 35 detailed
 * evaluations with rich, quantifiable Navy Block 43 performance comments to stress test
 * the evaluation routing, validation, and summary group systems.
 *
 * Usage: npm run db:seed-stress [-- --reset]
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  buildValidEval,
  FORM_DEFINITION_ID,
} from "../tests/fixtures/validEval";
import { Evaluation } from "../types";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), file);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m && !process.env[m[1].trim()])
        process.env[m[1].trim()] = m[2].trim();
    }
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.STRESS_TEST_PASSWORD || "NavyEval!2026";

if (!url || !serviceKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const reset = process.argv.includes("--reset");

const STRESS_COMMANDS = [
  {
    uic: "12345",
    command_name: "USS NEVERSAIL",
    command_type: "SHIP",
    region: "ATLANTIC",
    active: true,
  },
  {
    uic: "54321",
    command_name: "USS ENTERPRISE",
    command_type: "SHIP",
    region: "PACIFIC",
    active: true,
  },
  {
    uic: "67890",
    command_name: "NAVAL HOSPITAL ROTOTA",
    command_type: "SHORE",
    region: "EUROPE",
    active: true,
  },
];

const STRESS_USERS = [
  // 1. IT1 Group (USS ENTERPRISE - uic: 54321)
  {
    email: "it1.sailor@franklyn.dev",
    role: "Sailor",
    firstName: "JOHN",
    lastName: "REYNOLDS",
    mi: "D",
    dodId: "1000000001",
    rank: "IT1",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "it1.alpha@franklyn.dev",
    role: "Sailor",
    firstName: "ALEXANDER",
    lastName: "VANCE",
    mi: "A",
    dodId: "1000000011",
    rank: "IT1",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "it1.bravo@franklyn.dev",
    role: "Sailor",
    firstName: "BENJAMIN",
    lastName: "CROSS",
    mi: "B",
    dodId: "1000000012",
    rank: "IT1",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "it1.charlie@franklyn.dev",
    role: "Sailor",
    firstName: "CHLOE",
    lastName: "BENNETT",
    mi: "C",
    dodId: "1000000013",
    rank: "IT1",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },

  // 2. ET2 Group (USS NEVERSAIL - uic: 12345)
  {
    email: "et2.sailor@franklyn.dev",
    role: "Sailor",
    firstName: "MICHAEL",
    lastName: "CHANG",
    mi: "T",
    dodId: "1000000002",
    rank: "ET2",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },
  {
    email: "et2.alpha@franklyn.dev",
    role: "Sailor",
    firstName: "ANNA",
    lastName: "SOKOLOV",
    mi: "A",
    dodId: "1000000014",
    rank: "ET2",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },
  {
    email: "et2.bravo@franklyn.dev",
    role: "Sailor",
    firstName: "BRANDON",
    lastName: "STARK",
    mi: "B",
    dodId: "1000000015",
    rank: "ET2",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },
  {
    email: "et2.charlie@franklyn.dev",
    role: "Sailor",
    firstName: "CARMEN",
    lastName: "SANTIAGO",
    mi: "C",
    dodId: "1000000016",
    rank: "ET2",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },

  // 3. CTR1 Group (USS ENTERPRISE - uic: 54321)
  {
    email: "ctr1.sailor@franklyn.dev",
    role: "Sailor",
    firstName: "SARAH",
    lastName: "CONNOR",
    mi: "A",
    dodId: "1000000003",
    rank: "CTR1",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "ctr1.alpha@franklyn.dev",
    role: "Sailor",
    firstName: "AARON",
    lastName: "HOTCHNER",
    mi: "A",
    dodId: "1000000017",
    rank: "CTR1",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "ctr1.bravo@franklyn.dev",
    role: "Sailor",
    firstName: "BLAKE",
    lastName: "LIVELY",
    mi: "B",
    dodId: "1000000018",
    rank: "CTR1",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "ctr1.charlie@franklyn.dev",
    role: "Sailor",
    firstName: "CLARK",
    lastName: "KENT",
    mi: "C",
    dodId: "1000000019",
    rank: "CTR1",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },

  // 4. FC2 Group (USS NEVERSAIL - uic: 12345)
  {
    email: "fc2.sailor@franklyn.dev",
    role: "Sailor",
    firstName: "DAVID",
    lastName: "MILLER",
    mi: "R",
    dodId: "1000000004",
    rank: "FC2",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },
  {
    email: "fc2.alpha@franklyn.dev",
    role: "Sailor",
    firstName: "ALICE",
    lastName: "HYDE",
    mi: "A",
    dodId: "1000000020",
    rank: "FC2",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },
  {
    email: "fc2.bravo@franklyn.dev",
    role: "Sailor",
    firstName: "BRUCE",
    lastName: "WAYNE",
    mi: "B",
    dodId: "1000000021",
    rank: "FC2",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },
  {
    email: "fc2.charlie@franklyn.dev",
    role: "Sailor",
    firstName: "CARA",
    lastName: "DUNE",
    mi: "C",
    dodId: "1000000022",
    rank: "FC2",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },

  // 5. HM1 Group (NAVAL HOSPITAL ROTOTA - uic: 67890)
  {
    email: "hm1.sailor@franklyn.dev",
    role: "Sailor",
    firstName: "EMILY",
    lastName: "DAVIS",
    mi: "L",
    dodId: "1000000005",
    rank: "HM1",
    uic: "67890",
    cmd: "NAVAL HOSPITAL ROTOTA",
  },
  {
    email: "hm1.alpha@franklyn.dev",
    role: "Sailor",
    firstName: "ADAM",
    lastName: "TRUITT",
    mi: "A",
    dodId: "1000000023",
    rank: "HM1",
    uic: "67890",
    cmd: "NAVAL HOSPITAL ROTOTA",
  },
  {
    email: "hm1.bravo@franklyn.dev",
    role: "Sailor",
    firstName: "BEATRICE",
    lastName: "PRIOR",
    mi: "B",
    dodId: "1000000024",
    rank: "HM1",
    uic: "67890",
    cmd: "NAVAL HOSPITAL ROTOTA",
  },
  {
    email: "hm1.charlie@franklyn.dev",
    role: "Sailor",
    firstName: "CALEB",
    lastName: "RIVERS",
    mi: "C",
    dodId: "1000000025",
    rank: "HM1",
    uic: "67890",
    cmd: "NAVAL HOSPITAL ROTOTA",
  },

  // 6. BM3 Group (USS ENTERPRISE - uic: 54321)
  {
    email: "bm3.sailor@franklyn.dev",
    role: "Sailor",
    firstName: "ROBERT",
    lastName: "WILSON",
    mi: "J",
    dodId: "1000000006",
    rank: "BM3",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "bm3.alpha@franklyn.dev",
    role: "Sailor",
    firstName: "DANIEL",
    lastName: "BOONE",
    mi: "A",
    dodId: "1000000026",
    rank: "BM3",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "bm3.bravo@franklyn.dev",
    role: "Sailor",
    firstName: "ELENA",
    lastName: "ROSTOVA",
    mi: "B",
    dodId: "1000000027",
    rank: "BM3",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "bm3.charlie@franklyn.dev",
    role: "Sailor",
    firstName: "FINN",
    lastName: "COLLINS",
    mi: "C",
    dodId: "1000000028",
    rank: "BM3",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },

  // 7. MM2 Group (USS NEVERSAIL - uic: 12345)
  {
    email: "mm2.sailor@franklyn.dev",
    role: "Sailor",
    firstName: "JAMES",
    lastName: "TAYLOR",
    mi: "P",
    dodId: "1000000007",
    rank: "MM2",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },
  {
    email: "mm2.alpha@franklyn.dev",
    role: "Sailor",
    firstName: "GREGORY",
    lastName: "HOUSE",
    mi: "A",
    dodId: "1000000029",
    rank: "MM2",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },
  {
    email: "mm2.bravo@franklyn.dev",
    role: "Sailor",
    firstName: "HANNAH",
    lastName: "MARIN",
    mi: "B",
    dodId: "1000000030",
    rank: "MM2",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },
  {
    email: "mm2.charlie@franklyn.dev",
    role: "Sailor",
    firstName: "IAN",
    lastName: "MALCOLM",
    mi: "C",
    dodId: "1000000031",
    rank: "MM2",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },

  // 8. OS1 Group (USS ENTERPRISE - uic: 54321)
  {
    email: "os1.sailor@franklyn.dev",
    role: "Sailor",
    firstName: "JESSICA",
    lastName: "MARTINEZ",
    mi: "M",
    dodId: "1000000008",
    rank: "OS1",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "os1.alpha@franklyn.dev",
    role: "Sailor",
    firstName: "JACK",
    lastName: "BAUER",
    mi: "A",
    dodId: "1000000032",
    rank: "OS1",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "os1.bravo@franklyn.dev",
    role: "Sailor",
    firstName: "KATHERINE",
    lastName: "PIERCE",
    mi: "B",
    dodId: "1000000033",
    rank: "OS1",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "os1.charlie@franklyn.dev",
    role: "Sailor",
    firstName: "LUCAS",
    lastName: "SCOTT",
    mi: "C",
    dodId: "1000000034",
    rank: "OS1",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },

  // 9. GM2 Group (USS NEVERSAIL - uic: 12345)
  {
    email: "gm2.sailor@franklyn.dev",
    role: "Sailor",
    firstName: "WILLIAM",
    lastName: "ANDERSON",
    mi: "K",
    dodId: "1000000009",
    rank: "GM2",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },
  {
    email: "gm2.alpha@franklyn.dev",
    role: "Sailor",
    firstName: "MARCUS",
    lastName: "BRODY",
    mi: "A",
    dodId: "1000000035",
    rank: "GM2",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },
  {
    email: "gm2.bravo@franklyn.dev",
    role: "Sailor",
    firstName: "NANCY",
    lastName: "WHEELER",
    mi: "B",
    dodId: "1000000036",
    rank: "GM2",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },
  {
    email: "gm2.charlie@franklyn.dev",
    role: "Sailor",
    firstName: "OLIVER",
    lastName: "QUEEN",
    mi: "C",
    dodId: "1000000037",
    rank: "GM2",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },

  // 10. CS3 Group (USS ENTERPRISE - uic: 54321)
  {
    email: "cs3.sailor@franklyn.dev",
    role: "Sailor",
    firstName: "DANIEL",
    lastName: "THOMAS",
    mi: "S",
    dodId: "1000000010",
    rank: "CS3",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "cs3.alpha@franklyn.dev",
    role: "Sailor",
    firstName: "PETER",
    lastName: "PARKER",
    mi: "A",
    dodId: "1000000038",
    rank: "CS3",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "cs3.bravo@franklyn.dev",
    role: "Sailor",
    firstName: "QUINN",
    lastName: "FABRAY",
    mi: "B",
    dodId: "1000000039",
    rank: "CS3",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "cs3.charlie@franklyn.dev",
    role: "Sailor",
    firstName: "RACHEL",
    lastName: "GREEN",
    mi: "C",
    dodId: "1000000040",
    rank: "CS3",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },

  // Raters (E-7 / CPO)
  {
    email: "rater.it@franklyn.dev",
    role: "Rater",
    firstName: "ALAN",
    lastName: "RAY",
    mi: "M",
    dodId: "2000000001",
    rank: "ITC",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "rater.et@franklyn.dev",
    role: "Rater",
    firstName: "BRIAN",
    lastName: "KING",
    mi: "W",
    dodId: "2000000002",
    rank: "ETC",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },
  {
    email: "rater.hm@franklyn.dev",
    role: "Rater",
    firstName: "CAROL",
    lastName: "WRIGHT",
    mi: "E",
    dodId: "2000000003",
    rank: "HMC",
    uic: "67890",
    cmd: "NAVAL HOSPITAL ROTOTA",
  },

  // Senior Raters (E-8 / JO)
  {
    email: "senior.rater1@franklyn.dev",
    role: "Senior Rater",
    firstName: "BETTY",
    lastName: "SMITH",
    mi: "L",
    dodId: "3000000001",
    rank: "ITCS",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "senior.rater2@franklyn.dev",
    role: "Senior Rater",
    firstName: "RICHARD",
    lastName: "SCOTT",
    mi: "H",
    dodId: "3000000002",
    rank: "ETCS",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },

  // Reporting Seniors (CO / XO / CDR / CAPT)
  {
    email: "co.enterprise@franklyn.dev",
    role: "Reporting Senior",
    firstName: "CARL",
    lastName: "JONES",
    mi: "R",
    dodId: "4000000001",
    rank: "CDR",
    uic: "54321",
    cmd: "USS ENTERPRISE",
  },
  {
    email: "co.neversail@franklyn.dev",
    role: "Reporting Senior",
    firstName: "EDWARD",
    lastName: "NIMITZ",
    mi: "C",
    dodId: "4000000002",
    rank: "CAPT",
    uic: "12345",
    cmd: "USS NEVERSAIL",
  },
  {
    email: "co.hospital@franklyn.dev",
    role: "Reporting Senior",
    firstName: "FLORENCE",
    lastName: "NIGHTINGALE",
    mi: "N",
    dodId: "4000000003",
    rank: "CAPT",
    uic: "67890",
    cmd: "NAVAL HOSPITAL ROTOTA",
  },

  // Admin
  {
    email: "admin.stress@franklyn.dev",
    role: "Admin",
    firstName: "APEX",
    lastName: "ADMIN",
    mi: "X",
    dodId: "5000000001",
    rank: "CAPT",
    uic: "00000",
    cmd: "NAVY PERSONNEL COMMAND",
  },
] as const;

// Detailed Block 43 Performance Comments templates (Navy bullet format)
const BLOCK_43_TEMPLATES = [
  // IT Examples
  {
    rate: "IT1",
    comments: `*** PHENOMENAL LEADER AND TECHNICAL EXPERT. ALREADY PERFORMING AT THE CPO LEVEL! ***
- CYBERSECURITY CHAMPION. Managed 18 tenant command STIG checklists and executed 10,721 rigorous vulnerability scans across 4 shipboard domains, achieving an unprecedented 99.8% network uptime for C7F mission-critical systems and zero cyber breaches during RIMPAC 2025.
- PROJECT MASTERMIND. Expertly led 14 Sailors in the $2.4M CND suite upgrade and the removal of legacy EHF equipment ahead of schedule; his technical acumen was critical to securing Okinawa ONE-NET Authority to Operate (ATO) with zero discrepancies.
- COMMAND IMPACT. As primary PKI Trusted Agent, oversaw inventory and issuance of 145 SIPR tokens and 310 PIN resets. As FCPOA Vice President, organized 6 command-wide community relations events and mentored 8 Junior Sailors to advancement.
*** READY FOR IMMEDIATE ADVANCEMENT TO CHIEF PETTY OFFICER! ***`,
  },
  {
    rate: "IT2",
    comments: `*** AN EXCEPTIONAL TECHNICIAN AND PROVEN DECKPLATE LEADER! ***
- MISSION EQUIPPED. Supervised 6 technicians in the daily operation and maintenance of ADNS, CANES, and GCCS-M systems; resolved 43 complex network outages, reducing division maintenance backlog by 40% and ensuring uninterrupted C2 communications for Strike Group 5.
- DEDICATED MENTOR. Personally trained 12 watchstanders in tactical communications and encryption handling, resulting in a 100% qualification pass rate during INSURV and raising work center productivity by 35%.
- INSTITUTIONAL VALUE. Served as Command Indoctrination Coordinator, facilitating onboarding for 112 new check-ins. Dedicated 45 hours to CPO-365 and command morale initiatives.
*** PROMOTE TO PETTY OFFICER FIRST CLASS AT FIRST OPPORTUNITY! ***`,
  },
  // ET Examples
  {
    rate: "ET1",
    comments: `*** TOP-TIER ELECTRONICS TECHNICIAN. SUPERB TECHNICAL AND LEADERSHIP ABILITY! ***
- TECHNICAL AUTHORITY. Performed 85 high-complexity component-level repairs on AN/SPS-48G radar and WSC-6 satellite terminals with zero reworks, saving over $140K in depot-level repair costs and contributing to a 35% reduction in combat systems maintenance backlog.
- LEADERSHIP IN ACTION. As LPO, led 18 technicians through READ-E 6 and 254 3M spot checks with a 98.4% pass rate. Trained 8 Sailors on F/A-18 Generating Converter Unit repairs, increasing work center qualification depth by 50%.
- WHOLE SAILOR. As DAPA, conducted 14 preventative training sessions for 230 personnel. Actively engaged in FCPOA leadership, driving mentorship initiatives across the engineering department.
*** A MUST PROMOTE TO CHIEF PETTY OFFICER! ***`,
  },
  {
    rate: "ET2",
    comments: `*** VERSATILE AND HIGHLY RELIABLE TECHNICIAN. THE DRIVING FORCE OF THE DIVISION! ***
- EXPERT MAINTAINER. Executed 140 preventative maintenance checks and resolved 23 critical outages on CANES and HF communications suites, maintaining 99.5% mission availability throughout a 7-month WESTPAC deployment.
- FORCE MULTIPLIER. Mentored 5 junior technicians through basic electronics troubleshooting and 3M qualifications, resulting in 3 advancements and zero safety violations during the assessment cycle.
- COMMAND ENGAGED. Dedicated 60 hours as Command Fitness Leader, assisting 14 Sailors in elevating their PFA scores from Satisfactory to Excellent.
*** READY FOR ADVANCEMENT TO FIRST CLASS PETTY OFFICER! ***`,
  },
  // CTR Examples
  {
    rate: "CTR1",
    comments: `*** THE PREMIER CRYPTOLOGIC TACTICIAN IN THE STRIKE GROUP. UNMATCHED PROFICIENCY! ***
- OPERATIONAL EXCELLENCE. As SSES LPO, directed 24 analysts across 2,890 hours of tactical collection and 6 CASREP repairs; directly reflected in the division's flawless score during the Division in the Spotlight (DITS) inspection and Type Commander certification.
- MENTORSHIP & TRAINING. Led 12 tactical cryptologic scenarios for combat readiness training; mentored 4 JOs through 18 SWO PQSs and qualified 14 analysts, significantly enhancing watch floor operational readiness.
- SUBJECT MATTER EXPERT. Requested by name by adjacent command to assist with ATG CRY 2.1 inspections; provided comprehensive training that yielded an 88% qualification pass rate across 3 visiting crews.
*** A STAR PERFORMER. PROMOTE TO CHIEF PETTY OFFICER NOW! ***`,
  },
  {
    rate: "CTR2",
    comments: `*** OUTSTANDING TACTICAL ANALYST. DELIVERS CONSISTENT, SUPERIOR RESULTS! ***
- MISSION IMPACT. Processed over 1,400 time-sensitive signal intelligence reports and supervised 8 watchstanders during high-tempo 5th Fleet operations, directly supporting joint task force targeting objectives.
- SKILL BUILDER. Qualified 6 junior analysts in national reporting criteria and tactical SIGINT exploitation, elevating watch team efficiency by 25% during major naval exercises.
- COMMUNITY LEADER. Organized 4 MWR fundraising events raising $3,200 for command morale; dedicated 30 hours to local community service projects.
*** PROMOTE TO FIRST CLASS PETTY OFFICER NOW! ***`,
  },
  // FC Examples
  {
    rate: "FC1",
    comments: `*** PHENOMENAL COMBAT SYSTEMS LEADER. THE BACKBONE OF STRIKE WARFARE! ***
- COMBAT READINESS. Organized strike warfare training for 38 combat systems and bridge watchstanders, elevating offensive mission readiness and earning the command's Top Tactical Team award for deployment.
- COMPLEX CASUALTY REPAIR. Supervised 8 VLS technicians through 5 major deluge system casualties and 400 maintenance actions; completed all repairs 4 days ahead of schedule, enabling successful 96-cell ammo onload.
- PROGRAM MANAGER. Managed Repair Division's 254 material checks and a 100% effective Gas Free Engineering program for READ-E 6, achieving the highest score in the Weapons Department.
*** ALREADY PERFORMING AS A CPO. PROMOTE IMMEDIATELY! ***`,
  },
  {
    rate: "FC2",
    comments: `*** HIGHLY SKILLED FIRE CONTROLMAN AND INSPIRING DECKPLATE LEADER! ***
- TACTICAL EXECUTION. Maintained AEGIS Weapon System Mark 99 Fire Control System, executing 80 preventative maintenance actions and 14 corrective repairs with zero mission degradation during Bold Alligator 2025.
- TEAM DEVELOPER. Mentored 4 junior technicians in radar calibration and alignment procedures, directly contributing to 2 advancements and 100% work center qualification completion.
- COMMAND CITIZEN. Active member of the Second Class Petty Officer Association; coordinated command sponsorship program for 15 incoming weapons department personnel.
*** READY FOR FIRST CLASS PETTY OFFICER! ***`,
  },
  // HM Examples
  {
    rate: "HM1",
    comments: `*** THE DEFINITION OF DECKPLATE LEADERSHIP AND CLINICAL EXCELLENCE! ***
- CLINICAL AUTHORITY. As Leading Petty Officer of a 32-bed inpatient ward, supervised 28 Corpsmen and nurses in delivering flawless care to 1,400 patients, achieving a 98% patient satisfaction rating and zero clinical medication errors.
- INSPIRING MENTOR. Personally qualified 92 personnel across 55 critical watch stations; his rigorous mentorship directly produced 9 command advancements, 2 Blue Jackets of the Quarter, and 3 BMED qualifications.
- MISSION SUPPORT. Provided invaluable training on deployment re-integration, operational medicine, and suicide awareness to 178 Sailors, significantly elevating command welfare and medical readiness.
*** AN ABSOLUTE MUST PROMOTE TO CHIEF PETTY OFFICER! ***`,
  },
  {
    rate: "HM2",
    comments: `*** COMPASSIONATE CAREGIVER AND OUTSTANDING MEDICAL TECHNICIAN! ***
- PATIENT CARE FIRST. Managed daily clinical triage and minor procedures for 450 active duty personnel; maintained 99.4% medical readiness across 4 tenant commands with zero administrative discrepancies.
- TRAINING CHAMPION. Instructed 44 command personnel in Tactical Combat Casualty Care (TCCC) and BLS, increasing command deployability metrics by 18% in 6 months.
- DEVOTED SHIPMATE. Dedicated 40 hours as Assistant Command Fitness Leader and actively supported the Command Heritage Committee.
*** PROMOTE TO HOSPITAL CORPSMAN FIRST CLASS! ***`,
  },
  // BM, MM, OS, GM, CS, YN, PS, LS, STG, EOD Examples
  {
    rate: "BM1",
    comments: `*** THE MASTER OF THE DECKPLATE. SUPERIOR SEAMANSHIP AND LEADERSHIP! ***
- DECK DIVISION LPO. Directed 34 Boatswain's Mates across 12 UNREP evolutions, 45 flight deck operations, and 600 hours of small boat operations in 6th Fleet with zero safety mishaps or equipment damage.
- MATERIAL READINESS. Supervised the preservation and maintenance of 14 anchors, 8 winches, and 2 cranes; his rigorous 3M oversight resulted in an outstanding 96% score during the Type Commander assessment.
- MENTORSHIP. Guided 14 junior Sailors to surface warfare qualifications and 5 advancements; organized command-wide seamanship training for 120 watchstanders.
*** ADVANCE TO CHIEF PETTY OFFICER IMMEDIATELY! ***`,
  },
  {
    rate: "MM1",
    comments: `*** AN ENGINEERING POWERHOUSE. THE HEARTBEAT OF MAIN PROPULSION! ***
- TECHNICAL MASTERMIND. Led 22 machinists in the overhaul of 2 main propulsion lube oil pumps and 6 fire pumps, saving over $85K in contractor costs and ensuring 100% propulsion reliability during deployment.
- QUALITY ASSURANCE. As Quality Assurance Inspector, reviewed and certified 145 controlled work packages with zero rework; led division to a 97% pass rate during Engineering Certification (ENCERT).
- LEADER & MENTOR. Qualified 8 Engineering Officer of the Watch (EOOW) candidates and mentored 6 junior Sailors to promotion. Active FCPOA departmental representative.
*** READY FOR CHIEF PETTY OFFICER TODAY! ***`,
  },
  {
    rate: "OS1",
    comments: `*** THE EYE OF THE FLEET. SUPERIOR COMBAT INFORMATION CENTER LEADER! ***
- TACTICAL PRO. Directed 18 Operations Specialists during 1,200 hours of intense CIC watchstanding in 5th Fleet; expertly tracked 4,500 air and surface contacts, ensuring zero safety of navigation incidents.
- TRAINING AUTHORITY. As CIC Training Officer, executed 45 combat scenarios and qualified 12 Air Intercept Controllers and 8 Surface Watch Officers, dramatically increasing watch team tactical depth.
- COMMAND ENGAGEMENT. Served as Command MWR Coordinator, planning 8 port-visit morale events for a crew of 350 Sailors.
*** A PHENOMENAL LEADER. PROMOTE TO CHIEF NOW! ***`,
  },
  {
    rate: "GM2",
    comments: `*** AN EXCEPTIONAL GUNNER'S MATE. RIGOROUS WEAPONS SAFETY AND EXPERTISE! ***
- WEAPONS READINESS. Maintained two Mk 38 25mm machine guns and sixteen .50 caliber mounts; executed 180 maintenance checks and expended 14,000 rounds during qualification shoots with zero mishaps.
- ARMORY SUPERVISOR. Managed inventory and issue of 240 small arms and $1.2M in ordnance; achieved a flawless 100% accountability score during the explosive safety inspection.
- MENTOR. Qualified 45 command personnel in small arms proficiency and mentored 3 junior GMs through 3M qualifications.
*** READY FOR FIRST CLASS PETTY OFFICER! ***`,
  },
  {
    rate: "CS2",
    comments: `*** CULINARY EXCELLENCE AND HIGH-ENERGY DECKPLATE LEADERSHIP! ***
- FOOD SERVICE PRO. Supervised 12 Culinary Specialists in the preparation of over 135,000 nutritious, high-quality meals during deployment, maintaining a 98% customer satisfaction rating across the crew.
- FISCAL RESPONSIBILITY. Managed a $450K subsistence inventory with an astounding 0.02% error margin, earning the command consecutive five-star accreditation awards from NEY inspection teams.
- TEAM BUILDER. Mentored 4 junior CSs in culinary techniques and sanitation standards, resulting in 100% qualification completion and 2 advancements.
*** PROMOTE TO FIRST CLASS PETTY OFFICER NOW! ***`,
  },
  {
    rate: "YN1",
    comments: `*** THE ADMINISTRATIVE ENGINE OF THE COMMAND. FLAWLESS EXECUTION! ***
- ADMIN LPO. Supervised 8 Yeomen in processing over 2,400 official correspondence packages, 350 awards, and 420 evaluation reports with a 99.7% accuracy rate and zero PERS-32 rejections.
- CUSTOMER SERVICE. Reduced command administrative processing turnaround time from 14 days to 3 days; conducted 24 command training sessions on Navy correspondence and evaluation drafting rules.
- LEADERSHIP. As FCPOA Secretary, organized 5 career fairs and mentored 10 junior Sailors across staff departments.
*** PERFORMING AT THE CPO LEVEL. PROMOTE IMMEDIATELY! ***`,
  },
  {
    rate: "PS2",
    comments: `*** SUPERIOR PERSONNEL SPECIALIST. UNMATCHED ATTENTION TO DETAIL! ***
- PAY & PERSONNEL. Processed 1,100 pay entitlements, travel claims, and reenlistment bonuses worth over $1.8M with zero payment discrepancies, directly supporting financial readiness for 350 command personnel.
- TRANSACTIONS EXPERT. Resolved 45 complex pay audits and DFAS rejections within 48 hours, earning praise from Navy Pay and Personnel Support Center (NPPSC) leadership.
- COMMAND SUPPORT. Facilitated 18 financial literacy workshops for junior Sailors and contributed 35 hours to command sponsorship initiatives.
*** READY FOR FIRST CLASS PETTY OFFICER! ***`,
  },
  {
    rate: "LS1",
    comments: `*** THE LOGISTICS MASTERMIND OF THE STRIKE GROUP. UNPARALLELED VALUE! ***
- SUPPLY LPO. Managed 14 Logistics Specialists across 4 storerooms, overseeing over 18,000 line items valued at $14.2M; achieved an extraordinary 99.4% inventory validity during the Supply Management Assessment.
- FISCAL STEWARDSHIP. Executed 850 high-priority CASREP requisition orders and saved $210K in OPTAR funds through rigorous cross-deck coordination and asset redistribution.
- DECKPLATE LEADER. Mentored 12 junior LSs to 100% 3M and watchstation qualification; led command FCPOA fundraising committee raising $4,500 for the Navy Ball.
*** PROMOTE TO CHIEF PETTY OFFICER AT FIRST OPPORTUNITY! ***`,
  },
  {
    rate: "STG2",
    comments: `*** TACTICAL SONAR EXPERT AND RELIABLE DECKPLATE LEADER! ***
- ASW READINESS. Maintained AN/SQQ-89A(V)15 sonar suite, performing 110 maintenance requirements and resolving 14 complex sensor casualties; ensured 100% undersea warfare readiness during COMPTUEX.
- TACTICAL ANALYST. Tracked and classified 45 subsurface contacts during multi-national ASW exercises, providing critical firing solutions to the Tactical Action Officer.
- MENTOR. Qualified 5 watchstanders in acoustic analysis and guided 2 junior STGs to advancement. Active member of SCPOA.
*** READY FOR ADVANCEMENT TO STG1! ***`,
  },
  {
    rate: "EOD1",
    comments: `*** EXPLOSIVE ORDNANCE DISPOSAL TACTICIAN. FLAWLESS OPERATIONAL LEADERSHIP! ***
- DETACHMENT LPO. Directed an 8-man EOD mobile detachment through 45 high-risk ordnance clearance evolutions, 18 VIP protective sweeps, and 120 dive hours in 5th Fleet with zero safety incidents.
- TACTICAL EXPERT. Executed the safe render-safe and disposal of 2,500 lbs of hazardous unexploded ordnance (UXO) and improvised explosive devices in support of joint special operations forces.
- MENTOR & TRAINER. Trained 12 team members in advanced demolition and emergency medical procedures; mentored 3 JOs in tactical detachment leadership.
*** PERFORMING AT THE MASTER CHIEF LEVEL. PROMOTE TO CPO NOW! ***`,
  },
];

async function findUserByEmail(email: string) {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
}

async function upsertUser(u: (typeof STRESS_USERS)[number]) {
  const existing = await findUserByEmail(u.email);
  const meta = {
    first_name: u.firstName,
    last_name: u.lastName,
    middle_initial: u.mi,
    dod_id: u.dodId,
    uic: u.uic,
    navy_rank: u.rank,
    command: u.cmd,
    preferred_role: u.role,
  };

  if (existing) {
    await admin.auth.admin.updateUserById(existing.id, {
      password,
      user_metadata: meta,
    });
    await admin
      .from("profiles")
      .update({
        first_name: u.firstName,
        last_name: u.lastName,
        middle_initial: u.mi,
        dod_id: u.dodId,
        uic: u.uic,
        navy_rank: u.rank,
        command: u.cmd,
        preferred_role: u.role,
        assigned_roles: [u.role],
      })
      .eq("id", existing.id);
    console.log(`  updated user ${u.email} (${u.role})`);
    return existing.id;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password,
    email_confirm: true,
    user_metadata: meta,
  });
  if (error) throw new Error(`createUser ${u.email}: ${error.message}`);
  console.log(`  created user ${u.email} (${u.role})`);
  return data.user.id;
}

async function seedCommands() {
  for (const cmd of STRESS_COMMANDS) {
    const { error } = await admin.from("commands").upsert(cmd);
    if (error)
      throw new Error(`commands upsert (${cmd.uic}): ${error.message}`);
    console.log(`  command: ${cmd.command_name} (${cmd.uic})`);
  }
}

async function deleteStressEvals() {
  // Match by the stress users' DoD ID block (10000000xx), not by name: the
  // old '%(STRESS)%' pattern never matched "(STRESS #1)", so resets silently
  // deleted nothing and every reseed stacked 40 more evals into the DB.
  const { data } = await admin
    .from("evaluations")
    .select("id")
    .like("dod_id", "10000000%");
  if (data?.length) {
    const ids = data.map((r) => r.id);
    await admin.from("audit_logs").delete().in("evaluation_id", ids);
    await admin.from("review_approvals").delete().in("evaluation_id", ids);
    await admin.from("evaluations").delete().in("id", ids);
    console.log(`  removed ${ids.length} existing stress test eval(s)`);
  }
  const { data: grps } = await admin
    .from("summary_groups")
    .select("id")
    .like("name", "%Summary Group%");
  if (grps?.length) {
    const gIds = grps.map((g) => g.id);
    await admin.from("summary_groups").delete().in("id", gIds);
    console.log(
      `  removed ${gIds.length} existing stress test summary group(s)`,
    );
  }
}

async function seedStressEvals(users: Record<string, string>) {
  console.log("  creating 10 summary groups (one per rating/paygrade)...");
  const groupMap: Record<string, string> = {}; // rate -> summary_group_id

  const summaryGroupDefs = [
    {
      rate: "IT1",
      rsEmail: "co.enterprise@franklyn.dev",
      cmd: "USS ENTERPRISE",
    },
    { rate: "ET2", rsEmail: "co.neversail@franklyn.dev", cmd: "USS NEVERSAIL" },
    {
      rate: "CTR1",
      rsEmail: "co.enterprise@franklyn.dev",
      cmd: "USS ENTERPRISE",
    },
    { rate: "FC2", rsEmail: "co.neversail@franklyn.dev", cmd: "USS NEVERSAIL" },
    {
      rate: "HM1",
      rsEmail: "co.hospital@franklyn.dev",
      cmd: "NAVAL HOSPITAL ROTOTA",
    },
    {
      rate: "BM3",
      rsEmail: "co.enterprise@franklyn.dev",
      cmd: "USS ENTERPRISE",
    },
    { rate: "MM2", rsEmail: "co.neversail@franklyn.dev", cmd: "USS NEVERSAIL" },
    {
      rate: "OS1",
      rsEmail: "co.enterprise@franklyn.dev",
      cmd: "USS ENTERPRISE",
    },
    { rate: "GM2", rsEmail: "co.neversail@franklyn.dev", cmd: "USS NEVERSAIL" },
    {
      rate: "CS3",
      rsEmail: "co.enterprise@franklyn.dev",
      cmd: "USS ENTERPRISE",
    },
  ];

  for (const def of summaryGroupDefs) {
    const rsId = users[def.rsEmail];
    const groupPayload = {
      name: `${def.rate} Regular EVAL Summary Group (${def.cmd})`,
      reporting_senior_id: rsId,
      period_to: "2026-06-15",
      grade_rate: def.rate,
      promotion_status: "Regular",
      command_employment: `${def.cmd} - OPERATIONAL DUTY`,
      report_type: "EVAL",
      status: "open",
      created_by: rsId,
    };
    const { data: gData, error: gErr } = await admin
      .from("summary_groups")
      .upsert(groupPayload, {
        onConflict:
          "reporting_senior_id,period_to,grade_rate,promotion_status,report_type",
      })
      .select("id")
      .single();
    if (gErr)
      throw new Error(`summary_groups upsert (${def.rate}): ${gErr.message}`);
    groupMap[def.rate] = gData.id;
    console.log(`    -> created/updated: ${groupPayload.name}`);
  }

  const evalsToInsert: Partial<Evaluation>[] = [];

  const stages: Array<{
    stage: Evaluation["routing_stage"];
    status: Evaluation["status"];
    holderRole: string;
  }> = [
    {
      stage: "reporting_senior",
      status: "ready_for_review",
      holderRole: "reportingSenior",
    },
    {
      stage: "senior_rater",
      status: "ready_for_review",
      holderRole: "seniorRater",
    },
    { stage: "rater", status: "ready_for_review", holderRole: "rater" },
    { stage: "sailor", status: "draft", holderRole: "sailor" },
  ];

  const promRecs: Array<Evaluation["promotion_recommendation"]> = [
    "Early Promote",
    "Must Promote",
    "Promotable",
    "Promotable",
  ];

  // Generate 40 diverse evaluations across 10 rates (4 Sailors per rate in each summary group)
  for (let i = 0; i < 40; i++) {
    const rateIdx = Math.floor(i / 4); // 0 to 9
    const slotIdx = i % 4; // 0 to 3 (the 4 Sailors in each rate group)

    const def = summaryGroupDefs[rateIdx];
    const template =
      BLOCK_43_TEMPLATES.find((t) => t.rate === def.rate) ||
      BLOCK_43_TEMPLATES[0];
    const stageInfo = stages[slotIdx];
    let promRec = promRecs[slotIdx];
    if (slotIdx === 3 && rateIdx % 2 === 1) {
      promRec = "Progressing"; // Add some Progressing evals for odd-indexed rates
    }

    const cmdInfo =
      STRESS_COMMANDS.find((c) => c.command_name === def.cmd) ||
      STRESS_COMMANDS[0];
    const sailorUser = STRESS_USERS[i];
    const creatorId = users[sailorUser.email];
    const summaryGroupId = groupMap[def.rate];

    let holderId = creatorId;
    if (stageInfo.holderRole === "rater")
      holderId = users["rater.it@franklyn.dev"];
    else if (stageInfo.holderRole === "seniorRater")
      holderId = users["senior.rater1@franklyn.dev"];
    else if (stageInfo.holderRole === "reportingSenior")
      holderId = users[def.rsEmail];

    let gradeVal = "4.0";
    let avg = 4.0;
    if (promRec === "Early Promote") {
      gradeVal = "5.0";
      avg = 5.0;
    } else if (promRec === "Must Promote") {
      gradeVal = "4.0";
      avg = 4.0;
    } else if (promRec === "Promotable") {
      gradeVal = "3.0";
      avg = 3.0;
    } else if (promRec === "Progressing") {
      gradeVal = "2.0";
      avg = 2.0;
    } else if (promRec === "Significant Problems") {
      gradeVal = "1.0";
      avg = 1.0;
    }

    const traitGrades = {
      knowledge: gradeVal,
      work: gradeVal,
      eo: gradeVal,
      bearing: gradeVal,
      accomplishment: gradeVal,
      teamwork: gradeVal,
      leadership: gradeVal,
    } as any;

    // No "(STRESS #N)" suffix: parentheses/digits fail the Block 1 name rule
    // (LAST, FIRST MI - letters, spaces, hyphens, one comma) and block export.
    const memberName = `${sailorUser.lastName}, ${sailorUser.firstName} ${sailorUser.mi}`;

    const evalPayload = buildValidEval({
      created_by: creatorId,
      current_holder_id: holderId,
      previous_holder_id: stageInfo.stage === "sailor" ? null : creatorId,
      routing_stage: stageInfo.stage,
      status: stageInfo.status,
      summary_group_id: summaryGroupId,
      participants:
        stageInfo.stage === "sailor" ? [creatorId] : [creatorId, holderId],
      member_name: memberName,
      dod_id: sailorUser.dodId,
      grade_rate: template.rate,
      designator: "0000",
      period_from: "2025-06-15",
      period_to: "2026-06-15",
      duty_status: "ACT",
      uic: cmdInfo.uic,
      ship_station: cmdInfo.command_name,
      promotion_status: "Regular",
      trait_grades: traitGrades,
      trait_average: avg,
      comments: template.comments,
      career_recommendations: ["COMMAND CHIEF", "DEPARTMENT LPO"],
      promotion_recommendation: promRec,
      retention:
        promRec === "Significant Problems" ? "Not Recommended" : "Recommended",
      signature_locked: stageInfo.stage === "locked",
      block_values: {
        physical_readiness: "PPP",
        date_reported: "2024-01-15",
        periodic: true,
        regular_report: true,
        reporting_senior_name:
          def.rate === "HM1"
            ? "NIGHTINGALE, F N"
            : def.cmd === "USS NEVERSAIL"
              ? "NIMITZ, E C"
              : "JONES, C R",
        reporting_senior_grade: def.cmd === "USS ENTERPRISE" ? "CDR" : "CAPT",
        reporting_senior_designator: def.rate === "HM1" ? "2100" : "1110",
        reporting_senior_title: "CO",
        reporting_senior_uic: cmdInfo.uic,
        reporting_senior_dod_id:
          def.rate === "HM1"
            ? "4000000003"
            : def.cmd === "USS NEVERSAIL"
              ? "4000000002"
              : "4000000001",
        command_achievements: "SUPERIOR PERFORMANCE IN ALL ASSIGNED DUTIES.",
        primary_duties: `LEADING PETTY OFFICER FOR ${template.rate} DIVISION`,
        date_counseled: "25JAN15",
        counselor: "RAY, A M",
        comment_pitch: "10",
        billet_subcategory: "NA",
        substantiation_comments:
          promRec === "Significant Problems" || promRec === "Progressing"
            ? "MEMBER EXPERIENCED SIGNIFICANT PERFORMANCE CHALLENGES REQUIRED MANDATORY COUNSELING."
            : undefined,
      },
    });

    evalsToInsert.push(evalPayload);
  }

  const { data: inserted, error } = await admin
    .from("evaluations")
    .insert(evalsToInsert)
    .select(
      "id, member_name, grade_rate, routing_stage, promotion_recommendation, summary_group_id",
    );
  if (error) throw new Error(`evaluations insert: ${error.message}`);

  console.log(
    `  successfully seeded ${inserted!.length} detailed stress test evaluations across 10 summary groups!`,
  );

  // Write a summary fixture file for reference
  const summaryPath = resolve(
    process.cwd(),
    "tests/fixtures/stress-evals-summary.json",
  );
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        count: inserted!.length,
        evaluations: inserted,
        seededAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`  wrote summary to ${summaryPath}`);
}

async function main() {
  console.log("====================================================");
  console.log("APEX EVAL FLOW STRESS TEST SEEDER (@franklyn.dev)");
  console.log("====================================================");
  if (reset) {
    console.log("Reset flag detected: cleaning previous stress test evals...");
    await deleteStressEvals();
  }

  console.log("\n1. Seeding Commands...");
  await seedCommands();

  console.log("\n2. Seeding 49 Test Users across 5 Roles (@franklyn.dev)...");
  const userMap: Record<string, string> = {};
  for (const u of STRESS_USERS) {
    const id = await upsertUser(u);
    userMap[u.email] = id;
  }

  console.log("\n3. Seeding Summary Groups & 40 Realistic Evaluations...");
  await seedStressEvals(userMap);

  console.log("\n====================================================");
  console.log("STRESS TEST SEEDING COMPLETE!");
  console.log("Check docs/test-users-and-evals.md for login credentials.");
  console.log("====================================================");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
