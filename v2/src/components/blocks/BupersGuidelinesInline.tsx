// src/components/blocks/BupersGuidelinesInline.tsx
//
// Context-sensitive BUPERSINST 1610.10H reference guide for the focused field.
// Renders authoritative Navy regulatory excerpts and bulleted validation checklists.

import React from "react";
import { bupersGuidelines, Guideline } from "@/lib/bupersGuidelines";
import { BookOpen, CheckCircle, HelpCircle, X } from "lucide-react";

interface Props {
  activeField: string | null;
  sectionFields?: string[];
  onDismiss?: () => void;
}

export const BupersGuidelinesInline: React.FC<Props> = ({
  activeField,
  sectionFields,
  onDismiss,
}) => {
  if (!activeField) return null;
  if (sectionFields && !sectionFields.includes(activeField)) return null;

  const guideline: Guideline | undefined = bupersGuidelines[activeField];
  if (!guideline) return null;

  return (
    <aside
      className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-900/80 border-l-4 border-l-amber-500 dark:border-l-amber-400 rounded-xl p-4 shadow-md transition-all duration-200 mb-4"
      aria-label="BUPERS field reference"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-2.5 mb-3 border-b border-amber-200 dark:border-amber-900/60">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-200/80 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200 border border-amber-300 dark:border-amber-800">
            <BookOpen className="w-3 h-3 text-amber-700 dark:text-amber-300" />
            BUPERS Reference
          </span>
          <h4 className="text-sm font-extrabold text-amber-950 dark:text-amber-100 tracking-wide">
            {guideline.title}
          </h4>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 shadow-2xs">
            {guideline.block}
          </span>
          {onDismiss && (
            <button type="button"
              onClick={onDismiss}
              className="text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200 p-0.5"
              title="Dismiss reference"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-10 gap-4 text-xs">
        {/* Regulatory Excerpt */}
        <div className="md:col-span-6 flex gap-2.5 items-start">
          <HelpCircle className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-amber-950/90 dark:text-amber-200/90 leading-relaxed italic">
            "{guideline.excerpt}"
          </p>
        </div>

        {/* Validation Checklist */}
        <div className="md:col-span-4 border-t md:border-t-0 md:border-l border-amber-200 dark:border-amber-900/60 pt-3 md:pt-0 md:pl-4 space-y-1.5">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-900 dark:text-amber-300 flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            Validation Checklist
          </span>
          <ul className="space-y-1 text-amber-900 dark:text-amber-200">
            {guideline.rules.map((rule, idx) => (
              <li key={idx} className="flex items-start gap-1.5 leading-tight">
                <span className="text-emerald-600 dark:text-emerald-400 font-bold shrink-0">✓</span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
};
