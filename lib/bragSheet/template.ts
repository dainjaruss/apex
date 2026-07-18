// lib/bragSheet/template.ts — section metadata + empty factory (spec §4.3, verbatim)

import type { BragSheetData } from "./types";

export interface BragSectionMeta {
  key: keyof BragSheetData;
  title: string;          // section heading, UI + PDF
  blurb: string;          // one-line helper shown under the heading
  feeds: string;          // "Blocks 1–9", "Block 29A/29B", "Block 43", ...
}

/** Ordered exactly as rendered (UI accordion and PDF). */
export const BRAG_SECTIONS: BragSectionMeta[] = [
  { key: "admin",           title: "Admin Data",                    blurb: "Who you are and the reporting period.",                          feeds: "Blocks 1–9, 14/15" },
  { key: "duties",          title: "Duties Assigned",               blurb: "Primary, collateral, watchstanding, TEMADD — with months.",      feeds: "Blocks 29A/29B" },
  { key: "job",             title: "Job Information",               blurb: "Scope, equipment, customers, team results.",                     feeds: "Blocks 43, 28" },
  { key: "leadership",      title: "Supervision & Leadership",      blurb: "Headcounts, budget, instruction, mentoring, retention.",         feeds: "Block 43" },
  { key: "accomplishments", title: "Individual Accomplishments",    blurb: "Action — impact — result, with numbers.",                        feeds: "Block 43" },
  { key: "qualifications",  title: "Qualifications, Awards & Education", blurb: "Completed THIS period only.",                               feeds: "Blocks 44, 43" },
  { key: "off_duty",        title: "Off-Duty",                      blurb: "Education, community, Navy PR, civilian employment.",            feeds: "Blocks 44, 43" },
  { key: "pfa",             title: "Physical Readiness (PRIMS)",    blurb: "One row per PFA cycle in the period, oldest first.",             feeds: "Blocks 20, 29B" },
  { key: "goals",           title: "Future Goals",                  blurb: "Desired duties and schools; two Block 41 slots, 20 chars each.", feeds: "Blocks 41, 43" },
  { key: "counseling",      title: "Counseling Record",             blurb: "Mid-term counseling date and counselor.",                        feeds: "Blocks 30/31" },
  { key: "additional",      title: "Other Items for Consideration", blurb: "Anything else the reporting senior should know.",                feeds: "Block 43" },
];

/** Fully-populated empty payload: every array [], every counter 0, every string "". */
export function emptyBragSheetData(): BragSheetData {
  return {
    admin: { periods_unavailable: [] },
    duties: [],
    job: { responsibilities: "", equipment: [], customers: "", team_contributions: [] },
    leadership: {
      supervised_military: 0, supervised_civilian: 0, supervised_via_subordinates: 0,
      instructor_roles: [], mentoring: [], retention_efforts: [],
    },
    accomplishments: [],
    qualifications: { quals: [], education: [], awards: [] },
    off_duty: { education: [], community: [], navy_pr: [] },
    pfa: [],
    goals: { career_recommendations: [], desired_duties: "" },
    counseling: {},
    additional: "",
  };
}

/** Deterministic Block 20 collapse — the ONLY producer of physical_readiness. */
export function collapsePfa(data: BragSheetData): string {
  return data.pfa.map((c) => c.result).join("");
}
