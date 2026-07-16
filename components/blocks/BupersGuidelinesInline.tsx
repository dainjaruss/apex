// components/blocks/BupersGuidelinesInline.tsx
//
// Dynamic, context-aware inline box displaying BUPERSINST 1610.10H reference
// guidelines for the currently active field.
//
// Style: "Electric Emerald & Deep Slate Glassmorphism" — ultra-sharp modern dark slate
// glass container (`bg-slate-900/95`) with pure white body text and a distinct electric
// emerald checklist guard box on the right for high-contrast scanning. Header is
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
    <div className="sticky top-4 z-30 mb-6 p-4 rounded-xl border-2 border-slate-700 bg-slate-900/95 border-l-4 border-l-indigo-400 shadow-2xl backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-2">
      {/* Header: Reference (left) · Name (center) · Block (right) */}
      <div className="grid grid-cols-3 items-center gap-2 border-b border-slate-700 pb-2.5 mb-3">
        <div className="justify-self-start flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-950 border border-indigo-500/60 text-indigo-300">
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
          <span className="text-[10px] font-black uppercase tracking-wider">
            Reference
          </span>
        </div>

        <h4 className="justify-self-center text-center text-sm font-extrabold tracking-wide text-white">
          {guideline.title}
        </h4>

        <span className="justify-self-end font-extrabold tracking-wider text-[10px] uppercase px-2 py-0.5 rounded border text-indigo-300 bg-indigo-950 border-indigo-500/60 shadow-sm">
          {guideline.block}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-10 gap-4">
        <div className="md:col-span-6 flex gap-2.5 items-start">
          <span className="text-indigo-400 mt-0.5 flex-shrink-0">
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
          <p className="text-white text-xs leading-relaxed italic font-normal">
            "{guideline.excerpt}"
          </p>
        </div>
        <div className="md:col-span-4 border-t md:border-t-0 md:border-l-2 border-emerald-500/60 pt-3 md:pt-0 md:pl-4 bg-emerald-950/10 rounded-r-lg py-1 pr-2">
          <span className="text-[10px] font-black text-emerald-300 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
            <span>✓</span> Validation Checklist:
          </span>
          <ul className="list-disc pl-4 space-y-1 text-white text-xs font-medium marker:text-emerald-400">
            {guideline.rules.map((rule, idx) => (
              <li key={idx}>{rule}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
