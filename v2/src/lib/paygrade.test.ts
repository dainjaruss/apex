// src/lib/paygrade.test.ts
// 100% coverage for paygrade.ts — canonical paygrade normalization used by
// forced distribution and summary-group eligibility.

import { describe, it, expect } from 'vitest';
import { paygradeOf, samePaygrade } from './paygrade';

// ─── paygradeOf ─────────────────────────────────────────────────────────────
describe('paygradeOf — null/empty inputs', () => {
  it('returns null for null', () => expect(paygradeOf(null)).toBeNull());
  it('returns null for undefined', () => expect(paygradeOf(undefined)).toBeNull());
  it('returns null for empty string', () => expect(paygradeOf('')).toBeNull());
  it('returns null for whitespace only', () => expect(paygradeOf('   ')).toBeNull());
});

describe('paygradeOf — canonical registration codes (RANK_CODE_TO_PAYGRADE)', () => {
  const cases: [string, string][] = [
    ['SR', 'E-1'], ['SA', 'E-2'], ['SN', 'E-3'],
    ['PO3', 'E-4'], ['PO2', 'E-5'], ['PO1', 'E-6'],
    ['CPO', 'E-7'], ['SCPO', 'E-8'], ['MCPO', 'E-9'],
    ['WO2', 'W-2'], ['WO3', 'W-3'], ['WO4', 'W-4'], ['WO5', 'W-5'],
    ['ENS', 'O-1'], ['LTJG', 'O-2'], ['LT', 'O-3'],
    ['LCDR', 'O-4'], ['CDR', 'O-5'], ['CAPT', 'O-6'],
  ];
  for (const [input, expected] of cases) {
    it(`'${input}' → '${expected}'`, () => expect(paygradeOf(input)).toBe(expected));
  }

  it('is case-insensitive — po1 → E-6', () => expect(paygradeOf('po1')).toBe('E-6'));
  it('is case-insensitive — cpo → E-7', () => expect(paygradeOf('cpo')).toBe('E-7'));
});

describe('paygradeOf — explicit paygrade tokens', () => {
  const cases: [string, string][] = [
    ['E-1', 'E-1'], ['E-6', 'E-6'], ['E6', 'E-6'],
    ['W-3', 'W-3'], ['W3', 'W-3'],
    ['O-4', 'O-4'], ['O4', 'O-4'],
    ['PO1 (E-6)', 'E-6'], // parenthetical common in Reporting Senior fields
    ['O-5 (CDR)', 'O-5'],
  ];
  for (const [input, expected] of cases) {
    it(`'${input}' → '${expected}'`, () => expect(paygradeOf(input)).toBe(expected));
  }
});

describe('paygradeOf — warrant officer abbreviations (CWO / WO)', () => {
  const cases: [string, string][] = [
    ['CWO2', 'W-2'], ['CWO3', 'W-3'], ['CWO4', 'W-4'], ['CWO5', 'W-5'],
    ['WO1', 'W-1'],
    ['CW03', 'W-3'], // 0/O ambiguity common in free text
    ['CWO 3', 'W-3'], // spaced variant
  ];
  for (const [input, expected] of cases) {
    it(`'${input}' → '${expected}'`, () => expect(paygradeOf(input)).toBe(expected));
  }

  it('does NOT match AWO1 (E-6 Naval Aircrewman) as a warrant', () => {
    expect(paygradeOf('AWO1')).toBe('E-6'); // trailing 1 → E-6 via petty officer rule
  });
});

describe('paygradeOf — full enlisted rating abbreviations', () => {
  // Chief variants
  it('HMC → E-7', () => expect(paygradeOf('HMC')).toBe('E-7'));
  it('HMCS → E-8', () => expect(paygradeOf('HMCS')).toBe('E-8'));
  it('HMCM → E-9', () => expect(paygradeOf('HMCM')).toBe('E-9'));

  // Petty officer suffix digits
  it('IT1 → E-6', () => expect(paygradeOf('IT1')).toBe('E-6'));
  it('BM2 → E-5', () => expect(paygradeOf('BM2')).toBe('E-5'));
  it('OS3 → E-4', () => expect(paygradeOf('OS3')).toBe('E-4'));
  it('EM1 → E-6', () => expect(paygradeOf('EM1')).toBe('E-6'));

  // Apprentice families
  it('SR (Seaman Recruit) → E-1 (via canonical code)', () => expect(paygradeOf('SR')).toBe('E-1'));
  it('FN (Fireman) → E-3', () => expect(paygradeOf('FN')).toBe('E-3'));
  it('AR (Airman Recruit) → E-1', () => expect(paygradeOf('AR')).toBe('E-1'));
  it('AA (Airman Apprentice) → E-2', () => expect(paygradeOf('AA')).toBe('E-2'));
  it('AN (Airman) → E-3', () => expect(paygradeOf('AN')).toBe('E-3'));
  it('FA (Fireman Apprentice) → E-2', () => expect(paygradeOf('FA')).toBe('E-2'));
});

describe('paygradeOf — unresolvable inputs return null', () => {
  it('random word', () => expect(paygradeOf('CAPTAIN')).toBeNull());
  it('number string', () => expect(paygradeOf('1234')).toBeNull());
  it('officer designator alone', () => expect(paygradeOf('1320')).toBeNull());
});

// ─── samePaygrade ────────────────────────────────────────────────────────────
describe('samePaygrade', () => {
  it('returns true when both resolve to the same grade', () => {
    expect(samePaygrade('PO1', 'E-6')).toBe(true);
    expect(samePaygrade('IT1', 'PO1')).toBe(true);
    expect(samePaygrade('CPO', 'E-7')).toBe(true);
  });

  it('returns false when grades differ', () => {
    expect(samePaygrade('PO1', 'PO2')).toBe(false);
    expect(samePaygrade('E-6', 'E-5')).toBe(false);
  });

  it('returns false when either grade is null/undefined/unresolvable', () => {
    expect(samePaygrade(null, 'E-6')).toBe(false);
    expect(samePaygrade('E-6', null)).toBe(false);
    expect(samePaygrade(null, null)).toBe(false);
    expect(samePaygrade('UNKNOWN', 'E-6')).toBe(false);
  });
});
