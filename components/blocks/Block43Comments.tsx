// components/blocks/Block43Comments.tsx
//
// Monospace narrative editor displaying pitch selection (10 vs 12)
// and a live wrapped monospace preview of Courier printing bounds.
//

import React from 'react'
import { Evaluation, ValidationIssue } from '@/types'
import { checkCommentFit } from '@/lib/commentFit'

interface Block43CommentsProps {
  evalData: Evaluation;
  onChange: (fields: Partial<Evaluation>) => void;
  issues: ValidationIssue[];
}

// fallow-ignore-next-line complexity
export default function Block43Comments({ evalData, onChange, issues }: Block43CommentsProps) {
  const currentText = evalData.comments || '';
  const currentPitch = evalData.block_values?.comment_pitch || '10';

  // Perform live math calculation of lines and fitting state
  const fitResult = checkCommentFit(currentText, currentPitch);

  const handlePitchChange = (pitch: '10' | '12') => {
    onChange({
      block_values: {
        ...evalData.block_values,
        comment_pitch: pitch
      }
    });
  };

  const getError = () => {
    return issues.find((i) => i.field === 'comments')?.message;
  };

  const isNearingLimit = fitResult.linesUsed >= 16 && fitResult.linesUsed <= 18;
  const isOverflowed = !fitResult.fit;

  let counterColor = 'text-slate-400';
  if (isNearingLimit) counterColor = 'text-amber-500 font-bold';
  if (isOverflowed) counterColor = 'text-red-500 font-extrabold animate-pulse';

  return (
    <div className="glass-panel rounded-xl p-6 mb-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 border-b border-slate-700/40 pb-2">
        <div>
          <h3 className="text-lg font-bold gold-accent">
            Block 43: Comments on Performance
          </h3>
          <p className="text-xs text-slate-400">NAVPERS 1616/26 allows up to 18 lines of monospace printing.</p>
        </div>

        {/* Pitch config selection */}
        <div className="mt-3 sm:mt-0 flex items-center gap-2">
          <span className="text-xs text-slate-400 font-semibold uppercase">Printing Pitch:</span>
          <div className="flex rounded-md border border-slate-800 bg-[#1c2541]/40 p-0.5">
            <button
              type="button"
              onClick={() => handlePitchChange('10')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition duration-150 ${
                currentPitch === '10' ? 'bg-[#3e6e99] text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              10-Pitch (70 CPL)
            </button>
            <button
              type="button"
              onClick={() => handlePitchChange('12')}
              className={`px-3 py-1 text-xs font-bold rounded-md transition duration-150 ${
                currentPitch === '12' ? 'bg-[#3e6e99] text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              12-Pitch (84 CPL)
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monospace raw input textarea */}
        <div className="space-y-2">
          <div className="flex justify-between items-center text-xs text-slate-400">
            <span>Editor Input</span>
            <span className={counterColor}>
              Lines: {fitResult.linesUsed} / {fitResult.maxLines}
            </span>
          </div>

          <textarea
            value={currentText}
            onChange={(e) => onChange({ comments: e.target.value })}
            placeholder="Type performance narrative here... Use ALL CAPS to conform with standard NAVPERS layout rules."
            className={`w-full h-[240px] bg-slate-950/45 border rounded-xl p-4 font-mono text-sm focus:outline-none transition duration-150 ${
              isOverflowed
                ? 'border-red-500/80 focus:border-red-400 focus:ring-1 focus:ring-red-400'
                : 'border-slate-800 focus:border-[#3e6e99] focus:ring-1 focus:ring-[#3e6e99]'
            }`}
          />
          {getError() && (
            <p className="text-red-400 text-xs mt-1">{getError()}</p>
          )}
        </div>

        {/* Real-time Courier wrapped box preview */}
        <div className="space-y-2">
          <div className="text-xs text-slate-400 flex justify-between items-center">
            <span>Physical Courier Box Preview ({fitResult.maxCpl} CPL max)</span>
            <span className="text-[10px] text-slate-500">Fixed Font Rendering</span>
          </div>

          <div className="w-full h-[240px] bg-slate-950/70 border border-slate-900 rounded-xl p-4 font-mono text-[11px] overflow-y-auto text-slate-200 leading-[1.3] select-none">
            {fitResult.wrappedLines.length === 0 ? (
              <span className="text-slate-700 italic">No narrative input.</span>
            ) : (
              <div className="space-y-0">
                {fitResult.wrappedLines.map((line, idx) => (
                  <div key={idx} className="flex">
                    <span className="w-6 text-[9px] text-slate-700 pr-1.5 mr-2 text-right border-r border-slate-900 select-none">
                      {idx + 1}
                    </span>
                    <span className="whitespace-pre">{line}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
