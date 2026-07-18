// components/board/ResultsView.tsx
//
// Results tab of the Board Confidence Analyzer (spec §6, tab 4): Run Analysis
// control, ScoreDial, per-factor FactorBar (expansion prints FactorResult.detail
// verbatim — nothing is recomputed client-side), narrative lists, and the
// prior-runs table. Snapshots are immutable: selecting a prior run renders its
// stored result.
//

"use client";

import React, { useState } from "react";
import BoardDisclaimer from "@/components/board/BoardDisclaimer";
import { BANDS } from "@/lib/boardConfidence/rubric";
import {
  BOARD_DISCLAIMER,
  type BoardAnalysisRow,
  type FactorKey,
  type FactorResult,
} from "@/lib/boardConfidence/types";
import { runBoardAnalysis } from "@/lib/boardConfidenceService";

interface ResultsViewProps {
  runs: BoardAnalysisRow[];
  selected: BoardAnalysisRow | null;
  onSelect: (row: BoardAnalysisRow) => void;
  onRunComplete: (row: BoardAnalysisRow) => void;
}

const FACTOR_LABELS: Record<FactorKey, string> = {
  performance: "Performance",
  leadership: "Leadership / Impact",
  development: "Professional Development (LaDR)",
  continuity: "Eval Continuity",
  completeness: "Record Completeness",
  precept: "Precept Alignment",
};

// Modeled-bands caveat sentence, extracted verbatim from the §1.1 disclaimer.
const CAVEAT = (() => {
  const start = BOARD_DISCLAIMER.indexOf("Scores are computed");
  const end = BOARD_DISCLAIMER.indexOf("procedure.");
  return start >= 0 && end > start
    ? BOARD_DISCLAIMER.slice(start, end + "procedure.".length)
    : BOARD_DISCLAIMER;
})();

const bandLabelFor = (vote: number) =>
  BANDS.find((b) => b.vote === vote)?.label ?? "";

/** Display formatting only — values themselves come from FactorResult.detail. */
function fmtDetail(v: number | string | boolean | null): string {
  if (typeof v === "number" && !Number.isInteger(v))
    return String(Math.round(v * 10000) / 10000);
  return String(v);
}

export function ScoreDial({
  score,
  band,
  bandLabel,
}: {
  score: number;
  band: number;
  bandLabel: string;
}) {
  const ARC = Math.PI * 80; // semicircle of radius 80
  const filled = (Math.max(0, Math.min(100, score)) / 100) * ARC;
  return (
    <div className="flex flex-col items-center gap-2">
      <svg
        viewBox="0 0 200 112"
        className="w-64 max-w-full"
        role="img"
        aria-label={`Overall score ${score.toFixed(1)} of 100 — vote ${band}, ${bandLabel}`}
      >
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="var(--border)"
          strokeWidth="12"
          strokeLinecap="round"
        />
        <path
          d="M 20 100 A 80 80 0 0 1 180 100"
          fill="none"
          stroke="var(--accent-gold)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${ARC + 1}`}
        />
        <text
          x="100"
          y="82"
          textAnchor="middle"
          fontSize="30"
          fontWeight="700"
          fill="var(--foreground)"
        >
          {score.toFixed(1)}
        </text>
        <text
          x="100"
          y="102"
          textAnchor="middle"
          fontSize="11"
          fill="var(--muted-foreground)"
        >
          / 100
        </text>
      </svg>
      <div className="text-sm font-bold apex-heading text-center">
        {band} — {bandLabel}
      </div>
      <p
        className="text-[11px] max-w-md text-center leading-relaxed"
        style={{ color: "var(--subtle)" }}
      >
        {CAVEAT}
      </p>
    </div>
  );
}

export function FactorBar({ factor }: { factor: FactorResult }) {
  const excluded = factor.detail?.excluded === true;
  const pct =
    factor.weight > 0
      ? Math.max(0, Math.min(100, (factor.contribution / factor.weight) * 100))
      : 0;
  const weightLabel = Number.isInteger(factor.weight)
    ? String(factor.weight)
    : factor.weight.toFixed(1);
  return (
    <details className="apex-card overflow-hidden">
      <summary className="p-4 cursor-pointer">
        <div className="inline-flex w-[calc(100%-1.5rem)] flex-col gap-2 align-middle">
          <span className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-semibold apex-heading">
              {FACTOR_LABELS[factor.key]}
            </span>
            <span className="flex items-center gap-2">
              {!excluded && factor.confidence < 1 && (
                <span className="apex-badge-amber px-2 py-0.5 text-[10px]">
                  conf {factor.confidence.toFixed(2)}
                </span>
              )}
              {excluded ? (
                <span className="apex-badge-draft px-2 py-0.5 text-[10px]">
                  Excluded — weight redistributed
                </span>
              ) : (
                <span
                  className="text-xs font-mono"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {factor.contribution.toFixed(1)} / {weightLabel}
                </span>
              )}
            </span>
          </span>
          <span
            className="block h-2 rounded-full"
            style={{ background: "var(--muted)" }}
            aria-hidden="true"
          >
            <span
              className="block h-2 rounded-full"
              style={{
                width: `${pct}%`,
                background: "var(--accent-gold)",
                opacity: 0.35 + 0.65 * factor.confidence,
              }}
            />
          </span>
        </div>
      </summary>
      <div
        className="px-4 pb-4 pt-3 border-t overflow-x-auto"
        style={{ borderColor: "var(--border)" }}
      >
        <dl
          className="grid gap-x-6 gap-y-1 text-xs font-mono"
          style={{
            gridTemplateColumns: "max-content 1fr",
            color: "var(--muted-foreground)",
          }}
        >
          {Object.entries(factor.detail ?? {}).map(([key, value]) => (
            <React.Fragment key={key}>
              <dt>{key}</dt>
              <dd className="apex-heading">{fmtDetail(value)}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
    </details>
  );
}

function NarrativeList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "emerald" | "amber" | "neutral";
}) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-900/30 bg-emerald-950/15 text-emerald-200"
      : tone === "amber"
        ? "border-amber-900/30 bg-amber-950/15 text-amber-200"
        : "";
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-bold uppercase tracking-wider gold-accent">
        {title}
      </h4>
      {items.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--subtle)" }}>
          None.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li
              key={i}
              className={`p-2.5 rounded-lg border text-xs leading-relaxed ${toneClass}`}
              style={
                tone === "neutral"
                  ? {
                      borderColor: "var(--border)",
                      color: "var(--muted-foreground)",
                    }
                  : undefined
              }
            >
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ResultsView({
  runs,
  selected,
  onSelect,
  onRunComplete,
}: ResultsViewProps) {
  const [boardDate, setBoardDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setRunError(null);
    try {
      const row = await runBoardAnalysis({ boardDate });
      onRunComplete(row);
    } catch (err: any) {
      setRunError(err?.message || "Board confidence analysis failed.");
    } finally {
      setRunning(false);
    }
  };

  // v1.1 review fix: A comes from the stored board_analyses.adverse_adjustment
  // column — never derived client-side (Σcontributions − overall is wrong when
  // the final clamps to 0). numeric arrives as a string from PostgREST.
  const adverse = selected ? Number(selected.adverse_adjustment ?? 0) : 0;

  const warnings: string[] = selected?.input?.warnings ?? [];

  return (
    <div className="space-y-6">
      {/* §1.1: disclaimer at the top of every results view */}
      <BoardDisclaimer />

      {/* Run controls */}
      <div className="apex-card p-4 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="apex-filter-label">Board date</span>
          <input
            type="date"
            className="apex-input"
            value={boardDate}
            onChange={(e) => setBoardDate(e.target.value)}
            aria-label="Board convening date"
          />
        </label>
        <button
          type="button"
          className="apex-btn-primary disabled:opacity-50"
          onClick={run}
          disabled={running}
        >
          {running ? "Analyzing…" : "Run Analysis"}
        </button>
      </div>

      {runError && (
        <div
          role="alert"
          className="p-3 rounded-lg text-xs border border-amber-900/40 bg-amber-950/30 text-amber-200 flex items-center justify-between gap-3"
        >
          <span>{runError}</span>
          <button
            type="button"
            className="apex-btn-secondary py-1 px-3 text-xs"
            onClick={run}
            disabled={running}
          >
            Retry
          </button>
        </div>
      )}

      {selected ? (
        <>
          <div className="apex-card p-6">
            <ScoreDial
              score={Number(selected.overall_score)}
              band={selected.band}
              bandLabel={bandLabelFor(selected.band)}
            />
          </div>

          <div className="space-y-2">
            {selected.factor_scores.map((factor) => (
              <FactorBar key={factor.key} factor={factor} />
            ))}
          </div>

          {adverse > 0 && (
            <div
              role="note"
              className="p-3 rounded-lg text-xs border border-red-900/40 bg-red-950/25 text-red-200"
            >
              Adverse adjustment applied: −{adverse.toFixed(1)} points (adverse
              entries and/or a PFA failure within 36 months of the board date).
            </div>
          )}

          {warnings.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Warnings
              </h4>
              <ul className="space-y-1.5">
                {warnings.map((w, i) => (
                  <li
                    key={i}
                    className="p-2.5 rounded-lg border border-amber-900/30 bg-amber-950/15 text-xs text-amber-200"
                  >
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Narrative */}
          <div className="apex-card p-6 space-y-5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
                Narrative
              </h3>
              <span className="apex-badge-draft px-2 py-0.5 text-[10px]">
                {selected.narrative_source === "model"
                  ? `AI narrative (${selected.model ?? "model"})`
                  : selected.narrative_fallback_reason === "model_error"
                    ? "Deterministic narrative (AI narrative unavailable — model call failed)"
                    : "Deterministic narrative (no API key configured)"}
              </span>
            </div>
            <NarrativeList
              title="Strengths"
              items={selected.narrative?.strengths ?? []}
              tone="emerald"
            />
            <NarrativeList
              title="Gaps"
              items={selected.narrative?.gaps ?? []}
              tone="amber"
            />
            <NarrativeList
              title="Recommendations"
              items={selected.narrative?.recommendations ?? []}
              tone="neutral"
            />
            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider gold-accent">
                Per-factor commentary
              </h4>
              <dl className="space-y-2">
                {(Object.keys(FACTOR_LABELS) as FactorKey[]).map((key) => {
                  const text = selected.narrative?.factor_commentary?.[key];
                  if (!text) return null;
                  return (
                    <div key={key}>
                      <dt className="text-xs font-semibold apex-heading">
                        {FACTOR_LABELS[key]}
                      </dt>
                      <dd
                        className="text-xs leading-relaxed"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        {text}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </div>
          </div>
        </>
      ) : (
        <div className="apex-card p-10 text-center">
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            No analysis yet. Enter your record, answer the LaDR checklist, then
            run your first analysis.
          </p>
        </div>
      )}

      {/* Prior runs */}
      <div className="space-y-2">
        <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
          Prior runs
        </h3>
        {runs.length === 0 ? (
          <div className="apex-card p-6 text-center">
            <p className="text-xs" style={{ color: "var(--subtle)" }}>
              No prior analyses.
            </p>
          </div>
        ) : (
          <div className="apex-card overflow-x-auto">
            <table className="apex-data-table min-w-[720px]">
              <thead>
                <tr>
                  <th>Run date</th>
                  <th>Board date</th>
                  <th>Score</th>
                  <th>Band</th>
                  <th>Narrative source</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const isSelected = r.id != null && r.id === selected?.id;
                  return (
                    <tr
                      key={r.id ?? r.created_at}
                      tabIndex={0}
                      onClick={() => onSelect(r)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(r);
                        }
                      }}
                      aria-label={`Load analysis run from ${r.created_at ?? r.board_date}`}
                      className="cursor-pointer"
                      style={
                        isSelected ? { background: "var(--muted)" } : undefined
                      }
                    >
                      <td className="text-xs">
                        {r.created_at
                          ? new Date(r.created_at).toLocaleString()
                          : "—"}
                      </td>
                      <td className="text-xs font-mono">{r.board_date}</td>
                      <td className="font-semibold apex-heading">
                        {Number(r.overall_score).toFixed(1)}
                      </td>
                      <td>
                        <span
                          className={`px-2 py-0.5 text-[10px] ${
                            r.band >= 75
                              ? "apex-badge-emerald"
                              : r.band >= 50
                                ? "apex-badge-amber"
                                : "apex-badge-danger"
                          }`}
                        >
                          {r.band}
                        </span>
                      </td>
                      <td className="text-xs">
                        {r.narrative_source === "model"
                          ? `AI (${r.model ?? "model"})`
                          : "Deterministic"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
