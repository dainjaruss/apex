// lib/boardConfidence/recordExtract.ts
//
// v1.5: heuristic extraction of structured record entries from an uploaded
// ESR / PSR / OMPF (FC 30-38) PDF's text, so uploads feed the board
// confidence determination instead of being storage-only. Pure functions —
// text in, suggestions out. Conservative by design: every suggestion lands in
// the editable Record Entry form as verified_in_ompf=false for the member to
// review before saving; nothing is scored until they save.
//
// PDF text extraction itself reuses lib/bragSheet/extract.extractPdfText
// (in-memory unpdf, never persisted) at the route layer.

import type {
  AwardEntry,
  AwardLevel,
  EducationEntry,
  NecEntry,
  PfaCycle,
} from "@/lib/boardConfidence/types";

export interface RecordExtractSuggestions {
  awards: AwardEntry[];
  necs: NecEntry[];
  education: EducationEntry[];
  pfa: PfaCycle[];
}

// Well-known award names → rubric level (spec §7 Factor points). One entry per
// distinct award name; ponytail: star/repeat counts ("(3)") are not expanded —
// the member can duplicate rows in the form if they want each award scored.
// \s+ throughout: extracted PDF text wraps award names across lines.
const AWARD_PATTERNS: Array<[RegExp, AwardLevel]> = [
  [/Legion\s+of\s+Merit|Bronze\s+Star|(?:Defense\s+)?Meritorious\s+Service\s+Medal/i, "msm_or_above"],
  [/(?:Navy\s+(?:and\s+Marine\s+Corps\s+)?|Joint\s+Service\s+)Commendation\s+Medal/i, "personal_commendation"],
  [/(?:Navy\s+(?:and\s+Marine\s+Corps\s+)?|Joint\s+Service\s+)Achievement\s+Medal/i, "personal_achievement"],
  [/Meritorious\s+Unit\s+Commendation|Navy\s+Unit\s+Commendation|Battle\s+['"]?E['"]?/i, "unit"],
];

export function suggestRecordFromText(text: string): RecordExtractSuggestions {
  const awards: AwardEntry[] = [];
  for (const [re, level] of AWARD_PATTERNS) {
    const m = text.match(re);
    if (m) {
      awards.push({
        title: m[0].replace(/\s+/g, " ").trim(),
        level,
        date_awarded: "",
        verified_in_ompf: false,
      });
    }
  }

  // NECs (ESR field code 33): scan windows after "NEC" anchors for
  // "CODE - Title" rows. New-style (H04A) and legacy 4-digit codes.
  const necs: NecEntry[] = [];
  const seenNec = new Set<string>();
  const necAnchor = /\bNECs?\b/g;
  let anchor: RegExpExecArray | null;
  while ((anchor = necAnchor.exec(text)) && necs.length < 10) {
    const window = text.slice(anchor.index, anchor.index + 600);
    // New-style (H04A), 3-digit+letter (741A), legacy 4-digit (2779) codes.
    // Title stops before the next code-dash row on the same line.
    const code = String.raw`(?:[A-Z]\d{2}[A-Z0-9]|\d{3}[A-Z]|\d{4}[A-Z]?)`;
    const rowRe = new RegExp(
      String.raw`\b(${code})\b\s*[-–:]\s*([A-Za-z][^\n]{4,60}?)(?=\s+${code}\b\s*[-–:]|\n|$)`,
      "g",
    );
    let row: RegExpExecArray | null;
    while ((row = rowRe.exec(window)) && necs.length < 10) {
      const code = row[1];
      if (seenNec.has(code)) continue;
      seenNec.add(code);
      necs.push({
        code,
        title: row[2].replace(/\s+/g, " ").trim(),
        verified_in_ompf: false,
      });
    }
  }

  // Degrees (OMPF FC 35 / JST): first match per degree tier.
  const education: EducationEntry[] = [];
  for (const re of [
    /(Master(?:'s)?(?: of| Degree in)? [A-Z][A-Za-z &]{2,50})/,
    /(Bachelor(?:'s)?(?: of| Degree in)? [A-Z][A-Za-z &]{2,50})/,
    /(Associate(?:'s)?(?: of| Degree in)? [A-Z][A-Za-z &]{2,50})/,
  ]) {
    const m = text.match(re);
    if (m)
      education.push({
        kind: "degree",
        title: m[1].replace(/\s+/g, " ").trim(),
        verified_in_ompf: false,
      });
  }

  // PFA cycles (ESR PFA section): "2024-1 ... PASS" / "CYCLE 2 2023 FAIL".
  // ponytail: cycle date approximated to end of half-year — member-editable.
  const pfa: PfaCycle[] = [];
  const seenCycle = new Set<string>();
  const pfaRe = /\b(20\d{2})\s*[-/ ]\s*(?:CYCLE\s*)?([12])\b[\s\S]{0,80}?\b(PASS|FAIL|EXCUSED)\b/gi;
  let p: RegExpExecArray | null;
  while ((p = pfaRe.exec(text)) && pfa.length < 12) {
    const cycle = `${p[1]}-${p[2]}`;
    if (seenCycle.has(cycle)) continue;
    seenCycle.add(cycle);
    pfa.push({
      cycle,
      date: p[2] === "1" ? `${p[1]}-06-30` : `${p[1]}-12-31`,
      result: p[3].toLowerCase() as PfaCycle["result"],
    });
  }

  return { awards, necs, education, pfa };
}
