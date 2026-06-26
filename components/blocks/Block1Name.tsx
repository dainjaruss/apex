// components/blocks/Block1Name.tsx
//
// Admin identity block for Name, Rate, UIC, and Report Period metadata (Blocks 1-19).
//

import React from 'react'
import { Evaluation, ValidationIssue } from '@/types'
import { DUTY_STATUS_OPTIONS, PROMOTION_STATUS_OPTIONS } from '@/types/navpers'
import BupersGuidelinesInline from '@/components/blocks/BupersGuidelinesInline'

interface Block1NameProps {
  evalData: Evaluation;
  onChange: (fields: Partial<Evaluation>) => void;
  issues: ValidationIssue[];
  onFocusField?: (field: string | null) => void;
  activeField?: string | null;
}

// fallow-ignore-next-line complexity
export default function Block1Name({ evalData, onChange, issues, onFocusField, activeField }: Block1NameProps) {
  // Helper to find specific field error message
  const getError = (field: string) => {
    return issues.find(i => i.field === field)?.message;
  };

  const getBlockError = (blockNum: number) => {
    return issues.find(i => i.block === blockNum)?.message;
  };

  // Occasion (Blocks 10-13) and Type of Report (Blocks 16-18) are multi-select per
  // BUPERSINST 1610.10H — each option is an independent block_values boolean.
  const bv = evalData.block_values || {};
  const toggleBlockFlag = (key: string) => {
    onChange({
      block_values: { ...evalData.block_values, [key]: !evalData.block_values?.[key] },
    });
  };

  const fieldClass = (hasError: boolean) =>
    `w-full bg-[#1c2541]/40 border rounded px-3 py-2 text-foreground focus:outline-none transition duration-150 ${
      hasError
        ? 'border-red-500/80 focus:border-red-400 focus:ring-1 focus:ring-red-400'
        : 'border-slate-700/60 focus:border-[#3e6e99] focus:ring-1 focus:ring-[#3e6e99]'
    }`;

  const labelClass = 'block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1';

  return (
    <>
      <BupersGuidelinesInline
        activeField={activeField || null}
        sectionFields={[
          'member_name',
          'grade_rate',
          'designator',
          'dod_id',
          'duty_status',
          'uic',
          'ship_station',
          'promotion_status',
          'date_reported',
          'occasion',
          'period_from',
          'period_to',
          'type'
        ]}
      />

      {/* Grid for Blocks 1 - 4 */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
        <div className="md:col-span-5">
          <label className={labelClass}>1: Name (Last, First MI Suffix)</label>
          <input
            type="text"
            placeholder="DAIN, FRANKLYN A"
            value={evalData.member_name}
            onChange={(e) => onChange({ member_name: e.target.value.toUpperCase() })}
            onFocus={() => onFocusField?.('member_name')}
            className={fieldClass(!!getError('member_name'))}
          />
          {getError('member_name') && (
            <p className="text-red-400 text-xs mt-1">{getError('member_name')}</p>
          )}
        </div>

        <div className="md:col-span-2">
          <label className={labelClass}>2: Grade/Rate</label>
          <input
            type="text"
            placeholder="PO2"
            maxLength={5}
            value={evalData.grade_rate}
            onChange={(e) => onChange({ grade_rate: e.target.value.toUpperCase() })}
            onFocus={() => onFocusField?.('grade_rate')}
            className={fieldClass(!!getError('grade_rate'))}
          />
          {getError('grade_rate') && (
            <p className="text-red-400 text-xs mt-1">{getError('grade_rate')}</p>
          )}
        </div>

        <div className="md:col-span-2">
          <label className={labelClass}>3: Designator</label>
          <input
            type="text"
            placeholder="1110"
            maxLength={10}
            value={evalData.designator || ''}
            onChange={(e) => onChange({ designator: e.target.value.toUpperCase() })}
            onFocus={() => onFocusField?.('designator')}
            className={fieldClass(!!getError('designator'))}
          />
        </div>

        <div className="md:col-span-3">
          <label className={labelClass}>4: DoD ID</label>
          <input
            type="text"
            placeholder="10-digit number"
            maxLength={10}
            value={evalData.dod_id}
            onChange={(e) => onChange({ dod_id: e.target.value.replace(/[^0-9]/g, '') })}
            onFocus={() => onFocusField?.('dod_id')}
            className={fieldClass(!!getError('dod_id'))}
          />
          {getError('dod_id') && (
            <p className="text-red-400 text-xs mt-1">{getError('dod_id')}</p>
          )}
        </div>
      </div>

      {/* Grid for Blocks 5 - 8 */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
        <div className="md:col-span-3">
          <label className={labelClass}>5: Duty Status</label>
          <select
            value={evalData.duty_status}
            onChange={(e) => onChange({ duty_status: e.target.value })}
            onFocus={() => onFocusField?.('duty_status')}
            className={fieldClass(!!getError('duty_status'))}
          >
            <option value="">Select status</option>
            {DUTY_STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {getError('duty_status') && (
            <p className="text-red-400 text-xs mt-1">{getError('duty_status')}</p>
          )}
        </div>

        <div className="md:col-span-2">
          <label className={labelClass}>6: UIC</label>
          <input
            type="text"
            placeholder="e.g. 00241"
            maxLength={5}
            value={evalData.uic}
            onChange={(e) => onChange({ uic: e.target.value.toUpperCase().trim() })}
            onFocus={() => onFocusField?.('uic')}
            className={fieldClass(!!getError('uic'))}
          />
          {getError('uic') && (
            <p className="text-red-400 text-xs mt-1">{getError('uic')}</p>
          )}
        </div>

        <div className="md:col-span-4">
          <label className={labelClass}>7: Ship/Station</label>
          <input
            type="text"
            placeholder="USS NEVERSAIL"
            value={evalData.ship_station}
            onChange={(e) => onChange({ ship_station: e.target.value.toUpperCase() })}
            onFocus={() => onFocusField?.('ship_station')}
            className={fieldClass(!!getError('ship_station'))}
          />
          {getError('ship_station') && (
            <p className="text-red-400 text-xs mt-1">{getError('ship_station')}</p>
          )}
        </div>

        <div className="md:col-span-3">
          <label className={labelClass}>8: Promotion Status</label>
          <select
            value={evalData.promotion_status}
            onChange={(e) => onChange({ promotion_status: e.target.value })}
            onFocus={() => onFocusField?.('promotion_status')}
            className={fieldClass(!!getError('promotion_status'))}
          >
            <option value="">Select status</option>
            {PROMOTION_STATUS_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          {getError('promotion_status') && (
            <p className="text-red-400 text-xs mt-1">{getError('promotion_status')}</p>
          )}
        </div>
      </div>

      {/* Block 9 (Date Reported) + Blocks 14-15 (Report Period) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-4">
          <label className={labelClass}>9: Date Reported</label>
          <input
            type="date"
            value={bv.date_reported || ''}
            onChange={(e) =>
              onChange({
                block_values: { ...evalData.block_values, date_reported: e.target.value }
              })
            }
            onFocus={() => onFocusField?.('date_reported')}
            className={fieldClass(!!getError('date_reported') || !!getBlockError(9))}
          />
          {(getError('date_reported') || getBlockError(9)) && (
            <p className="text-red-400 text-xs mt-1">{getError('date_reported') || getBlockError(9)}</p>
          )}
        </div>

        <div className="md:col-span-8">
          <label className={labelClass}>14-15: Report Period</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <input
                type="date"
                value={evalData.period_from}
                onChange={(e) => onChange({ period_from: e.target.value })}
                onFocus={() => onFocusField?.('period_from')}
                className={fieldClass(!!getError('period_from'))}
              />
              <span className="text-[10px] text-slate-500 block mt-0.5 text-center">From</span>
            </div>
            <div>
              <input
                type="date"
                value={evalData.period_to}
                onChange={(e) => onChange({ period_to: e.target.value })}
                onFocus={() => onFocusField?.('period_to')}
                className={fieldClass(!!getError('period_to'))}
              />
              <span className="text-[10px] text-slate-500 block mt-0.5 text-center">To</span>
            </div>
          </div>
          {getError('period_from') && (
            <p className="text-red-400 text-xs mt-1">{getError('period_from')}</p>
          )}
          {getError('period_to') && (
            <p className="text-red-400 text-xs mt-1">{getError('period_to')}</p>
          )}
        </div>
      </div>

      {/* Blocks 10-13 (Occasion) + Blocks 16-18 (Type) — multi-select per BUPERSINST 1610.10H */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        <CheckGroup label="10-13: Occasion for Report — select all that apply" error={getError('occasion')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5">
            <CheckOption label="10: Periodic" checked={!!bv.periodic} onToggle={() => toggleBlockFlag('periodic')} onFocus={() => onFocusField?.('occasion')} />
            <CheckOption label="11: Detachment of Individual" checked={!!bv.detachment_individual} onToggle={() => toggleBlockFlag('detachment_individual')} onFocus={() => onFocusField?.('occasion')} />
            <CheckOption label="12: Promotion/Frocking" checked={!!bv.promotion_frocking} onToggle={() => toggleBlockFlag('promotion_frocking')} onFocus={() => onFocusField?.('occasion')} />
            <CheckOption label="13: Special" checked={!!bv.special} onToggle={() => toggleBlockFlag('special')} onFocus={() => onFocusField?.('occasion')} />
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Special (13) cannot be combined with another occasion.</p>
        </CheckGroup>

        <CheckGroup label="16-18: Type of Report — select all that apply" error={getError('type')}>
          <div className="space-y-1.5">
            <CheckOption label="16: Not Observed (NOB)" checked={!!bv.not_observed} onToggle={() => toggleBlockFlag('not_observed')} onFocus={() => onFocusField?.('type')} />
            <CheckOption label="17: Regular" checked={!!bv.regular_report} onToggle={() => toggleBlockFlag('regular_report')} onFocus={() => onFocusField?.('type')} />
            <CheckOption label="18: Concurrent" checked={!!bv.concurrent_report} onToggle={() => toggleBlockFlag('concurrent_report')} onFocus={() => onFocusField?.('type')} />
          </div>
          <p className="text-[10px] text-slate-500 mt-2">A Concurrent/Regular report marks both 17 and 18.</p>
        </CheckGroup>
      </div>
    </>
  );
}

/* ── Multi-select checkbox helpers (Occasion 10-13, Type 16-18) ── */

function CheckGroup({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <fieldset className={`rounded-lg border p-3 bg-[#1c2541]/30 ${error ? 'border-red-500/70' : 'border-slate-700/60'}`}>
      <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">{label}</legend>
      {children}
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </fieldset>
  )
}

function CheckOption({ label, checked, onToggle, onFocus }: { label: string; checked: boolean; onToggle: () => void; onFocus?: () => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-200 select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        onFocus={onFocus}
        className="h-4 w-4 rounded border-slate-600 bg-[#1c2541] accent-[#3e6e99] focus:ring-1 focus:ring-[#3e6e99]"
      />
      <span>{label}</span>
    </label>
  )
}
