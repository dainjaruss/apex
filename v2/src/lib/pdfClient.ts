// src/lib/pdfClient.ts
//
// Client-side PDF generation utility using pdf-lib and official NAVPERS blanks.
// Runs 100% inside the browser with zero server rendering.

import { Evaluation } from "@/types";
import { generateOverlayPdf } from "./pdfOverlay";
import { TEMPLATE_BASE64, base64ToUint8Array } from "./pdfTemplateData";

/**
 * Loads the appropriate official Navy template PDF buffer into memory.
 * Uses pre-bundled base64 so it works offline and directly via file:/// without CORS issues.
 */
export async function loadTemplateBuffer(reportType: "EVAL" | "CHIEFEVAL" | "FITREP"): Promise<Uint8Array> {
  const b64 = TEMPLATE_BASE64[reportType] || TEMPLATE_BASE64.EVAL;
  if (b64) {
    return base64ToUint8Array(b64);
  }
  throw new Error(`Template not found for ${reportType}`);
}

/**
 * Generates an official NAVPERS PDF in-browser and triggers a browser download.
 */
export async function downloadEvaluationPdf(evaluation: Evaluation): Promise<void> {
  const reportType = evaluation.report_type || "EVAL";
  const templateBuffer = await loadTemplateBuffer(reportType);
  const pdfBytes = await generateOverlayPdf(evaluation, templateBuffer);

  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);

  const cleanName = (evaluation.member_name || "REPORT").replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `${reportType}_${cleanName}_${evaluation.period_to || "DRAFT"}.pdf`;

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generates an official NAVPERS PDF in-browser and returns a Blob URL for previewing in an iframe/modal.
 */
export async function previewEvaluationPdf(evaluation: Evaluation): Promise<string> {
  const reportType = evaluation.report_type || "EVAL";
  const templateBuffer = await loadTemplateBuffer(reportType);
  const pdfBytes = await generateOverlayPdf(evaluation, templateBuffer);

  const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}
