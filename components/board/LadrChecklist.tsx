// components/board/LadrChecklist.tsx
//
// LaDR milestone checklist for the Board Confidence Analyzer (spec §6, tab 2).
// Auto-loaded for the selected rating + target paygrade; grouped by category
// ordered by LADR_CATEGORY_WEIGHTS descending, zero-weight categories last
// under "Informational — not scored". Applicability rule (spec §3):
// min(applies_to_paygrades) <= target paygrade.
//

"use client";

import React from "react";
import { LADR_CATEGORY_WEIGHTS } from "@/lib/boardConfidence/rubric";
import type {
  LadrCategory,
  LadrDocument,
  LadrMilestone,
  LadrStatus,
  MemberBoardRecord,
} from "@/lib/boardConfidence/types";

type Checklist = MemberBoardRecord["ladr_checklist"];

interface LadrChecklistProps {
  document: LadrDocument | null;
  milestones: LadrMilestone[];
  targetPaygrade: number | null;
  checklist: Checklist;
  onChange: (next: Checklist) => void;
  onSave: () => void;
  saving: boolean;
}

const CATEGORY_LABELS: Record<LadrCategory, string> = {
  qual_warfare: "Warfare qualifications",
  pme_required: "PME — required",
  qual_rate_specific: "Rate-specific qualifications",
  qual_watchstanding: "Watchstanding qualifications",
  skill_training_required: "Skill training — required",
  credential: "Credentials",
  education_degree: "Education — degree",
  nec_opportunity: "NEC opportunities",
  pme_recommended: "PME — recommended",
  skill_training_recommended: "Skill training — recommended",
  advancement_consideration: "E7+ advancement considerations (board emphasis)",
  career_milestone: "Career milestones",
  billet_recommended: "Recommended billets",
};

const STATUS_OPTIONS: Array<[LadrStatus, string]> = [
  ["met", "Met"],
  ["not_met", "Not met"],
  ["na", "N/A"],
];

function EmptyCard({ message }: { message: string }) {
  return (
    <div className="apex-card p-8 text-center">
      <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
        {message}
      </p>
    </div>
  );
}

export default function LadrChecklist({
  document,
  milestones,
  targetPaygrade,
  checklist,
  onChange,
  onSave,
  saving,
}: LadrChecklistProps) {
  if (!document) {
    return (
      <EmptyCard message="Select your rating on the Record Entry tab to load the LaDR checklist." />
    );
  }
  if (targetPaygrade == null) {
    return (
      <EmptyCard message="Select a target paygrade on the Record Entry tab to filter the LaDR checklist." />
    );
  }

  const applicable = milestones.filter(
    (m) =>
      m.applies_to_paygrades.length > 0 &&
      Math.min(...m.applies_to_paygrades) <= targetPaygrade,
  );

  const byCategory = new Map<LadrCategory, LadrMilestone[]>();
  for (const m of applicable) {
    const list = byCategory.get(m.category) ?? [];
    list.push(m);
    byCategory.set(m.category, list);
  }
  const categories = Array.from(byCategory.keys()).sort(
    (a, b) =>
      LADR_CATEGORY_WEIGHTS[b] - LADR_CATEGORY_WEIGHTS[a] || a.localeCompare(b),
  );
  const scored = categories.filter((c) => LADR_CATEGORY_WEIGHTS[c] > 0);
  const informational = categories.filter((c) => LADR_CATEGORY_WEIGHTS[c] === 0);

  // v1.4: milestones ingested by the on-demand Navy COOL fetch are flagged
  // auto_extracted — surface that they should be verified against the PDF.
  const hasAutoExtracted = applicable.some(
    (m) => m.detail?.source === "auto_extracted",
  );

  const setStatus = (id: string, status: LadrStatus) => {
    const next = { ...checklist };
    if (status === "unanswered") delete next[id];
    else
      next[id] = {
        status,
        verified_in_ompf:
          status === "met" ? (next[id]?.verified_in_ompf ?? false) : false,
      };
    onChange(next);
  };

  const setVerified = (id: string, verified: boolean) => {
    const entry = checklist[id];
    if (!entry || entry.status !== "met") return;
    onChange({ ...checklist, [id]: { ...entry, verified_in_ompf: verified } });
  };

  const renderCategory = (cat: LadrCategory) => {
    const weight = LADR_CATEGORY_WEIGHTS[cat];
    return (
      <section key={cat} className="apex-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
            {CATEGORY_LABELS[cat]}
          </h3>
          {weight > 0 ? (
            <span className="apex-badge-amber px-2 py-0.5 text-[10px]">
              weight {weight}
            </span>
          ) : (
            <span className="apex-badge-draft px-2 py-0.5 text-[10px]">
              not scored
            </span>
          )}
        </div>
        <ul className="space-y-3">
          {(byCategory.get(cat) ?? []).map((m) => {
            const id = m.id as string;
            const entry = checklist[id];
            const status: LadrStatus = entry?.status ?? "unanswered";
            return (
              <li
                key={id}
                className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-3 last:border-b-0 last:pb-0"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="min-w-[14rem] flex-1">
                  <span className="text-sm apex-heading">{m.item}</span>
                  {m.item_code && (
                    <span
                      className="ml-2 text-xs font-mono"
                      style={{ color: "var(--subtle)" }}
                    >
                      {m.item_code}
                    </span>
                  )}
                </div>
                <div
                  role="radiogroup"
                  aria-label={`Status for ${m.item}`}
                  className="flex items-center gap-3"
                >
                  {STATUS_OPTIONS.map(([value, label]) => (
                    <label
                      key={value}
                      className="flex items-center gap-1.5 text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      <input
                        type="radio"
                        name={`ladr-${id}`}
                        checked={status === value}
                        onChange={() => setStatus(id, value)}
                      />
                      {label}
                    </label>
                  ))}
                  {status !== "unanswered" && (
                    <button
                      type="button"
                      className="text-xs underline"
                      style={{ color: "var(--subtle)" }}
                      onClick={() => setStatus(id, "unanswered")}
                      aria-label={`Clear status for ${m.item}`}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <label
                  className="flex items-center gap-2 text-xs"
                  style={{
                    color: "var(--muted-foreground)",
                    opacity: status === "met" ? 1 : 0.5,
                  }}
                >
                  <input
                    type="checkbox"
                    disabled={status !== "met"}
                    checked={entry?.verified_in_ompf ?? false}
                    onChange={(e) => setVerified(id, e.target.checked)}
                    aria-label={`${m.item} verified in OMPF`}
                  />
                  Verified in OMPF
                </label>
              </li>
            );
          })}
        </ul>
      </section>
    );
  };

  return (
    <div className="space-y-4">
      <p className="apex-page-subtitle">
        {document.rating_name} ({document.rating_abbrev}) LaDR ·{" "}
        {document.version} ·{" "}
        <a
          href={document.source_url}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          source
        </a>{" "}
        · showing items applicable up to E-{targetPaygrade}. Unanswered items
        lower scoring confidence; they never count as not-met.
      </p>

      {hasAutoExtracted && (
        <p
          role="note"
          className="text-xs border-l-2 pl-3"
          style={{
            color: "var(--muted-foreground)",
            borderColor: "var(--accent-gold)",
          }}
        >
          Some items were auto-extracted from the official PDF — verify them
          against the source document before relying on them.
        </p>
      )}

      {applicable.length === 0 ? (
        <EmptyCard message="No applicable LaDR items for this rating and target paygrade." />
      ) : (
        <>
          {scored.map(renderCategory)}
          {informational.length > 0 && (
            <>
              <h2
                className="text-xs font-bold uppercase tracking-wider pt-2"
                style={{ color: "var(--muted-foreground)" }}
              >
                Informational — not scored
              </h2>
              {informational.map(renderCategory)}
            </>
          )}
        </>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          className="apex-btn-primary disabled:opacity-50"
          onClick={onSave}
          disabled={saving}
        >
          {saving ? "Saving…" : "Save checklist"}
        </button>
      </div>
    </div>
  );
}
