// components/brag/AutofillReviewPanel.tsx
//
// Side-by-side review of an AutofillResponse (spec §6): brag source left via
// citation chips (click scrolls/highlights the editor row), generated text
// right. Per-block fit meters use the same lib/commentFit functions as the
// server pipeline and the PDF (true WYSIWYG); an overflowing block cannot be
// accepted until edited under budget (§5.3). Block 20 is read-only (computed
// from PFA rows). The promotion advisory is display-only — no control exists
// to copy it into Block 45 (invariant §1.2 item 3). Apply happens only through
// user-accepted blocks via applyBragDraft (client-side, §5.3).
//

"use client";

import React, { useEffect, useMemo, useState } from "react";
import type {
  AutofillResponse,
  BragSheet,
  BragSheetData,
  GeneratedBlock,
} from "@/lib/bragSheet/types";
import type { AcceptedBlocks } from "@/lib/bragSheetService";
import BragDisclaimerBanner from "@/components/brag/BragDisclaimerBanner";
import {
  checkCommentFit,
  measureTextFit,
  getPrimaryDutiesFieldFit,
  FIELD_FIT,
  PRIMARY_DUTY_ABBREV_MAX,
  type CommentFitResult,
} from "@/lib/commentFit";
import { CAREER_REC_MAX, CAREER_REC_SLOTS } from "@/types/navpers";
import type { ValidationIssue } from "@/types";

type NarrativeKey =
  | "comments"
  | "primary_duty_abbrev"
  | "primary_duties"
  | "command_achievements"
  | "qualifications";

const NARRATIVE_BLOCKS: { key: NarrativeKey; label: string }[] = [
  { key: "comments", label: "Block 43 — Comments on Performance" },
  { key: "primary_duty_abbrev", label: "Block 29A — Primary Duty Abbreviation" },
  { key: "primary_duties", label: "Block 29B — Primary Duties" },
  { key: "command_achievements", label: "Block 28 — Command Achievements" },
  { key: "qualifications", label: "Block 44 — Qualifications" },
];

interface BlockState {
  status: "pending" | "accepted" | "rejected";
  text: string;
  editing: boolean;
  draft: string; // textarea contents while editing
}

/** Resolve a "brag.…" citation path against the sheet payload for display. */
function resolveBragValue(data: BragSheetData, path: string): string | null {
  if (!path.startsWith("brag.")) return null;
  const segs = path
    .slice(5)
    .split(/[.[\]]+/)
    .filter(Boolean);
  let cur: any = data;
  for (const s of segs) {
    if (cur == null) return null;
    cur = cur[/^\d+$/.test(s) ? Number(s) : s];
  }
  if (cur == null) return null;
  if (typeof cur === "string" || typeof cur === "number") return String(cur);
  if (typeof cur === "object" && typeof cur.text === "string")
    return cur.metrics ? `${cur.text} [${cur.metrics}]` : cur.text;
  return JSON.stringify(cur);
}

function lastSentence(text: string): string {
  const m = text.trim().match(/[^.!?]*[.!?]?\s*$/);
  return (m?.[0] ?? text).trim();
}

function FitMeter({
  fit,
  charBased,
}: {
  fit: CommentFitResult;
  charBased?: { length: number; max: number };
}) {
  if (charBased) {
    const over = charBased.length > charBased.max;
    return (
      <span
        className="text-xs font-mono tabular-nums"
        style={{ color: over ? "var(--destructive)" : "var(--muted-foreground)" }}
      >
        {charBased.length}/{charBased.max}
        {over ? " — over limit" : ""}
      </span>
    );
  }
  const over = !fit.fit;
  const atMax = fit.linesUsed >= fit.maxLines;
  const color = over ? "#ef4444" : atMax ? "#f59e0b" : "#10b981";
  const pct = Math.min(100, (fit.linesUsed / Math.max(1, fit.maxLines)) * 100);
  return (
    <div className="flex items-center gap-2 min-w-[180px]">
      <div
        className="h-1.5 flex-1 rounded-full overflow-hidden"
        style={{ background: "var(--border)" }}
        role="meter"
        aria-valuenow={fit.linesUsed}
        aria-valuemax={fit.maxLines}
        aria-label="Lines used"
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span
        className="text-xs font-mono tabular-nums shrink-0"
        style={{ color: over ? "var(--destructive)" : "var(--muted-foreground)" }}
      >
        {fit.linesUsed} / {fit.maxLines} lines at {fit.charsPerLine} CPL
      </span>
    </div>
  );
}

function CitationChips({
  block,
  data,
  onGoToSource,
}: {
  block: GeneratedBlock;
  data: BragSheetData;
  onGoToSource: (path: string) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {block.items.map((item, i) => (
          <button
            key={i}
            type="button"
            className="apex-badge-draft px-2 py-0.5 text-[10px] cursor-pointer"
            title={item.sources.join("\n")}
            aria-expanded={expanded === i}
            onClick={() => setExpanded(expanded === i ? null : i)}
          >
            src {i + 1}
          </button>
        ))}
      </div>
      {expanded !== null && block.items[expanded] && (
        <div
          className="rounded-lg p-3 text-xs space-y-2"
          style={{ background: "var(--card-elevated)" }}
        >
          <p style={{ color: "var(--foreground)" }}>
            “{block.items[expanded].text}”
          </p>
          <ul className="space-y-1.5">
            {block.items[expanded].sources.map((src) => {
              const cited = resolveBragValue(data, src);
              return (
                <li key={src} className="flex flex-wrap items-center gap-2">
                  <code
                    className="text-[10px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {src}
                  </code>
                  {cited && (
                    <span style={{ color: "var(--foreground)" }}>— {cited}</span>
                  )}
                  {src.startsWith("brag.") && (
                    <button
                      type="button"
                      className="underline text-[10px]"
                      style={{ color: "var(--accent-gold)" }}
                      onClick={() => onGoToSource(src)}
                    >
                      Go to source
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: BlockState["status"] }) {
  if (status === "accepted")
    return <span className="apex-badge-emerald px-2 py-0.5 text-[10px]">Accepted</span>;
  if (status === "rejected")
    return <span className="apex-badge-danger px-2 py-0.5 text-[10px]">Rejected</span>;
  return <span className="apex-badge-draft px-2 py-0.5 text-[10px]">Pending review</span>;
}

function IssueList({
  title,
  issues,
  color,
}: {
  title: string;
  issues: ValidationIssue[];
  color: string;
}) {
  if (issues.length === 0) return null;
  return (
    <div className="space-y-2">
      <h4
        className="text-xs font-bold uppercase tracking-wider"
        style={{ color }}
      >
        {title} ({issues.length})
      </h4>
      <ul className="space-y-1">
        {issues.map((issue, i) => (
          <li
            key={i}
            className="text-xs flex gap-2 items-start"
            style={{ color: "var(--foreground)" }}
          >
            <span className="font-semibold shrink-0" style={{ color }}>
              {issue.block ? `Block ${issue.block}:` : "General:"}
            </span>
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function AutofillReviewPanel({
  sheet,
  result,
  pitch,
  generating,
  applying,
  onRegenerate,
  onGoToSource,
  onApply,
}: {
  sheet: BragSheet;
  result: AutofillResponse;
  pitch: "10" | "12";
  generating: boolean;
  applying: boolean;
  onRegenerate: () => void;
  onGoToSource: (path: string) => void;
  onApply: (accepted: AcceptedBlocks) => void;
}) {
  const data = sheet.data;

  const computeFit = (key: NarrativeKey, text: string): CommentFitResult => {
    switch (key) {
      case "comments":
        return checkCommentFit(text, pitch);
      case "primary_duty_abbrev":
        return measureTextFit(text, PRIMARY_DUTY_ABBREV_MAX, 1);
      case "primary_duties": {
        const spec = getPrimaryDutiesFieldFit(sheet.report_type);
        return measureTextFit(
          text,
          spec.charsPerLine,
          spec.maxLines,
          spec.firstLineLead ?? 0,
        );
      }
      case "command_achievements":
        return measureTextFit(
          text,
          FIELD_FIT.command_achievements.charsPerLine,
          FIELD_FIT.command_achievements.maxLines,
        );
      case "qualifications":
        return measureTextFit(
          text,
          FIELD_FIT.qualifications.charsPerLine,
          FIELD_FIT.qualifications.maxLines,
        );
    }
  };

  const initBlocks = (): Record<NarrativeKey, BlockState | null> => {
    const out = {} as Record<NarrativeKey, BlockState | null>;
    for (const { key } of NARRATIVE_BLOCKS) {
      const gen = result.blocks[key];
      out[key] = gen
        ? { status: "pending", text: gen.text, editing: false, draft: gen.text }
        : null;
    }
    return out;
  };

  const [blocks, setBlocks] = useState(initBlocks);
  const [recs, setRecs] = useState<{
    status: BlockState["status"];
    entries: string[];
    editing: boolean;
  }>({
    status: "pending",
    entries: result.blocks.career_recommendations.entries ?? [],
    editing: false,
  });

  // Re-initialize on regenerate (new proposal replaces all review state).
  useEffect(() => {
    setBlocks(initBlocks());
    setRecs({
      status: "pending",
      entries: result.blocks.career_recommendations.entries ?? [],
      editing: false,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  const patchBlock = (key: NarrativeKey, patch: Partial<BlockState>) =>
    setBlocks((prev) => {
      const cur = prev[key];
      return cur ? { ...prev, [key]: { ...cur, ...patch } } : prev;
    });

  const recsValid =
    recs.entries.length <= CAREER_REC_SLOTS &&
    recs.entries.every((e) => e.trim().length <= CAREER_REC_MAX);

  const acceptedEntries = NARRATIVE_BLOCKS.filter(
    (b) => blocks[b.key]?.status === "accepted",
  );
  const acceptedOverflow = acceptedEntries.some(
    (b) => !computeFit(b.key, blocks[b.key]!.text).fit,
  );
  const acceptedCount =
    acceptedEntries.length + (recs.status === "accepted" ? 1 : 0);
  const canApply =
    acceptedCount >= 1 &&
    !acceptedOverflow &&
    (recs.status !== "accepted" || recsValid) &&
    !applying;

  const buildAccepted = (): AcceptedBlocks => {
    const accepted: AcceptedBlocks = {};
    for (const { key } of NARRATIVE_BLOCKS) {
      const st = blocks[key];
      if (st?.status === "accepted" && st.text.trim())
        accepted[key] = st.text;
    }
    if (recs.status === "accepted") {
      const entries = recs.entries
        .map((e) => e.trim().toUpperCase())
        .filter(Boolean)
        .slice(0, CAREER_REC_SLOTS);
      if (entries.length) accepted.career_recommendations = entries;
    }
    return accepted;
  };

  const failuresFor = (key: string) =>
    result.citation_failures.filter((f) => f.block === key);

  const advisory = result.promotion_advisory;

  return (
    <section className="space-y-4" aria-label="Generated draft review">
      {/* §1.1: disclaimer again at the top of the review panel */}
      <BragDisclaimerBanner />

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base font-bold apex-heading">
          Generated draft — review every block before applying
        </h2>
        <span className="text-xs" style={{ color: "var(--subtle)" }}>
          Model: {result.model ?? "—"}
        </span>
      </div>

      {/* Per-block cards */}
      {NARRATIVE_BLOCKS.map(({ key, label }) => {
        const st = blocks[key];
        if (!st) return null;
        const fit = computeFit(key, st.text);
        const gen = result.blocks[key]!;
        const editFit = computeFit(key, st.draft);
        const isAbbrev = key === "primary_duty_abbrev";
        return (
          <div key={key} className="apex-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
                {label}
              </h3>
              <div className="flex items-center gap-3 flex-wrap">
                <FitMeter
                  fit={fit}
                  charBased={
                    isAbbrev
                      ? { length: st.text.length, max: PRIMARY_DUTY_ABBREV_MAX }
                      : undefined
                  }
                />
                <StatusBadge status={st.status} />
              </div>
            </div>

            {!fit.fit ? (
              <div
                className="rounded-lg border p-3 space-y-2"
                style={{ borderColor: "var(--destructive)" }}
              >
                <p
                  className="text-xs font-semibold"
                  style={{ color: "var(--destructive)" }}
                >
                  ⚑ Overflow — this block does not fit and cannot be accepted
                  until it does. Nothing is silently truncated.
                </p>
                <pre
                  className="font-mono text-xs whitespace-pre-wrap overflow-x-auto"
                  style={{ color: "var(--foreground)" }}
                >
                  {fit.wrappedLines.slice(0, fit.maxLines).join("\n")}
                </pre>
                <pre
                  className="font-mono text-xs whitespace-pre-wrap line-through overflow-x-auto"
                  style={{ color: "var(--destructive)" }}
                >
                  {fit.wrappedLines.slice(fit.maxLines).join("\n")}
                </pre>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="apex-btn-secondary py-1 px-3 text-xs"
                    onClick={onRegenerate}
                    disabled={generating}
                  >
                    {generating ? "Regenerating…" : "Regenerate shorter"}
                  </button>
                  <button
                    type="button"
                    className="apex-btn-secondary py-1 px-3 text-xs"
                    onClick={() => patchBlock(key, { editing: true, draft: st.text })}
                  >
                    Edit manually
                  </button>
                </div>
              </div>
            ) : (
              <pre
                className="font-mono text-xs whitespace-pre-wrap rounded-lg p-3 overflow-x-auto"
                style={{
                  background: "var(--card-elevated)",
                  color: "var(--foreground)",
                }}
              >
                {st.text || "(empty)"}
              </pre>
            )}

            {st.editing && (
              <div className="space-y-2">
                <textarea
                  className="apex-input text-xs font-mono w-full"
                  rows={isAbbrev ? 1 : 6}
                  aria-label={`Edit ${label}`}
                  value={st.draft}
                  onChange={(e) => patchBlock(key, { draft: e.target.value })}
                />
                <div className="flex items-center gap-3 flex-wrap">
                  <FitMeter
                    fit={editFit}
                    charBased={
                      isAbbrev
                        ? { length: st.draft.length, max: PRIMARY_DUTY_ABBREV_MAX }
                        : undefined
                    }
                  />
                  <button
                    type="button"
                    className="apex-btn-secondary py-1 px-3 text-xs"
                    onClick={() =>
                      patchBlock(key, { text: st.draft, editing: false })
                    }
                  >
                    Save edit
                  </button>
                  <button
                    type="button"
                    className="apex-btn-secondary py-1 px-3 text-xs"
                    onClick={() => patchBlock(key, { editing: false, draft: st.text })}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <CitationChips block={gen} data={data} onGoToSource={onGoToSource} />

            {failuresFor(key).map((f, i) => (
              <p
                key={i}
                className="text-xs line-through"
                style={{ color: "var(--subtle)" }}
              >
                {f.text}{" "}
                <span className="no-underline not-italic">
                  — removed — citation did not resolve ({f.bad_sources.join(", ")})
                </span>
              </p>
            ))}

            <div className="flex gap-2">
              <button
                type="button"
                className="apex-btn-primary py-1 px-3 text-xs disabled:opacity-50"
                disabled={!computeFit(key, st.text).fit}
                onClick={() => patchBlock(key, { status: "accepted" })}
              >
                Accept
              </button>
              <button
                type="button"
                className="apex-btn-secondary py-1 px-3 text-xs"
                onClick={() => patchBlock(key, { editing: true, draft: st.text })}
              >
                Edit
              </button>
              <button
                type="button"
                className="apex-btn-secondary py-1 px-3 text-xs"
                onClick={() => patchBlock(key, { status: "rejected" })}
              >
                Reject
              </button>
            </div>
          </div>
        );
      })}

      {/* Block 41 — career recommendations (n/20 × 2) */}
      <div className="apex-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
            Block 41 — Career Recommendations
          </h3>
          <div className="flex items-center gap-3">
            <span
              className="text-xs font-mono"
              style={{
                color: recsValid ? "var(--muted-foreground)" : "var(--destructive)",
              }}
            >
              {recs.entries.map((e) => `${e.trim().length}/${CAREER_REC_MAX}`).join(" · ") ||
                "0 entries"}{" "}
              × {CAREER_REC_SLOTS}
            </span>
            <StatusBadge status={recs.status} />
          </div>
        </div>
        {recs.editing ? (
          <div className="space-y-2">
            {recs.entries.map((e, i) => (
              <input
                key={i}
                className="apex-input text-sm font-mono w-64"
                maxLength={CAREER_REC_MAX}
                aria-label={`Career recommendation ${i + 1}`}
                value={e}
                onChange={(ev) =>
                  setRecs((prev) => ({
                    ...prev,
                    entries: prev.entries.map((v, j) =>
                      j === i ? ev.target.value : v,
                    ),
                  }))
                }
              />
            ))}
            <button
              type="button"
              className="apex-btn-secondary py-1 px-3 text-xs"
              onClick={() => setRecs((prev) => ({ ...prev, editing: false }))}
            >
              Done
            </button>
          </div>
        ) : (
          <pre
            className="font-mono text-xs whitespace-pre-wrap rounded-lg p-3"
            style={{ background: "var(--card-elevated)", color: "var(--foreground)" }}
          >
            {recs.entries.join("\n") || "(none)"}
          </pre>
        )}
        <CitationChips
          block={result.blocks.career_recommendations}
          data={data}
          onGoToSource={onGoToSource}
        />
        <div className="flex gap-2">
          <button
            type="button"
            className="apex-btn-primary py-1 px-3 text-xs disabled:opacity-50"
            disabled={!recsValid}
            onClick={() => setRecs((prev) => ({ ...prev, status: "accepted" }))}
          >
            Accept
          </button>
          <button
            type="button"
            className="apex-btn-secondary py-1 px-3 text-xs"
            onClick={() => setRecs((prev) => ({ ...prev, editing: true }))}
          >
            Edit
          </button>
          <button
            type="button"
            className="apex-btn-secondary py-1 px-3 text-xs"
            onClick={() => setRecs((prev) => ({ ...prev, status: "rejected" }))}
          >
            Reject
          </button>
        </div>
      </div>

      {/* Block 20 — read-only echo */}
      <div className="apex-card p-4 space-y-2">
        <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
          Block 20 — Physical Readiness
        </h3>
        <pre
          className="font-mono text-sm rounded-lg p-3 w-fit"
          style={{ background: "var(--card-elevated)", color: "var(--foreground)" }}
        >
          {result.blocks.physical_readiness.text || "(no PFA rows)"}
        </pre>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Computed from your PFA rows — applied deterministically, never
          AI-written.
        </p>
      </div>

      {/* Missing-info flags */}
      {result.missing_info.length > 0 && (
        <div className="apex-card p-4 space-y-2">
          <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
            Missing information
          </h3>
          <ul className="space-y-1.5">
            {result.missing_info.map((flag, i) => (
              <li key={i} className="text-xs flex flex-wrap items-center gap-2">
                <span className="apex-badge-amber px-2 py-0.5 text-[10px] shrink-0">
                  Block {flag.block}
                </span>
                <span style={{ color: "var(--foreground)" }}>{flag.message}</span>
                {flag.field?.startsWith("brag.") && (
                  <button
                    type="button"
                    className="underline text-[10px]"
                    style={{ color: "var(--accent-gold)" }}
                    onClick={() => onGoToSource(flag.field!)}
                  >
                    Go to field
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Dry-run validation preview (ValidationResultsModal visual grammar) */}
      <div className="apex-card p-4 space-y-3">
        <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
          Validation preview
        </h3>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          What final validation will say before you apply anything. Identity and
          occasion gaps on a fresh draft are expected.
        </p>
        {result.dry_run.errors.length === 0 &&
          result.dry_run.warnings.length === 0 && (
            <p className="text-xs" style={{ color: "var(--foreground)" }}>
              ✓ No findings.
            </p>
          )}
        <IssueList
          title="Blocker errors"
          issues={result.dry_run.errors}
          color="var(--destructive)"
        />
        <IssueList
          title="Guideline warnings"
          issues={result.dry_run.warnings}
          color="var(--accent-gold)"
        />
      </div>

      {/* Promotion advisory — display only, never written to the form */}
      <div
        className="apex-card p-4 space-y-3 border-l-4"
        style={{ borderLeftColor: "var(--accent-gold)" }}
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
            ADVISORY ONLY — not written to the form
          </h3>
          <span className="apex-badge-amber px-2.5 py-1 text-[11px]">
            {advisory.recommendation}
          </span>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: "var(--foreground)" }}>
          {advisory.rationale}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {advisory.sources.map((src) => (
            <button
              key={src}
              type="button"
              className="apex-badge-draft px-2 py-0.5 text-[10px]"
              title={src}
              onClick={() => src.startsWith("brag.") && onGoToSource(src)}
            >
              {src}
            </button>
          ))}
        </div>
        <p
          className="text-xs border-t pt-2"
          style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
        >
          {lastSentence(advisory.rationale)} The Block 45 recommendation is a
          human judgment reserved to the reporting senior.
        </p>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="apex-btn-primary disabled:opacity-50"
          disabled={!canApply}
          onClick={() => onApply(buildAccepted())}
        >
          {applying ? "Creating draft…" : `Create draft ${sheet.report_type}`}
        </button>
      </div>
    </section>
  );
}
