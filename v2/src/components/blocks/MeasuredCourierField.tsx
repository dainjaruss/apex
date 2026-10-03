// src/components/blocks/MeasuredCourierField.tsx
//
// Reusable Block-43-style measuring canvas: a Courier-monospace textarea sized to exactly
// `charsPerLine`, so it wraps on screen the same way the printed form/PDF will, with a live
// line-number gutter, line counter, and overflow styling. Used by Blocks 28, 29, 43, and 44.

import React, { useEffect, useRef } from "react";
import { measureTextFit } from "@/lib/commentFit";

const LINE_PX = 22;

interface Props {
  value: string;
  onChange: (value: string) => void;
  charsPerLine: number;
  maxLines: number;
  placeholder?: string;
  onFocus?: () => void;
  error?: string | null;
  fieldId?: string;
  label?: string;
  firstLineLead?: number;
}

export const MeasuredCourierField: React.FC<Props> = ({
  value,
  onChange,
  charsPerLine,
  maxLines,
  placeholder,
  onFocus,
  error,
  fieldId,
  label,
  firstLineLead = 0,
}) => {
  const fit = measureTextFit(
    value || "",
    charsPerLine,
    maxLines,
    firstLineLead,
  );
  const rows = Math.max(maxLines, fit.linesUsed);
  const over = !fit.fit;
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Grow the textarea to fit its content (never shorter than the printed line budget).
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.max(ta.scrollHeight, maxLines * LINE_PX)}px`;
  }, [value, charsPerLine, maxLines]);

  const textareaId =
    fieldId || (label ? `eval-courier-${label.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}` : undefined);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between mb-1 text-xs">
        {label && (
          <label htmlFor={textareaId} className="font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            {label}
          </label>
        )}
        <span
          className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
            over
              ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
              : fit.linesUsed >= maxLines
              ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
              : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          }`}
        >
          Lines: {fit.linesUsed} / {maxLines} ({charsPerLine} CPL)
        </span>
      </div>

      <div
        className={`flex w-fit max-w-full border rounded-xl overflow-x-auto py-2 bg-white dark:bg-slate-950 transition-colors ${
          over
            ? "border-red-500 ring-2 ring-red-500/20"
            : "border-slate-300 dark:border-slate-800 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-600/20"
        }`}
      >
        {/* Line Gutter */}
        <div className="select-none border-r border-slate-200 dark:border-slate-800 pl-3 pr-2.5 text-right font-mono text-xs bg-slate-50 dark:bg-slate-900/60">
          {Array.from({ length: rows }, (_, i) => (
            <div
              key={i}
              className={`text-[11px] font-mono leading-[22px] ${
                i + 1 > maxLines ? "text-red-600 font-extrabold" : "text-slate-400 dark:text-slate-600"
              }`}
              style={{ height: LINE_PX }}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Monospace Textarea */}
        <textarea
          id={textareaId}
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          spellCheck={false}
          placeholder={placeholder}
          className="block bg-transparent px-3 resize-none focus:outline-none overflow-hidden font-mono text-slate-900 dark:text-slate-100"
          style={{
            fontFamily: "'Courier Prime', 'Courier New', Courier, monospace",
            fontSize: "13px",
            lineHeight: `${LINE_PX}px`,
            width: `${charsPerLine}ch`,
            minHeight: maxLines * LINE_PX,
            textIndent: firstLineLead > 0 ? `${firstLineLead}ch` : undefined,
          }}
        />
      </div>

      {(error || over) && (
        <p className="text-red-600 dark:text-red-400 text-xs font-medium mt-1">
          {error ||
            `⚠️ Text exceeds ${maxLines} printed lines at ${charsPerLine} chars/line. Lines ${maxLines + 1}–${fit.linesUsed} will NOT appear on the official NAVPERS form!`}
        </p>
      )}
    </div>
  );
};

export default MeasuredCourierField;
