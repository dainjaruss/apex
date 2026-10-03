// src/lib/db.ts
//
// In-Browser Database for APEX v2 using Dexie.js (IndexedDB wrapper).
// 100% serverless, zero external network dependency, persists across sessions.

import Dexie, { Table } from "dexie";
import {
  Evaluation,
  SummaryGroup,
  ContinuityRecord,
  RscaHistoricalRecord,
  BragSheet,
  Profile,
} from "@/types";

export class ApexNavyDB extends Dexie {
  evaluations!: Table<Evaluation, string>;
  summary_groups!: Table<SummaryGroup, string>;
  continuity_records!: Table<ContinuityRecord, string>;
  rsca_records!: Table<RscaHistoricalRecord, string>;
  brag_sheets!: Table<BragSheet, string>;
  profiles!: Table<Profile, string>;

  constructor() {
    super("ApexNavyLocalDB");

    this.version(1).stores({
      evaluations: "id, dod_id, member_name, grade_rate, period_to, status, report_type, updated_at",
      summary_groups: "id, reporting_senior_name, period_to, grade_rate, status",
      continuity_records: "id, member_dod_id, period_from, period_to, status",
      rsca_records: "id, reporting_senior_dod_id, paygrade",
      brag_sheets: "id, member_dod_id, cycle_year, updated_at",
      profiles: "id, dod_id, preferred_role",
    });
  }
}

export const db = new ApexNavyDB();

// ── Default Active User Profile (Can be modified by user) ──
export const DEFAULT_PROFILE: Profile = {
  id: "profile-active-user",
  first_name: "DAIN",
  last_name: "FRANKLYN",
  middle_initial: "A",
  dod_id: "1234567890",
  email: "dain.a.franklyn.mil@us.navy.mil",
  navy_rank: "PO1",
  rate: "IT1",
  uic: "N0024",
  ship_station: "NAVSEA WASHINGTON DC",
  preferred_role: "Reporting Senior",
};

// ── Sample Starter Data (Seeds IndexedDB on first run) ──
export async function seedInitialDataIfEmpty() {
  // Auto-migrate legacy sample record if seeded with 6-char UIC
  try {
    const existing = await db.evaluations.get("eval-sample-001");
    if (existing && (existing.uic === "N00024" || existing.block_values?.reporting_senior_name === "KIRK, JAMES T")) {
      existing.uic = "N0024";
      existing.block_values = {
        ...existing.block_values,
        reporting_senior_name: "KIRK, J T",
        reporting_senior_title: "CO",
        reporting_senior_uic: "N0024",
        reporting_senior_address: existing.block_values?.reporting_senior_address || "NAVSEA WASHINGTON NAVY YARD DC",
        command_achievements: existing.block_values?.command_achievements || "C5ISR EXCELLENCE AWARD; CYBER INNOVATION OF THE YEAR",
        primary_duty_abbrev: existing.block_values?.primary_duty_abbrev || "LPO / CYBER",
        primary_duties: existing.block_values?.primary_duties || "PRI: LEAD PETTY OFFICER FOR ENTERPRISE CYBER DEFENSE; COLL: ACFL; WATCH: OOD IN-PORT.",
        qualifications: existing.block_values?.qualifications || "INFORMATION WARFARE SPECIALIST, ENLISTED SURFACE WARFARE",
      };
      await db.evaluations.put(existing);
    }
  } catch (e) {
    console.warn("Legacy migration check:", e);
  }

  const evalCount = await db.evaluations.count();
  if (evalCount > 0) return; // already seeded or user has records

  console.log("Seeding initial APEX v2 Navy records into IndexedDB...");

  // 1. Initial Profile
  await db.profiles.put(DEFAULT_PROFILE);

  // 2. Initial RSCA Baseline for Reporting Senior CAPT J. T. KIRK
  const rscaRecord: RscaHistoricalRecord = {
    id: "rsca-kirk-e6",
    reporting_senior_name: "KIRK, JAMES T",
    reporting_senior_dod_id: "9876543210",
    paygrade: "E6",
    historical_total_marks: 382.4,
    historical_report_count: 98,
    calculated_rsca: 3.90,
    last_updated: new Date().toISOString(),
  };
  await db.rsca_records.put(rscaRecord);

  // 3. Sample Evaluation (NAVPERS 1616/26 E1-E6)
  const sampleEval: Evaluation = {
    id: "eval-sample-001",
    report_type: "EVAL",
    member_name: "FRANKLYN, DAIN A",
    dod_id: "1234567890",
    grade_rate: "IT1",
    designator: "SW/IW",
    period_from: "2025-11-16",
    period_to: "2026-11-15",
    duty_status: "ACT",
    uic: "N0024",
    ship_station: "NAVSEA WASHINGTON DC",
    promotion_status: "Regular",
    trait_grades: {
      knowledge: "4.0",
      work: "5.0",
      eo: "4.0",
      bearing: "4.0",
      accomplishment: "5.0",
      teamwork: "4.0",
      leadership: "5.0",
    },
    trait_average: 4.43,
    comments:
      "*** #1 OF 12 HIGHLY COMPETITIVE FIRST CLASS PETTY OFFICERS! ***\n" +
      "EXEMPLARY LEADER, TECHNICAL EXPERT, AND MENTOR WHO CONSTANTLY PRODUCES MISSION RESULTS.\n\n" +
      "- TECHNICAL DYNAMO: Fielded enterprise performance exchange app on Forge, eliminating 100% of formatting rejections and saving 450+ administrative hours.\n" +
      "- MISSION COMMAND: Supervised 14 technicians across 3 divisions during C5ISR lifecycle certification, achieving 98.4% operational readiness score.\n" +
      "- DECKPLATE IMPACT: Mentored 8 junior Sailors resulting in 4 advancements, 2 Junior Sailor of the Quarter selections, and 100% retention.\n\n" +
      "PETTY OFFICER FRANKLYN HAS EARNED MY HIGHEST RECOMMENDATION FOR EARLY SELECTION TO CHIEF PETTY OFFICER!",
    career_recommendations: ["CHIEF PETTY OFFICER", "LPO", "DLCPO ASSISTANT"],
    promotion_recommendation: "Early Promote",
    retention: "Recommended",
    status: "ready_for_review",
    routing_stage: "reporting_senior",
    block_values: {
      physical_readiness: "P",
      billet_subcategory: "NA",
      date_reported: "2024-05-15",
      reporting_senior_name: "KIRK, J T",
      reporting_senior_grade: "CAPT",
      reporting_senior_designator: "1110",
      reporting_senior_title: "CO",
      reporting_senior_uic: "N0024",
      reporting_senior_dod_id: "9876543210",
      reporting_senior_address: "NAVSEA WASHINGTON NAVY YARD DC",
      date_counseled: "2026-05-15",
      counselor: "SPOCK, S S",
      individual_counseled_signature: "Acknowledged on file",
      command_achievements: "C5ISR EXCELLENCE AWARD; CYBER INNOVATION OF THE YEAR",
      primary_duty_abbrev: "LPO / CYBER",
      primary_duties: "PRI: LEAD PETTY OFFICER FOR ENTERPRISE CYBER DEFENSE; COLL: ACFL; WATCH: OOD IN-PORT.",
      qualifications: "INFORMATION WARFARE SPECIALIST, ENLISTED SURFACE WARFARE",
      comment_pitch: "10",
      comment_pitch_v: 2,
      periodic: true,
      regular_report: true,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await db.evaluations.put(sampleEval);

  // 4. Sample Continuity Records (Demonstrating continuous service & gap check)
  const continuityRecords: ContinuityRecord[] = [
    {
      id: "cont-001",
      member_dod_id: "1234567890",
      member_name: "FRANKLYN, DAIN A",
      period_from: "2023-11-16",
      period_to: "2024-11-15",
      report_type: "EVAL",
      occasion: "Periodic",
      promotion_recommendation: "Must Promote",
      individual_trait_avg: 4.14,
      rsca: 3.86,
      reporting_senior_name: "PIKE, CHRISTOPHER",
      uic: "N00024",
      status: "verified",
      notes: "Annual E-6 Periodic",
    },
    {
      id: "cont-002",
      member_dod_id: "1234567890",
      member_name: "FRANKLYN, DAIN A",
      period_from: "2024-11-16",
      period_to: "2025-11-15",
      report_type: "EVAL",
      occasion: "Periodic",
      promotion_recommendation: "Early Promote",
      individual_trait_avg: 4.29,
      rsca: 3.88,
      reporting_senior_name: "KIRK, JAMES T",
      uic: "N00024",
      status: "verified",
      notes: "Annual E-6 Periodic",
    },
    {
      id: "cont-003",
      member_dod_id: "1234567890",
      member_name: "FRANKLYN, DAIN A",
      period_from: "2025-11-16",
      period_to: "2026-11-15",
      report_type: "EVAL",
      occasion: "Periodic",
      promotion_recommendation: "Early Promote",
      individual_trait_avg: 4.43,
      rsca: 3.90,
      reporting_senior_name: "KIRK, JAMES T",
      uic: "N00024",
      status: "verified",
      notes: "Current In-Progress Report",
    },
  ];
  for (const c of continuityRecords) {
    await db.continuity_records.put(c);
  }

  // 5. Sample Summary Group
  const sampleGroup: SummaryGroup = {
    id: "sg-nov2026-e6",
    name: "CY2026 E6 Periodic (NAVSEA)",
    reporting_senior_name: "KIRK, JAMES T",
    reporting_senior_dod_id: "9876543210",
    period_to: "2026-11-15",
    grade_rate: "E6",
    promotion_status: "Regular",
    report_type: "EVAL",
    status: "open",
    member_ids: ["eval-sample-001"],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await db.summary_groups.put(sampleGroup);
}
