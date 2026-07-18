// components/brag/ExtractPreview.tsx
//
// Extraction preview for uploaded prior-EVAL / PRIMS PDFs (spec §6). Renders
// the BragExtractSuggestions groups as cards, each item with an explicit
// Accept button — nothing merges into the brag sheet without a click
// (spec §4.5: precision over recall; suggestions only).
//

"use client";

import React from "react";
import type { BragExtractSuggestions } from "@/lib/bragSheet/extract";
import type {
  BragAdmin,
  BragDuty,
  BragPfaCycle,
  BragQualifications,
} from "@/lib/bragSheet/types";

const KIND_LABELS: Record<BragExtractSuggestions["kind"], string> = {
  prior_eval: "Prior evaluation",
  prims: "PRIMS report",
  unknown: "Unrecognized document",
};

const ADMIN_LABELS: Partial<Record<keyof BragAdmin, string>> = {
  member_name: "Member name",
  ship_station: "Ship / station",
  prior_report_end: "Prior report end",
  date_reported: "Date reported",
};

function Group({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold gold-accent uppercase tracking-wider">
        {title}
      </h4>
      <ul className="space-y-1.5">{children}</ul>
    </div>
  );
}

function SuggestionRow({
  label,
  value,
  onAccept,
}: {
  label?: string;
  value: string;
  onAccept: () => void;
}) {
  return (
    <li
      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-xs"
      style={{ background: "var(--card-elevated)" }}
    >
      <span className="min-w-0" style={{ color: "var(--foreground)" }}>
        {label && (
          <span
            className="font-semibold mr-1.5"
            style={{ color: "var(--muted-foreground)" }}
          >
            {label}:
          </span>
        )}
        {value}
      </span>
      <button
        type="button"
        className="apex-btn-secondary py-1 px-2.5 text-xs shrink-0"
        onClick={onAccept}
      >
        Accept
      </button>
    </li>
  );
}

export default function ExtractPreview({
  suggestions,
  onAcceptAdmin,
  onAcceptDuty,
  onAcceptQual,
  onAcceptPfa,
  onAcceptBullet,
  onClose,
}: {
  suggestions: BragExtractSuggestions;
  onAcceptAdmin: (patch: Partial<BragAdmin>) => void;
  onAcceptDuty: (
    duty: Pick<
      BragDuty,
      "title" | "kind" | "months_assigned" | "is_most_significant"
    >,
  ) => void;
  onAcceptQual: (qual: BragQualifications["quals"][number]) => void;
  onAcceptPfa: (cycle: BragPfaCycle) => void;
  onAcceptBullet: (text: string) => void;
  onClose: () => void;
}) {
  const adminEntries = (
    Object.keys(ADMIN_LABELS) as (keyof BragAdmin)[]
  ).filter((k) => typeof suggestions.admin[k] === "string");
  const empty =
    adminEntries.length === 0 &&
    suggestions.duties.length === 0 &&
    suggestions.quals.length === 0 &&
    suggestions.pfa.length === 0 &&
    suggestions.bullets.length === 0;

  return (
    <section className="apex-card p-4 space-y-4" aria-label="Extraction preview">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-bold apex-heading">
            Extraction preview — {KIND_LABELS[suggestions.kind]}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "var(--subtle)" }}>
            {suggestions.chars_extracted.toLocaleString()} characters read.
            Accept only what looks right — nothing is added without a click.
          </p>
        </div>
        <button
          type="button"
          className="apex-btn-secondary py-1 px-3 text-xs"
          onClick={onClose}
        >
          Dismiss
        </button>
      </div>

      {empty && (
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Nothing recognizable was found in this PDF.
        </p>
      )}

      {adminEntries.length > 0 && (
        <Group title="Admin data">
          {adminEntries.map((k) => (
            <SuggestionRow
              key={k}
              label={ADMIN_LABELS[k]}
              value={String(suggestions.admin[k])}
              onAccept={() => onAcceptAdmin({ [k]: suggestions.admin[k] })}
            />
          ))}
        </Group>
      )}

      {suggestions.duties.length > 0 && (
        <Group title="Duties">
          {suggestions.duties.map((d, i) => (
            <SuggestionRow
              key={i}
              value={`${d.title} — ${d.months_assigned} mo (${d.kind}${
                d.is_most_significant ? ", most significant" : ""
              })`}
              onAccept={() => onAcceptDuty(d)}
            />
          ))}
        </Group>
      )}

      {suggestions.quals.length > 0 && (
        <Group title="Qualifications">
          {suggestions.quals.map((q, i) => (
            <SuggestionRow
              key={i}
              value={q.title}
              onAccept={() => onAcceptQual(q)}
            />
          ))}
        </Group>
      )}

      {suggestions.pfa.length > 0 && (
        <Group title="PFA cycles">
          {suggestions.pfa.map((c, i) => (
            <SuggestionRow
              key={i}
              value={`${c.cycle}: ${c.result}${
                c.prt_category ? ` — ${c.prt_category}` : ""
              }`}
              onAccept={() => onAcceptPfa(c)}
            />
          ))}
        </Group>
      )}

      {suggestions.bullets.length > 0 && (
        <Group title="Accomplishment bullets">
          {suggestions.bullets.map((b, i) => (
            <SuggestionRow key={i} value={b} onAccept={() => onAcceptBullet(b)} />
          ))}
        </Group>
      )}
    </section>
  );
}
