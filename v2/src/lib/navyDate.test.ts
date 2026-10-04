// src/lib/navyDate.test.ts
// 100% coverage for navyDate.ts — ISO date → YYMMMDD formatter.

import { describe, it, expect } from 'vitest';
import { formatNavpersDate } from './navyDate';

describe('formatNavpersDate', () => {
  it('returns empty string for undefined/null/empty', () => {
    expect(formatNavpersDate(undefined)).toBe('');
    expect(formatNavpersDate('')).toBe('');
  });

  it('converts ISO date to YYMMMDD format', () => {
    expect(formatNavpersDate('2025-07-17')).toBe('25JUL17');
    expect(formatNavpersDate('2024-01-01')).toBe('24JAN01');
    expect(formatNavpersDate('2024-12-31')).toBe('24DEC31');
    expect(formatNavpersDate('2025-03-05')).toBe('25MAR05');
  });

  it('handles all twelve months', () => {
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      expect(formatNavpersDate(`2025-${mm}-15`)).toBe(`25${months[m-1]}15`);
    }
  });

  it('passes through non-ISO strings uppercased', () => {
    expect(formatNavpersDate('NOT REQ')).toBe('NOT REQ');
    expect(formatNavpersDate('not req')).toBe('NOT REQ');
    expect(formatNavpersDate('NOT PERF')).toBe('NOT PERF');
    expect(formatNavpersDate('25JUL17')).toBe('25JUL17'); // already YYMMMDD
  });

  it('passes through out-of-range month verbatim (does not interpolate "undefined")', () => {
    // Month 00 or 13 — out-of-range, falls through to passthrough
    const result = formatNavpersDate('2025-00-15');
    expect(result).toBe('2025-00-15');
    const result2 = formatNavpersDate('2025-13-15');
    expect(result2).toBe('2025-13-15');
  });

  it('handles century boundary (year 2000)', () => {
    expect(formatNavpersDate('2000-06-15')).toBe('00JUN15');
  });
});
