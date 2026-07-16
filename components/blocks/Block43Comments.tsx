// components/blocks/Block43Comments.tsx
//
// Narrative step: Block 43 (Comments on Performance) and Block 44 (Qualifications /
// Achievements). Both use the shared MeasuredCourierField canvas, which wraps exactly as
// the printed form. Block 43 keeps its 10/12-pitch toggle (90/84 CPL); Block 44 is a fixed
// 10-pitch / 91 CPL / 2-line block per BUPERSINST 1610.10H.

"use client";

import React from "react";
import { Evaluation, ValidationIssue } from "@/types";
import { FIELD_FIT } from "@/lib/commentFit";
import BupersGuidelinesInline from "@/components/blocks/BupersGuidelinesInline";
import MeasuredCourierField from "@/components/blocks/MeasuredCourierField";
import { FORM_PANEL, FORM_SECTION_TITLE } from "@/lib/formStyles";

interface Block43CommentsProps {
  evalData: Evaluation;
  onChange: (fields: Partial<Evaluation>) => void;
  issues: ValidationIssue[];
  onFocusField?: (field: string | null) => void;
  activeField?: string | null;
}

export default function Block43Comments({
  evalData,
  onChange,
  issues,
  onFocusField,
  activeField,
}: Block43CommentsProps) {
  const pitch = (evalData.block_values?.comment_pitch || "10") as "10" | "12";
  const commentsCpl = pitch === "10" ? 90 : 84;

  const setPitch = (p: "10" | "12") =>
    onChange({ block_values: { ...evalData.block_values, comment_pitch: p } });

  const setBlockValue = (key: string, val: string) =>
    onChange({ block_values: { ...evalData.block_values, [key]: val } });

  const qualSpec = FIELD_FIT.qualifications;

  return (
    <div className={`${FORM_PANEL} mb-6 space-y-8`}>
      {/* ── Block 43: Comments on Performance ── */}
      <div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 border-b border-slate-700/40 pb-2">
          <div>
            <h3 className={FORM_SECTION_TITLE}>
              <span
                className="h-2 w-2 rounded-full bg-[var(--accent-cyan)]"
                aria-hidden
              />
              43: Comments on Performance
            </h3>
            <p
              className="text-xs mt-1"
              style={{ color: "var(--muted-foreground)" }}
            >
              Type directly in the Courier box — it wraps exactly as the printed
              form ({commentsCpl} chars/line × 18 lines).
            </p>
          </div>
          <div className="mt-3 sm:mt-0 flex items-center gap-2">
            <span className="text-xs text-slate-400 font-semibold uppercase">
              Printing Pitch:
            </span>
            <div
              className="flex rounded-lg border p-0.5"
              style={{
                borderColor: "var(--border)",
                background: "var(--form-input-bg)",
              }}
            >
              <PitchButton
                label="10-Pitch (90 CPL)"
                active={pitch === "10"}
                onClick={() => setPitch("10")}
              />
              <PitchButton
                label="12-Pitch (84 CPL)"
                active={pitch === "12"}
                onClick={() => setPitch("12")}
              />
            </div>
          </div>
        </div>

        <BupersGuidelinesInline
          activeField={activeField || null}
          sectionFields={["comments"]}
        />

        <MeasuredCourierField
          value={evalData.comments || ""}
          onChange={(v) => onChange({ comments: v })}
          charsPerLine={commentsCpl}
          maxLines={18}
          placeholder="TYPE PERFORMANCE NARRATIVE HERE…"
          onFocus={() => onFocusField?.("comments")}
          error={issues.find((i) => i.field === "comments")?.message}
          ariaLabel="Block 43 Comments on Performance"
        />
      </div>

      {/* ── Block 44: Qualifications / Achievements ── */}
      <div>
        <div className="mb-3 border-b border-slate-700/40 pb-2">
          <h3 className="text-lg font-bold gold-accent">
            44: Qualifications / Achievements
          </h3>
          <p className="text-xs text-slate-400">
            Education, awards, community involvement, etc., during this period (
            {qualSpec.charsPerLine} chars/line × {qualSpec.maxLines} lines).
          </p>
        </div>

        <BupersGuidelinesInline
          activeField={activeField || null}
          sectionFields={["qualifications"]}
        />

        <MeasuredCourierField
          value={evalData.block_values?.qualifications || ""}
          onChange={(v) => setBlockValue("qualifications", v)}
          charsPerLine={qualSpec.charsPerLine}
          maxLines={qualSpec.maxLines}
          placeholder="EDUCATION, AWARDS, COMMUNITY INVOLVEMENT…"
          onFocus={() => onFocusField?.("qualifications")}
          error={issues.find((i) => i.field === "qualifications")?.message}
          ariaLabel="Block 44 Qualifications and Achievements"
        />
      </div>
    </div>
  );
}

function PitchButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 text-xs font-bold rounded-md transition duration-150 ${active ? "apex-btn-primary py-1" : "apex-btn-ghost py-1"}`}
    >
      {label}
    </button>
  );
}
