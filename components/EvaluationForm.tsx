// components/EvaluationForm.tsx
//
// Form orchestrator linking the administrative, trait grading, and comments modules
// under a paginated wizard flow featuring inline real-time Navy guidelines validation.
//
// Entries autosave to localStorage as the user works (recoverable across refresh /
// tab-close) — NOT to the database. Only "Save Evaluation Draft" writes to the DB,
// which then clears the local copy. A "Field Guidelines" toggle lets power users
// hide the inline BUPERS banners.

"use client"

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Evaluation, ValidationIssue } from '@/types'
import Block1Admin from '@/components/blocks/EvaluationFormParts/Block1Admin'
import Block33to39Traits from '@/components/blocks/Block33to39Traits'
import Block43Comments from '@/components/blocks/Block43Comments'
import Block42Signatures from '@/components/blocks/EvaluationFormParts/Block42Signatures'
import { useLiveValidation } from '@/hooks/useLiveValidation'
import { useFinalValidation } from '@/hooks/useFinalValidation'
import ValidationResultsModal from '@/components/ValidationResultsModal'
import { GuidelinesVisibilityContext } from '@/components/GuidelinesVisibility'
import { draftStorageKey, readEvalDraft, useEvaluationAutosave } from '@/hooks/useEvaluationAutosave'

interface EvaluationFormProps {
  initialData: Evaluation;
  onSave: (data: Evaluation) => Promise<void>;
  // Persist the current data to the DB WITHOUT navigating away (used by the recovered-draft
  // banner's "Save" action). Returns the saved record so the form can adopt its new id.
  onSaveInPlace?: (data: Evaluation) => Promise<Evaluation | void>;
  onCancel: () => void;
  isSaving: boolean;
}

const STEPS = [
  { id: 'admin', title: '1. Admin & Command Info' },
  { id: 'traits', title: '2. Performance Traits' },
  { id: 'comments', title: '3. Narrative & Comments' },
  { id: 'signatures', title: '4. Signatures & RS Info' },
]

const GUIDELINES_PREF_KEY = 'apex:show-field-guidelines'

export default function EvaluationForm({ initialData, onSave, onSaveInPlace, onCancel, isSaving }: EvaluationFormProps) {
  // Stable per-evaluation autosave key (DB id when editing, per-user slot when new).
  const autosaveKey = useMemo(
    () => draftStorageKey({ id: initialData.id, createdBy: initialData.created_by }),
    [initialData.id, initialData.created_by]
  )

  // SSR-safe initial state: deterministic on server and first client render. Any
  // locally-saved draft is applied after mount in the hydrate effect below.
  const [formData, setFormData] = useState<Evaluation>(initialData)
  const [currentStep, setCurrentStep] = useState<number>(0)
  const [recoveredAt, setRecoveredAt] = useState<number | null>(null)
  const [committed, setCommitted] = useState(false)
  // Timestamp of the most recent in-place DB save (recovered-banner "Save"). Surfaces a quiet
  // confirmation in the utility bar; cleared on the next edit so it never reads stale.
  const [dbSavedAt, setDbSavedAt] = useState<number | null>(null)

  const { issues } = useLiveValidation(formData)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [activeField, setActiveField] = useState<string | null>(null)

  // Validation visibility: a field's red border stays hidden until the user has
  // visited and left it — or until Verify/Save reveals everything. Keeps a fresh
  // form from loading entirely red. Warnings (amber) are always shown.
  const [touchedFields, setTouchedFields] = useState<Set<string>>(() => new Set())
  const [revealAllErrors, setRevealAllErrors] = useState(false)

  // On-demand rules verification modal state
  const { isValidating, errors, warnings, runCheck } = useFinalValidation()
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Persist entries locally (debounced). Stops once committed to the database.
  const { savedAt, clear } = useEvaluationAutosave<Evaluation>({
    key: autosaveKey,
    data: formData,
    step: currentStep,
    enabled: !committed,
  })

  // Field-guidelines visibility preference (persisted for power users).
  const [showGuidelines, setShowGuidelines] = useState<boolean>(true)

  const toggleGuidelines = () => {
    setShowGuidelines((prev) => {
      const next = !prev
      try {
        window.localStorage.setItem(GUIDELINES_PREF_KEY, next ? 'true' : 'false')
      } catch {
        /* best-effort */
      }
      return next
    })
  }

  // After mount (client only), hydrate from localStorage: recover any in-progress
  // draft and apply the saved guidelines preference. Doing this in an effect — not
  // during render — keeps the server and first client render identical (no hydration
  // mismatch).
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true
    try {
      if (window.localStorage.getItem(GUIDELINES_PREF_KEY) === 'false') setShowGuidelines(false)
    } catch {
      /* ignore */
    }
    const draft = readEvalDraft<Evaluation>(autosaveKey)
    if (draft) {
      setFormData(draft.data)
      setCurrentStep(draft.step ?? 0)
      setRecoveredAt(draft.savedAt)
    }
  }, [autosaveKey])

  const handleFieldChange = (fields: Partial<Evaluation>) => {
    setDbSavedAt(null); // a fresh edit supersedes the last in-place save confirmation
    setFormData((prev) => ({ ...prev, ...fields }));
  };

  const handleBlockValueChange = (fields: Record<string, any>) => {
    setDbSavedAt(null);
    setFormData((prev) => ({
      ...prev,
      block_values: { ...prev.block_values, ...fields }
    }));
  };

  // Track the active field and remember which fields have been visited.
  const handleFocusField = (field: string | null) => {
    setActiveField(field)
    if (field) setTouchedFields((prev) => (prev.has(field) ? prev : new Set(prev).add(field)))
  }

  // Errors (red borders) surface only for visited fields the user has left, or once
  // Verify/Save reveals all. The active field is never flagged while being edited.
  const visibleIssues = useMemo<ValidationIssue[]>(
    () =>
      issues.filter((i) => {
        if (i.severity !== 'error') return true
        if (revealAllErrors) return true
        return !!i.field && touchedFields.has(i.field) && activeField !== i.field
      }),
    [issues, touchedFields, activeField, revealAllErrors]
  )

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
      setSaveError(err.message || 'An error occurred while saving the draft.');
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
      if (savedId && !formData.id) setFormData((prev) => ({ ...prev, id: savedId }));
      setRecoveredAt(null);     // the recovered changes are now persisted
      setDbSavedAt(Date.now());
    } catch (err: any) {
      setSaveError(err.message || 'An error occurred while saving to the database.');
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
    setRevealAllErrors(true) // explicit rules check surfaces every inline error too
    await runCheck(formData)
    setIsModalOpen(true)
  }

  return (
    <GuidelinesVisibilityContext.Provider value={showGuidelines}>
      <div className="max-w-6xl mx-auto w-full">
        {/* Recovered-draft notice */}
        {recoveredAt && (
          <RecoveredBanner
            savedAt={recoveredAt}
            onKeep={() => setRecoveredAt(null)}
            onDiscard={handleDiscardRecovered}
            onSave={handleSaveRecoveredInPlace}
            isSaving={isSaving}
          />
        )}

        {/* Utility bar: autosave status + guidelines toggle */}
        <div className="flex items-center justify-between mb-3 px-1">
          <AutosaveStatus savedAt={savedAt} committed={committed} dbSavedAt={dbSavedAt} />
          <GuidelinesToggle on={showGuidelines} onToggle={toggleGuidelines} />
        </div>

        {/* Horizontal Premium Stepper */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between mb-8 bg-[#111c38]/40 border border-slate-800 p-4 rounded-xl gap-3 sm:gap-2">
          {STEPS.map((step, idx) => {
            const isActive = currentStep === idx
            const isCompleted = currentStep > idx
            return (
              <React.Fragment key={step.id}>
                <button
                  type="button"
                  onClick={() => setCurrentStep(idx)}
                  className="flex items-center gap-3 text-left focus:outline-none group"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-200 ${
                    isActive
                      ? 'bg-[#3e6e99] text-white ring-4 ring-[#3e6e99]/20'
                      : isCompleted
                      ? 'bg-emerald-600 text-white'
                      : 'bg-[#1c2541] text-slate-400 group-hover:text-slate-200'
                  }`}>
                    {isCompleted ? '✓' : idx + 1}
                  </div>
                  <span className={`text-xs font-semibold transition-colors duration-200 ${
                    isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-200'
                  }`}>
                    {step.title}
                  </span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={`hidden lg:block flex-1 h-0.5 mx-2 rounded ${
                    isCompleted ? 'bg-emerald-600/60' : 'bg-slate-800'
                  }`} />
                )}
              </React.Fragment>
            )
          })}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 pb-20">
          {/* Render Only the Active Step */}
          {currentStep === 0 && (
            <Block1Admin
              evalData={formData}
              onChange={handleFieldChange}
              issues={visibleIssues}
              handleBlockValueChange={handleBlockValueChange}
              onFocusField={handleFocusField}
              activeField={activeField}
            />
          )}

          {currentStep === 1 && (
            <Block33to39Traits
              evalData={formData}
              onChange={handleFieldChange}
              issues={visibleIssues}
              onFocusField={handleFocusField}
              activeField={activeField}
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
          <div className="flex justify-between items-center bg-[#111c38]/20 border border-slate-800/80 p-4 rounded-xl">
            <button
              type="button"
              disabled={currentStep === 0}
              onClick={() => {
                setCurrentStep((prev) => prev - 1)
                setActiveField(null)
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-xs font-semibold text-slate-300 rounded-lg transition duration-150 disabled:cursor-not-allowed"
            >
              ← Previous Section
            </button>

            <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider hidden sm:inline">
              Section {currentStep + 1} of 4
            </span>

            {currentStep < 3 ? (
              <button
                type="button"
                onClick={() => {
                  setCurrentStep((prev) => prev + 1)
                  setActiveField(null)
                }}
                className="px-5 py-2 bg-[#3e6e99] hover:bg-[#4e82b0] text-xs font-semibold text-white rounded-lg transition duration-150"
              >
                Next Section →
              </button>
            ) : (
              <span className="text-xs font-semibold text-emerald-400">All Sections Filled</span>
            )}
          </div>

          {/* Unified Save / Status Panel */}
          <StatusBar
            issues={issues}
            saveError={saveError}
            isSaving={isSaving}
            onCancel={onCancel}
            onVerify={handleTriggerVerify}
            isValidating={isValidating}
            savedAt={savedAt}
            committed={committed}
          />
        </form>

        {/* Rules Validation Details Modal */}
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
   Recovered-draft banner
   ────────────────────────────────────────────────── */

function RecoveredBanner({ savedAt, onKeep, onDiscard, onSave, isSaving }: { savedAt: number; onKeep: () => void; onDiscard: () => void; onSave: () => void; isSaving: boolean }) {
  return (
    <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-sky-900/40 border-l-2 border-l-[#3e6e99] bg-gradient-to-r from-[#0d1b30]/90 to-[#16243a]/60 p-3.5">
      <div className="flex items-start gap-2.5">
        <svg className="w-4 h-4 mt-0.5 text-sky-300 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        <p className="text-xs text-slate-300 leading-relaxed">
          <span className="font-bold text-sky-200">Unsaved changes recovered</span> — restored from your local draft
          saved {formatTime(savedAt)}. These have not been saved to the database yet.
        </p>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
        <button type="button" onClick={onDiscard} className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 hover:text-white transition">
          Discard
        </button>
        <button type="button" onClick={onKeep} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-white rounded-lg transition">
          Keep editing
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isSaving}
          className="px-3 py-1.5 bg-[#3e6e99] hover:bg-[#4e82b0] disabled:opacity-50 disabled:cursor-not-allowed text-[11px] font-semibold text-white rounded-lg transition"
        >
          {isSaving ? 'Saving…' : 'Save to database'}
        </button>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────
   Field-guidelines visibility toggle
   ────────────────────────────────────────────────── */

function GuidelinesToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      title={on ? 'Hide the inline BUPERS field guidelines' : 'Show the inline BUPERS field guidelines'}
      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-extrabold uppercase tracking-wider transition ${
        on
          ? 'bg-sky-950/50 border-sky-900/40 text-sky-300 hover:bg-sky-900/40'
          : 'bg-slate-800/50 border-slate-700/50 text-slate-400 hover:text-slate-200'
      }`}
    >
      {on ? (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.243 4.243L9.88 9.88" />
        </svg>
      )}
      Field Guidelines: {on ? 'On' : 'Off'}
    </button>
  )
}

/* ──────────────────────────────────────────────────
   Autosave status pill (header utility bar)
   ────────────────────────────────────────────────── */

function AutosaveStatus({ savedAt, committed, dbSavedAt }: { savedAt: number | null; committed: boolean; dbSavedAt: number | null }) {
  if (committed) {
    return <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">✓ Saved to database</span>
  }
  if (dbSavedAt) {
    return (
      <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
        ✓ Saved to database · {formatTime(dbSavedAt)}
        <span className="text-slate-500 normal-case font-normal">(autosave still on — keep editing)</span>
      </span>
    )
  }
  if (!savedAt) {
    return <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Changes autosave locally</span>
  }
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
      Autosaved locally · {formatTime(savedAt)}
    </span>
  )
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  } catch {
    return ''
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
}: {
  issues: ValidationIssue[]
  saveError: string | null
  isSaving: boolean
  onCancel: () => void
  onVerify: () => void
  isValidating: boolean
  savedAt: number | null
  committed: boolean
}) {
  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-800">
      <div>
        {issues.length > 0 ? (
          <div className="text-amber-400 text-xs font-semibold flex items-center gap-1.5">
            <span>⚠️ Form contains {issues.length} active policy warning(s).</span>
          </div>
        ) : (
          <div className="text-green-400 text-xs font-semibold flex items-center gap-1.5">
            <span>✓ All Navy EVAL rules are satisfied.</span>
          </div>
        )}
        {!committed && savedAt && (
          <p className="text-slate-500 text-[11px] mt-1">
            Work autosaved locally · {formatTime(savedAt)} — not yet written to the database.
          </p>
        )}
        {saveError && (
          <p className="text-red-400 text-xs mt-1 font-semibold">{saveError}</p>
        )}
      </div>

      <div className="flex items-center gap-3 self-end sm:self-auto">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition duration-150"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onVerify}
          disabled={isValidating}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-xs font-semibold text-slate-300 rounded-lg transition"
        >
          {isValidating ? 'Checking...' : 'Verify Rules'}
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className={`px-5 py-2.5 rounded-lg text-white font-bold transition-all text-xs tracking-wide shadow-lg ${
            isSaving
              ? 'bg-[#3e6e99]/50 cursor-not-allowed'
              : 'bg-[#3e6e99] hover:bg-[#4e82b0] active:scale-95'
          }`}
        >
          {isSaving ? 'Saving Draft...' : 'Save Evaluation Draft'}
        </button>
      </div>
    </div>
  )
}
