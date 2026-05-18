// components/blocks/Block1Name.tsx
//
// Admin identity block for Name, Rate, UIC, and Report Period metadata (Blocks 1-19).
//

import React from 'react'
import { Evaluation, ValidationIssue } from '@/types'
import { DUTY_STATUS_OPTIONS, PROMOTION_STATUS_OPTIONS } from '@/types/navpers'

interface Block1NameProps {
  evalData: Evaluation;
  onChange: (fields: Partial<Evaluation>) => void;
  issues: ValidationIssue[];
}

// fallow-ignore-next-line complexity
export default function Block1Name({ evalData, onChange, issues }: Block1NameProps) {
  // Helper to find specific field error message
  const getError = (field: string) => {
    return issues.find(i => i.field === field)?.message;
  };

  const getBlockError = (blockNum: number) => {
    return issues.find(i => i.block === blockNum)?.message;
  };

  // Occasion selector (Blocks 10-13)
  const activeOccasion = evalData.block_values?.periodic
    ? 'periodic'
    : evalData.block_values?.detachment_individual
    ? 'detachment_individual'
    : evalData.block_values?.detachment_senior
    ? 'detachment_senior'
    : evalData.block_values?.special
    ? 'special'
    : '';

  const handleOccasionChange = (val: string) => {
    onChange({
      block_values: {
        ...evalData.block_values,
        periodic: val === 'periodic',
        detachment_individual: val === 'detachment_individual',
        detachment_senior: val === 'detachment_senior',
        special: val === 'special'
      }
    });
  };

  // Regularity selector (Blocks 16-19)
  const activeType = evalData.block_values?.not_observed
    ? 'not_observed'
    : evalData.block_values?.regular_report
    ? 'regular_report'
    : evalData.block_values?.concurrent_report
    ? 'concurrent_report'
    : evalData.block_values?.ops_commander_report
    ? 'ops_commander_report'
    : '';

  const handleTypeChange = (val: string) => {
    onChange({
      block_values: {
        ...evalData.block_values,
        not_observed: val === 'not_observed',
        regular_report: val === 'regular_report',
        concurrent_report: val === 'concurrent_report',
        ops_commander_report: val === 'ops_commander_report'
      }
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
    <div className="glass-panel rounded-xl p-6 mb-6">
      <h3 className="text-lg font-bold gold-accent mb-4 border-b border-slate-700/40 pb-2">
        Administrative Identity (Blocks 1 - 19)
      </h3>

      {/* Grid for Blocks 1 - 4 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div>
          <label className={labelClass}>Block 1: Name (Last, First MI)</label>
          <input
            type="text"
            placeholder="DAIN, FRANKLYN A"
            value={evalData.member_name}
            onChange={(e) => onChange({ member_name: e.target.value.toUpperCase() })}
            className={fieldClass(!!getError('member_name'))}
          />
          {getError('member_name') && (
            <p className="text-red-400 text-xs mt-1">{getError('member_name')}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Block 2: Grade/Rate</label>
          <input
            type="text"
            placeholder="PO2"
            value={evalData.grade_rate}
            onChange={(e) => onChange({ grade_rate: e.target.value.toUpperCase() })}
            className={fieldClass(!!getError('grade_rate'))}
          />
          {getError('grade_rate') && (
            <p className="text-red-400 text-xs mt-1">{getError('grade_rate')}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Block 3: Designator</label>
          <input
            type="text"
            placeholder="1110"
            value={evalData.designator || ''}
            onChange={(e) => onChange({ designator: e.target.value.toUpperCase() })}
            className={fieldClass(!!getError('designator'))}
          />
        </div>

        <div>
          <label className={labelClass}>Block 4: DoD ID</label>
          <input
            type="text"
            placeholder="10-digit number"
            maxLength={10}
            value={evalData.dod_id}
            onChange={(e) => onChange({ dod_id: e.target.value.replace(/[^0-9]/g, '') })}
            className={fieldClass(!!getError('dod_id'))}
          />
          {getError('dod_id') && (
            <p className="text-red-400 text-xs mt-1">{getError('dod_id')}</p>
          )}
        </div>
      </div>

      {/* Grid for Blocks 5 - 8 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div>
          <label className={labelClass}>Block 5: Duty Status</label>
          <select
            value={evalData.duty_status}
            onChange={(e) => onChange({ duty_status: e.target.value })}
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

        <div>
          <label className={labelClass}>Block 6: UIC</label>
          <input
            type="text"
            placeholder="e.g. 00241"
            maxLength={5}
            value={evalData.uic}
            onChange={(e) => onChange({ uic: e.target.value.toUpperCase().trim() })}
            className={fieldClass(!!getError('uic'))}
          />
          {getError('uic') && (
            <p className="text-red-400 text-xs mt-1">{getError('uic')}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Block 7: Ship/Station</label>
          <input
            type="text"
            placeholder="USS NEVERSAIL"
            value={evalData.ship_station}
            onChange={(e) => onChange({ ship_station: e.target.value.toUpperCase() })}
            className={fieldClass(!!getError('ship_station'))}
          />
          {getError('ship_station') && (
            <p className="text-red-400 text-xs mt-1">{getError('ship_station')}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Block 8: Promotion Status</label>
          <select
            value={evalData.promotion_status}
            onChange={(e) => onChange({ promotion_status: e.target.value })}
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

      {/* Grid for Block 9, Blocks 10-13, Blocks 14-15, Blocks 16-19 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div>
          <label className={labelClass}>Block 9: Date Reported</label>
          <input
            type="text"
            placeholder="YYMMMDD (e.g. 24JAN15)"
            value={evalData.block_values?.date_reported || ''}
            onChange={(e) =>
              onChange({
                block_values: {
                  ...evalData.block_values,
                  date_reported: e.target.value.toUpperCase()
                }
              })
            }
            className={fieldClass(!!getBlockError(9))}
          />
          {getBlockError(9) && (
            <p className="text-red-400 text-xs mt-1">{getBlockError(9)}</p>
          )}
        </div>

        <div>
          <label className={labelClass}>Blocks 10-13: Occasion</label>
          <select
            value={activeOccasion}
            onChange={(e) => handleOccasionChange(e.target.value)}
            className={fieldClass(false)}
          >
            <option value="">Select Occasion</option>
            <option value="periodic">Periodic (Block 10)</option>
            <option value="detachment_individual">Detachment of Individual (Block 11)</option>
            <option value="detachment_senior">Detachment of Reporting Senior (Block 12)</option>
            <option value="special">Special (Block 13)</option>
          </select>
        </div>

        <div>
          <label className={labelClass}>Blocks 14-15: Report Period</label>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <input
                type="date"
                value={evalData.period_from}
                onChange={(e) => onChange({ period_from: e.target.value })}
                className={fieldClass(!!getError('period_from'))}
              />
              <span className="text-[10px] text-slate-500 block mt-0.5 text-center">From</span>
            </div>
            <div>
              <input
                type="date"
                value={evalData.period_to}
                onChange={(e) => onChange({ period_to: e.target.value })}
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

        <div>
          <label className={labelClass}>Blocks 16-19: Type</label>
          <select
            value={activeType}
            onChange={(e) => handleTypeChange(e.target.value)}
            className={fieldClass(false)}
          >
            <option value="">Select Type</option>
            <option value="regular_report">Regular (Block 17)</option>
            <option value="concurrent_report">Concurrent (Block 18)</option>
            <option value="ops_commander_report">Ops Commander (Block 19)</option>
            <option value="not_observed">Not Observed (Block 16)</option>
          </select>
        </div>
      </div>
    </div>
  );
}
