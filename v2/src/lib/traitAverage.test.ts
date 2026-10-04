// src/lib/traitAverage.test.ts
// 100% coverage for traitAverage.ts — the authoritative Block 40 / Block 50a math.

import { describe, it, expect } from 'vitest';
import {
  round2,
  computeTraitAverage,
  computeSummaryGroupAverage,
  TRAIT_KEYS,
} from './traitAverage';

// ─── round2 ─────────────────────────────────────────────────────────────────
describe('round2', () => {
  it('rounds exactly half-up (away from zero)', () => {
    // 4.005 in IEEE 754 = 4.005000000000000071..., so Math.round gives 4.01
    expect(round2(4.005)).toBe(4.01);
    // Use a value whose true IEEE 754 representation is ≥ X.YZ5 so rounding is deterministic
    expect(round2(3.145)).toBe(3.15);
  });

  it('rounds a whole number to itself', () => {
    expect(round2(5)).toBe(5);
    expect(round2(0)).toBe(0);
  });

  it('handles two-decimal inputs correctly', () => {
    expect(round2(3.14)).toBe(3.14);
    expect(round2(3.146)).toBe(3.15);
    expect(round2(3.144)).toBe(3.14);
  });

  it('handles negative numbers', () => {
    expect(round2(-3.145)).toBe(-3.14); // half-up toward zero
    expect(round2(-0.005)).toBe(-0); // borderline
  });
});

// ─── computeTraitAverage ────────────────────────────────────────────────────
describe('computeTraitAverage', () => {
  it('returns null average for null/undefined input', () => {
    expect(computeTraitAverage(null)).toEqual({ average: null, gradedCount: 0, gradedSum: 0 });
    expect(computeTraitAverage(undefined)).toEqual({ average: null, gradedCount: 0, gradedSum: 0 });
    expect(computeTraitAverage({})).toEqual({ average: null, gradedCount: 0, gradedSum: 0 });
  });

  it('returns null average for a fully-NOB report', () => {
    const nob: Record<string, string> = {};
    for (const k of TRAIT_KEYS) nob[k] = 'NOB';
    expect(computeTraitAverage(nob)).toEqual({ average: null, gradedCount: 0, gradedSum: 0 });
  });

  it('accepts case-insensitive NOB', () => {
    expect(computeTraitAverage({ knowledge: 'nob', work: 'Nob' })).toEqual({
      average: null,
      gradedCount: 0,
      gradedSum: 0,
    });
  });

  it('computes a perfect 5.0 for all-5 enlisted EVAL traits', () => {
    const grades: Record<string, string> = {
      knowledge: '5.0',
      work: '5.0',
      eo: '5.0',
      bearing: '5.0',
      accomplishment: '5.0',
      teamwork: '5.0',
      leadership: '5.0',
    };
    const r = computeTraitAverage(grades);
    expect(r.average).toBe(5);
    expect(r.gradedCount).toBe(7);
    expect(r.gradedSum).toBe(35);
  });

  it('excludes NOB traits from sum and count', () => {
    const grades: Record<string, string> = {
      knowledge: '4.0',
      work: 'NOB',
      eo: '4.0',
      bearing: 'NOB',
      accomplishment: '4.0',
      teamwork: 'NOB',
      leadership: '4.0',
    };
    const r = computeTraitAverage(grades);
    expect(r.gradedCount).toBe(4);
    expect(r.gradedSum).toBe(16);
    expect(r.average).toBe(4);
  });

  it('excludes blank trait values', () => {
    const grades: Record<string, string> = {
      knowledge: '4.0',
      work: '',
      eo: '3.0',
    };
    const r = computeTraitAverage(grades);
    expect(r.gradedCount).toBe(2);
    expect(r.average).toBe(3.5);
  });

  it('rounds to 2 decimal places — the sample eval ITA', () => {
    // 4+5+4+4+5+4+5 = 31 / 7 = 4.428... → 4.43
    const grades: Record<string, string> = {
      knowledge: '4.0',
      work: '5.0',
      eo: '4.0',
      bearing: '4.0',
      accomplishment: '5.0',
      teamwork: '4.0',
      leadership: '5.0',
    };
    const r = computeTraitAverage(grades);
    expect(r.average).toBe(4.43);
  });

  it('ignores keys not in TRAIT_KEYS (unknown fields)', () => {
    const grades = { knowledge: '5.0', __custom__: '1.0' };
    const r = computeTraitAverage(grades);
    expect(r.gradedCount).toBe(1);
    expect(r.average).toBe(5);
  });

  it('ignores non-numeric grade strings', () => {
    const grades = { knowledge: 'EXCELLENT', work: '4.0' };
    const r = computeTraitAverage(grades);
    expect(r.gradedCount).toBe(1);
    expect(r.average).toBe(4);
  });

  it('handles chief eval (CHIEFEVAL) trait keys', () => {
    const grades: Record<string, string> = {
      technical_mastery: '5.0',
      institutional_expertise: '4.0',
      professionalism: '5.0',
      integrity: '4.0',
      accountability: '4.0',
      deckplate_leadership: '5.0',
      team_effectiveness: '4.0',
    };
    // 5+4+5+4+4+5+4 = 31 / 7 = 4.43
    const r = computeTraitAverage(grades);
    expect(r.gradedCount).toBe(7);
    expect(r.average).toBe(4.43);
  });

  it('handles a single graded trait (N=1)', () => {
    const r = computeTraitAverage({ knowledge: '3.0' });
    expect(r.average).toBe(3);
    expect(r.gradedCount).toBe(1);
    expect(r.gradedSum).toBe(3);
  });
});

// ─── computeSummaryGroupAverage ─────────────────────────────────────────────
describe('computeSummaryGroupAverage', () => {
  it('returns null for an empty member list', () => {
    const r = computeSummaryGroupAverage([]);
    expect(r.average).toBeNull();
    expect(r.memberCount).toBe(0);
    expect(r.gradedTraitCount).toBe(0);
    expect(r.gradedSum).toBe(0);
  });

  it('returns null when all members are fully NOB', () => {
    const nob = { knowledge: 'NOB', work: 'NOB' };
    const r = computeSummaryGroupAverage([nob, nob]);
    expect(r.average).toBeNull();
    expect(r.memberCount).toBe(0);
  });

  it('handles null/undefined member grades entries', () => {
    const valid = { knowledge: '4.0', work: '4.0' };
    const r = computeSummaryGroupAverage([null, undefined, valid]);
    expect(r.memberCount).toBe(1);
    expect(r.average).toBe(4);
  });

  it('computes pooled average — NOT average of averages', () => {
    // Member A: 7 traits at 5.0 → sum=35, count=7
    // Member B: 7 traits at 3.0 → sum=21, count=7
    // Pooled: 56/14 = 4.0 (not (5+3)/2 = 4 — same here, but test the mechanism)
    const a: Record<string, string> = {};
    const b: Record<string, string> = {};
    for (const k of ['knowledge', 'work', 'eo', 'bearing', 'accomplishment', 'teamwork', 'leadership']) {
      a[k] = '5.0';
      b[k] = '3.0';
    }
    const r = computeSummaryGroupAverage([a, b]);
    expect(r.memberCount).toBe(2);
    expect(r.gradedTraitCount).toBe(14);
    expect(r.gradedSum).toBe(56);
    expect(r.average).toBe(4);
  });

  it('weights members with more graded traits proportionally more', () => {
    // Member A: 7 traits at 5.0 → sum=35, count=7
    // Member B: 1 trait at 1.0  → sum=1,  count=1
    // Pooled: 36/8 = 4.5  (NOT (5+1)/2 = 3)
    const a: Record<string, string> = {
      knowledge: '5.0', work: '5.0', eo: '5.0', bearing: '5.0',
      accomplishment: '5.0', teamwork: '5.0', leadership: '5.0',
    };
    const b: Record<string, string> = { knowledge: '1.0' };
    const r = computeSummaryGroupAverage([a, b]);
    expect(r.memberCount).toBe(2);
    expect(r.gradedTraitCount).toBe(8);
    expect(r.average).toBe(4.5);
  });

  it('excludes wholly-NOB members from memberCount', () => {
    const graded = { knowledge: '4.0' };
    const nob = { knowledge: 'NOB' };
    const r = computeSummaryGroupAverage([graded, nob, graded]);
    expect(r.memberCount).toBe(2);
  });

  it('matches the NAVSEA sample group — 4 members', () => {
    // FRANKLYN 4.43 ITA: 4+5+4+4+5+4+5=31
    // SULU     4.14 ITA: 4+4+4+5+4+4+4=29
    // CHEKOV   3.86 ITA: 4+4+4+3+4+4+4=27
    // SCOTT    4.29 ITA: 5+5+4+4+4+4+4=30
    // Pooled: (31+29+27+30)/(7*4) = 117/28 = 4.178... → 4.18
    const franklyn = { knowledge:'4.0', work:'5.0', eo:'4.0', bearing:'4.0', accomplishment:'5.0', teamwork:'4.0', leadership:'5.0' };
    const sulu     = { knowledge:'4.0', work:'4.0', eo:'4.0', bearing:'5.0', accomplishment:'4.0', teamwork:'4.0', leadership:'4.0' };
    const chekov   = { knowledge:'4.0', work:'4.0', eo:'4.0', bearing:'3.0', accomplishment:'4.0', teamwork:'4.0', leadership:'4.0' };
    const scott    = { knowledge:'5.0', work:'5.0', eo:'4.0', bearing:'4.0', accomplishment:'4.0', teamwork:'4.0', leadership:'4.0' };
    const r = computeSummaryGroupAverage([franklyn, sulu, chekov, scott]);
    expect(r.memberCount).toBe(4);
    expect(r.gradedTraitCount).toBe(28);
    expect(r.gradedSum).toBe(117);
    expect(r.average).toBe(4.18);
  });
});
