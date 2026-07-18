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
  // "CODE - Title" rows. New-style (H04A), 3-digit+letter (741A), legacy
  // 4-digit (2779) codes. Real extracted text is space-collapsed (no newlines),
  // so a title is bounded by the NEXT code token or a char cap — never by a
  // newline (which is why the previous \n-terminated regex dropped the last NEC).
  const necs: NecEntry[] = [];
  const seenNec = new Set<string>();
  const codeRe = /\b([A-Z]\d{2}[A-Z0-9]|\d{3}[A-Z]|\d{4}[A-Z]?)\b\s*[-–:]\s*/gi;
  const necAnchor = /\bNECs?\b/gi;
  let anchor: RegExpExecArray | null;
  while ((anchor = necAnchor.exec(text)) && necs.length < 10) {
    const window = text.slice(anchor.index, anchor.index + 600);
    const rows: RegExpExecArray[] = [];
    codeRe.lastIndex = 0;
    let rm: RegExpExecArray | null;
    while ((rm = codeRe.exec(window))) rows.push(rm);
    for (let k = 0; k < rows.length && necs.length < 10; k++) {
      const code = rows[k][1].toUpperCase();
      if (seenNec.has(code)) continue;
      const titleStart = (rows[k].index ?? 0) + rows[k][0].length;
      const titleEnd =
        k + 1 < rows.length
          ? (rows[k + 1].index ?? window.length)
          : Math.min(window.length, titleStart + 60);
      let title = window.slice(titleStart, titleEnd).replace(/\s+/g, " ").trim();
      // At the char cap, cut back to a whole word.
      if (title.length >= 55) title = title.slice(0, 55).replace(/\s+\S*$/, "").trim();
      if (!/^[A-Za-z]/.test(title) || title.length < 3) continue;
      seenNec.add(code);
      necs.push({ code, title, verified_in_ompf: false });
    }
  }

  // Degrees (OMPF FC 35 / JST), case-insensitive: real transcripts are often
  // all-caps. The degree connector ("of" / "degree in") is REQUIRED — without
  // it, "Master Chief Petty Officer" (in nearly every Navy record) matched as a
  // bogus "Master" degree and masked the real one. First match per tier.
  const education: EducationEntry[] = [];
  for (const re of [
    /\bMaster(?:'s)?\s+(?:of|degree\s+in)\s+[A-Za-z][A-Za-z &]{2,50}/i,
    /\bBachelor(?:'s)?\s+(?:of|degree\s+in)\s+[A-Za-z][A-Za-z &]{2,50}/i,
    /\bAssociate(?:'s)?\s+(?:of|degree\s+in)\s+[A-Za-z][A-Za-z &]{2,50}/i,
  ]) {
    const m = text.match(re);
    if (m)
      education.push({
        kind: "degree",
        title: m[0].replace(/\s+/g, " ").trim(),
        verified_in_ompf: false,
      });
  }

  // PFA cycles (ESR PFA section): both year-first ("2024-1 … PASS") and
  // cycle-first ("CYCLE 2 2023 FAIL") layouts. A cycle line can list a BCA
  // sub-result before the overall PRT result ("BCA PASS PRT FAIL"); the OVERALL
  // cycle result is a FAIL, so scan all result tokens in the window and take the
  // WORST (fail > excused > pass) — never the first token, which inflated.
  // ponytail: cycle date approximated to end of half-year — member-editable.
  const pfa: PfaCycle[] = [];
  const seenCycle = new Set<string>();
  const cycleRe =
    /\bCYCLE\s*([12])\s+(20\d{2})\b|\b(20\d{2})\s*[-/ ]\s*(?:CYCLE\s*)?([12])\b/gi;
  const cycleMatches: RegExpExecArray[] = [];
  let cm: RegExpExecArray | null;
  while ((cm = cycleRe.exec(text))) cycleMatches.push(cm);
  for (let i = 0; i < cycleMatches.length && pfa.length < 12; i++) {
    const c = cycleMatches[i];
    const year = c[2] ?? c[3];
    const half = c[1] ?? c[4];
    const cycle = `${year}-${half}`;
    if (seenCycle.has(cycle)) continue;
    // Bound the result window to BEFORE the next cycle token so one cycle's
    // result can't bleed into the next (otherwise a later FAIL flips it).
    const start = (c.index ?? 0) + c[0].length;
    const nextStart =
      i + 1 < cycleMatches.length ? (cycleMatches[i + 1].index ?? text.length) : text.length;
    const tail = text.slice(start, Math.min(nextStart, start + 80));
    const results = (tail.match(/\b(PASS|FAIL|EXCUSED)\b/gi) || []).map((s) =>
      s.toUpperCase(),
    );
    if (!results.length) continue;
    const result: PfaCycle["result"] = results.includes("FAIL")
      ? "fail"
      : results.includes("EXCUSED")
        ? "excused"
        : "pass";
    seenCycle.add(cycle);
    pfa.push({
      cycle,
      date: half === "1" ? `${year}-06-30` : `${year}-12-31`,
      result,
    });
  }

  return { awards, necs, education, pfa };
}
