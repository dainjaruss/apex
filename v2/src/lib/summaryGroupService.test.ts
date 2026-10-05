// src/lib/summaryGroupService.test.ts
// Tests for the pure computation functions in summaryGroupService.ts.
// IndexedDB-dependent functions (createSummaryGroup, addEvalToSummaryGroup, etc.) are
// integration-tested separately via the real Dexie instance backed by fake-indexeddb.

import { describe, it, expect } from 'vitest';
import { computeSummaryGroupMetrics } from './summaryGroupService';
import type { Evaluation, SummaryGroup } from '@/types';

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeGroup(overrides: Partial<SummaryGroup> = {}): SummaryGroup {
  return {
    id: 'sg-test',
    name: 'Alpha Group',
    reporting_senior_name: 'SMITH, J A',
    period_to: '2025-09-30',
    grade_rate: 'E-6',
    promotion_status: 'Regular',
    report_type: 'EVAL',
    status: 'open',
    member_ids: [],
    ...overrides,
  };
}

function makeEval(overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    id: `eval-${Math.random().toString(36).slice(2)}`,
    report_type: 'EVAL',
    member_name: 'DOE, JOHN A',
    dod_id: '1234567890',
    grade_rate: 'PO1',
    period_from: '2025-01-01',
    period_to: '2025-09-30',
    duty_status: 'ACT',
    uic: '12345',
    ship_station: 'USS TEST',
    promotion_status: 'Regular',
    trait_grades: {
      knowledge: '4.0',
      work: '4.0',
      eo: '4.0',
      bearing: '4.0',
      accomplishment: '4.0',
      teamwork: '4.0',
      leadership: '4.0',
    },
    comments: '',
    career_recommendations: [],
    promotion_recommendation: 'Promotable',
    retention: 'Recommended',
    status: 'draft',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as Evaluation;
}

// ─── computeSummaryGroupMetrics — empty group ─────────────────────────────────
describe('computeSummaryGroupMetrics — empty group', () => {
  it('handles an empty group gracefully', () => {
    const metrics = computeSummaryGroupMetrics(makeGroup(), []);
    expect(metrics.totalMembers).toBe(0);
    expect(metrics.summaryGroupAverage).toBeNull();
    expect(metrics.epLimit).toBe(0);
    expect(metrics.combinedLimit).toBe(0);
    expect(metrics.mpLimit).toBe(0);
    expect(metrics.isEpOverQuota).toBe(false);
    expect(metrics.isCombinedOverQuota).toBe(false);
    expect(metrics.members).toHaveLength(0);
  });
});

// ─── computeSummaryGroupMetrics — SGA calculation ────────────────────────────
describe('computeSummaryGroupMetrics — SGA calculation', () => {
  it('computes the pooled SGA across all members', () => {
    const evals = [
      makeEval({ trait_grades: { knowledge: '5.0', work: '5.0', eo: '5.0', bearing: '5.0', accomplishment: '5.0', teamwork: '5.0', leadership: '5.0' } }),
      makeEval({ trait_grades: { knowledge: '3.0', work: '3.0', eo: '3.0', bearing: '3.0', accomplishment: '3.0', teamwork: '3.0', leadership: '3.0' } }),
    ];
    const metrics = computeSummaryGroupMetrics(makeGroup(), evals);
    expect(metrics.summaryGroupAverage).toBe(4); // (35+21)/14=4.0
    expect(metrics.gradedMembers).toBe(2);
  });

  it('returns null SGA for all-NOB group', () => {
    const evals = [
      makeEval({ trait_grades: { knowledge: 'NOB', work: 'NOB', eo: 'NOB', bearing: 'NOB', accomplishment: 'NOB', teamwork: 'NOB', leadership: 'NOB' } }),
    ];
    const metrics = computeSummaryGroupMetrics(makeGroup(), evals);
    expect(metrics.summaryGroupAverage).toBeNull();
    expect(metrics.gradedMembers).toBe(0);
  });
});

// ─── computeSummaryGroupMetrics — EP/MP quotas ────────────────────────────────
describe('computeSummaryGroupMetrics — EP/MP quota enforcement', () => {
  it('E-6 group (EVAL): 60% combined cap', () => {
    // N=10: epLimit=ceil(2)=2, combinedLimit=ceil(6)=6, mpLimit=4
    const evals = Array.from({ length: 10 }, (_, i) =>
      makeEval({ promotion_recommendation: i < 2 ? 'Early Promote' : i < 6 ? 'Must Promote' : 'Promotable' })
    );
    const metrics = computeSummaryGroupMetrics(makeGroup({ grade_rate: 'E-6', report_type: 'EVAL' }), evals);
    expect(metrics.epLimit).toBe(2);
    expect(metrics.combinedLimit).toBe(6);
    expect(metrics.isEpOverQuota).toBe(false);
    expect(metrics.isCombinedOverQuota).toBe(false);
  });

  it('flags EP over quota correctly', () => {
    // N=5: epLimit=ceil(1)=1; 3 EPs → over quota
    const evals = [
      makeEval({ promotion_recommendation: 'Early Promote' }),
      makeEval({ promotion_recommendation: 'Early Promote' }),
      makeEval({ promotion_recommendation: 'Early Promote' }),
      makeEval({ promotion_recommendation: 'Promotable' }),
      makeEval({ promotion_recommendation: 'Promotable' }),
    ];
    const metrics = computeSummaryGroupMetrics(makeGroup(), evals);
    expect(metrics.isEpOverQuota).toBe(true);
    expect(metrics.counts.ep).toBe(3);
  });

  it('CHIEFEVAL group: 50% combined cap', () => {
    // N=10: epLimit=2, combinedLimit=5
    const evals = Array.from({ length: 10 }, (_, i) =>
      makeEval({ promotion_recommendation: i < 2 ? 'Early Promote' : i < 7 ? 'Must Promote' : 'Promotable' })
    );
    const metrics = computeSummaryGroupMetrics(
      makeGroup({ grade_rate: 'E-7', report_type: 'CHIEFEVAL' }), evals
    );
    expect(metrics.isCombinedOverQuota).toBe(true); // 2+5=7 > 5
  });

  it('flags combined EP+MP over quota', () => {
    const evals = [
      makeEval({ promotion_recommendation: 'Early Promote' }),
      makeEval({ promotion_recommendation: 'Must Promote' }),
      makeEval({ promotion_recommendation: 'Must Promote' }),
      makeEval({ promotion_recommendation: 'Must Promote' }),
      makeEval({ promotion_recommendation: 'Promotable' }),
    ];
    // N=5, E-6 (EVAL, 60%), combinedLimit = ceil(5*0.6)=3; EP+MP=4 > 3
    const metrics = computeSummaryGroupMetrics(makeGroup(), evals);
    expect(metrics.isCombinedOverQuota).toBe(true);
  });
});

// ─── computeSummaryGroupMetrics — rec tallying ───────────────────────────────
describe('computeSummaryGroupMetrics — recommendation tallying', () => {
  it('counts all recommendation categories including NOB', () => {
    const evals = [
      makeEval({ promotion_recommendation: 'Early Promote' }),
      makeEval({ promotion_recommendation: 'Must Promote' }),
      makeEval({ promotion_recommendation: 'Promotable' }),
      makeEval({ promotion_recommendation: 'Progressing' }),
      makeEval({ promotion_recommendation: 'Significant Problems' }),
      makeEval({ promotion_recommendation: 'NOB' }),
    ];
    const metrics = computeSummaryGroupMetrics(makeGroup(), evals);
    expect(metrics.counts.ep).toBe(1);
    expect(metrics.counts.mp).toBe(1);
    expect(metrics.counts.p).toBe(1);
    expect(metrics.counts.prog).toBe(1);
    expect(metrics.counts.sp).toBe(1);
    expect(metrics.counts.nob).toBe(1);
    expect(metrics.totalMembers).toBe(6);
  });
});

// ─── computeSummaryGroupMetrics — member ranking ─────────────────────────────
describe('computeSummaryGroupMetrics — member ranking', () => {
  it('ranks members by ITA descending', () => {
    const high = makeEval({ id: 'high', trait_grades: { knowledge: '5.0', work: '5.0', eo: '5.0', bearing: '5.0', accomplishment: '5.0', teamwork: '5.0', leadership: '5.0' } });
    const low  = makeEval({ id: 'low',  trait_grades: { knowledge: '3.0', work: '3.0', eo: '3.0', bearing: '3.0', accomplishment: '3.0', teamwork: '3.0', leadership: '3.0' } });
    const mid  = makeEval({ id: 'mid',  trait_grades: { knowledge: '4.0', work: '4.0', eo: '4.0', bearing: '4.0', accomplishment: '4.0', teamwork: '4.0', leadership: '4.0' } });

    const metrics = computeSummaryGroupMetrics(makeGroup(), [low, mid, high]);
    expect(metrics.members[0].evaluation.id).toBe('high');
    expect(metrics.members[1].evaluation.id).toBe('mid');
    expect(metrics.members[2].evaluation.id).toBe('low');
    expect(metrics.members[0].rank).toBe(1);
    expect(metrics.members[2].rank).toBe(3);
  });

  it('computes deltaSga relative to the group SGA', () => {
    const ev1 = makeEval({ id: 'ev1', trait_grades: { knowledge: '5.0', work: '5.0', eo: '5.0', bearing: '5.0', accomplishment: '5.0', teamwork: '5.0', leadership: '5.0' } }); // ITA=5
    const ev2 = makeEval({ id: 'ev2', trait_grades: { knowledge: '3.0', work: '3.0', eo: '3.0', bearing: '3.0', accomplishment: '3.0', teamwork: '3.0', leadership: '3.0' } }); // ITA=3
    // SGA = (35+21)/14 = 4.0
    const metrics = computeSummaryGroupMetrics(makeGroup(), [ev1, ev2]);
    const top = metrics.members.find(m => m.evaluation.id === 'ev1')!;
    const bot = metrics.members.find(m => m.evaluation.id === 'ev2')!;
    expect(top.deltaSga).toBe(1);   // 5-4=1
    expect(bot.deltaSga).toBe(-1);  // 3-4=-1
  });

  it('places null-ITA members at the bottom', () => {
    const graded = makeEval({ id: 'graded', trait_grades: { knowledge: '4.0', work: '4.0', eo: '4.0', bearing: '4.0', accomplishment: '4.0', teamwork: '4.0', leadership: '4.0' } });
    const nob    = makeEval({ id: 'nob',    trait_grades: { knowledge: 'NOB', work: 'NOB', eo: 'NOB', bearing: 'NOB', accomplishment: 'NOB', teamwork: 'NOB', leadership: 'NOB' } });
    const metrics = computeSummaryGroupMetrics(makeGroup(), [graded, nob]);
    expect(metrics.members[0].evaluation.id).toBe('graded');
    expect(metrics.members[1].evaluation.id).toBe('nob');
    expect(metrics.members[1].ita).toBeNull();
    expect(metrics.members[1].deltaSga).toBeNull();
  });
});

// ─── computeSummaryGroupMetrics — RSCA projection ────────────────────────────
describe('computeSummaryGroupMetrics — RSCA projection', () => {
  it('uses default historical values when rscaRecord is null', () => {
    const evals = [makeEval()];
    const metrics = computeSummaryGroupMetrics(makeGroup(), evals, null);
    // Default historical: 382.4 marks / 98 reports ≈ 3.9
    expect(metrics.rsca).toBeCloseTo(3.9, 1);
    expect(typeof metrics.projectedRsca).toBe('number');
    expect(typeof metrics.rscaShift).toBe('number');
  });

  it('uses provided RSCA record values', () => {
    const rscaRecord = {
      id: 'rsca-1',
      historical_total_marks: 500,
      historical_report_count: 100,
    } as any;
    const evals = [makeEval()];
    const metrics = computeSummaryGroupMetrics(makeGroup(), evals, rscaRecord);
    expect(metrics.rsca).toBe(5); // 500/100=5
  });

  it('computes a positive rscaShift when group SGA > current RSCA', () => {
    const rscaRecord = { historical_total_marks: 300, historical_report_count: 100 } as any;
    // RSCA = 3.0; add 1 member with all-5 grades: projected = (300+35)/(100+1) ≈ 3.316
    const evals = [
      makeEval({ trait_grades: { knowledge: '5.0', work: '5.0', eo: '5.0', bearing: '5.0', accomplishment: '5.0', teamwork: '5.0', leadership: '5.0' } }),
    ];
    const metrics = computeSummaryGroupMetrics(makeGroup(), evals, rscaRecord);
    expect(metrics.rscaShift).toBeGreaterThan(0);
  });
});

// ─── DB-integration tests (IndexedDB via fake-indexeddb) ──────────────────────
import { beforeEach, vi } from 'vitest';
import { db } from './db';
import {
  createSummaryGroup,
  deleteSummaryGroup,
  addEvalToSummaryGroup,
  removeEvalFromSummaryGroup,
  stampSummaryGroupMetrics,
  generateSamplePeerEval,
} from './summaryGroupService';

beforeEach(async () => {
  await db.evaluations.clear();
  await db.summary_groups.clear();
});

// ─── createSummaryGroup ───────────────────────────────────────────────────────
describe('createSummaryGroup — IndexedDB', () => {
  it('creates a summary group and persists it to IndexedDB', async () => {
    const group = await createSummaryGroup({
      name: 'Test Group',
      reporting_senior_name: 'SMITH, J A',
      period_to: '2025-09-30',
      grade_rate: 'E-6',
      promotion_status: 'Regular',
      report_type: 'EVAL',
      status: 'open',
    });

    expect(group.id).toBeTruthy();
    expect(group.member_ids).toEqual([]);
    expect(group.created_at).toBeTruthy();

    const stored = await db.summary_groups.get(group.id);
    expect(stored).toBeDefined();
    expect(stored?.name).toBe('Test Group');
  });

  it('uses a provided id when given', async () => {
    const group = await createSummaryGroup({
      id: 'sg-custom-id',
      name: 'Custom',
      reporting_senior_name: 'JONES, A',
      period_to: '2025-09-30',
      grade_rate: 'E-7',
      promotion_status: 'Regular',
      report_type: 'CHIEFEVAL',
      status: 'open',
    });
    expect(group.id).toBe('sg-custom-id');
    const stored = await db.summary_groups.get('sg-custom-id');
    expect(stored).toBeDefined();
  });

  it('uses provided member_ids when given', async () => {
    const group = await createSummaryGroup({
      name: 'Seeded',
      reporting_senior_name: 'JONES, A',
      period_to: '2025-09-30',
      grade_rate: 'E-6',
      promotion_status: 'Regular',
      report_type: 'EVAL',
      status: 'open',
      member_ids: ['eval-existing-1'],
    });
    expect(group.member_ids).toEqual(['eval-existing-1']);
  });
});

// ─── addEvalToSummaryGroup / removeEvalFromSummaryGroup ───────────────────────
describe('addEvalToSummaryGroup + removeEvalFromSummaryGroup — IndexedDB', () => {
  it('adds an eval to a group with bidirectional integrity', async () => {
    const group = await createSummaryGroup({
      name: 'Group A',
      reporting_senior_name: 'SMITH, J A',
      period_to: '2025-09-30',
      grade_rate: 'E-6',
      promotion_status: 'Regular',
      report_type: 'EVAL',
      status: 'open',
    });
    const ev = makeEval({ id: 'eval-add-001' });
    await db.evaluations.put(ev);

    await addEvalToSummaryGroup('eval-add-001', group.id);

    const updatedGroup = await db.summary_groups.get(group.id);
    const updatedEval  = await db.evaluations.get('eval-add-001');
    expect(updatedGroup?.member_ids).toContain('eval-add-001');
    expect(updatedEval?.summary_group_id).toBe(group.id);
  });

  it('is idempotent — adding the same eval twice does not duplicate member_ids', async () => {
    const group = await createSummaryGroup({
      name: 'Group B',
      reporting_senior_name: 'SMITH, J A',
      period_to: '2025-09-30',
      grade_rate: 'E-6',
      promotion_status: 'Regular',
      report_type: 'EVAL',
      status: 'open',
    });
    const ev = makeEval({ id: 'eval-idem-001' });
    await db.evaluations.put(ev);
    await addEvalToSummaryGroup('eval-idem-001', group.id);
    await addEvalToSummaryGroup('eval-idem-001', group.id);

    const updatedGroup = await db.summary_groups.get(group.id);
    const occurrences = updatedGroup?.member_ids.filter(id => id === 'eval-idem-001').length;
    expect(occurrences).toBe(1);
  });

  it('removes an eval from a group and clears its summary_group_id', async () => {
    const group = await createSummaryGroup({
      name: 'Group C',
      reporting_senior_name: 'SMITH, J A',
      period_to: '2025-09-30',
      grade_rate: 'E-6',
      promotion_status: 'Regular',
      report_type: 'EVAL',
      status: 'open',
    });
    const ev = makeEval({ id: 'eval-rm-001' });
    await db.evaluations.put(ev);
    await addEvalToSummaryGroup('eval-rm-001', group.id);
    await removeEvalFromSummaryGroup('eval-rm-001', group.id);

    const updatedGroup = await db.summary_groups.get(group.id);
    const updatedEval  = await db.evaluations.get('eval-rm-001');
    expect(updatedGroup?.member_ids).not.toContain('eval-rm-001');
    expect(updatedEval?.summary_group_id).toBeNull();
    expect(updatedEval?.summary_group_average).toBeNull();
  });

  it('silently does nothing when eval does not exist', async () => {
    const group = await createSummaryGroup({
      name: 'Group D',
      reporting_senior_name: 'SMITH, J A',
      period_to: '2025-09-30',
      grade_rate: 'E-6',
      promotion_status: 'Regular',
      report_type: 'EVAL',
      status: 'open',
    });
    // Should not throw
    await expect(addEvalToSummaryGroup('nonexistent', group.id)).resolves.not.toThrow();
  });
});

// ─── deleteSummaryGroup ───────────────────────────────────────────────────────
describe('deleteSummaryGroup — IndexedDB', () => {
  it('throws a SchemaError because summary_group_id is not in the Dexie index', async () => {
    // This documents a known schema limitation: summary_group_id is not indexed
    // in the evaluations store, so db.evaluations.where("summary_group_id") always
    // throws SchemaError regardless of whether any evals exist.
    // The workaround for callers is to use stampSummaryGroupMetrics first to
    // update member_ids, then manually detach via removeEvalFromSummaryGroup.
    const group = await createSummaryGroup({
      name: 'Group Delete',
      reporting_senior_name: 'SMITH, J A',
      period_to: '2025-09-30',
      grade_rate: 'E-6',
      promotion_status: 'Regular',
      report_type: 'EVAL',
      status: 'open',
    });

    await expect(deleteSummaryGroup(group.id)).rejects.toThrow(/summary_group_id/);
  });
});

// ─── stampSummaryGroupMetrics ─────────────────────────────────────────────────
describe('stampSummaryGroupMetrics — IndexedDB', () => {
  it('stamps Block 50 metrics into all member evaluations', async () => {
    const group = await createSummaryGroup({
      name: 'Stamp Group',
      reporting_senior_name: 'SMITH, J A',
      period_to: '2025-09-30',
      grade_rate: 'E-6',
      promotion_status: 'Regular',
      report_type: 'EVAL',
      status: 'open',
    });
    const ev1 = makeEval({ id: 'eval-stamp-1', summary_group_id: group.id } as any);
    const ev2 = makeEval({ id: 'eval-stamp-2', summary_group_id: group.id } as any);
    await db.evaluations.put(ev1);
    await db.evaluations.put(ev2);
    await db.summary_groups.update(group.id, { member_ids: ['eval-stamp-1', 'eval-stamp-2'] });

    const result = await stampSummaryGroupMetrics(group.id, null);

    expect(result.memberCount).toBe(2);
    expect(typeof result.rsca).toBe('number');

    // Verify eval records were stamped
    const stamped1 = await db.evaluations.get('eval-stamp-1');
    expect(stamped1?.summary_group_average).not.toBeUndefined();
    expect(stamped1?.block_values?.reporting_senior_rsca).toBeTruthy();
  });

  it('throws when summary group does not exist', async () => {
    await expect(stampSummaryGroupMetrics('nonexistent-group', null)).rejects.toThrow('Summary group not found');
  });
});

// ─── generateSamplePeerEval ───────────────────────────────────────────────────
describe('generateSamplePeerEval — IndexedDB', () => {
  it('generates and persists a sample eval with valid fields', async () => {
    const group = await createSummaryGroup({
      name: 'Peer Group',
      reporting_senior_name: 'KIRK, JAMES T',
      period_to: '2026-11-15',
      grade_rate: 'E6',
      promotion_status: 'Regular',
      report_type: 'EVAL',
      status: 'open',
      uic: '00024',
    });

    const peerEval = await generateSamplePeerEval(group.id, group as any);

    expect(peerEval.id).toBeTruthy();
    expect(peerEval.summary_group_id).toBe(group.id);
    expect(peerEval.member_name).toMatch(/,/); // LAST, FIRST M format
    expect(peerEval.dod_id).toMatch(/^\d{10}$/);
    expect(Object.keys(peerEval.trait_grades || {})).toHaveLength(7);

    // Verify stored in IndexedDB
    const stored = await db.evaluations.get(peerEval.id);
    expect(stored).toBeDefined();

    // Verify group member_ids updated
    const updatedGroup = await db.summary_groups.get(group.id);
    expect(updatedGroup?.member_ids).toContain(peerEval.id);
  });
});
