// lib/navfit98/mapEvaluationToNavfit.ts
//
// Maps one APEX evaluation to a complete NAVFIT 98A Reports-table row: all 126
// columns of spec §1 except the AutoNumber ReportID, every column explicitly
// present (including NULLs — the Java writer distinguishes NULL from "").
// Pure; assumes runFullValidation and validateNavfitExport both passed.
// Spec: docs/specs/navfit98-field-mapping.md

import { Evaluation } from "@/types";
import { NavfitReportRow } from "./types";
import { NAVFIT_TRAIT_MAP } from "./constants";

// §5 ReportType discriminator strings ("Eval" byte-confirmed in the golden DB)
const REPORT_TYPE: Record<Evaluation["report_type"], string> = {
  EVAL: "Eval",
  CHIEFEVAL: "Chief",
  FITREP: "FitRep",
};

// §4.4 radio-index promotion codes (labels NOB..Early Promote → stored index)
const PROMOTION_CODES: Record<string, number> = {
  NOB: 0,
  "Significant Problems": 1,
  Progressing: 2,
  Promotable: 3,
  "Must Promote": 4,
  "Early Promote": 5,
};

// All nine Access trait columns; the per-form map fills a subset, the rest stay NULL.
const TRAIT_COLUMNS = [
  "PROF",
  "QUAL",
  "EO",
  "MIL",
  "PA",
  "TEAM",
  "LEAD",
  "MIS",
  "TAC",
];

// §4.7 counselor splits are populated only when the free string matches the
// "LAST, FI [MI]" initials shape (single-letter tokens after the comma).
const COUNSELOR_SHAPE = /^[A-Za-z]+,\s*[A-Za-z](\s+[A-Za-z])?$/;

// Mirrors formatNavpersDate (lib/pdfOverlay.ts:42-61) — ISO → YYMMMDD; YYMMMDD /
// NOT REQ / NOT PERF pass through uppercased (§4.2). Mirrored rather than imported
// so the mapper does not drag pdf-lib in.
export function formatNavpersDate(dateStr?: string): string {
  if (!dateStr) return "";
  const months = [
    "JAN",
    "FEB",
    "MAR",
    "APR",
    "MAY",
    "JUN",
    "JUL",
    "AUG",
    "SEP",
    "OCT",
    "NOV",
    "DEC",
  ];
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  // Out-of-range month falls through verbatim (then fails the ≤8-char export
  // cap) instead of interpolating the string "undefined".
  if (iso && months[Number(iso[2]) - 1])
    return `${iso[1].slice(-2)}${months[Number(iso[2]) - 1]}${iso[3]}`;
  return dateStr.toUpperCase();
}

// §4.3 radio-index grade encoding: "1.0".."5.0" → 1..5, "NOB" → 0, absent → NULL
function traitCode(grade?: string): number | null {
  if (!grade) return null;
  if (grade.toUpperCase() === "NOB") return 0;
  return parseInt(grade, 10);
}

// §4.7 member_name "LAST, FIRST MI" → splits. Upstream regex guarantees one comma,
// but a malformed name just leaves the splits NULL (FullName keeps the verbatim string).
function splitMemberName(name: string): {
  first: string | null;
  mi: string | null;
  last: string | null;
} {
  const comma = name.indexOf(",");
  if (comma < 0) return { first: null, mi: null, last: null };
  const last = name.slice(0, comma).trim() || null;
  const tokens = name.slice(comma + 1).trim().split(/\s+/).filter(Boolean);
  // Trailing single-letter token is the MI only when a first name remains before it.
  if (tokens.length > 1 && tokens[tokens.length - 1].length === 1) {
    return {
      first: tokens.slice(0, -1).join(" "),
      mi: tokens[tokens.length - 1],
      last,
    };
  }
  return { first: tokens.join(" ") || null, mi: null, last };
}

// §4.7 "LASTNAME, FI [MI] [JR/SR/II–V]" → splits; suffix tokens (≥2 chars) drop out
// of the splits naturally (kept only in the combined field).
function splitInitialsName(name: string): {
  last: string | null;
  fi: string | null;
  mi: string | null;
} {
  const comma = name.indexOf(",");
  if (comma < 0) return { last: null, fi: null, mi: null };
  const tokens = name.slice(comma + 1).trim().split(/\s+/).filter(Boolean);
  return {
    last: name.slice(0, comma).trim() || null,
    fi: tokens[0]?.length === 1 ? tokens[0] : null,
    mi: tokens[1]?.length === 1 ? tokens[1] : null,
  };
}

export function mapEvaluationToNavfit(evaluation: Evaluation): NavfitReportRow {
  const bv = evaluation.block_values || {};
  const tg = evaluation.trait_grades || {};
  const type = evaluation.report_type;

  const member = splitMemberName(evaluation.member_name || "");
  const rs = splitInitialsName(bv.reporting_senior_name || "");
  const counselor: string = bv.counselor || "";
  const coun = COUNSELOR_SHAPE.test(counselor.trim())
    ? splitInitialsName(counselor.trim())
    : { last: null, fi: null, mi: null };

  const traits: Record<string, number | null> = {};
  TRAIT_COLUMNS.forEach((c) => (traits[c] = null));
  for (const { key, column } of NAVFIT_TRAIT_MAP[type]) {
    traits[column] = traitCode(tg[key]);
  }

  // §4.5 summary counts as text; "0" when no group or the viewer can't see it
  const dist = evaluation.summary_group_distribution;
  const count = (category: string) => String(dist?.[category] ?? 0);

  // §1 rows 113-114 statement-intent fanout — same parse as pdfOverlay block 51
  const stmt: string = (bv.member_statement_intent || "").toUpperCase();
  const statementNo = stmt.includes("NOT") || stmt.includes("DO NOT");
  const statementYes = !statementNo && stmt.includes("INTEND");

  const duty = evaluation.duty_status;
  const isEval = type === "EVAL";

  return {
    Parent: "a 1",
    ReportType: REPORT_TYPE[type],
    FullName: evaluation.member_name || "",
    FirstName: member.first,
    MI: member.mi,
    LastName: member.last,
    Suffix: null,
    Rate: evaluation.grade_rate || "",
    Desig: evaluation.designator || "",
    SSN: null, // APEX stores 10-digit DoD IDs, never SSNs (§7 gap — deliberate)
    Active: duty === "ACT",
    TAR: duty === "TAR",
    Inactive: duty === "INACT",
    ATADSW: duty === "AT/ADOS",
    UIC: evaluation.uic || "",
    ShipStation: evaluation.ship_station || "",
    PromotionStatus: (evaluation.promotion_status || "").toUpperCase(),
    DateReported: bv.date_reported || null,
    Periodic: !!bv.periodic,
    DetInd: !!bv.detachment_individual,
    Frocking: !!bv.promotion_frocking,
    Special: !!bv.special,
    FromDate: evaluation.period_from || null,
    ToDate: evaluation.period_to || null,
    NOB: !!bv.not_observed,
    Regular: !!bv.regular_report,
    Concurrent: !!bv.concurrent_report,
    OpsCdr: false, // APEX has no block-19 concept
    PhysicalReadiness: bv.physical_readiness || "",
    PhysicalReadiness2: null,
    PhysicalReadinessDt: null,
    BilletSubcat: bv.billet_subcategory || "",
    RSLastName: rs.last,
    RSFI: rs.fi,
    RSMI: rs.mi,
    ReportingSenior: bv.reporting_senior_name || "",
    RSGrade: bv.reporting_senior_grade || "",
    RSDesig: bv.reporting_senior_designator || "",
    RSTitle: bv.reporting_senior_title || "",
    RSUIC: bv.reporting_senior_uic || "",
    RSSSN: null,
    Achievements: bv.command_achievements || "",
    PrimaryDuty: bv.primary_duty_abbrev || "",
    Duties: bv.primary_duties || "",
    DateCounseled: formatNavpersDate(bv.date_counseled),
    Counseler: counselor,
    CounselerLN: coun.last,
    CounselerFI: coun.fi,
    CounselerMI: coun.mi,
    PROF: traits.PROF,
    PROFDN1: null,
    PROFDN2: null,
    PROFDN3: null,
    QUAL: traits.QUAL,
    QUALDN1: null,
    QUALDN2: null,
    QUALDN3: null,
    EO: traits.EO,
    EODN1: null,
    EODN2: null,
    EODN3: null,
    MIL: traits.MIL,
    MILDN1: null,
    MILDN2: null,
    MILDN3: null,
    PA: traits.PA,
    PADN1: null,
    PADN2: null,
    PADN3: null,
    TEAM: traits.TEAM,
    TEAMDN1: null,
    TEAMDN2: null,
    TEAMDN3: null,
    LEAD: traits.LEAD,
    LEADDN1: null,
    LEADDN2: null,
    LEADDN3: null,
    MIS: traits.MIS,
    MISDN1: null,
    MISDN2: null,
    MISDN3: null,
    TAC: traits.TAC,
    TACDN1: null,
    TACDN2: null,
    TACDN3: null,
    RecommendA: (evaluation.career_recommendations || [])[0] || "",
    RecommendB: (evaluation.career_recommendations || [])[1] || "",
    Rater: bv.rater_signature || "",
    RaterDate: bv.rater_signature_date || null,
    CommentsPitch: bv.comment_pitch === "12" ? "12 POINT" : "10 POINT",
    Comments: evaluation.comments || "",
    Qualifications: bv.qualifications || "",
    PromotionRecom: PROMOTION_CODES[evaluation.promotion_recommendation] ?? 0,
    SummaryRank: 0,
    SummarySP: count("Significant Problems"),
    SummaryProg: count("Progressing"),
    SummaryProm: count("Promotable"),
    SummaryMP: count("Must Promote"),
    SummaryEP: count("Early Promote"),
    RetentionYes: isEval && evaluation.retention === "Recommended",
    RetentionNo: isEval && evaluation.retention === "Not Recommended",
    RSCA: "0.00", // RS cumulative average — APEX doesn't track it (§7)
    RSAddress: bv.reporting_senior_address || "",
    RSAddress1: null,
    RSAddress2: null,
    RSCity: null,
    RSState: null,
    RSZipCd: null,
    RSPhone: null,
    RSDSN: null,
    SeniorRater: bv.senior_rater_signature || "",
    SeniorRaterDate: bv.senior_rater_signature_date || null,
    StatementYes: statementYes,
    StatementNo: statementNo,
    RSInfo: bv.concurrent_report ? bv.concurrent_rs_signature || "" : "",
    RRSFI: null,
    RRSMI: null,
    RRSLastName: null,
    RRSGrade: null,
    RRSCommand: null,
    RRSUIC: null,
    UserComments: null, // golden row is NULL here, not ""
    Psswrd: null, // never write a password (§1 row 123)
    Standards: null,
    IsValidated: false, // let NAVFIT re-validate post-import (§1 row 125)
  };
}
