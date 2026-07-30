// components/board/PreceptPanel.tsx
//
// The Precept tab. Lifted out of app/board-confidence/page.tsx because a Next.js
// page may only export `default` plus a fixed set of route options, so nothing
// here could be rendered by a test while it lived there — and both the wide
// sourcing mutant (`!!precept.source_url` -> `!!precept`) and the narrow one
// (`set && sourced` -> `set`) passed the entire suite as a result.
//
// Spec §6 names the components, not the file granularity.

"use client";

import { useState } from "react";
import {
  extractPreceptFromFile,
  fetchPreceptPreview,
  type PreceptPreview,
} from "@/lib/boardConfidenceService";
import type { BoardPrecept, PreceptFlag } from "@/lib/boardConfidence/types";

const PRECEPT_FLAG_LABELS: Array<[PreceptFlag, string]> = [
  ["warfighting", "Warfighting"],
  ["leadership_positions", "Leadership positions"],
  ["education", "Education"],
  ["sea_duty", "Sea duty"],
  ["technical_expertise", "Technical expertise"],
];

// The published FY-27 Active-Duty senior-enlisted precept (default fetch source).
const DEFAULT_PRECEPT_URL =
  "https://www.mynavyhr.navy.mil/Portals/55/Boards/Active%20Duty%20Enlisted/Documents/FY27_AD/FY27_Enlisted_Precept.pdf";

const emptyFlags = (): Record<PreceptFlag, boolean> =>
  Object.fromEntries(PRECEPT_FLAG_LABELS.map(([f]) => [f, false])) as Record<
    PreceptFlag,
    boolean
  >;

export function ActivePreceptCard({ precept }: { precept: BoardPrecept }) {
  // Must match assembleRubricInputs: flags count ONLY when the row cites a
  // published source. Branching on the row's mere existence made this tab
  // contradict the Results tab in the same session.
  const sourced = !!precept.source_url;
  return (
    <div className="apex-card p-6 space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
          {precept.cycle}
        </h3>
        <p className="text-sm apex-heading">{precept.title}</p>
        {precept.source_url && (
          <a
            href={precept.source_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs underline"
            style={{ color: "var(--muted-foreground)" }}
          >
            Source
          </a>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {PRECEPT_FLAG_LABELS.map(([flag, label]) => {
          const set = precept.emphasis_flags?.[flag] === true;
          // An unsourced precept scores nothing, so nothing here may be styled
          // as active. Emerald "Warfighting" chips under "feed the Precept
          // Alignment factor" is what this tab used to say while the Results
          // tab of the same session said APEX had excluded them.
          const live = set && sourced;
          return (
            <span
              key={flag}
              className={`${live ? "apex-badge-emerald" : "apex-badge-draft"} px-2.5 py-1 text-[11px]`}
            >
              {label}
              {set ? (sourced ? "" : " — recorded, not scored") : " — not emphasized"}
            </span>
          );
        })}
      </div>
      <p className="text-xs" style={{ color: "var(--subtle)" }}>
        {sourced
          ? "Emphasis areas are set per board cycle and feed the Board Emphasis factor. This panel is read-only."
          : "These emphasis areas are not traceable to a convening order — no source document is recorded against them — so APEX excludes them from your review rather than scoring your record against them. Its 10% weight is spread across the other five factors. This panel is read-only."}
      </p>
    </div>
  );
}

// Fetch-to-reference: pull a published precept PDF, read it on-screen, confirm
// the 5 emphasis flags, and get the exact config to activate via the
// service-role script (setting the active precept is privileged — a system-wide
// scoring input — so it is NOT written from here).
function PreceptReference() {
  const [url, setUrl] = useState(DEFAULT_PRECEPT_URL);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreceptPreview | null>(null);
  const [flags, setFlags] = useState<Record<PreceptFlag, boolean>>(emptyFlags);
  const [cycle, setCycle] = useState("");
  const [title, setTitle] = useState("");

  const applyPreview = (p: PreceptPreview) => {
    setPreview(p);
    const next = emptyFlags();
    for (const s of p.suggestions) next[s.flag] = true;
    setFlags(next);
  };

  const doFetch = async () => {
    setBusy(true);
    setErr(null);
    try {
      applyPreview(await fetchPreceptPreview(url));
    } catch (e: any) {
      setErr(
        (e?.message || "Fetch failed.") +
          " If your server can't reach MyNavyHR, download the PDF and use Upload below.",
      );
    } finally {
      setBusy(false);
    }
  };

  const doUpload = async (file: File) => {
    setBusy(true);
    setErr(null);
    try {
      applyPreview(await extractPreceptFromFile(file));
    } catch (e: any) {
      setErr(e?.message || "Could not read that PDF.");
    } finally {
      setBusy(false);
    }
  };

  const flagsLiteral = PRECEPT_FLAG_LABELS.map(
    ([f]) => `    ${f}: ${flags[f] ? "true" : "false"},`,
  ).join("\n");
  const configSnippet =
    `// scripts/ladr-data/precept_current.ts\n` +
    `cycle: ${JSON.stringify(cycle || "FY27 Active-Duty E7")},\n` +
    `title: ${JSON.stringify(title || "FY27 CPO Selection Board emphasis")},\n` +
    `emphasis_flags: {\n${flagsLiteral}\n},\n` +
    `source_url: ${JSON.stringify(preview?.source_url ?? url)},\n` +
    `active: true,`;

  return (
    <div className="apex-card p-6 space-y-4">
      <div className="space-y-1">
        <h3 className="text-sm font-bold gold-accent uppercase tracking-wider">
          Reference a published precept
        </h3>
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          Read the board&apos;s precept here and confirm which of the five areas
          it emphasizes. Precepts are broad prose, so the suggestions below are a
          starting point — set the flags from the text, not the guess. Precepts
          are published on MyNavyHR:{" "}
          <a
            href="https://www.mynavyhr.navy.mil/Career-Management/Boards/Flag/Precepts/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Flag boards
          </a>
          {" · "}
          <a
            href="https://www.mynavyhr.navy.mil/Career-Management/Boards/Active-Duty-Enlisted/CPO-Selection-Boards/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            CPO (enlisted) boards
          </a>
          .
        </p>
      </div>

      {/* Upload is the primary path — no server egress to MyNavyHR needed. */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="apex-btn-primary text-xs cursor-pointer">
          {busy ? "Reading…" : "Upload precept PDF"}
          <input
            type="file"
            accept="application/pdf"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) doUpload(f);
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-xs" style={{ color: "var(--subtle)" }}>
          Download the precept PDF from MyNavyHR, then upload it here.
        </span>
      </div>

      <details className="text-xs">
        <summary className="cursor-pointer" style={{ color: "var(--muted-foreground)" }}>
          Or fetch by URL (needs server internet access to MyNavyHR)
        </summary>
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 flex-1 min-w-[16rem]">
            <span className="apex-filter-label">Precept PDF URL (mynavyhr.navy.mil)</span>
            <input
              className="apex-input text-xs"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              aria-label="Precept PDF URL"
            />
          </label>
          <button
            type="button"
            className="apex-btn-secondary text-xs"
            onClick={doFetch}
            disabled={busy}
          >
            {busy ? "Fetching…" : "Fetch precept"}
          </button>
        </div>
      </details>
      {err && (
        <p className="text-xs text-red-400" role="alert">
          {err}
        </p>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="apex-filter-label">Board cycle</span>
              <input
                className="apex-input text-xs"
                placeholder="FY27 Active-Duty E7"
                value={cycle}
                onChange={(e) => setCycle(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="apex-filter-label">Title</span>
              <input
                className="apex-input text-xs"
                placeholder="FY27 CPO Selection Board emphasis"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
          </div>

          <div className="space-y-2">
            <span className="apex-filter-label">Emphasis areas (confirm against the text)</span>
            {PRECEPT_FLAG_LABELS.map(([flag, label]) => {
              const s = preview.suggestions.find((x) => x.flag === flag);
              return (
                <label key={flag} className="flex items-start gap-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={flags[flag]}
                    onChange={(e) =>
                      setFlags((prev) => ({ ...prev, [flag]: e.target.checked }))
                    }
                    aria-label={`Emphasize ${label}`}
                  />
                  <span>
                    <span style={{ color: "var(--foreground)" }}>{label}</span>
                    {s && (
                      <span
                        className="block italic"
                        style={{ color: "var(--muted-foreground)" }}
                      >
                        suggested — {s.evidence}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>

          <details className="text-xs">
            <summary
              className="cursor-pointer"
              style={{ color: "var(--muted-foreground)" }}
            >
              Precept text {preview.truncated ? "(first 20k chars)" : ""}
            </summary>
            <pre
              className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg p-3 text-[11px] leading-relaxed"
              style={{ background: "var(--muted)", color: "var(--foreground)" }}
            >
              {preview.excerpt}
            </pre>
          </details>

          <div className="space-y-2">
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              Setting the active precept is a privileged, service-role operation
              (it drives every member&apos;s score). Put these values in{" "}
              <code>scripts/ladr-data/precept_current.ts</code> and run{" "}
              <code>npm run seed:precept</code>:
            </p>
            <pre
              className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg p-3 text-[11px] leading-relaxed"
              style={{ background: "var(--muted)", color: "var(--foreground)" }}
            >
              {configSnippet}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

// Exported for tests. Its three states — no row, a row citing no convening
// order, and a sourced row — were unpinned, and a one-character revert of the
// sourcing check (`!!precept.source_url` -> `!!precept`) passed all 805 tests
// while putting emerald "feed the Board Emphasis factor" chips back in front of
// a member whose Results tab said APEX had excluded them.
export default function PreceptPanel({ precept }: { precept: BoardPrecept | null }) {
  return (
    <div className="space-y-4">
      {precept ? (
        <ActivePreceptCard precept={precept} />
      ) : (
        <div className="apex-card p-6">
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            No board precept is loaded, so the Board Emphasis factor is excluded
            and its 10% weight is spread across the other five factors. This is
            expected until a precept is set — load one below to score emphasis.
          </p>
        </div>
      )}
      <PreceptReference />
    </div>
  );
}

