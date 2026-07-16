// components/EvaluationForm.tsx
//
// Form orchestrator linking the administrative, trait grading, and comments modules
// under a paginated wizard flow featuring inline real-time Navy guidelines validation.
//
// Entries autosave to localStorage as the user works (recoverable across refresh /
// tab-close) — NOT to the database. Only "Save Evaluation Draft" writes to the DB,
// which then clears the local copy. A "Field Guidelines" toggle lets power users
// hide the inline BUPERS banners.

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Evaluation, SummaryGroup, ValidationIssue } from "@/types";
import {
  listOpenGroups,
  fetchGroupAveragePool,
} from "@/lib/summaryGroupService";
import {
  describeSummaryGroup,
  EvalForSummaryGroup,
  visibleSummaryGroupsForEval,
} from "@/lib/summaryGroupEligibility";
import { computeTraitAverage, round2 } from "@/lib/traitAverage";
import { canViewSummaryAverage } from "@/lib/permissions";
import { paygradeOf } from "@/lib/paygrade";
import Block1Admin from "@/components/blocks/EvaluationFormParts/Block1Admin";
import Block33to39Traits from "@/components/blocks/Block33to39Traits";
import Block43Comments from "@/components/blocks/Block43Comments";
import Block42Signatures from "@/components/blocks/EvaluationFormParts/Block42Signatures";
import { useLiveValidation } from "@/hooks/useLiveValidation";
import { useFinalValidation } from "@/hooks/useFinalValidation";
import ValidationResultsModal from "@/components/ValidationResultsModal";
import { GuidelinesVisibilityContext } from "@/components/GuidelinesVisibility";
import {
  draftStorageKey,
  readEvalDraft,
  useEvaluationAutosave,
} from "@/hooks/useEvaluationAutosave";

interface EvaluationFormProps {
  initialData: Evaluation;
  onSave: (data: Evaluation) => Promise<void>;
  // Persist the current data to the DB WITHOUT navigating away (used by the recovered-draft
  // banner's "Save" action). Returns the saved record so the form can adopt its new id.
  onSaveInPlace?: (data: Evaluation) => Promise<Evaluation | void>;
  onCancel: () => void;
  isSaving: boolean;
  // The editing user's role — gates Block 50a (summary group average): sailors don't see it while
  // drafting; reviewers do. Defaults to hidden when unknown.
  viewerRole?: string;
  formCode?: string;
}

const STEPS = [
  { id: "admin", title: "1. Admin & Command Info" },
  { id: "traits", title: "2. Performance Traits" },
  { id: "comments", title: "3. Narrative & Comments" },
  { id: "signatures", title: "4. Signatures & RS Info" },
];

const GUIDELINES_PREF_KEY = "apex:show-field-guidelines";

const RAIL_ISSUE_LIMIT = 6;

/** Maps validation issue fields to wizard step index (0–3). */
function issueAppliesToStep(field: string | undefined, step: number): boolean {
  const f = field ?? "";
  if (step === 1) return f.startsWith("trait_grades");
  if (step === 2) return f === "comments";
  if (step === 3) {
    return (
      f.startsWith("block_values") ||
      f.includes("signature") ||
      /^block_(42|49|50|51|52)/.test(f)
    );
  }
  if (f.startsWith("trait_grades") || f === "comments") return false;
  if (f.startsWith("block_values") || f.includes("signature")) return false;
  return true;
}

export default function EvaluationForm({
  initialData,
  onSave,
  onSaveInPlace,
  onCancel,
  isSaving,
  viewerRole,
  formCode,
}: EvaluationFormProps) {
  // Stable per-evaluation autosave key (DB id when editing, per-user slot when new).
  const autosaveKey = useMemo(
    () =>
      draftStorageKey({
        id: initialData.id,
        createdBy: initialData.created_by,
      }),
    [initialData.id, initialData.created_by],
  );

  // SSR-safe initial state: deterministic on server and first client render. Any
  // locally-saved draft is applied after mount in the hydrate effect below.
  const [formData, setFormData] = useState<Evaluation>(initialData);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [recoveredAt, setRecoveredAt] = useState<number | null>(null);
  const [committed, setCommitted] = useState(false);
  // Timestamp of the most recent in-place DB save (recovered-banner "Save"). Surfaces a quiet
  // confirmation in the utility bar; cleared on the next edit so it never reads stale.
  const [dbSavedAt, setDbSavedAt] = useState<number | null>(null);

  const { issues } = useLiveValidation(formData);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeField, setActiveField] = useState<string | null>(null);

  // Validation visibility: a field's red border stays hidden until the user has
  // visited and left it — or until Verify/Save reveals everything. Keeps a fresh
  // form from loading entirely red. Warnings (amber) are always shown.
  const [touchedFields, setTouchedFields] = useState<Set<string>>(
    () => new Set(),
  );
  const [revealAllErrors, setRevealAllErrors] = useState(false);

  // On-demand rules verification modal state
  const { isValidating, errors, warnings, runCheck } = useFinalValidation();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Persist entries locally (debounced). Stops once committed to the database.
  const { savedAt, clear } = useEvaluationAutosave<Evaluation>({
    key: autosaveKey,
    data: formData,
    step: currentStep,
    enabled: !committed,
  });

  // Field-guidelines visibility preference (persisted for power users).
  const [showGuidelines, setShowGuidelines] = useState<boolean>(true);

  const toggleGuidelines = () => {
    setShowGuidelines((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(
          GUIDELINES_PREF_KEY,
          next ? "true" : "false",
        );
      } catch {
        /* best-effort */
      }
      return next;
    });
  };

  // After mount (client only), hydrate from localStorage: recover any in-progress
  // draft and apply the saved guidelines preference. Doing this in an effect — not
  // during render — keeps the server and first client render identical (no hydration
  // mismatch).
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current) return;
    hydratedRef.current = true;
    try {
      if (window.localStorage.getItem(GUIDELINES_PREF_KEY) === "false")
        setShowGuidelines(false);
    } catch {
      /* ignore */
    }
    const draft = readEvalDraft<Evaluation>(autosaveKey);
    if (draft) {
      setFormData(draft.data);
      setCurrentStep(draft.step ?? 0);
      setRecoveredAt(draft.savedAt);
    }
  }, [autosaveKey]);

  const handleFieldChange = (fields: Partial<Evaluation>) => {
    setDbSavedAt(null); // a fresh edit supersedes the last in-place save confirmation
    setFormData((prev) => ({ ...prev, ...fields }));
  };

  const handleBlockValueChange = (fields: Record<string, any>) => {
    setDbSavedAt(null);
    setFormData((prev) => ({
      ...prev,
      block_values: { ...prev.block_values, ...fields },
    }));
  };

  // Attach (or detach) a promotion-recommendation summary group while drafting. On save the DB
  // trigger (enforce_summary_group_fields) standardizes the group's shared BUPERSINST fields, so
  // we mirror them into the form immediately — the preview then matches what will persist.
  // Detaching clears only the link and leaves the values for the member to edit.
  const handleSelectGroup = (group: SummaryGroup | null) => {
    setDbSavedAt(null);
    if (!group) {
      setFormData((prev) => ({ ...prev, summary_group_id: null }));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      summary_group_id: group.id ?? null,
      period_to: group.period_to,
      grade_rate: group.grade_rate,
      promotion_status: group.promotion_status,
      report_type: "EVAL",
      block_values: {
        ...prev.block_values,
        command_achievements: group.command_employment,
      },
    }));
  };

  // Block 50a (summary group average), shown live next to the Block 40 individual average — but
  // only to reviewers. A sailor drafting their own report must NOT see it; that gate is enforced
  // here AND server-side by the /api/summary-average route.
  const canSeeGroupAvg = canViewSummaryAverage(viewerRole, formData);

  // Peers' pooled grades (service-role route; RLS hides peers from a sailor). Fetched only for a
  // saved, grouped draft this viewer may see; the member's own contribution is combined live below
  // so the value tracks edits. With no group the pool is empty and this equals the individual
  // average (a "group of one").
  const [peerPool, setPeerPool] = useState<{
    gradedSum: number;
    gradedTraitCount: number;
  }>({ gradedSum: 0, gradedTraitCount: 0 });
  useEffect(() => {
    let active = true;
    if (!canSeeGroupAvg || !formData.summary_group_id || !formData.id) {
      setPeerPool({ gradedSum: 0, gradedTraitCount: 0 });
      return;
    }
    fetchGroupAveragePool(formData.id, true)
      .then((r) => {
        if (active)
          setPeerPool({
            gradedSum: r.gradedSum || 0,
            gradedTraitCount: r.gradedTraitCount || 0,
          });
      })
      .catch(() => {
        if (active) setPeerPool({ gradedSum: 0, gradedTraitCount: 0 });
      });
    return () => {
      active = false;
    };
  }, [canSeeGroupAvg, formData.summary_group_id, formData.id]);

  const summaryGroupAverage = useMemo(() => {
    if (!canSeeGroupAvg) return null;
    const own = computeTraitAverage(
      (formData.trait_grades || {}) as Record<string, string | undefined>,
    );
    const sum = peerPool.gradedSum + own.gradedSum;
    const count = peerPool.gradedTraitCount + own.gradedCount;
    return count === 0 ? null : round2(sum / count);
  }, [canSeeGroupAvg, formData.trait_grades, peerPool]);

  // Track the active field and remember which fields have been visited.
  const handleFocusField = (field: string | null) => {
    setActiveField(field);
    if (field)
      setTouchedFields((prev) =>
        prev.has(field) ? prev : new Set(prev).add(field),
      );
  };

  // Errors (red borders) surface only for visited fields the user has left, or once
  // Verify/Save reveals all. The active field is never flagged while being edited.
  const visibleIssues = useMemo<ValidationIssue[]>(
    () =>
      issues.filter((i) => {
        if (i.severity !== "error") return true;
        if (revealAllErrors) return true;
        return (
          !!i.field && touchedFields.has(i.field) && activeField !== i.field
        );
      }),
    [issues, touchedFields, activeField, revealAllErrors],
  );

  const commitDraft = async () => {
    setSaveError(null);
    setRevealAllErrors(true); // a save attempt surfaces every outstanding error
    try {
      await onSave(formData);
      // DB write succeeded — the local autosave is now redundant.
      setCommitted(true);
      setRecoveredAt(null);
      clear();
    } catch (err: any) {
      setSaveError(err.message || "An error occurred while saving the draft.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await commitDraft();
  };

  // Recovered-draft banner "Save": persist the recovered changes to the DB and STAY on the
  // page (no navigation, no commit-lock). Adopts the returned id so a later save updates this
  // same record instead of inserting a duplicate, and keeps local autosave running.
  const handleSaveRecoveredInPlace = async () => {
    if (!onSaveInPlace) return;
    setSaveError(null);
    try {
      const saved = await onSaveInPlace(formData);
      const savedId = (saved as Evaluation | null)?.id;
      if (savedId && !formData.id)
        setFormData((prev) => ({ ...prev, id: savedId }));
      setRecoveredAt(null); // the recovered changes are now persisted
      setDbSavedAt(Date.now());
    } catch (err: any) {
      setSaveError(
        err.message || "An error occurred while saving to the database.",
      );
    }
  };

  const handleDiscardRecovered = () => {
    clear();
    setFormData(initialData);
    setCurrentStep(0);
    setActiveField(null);
    setRecoveredAt(null);
  };

  const handleTriggerVerify = async () => {
    setRevealAllErrors(true); // explicit rules check surfaces every inline error too
    await runCheck(formData);
    setIsModalOpen(true);
  };

  const isChiefEvalForm =
    formCode === "CHIEFEVAL" ||
    formData.report_type === "CHIEFEVAL" ||
    formData.form_definition_id?.startsWith("CHIEFEVAL") ||
    formData.form_definition_id?.includes("c1616270");
  const isFitrepForm =
    formCode === "FITREP" ||
    formCode?.startsWith("FITREP") ||
    formData.report_type === "FITREP" ||
    formData.form_definition_id?.startsWith("FITREP") ||
    formData.form_definition_id?.includes("f1610020") ||
    formData.form_definition_id?.includes("f1610050");

  const formBadgeInfo = isChiefEvalForm
    ? {
        label: "CHIEFEVAL (NAVPERS 1616/27)",
        className:
          "bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider",
      }
    : isFitrepForm
      ? {
          label: "FITREP (NAVPERS 1610/2)",
          className:
            "bg-purple-500/20 text-purple-300 border border-purple-500/40 px-2.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider",
        }
      : {
          label: "EVAL (NAVPERS 1616/26)",
          className:
            "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider",
        };

  const errorIssues = issues
    .filter((i) => i.severity === "error")
    .filter((i) => issueAppliesToStep(i.field, currentStep));
  const warnIssues = issues
    .filter((i) => i.severity === "warning" || !i.severity)
    .filter((i) => issueAppliesToStep(i.field, currentStep));
  const issuesOnOtherSteps = issues.filter(
    (i) => !issueAppliesToStep(i.field, currentStep),
  ).length;
  const hiddenErrorCount = Math.max(0, errorIssues.length - RAIL_ISSUE_LIMIT);
  const hiddenWarnCount = Math.max(0, warnIssues.length - RAIL_ISSUE_LIMIT);

  return (
    <GuidelinesVisibilityContext.Provider value={showGuidelines}>
      <div className="w-full max-w-none">
        {recoveredAt && (
          <RecoveredBanner
            savedAt={recoveredAt}
            onKeep={() => setRecoveredAt(null)}
            onDiscard={handleDiscardRecovered}
            onSave={handleSaveRecoveredInPlace}
            isSaving={isSaving}
          />
        )}

        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className={formBadgeInfo.className}>
              {formBadgeInfo.label}
            </span>
            <AutosaveStatus
              savedAt={savedAt}
              committed={committed}
              dbSavedAt={dbSavedAt}
            />
          </div>
          <GuidelinesToggle on={showGuidelines} onToggle={toggleGuidelines} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[200px_1fr_260px] items-start">
          <nav className="apex-card p-3 hidden lg:block sticky top-20">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2 px-2" style={{ color: "var(--muted-foreground)" }}>
              Sections
            </p>
            {STEPS.map((step, idx) => {
              const isActive = currentStep === idx;
              const isCompleted = currentStep > idx;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setCurrentStep(idx)}
                  className={`w-full text-left rounded-lg px-2.5 py-2 text-xs font-semibold mb-0.5 transition ${
                    isActive
                      ? "bg-[var(--nav-active-glow)]"
                      : "hover:bg-[var(--muted)]"
                  }`}
                  style={{
                    color: isActive
                      ? "var(--primary)"
                      : isCompleted
                        ? "var(--success)"
                        : "var(--muted-foreground)",
                  }}
                >
                  {isCompleted ? "✓ " : `${idx + 1}. `}
                  {step.title.replace(/^\d+\.\s*/, "")}
                </button>
              );
            })}
          </nav>

          <div className="min-w-0">
            <div className="apex-stepper mb-6 lg:hidden">
              {STEPS.map((step, idx) => {
                const isActive = currentStep === idx;
                const isCompleted = currentStep > idx;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => setCurrentStep(idx)}
                    className={`apex-step-pill ${isActive ? "apex-step-pill-active" : ""}`}
                  >
                    <div
                      className={`apex-step-num ${
                        isActive
                          ? "apex-step-num-active"
                          : isCompleted
                            ? "apex-step-num-done"
                            : "apex-step-num-idle"
                      }`}
                    >
                      {isCompleted ? "✓" : idx + 1}
                    </div>
                  </button>
                );
              })}
            </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Render Only the Active Step */}
          {currentStep === 0 && (
            <>
              <SummaryGroupSelector
                value={formData.summary_group_id ?? null}
                evalContext={{
                  grade_rate: formData.grade_rate,
                  promotion_status: formData.promotion_status,
                  period_to: formData.period_to,
                  report_type: formData.report_type,
                  uic: formData.uic,
                  summary_group_id: formData.summary_group_id ?? null,
                  block_values: formData.block_values,
                }}
                onSelect={handleSelectGroup}
              />
              <Block1Admin
                evalData={formData}
                onChange={handleFieldChange}
                issues={visibleIssues}
                handleBlockValueChange={handleBlockValueChange}
                onFocusField={handleFocusField}
                activeField={activeField}
              />
            </>
          )}

          {currentStep === 1 && (
            <Block33to39Traits
              evalData={formData}
              onChange={handleFieldChange}
              issues={visibleIssues}
              onFocusField={handleFocusField}
              activeField={activeField}
              summaryGroupAverage={summaryGroupAverage}
              showSummaryGroupAverage={canSeeGroupAvg}
            />
          )}

          {currentStep === 2 && (
            <Block43Comments
              evalData={formData}
              onChange={handleFieldChange}
              issues={visibleIssues}
              onFocusField={handleFocusField}
              activeField={activeField}
            />
          )}

          {currentStep === 3 && (
            <Block42Signatures
              evalData={formData}
              onChange={handleFieldChange}
              handleBlockValueChange={handleBlockValueChange}
              issues={visibleIssues}
              onFocusField={handleFocusField}
              activeField={activeField}
            />
          )}

          {/* Step-by-Step Navigation Buttons */}
          <div className="flex justify-between items-center apex-form-panel border p-4 rounded-xl">
            <button
              type="button"
              disabled={currentStep === 0}
              onClick={() => {
                setCurrentStep((prev) => prev - 1);
                setActiveField(null);
              }}
              className="apex-btn-secondary py-2 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              ← Previous Section
            </button>

            <span
              className="text-xs font-semibold uppercase tracking-wider hidden sm:inline"
              style={{ color: "var(--subtle)" }}
            >
              Section {currentStep + 1} of 4
            </span>

            {currentStep < 3 ? (
              <button
                type="button"
                onClick={() => {
                  setCurrentStep((prev) => prev + 1);
                  setActiveField(null);
                }}
                className="apex-btn-primary py-2"
              >
                Next Section →
              </button>
            ) : (
              <span className="text-xs font-semibold text-emerald-400">
                All Sections Filled
              </span>
            )}
          </div>

          <div className="apex-sticky-form-bar">
            <StatusBar
              issues={issues}
              saveError={saveError}
              isSaving={isSaving}
              onCancel={onCancel}
              onVerify={handleTriggerVerify}
              isValidating={isValidating}
              savedAt={savedAt}
              committed={committed}
              compact
            />
          </div>
        </form>
          </div>

          <aside className="apex-workspace-rail hidden lg:block">
            <h3 className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: "var(--muted-foreground)" }}>
              Validation
            </h3>
            {errorIssues.length === 0 && warnIssues.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--success)" }}>
                ✓ No policy issues on this section
                {issuesOnOtherSteps > 0 && (
                  <span style={{ color: "var(--muted-foreground)" }}>
                    {" "}
                    ({issuesOnOtherSteps} on other sections)
                  </span>
                )}
              </p>
            ) : revealAllErrors ? (
              <ul className="space-y-2 text-xs">
                {errorIssues.slice(0, RAIL_ISSUE_LIMIT).map((issue, i) => (
                  <li key={`e-${i}`} style={{ color: "var(--destructive)" }}>
                    {issue.message}
                  </li>
                ))}
                {warnIssues.slice(0, RAIL_ISSUE_LIMIT).map((issue, i) => (
                  <li key={`w-${i}`} style={{ color: "var(--accent-gold)" }}>
                    ⚠ {issue.message}
                  </li>
                ))}
                {(hiddenErrorCount > 0 || hiddenWarnCount > 0) && (
                  <li style={{ color: "var(--subtle)" }}>
                    +{hiddenErrorCount + hiddenWarnCount} more on this section
                  </li>
                )}
              </ul>
            ) : (
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                {errorIssues.length > 0 && (
                  <span>
                    {errorIssues.length} error
                    {errorIssues.length === 1 ? "" : "s"}
                  </span>
                )}
                {errorIssues.length > 0 && warnIssues.length > 0 && " · "}
                {warnIssues.length > 0 && (
                  <span>
                    {warnIssues.length} warning
                    {warnIssues.length === 1 ? "" : "s"}
                  </span>
                )}
                {" on this section"}
                {issuesOnOtherSteps > 0 &&
                  ` · ${issuesOnOtherSteps} on other sections`}
                {" — run Verify Rules for details"}
              </p>
            )}
            <p className="text-[11px] mt-4" style={{ color: "var(--subtle)" }}>
              Section {currentStep + 1} of {STEPS.length}
            </p>
          </aside>
        </div>

        <ValidationResultsModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          errors={errors}
          warnings={warnings}
        />
      </div>
    </GuidelinesVisibilityContext.Provider>
  );
}

/* ──────────────────────────────────────────────────
   Summary-group selector (draft-time attachment)

   Per BUPERSINST 1610.10H, an enlisted promotion-recommendation summary group is the set of
   members in the same paygrade (regardless of rating) and same promotion status who receive the
   same type of report from the same reporting senior on the same ending date — with UIC as a
   further breakout. Shown at the top of the Admin step ONLY when one or more OPEN (enrollable)
   groups exist. Selecting a group records summary_group_id on the draft; the DB trigger
   standardizes the group's shared fields on save (mirrored into the form here so the preview
   matches). The member's own paygrade/UIC are shown to help them pick the group they belong to.
   ────────────────────────────────────────────────── */

function SummaryGroupSelector({
  value,
  evalContext,
  onSelect,
}: {
  value: string | null;
  evalContext: EvalForSummaryGroup;
  onSelect: (group: SummaryGroup | null) => void;
}) {
  const [groups, setGroups] = useState<
    Awaited<ReturnType<typeof listOpenGroups>>
  >([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    listOpenGroups()
      .then((g) => {
        if (active) setGroups(g);
      })
      .catch(() => {
        /* read failure → selector simply stays hidden */
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const selected = groups.find((g) => g.id === value) || null;
  const visible = visibleSummaryGroupsForEval(evalContext, groups);
  const memberPaygrade = paygradeOf(evalContext.grade_rate);

  if (!loaded || visible.length === 0) return null;

  return (
    <div className="apex-card p-5 space-y-3 border-blue-500/20">
      <div className="flex items-start gap-2.5">
        <svg
          className="w-4 h-4 mt-0.5 text-sky-300 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z"
          />
        </svg>
        <div>
          <h3 className="text-sm font-bold text-white">
            Summary Group{" "}
            <span className="text-slate-400 font-normal">(optional)</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Attach this evaluation to a Reporting Senior&apos;s
            promotion-recommendation group. Only groups for your paygrade,
            promotion status, reporting senior, and ending date are shown.
            {(evalContext.grade_rate || evalContext.uic) && (
              <span className="block mt-1 text-slate-500">
                You: {evalContext.grade_rate || "—"}
                {memberPaygrade ? ` (${memberPaygrade})` : ""}
                {evalContext.uic ? ` · UIC ${evalContext.uic}` : ""}
              </span>
            )}
          </p>
        </div>
      </div>

      <select
        value={value || ""}
        onChange={(e) =>
          onSelect(visible.find((g) => g.id === e.target.value) || null)
        }
        className="apex-input"
      >
        <option value="">— None (not part of a summary group) —</option>
        {visible.map((g) => (
          <option key={g.id} value={g.id}>
            {describeSummaryGroup(g)}
          </option>
        ))}
      </select>

      {selected && (
        <div className="text-[11px] text-sky-200/90 bg-sky-950/30 border border-sky-900/40 rounded-lg p-3 leading-relaxed">
          On save, these fields are standardized from{" "}
          <span className="font-semibold">{selected.name}</span> and shared
          across the group: <span className="font-semibold">ending date</span> (
          {selected.period_to}), <span className="font-semibold">paygrade</span>{" "}
          ({selected.grade_rate}),{" "}
          <span className="font-semibold">promotion status</span> (
          {selected.promotion_status}), and{" "}
          <span className="font-semibold">command employment</span> (Block 28).
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────
   Recovered-draft banner
   ────────────────────────────────────────────────── */

function RecoveredBanner({
  savedAt,
  onKeep,
  onDiscard,
  onSave,
  isSaving,
}: {
  savedAt: number;
  onKeep: () => void;
  onDiscard: () => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  return (
    <div
      className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3.5 apex-form-panel"
      style={{ borderLeftWidth: 2, borderLeftColor: "var(--primary)" }}
    >
      <div className="flex items-start gap-2.5">
        <svg
          className="w-4 h-4 mt-0.5 text-sky-300 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
        <p className="text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
          <span className="font-bold" style={{ color: "var(--accent-cyan)" }}>
            Unsaved changes recovered
          </span>{" "}
          — restored from your local draft saved {formatTime(savedAt)}. These
          have not been saved to the database yet.
        </p>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
        <button
          type="button"
          onClick={onDiscard}
          className="apex-btn-ghost py-1.5 px-3 text-[11px]"
        >
          Discard
        </button>
        <button
          type="button"
          onClick={onKeep}
          className="apex-btn-secondary py-1.5 px-3 text-[11px]"
        >
          Keep editing
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="apex-btn-primary py-1.5 px-3 text-[11px]"
        >
          {isSaving ? "Saving…" : "Save to database"}
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────
   Field-guidelines visibility toggle
   ────────────────────────────────────────────────── */

function GuidelinesToggle({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      title={
        on
          ? "Hide the inline BUPERS field guidelines"
          : "Show the inline BUPERS field guidelines"
      }
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-extrabold uppercase tracking-wider transition ${
        on
          ? "bg-sky-950/50 border-sky-900/40 text-sky-300 hover:bg-sky-900/40"
          : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200"
      }`}
    >
      {on ? (
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
          />
        </svg>
      ) : (
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.243 4.243L9.88 9.88"
          />
        </svg>
      )}
      Field Guidelines: {on ? "On" : "Off"}
    </button>
  );
}

/* ──────────────────────────────────────────────────
   Autosave status pill (header utility bar)
   ────────────────────────────────────────────────── */

function AutosaveStatus({
  savedAt,
  committed,
  dbSavedAt,
}: {
  savedAt: number | null;
  committed: boolean;
  dbSavedAt: number | null;
}) {
  if (committed) {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
        ✓ Saved to database
      </span>
    );
  }
  if (dbSavedAt) {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
        ✓ Saved to database · {formatTime(dbSavedAt)}
        <span className="text-slate-500 normal-case font-normal">
          (autosave still on — keep editing)
        </span>
      </span>
    );
  }
  if (!savedAt) {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Changes autosave locally
      </span>
    );
  }
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
      Autosaved locally · {formatTime(savedAt)}
    </span>
  );
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

/* ──────────────────────────────────────────────────
   StatusBar — unified controls block
   ────────────────────────────────────────────────── */

function StatusBar({
  issues,
  saveError,
  isSaving,
  onCancel,
  onVerify,
  isValidating,
  savedAt,
  committed,
  compact,
}: {
  issues: ValidationIssue[];
  saveError: string | null;
  isSaving: boolean;
  onCancel: () => void;
  onVerify: () => void;
  isValidating: boolean;
  savedAt: number | null;
  committed: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full"
          : "glass-panel rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-800"
      }
    >
      <div>
        {issues.length > 0 ? (
          <div className="text-amber-400 text-xs font-semibold flex items-center gap-1.5">
            <span>
              ⚠️ Form contains {issues.length} active policy warning(s).
            </span>
          </div>
        ) : (
          <div className="text-green-400 text-xs font-semibold flex items-center gap-1.5">
            <span>✓ All Navy EVAL rules are satisfied.</span>
          </div>
        )}
        {!committed && savedAt && (
          <p className="text-slate-500 text-[11px] mt-1">
            Work autosaved locally · {formatTime(savedAt)} — not yet written to
            the database.
          </p>
        )}
        {saveError && (
          <p className="text-red-400 text-xs mt-1 font-semibold">{saveError}</p>
        )}
      </div>

      <div className="flex items-center gap-3 self-end sm:self-auto">
        <button type="button" onClick={onCancel} className="apex-btn-ghost py-2">
          Cancel
        </button>
        <button
          type="button"
          onClick={onVerify}
          disabled={isValidating}
          className="apex-btn-secondary py-2"
        >
          {isValidating ? "Checking..." : "Verify Rules"}
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="apex-btn-primary py-2.5 active:scale-95"
        >
          {isSaving ? "Saving Draft..." : "Save Evaluation Draft"}
        </button>
      </div>
    </div>
  );
}
