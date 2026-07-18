// app/brag-sheet/page.tsx
//
// APEX Brag Sheet — structured year-round accomplishment collector with
// AI auto-fill of the validated narrative blocks (spec §6).
// Spec: docs/specs/brag-sheet.md. Disclaimer (§1.1) renders at the top of the
// page, again inside the review panel, and short-form in the footer. Uploads
// are extracted in memory server-side and never persisted; AI generation is
// consent-gated and every generated block requires explicit per-block review
// before applyBragDraft writes anything to a draft evaluation.
//

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import RoleGuard, { AccessDeniedPanel } from "@/components/RoleGuard";
import BragDisclaimerBanner from "@/components/brag/BragDisclaimerBanner";
import BragSheetEditor from "@/components/brag/BragSheetEditor";
import BragConsentModal from "@/components/brag/BragConsentModal";
import UploadZone from "@/components/brag/UploadZone";
import ExtractPreview from "@/components/brag/ExtractPreview";
import AutofillReviewPanel from "@/components/brag/AutofillReviewPanel";
import { getSession } from "@/lib/auth";
import { createBrowserClient } from "@/lib/supabaseClient";
import { paygradeOf } from "@/lib/paygrade";
import { BRAG_PDF_FOOTER } from "@/lib/bragSheet/types";
import type {
  AutofillResponse,
  BragAdmin,
  BragDuty,
  BragPfaCycle,
  BragQualifications,
  BragSheet,
  BragSheetData,
} from "@/lib/bragSheet/types";
import { generateBragSheetPdf } from "@/lib/bragSheet/pdf";
import { BragSheetDataSchema } from "@/lib/bragSheet/autofill";
import type { BragExtractSuggestions } from "@/lib/bragSheet/extract";
import {
  applyBragDraft,
  createBragSheet,
  extractBragPdf,
  getAutofillAvailability,
  listMyBragSheets,
  recordAiConsent,
  runBragAutofillRequest,
  saveBragSheet,
  type AcceptedBlocks,
} from "@/lib/bragSheetService";
import type { Profile } from "@/types";

const supabase = createBrowserClient();

type ReportType = BragSheet["report_type"];

// Paygrade-suggested report type — same gating logic as /evaluations/new's
// suggestFormCode, collapsed to the three brag-sheet report types.
function suggestReportType(rank?: string): ReportType {
  const pg = rank ? paygradeOf(rank) : null;
  if (!pg) return "EVAL";
  if (pg === "E-7" || pg === "E-8" || pg === "E-9") return "CHIEFEVAL";
  if (/^(W-[2-5]|O-[1-8])$/.test(pg)) return "FITREP";
  return "EVAL";
}

const REPORT_TYPES: ReportType[] = ["EVAL", "CHIEFEVAL", "FITREP"];

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function BragSheetPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [sheets, setSheets] = useState<BragSheet[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = sheets.find((s) => s.id === activeId) ?? null;
  const activeRef = useRef<BragSheet | null>(null);
  activeRef.current = active;

  const [saveTick, setSaveTick] = useState(0);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // New-sheet form
  const [showNew, setShowNew] = useState(false);
  const [newType, setNewType] = useState<ReportType>("EVAL");
  const [newFrom, setNewFrom] = useState("");
  const [newTo, setNewTo] = useState("");
  const [creating, setCreating] = useState(false);

  // JSON import
  const importRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // PDF extraction
  const [extractBusy, setExtractBusy] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<BragExtractSuggestions | null>(
    null,
  );

  // AI generation
  const [availability, setAvailability] = useState<{
    available: boolean;
    model: string | null;
  } | null>(null);
  const [pitch, setPitch] = useState<"10" | "12">("10");
  const [generating, setGenerating] = useState(false);
  const [genMsg, setGenMsg] = useState<string | null>(null);
  const [review, setReview] = useState<AutofillResponse | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentSaving, setConsentSaving] = useState(false);
  const [applying, setApplying] = useState(false);

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
        const [profileRes, mySheets, avail] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", uid).single(),
          listMyBragSheets(uid),
          getAutofillAvailability().catch(() => ({
            available: false,
            model: null,
          })),
        ]);
        if (profileRes.data) {
          const prof = profileRes.data as Profile;
          setProfile(prof);
          setNewType(suggestReportType(prof.navy_rank));
        }
        setSheets(mySheets);
        if (mySheets[0]?.id) {
          setActiveId(mySheets[0].id);
          setReview(mySheets[0].last_autofill ?? null);
        }
        setAvailability(avail);
      } catch (err: any) {
        console.error("Brag sheet page load failed:", err);
        setLoadError(err?.message || "Failed to load brag sheet data.");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  // Debounced autosave of the active sheet's data (spec §6).
  useEffect(() => {
    if (saveTick === 0) return;
    const t = setTimeout(async () => {
      const s = activeRef.current;
      if (!s?.id) return;
      try {
        await saveBragSheet(s.id, { data: s.data });
        setSaveMsg("Saved.");
      } catch (err: any) {
        setSaveMsg(err?.message || "Save failed.");
      }
    }, 800);
    return () => clearTimeout(t);
  }, [saveTick]);

  const mutateData = useCallback(
    (next: BragSheetData) => {
      setSheets((prev) =>
        prev.map((s) => (s.id === activeId ? { ...s, data: next } : s)),
      );
      setSaveTick((t) => t + 1);
    },
    [activeId],
  );

  const selectSheet = (sheet: BragSheet) => {
    setActiveId(sheet.id!);
    setReview(sheet.last_autofill ?? null);
    setSuggestions(null);
    setGenMsg(null);
    setImportError(null);
  };

  const createNew = async () => {
    if (!userId || !newFrom || !newTo) {
      setSaveMsg("Report type and both period dates are required.");
      return;
    }
    setCreating(true);
    try {
      const created = await createBragSheet(userId, {
        report_type: newType,
        period_from: newFrom,
        period_to: newTo,
      });
      setSheets((prev) => [created, ...prev]);
      setActiveId(created.id!);
      setReview(null);
      setShowNew(false);
      setNewFrom("");
      setNewTo("");
    } catch (err: any) {
      setSaveMsg(err?.message || "Could not create brag sheet.");
    } finally {
      setCreating(false);
    }
  };

  // ── Toolbar ────────────────────────────────────────────────────────────────

  const downloadPdf = async () => {
    if (!active) return;
    try {
      let courierPrime: Uint8Array | undefined;
      try {
        const res = await fetch("/fonts/CourierPrime-Regular.ttf");
        if (res.ok) courierPrime = new Uint8Array(await res.arrayBuffer());
      } catch {
        // fall back to StandardFonts.Courier inside the generator
      }
      const bytes = await generateBragSheetPdf(
        active,
        courierPrime ? { courierPrime } : undefined,
      );
      downloadBlob(
        new Blob([bytes as BlobPart], { type: "application/pdf" }),
        `brag-sheet-${active.period_to}.pdf`,
      );
    } catch (err: any) {
      setSaveMsg(err?.message || "PDF generation failed.");
    }
  };

  const downloadJson = () => {
    if (!active) return;
    downloadBlob(
      new Blob([JSON.stringify(active, null, 2)], { type: "application/json" }),
      `brag-sheet-${active.period_to}.json`,
    );
  };

  const importJson = async (file: File) => {
    setImportError(null);
    try {
      const parsed = JSON.parse(await file.text());
      const result = BragSheetDataSchema.safeParse(parsed?.data ?? parsed);
      if (!result.success) {
        const issue = result.error.issues[0];
        setImportError(
          `Import failed at "${issue.path.join(".")}": ${issue.message}`,
        );
        return;
      }
      if (!window.confirm("Replace the current sheet's contents?")) return;
      mutateData(result.data);
    } catch {
      setImportError("Import failed: not valid JSON.");
    }
  };

  const handleExtract = async (file: File) => {
    setExtractBusy(true);
    setExtractError(null);
    setSuggestions(null);
    try {
      setSuggestions(await extractBragPdf(file));
    } catch (err: any) {
      // Route messages (400/413/422) render verbatim (§6).
      setExtractError(err?.message || "Could not read that PDF.");
    } finally {
      setExtractBusy(false);
    }
  };

  // ── Extraction accepts (nothing merges without a click, §4.5/§6) ───────────

  const acceptAdmin = (patch: Partial<BragAdmin>) => {
    if (!active) return;
    mutateData({ ...active.data, admin: { ...active.data.admin, ...patch } });
  };
  const acceptDuty = (
    d: Pick<BragDuty, "title" | "kind" | "months_assigned" | "is_most_significant">,
  ) => {
    if (!active) return;
    const cleared = d.is_most_significant
      ? active.data.duties.map((row) => ({ ...row, is_most_significant: false }))
      : active.data.duties;
    mutateData({ ...active.data, duties: [...cleared, { ...d, bullets: [] }] });
  };
  const acceptQual = (q: BragQualifications["quals"][number]) => {
    if (!active) return;
    mutateData({
      ...active.data,
      qualifications: {
        ...active.data.qualifications,
        quals: [...active.data.qualifications.quals, q],
      },
    });
  };
  const acceptPfa = (c: BragPfaCycle) => {
    if (!active) return;
    mutateData({ ...active.data, pfa: [...active.data.pfa, c] });
  };
  const acceptBullet = (text: string) => {
    if (!active) return;
    mutateData({
      ...active.data,
      accomplishments: [...active.data.accomplishments, { text }],
    });
  };

  // ── Citation "go to source": scroll + flash the editor row ────────────────

  const goToPath = (path: string) => {
    let p = path.startsWith("brag.") ? path.slice(5) : path;
    while (p) {
      const el = document.querySelector<HTMLElement>(
        `[data-brag-path="${p}"]`,
      );
      if (el) {
        const details = el.closest("details");
        if (details) details.open = true;
        if (el instanceof HTMLDetailsElement) el.open = true;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const prev = el.style.outline;
        el.style.outline = "2px solid var(--accent-gold)";
        setTimeout(() => {
          el.style.outline = prev;
        }, 2000);
        return;
      }
      const cut = Math.max(p.lastIndexOf("."), p.lastIndexOf("["));
      p = cut > 0 ? p.slice(0, cut) : "";
    }
  };

  // ── AI generation (consent-gated; availability-probed) ────────────────────

  const generate = useCallback(async () => {
    const s = activeRef.current;
    if (!s?.id || generating) return;
    if (!s.consented_at) {
      setConsentOpen(true);
      return;
    }
    setGenerating(true);
    setGenMsg(null);
    try {
      const res = await runBragAutofillRequest({ bragSheetId: s.id, pitch });
      setReview(res);
      setSheets((prev) =>
        prev.map((row) =>
          row.id === s.id ? { ...row, last_autofill: res } : row,
        ),
      );
    } catch (err: any) {
      const msg: string = err?.message || "Draft generation failed.";
      setGenMsg(
        msg.includes("unusable") ? "Model output unusable — try again" : msg,
      );
    } finally {
      setGenerating(false);
    }
  }, [generating, pitch]);

  const acceptConsent = async () => {
    const s = activeRef.current;
    if (!s?.id) return;
    setConsentSaving(true);
    try {
      const saved = await recordAiConsent(s.id);
      setSheets((prev) => prev.map((row) => (row.id === s.id ? saved : row)));
      setConsentOpen(false);
      // Proceed straight to generation after consent (spec §6).
      setTimeout(() => generate(), 0);
    } catch (err: any) {
      setGenMsg(err?.message || "Could not record consent.");
      setConsentOpen(false);
    } finally {
      setConsentSaving(false);
    }
  };

  const apply = async (accepted: AcceptedBlocks) => {
    if (!userId || !active) return;
    setApplying(true);
    try {
      const saved = await applyBragDraft(userId, active, accepted, pitch);
      router.push(`/evaluations/${saved.id}`);
    } catch (err: any) {
      setGenMsg(err?.message || "Could not create the draft evaluation.");
      setApplying(false);
    }
  };

  if (loading) {
    return (
      <div
        className="flex items-center justify-center min-h-screen text-sm"
        style={{
          background: "var(--background)",
          color: "var(--muted-foreground)",
        }}
      >
        Loading brag sheet…
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
            Error Loading Brag Sheet
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

  const suggested = suggestReportType(profile.navy_rank);

  return (
    <AppShell
      profile={profile}
      maxWidth="6xl"
      breadcrumbs={[{ label: "Brag Sheet" }]}
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
            <h1 className="apex-page-title">Brag Sheet</h1>
            <p className="apex-page-subtitle">
              {active
                ? `${active.report_type} · ${active.period_from} – ${active.period_to}`
                : "No brag sheet selected — create one to get started."}
            </p>
          </div>

          {/* §1.1: disclaimer at the top of the page */}
          <BragDisclaimerBanner />

          {loadError && (
            <div className="p-4 rounded-lg text-xs border border-red-500/30 bg-red-950/30 text-red-300">
              {loadError}
            </div>
          )}

          {/* Sheet list + header bar */}
          <div className="flex items-center gap-2 flex-wrap">
            {sheets.length > 0 && (
              <div className="apex-queue-tab-track w-fit">
                {sheets.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => selectSheet(s)}
                    aria-pressed={s.id === activeId}
                    className={`apex-queue-tab ${
                      s.id === activeId ? "apex-queue-tab--active" : ""
                    }`}
                  >
                    {s.report_type} · {s.period_to}
                    {s.status === "submitted" ? " ✓" : ""}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              className="apex-btn-secondary py-1.5 px-3 text-xs"
              onClick={() => setShowNew((v) => !v)}
            >
              + New Brag Sheet
            </button>
          </div>

          {showNew && (
            <div className="apex-card p-4 flex flex-wrap items-end gap-3">
              <label className="flex flex-col gap-1">
                <span className="apex-filter-label">Report type</span>
                <select
                  className="apex-select text-sm"
                  aria-label="Report type"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as ReportType)}
                >
                  {REPORT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                      {t === suggested ? " (recommended for your paygrade)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="apex-filter-label">Period from</span>
                <input
                  type="date"
                  className="apex-input text-sm"
                  value={newFrom}
                  onChange={(e) => setNewFrom(e.target.value)}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="apex-filter-label">Period to</span>
                <input
                  type="date"
                  className="apex-input text-sm"
                  value={newTo}
                  onChange={(e) => setNewTo(e.target.value)}
                />
              </label>
              <button
                type="button"
                className="apex-btn-primary py-1.5 px-4 text-sm disabled:opacity-50"
                onClick={createNew}
                disabled={creating || !newFrom || !newTo}
              >
                {creating ? "Creating…" : "Create"}
              </button>
            </div>
          )}

          {saveMsg && (
            <p
              role="status"
              className="text-xs"
              style={{ color: "var(--muted-foreground)" }}
            >
              {saveMsg}
            </p>
          )}

          {active && (
            <>
              {/* Toolbar */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  className="apex-btn-secondary py-1.5 px-3 text-xs"
                  onClick={downloadPdf}
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  className="apex-btn-secondary py-1.5 px-3 text-xs"
                  onClick={downloadJson}
                >
                  Download JSON
                </button>
                <button
                  type="button"
                  className="apex-btn-secondary py-1.5 px-3 text-xs"
                  onClick={() => importRef.current?.click()}
                >
                  Import JSON
                </button>
                <input
                  ref={importRef}
                  type="file"
                  accept="application/json"
                  className="hidden"
                  aria-label="Import brag sheet JSON"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) importJson(f);
                    e.target.value = "";
                  }}
                />
              </div>
              {importError && (
                <p
                  role="alert"
                  className="text-xs"
                  style={{ color: "var(--destructive)" }}
                >
                  {importError}
                </p>
              )}

              {/* Upload PDF drag-drop zone + extraction preview */}
              <UploadZone onFile={handleExtract} busy={extractBusy} />
              {extractError && (
                <p
                  role="alert"
                  className="text-xs"
                  style={{ color: "var(--destructive)" }}
                >
                  {extractError}
                </p>
              )}
              {suggestions && (
                <ExtractPreview
                  suggestions={suggestions}
                  onAcceptAdmin={acceptAdmin}
                  onAcceptDuty={acceptDuty}
                  onAcceptQual={acceptQual}
                  onAcceptPfa={acceptPfa}
                  onAcceptBullet={acceptBullet}
                  onClose={() => setSuggestions(null)}
                />
              )}

              {/* Section editor */}
              <BragSheetEditor
                data={active.data}
                reportType={active.report_type}
                onChange={mutateData}
              />

              {/* Generate control */}
              <div className="apex-card p-4 space-y-3">
                {availability && !availability.available ? (
                  <p
                    className="text-xs"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    AI drafting is not configured on this server.
                  </p>
                ) : (
                  <div className="flex items-end gap-3 flex-wrap">
                    <label className="flex flex-col gap-1">
                      <span className="apex-filter-label">Block 43 pitch</span>
                      <select
                        className="apex-select text-sm"
                        aria-label="Block 43 pitch"
                        value={pitch}
                        onChange={(e) => setPitch(e.target.value as "10" | "12")}
                      >
                        <option value="10">10-pitch (90 CPL)</option>
                        <option value="12">12-pitch (84 CPL)</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      className="apex-btn-primary disabled:opacity-50"
                      onClick={generate}
                      disabled={generating}
                    >
                      {generating
                        ? "Generating…"
                        : `Generate ${active.report_type} Draft`}
                    </button>
                    {availability?.model && (
                      <span
                        className="text-xs pb-2"
                        style={{ color: "var(--subtle)" }}
                      >
                        Model: {availability.model}
                      </span>
                    )}
                  </div>
                )}
                {genMsg && (
                  <p
                    role="status"
                    className="text-xs"
                    style={{ color: "var(--destructive)" }}
                  >
                    {genMsg}
                  </p>
                )}
              </div>

              {/* Review panel (result of this run, or last_autofill on load) */}
              {review && (
                <AutofillReviewPanel
                  sheet={active}
                  result={review}
                  pitch={pitch}
                  generating={generating}
                  applying={applying}
                  onRegenerate={generate}
                  onGoToSource={goToPath}
                  onApply={apply}
                />
              )}
            </>
          )}

          {/* §1.1: short-form disclaimer line in the page footer */}
          <footer
            className="border-t pt-4 text-[11px] leading-relaxed"
            style={{
              borderColor: "var(--border)",
              color: "var(--muted-foreground)",
            }}
          >
            {BRAG_PDF_FOOTER}
          </footer>
        </div>

        {consentOpen && (
          <BragConsentModal
            onAccept={acceptConsent}
            onDecline={() => setConsentOpen(false)}
            saving={consentSaving}
          />
        )}
      </RoleGuard>
    </AppShell>
  );
}
