// lib/bragSheet/extract.ts
//
// In-memory PDF text extraction (unpdf — the serverless pdf.js repackaging:
// zero runtime deps, no worker config) plus heuristic suggestion mining from
// prior evals / PRIMS printouts. Never touches fs or storage — bytes in,
// suggestions out (invariant §1.2 item 1). Heuristics favor precision over
// recall: every suggestion requires an explicit user Accept in the UI (§6),
// so a missed field costs nothing and a wrong one is one click to ignore.
// Never merges into a brag sheet itself — merging is a UI action.
// Spec: docs/specs/brag-sheet.md §4.5

import { extractText, getDocumentProxy } from "unpdf";
import type {
  BragAdmin,
  BragDuty,
  BragPfaCycle,
  BragQualifications,
} from "@/lib/bragSheet/types";

/** Whole-document text, merged pages. In-memory only. Throws on encrypted/unparseable input. */
export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const doc = await getDocumentProxy(bytes);
  const { text } = await extractText(doc, { mergePages: true });
  return text;
}

export interface BragExtractSuggestions {
  kind: "prior_eval" | "prims" | "unknown";
  admin: Partial<BragAdmin>; // member_name, ship_station, prior_report_end, date_reported
  duties: Pick<
    BragDuty,
    "title" | "kind" | "months_assigned" | "is_most_significant"
  >[];
  quals: BragQualifications["quals"];
  pfa: BragPfaCycle[];
  bullets: string[]; // candidate Block 43 accomplishment lines
  chars_extracted: number; // diagnostics; 0 ⇒ route answers 422
}

const PRT_CATEGORY = /(OUTSTANDING|EXCELLENT|GOOD|SATISFACTORY|PROBATIONARY)/i;

/** Surrounding phrase for a qual match — up to 60 chars on the match's line,
 *  trimmed at word boundaries (§4.5 heuristic 7). */
function phraseAround(text: string, index: number, matchLen: number): string {
  const pad = Math.max(0, Math.floor((60 - matchLen) / 2));
  let start = Math.max(0, index - pad);
  let end = Math.min(text.length, index + matchLen + pad);
  const nlBefore = text.lastIndexOf("\n", index);
  if (nlBefore >= start) start = nlBefore + 1;
  const nlAfter = text.indexOf("\n", index + matchLen);
  if (nlAfter !== -1 && nlAfter < end) end = nlAfter;
  // Trim partial words at the cut points.
  if (start > 0 && /\S/.test(text[start - 1])) {
    const sp = text.indexOf(" ", start);
    if (sp !== -1 && sp < index) start = sp + 1;
  }
  if (end < text.length && /\S/.test(text[end])) {
    const sp = text.lastIndexOf(" ", end);
    if (sp > index + matchLen) end = sp;
  }
  return text.slice(start, end).trim();
}

export function suggestFromText(text: string): BragExtractSuggestions {
  // 1. Kind detection.
  const kind: BragExtractSuggestions["kind"] =
    /\b\d{2}-[12]\b/.test(text) && PRT_CATEGORY.test(text)
      ? "prims"
      : /EVALUATION REPORT|FITNESS REPORT|CHIEFEVAL/.test(text)
        ? "prior_eval"
        : "unknown";

  const admin: Partial<BragAdmin> = {};

  // 2. member_name — the repo's "LAST, FIRST M" convention, joined as matched.
  const name = /\b([A-Z][A-Z'-]{1,29}),\s([A-Z][A-Z'-]{1,29})(\s[A-Z])?\b/.exec(
    text,
  );
  if (name) admin.member_name = name[0];

  // 3. ship_station.
  const uss = /\bUSS\s+[A-Z][A-Z0-9 -]{2,30}\b/.exec(text);
  if (uss) admin.ship_station = uss[0].trim();

  // 4. Dates — ascending; latest = prior Block 15 (the new Block 14 is the day
  //    after), earliest = Date Reported candidate only when so labeled.
  const dates = Array.from(text.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g))
    .map((m) => m[1])
    .sort();
  if (kind === "prior_eval" && dates.length > 0) {
    admin.prior_report_end = dates[dates.length - 1];
    const earliest = dates[0];
    const at = text.indexOf(earliest);
    if (text.slice(Math.max(0, at - 40), at).includes("Date Reported")) {
      admin.date_reported = earliest;
    }
  }

  // 5. Duties — "TITLE-<months>" pairs from a prior Block 29B; the first is the
  //    most significant primary, the rest collateral.
  const duties: BragExtractSuggestions["duties"] = Array.from(
    text.matchAll(/\b([A-Z][A-Z0-9 /&-]{2,40}?)-(\d{1,2})\b/g),
  ).map((m, i) => ({
    title: m[1].trim(),
    kind: i === 0 ? "primary" : "collateral",
    months_assigned: Number(m[2]),
    is_most_significant: i === 0,
  }));

  // 6. PFA cycles — "25-1 P" style pairs; a following category word within 30
  //    chars fills prt_category (title-cased).
  const pfa: BragPfaCycle[] = Array.from(
    text.matchAll(/\b(\d{2}-[12])\b[^A-Za-z0-9]{0,3}([PBFMWN])\b/g),
  ).map((m) => {
    const cycle: BragPfaCycle = {
      cycle: m[1],
      result: m[2] as BragPfaCycle["result"],
    };
    const after = text.slice(
      (m.index as number) + m[0].length,
      (m.index as number) + m[0].length + 30,
    );
    const cat = PRT_CATEGORY.exec(after);
    if (cat) {
      const word = cat[1].toLowerCase();
      cycle.prt_category = (word[0].toUpperCase() +
        word.slice(1)) as BragPfaCycle["prt_category"];
    }
    return cycle;
  });

  // 7. Quals — known warfare/PQS/NEC tokens; the surrounding phrase is the
  //    title, date left for the user to fill in.
  const quals: BragQualifications["quals"] = Array.from(
    text.matchAll(/\b(ESWS|EIWS|EAWS|SCW|IW|SW|AW|PQS|NEC\s?\d{3,4}[A-Z]?)\b/g),
  ).map((m) => ({
    title: phraseAround(text, m.index as number, m[0].length),
    date: "",
  }));

  // 8. Bullets — dash-led lines of substance, deduplicated, capped at 40.
  const bullets = Array.from(
    new Set(
      text
        .split(/\n|(?=\s-\s)/)
        .map((line) => /^\s*-\s+(.{20,})/.exec(line)?.[1]?.trim())
        .filter((b): b is string => !!b),
    ),
  ).slice(0, 40);

  return {
    kind,
    admin,
    duties,
    quals,
    pfa,
    bullets,
    chars_extracted: text.trim().length,
  };
}
