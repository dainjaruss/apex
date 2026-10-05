// src/components/ValidationResultsModal.tsx
//
// Modal displaying BUPERSINST 1610.10H Zod validation results, categorized by NAVPERS block.
// Supports interactive "Jump to Block" navigation and clean 100% BUPERS compliance certification.

import React from "react";
import { ValidationIssue } from "@/types";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  X,
  ArrowRight,
  Check,
} from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  reportType?: string;
  onJumpToBlock?: (blockNumber: number, fieldName?: string) => void;
}

export const ValidationResultsModal: React.FC<Props> = ({
  isOpen,
  onClose,
  errors,
  warnings,
  reportType = "EVAL",
  onJumpToBlock,
}) => {
  if (!isOpen) return null;

  // Field first: CHIEFEVAL comments are Block 40, which a block<=40 test
  // would file under traits. The issue.block is already the printed number.
  const getCategory = (issue: ValidationIssue) => {
    const field = issue.field || "";
    const block = issue.block;
    if (field === "comments" || field.startsWith("comments.")) {
      return block
        ? `Narrative Comments & Monospace Fit (Block ${block})`
        : "Narrative Comments & Monospace Fit";
    }
    if (
      field === "career_recommendations" ||
      field.startsWith("career_recommendations")
    ) {
      return block
        ? `Career recommendations (Block ${block})`
        : "Career recommendations";
    }
    if (field === "promotion_recommendation") {
      return block
        ? `Promotion recommendation (Block ${block})`
        : "Promotion recommendation";
    }
    if (field === "qualifications") {
      return block ? `Qualifications (Block ${block})` : "Qualifications";
    }
    if (!block) return "General / Metadata";
    if (block <= 9) return "Administrative Identification (Blocks 1–9)";
    if (block <= 21) return "Service Occasion & Period (Blocks 10–21)";
    if (block <= 32) return "Command & Counseling (Blocks 22–32)";
    if (block >= 33 && block <= 39) return "Performance Traits (Blocks 33–39)";
    return "Recommendations & Signatures";
  };

  const groupedErrors = errors.reduce(
    (acc, issue) => {
      const cat = getCategory(issue);
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(issue);
      return acc;
    },
    {} as Record<string, ValidationIssue[]>
  );

  const groupedWarnings = warnings.reduce(
    (acc, issue) => {
      const cat = getCategory(issue);
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(issue);
      return acc;
    },
    {} as Record<string, ValidationIssue[]>
  );

  const allCategories = Array.from(
    new Set([...Object.keys(groupedErrors), ...Object.keys(groupedWarnings)])
  );

  const handleBlockJump = (issue: ValidationIssue) => {
    if (onJumpToBlock && issue.block) {
      onJumpToBlock(issue.block, issue.field);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold ${
                errors.length === 0
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                  : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
              }`}
            >
              {errors.length === 0 ? (
                <ShieldCheck className="w-5 h-5" />
              ) : (
                <AlertCircle className="w-5 h-5" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                BUPERSINST 1610.10H Rule Audit ({reportType})
              </h2>
              <p className="text-xs text-slate-500">
                Full schema cross-block pre-flight inspection against official Navy evaluation standards.
              </p>
            </div>
          </div>

          <button type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* Summary Banner */}
          <div
            className={`p-4 rounded-xl border flex items-center justify-between ${
              errors.length === 0
                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200"
                : "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200"
            }`}
          >
            <div>
              <div className="font-bold flex items-center gap-1.5">
                {errors.length === 0 ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <span>100% BUPERS Compliant — Zero Blockers</span>
                  </>
                ) : (
                  <>
                    <AlertCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <span>
                      {errors.length} Critical Validation {errors.length === 1 ? "Blocker" : "Blockers"}
                    </span>
                  </>
                )}
              </div>
              <p className="text-xs mt-0.5 opacity-90">
                {errors.length === 0
                  ? "This performance evaluation meets all mandatory BUPERS instructions, character width limits, and formatting rules. Ready for chain of custody signatures and official PDF generation."
                  : "Critical errors will cause administrative rejection by PERS-32. Review and correct the highlighted fields below."}
              </p>
            </div>

            {warnings.length > 0 && (
              <span className="font-mono text-xs px-2.5 py-1 bg-amber-100 text-amber-900 dark:bg-amber-900/60 dark:text-amber-200 rounded-lg border border-amber-300 dark:border-amber-700 shrink-0">
                {warnings.length} {warnings.length === 1 ? "Warning" : "Warnings"}
              </span>
            )}
          </div>

          {/* Grouped Issues */}
          {allCategories.map((cat) => {
            const catErrors = groupedErrors[cat] || [];
            const catWarnings = groupedWarnings[cat] || [];

            return (
              <div key={cat} className="space-y-2.5">
                <h3 className="font-bold text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-1 flex items-center justify-between">
                  <span>{cat}</span>
                  <span className="text-[11px] font-mono text-slate-400">
                    {catErrors.length} errors, {catWarnings.length} warnings
                  </span>
                </h3>

                <div className="space-y-2">
                  {catErrors.map((err, idx) => (
                    <div
                      key={`err-${idx}`}
                      className="p-3 bg-red-50/60 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold text-xs text-red-900 dark:text-red-200 flex items-center gap-1.5">
                            {err.block && (
                              <span className="font-mono bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-200 px-1.5 py-0.2 rounded text-[10px]">
                                Block {err.block}
                              </span>
                            )}
                            <span className="capitalize">{err.field?.replace(/_/g, " ")}</span>
                          </div>
                          <p className="text-xs text-red-800 dark:text-red-300 mt-0.5">
                            {err.message}
                          </p>
                        </div>
                      </div>

                      {onJumpToBlock && err.block && (
                        <button
                          type="button"
                          onClick={() => handleBlockJump(err)}
                          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/60 dark:hover:bg-red-800 text-red-800 dark:text-red-200 text-xs font-semibold rounded-lg transition-colors"
                        >
                          <span>Fix</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}

                  {catWarnings.map((warn, idx) => (
                    <div
                      key={`warn-${idx}`}
                      className="p-3 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl flex items-start justify-between gap-3"
                    >
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-semibold text-xs text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                            {warn.block && (
                              <span className="font-mono bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200 px-1.5 py-0.2 rounded text-[10px]">
                                Block {warn.block}
                              </span>
                            )}
                            <span className="capitalize">{warn.field?.replace(/_/g, " ")}</span>
                          </div>
                          <p className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                            {warn.message}
                          </p>
                        </div>
                      </div>

                      {onJumpToBlock && warn.block && (
                        <button
                          type="button"
                          onClick={() => handleBlockJump(warn)}
                          className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/60 dark:hover:bg-amber-800 text-amber-800 dark:text-amber-200 text-xs font-semibold rounded-lg transition-colors"
                        >
                          <span>Review</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
          <button type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold transition-colors"
          >
            Close Audit
          </button>
        </div>
      </div>
    </div>
  );
};
