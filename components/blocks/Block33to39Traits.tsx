// components/blocks/Block33to39Traits.tsx
//
// Trait grading grid for Blocks 33-39 (1.0 to 5.0 scale + NOB).
// Calculates and updates trait average in parent state.
//

import React, { useEffect } from 'react'
import { Evaluation, ValidationIssue } from '@/types'

interface Block33to39TraitsProps {
  evalData: Evaluation;
  onChange: (fields: Partial<Evaluation>) => void;
  issues: ValidationIssue[];
}

const TRAIT_KEYS = [
  { key: 'knowledge', label: 'Professional Knowledge (Block 33)' },
  { key: 'work', label: 'Quality of Work (Block 34)' },
  { key: 'eo', label: 'Command Climate / Equal Opportunity (Block 35)' },
  { key: 'bearing', label: 'Military Bearing / Character (Block 36)' },
  { key: 'accomplishment', label: 'Personal Job Accomplishment / Initiative (Block 37)' },
  { key: 'teamwork', label: 'Teamwork (Block 38)' },
  { key: 'leadership', label: 'Leadership (Block 39)' }
] as const;

const GRADE_VALUES = ['1.0', '2.0', '3.0', '4.0', '5.0', 'NOB'] as const;

export default function Block33to39Traits({ evalData, onChange, issues }: Block33to39TraitsProps) {
  const currentGrades = evalData.trait_grades || {
    knowledge: '3.0',
    work: '3.0',
    eo: '3.0',
    bearing: '3.0',
    accomplishment: '3.0',
    teamwork: '3.0',
    leadership: '3.0'
  };

  // Run calculation of Individual Trait Average whenever grades modify
  useEffect(() => {
    let sum = 0;
    let count = 0;

    Object.values(currentGrades).forEach((grade) => {
      if (grade !== 'NOB') {
        const val = parseFloat(grade);
        if (!isNaN(val)) {
          sum += val;
          count++;
        }
      }
    });

    const average = count > 0 ? parseFloat((sum / count).toFixed(2)) : 0.0;
    
    if (evalData.trait_average !== average) {
      onChange({ trait_average: average });
    }
  }, [currentGrades, onChange, evalData.trait_average]);

  const handleGradeChange = (trait: keyof typeof currentGrades, value: string) => {
    onChange({
      trait_grades: {
        ...currentGrades,
        [trait]: value
      }
    });
  };

  const getError = (trait: string) => {
    return issues.find((i) => i.field === `trait_grades.${trait}`)?.message;
  };

  return (
    <div className="glass-panel rounded-xl p-6 mb-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b border-slate-700/40 pb-2">
        <h3 className="text-lg font-bold gold-accent">
          Trait Performance Ratings (Blocks 33 - 39)
        </h3>
        <div className="mt-2 sm:mt-0 px-4 py-1.5 rounded-lg bg-[#111c38]/40 border border-slate-800 text-sm font-semibold flex items-center gap-2">
          <span className="text-slate-400 text-xs uppercase">Trait Average (Block 40):</span>
          <span className="text-emerald-400 font-bold font-mono text-base">
            {evalData.trait_average ? evalData.trait_average.toFixed(2) : '0.00'}
          </span>
        </div>
      </div>

      <div className="space-y-4">
        {TRAIT_KEYS.map(({ key, label }) => {
          const val = currentGrades[key] || '3.0';
          const err = getError(key);
          
          return (
            <div
              key={key}
              className="flex flex-col md:flex-row md:items-center justify-between p-3.5 rounded-lg bg-slate-900/30 border border-slate-800/40 hover:border-slate-700/40 transition duration-150"
            >
              <div className="mb-2 md:mb-0">
                <span className="text-sm font-medium text-slate-200">{label}</span>
                {err && <p className="text-red-400 text-xs mt-0.5">{err}</p>}
              </div>

              {/* Radio options grid */}
              <div className="flex flex-wrap items-center gap-1.5 font-mono">
                {GRADE_VALUES.map((gOpt) => {
                  const active = val === gOpt;
                  return (
                    <button
                      key={gOpt}
                      type="button"
                      onClick={() => handleGradeChange(key, gOpt)}
                      className={`px-3 py-1.5 text-xs font-bold rounded-md transition duration-150 min-w-[48px] text-center ${
                        active
                          ? 'bg-[#3e6e99] text-white shadow-md shadow-[#3e6e99]/20'
                          : 'bg-[#1c2541]/40 text-slate-400 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      {gOpt}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
