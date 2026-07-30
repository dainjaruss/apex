// components/blocks/Block43Comments.tsx
//
// Narrative step: Block 43 (Comments on Performance) and Block 44 (Qualifications /
// Achievements). Both use the shared MeasuredCourierField canvas, which wraps exactly as
// the printed form. Block 43 keeps its 10/12-pitch toggle (90/84 CPL); Block 44 is a fixed
// 10-pitch / 91 CPL / 2-line block per BUPERSINST 1610.10H.
//
// Block 43 also hosts the narrative coach (POST /api/eval-coach): does this
// narrative substantiate the trait grades already set? Advisory only — the coach
// never sets or suggests a grade and never touches Block 45, and nothing it sees
// is stored. It is additive: an unconfigured or failing model hides or reports
// itself and the field keeps working exactly as before (docs/EVAL-COACH.md).

"use client";

import React from "react";
import { Evaluation, ValidationIssue } from "@/types";
import { FIELD_FIT } from "@/lib/commentFit";
import BupersGuidelinesInline from "@/components/blocks/BupersGuidelinesInline";
import MeasuredCourierField from "@/components/blocks/MeasuredCourierField";
import { FORM_PANEL, evalFieldId } from "@/lib/formStyles";
import type { CoachFinding, UnassessedTrait } from "@/lib/evalCoach/coach";

interface Block43CommentsProps {
  evalData: Evaluation;
  onChange: (fields: Partial<Evaluation>) => void;
  issues: ValidationIssue[];
  onFocusField?: (field: string | null) => void;
  activeField?: string | null;
}

export default function Block43Comments({
  evalData,
  onChange,
  issues,
  onFocusField,
  activeField,
}: Block43CommentsProps) {
  const pitch = (evalData.block_values?.comment_pitch || "10") as "10" | "12";
  const commentsCpl = pitch === "10" ? 90 : 84;

  const setPitch = (p: "10" | "12") =>
    onChange({ block_values: { ...evalData.block_values, comment_pitch: p } });

  const setBlockValue = (key: string, val: string) =>
    onChange({ block_values: { ...evalData.block_values, [key]: val } });

  const qualSpec = FIELD_FIT.qualifications;

  return (
    <div className={`${FORM_PANEL} mb-6 space-y-8`}>
      {/* ── Block 43: Comments on Performance ── */}
      <div>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 border-b apex-report-divider pb-2">
          <div>
            <h2 className="apex-form-wizard-section-title">
              <span
                className="h-2 w-2 rounded-full bg-[var(--accent-cyan)]"
                aria-hidden
              />
              43: Comments on Performance
            </h2>
            <p
              className="text-xs mt-1"
              style={{ color: "var(--muted-foreground)" }}
            >
              Type directly in the Courier box — it wraps exactly as the printed
              form ({commentsCpl} chars/line × 18 lines).
            </p>
          </div>
          <div className="mt-3 sm:mt-0 flex items-center gap-2">
            <span className="text-xs apex-report-field-label font-semibold uppercase">
              Printing Pitch:
            </span>
            <div
              className="flex rounded-lg border p-0.5"
              style={{
                borderColor: "var(--border)",
                background: "var(--form-input-bg)",
              }}
            >
              <PitchButton
                label="10-Pitch (90 CPL)"
                active={pitch === "10"}
                onClick={() => setPitch("10")}
              />
              <PitchButton
                label="12-Pitch (84 CPL)"
                active={pitch === "12"}
                onClick={() => setPitch("12")}
              />
            </div>
          </div>
        </div>

        <BupersGuidelinesInline
          activeField={activeField || null}
          sectionFields={["comments"]}
        />

        <MeasuredCourierField
          value={evalData.comments || ""}
          onChange={(v) => onChange({ comments: v })}
          charsPerLine={commentsCpl}
          maxLines={18}
          placeholder="TYPE PERFORMANCE NARRATIVE HERE…"
          onFocus={() => onFocusField?.("comments")}
          error={issues.find((i) => i.field === "comments")?.message}
          fieldId={evalFieldId("comments")}
        />

        <NarrativeCoach evalData={evalData} pitch={pitch} />
      </div>

      {/* ── Block 44: Qualifications / Achievements ── */}
      <div>
        <div className="mb-3 border-b apex-report-divider pb-2">
          <h2 className="apex-form-section-heading">
            44: Qualifications / Achievements
          </h2>
          <p className="text-xs apex-text-muted">
            Education, awards, community involvement, etc., during this period (
            {qualSpec.charsPerLine} chars/line × {qualSpec.maxLines} lines).
          </p>
        </div>

        <BupersGuidelinesInline
          activeField={activeField || null}
          sectionFields={["qualifications"]}
        />

        <MeasuredCourierField
          value={evalData.block_values?.qualifications || ""}
          onChange={(v) => setBlockValue("qualifications", v)}
          charsPerLine={qualSpec.charsPerLine}
          maxLines={qualSpec.maxLines}
          placeholder="EDUCATION, AWARDS, COMMUNITY INVOLVEMENT…"
          onFocus={() => onFocusField?.("qualifications")}
          error={issues.find((i) => i.field === "qualifications")?.message}
          fieldId={evalFieldId("bv-qualifications")}
        />
      </div>
    </div>
  );
}

// ── Narrative coach ─────────────────────────────────────────────────────────

interface CoachResponse {
  findings: CoachFinding[];
  notes: string[];
  unassessed: UnassessedTrait[];
  dropped: number;
  model: string;
  budget: { lines_used: number; max_lines: number; chars_per_line: number };
}

const CONSENT_KEY = "apex:eval-coach-consent";

const VERDICT_BADGE: Record<CoachFinding["verdict"], string> = {
  substantiated: "apex-badge-emerald",
  partial: "apex-badge-amber",
  unsupported: "apex-badge-danger",
};
const VERDICT_LABEL: Record<CoachFinding["verdict"], string> = {
  substantiated: "Substantiated",
  partial: "Partly supported",
  unsupported: "Not supported",
};

const CONSENT_TEXT =
  "Running the coach sends your Block 43 narrative and the trait grades you have set to an AI model to be assessed. Nothing is saved: APEX stores no copy of the narrative, the grades, or the coaching, and the model is never asked for — and never given — a grade or a promotion recommendation. Do not include classified information.";

function NarrativeCoach({
  evalData,
  pitch,
}: {
  evalData: Evaluation;
  pitch: "10" | "12";
}) {
  // null = probe not finished; false = server has no model configured, so the
  // whole surface stays hidden and Block 43 behaves exactly as it did before.
  const [available, setAvailable] = React.useState<boolean | null>(null);
  const [consented, setConsented] = React.useState(false);
  const [askConsent, setAskConsent] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<CoachResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setConsented(localStorage.getItem(CONSENT_KEY) === "true");
    let live = true;
    fetch("/api/eval-coach")
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((d) => live && setAvailable(!!d.available))
      .catch(() => live && setAvailable(false));
    return () => {
      live = false;
    };
  }, []);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/eval-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          report_type: evalData.report_type,
          pitch,
          comments: evalData.comments || "",
          trait_grades: evalData.trait_grades || {},
          consent: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      // Model failure is not a validation failure: report it quietly and leave
      // the narrative field untouched.
      if (!res.ok) throw new Error(body?.error || "Coaching is unavailable.");
      setResult(body as CoachResponse);
    } catch (err: any) {
      setResult(null);
      setError(err?.message || "Coaching is unavailable right now.");
    } finally {
      setBusy(false);
    }
  };

  const onClick = () => {
    if (!consented) {
      setAskConsent(true);
      return;
    }
    void run();
  };

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, "true");
    setConsented(true);
    setAskConsent(false);
    void run();
  };

  if (!available) return null;

  return (
    <section className="mt-4" aria-labelledby="eval-coach-heading">
      <div className="flex flex-wrap items-center justify-between gap-2 border-t apex-report-divider pt-3">
        <div>
          <h3
            id="eval-coach-heading"
            className="text-xs font-bold uppercase tracking-wider"
          >
            Narrative Coach
          </h3>
          <p className="text-xs apex-text-muted">
            Checks whether this narrative substantiates the trait grades you set.
            Advisory only — it never sets or suggests a grade, and nothing you
            send is stored.
          </p>
        </div>
        <button
          type="button"
          onClick={onClick}
          disabled={busy}
          aria-busy={busy}
          className="apex-btn-secondary py-1 text-xs disabled:opacity-50"
        >
          {busy ? "Reviewing…" : result ? "Review again" : "Review my narrative"}
        </button>
      </div>

      {askConsent && (
        <div
          className="mt-3 rounded-lg border p-3 text-xs"
          style={{ borderColor: "var(--border)" }}
        >
          <p className="mb-2">{CONSENT_TEXT}</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={accept}
              className="apex-btn-primary py-1 text-xs"
            >
              I understand — review my narrative
            </button>
            <button
              type="button"
              onClick={() => setAskConsent(false)}
              className="apex-btn-ghost py-1 text-xs"
            >
              Not now
            </button>
          </div>
        </div>
      )}

      <div aria-live="polite" className="mt-3 space-y-3">
        {busy && <p className="text-xs apex-text-muted">Reviewing your narrative…</p>}

        {error && (
          <p className="text-xs apex-text-muted">
            {error} Your narrative is unaffected — keep writing.
          </p>
        )}

        {result && !busy && (
          <>
            {result.notes.length > 0 && (
              <ul className="text-xs space-y-1 list-disc pl-4">
                {result.notes.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            )}

            {result.findings.map((f) => (
              <div
                key={f.trait}
                className="rounded-lg border p-3"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <span className="text-xs font-bold">
                    {f.block}: {f.title}
                  </span>
                  <span className="text-xs apex-text-muted">
                    graded {f.grade}
                  </span>
                  <span className={VERDICT_BADGE[f.verdict]}>
                    {VERDICT_LABEL[f.verdict]}
                  </span>
                </div>
                {f.evidence && (
                  <blockquote
                    className="text-xs italic border-l-2 pl-2 my-1"
                    style={{ borderColor: "var(--border)" }}
                  >
                    {f.evidence}
                  </blockquote>
                )}
                <p className="text-xs">{f.rationale}</p>
                {f.suggestion && (
                  <p className="text-xs mt-1">
                    <span className="font-semibold">To strengthen it: </span>
                    {f.suggestion}
                  </p>
                )}
              </div>
            ))}

            {/* Reconciliation, not decoration: without this a trait the model
                skipped or the gates dropped just has no card, which reads as
                "that one is fine". */}
            {result.unassessed.length > 0 && (
              <div
                className="rounded-lg border p-3"
                style={{ borderColor: "var(--border)" }}
              >
                <p className="text-xs font-bold mb-1">Not assessed this run</p>
                <p className="text-xs apex-text-muted">
                  {result.unassessed
                    .map((u) => `${u.block}: ${u.title} (graded ${u.grade})`)
                    .join(" · ")}
                </p>
                <p className="text-xs apex-text-muted mt-1">
                  No conclusion either way — run it again to get a reading on
                  {result.unassessed.length === 1 ? " this trait." : " these traits."}
                </p>
              </div>
            )}

            <p className="text-xs apex-text-muted">
              {result.model} · advisory only, nothing stored
              {result.dropped > 0
                ? ` · ${result.dropped} uncited or duplicate item${result.dropped === 1 ? "" : "s"} removed`
                : ""}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

function PitchButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1 text-xs font-bold rounded-md transition duration-150 ${active ? "apex-btn-primary py-1" : "apex-btn-ghost py-1"}`}
    >
      {label}
    </button>
  );
}
