import React from "react";
import {
  TRAIT_STANDARDS_LOOKUP,
  TRAIT_GRADE_LABELS,
  GRADE_SCALE_NOTE,
  ANCHOR_GRADES,
  getSubstantiationNote,
  TraitKey,
  AnchorGrade,
} from "@/lib/traitStandards";

const ANCHOR_HEADING: Record<string, string> = {
  "1.0": "var(--trait-anchor-amber-heading)",
  "3.0": "var(--trait-anchor-sky-heading)",
  "5.0": "var(--trait-anchor-emerald-heading)",
};

export default function TraitStandardPanel({
  traitKey,
  grade,
  reportType,
}: {
  traitKey: TraitKey;
  grade: string;
  reportType?: string;
}) {
  const std = TRAIT_STANDARDS_LOOKUP[traitKey];
  if (!std) return null;

  const isAnchor = (ANCHOR_GRADES as readonly string[]).includes(grade);
  const needsJustification = grade === "1.0" || grade === "5.0";
  const headingColor = ANCHOR_HEADING[grade] ?? "var(--muted-foreground)";

  return (
    <div
      className="apex-trait-standard-panel"
      data-anchor={isAnchor ? grade : undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
        <span
          className="text-xs font-bold uppercase tracking-wider"
          style={{ color: headingColor }}
        >
          {grade} — {TRAIT_GRADE_LABELS[grade] ?? grade}
        </span>
        {needsJustification && (
          <span
            className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 border"
            style={{
              color: "var(--trait-anchor-amber-heading)",
              background: "color-mix(in srgb, var(--accent-gold) 12%, transparent)",
              borderColor: "var(--trait-anchor-amber-border)",
            }}
          >
            Requires written justification (Block 43)
          </span>
        )}
      </div>

      {isAnchor ? (
        <ul className="space-y-1">
          {std.anchors[grade as AnchorGrade].map((bullet, i) => (
            <li
              key={i}
              className="flex gap-2 text-xs leading-snug"
              style={{ color: "var(--foreground)" }}
            >
              <span
                className="mt-px select-none"
                style={{ color: headingColor }}
              >
                •
              </span>
              <span>{bullet}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p
          className="text-xs italic leading-snug"
          style={{ color: "var(--muted-foreground)" }}
        >
          {GRADE_SCALE_NOTE[grade] ??
            "Select a grade to view its performance standard."}
        </p>
      )}

      {needsJustification && (
        <p
          className="mt-2 pt-2 border-t text-[11px] leading-snug"
          style={{
            borderColor: "var(--border)",
            color: "var(--subtle)",
          }}
        >
          {getSubstantiationNote(reportType)}
        </p>
      )}
    </div>
  );
}