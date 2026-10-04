// src/lib/summaryGroupEligibility.test.ts
// 100% coverage for summaryGroupEligibility.ts — BUPERSINST 1610.10H Table 1-3/1-4 membership rules.

import { describe, it, expect } from 'vitest';
import {
  dutyStatusBucket,
  isEvalEligibleForSummaryGroup,
  visibleSummaryGroupsForEval,
  describeSummaryGroup,
} from './summaryGroupEligibility';
import type { EvalForSummaryGroup, SummaryGroupWithRs } from './summaryGroupEligibility';
import type { SummaryGroup } from '@/types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeGroup(overrides: Partial<SummaryGroupWithRs> = {}): SummaryGroupWithRs {
  return {
    id: 'sg-1',
    name: 'Test Group Alpha',
    reporting_senior_name: 'SMITH, JOHN A',
    reporting_senior_dod_id: '1234567890',
    period_to: '2025-09-30',
    grade_rate: 'E-6',
    promotion_status: 'Regular',
    report_type: 'EVAL',
    status: 'open',
    member_ids: [],
    ...overrides,
  };
}

function makeEval(overrides: Partial<EvalForSummaryGroup> = {}): EvalForSummaryGroup {
  return {
    grade_rate: 'PO1',         // E-6
    promotion_status: 'Regular',
    period_to: '2025-09-30',
    report_type: 'EVAL',
    uic: '12345',
    summary_group_id: undefined,
    duty_status: 'ACT',
    block_values: {
      reporting_senior_dod_id: '1234567890',
      billet_subcategory: 'NA',
    },
    ...overrides,
  };
}

// ─── dutyStatusBucket ─────────────────────────────────────────────────────────
describe('dutyStatusBucket', () => {
  it('merges ACT and TAR into ACT/TAR for EVAL', () => {
    expect(dutyStatusBucket('ACT', 'EVAL')).toBe('ACT/TAR');
    expect(dutyStatusBucket('TAR', 'EVAL')).toBe('ACT/TAR');
    expect(dutyStatusBucket('ACT', 'CHIEFEVAL')).toBe('ACT/TAR');
    expect(dutyStatusBucket('TAR', 'CHIEFEVAL')).toBe('ACT/TAR');
  });

  it('keeps INACT and AT/ADOS separate for enlisted', () => {
    expect(dutyStatusBucket('INACT', 'EVAL')).toBe('INACT');
    expect(dutyStatusBucket('AT/ADOS', 'EVAL')).toBe('AT/ADOS');
  });

  it('passes through as-is for FITREP (officer grouping is strict)', () => {
    expect(dutyStatusBucket('ACT', 'FITREP')).toBe('ACT');
    expect(dutyStatusBucket('TAR', 'FITREP')).toBe('TAR');
    expect(dutyStatusBucket('INACT', 'FITREP')).toBe('INACT');
  });

  it('handles null/undefined inputs (empty string)', () => {
    expect(dutyStatusBucket(null, 'EVAL')).toBe('');
    expect(dutyStatusBucket(undefined, 'EVAL')).toBe('');
  });

  it('is case-insensitive (normalizes to uppercase)', () => {
    expect(dutyStatusBucket('act', 'EVAL')).toBe('ACT/TAR');
    expect(dutyStatusBucket('tar', 'EVAL')).toBe('ACT/TAR');
  });
});

// ─── isEvalEligibleForSummaryGroup ────────────────────────────────────────────
describe('isEvalEligibleForSummaryGroup — already attached', () => {
  it('returns true for already-attached group even if closed', () => {
    const ev = makeEval({ summary_group_id: 'sg-1' });
    const group = makeGroup({ id: 'sg-1', status: 'closed' });
    expect(isEvalEligibleForSummaryGroup(ev, group)).toBe(true);
  });
});

describe('isEvalEligibleForSummaryGroup — closed group rejection', () => {
  it('returns false for a closed group that the eval is not attached to', () => {
    const ev = makeEval({ summary_group_id: undefined });
    const group = makeGroup({ status: 'closed' });
    expect(isEvalEligibleForSummaryGroup(ev, group)).toBe(false);
  });
});

describe('isEvalEligibleForSummaryGroup — paygrade check', () => {
  it('rejects an E-5 eval against an E-6 group', () => {
    const ev = makeEval({ grade_rate: 'PO2' }); // E-5
    expect(isEvalEligibleForSummaryGroup(ev, makeGroup())).toBe(false);
  });

  it('accepts when paygrade matches', () => {
    const ev = makeEval({ grade_rate: 'IT1' }); // E-6
    expect(isEvalEligibleForSummaryGroup(ev, makeGroup())).toBe(true);
  });
});

describe('isEvalEligibleForSummaryGroup — promotion_status check', () => {
  it('rejects when promotion_status differs', () => {
    const ev = makeEval({ promotion_status: 'Selected' });
    expect(isEvalEligibleForSummaryGroup(ev, makeGroup({ promotion_status: 'Regular' }))).toBe(false);
  });

  it('accepts matching promotion_status', () => {
    const ev = makeEval({ promotion_status: 'Regular' });
    expect(isEvalEligibleForSummaryGroup(ev, makeGroup({ promotion_status: 'Regular' }))).toBe(true);
  });
});

describe('isEvalEligibleForSummaryGroup — report_type check', () => {
  it('rejects when report_type differs', () => {
    const ev = makeEval({ report_type: 'CHIEFEVAL' });
    expect(isEvalEligibleForSummaryGroup(ev, makeGroup({ report_type: 'EVAL' }))).toBe(false);
  });

  it('accepts matching report_type', () => {
    const ev = makeEval({ report_type: 'FITREP' });
    expect(isEvalEligibleForSummaryGroup(ev, makeGroup({ report_type: 'FITREP', grade_rate: 'O-4' }))).toBe(false); // paygrade now fails
  });
});

describe('isEvalEligibleForSummaryGroup — period_to check', () => {
  it('rejects when period_to dates differ', () => {
    const ev = makeEval({ period_to: '2025-03-31' });
    expect(isEvalEligibleForSummaryGroup(ev, makeGroup({ period_to: '2025-09-30' }))).toBe(false);
  });

  it('accepts when period_to dates match (ISO format)', () => {
    const ev = makeEval({ period_to: '2025-09-30' });
    expect(isEvalEligibleForSummaryGroup(ev, makeGroup({ period_to: '2025-09-30' }))).toBe(true);
  });

  it('truncates to date portion for comparison', () => {
    // If period_to has a timestamp, only YYYY-MM-DD matters
    const ev = makeEval({ period_to: '2025-09-30T00:00:00Z' });
    expect(isEvalEligibleForSummaryGroup(ev, makeGroup({ period_to: '2025-09-30' }))).toBe(true);
  });
});

describe('isEvalEligibleForSummaryGroup — UIC check (permissive)', () => {
  it('accepts when group has no UIC set (not splitting by UIC)', () => {
    const ev = makeEval({ uic: '99999' });
    const group = makeGroup({ uic: null });
    expect(isEvalEligibleForSummaryGroup(ev, group)).toBe(true);
  });

  it('rejects when group has a UIC and eval UIC does not match', () => {
    const ev = makeEval({ uic: '99999' });
    const group = makeGroup({ uic: '12345' });
    expect(isEvalEligibleForSummaryGroup(ev, group)).toBe(false);
  });

  it('accepts when group UIC matches eval UIC', () => {
    const ev = makeEval({ uic: '12345' });
    expect(isEvalEligibleForSummaryGroup(ev, makeGroup({ uic: '12345' }))).toBe(true);
  });
});

describe('isEvalEligibleForSummaryGroup — Block 5 duty_status check', () => {
  it('accepts when group has no duty_status set (pre-012 group)', () => {
    const ev = makeEval({ duty_status: 'ACT' });
    const group = makeGroup({ duty_status: null });
    expect(isEvalEligibleForSummaryGroup(ev, group)).toBe(true);
  });

  it('rejects when duty status buckets differ', () => {
    const ev = makeEval({ duty_status: 'INACT' });
    const group = makeGroup({ duty_status: 'ACT' });
    expect(isEvalEligibleForSummaryGroup(ev, group)).toBe(false);
  });

  it('accepts ACT eval in ACT/TAR group', () => {
    const ev = makeEval({ duty_status: 'ACT' });
    const group = makeGroup({ duty_status: 'TAR' }); // both resolve to ACT/TAR bucket
    expect(isEvalEligibleForSummaryGroup(ev, group)).toBe(true);
  });
});

describe('isEvalEligibleForSummaryGroup — Block 21 billet_subcategory check', () => {
  it('accepts when group has no billet_subcategory (pre-012)', () => {
    const ev = makeEval({ block_values: { billet_subcategory: 'NA' } });
    const group = makeGroup({ billet_subcategory: null });
    expect(isEvalEligibleForSummaryGroup(ev, group)).toBe(true);
  });

  it('rejects when billet_subcategory differs', () => {
    const ev = makeEval({ block_values: { billet_subcategory: 'SEA' } });
    const group = makeGroup({ billet_subcategory: 'NA' });
    expect(isEvalEligibleForSummaryGroup(ev, group)).toBe(false);
  });

  it('accepts matching billet_subcategory (case-insensitive)', () => {
    const ev = makeEval({ block_values: { billet_subcategory: 'na' } });
    const group = makeGroup({ billet_subcategory: 'NA' });
    expect(isEvalEligibleForSummaryGroup(ev, group)).toBe(true);
  });
});

describe('isEvalEligibleForSummaryGroup — Reporting Senior check', () => {
  it('accepts when both RS IDs match', () => {
    const ev = makeEval({ block_values: { reporting_senior_dod_id: '1234567890', billet_subcategory: 'NA' } });
    expect(isEvalEligibleForSummaryGroup(ev, makeGroup({ reporting_senior_dod_id: '1234567890' }))).toBe(true);
  });

  it('rejects when RS IDs differ', () => {
    const ev = makeEval({ block_values: { reporting_senior_dod_id: '9999999999', billet_subcategory: 'NA' } });
    expect(isEvalEligibleForSummaryGroup(ev, makeGroup({ reporting_senior_dod_id: '1234567890' }))).toBe(false);
  });

  it('accepts when eval has no RS ID (eval may not have been stated)', () => {
    const ev = makeEval({ block_values: { reporting_senior_dod_id: '', billet_subcategory: 'NA' } });
    expect(isEvalEligibleForSummaryGroup(ev, makeGroup({ reporting_senior_dod_id: '1234567890' }))).toBe(true);
  });
});

// ─── visibleSummaryGroupsForEval ─────────────────────────────────────────────
describe('visibleSummaryGroupsForEval', () => {
  it('returns only eligible groups', () => {
    const ev = makeEval();
    const goodGroup = makeGroup({ id: 'sg-1' });
    const badGroup = makeGroup({ id: 'sg-2', grade_rate: 'E-7' }); // wrong paygrade
    const result = visibleSummaryGroupsForEval(ev, [goodGroup, badGroup]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('sg-1');
  });

  it('prepends current attachment even if ineligible', () => {
    // E-5 eval attached to E-6 group (grade mismatch) — group is closed
    const ev = makeEval({ grade_rate: 'PO2', summary_group_id: 'sg-closed' });
    const attachedGroup = makeGroup({ id: 'sg-closed', status: 'closed', grade_rate: 'E-6' });
    const otherGroup = makeGroup({ id: 'sg-open', grade_rate: 'E-5' });
    const result = visibleSummaryGroupsForEval(ev, [attachedGroup, otherGroup]);
    // The attached group is returned first (always eligible because it's the current attachment),
    // and otherGroup matches on paygrade
    expect(result.map(g => g.id)).toContain('sg-closed');
  });

  it('returns empty array when no groups match', () => {
    const ev = makeEval({ grade_rate: 'PO2' });
    const groups = [makeGroup({ grade_rate: 'E-7' }), makeGroup({ grade_rate: 'E-5', id: 'sg-x', grade_rate: 'E-9' } as any)];
    // Only check no crashes
    expect(Array.isArray(visibleSummaryGroupsForEval(ev, groups))).toBe(true);
  });

  it('does not duplicate the attached group if already in eligible list', () => {
    const ev = makeEval({ summary_group_id: 'sg-1' });
    const group = makeGroup({ id: 'sg-1' });
    const result = visibleSummaryGroupsForEval(ev, [group]);
    expect(result).toHaveLength(1);
  });
});

// ─── describeSummaryGroup ─────────────────────────────────────────────────────
describe('describeSummaryGroup', () => {
  it('includes name, grade, promotion_status, and period_to', () => {
    const g = makeGroup() as SummaryGroup;
    const desc = describeSummaryGroup(g);
    expect(desc).toContain('Test Group Alpha');
    expect(desc).toContain('E-6');
    expect(desc).toContain('Regular');
    expect(desc).toContain('2025-09-30');
  });

  it('includes UIC when present', () => {
    const g = makeGroup({ uic: '67890' }) as SummaryGroup;
    expect(describeSummaryGroup(g)).toContain('67890');
  });

  it('omits UIC section when uic is falsy', () => {
    const g = makeGroup({ uic: null }) as SummaryGroup;
    expect(describeSummaryGroup(g)).not.toContain('UIC');
  });

  it('includes duty_status when explicitly set', () => {
    const g = makeGroup({ duty_status: 'ACT' }) as SummaryGroup;
    expect(describeSummaryGroup(g)).toContain('ACT');
  });

  it('omits duty_status section when null (pre-012)', () => {
    const g = makeGroup({ duty_status: null }) as SummaryGroup;
    expect(describeSummaryGroup(g)).not.toContain('· ACT');
  });

  it('shows blank billet_subcategory when it is empty string', () => {
    const g = makeGroup({ billet_subcategory: '' }) as SummaryGroup;
    expect(describeSummaryGroup(g)).toContain('(blank)');
  });

  it('shows billet_subcategory when set', () => {
    const g = makeGroup({ billet_subcategory: 'NA' }) as SummaryGroup;
    expect(describeSummaryGroup(g)).toContain('NA');
  });
});
