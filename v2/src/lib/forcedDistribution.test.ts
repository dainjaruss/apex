// src/lib/forcedDistribution.test.ts
// 100% coverage for forcedDistribution.ts — BUPERSINST 1610.10H Table 1-2 quota math.

import { describe, it, expect } from 'vitest';
import {
  earlyPromoteMax,
  tallyRecommendations,
  checkForcedDistribution,
  emptyDistribution,
  OBSERVED_RECS,
} from './forcedDistribution';
import type { RecDistribution } from './forcedDistribution';

// ─── earlyPromoteMax ─────────────────────────────────────────────────────────
describe('earlyPromoteMax', () => {
  it('returns 0 for N=0', () => expect(earlyPromoteMax(0)).toBe(0));
  it('returns 1 for N=1 (whole group can be EP)', () => expect(earlyPromoteMax(1)).toBe(1));
  it('returns 1 for N=2 (ceil(0.2*2)=1)', () => expect(earlyPromoteMax(2)).toBe(1));
  it('returns 1 for N=5 (ceil(0.2*5)=1)', () => expect(earlyPromoteMax(5)).toBe(1));
  it('returns 2 for N=6 (ceil(0.2*6)=2)', () => expect(earlyPromoteMax(6)).toBe(2));
  it('returns 2 for N=10', () => expect(earlyPromoteMax(10)).toBe(2));
  it('returns 3 for N=11', () => expect(earlyPromoteMax(11)).toBe(3));
  it('returns 4 for N=20', () => expect(earlyPromoteMax(20)).toBe(4));
  it('returns 10 for N=50', () => expect(earlyPromoteMax(50)).toBe(10));
});

// ─── emptyDistribution ──────────────────────────────────────────────────────
describe('emptyDistribution', () => {
  it('returns all-zero for every observed rec', () => {
    const d = emptyDistribution();
    for (const k of OBSERVED_RECS) {
      expect(d[k]).toBe(0);
    }
  });
});

// ─── tallyRecommendations ────────────────────────────────────────────────────
describe('tallyRecommendations', () => {
  it('counts a representative mixed group', () => {
    const { distribution, observedCount } = tallyRecommendations([
      'Early Promote', 'Must Promote', 'Must Promote', 'Promotable', 'Progressing', null, undefined, 'NOB', '',
    ]);
    expect(observedCount).toBe(5);
    expect(distribution['Early Promote']).toBe(1);
    expect(distribution['Must Promote']).toBe(2);
    expect(distribution['Promotable']).toBe(1);
    expect(distribution['Progressing']).toBe(1);
    expect(distribution['Significant Problems']).toBe(0);
  });

  it('skips null, undefined, empty, and NOB entries', () => {
    const { observedCount } = tallyRecommendations([null, undefined, '', 'NOB', 'nob']);
    expect(observedCount).toBe(0); // "nob" lowercase is not in OBSERVED_RECS either
  });

  it('counts Significant Problems', () => {
    const { distribution } = tallyRecommendations(['Significant Problems', 'Significant Problems']);
    expect(distribution['Significant Problems']).toBe(2);
  });

  it('returns an empty distribution for an empty array', () => {
    const { distribution, observedCount } = tallyRecommendations([]);
    expect(observedCount).toBe(0);
    for (const k of OBSERVED_RECS) expect(distribution[k]).toBe(0);
  });
});

// ─── checkForcedDistribution ────────────────────────────────────────────────

function dist(ep: number, mp: number, p: number = 0, pr: number = 0, sp: number = 0): RecDistribution {
  return {
    'Early Promote': ep,
    'Must Promote': mp,
    Promotable: p,
    Progressing: pr,
    'Significant Problems': sp,
  };
}

describe('checkForcedDistribution — EP quota', () => {
  it('is compliant when EP ≤ ceil(0.2·N)', () => {
    // N=10: epMax=2; EP=2 → ok
    const r = checkForcedDistribution(dist(2, 0, 3, 3, 2));
    expect(r.compliant).toBe(true);
    expect(r.violations).toHaveLength(0);
  });

  it('flags a violation when EP > ceil(0.2·N)', () => {
    // N=10: epMax=2; EP=3 → violation
    const r = checkForcedDistribution(dist(3, 0, 3, 2, 2));
    expect(r.compliant).toBe(false);
    expect(r.violations.some(v => v.category === 'Early Promote')).toBe(true);
  });

  it('computes earlyPromoteMax and observedCount correctly', () => {
    // 5 observed (1 EP, 2 MP, 2 P): epMax = ceil(5*0.2) = 1
    const r = checkForcedDistribution(dist(1, 2, 2));
    expect(r.earlyPromoteMax).toBe(1);
    expect(r.observedCount).toBe(5);
    expect(r.compliant).toBe(true);
  });
});

describe('checkForcedDistribution — combined EP+MP cap by paygrade', () => {
  it('E-5 (60% combined cap): N=10, EP=1, MP=5 → 6/10=60% → compliant', () => {
    const r = checkForcedDistribution(dist(1, 5, 4), 'PO2');
    expect(r.paygrade).toBe('E-5');
    expect(r.combinedCapPct).toBe(0.6);
    expect(r.combinedMax).toBe(6);
    expect(r.compliant).toBe(true);
  });

  it('E-5 (60% combined cap): N=10, EP=2, MP=5 → 7/10=70% → violation', () => {
    const r = checkForcedDistribution(dist(2, 5, 3), 'PO2');
    expect(r.compliant).toBe(false);
    expect(r.violations.some(v => v.category === 'Must Promote (combined)')).toBe(true);
  });

  it('E-7 (50% combined cap): N=10, EP=2, MP=3 → 5/10=50% → compliant', () => {
    const r = checkForcedDistribution(dist(2, 3, 5), 'CPO');
    expect(r.paygrade).toBe('E-7');
    expect(r.combinedMax).toBe(5);
    expect(r.compliant).toBe(true);
  });

  it('E-7 (50% combined cap): N=10, EP=2, MP=4 → 6/10=60% → violation', () => {
    const r = checkForcedDistribution(dist(2, 4, 4), 'CPO');
    expect(r.compliant).toBe(false);
  });

  it('O-3 (60% combined cap): N=5, EP=1, MP=2 → 3/5=60% → compliant', () => {
    const r = checkForcedDistribution(dist(1, 2, 2), 'LT');
    expect(r.paygrade).toBe('O-3');
    expect(r.combinedCapPct).toBe(0.6);
    expect(r.compliant).toBe(true);
  });

  it('O-5 (40% combined cap): N=10, EP=2, MP=3 → 5/10=50% → violation', () => {
    const r = checkForcedDistribution(dist(2, 3, 5), 'CDR');
    expect(r.paygrade).toBe('O-5');
    expect(r.combinedCapPct).toBe(0.4);
    expect(r.compliant).toBe(false);
  });

  it('E-1 through E-4 have no combined cap (null)', () => {
    for (const grade of ['SR', 'SA', 'SN', 'PO3']) {
      const r = checkForcedDistribution(dist(3, 10, 5), grade);
      expect(r.combinedCapPct).toBeNull();
      expect(r.combinedMax).toBeNull();
      // Only EP violation possible
      const epViolation = r.violations.find(v => v.category === 'Early Promote');
      const combinedViolation = r.violations.find(v => v.category === 'Must Promote (combined)');
      expect(combinedViolation).toBeUndefined();
    }
  });
});

describe('checkForcedDistribution — Table 1-2 Note 1: group of 2', () => {
  it('N=2: combinedMax forced to 2 for 50% tiers, allowing both EP and MP', () => {
    // E-7 50% band: ceil(2*0.5)=1 normally, but Note 1 overrides to 2
    const r = checkForcedDistribution(dist(1, 1), 'CPO');
    expect(r.observedCount).toBe(2);
    expect(r.combinedMax).toBe(2);
    expect(r.compliant).toBe(true);
  });
});

describe('checkForcedDistribution — unknown/unresolvable grade', () => {
  it('returns paygrade=null and no combined cap for an unresolvable rate', () => {
    const r = checkForcedDistribution(dist(1, 1, 1), 'UNKNOWNRATE');
    expect(r.paygrade).toBeNull();
    expect(r.combinedCapPct).toBeNull();
    expect(r.combinedMax).toBeNull();
  });

  it('returns paygrade=null for undefined grade', () => {
    const r = checkForcedDistribution(dist(1, 1, 1), undefined);
    expect(r.paygrade).toBeNull();
  });
});

describe('checkForcedDistribution — multiple violations', () => {
  it('can emit both EP and combined violations simultaneously', () => {
    // N=10, grade E-5 (60% cap): EP=5 (>2), combined=5+2=7 (>6)
    const r = checkForcedDistribution(dist(5, 2, 3), 'PO2');
    expect(r.compliant).toBe(false);
    expect(r.violations).toHaveLength(2);
    expect(r.violations[0].category).toBe('Early Promote');
    expect(r.violations[1].category).toBe('Must Promote (combined)');
  });
});

describe('checkForcedDistribution — violation message content', () => {
  it('includes relevant values in the Early Promote violation message', () => {
    const r = checkForcedDistribution(dist(5, 0, 0, 0, 0), 'PO1'); // N=5, epMax=1
    const v = r.violations.find(x => x.category === 'Early Promote')!;
    expect(v.count).toBe(5);
    expect(v.max).toBe(1);
    expect(v.message).toContain('5');
    expect(v.message).toContain('BUPERSINST');
  });
});
