"use client";

import React from "react";
import { ValidationIssue } from "@/types";

interface ValidationResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  onConfirmSubmit?: () => void;
  isSubmitting?: boolean;
}

export default function ValidationResultsModal({
  isOpen,
  onClose,
  errors,
  warnings,
  onConfirmSubmit,
  isSubmitting = false,
}: ValidationResultsModalProps) {
  if (!isOpen) return null;

  // Categorize errors/warnings for better visualization
  const getCategory = (block?: number) => {
    if (!block) return "General/Metadata";
    if (block <= 8) return "Administrative (Blocks 1-8)";
    if (block <= 32) return "Service & Counseling (Blocks 14-32)";
    if (block <= 40) return "Performance Traits (Blocks 33-40)";
    if (block === 43) return "Performance narrative comments (Block 43)";
    return "Recommendations & Signatures (Blocks 41-52)";
  };

  const groupedErrors = errors.reduce(
    (acc, issue) => {
      const cat = getCategory(issue.block);
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(issue);
      return acc;
    },
    {} as Record<string, ValidationIssue[]>,
  );

  const groupedWarnings = warnings.reduce(
    (acc, issue) => {
      const cat = getCategory(issue.block);
      if (!acc[cat]) acc[cat] = [];
      acc[acc[cat] ? cat : getCategory(issue.block)].push(issue);
      return acc;
    },
    {} as Record<string, ValidationIssue[]>,
  );

  const totalErrors = errors.length;
  const totalWarnings = warnings.length;

  return (
    <div className="apex-modal-overlay animate-fade-in">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl apex-card shadow-2xl overflow-hidden">
        <div
          className="p-6 border-b flex items-center justify-between"
          style={{
            borderColor: "var(--border)",
            background: "var(--card-elevated)",
          }}
        >
          <div>
            <h2 className="text-xl font-bold apex-heading tracking-wide flex items-center gap-2">
              <span>📋</span> Validation Rules Check
            </h2>
            <p
              className="text-xs mt-1"
              style={{ color: "var(--muted-foreground)" }}
            >
              BUPERSINST 1610.10H (EVALMAN) compliance check results
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg transition-colors hover:opacity-80"
            style={{ color: "var(--muted-foreground)" }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {/* Summary Banner */}
          {totalErrors > 0 ? (
            <div className="p-4 rounded-xl border border-red-500/20 bg-red-950/20 flex gap-3 items-start">
              <span className="text-red-400 text-lg">⚠️</span>
              <div>
                <h4 className="text-sm font-semibold text-red-200">
                  Validation Blocker Errors Detected
                </h4>
                <p className="text-xs text-red-300/80 mt-1">
                  You have {totalErrors} critical errors that must be resolved
                  before this evaluation can be certified or submitted for
                  review.
                </p>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-950/20 flex gap-3 items-start">
              <span className="text-emerald-400 text-lg">✓</span>
              <div>
                <h4 className="text-sm font-semibold text-emerald-200">
                  No Blockers Found
                </h4>
                <p className="text-xs text-emerald-300/80 mt-1">
                  All critical database rules and monospace dimensions are
                  satisfied.
                </p>
              </div>
            </div>
          )}

          {/* Errors Section */}
          {totalErrors > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>✕</span> Blocker Errors ({totalErrors})
              </h3>
              <div className="space-y-4">
                {Object.entries(groupedErrors).map(([category, items]) => (
                  <div
                    key={category}
                    className="rounded-lg bg-slate-900/60 border border-slate-800/80 overflow-hidden"
                  >
                    <div className="px-4 py-2 bg-slate-800/40 text-xs font-semibold text-[#c0d6e4] border-b border-slate-800/80">
                      {category}
                    </div>
                    <ul className="divide-y divide-slate-800/50">
                      {items.map((item, idx) => (
                        <li
                          key={idx}
                          className="p-3 text-xs flex gap-2.5 items-start text-red-200/90"
                        >
                          <span className="text-red-400 mt-0.5">•</span>
                          <div>
                            <span className="font-semibold text-red-300 mr-1.5">
                              {item.block ? `Block ${item.block}:` : "General:"}
                            </span>
                            {item.message}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Warnings Section */}
          {totalWarnings > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>⚠️</span> Guidelines Warnings ({totalWarnings})
              </h3>
              <div className="space-y-4">
                {Object.entries(groupedWarnings).map(([category, items]) => (
                  <div
                    key={category}
                    className="rounded-lg bg-slate-900/60 border border-slate-800/80 overflow-hidden"
                  >
                    <div className="px-4 py-2 bg-slate-800/40 text-xs font-semibold text-[#c0d6e4] border-b border-slate-800/80">
                      {category}
                    </div>
                    <ul className="divide-y divide-slate-800/50">
                      {items.map((item, idx) => (
                        <li
                          key={idx}
                          className="p-3 text-xs flex gap-2.5 items-start text-amber-200/90"
                        >
                          <span className="text-amber-400 mt-0.5">•</span>
                          <div>
                            <span className="font-semibold text-amber-300 mr-1.5">
                              {item.block ? `Block ${item.block}:` : "General:"}
                            </span>
                            {item.message}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="p-6 border-t flex flex-col-reverse sm:flex-row justify-end gap-3"
          style={{
            borderColor: "var(--border)",
            background: "var(--card-elevated)",
          }}
        >
          <button type="button" onClick={onClose} className="apex-btn-secondary">
            Close Results
          </button>

          {totalErrors === 0 && onConfirmSubmit && (
            <button
              type="button"
              onClick={onConfirmSubmit}
              disabled={isSubmitting}
              className="apex-btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              {isSubmitting ? "Submitting..." : "Submit Evaluation"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
