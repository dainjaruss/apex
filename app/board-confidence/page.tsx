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
  listMyAnalyses,
  saveMemberBoardRecord,
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

function PreceptPanel({ precept }: { precept: BoardPrecept | null }) {
  if (!precept) {
    return (
      <div className="apex-card p-8 text-center">
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          No board precept is configured. The Precept Alignment factor will be
          excluded and its weight redistributed.
        </p>
      </div>
    );
  }
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
        Emphasis areas are admin-configured per board cycle and feed the Precept
        Alignment factor. This panel is read-only.
      </p>
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
        setLoadError(err?.message || "Failed to load board confidence data.");
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
        Loading board confidence data…
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
            Error Loading Board Confidence
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
      breadcrumbs={[{ label: "Board Confidence" }]}
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
            <h1 className="apex-page-title">Board Confidence Analyzer</h1>
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
