// components/blocks/BupersGuidelinesInline.tsx
//
// Dynamic, context-aware inline box displaying BUPERSINST 1610.10H reference
// guidelines for the currently active field.
//
// Style: "Navy Blue Reference" — calm sky-on-navy that ties to the APEX primary
// (#3e6e99) and reads as helpful reference guidance (not a warning). Header is
// three-up: Reference pill (left) · field title (center) · block badge (right).

"use client";

import React from "react";
import { bupersGuidelines } from "@/lib/bupersGuidelines";
import { useGuidelinesVisible } from "@/components/GuidelinesVisibility";

interface Props {
  activeField: string | null;
  sectionFields: string[];
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
    <div className="sticky top-4 z-30 mb-6 p-4 rounded-xl border border-sky-900/40 border-l-2 border-l-[#3e6e99] bg-[#0d1b30] bg-gradient-to-br from-[#0d1b30] to-[#16243a] shadow-lg shadow-sky-950/40 transition-all duration-300 animate-in fade-in slide-in-from-top-2 duration-200">
      {/* Header: Reference (left) · Name (center) · Block (right) */}
      <div className="grid grid-cols-3 items-center gap-2 border-b border-sky-900/30 pb-2.5 mb-3">
        <div className="justify-self-start flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-950/50 border border-sky-900/40 text-sky-300">
          <svg
            className="w-3.5 h-3.5"
            fill="currentColor"
            viewBox="0 0 20 20"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clipRule="evenodd"
            ></path>
          </svg>
          <span className="text-[10px] font-extrabold uppercase tracking-wider">
            Reference
          </span>
        </div>

        <h4 className="justify-self-center text-center text-sm font-bold tracking-wide text-slate-100">
          {guideline.title}
        </h4>

        <span className="justify-self-end font-extrabold tracking-wider text-[10px] uppercase px-2 py-0.5 rounded border text-sky-300 bg-sky-950/60 border-sky-900/50 shadow-sm">
          {guideline.block}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-10 gap-4">
        <div className="md:col-span-6 flex gap-2.5 items-start">
          <span className="text-[#91aec9] mt-0.5 flex-shrink-0">
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 20 20"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              ></path>
            </svg>
          </span>
          <p className="text-slate-300 text-xs leading-relaxed italic">
            "{guideline.excerpt}"
          </p>
        </div>
        <div className="md:col-span-4 border-t md:border-t-0 md:border-l border-slate-800/80 pt-3 md:pt-0 md:pl-4">
          <span className="text-[10px] font-extrabold text-sky-300 uppercase tracking-wider block mb-1.5">
            Validation Rules:
          </span>
          <ul className="list-disc pl-4 space-y-1 text-slate-300 text-xs marker:text-sky-500/70">
            {guideline.rules.map((rule, idx) => (
              <li key={idx}>{rule}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
