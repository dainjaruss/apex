// app/board-confidence/page.tsx
//
// Board Confidence Analyzer — unofficial self-assessment scoring a Sailor's
// record against the modeled board confidence vote bands.
// Spec: docs/specs/board-confidence-analyzer.md §6 (UI contract) and §1.1
// (disclaimer, rendered verbatim on entry AND results views).
//

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import RoleGuard, { AccessDeniedPanel } from "@/components/RoleGuard";
import BoardDisclaimer from "@/components/board/BoardDisclaimer";
import RecordEntryForm, {
  FinalizedEvalRef,
} from "@/components/board/RecordEntryForm";
import LadrChecklist from "@/components/board/LadrChecklist";
import ResultsView from "@/components/board/ResultsView";
import BoardConsentModal from "@/components/board/BoardConsentModal";
import { getSession } from "@/lib/auth";
import { createBrowserClient } from "@/lib/supabaseClient";
import {
  getActivePrecept,
  getMemberBoardRecord,
  getLatestLadr,
  fetchLadr,
  fetchPreceptPreview,
  extractPreceptFromFile,
  listMyAnalyses,
  saveMemberBoardRecord,
  type PreceptPreview,
} from "@/lib/boardConfidenceService";
import type {
  BoardAnalysisRow,
  BoardPrecept,
  LadrDocument,
  LadrMilestone,
  MemberBoardRecord,
  PreceptFlag,
} from "@/lib/boardConfidence/types";
import type { Profile } from "@/types";

const supabase = createBrowserClient();

const TABS = [
  ["record", "Record Entry"],
  ["ladr", "LaDR Checklist"],
  ["precept", "Precept"],
  ["results", "Results"],
] as const;

type TabKey = (typeof TABS)[number][0];

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

function ActivePreceptCard({ precept }: { precept: BoardPrecept }) {
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
          return (
            <span
              key={flag}
              className={`${set ? "apex-badge-emerald" : "apex-badge-draft"} px-2.5 py-1 text-[11px]`}
            >
              {label}
              {set ? "" : " — not emphasized"}
            </span>
          );
        })}
      </div>
      <p className="text-xs" style={{ color: "var(--subtle)" }}>
        Emphasis areas are set per board cycle and feed the Precept Alignment
        factor. This panel is read-only.
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

function PreceptPanel({ precept }: { precept: BoardPrecept | null }) {
  return (
    <div className="space-y-4">
      {precept ? (
        <ActivePreceptCard precept={precept} />
      ) : (
        <div className="apex-card p-6">
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            No board precept is loaded, so the Precept Alignment factor is
            excluded and its 10% weight is spread across the other five factors.
            This is expected until a precept is set — load one below to score
            alignment.
          </p>
        </div>
      )}
      <PreceptReference />
    </div>
  );
}

const isIsoDate = (s: string | null | undefined): boolean =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));

// v1.1 review fix: rows saved without dates silently change scores (the engine
// must exclude or conservatively count them) — block the save and name the rows.
const dateErrors = (r: MemberBoardRecord): string[] => {
  const errs: string[] = [];
  r.awards.forEach((a, i) => {
    if (!isIsoDate(a.date_awarded)) errs.push(`award ${i + 1}`);
  });
  r.pfa_history.forEach((p, i) => {
    if (!isIsoDate(p.date)) errs.push(`PFA cycle ${i + 1}`);
  });
  r.tours.forEach((t, i) => {
    if (!isIsoDate(t.start) || (t.end !== null && !isIsoDate(t.end)))
      errs.push(`tour ${i + 1}`);
    else if (t.end !== null && t.end < t.start)
      errs.push(`tour ${i + 1} (end before start)`);
  });
  r.adverse.forEach((a, i) => {
    if (!isIsoDate(a.date)) errs.push(`adverse entry ${i + 1}`);
  });
  return errs;
};

const emptyRecord = (userId: string): MemberBoardRecord => ({
  user_id: userId,
  rating_abbrev: null,
  target_paygrade: null,
  psr_entered: false,
  awards: [],
  necs: [],
  quals: [],
  education: [],
  pfa_history: [],
  tours: [],
  adverse: [],
  eval_context: {},
  ladr_checklist: {},
});

export default function BoardConfidencePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tab, setTab] = useState<TabKey>("record");
  const [record, setRecord] = useState<MemberBoardRecord | null>(null);
  const [ratings, setRatings] = useState<string[]>([]);
  const [ladr, setLadr] = useState<{
    document: LadrDocument;
    milestones: LadrMilestone[];
  } | null>(null);
  const [precept, setPrecept] = useState<BoardPrecept | null>(null);
  const [finalizedEvals, setFinalizedEvals] = useState<FinalizedEvalRef[]>([]);
  const [runs, setRuns] = useState<BoardAnalysisRow[]>([]);
  const [selected, setSelected] = useState<BoardAnalysisRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentDismissed, setConsentDismissed] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const session = await getSession();
        if (!session?.user) {
          router.push("/login");
          return;
        }
        const uid = session.user.id;
        setUserId(uid);
        const [profileRes, rec, activePrecept, myRuns, ratingRows, evalRows] =
          await Promise.all([
            supabase.from("profiles").select("*").eq("id", uid).single(),
            getMemberBoardRecord(uid),
            getActivePrecept(),
            listMyAnalyses(uid),
            supabase.from("ladr_documents").select("rating_abbrev"),
            supabase
              .from("evaluations")
              .select("period_from, period_to, report_type")
              .eq("created_by", uid)
              .or(
                "status.eq.completed,signature_locked.eq.true,routing_stage.eq.locked",
              )
              .order("period_to", { ascending: true }),
          ]);
        if (profileRes.data) setProfile(profileRes.data as Profile);
        setRecord(rec ?? emptyRecord(uid));
        setPrecept(activePrecept);
        setRuns(myRuns);
        setSelected(myRuns[0] ?? null);
        setRatings(
          Array.from(
            new Set(
              ((ratingRows.data as { rating_abbrev: string }[]) ?? []).map(
                (r) => r.rating_abbrev,
              ),
            ),
          ).sort(),
        );
        setFinalizedEvals(((evalRows.data as FinalizedEvalRef[]) ?? []) || []);
      } catch (err: any) {
        console.error("Board confidence page load failed:", err);
        setLoadError(err?.message || "Failed to load record readiness data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // Auto-load the latest LaDR whenever the selected rating changes (§6 tab 2).
  const rating = record?.rating_abbrev ?? null;
  useEffect(() => {
    if (!rating) {
      setLadr(null);
      return;
    }
    let cancelled = false;
    getLatestLadr(rating)
      .then((res) => {
        if (!cancelled) setLadr(res);
      })
      .catch((err) => {
        console.error("LaDR load failed:", err);
        if (!cancelled) setLadr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [rating]);

  // v1.4: on-demand LaDR ingestion from Navy COOL for ratings without a
  // stored document (additive — curated seeds keep working unchanged).
  const [ladrFetching, setLadrFetching] = useState(false);
  const [ladrFetchMsg, setLadrFetchMsg] = useState<string | null>(null);
  const fetchLadrForRating = useCallback(async () => {
    if (!rating) return;
    setLadrFetching(true);
    setLadrFetchMsg(null);
    try {
      const res = await fetchLadr(rating);
      setLadrFetchMsg(
        res.status === "already_current"
          ? `${res.rating} LaDR (${res.version}) is already stored.`
          : `Stored ${res.rating} LaDR, ${res.version}, ${res.milestones} milestones.`,
      );
      setRatings((prev) =>
        prev.includes(rating) ? prev : [...prev, rating].sort(),
      );
      setLadr(await getLatestLadr(rating));
    } catch (err: any) {
      setLadrFetchMsg(err?.message || "LaDR fetch failed.");
    } finally {
      setLadrFetching(false);
    }
  }, [rating]);

  const save = useCallback(async () => {
    if (!userId || !record) return;
    const badRows = dateErrors(record);
    if (badRows.length > 0) {
      setSaveMsg(`Cannot save — add valid dates first: ${badRows.join(", ")}.`);
      return;
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      const { id, user_id, created_at, updated_at, ...patch } = record;
      const saved = await saveMemberBoardRecord(userId, patch);
      setRecord(saved);
      setSaveMsg("Record saved.");
    } catch (err: any) {
      setSaveMsg(err?.message || "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [userId, record]);

  const handleRunComplete = useCallback((row: BoardAnalysisRow) => {
    setRuns((prev) => [row, ...prev]);
    setSelected(row);
  }, []);

  const consented = !!record?.consented_at;

  // First-use consent (server-enforced by the analyze route). Declining keeps
  // the page browsable; Run Analysis stays blocked until consent is recorded.
  const acceptConsent = useCallback(async () => {
    if (!userId || !record) return;
    setConsentSaving(true);
    try {
      const { id, user_id, created_at, updated_at, ...patch } = record;
      const saved = await saveMemberBoardRecord(userId, {
        ...patch,
        consented_at: new Date().toISOString(),
      });
      setRecord(saved);
    } catch (err: any) {
      setSaveMsg(err?.message || "Could not record consent.");
      setConsentDismissed(true);
    } finally {
      setConsentSaving(false);
    }
  }, [userId, record]);

  if (loading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen text-sm"
        style={{
          background: "var(--background)",
          color: "var(--muted-foreground)",
        }}
      >
        Loading record readiness data…
      </div>
    );
  }

  if (!profile) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
        style={{ background: "var(--background)" }}
      >
        <div className="bg-red-950/35 border border-red-900/40 rounded-xl p-6 max-w-md space-y-4">
          <h3 className="text-lg font-bold text-red-400">
            Error Loading Record Readiness
          </h3>
          <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {loadError || "Your profile could not be loaded."}
          </p>
          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="apex-btn-secondary"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      profile={profile}
      maxWidth="6xl"
      breadcrumbs={[{ label: "Record Readiness" }]}
    >
      <RoleGuard
        user={profile}
        allowedRoles={[
          "Sailor",
          "Rater",
          "Senior Rater",
          "Reporting Senior",
          "Admin",
        ]}
        fallback={<AccessDeniedPanel />}
      >
        <div className="space-y-6">
          <div>
            <h1 className="apex-page-title">Record Readiness Review</h1>
            <p className="apex-page-subtitle">
              LaDR:{" "}
              {ladr
                ? `${ladr.document.rating_abbrev} ${ladr.document.version}`
                : "none loaded"}{" "}
              · Precept: {precept ? precept.cycle : "none configured"}
            </p>
          </div>

          {/* §1.1: disclaimer at the top of the page */}
          <BoardDisclaimer />

          {loadError && (
            <div className="p-4 rounded-lg text-xs border border-red-500/30 bg-red-950/30 text-red-300">
              {loadError}
            </div>
          )}

          <div className="apex-queue-tab-track w-fit">
            {TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                aria-pressed={tab === key}
                className={`apex-queue-tab ${
                  tab === key ? "apex-queue-tab--active" : ""
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {saveMsg && (
            <p
              role="status"
              className="text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              {saveMsg}
            </p>
          )}

          {tab === "record" && record && userId && (
            <RecordEntryForm
              userId={userId}
              record={record}
              ratings={ratings}
              finalizedEvals={finalizedEvals}
              onChange={(patch) =>
                setRecord((prev) => (prev ? { ...prev, ...patch } : prev))
              }
              onSave={save}
              saving={saving}
            />
          )}

          {tab === "ladr" && record && rating && !ladr?.document && (
            <div className="apex-card p-4 space-y-2">
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                No LaDR is stored for <strong>{rating}</strong> yet. APEX can
                fetch the official document from Navy COOL and extract its
                milestones automatically.
              </p>
              <button
                type="button"
                className="apex-btn-primary text-sm disabled:opacity-50"
                onClick={fetchLadrForRating}
                disabled={ladrFetching}
              >
                {ladrFetching
                  ? "Fetching from Navy COOL…"
                  : "Fetch official LaDR from Navy COOL"}
              </button>
              {ladrFetchMsg && (
                <p role="status" className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {ladrFetchMsg}
                </p>
              )}
            </div>
          )}

          {tab === "ladr" && record && ladrFetchMsg && ladr?.document && (
            <p role="status" className="text-xs" style={{ color: "var(--muted-foreground)" }}>
              {ladrFetchMsg}
            </p>
          )}

          {tab === "ladr" && record && (
            <LadrChecklist
              document={ladr?.document ?? null}
              milestones={ladr?.milestones ?? []}
              targetPaygrade={record.target_paygrade}
              checklist={record.ladr_checklist}
              onChange={(next) =>
                setRecord((prev) =>
                  prev ? { ...prev, ladr_checklist: next } : prev,
                )
              }
              onSave={save}
              saving={saving}
            />
          )}

          {tab === "precept" && <PreceptPanel precept={precept} />}

          {tab === "results" && (
            <ResultsView
              runs={runs}
              selected={selected}
              onSelect={setSelected}
              onRunComplete={handleRunComplete}
              consentGranted={consented}
              onRequestConsent={() => setConsentDismissed(false)}
            />
          )}

          {/* Persistent footer disclaimer — one of the required layers
              (modal on first use + page banner + this footer + score tooltip). */}
          <footer
            className="border-t pt-4 text-[11px] leading-relaxed"
            style={{
              borderColor: "var(--border)",
              color: "var(--muted-foreground)",
            }}
          >
            Unofficial educational tool — not affiliated with or endorsed by
            the U.S. Navy, MyNavy HR, or any selection board. Scores come from
            a fixed published rubric and do not predict board results.
          </footer>
        </div>

        {record && userId && !consented && !consentDismissed && (
          <BoardConsentModal
            onAccept={acceptConsent}
            onDecline={() => setConsentDismissed(true)}
            saving={consentSaving}
          />
        )}
      </RoleGuard>
    </AppShell>
  );
}
