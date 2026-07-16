// components/blocks/MeasuredCourierField.tsx
//
// Reusable Block-43-style measuring canvas: a Courier-monospace textarea sized to exactly
// `charsPerLine`, so it wraps on screen the same way the printed form/PDF will, with a live
// line-number gutter, line counter, and overflow styling. Used by Blocks 28, 29, 43, and 44.

"use client";

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
  /** External validation message to show under the canvas. */
  error?: string | null;
  /** Associates visible label with the textarea (preferred over ariaLabel alone). */
  fieldId?: string;
  /** Optional caption rendered inline with the line counter (keeps the box tight to the label). */
  label?: string;
  /** Characters reserved on line 1 for an inline lead box (e.g. Block 29A). */
  firstLineLead?: number;
}

export default function MeasuredCourierField({
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
}: Props) {
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

  const counterClass = over
    ? "apex-text-field-error font-extrabold"
    : fit.linesUsed >= maxLines
      ? "apex-text-accent font-bold"
      : "apex-text-subtle";

  const textareaId =
    fieldId || (label ? `eval-courier-${label.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}` : undefined);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        {label && textareaId ? (
          <label htmlFor={textareaId} className="apex-measured-courier-caption">
            {label}
          </label>
        ) : label ? (
          <span className="apex-measured-courier-caption">{label}</span>
        ) : (
          <span />
        )}
        <span className={`text-xs ${counterClass}`}>
          Lines: {fit.linesUsed} / {maxLines}
        </span>
      </div>

      <div
        className={`apex-measured-courier-shell ${
          over
            ? "!border-[var(--field-invalid-border)]"
            : "focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--focus-ring)]"
        }`}
      >
        <div className="apex-measured-courier-gutter">
          {Array.from({ length: rows }, (_, i) => (
            <div
              key={i}
              className={`text-[10px] apex-narrative-gutter ${i + 1 > maxLines ? "apex-text-field-error font-bold" : ""}`}
              style={{ height: LINE_PX, lineHeight: `${LINE_PX}px` }}
            >
              {i + 1}
            </div>
          ))}
        </div>
        <textarea
          id={textareaId}
          ref={taRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          spellCheck={false}
          placeholder={placeholder}
          className="apex-measured-courier-input"
          style={{
            fontFamily: "'Courier Prime', 'Courier New', Courier, monospace",
            fontSize: "13px",
            lineHeight: `${LINE_PX}px`,
            width: `${charsPerLine}ch`,
            minHeight: maxLines * LINE_PX,
            // Reserve the inline lead box (e.g. Block 29A) on line 1 so the on-screen
            // wrap matches the PDF's shortened first line.
            textIndent: firstLineLead > 0 ? `${firstLineLead}ch` : undefined,
          }}
        />
      </div>

      {(error || over) && (
        <p className="apex-text-field-error text-xs mt-2">
          {error ||
            `Text exceeds ${maxLines} printed line(s) at ${charsPerLine} chars/line — trim it to fit.`}
        </p>
      )}
    </div>
  );
}
