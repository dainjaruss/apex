// lib/navyDate.ts
//
// Navy date display format shared by the PDF overlays and the NAVFIT 98 export:
// ISO "YYYY-MM-DD" → "YYMMMDD" (e.g. 2025-07-17 → 25JUL17). Non-ISO strings
// (YYMMMDD, "NOT REQ", "NOT PERF") pass through uppercased.

const MONTHS = [
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

export function formatNavpersDate(dateStr?: string): string {
  if (!dateStr) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  // Out-of-range month falls through verbatim rather than interpolating the
  // literal string "undefined" onto an official form.
  if (iso && MONTHS[Number(iso[2]) - 1])
    return `${iso[1].slice(-2)}${MONTHS[Number(iso[2]) - 1]}${iso[3]}`;
  return dateStr.toUpperCase();
}
