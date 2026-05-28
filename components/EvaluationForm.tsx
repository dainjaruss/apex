// components/EvaluationForm.tsx
//
// Form orchestrator linking the administrative, trait grading, and comments modules
// under a single responsive dashboard featuring real-time Navy guidelines validation.
//

import React, { useState } from 'react'
import { Evaluation, ValidationIssue } from '@/types'
import Block1Admin from '@/components/blocks/EvaluationFormParts/Block1Admin'
import Block33to39Traits from '@/components/blocks/Block33to39Traits'
import Block43Comments from '@/components/blocks/Block43Comments'
import Block42Signatures from '@/components/blocks/EvaluationFormParts/Block42Signatures'
import { useLiveValidation } from '@/hooks/useLiveValidation'

interface EvaluationFormProps {
  initialData: Evaluation;
  onSave: (data: Evaluation) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

export default function EvaluationForm({ initialData, onSave, onCancel, isSaving }: EvaluationFormProps) {
  const [formData, setFormData] = useState<Evaluation>(initialData)
  const { issues } = useLiveValidation(formData)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleFieldChange = (fields: Partial<Evaluation>) => {
    setFormData((prev) => ({ ...prev, ...fields }));
  };

  const handleBlockValueChange = (fields: Record<string, any>) => {
    setFormData((prev) => ({
      ...prev,
      block_values: { ...prev.block_values, ...fields }
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    try {
      await onSave(formData);
    } catch (err: any) {
      setSaveError(err.message || 'An error occurred while saving the draft.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-20">
      {/* 1. Admin & Command Details (Blocks 1‑32) */}
      <Block1Admin
        evalData={formData}
        onChange={handleFieldChange}
        issues={issues}
        handleBlockValueChange={handleBlockValueChange}
      />

      {/* 2. Trait Ratings (Blocks 33‑39, auto‑computes Block 40 average) */}
      <Block33to39Traits
        evalData={formData}
        onChange={handleFieldChange}
        issues={issues}
      />

      {/* 3. Comments (Block 43) */}
      <Block43Comments
        evalData={formData}
        onChange={handleFieldChange}
        issues={issues}
      />

      {/* 4. Recommendations & Signatures (Blocks 41, 44‑52) */}
      <Block42Signatures
        evalData={formData}
        onChange={handleFieldChange}
        handleBlockValueChange={handleBlockValueChange}
        issues={issues}
      />

      {/* Save / Status Panel */}
      <StatusBar issues={issues} saveError={saveError} isSaving={isSaving} onCancel={onCancel} />
    </form>
  );
}

/* ──────────────────────────────────────────────────
   StatusBar — extracted to reduce main function LOC
   ────────────────────────────────────────────────── */

function StatusBar({
  issues,
  saveError,
  isSaving,
  onCancel,
}: {
  issues: ValidationIssue[]
  saveError: string | null
  isSaving: boolean
  onCancel: () => void
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
