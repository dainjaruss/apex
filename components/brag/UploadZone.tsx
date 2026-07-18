// components/brag/UploadZone.tsx
//
// Drag-drop / click upload zone for prior-EVAL and PRIMS PDFs (spec §6).
// Files are POSTed to /api/brag-sheet/extract, processed entirely in memory
// server-side, and NEVER persisted (invariant §1.2 item 1) — the caption below
// states this to the user. PDF only; extraction errors surface verbatim.
//

"use client";

import React, { useRef, useState } from "react";

export default function UploadZone({
  onFile,
  busy,
}: {
  onFile: (file: File) => void;
  busy: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const take = (file: File | undefined | null) => {
    if (!file || busy) return;
    onFile(file);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload a prior eval or PRIMS PDF for extraction"
      className="apex-card p-6 text-center cursor-pointer border-2 border-dashed transition-colors"
      style={{
        borderColor: dragOver ? "var(--accent-gold)" : "var(--border)",
        opacity: busy ? 0.6 : 1,
      }}
      onClick={() => !busy && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          if (!busy) inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        take(e.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        aria-label="Choose PDF file"
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <p className="text-sm apex-heading font-semibold">
        {busy ? "Reading PDF…" : "Drop a PDF here, or click to choose"}
      </p>
      <p className="text-xs mt-2" style={{ color: "var(--muted-foreground)" }}>
        Prior evals and PRIMS PDFs are read in your browser session only —
        never stored.
      </p>
    </div>
  );
}
