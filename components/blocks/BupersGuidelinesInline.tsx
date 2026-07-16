// components/blocks/BupersGuidelinesInline.tsx
//
// Context-aware BUPERSINST 1610.10H reference for the focused field.
// Styled as a theme-aware sticky note (see .apex-reference-tip in globals.css).

"use client";

import React from "react";
import { bupersGuidelines } from "@/lib/bupersGuidelines";
import { useGuidelinesVisible } from "@/components/GuidelinesVisibility";

interface Props {
  activeField: string | null;
  sectionFields: string[];
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="currentColor"
      viewBox="0 0 20 20"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export default function BupersGuidelinesInline({
  activeField,
  sectionFields,
}: Props) {
  const visible = useGuidelinesVisible();
  if (!visible) return null;
  if (!activeField || !sectionFields.includes(activeField)) return null;

  const guideline = bupersGuidelines[activeField];
  if (!guideline) return null;

  return (
    <aside className="apex-reference-tip" aria-label="BUPERS field reference">
      <div className="apex-reference-tip__header">
        <div className="apex-reference-tip__pill">
          <InfoIcon className="w-3.5 h-3.5" />
          <span>Reference</span>
        </div>

        <h4 className="apex-reference-tip__title">{guideline.title}</h4>

        <span className="apex-reference-tip__block">{guideline.block}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-10 gap-4">
        <div className="md:col-span-6 flex gap-2.5 items-start">
          <InfoIcon className="w-4 h-4 mt-0.5 flex-shrink-0 apex-reference-tip__icon" />
          <p className="apex-reference-tip__excerpt">
            &ldquo;{guideline.excerpt}&rdquo;
          </p>
        </div>
        <div className="md:col-span-4 apex-reference-tip__checklist">
          <span className="apex-reference-tip__checklist-title">
            <span aria-hidden>✓</span> Validation checklist
          </span>
          <ul>
            {guideline.rules.map((rule, idx) => (
              <li key={idx}>{rule}</li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}