// src/components/evaluations/NewEvalPicker.tsx
//
// Form selection picker for drafting a new performance report.
// Matches the original APEX v1 flow: displays paygrade-gated cards for
// EVAL (NAVPERS 1616/26), CHIEFEVAL (NAVPERS 1616/27), and FITREP (NAVPERS 1610/2).

import React from "react";
import { FormCode } from "@/types";
import { FileText, Award, Shield, ArrowRight, X } from "lucide-react";

interface Props {
  onSelectForm: (formCode: FormCode) => void;
  onCancel: () => void;
}

const FORM_OPTIONS = [
  {
    code: "EVAL" as FormCode,
    navpers: "NAVPERS 1616/26",
    revision: "REV 05-2025",
    title: "Enlisted Performance Evaluation & Counseling Record",
    paygrades: "E1 through E6",
    badge: "EVAL",
    badgeColor: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-800",
    description: "Standard evaluation for Sailors E1 to E6. Features 7 traits, 1.0/3.0/5.0 printed standards, and 17-line Block 43 narrative at 10-pitch.",
    icon: FileText,
  },
  {
    code: "CHIEFEVAL" as FormCode,
    navpers: "NAVPERS 1616/27",
    revision: "REV 05-2025",
    title: "Chief Petty Officer Evaluation & Counseling Record",
    paygrades: "E7 through E9",
    badge: "CHIEFEVAL",
    badgeColor: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800",
    description: "Senior enlisted report for Chiefs, Senior Chiefs, and Master Chiefs. Features CPO trait competencies and 8-line Block 40 narrative.",
    icon: Award,
  },
  {
    code: "FITREP_W2_O6" as FormCode,
    navpers: "NAVPERS 1610/2",
    revision: "REV 05-2025",
    title: "Officer Fitness Report & Counseling Record",
    paygrades: "W2 through O6",
    badge: "FITREP",
    badgeColor: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-800",
    description: "Official fitness report for Warrant Officers and Commissioned Officers up to Captain. Includes Tactical Performance trait and 19-line Block 41 narrative.",
    icon: Shield,
  },
];

export const NewEvalPicker: React.FC<Props> = ({ onSelectForm, onCancel }) => {
  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">
            Step 1 of 2: Select Report Template
          </span>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            Choose Evaluation Form
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Select the official NAVPERS form corresponding to the Service member's paygrade.
          </p>
        </div>

        <button
          onClick={onCancel}
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Form Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {FORM_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <div
              key={opt.code}
              onClick={() => onSelectForm(opt.code)}
              className="group bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 hover:border-blue-600 dark:hover:border-blue-500 rounded-2xl p-6 shadow-sm hover:shadow-lg transition-all cursor-pointer flex flex-col justify-between space-y-4"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded border ${opt.badgeColor}`}>
                    {opt.badge}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500">
                    {opt.paygrades}
                  </span>
                </div>

                <div className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 group-hover:bg-blue-50 dark:group-hover:bg-blue-950/60 text-slate-700 dark:text-slate-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 flex items-center justify-center transition-colors">
                  <Icon className="w-6 h-6" />
                </div>

                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                    {opt.navpers}
                  </h3>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">
                    {opt.revision}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                    {opt.description}
                  </p>
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs font-semibold text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform">
                <span>Start Draft</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
