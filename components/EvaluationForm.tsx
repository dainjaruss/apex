// components/EvaluationForm.tsx
//
// Form orchestrator linking the administrative, trait grading, and comments modules
// under a single responsive dashboard featuring real-time Navy guidelines validation.
//

import React, { useState } from 'react'
import { Evaluation, ValidationIssue } from '@/types'
import { PROMOTION_RECOMMENDATIONS, RETENTION_OPTIONS } from '@/types/navpers'
import Block1Name from '@/components/blocks/Block1Name'
import Block33to39Traits from '@/components/blocks/Block33to39Traits'
import Block43Comments from '@/components/blocks/Block43Comments'
import { useLiveValidation } from '@/hooks/useLiveValidation'

interface EvaluationFormProps {
  initialData: Evaluation;
  onSave: (data: Evaluation) => Promise<void>;
  onCancel: () => void;
  isSaving: boolean;
}

// fallow-ignore-next-line complexity
export default function EvaluationForm({ initialData, onSave, onCancel, isSaving }: EvaluationFormProps) {
  const [formData, setFormData] = useState<Evaluation>(initialData)
  const { isValid, issues } = useLiveValidation(formData)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleFieldChange = (fields: Partial<Evaluation>) => {
    setFormData((prev) => ({
      ...prev,
      ...fields
    }));
  };

  const handleBlockValueChange = (fields: Record<string, any>) => {
    setFormData((prev) => ({
      ...prev,
      block_values: {
        ...prev.block_values,
        ...fields
      }
    }));
  };

  const handleTraitChange = (fields: Partial<Evaluation['trait_grades']>) => {
    setFormData((prev) => ({
      ...prev,
      trait_grades: {
        ...prev.trait_grades,
        ...fields
      }
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

  const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1';
  const fieldClass = 'w-full bg-[#1c2541]/40 border border-slate-700/60 rounded px-3 py-2 text-foreground focus:outline-none focus:border-[#3e6e99] focus:ring-1 focus:ring-[#3e6e99] transition duration-150';

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-20">
      {/* 1. Header Admin Block */}
      <Block1Name
        evalData={formData}
        onChange={handleFieldChange}
        issues={issues}
      />

      {/* 2. Command Details & Reporting Senior Block (Blocks 20-32) */}
      <div className="glass-panel rounded-xl p-6">
        <h3 className="text-lg font-bold gold-accent mb-4 border-b border-slate-700/40 pb-2">
          Command Context & Reporting Senior (Blocks 20 - 32)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div>
            <label className={labelClass}>Block 20: Physical Readiness</label>
            <input
              type="text"
              placeholder="e.g. P/P"
              maxLength={10}
              value={formData.block_values?.physical_readiness || ''}
              onChange={(e) => handleBlockValueChange({ physical_readiness: e.target.value.toUpperCase() })}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Block 21: Billet Subcategory</label>
            <input
              type="text"
              placeholder="e.g. NA"
              value={formData.block_values?.billet_subcategory || ''}
              onChange={(e) => handleBlockValueChange({ billet_subcategory: e.target.value.toUpperCase() })}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Block 22: RS Name (Last, First MI)</label>
            <input
              type="text"
              placeholder="SENIOR, IM A"
              value={formData.block_values?.reporting_senior_name || ''}
              onChange={(e) => handleBlockValueChange({ reporting_senior_name: e.target.value.toUpperCase() })}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Block 23: RS Grade</label>
            <input
              type="text"
              placeholder="e.g. CDR"
              value={formData.block_values?.reporting_senior_grade || ''}
              onChange={(e) => handleBlockValueChange({ reporting_senior_grade: e.target.value.toUpperCase() })}
              className={fieldClass}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div>
            <label className={labelClass}>Block 24: RS Designator</label>
            <input
              type="text"
              placeholder="e.g. 1110"
              value={formData.block_values?.reporting_senior_designator || ''}
              onChange={(e) => handleBlockValueChange({ reporting_senior_designator: e.target.value.replace(/[^0-9]/g, '') })}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Block 25: RS Title</label>
            <input
              type="text"
              placeholder="e.g. COMMANDING OFFICER"
              value={formData.block_values?.reporting_senior_title || ''}
              onChange={(e) => handleBlockValueChange({ reporting_senior_title: e.target.value.toUpperCase() })}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Block 26: RS UIC</label>
            <input
              type="text"
              placeholder="e.g. 00241"
              maxLength={5}
              value={formData.block_values?.reporting_senior_uic || ''}
              onChange={(e) => handleBlockValueChange({ reporting_senior_uic: e.target.value.toUpperCase().trim() })}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Block 30: Date Counseled</label>
            <input
              type="text"
              placeholder="YYMMMDD or NOT REQ"
              value={formData.block_values?.date_counseled || ''}
              onChange={(e) => handleBlockValueChange({ date_counseled: e.target.value.toUpperCase() })}
              className={fieldClass}
            />
            {issues.find(i => i.field === 'date_counseled') && (
              <p className="text-red-400 text-xs mt-1">{issues.find(i => i.field === 'date_counseled')?.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Block 28: Command Employment and Achievements</label>
            <textarea
              placeholder="Describe command achievements..."
              value={formData.block_values?.command_achievements || ''}
              onChange={(e) => handleBlockValueChange({ command_achievements: e.target.value })}
              className={`${fieldClass} h-20`}
            />
          </div>

          <div>
            <label className={labelClass}>Block 29: Primary/Collateral/Watchstanding Duties</label>
            <textarea
              placeholder="Describe sailor primary duties..."
              value={formData.block_values?.primary_duties || ''}
              onChange={(e) => handleBlockValueChange({ primary_duties: e.target.value })}
              className={`${fieldClass} h-20`}
            />
          </div>
        </div>
      </div>

      {/* 3. Trait Ratings Block */}
      <Block33to39Traits
        evalData={formData}
        onChange={handleFieldChange}
        issues={issues}
      />

      {/* 4. Comments Block */}
      <Block43Comments
        evalData={formData}
        onChange={handleFieldChange}
        issues={issues}
      />

      {/* 5. Summary Recommendations & Signatures (Blocks 41, 44-52) */}
      <div className="glass-panel rounded-xl p-6">
        <h3 className="text-lg font-bold gold-accent mb-4 border-b border-slate-700/40 pb-2">
          Recommendations & Signatures (Blocks 41 - 52)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div>
            <label className={labelClass}>Block 41: Career Recommendations (One per line)</label>
            <textarea
              placeholder="e.g. NAVY RECRUITER&#10;SEAL CHALLENGE"
              value={formData.career_recommendations?.join('\n') || ''}
              onChange={(e) => handleFieldChange({ career_recommendations: e.target.value.split('\n') })}
              className={`${fieldClass} h-24`}
            />
          </div>

          <div>
            <label className={labelClass}>Block 45: Promotion Recommendation</label>
            <select
              value={formData.promotion_recommendation}
              onChange={(e) => handleFieldChange({ promotion_recommendation: e.target.value as any })}
              className={fieldClass}
            >
              {PROMOTION_RECOMMENDATIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {issues.find(i => i.field === 'promotion_recommendation') && (
              <p className="text-red-400 text-xs mt-1 font-semibold">
                ⚠️ {issues.find(i => i.field === 'promotion_recommendation')?.message}
              </p>
            )}
          </div>

          <div>
            <label className={labelClass}>Block 47: Retention Recommendation</label>
            <select
              value={formData.retention}
              onChange={(e) => handleFieldChange({ retention: e.target.value as any })}
              className={fieldClass}
            >
              {RETENTION_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mb-6">
          <label className={labelClass}>Block 44: Qualifications / Achievements</label>
          <textarea
            placeholder="List qualifications, degrees, designations, etc."
            value={formData.block_values?.qualifications_achievements || ''}
            onChange={(e) => handleBlockValueChange({ qualifications_achievements: e.target.value })}
            className={`${fieldClass} h-20`}
          />
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-800/60 pt-4">
          <div>
            <label className={labelClass}>Block 42: Rater Signature</label>
            <input
              type="text"
              placeholder="e.g. Signature on file"
              value={formData.block_values?.rater_signature || ''}
              onChange={(e) => handleBlockValueChange({ rater_signature: e.target.value })}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Block 48: Senior Rater Signature</label>
            <input
              type="text"
              placeholder="e.g. Signature on file"
              value={formData.block_values?.senior_rater_signature || ''}
              onChange={(e) => handleBlockValueChange({ senior_rater_signature: e.target.value })}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Block 49: Member Signature</label>
            <input
              type="text"
              placeholder="e.g. Signature on file"
              value={formData.block_values?.member_signature || ''}
              onChange={(e) => handleBlockValueChange({ member_signature: e.target.value })}
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Block 50: Reporting Senior Signature</label>
            <input
              type="text"
              placeholder="e.g. Signature on file"
              value={formData.block_values?.reporting_senior_signature || ''}
              onChange={(e) => handleBlockValueChange({ reporting_senior_signature: e.target.value })}
              className={fieldClass}
            />
          </div>
        </div>
      </div>

      {/* Save / Status Panel */}
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
    </form>
  );
}
