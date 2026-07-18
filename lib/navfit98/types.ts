// lib/navfit98/types.ts
//
// Module contracts for the NAVFIT 98A export feature.
// Spec: docs/specs/navfit98-field-mapping.md (authoritative for every column,
// transform, and validation rule referenced here).

import type { Evaluation, ValidationIssue } from "@/types";

/**
 * One cell value bound for an Access column.
 * - string  → Short Text / Memo (also Decimal, e.g. RSCA "0.00", and Summary
 *             counts, e.g. "3" — the Java writer coerces by column type)
 * - number  → Integer/Long (trait grades 0-5, PromotionRecom 0-5, SummaryRank)
 * - boolean → Yes/No bit (writer stores -1/0; never null — mapper must emit
 *             an explicit boolean for every bit column)
 * - null    → SQL NULL (per the "Empty" dispositions in spec §1)
 *
 * Date columns (DateReported, FromDate, ToDate, RaterDate, SeniorRaterDate)
 * are ISO "YYYY-MM-DD" strings; the writer converts them to midnight OLE
 * dates with no timezone shift.
 */
export type NavfitCell = string | number | boolean | null;

/** A full Reports-table row keyed by exact Access column name (spec §1). */
export type NavfitReportRow = Record<string, NavfitCell>;

export interface NavfitValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
}

/**
 * Maps one APEX evaluation to a complete NAVFIT Reports row (all 126 columns
 * minus ReportID, which AutoNumbers). Reads summary counts from the transient
 * `evaluation.summary_group_distribution` when present. `Parent` is always
 * "a 1" (the template's Root folder). Pure; assumes validateNavfitExport and
 * runFullValidation both passed.
 */
export type MapEvaluationToNavfit = (evaluation: Evaluation) => NavfitReportRow;

/**
 * NAVFIT-specific export gate (spec §6) layered on top of runFullValidation:
 * length caps tighter than APEX's own, trait/NOB consistency, exclusive bit
 * groups. Rejects — never truncates.
 */
export type ValidateNavfitExport = (
  evaluation: Evaluation,
) => NavfitValidationResult;

/**
 * Writes rows into a copy of the NAVFIT template .accdb via the Java sidecar
 * (scripts/navfit98/navfit-writer.jar) and returns the finished file. The
 * template's sample report is cleared; its Root folder (FolderID 1) is kept.
 * Throws if the sidecar fails or Java is unavailable — call
 * isNavfitWriterAvailable() first to degrade gracefully (501 on hosts
 * without a JRE, e.g. Vercel).
 */
export type WriteNavfitAccdb = (
  reports: NavfitReportRow[],
) => Promise<Buffer>;

export type IsNavfitWriterAvailable = () => Promise<boolean>;
