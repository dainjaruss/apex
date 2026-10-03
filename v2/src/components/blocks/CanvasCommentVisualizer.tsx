// src/components/blocks/CanvasCommentVisualizer.tsx
//
// HTML5 Canvas-based visualizer for NAVPERS narrative blocks.
// Uses HTML5 Canvas 2D context to render pixel-perfect Courier font simulation
// showing printed lines, cell margins, and visual red overflow highlights.

import React, { useRef, useEffect } from "react";
import { wrapTextToWidth } from "@/lib/commentFit";

interface Props {
  text: string;
  charsPerLine: number;
  maxLines: number;
  pitch: 10 | 12 | "10" | "12";
  blockNumber?: number;
  blockTitle?: string;
}

export const CanvasCommentVisualizer: React.FC<Props> = ({
  text,
  charsPerLine,
  maxLines,
  pitch,
  blockNumber = 43,
  blockTitle = "COMMENTS ON PERFORMANCE",
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pitchNum = Number(pitch) === 12 ? 12 : 10;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Canvas dimensions setup (High DPI)
    const dpr = window.devicePixelRatio || 1;
    const width = 640;
    const lineHeight = pitchNum === 10 ? 20 : 16;
    const fontSize = pitchNum === 10 ? 13 : 11;
    const paddingTop = 36;
    const paddingLeft = 16;
    const totalLines = Math.max(maxLines, 1);
    const height = paddingTop + (totalLines + 4) * lineHeight;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    ctx.scale(dpr, dpr);

    // 1. Background Fill (Paper simulation)
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    // 2. NAVPERS Block Header
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.fillText(
      `${blockNumber}. ${blockTitle} (${pitch} PITCH - ${charsPerLine} CPL × ${maxLines} LINES)`,
      paddingLeft,
      20
    );

    // Header dividing line
    ctx.strokeStyle = "#cbd5e1";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(paddingLeft, 26);
    ctx.lineTo(width - paddingLeft, 26);
    ctx.stroke();

    // 3. Draw Printed Line Baselines
    for (let i = 0; i < maxLines; i++) {
      const y = paddingTop + (i + 1) * lineHeight;
      ctx.strokeStyle = "#f1f5f9";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(paddingLeft + 30, y);
      ctx.lineTo(width - paddingLeft, y);
      ctx.stroke();
    }

    // 4. Wrap text into lines
    const wrappedLines = wrapTextToWidth(text || "", charsPerLine);

    // 5. Render Lines with Courier Font
    ctx.font = `${fontSize}px "Courier Prime", "Courier New", Courier, monospace`;

    wrappedLines.forEach((line, index) => {
      const isOverflow = index >= maxLines;
      const y = paddingTop + (index + 1) * lineHeight - 4;

      // Line number gutter
      ctx.fillStyle = isOverflow ? "#dc2626" : "#94a3b8";
      ctx.font = "bold 10px monospace";
      ctx.fillText(`${index + 1}`.padStart(2, " "), paddingLeft, y);

      // Overflow indicator background
      if (isOverflow) {
        ctx.fillStyle = "rgba(239, 68, 68, 0.12)";
        ctx.fillRect(
          paddingLeft + 25,
          y - lineHeight + 6,
          width - paddingLeft * 2 - 25,
          lineHeight
        );
      }

      // Line Text
      ctx.font = `${fontSize}px "Courier Prime", "Courier New", Courier, monospace`;
      ctx.fillStyle = isOverflow ? "#dc2626" : "#0f172a";
      ctx.fillText(line, paddingLeft + 30, y);
    });

    // 6. Draw Boundary Box for Allowed Limit
    const boundaryY = paddingTop + maxLines * lineHeight;
    ctx.strokeStyle = "#dc2626";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(paddingLeft, boundaryY);
    ctx.lineTo(width - paddingLeft, boundaryY);
    ctx.stroke();
    ctx.setLineDash([]); // reset dash

    // Boundary label
    ctx.fillStyle = "#dc2626";
    ctx.font = "italic 9px system-ui, sans-serif";
    ctx.fillText("▲ OFFICIAL NAVPERS FORM BOTTOM BOUNDARY ▲", width / 2 - 110, boundaryY + 12);
  }, [text, charsPerLine, maxLines, pitch, blockNumber, blockTitle]);

  return (
    <div className="bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-xl p-4 overflow-x-auto shadow-inner flex flex-col items-center">
      <div className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2 w-full flex items-center justify-between">
        <span>Canvas WYSIWYG Print Emulation</span>
        <span className="text-[11px] text-blue-600 dark:text-blue-400 font-mono">
          HTML5 Canvas 2D Engine
        </span>
      </div>
      <canvas ref={canvasRef} className="border border-slate-300 shadow-md rounded-md bg-white" />
    </div>
  );
};
