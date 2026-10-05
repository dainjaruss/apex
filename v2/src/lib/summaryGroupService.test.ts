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
import { noteWorkspaceIdentity } from './workspaceSession';
import {
  createSummaryGroup,
  deleteSummaryGroup,
  addEvalToSummaryGroup,
  removeEvalFromSummaryGroup,
  stampSummaryGroupMetrics,
  generateSamplePeerEval,
  closeSummaryGroup,
  reopenSummaryGroup,
  buildDebriefPackages,
  applyLiveSummaryFigures,
  persistSummaryGroupFigures,
} from './summaryGroupService';

beforeEach(async () => {
  localStorage.clear();
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
describe('persistSummaryGroupFigures — IndexedDB', () => {
  it('writes the summary group average and Block 46 counts when a report joins the group', async () => {
    const group = await createSummaryGroup({
      name: 'Live Group',
      reporting_senior_name: 'SMITH, J A',
      period_to: '2025-09-30',
      grade_rate: 'E-6',
      promotion_status: 'Regular',
      report_type: 'EVAL',
      status: 'open',
    });
    const early = makeEval({
      id: 'eval-live-ep',
      promotion_recommendation: 'Early Promote',
      trait_grades: {
        knowledge: '5.0', work: '5.0', eo: '5.0', bearing: '5.0',
        accomplishment: '5.0', teamwork: '5.0', leadership: '5.0',
      },
    });
    const promotable = makeEval({ id: 'eval-live-p', promotion_recommendation: 'Promotable' });
    await db.evaluations.bulkPut([early, promotable]);

    await addEvalToSummaryGroup(early.id, group.id);
    await addEvalToSummaryGroup(promotable.id, group.id);

    const storedEarly = await db.evaluations.get(early.id);
    const storedPromotable = await db.evaluations.get(promotable.id);
    expect(storedEarly?.summary_group_average).toBe(4.5);
    expect(storedPromotable?.summary_group_average).toBe(4.5);
    expect(storedEarly?.summary_group_distribution).toMatchObject({
      'Early Promote': 1,
      'Must Promote': 0,
      Promotable: 1,
      Progressing: 0,
      'Significant Problems': 0,
    });
    expect(storedEarly?.summary_group_distribution?.NOB).toBeUndefined();
  });

  it('recalculates the remaining reports when one leaves the group', async () => {
    const group = await createSummaryGroup({
      name: 'Leave Group',
      reporting_senior_name: 'SMITH, J A',
      period_to: '2025-09-30',
      grade_rate: 'E-6',
      promotion_status: 'Regular',
      report_type: 'EVAL',
      status: 'open',
    });
    const early = makeEval({ id: 'eval-leave-ep', promotion_recommendation: 'Early Promote' });
    const promotable = makeEval({ id: 'eval-leave-p', promotion_recommendation: 'Promotable' });
    await db.evaluations.bulkPut([early, promotable]);
    await addEvalToSummaryGroup(early.id, group.id);
    await addEvalToSummaryGroup(promotable.id, group.id);

    await removeEvalFromSummaryGroup(early.id, group.id);

    const gone = await db.evaluations.get(early.id);
    const stayed = await db.evaluations.get(promotable.id);
    expect(gone?.summary_group_id).toBeNull();
    expect(gone?.summary_group_average).toBeNull();
    expect(stayed?.summary_group_distribution).toMatchObject({
      'Early Promote': 0,
      Promotable: 1,
    });
    expect(stayed?.summary_group_average).toBe(4);
  });
});

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

function asCommand() {
  noteWorkspaceIdentity({
    scope: 'command',
    workspaceId: 'ws-command',
    holderName: 'KIRK, JAMES T',
    holderRole: 'Reporting Senior',
  });
}

const FIVES = {
  knowledge: '5.0', work: '5.0', eo: '5.0', bearing: '5.0',
  accomplishment: '5.0', teamwork: '5.0', leadership: '5.0',
};
const THREES = {
  knowledge: '3.0', work: '3.0', eo: '3.0', bearing: '3.0',
  accomplishment: '3.0', teamwork: '3.0', leadership: '3.0',
};
const NOB_GRADES = {
  knowledge: 'NOB', work: 'NOB', eo: 'NOB', bearing: 'NOB',
  accomplishment: 'NOB', teamwork: 'NOB', leadership: 'NOB',
};

describe('closeSummaryGroup and debrief copies', () => {
  it('refuses to close while a member has no promotion mark', async () => {
    asCommand();
    const group = await createSummaryGroup({
      name: 'Open Group',
      reporting_senior_name: 'KIRK, JAMES T',
      period_to: '2026-11-15',
      grade_rate: 'E6',
      promotion_status: 'Regular',
      report_type: 'EVAL',
      status: 'open',
    });
    await db.evaluations.put(makeEval({
      id: 'eval-blank',
      summary_group_id: group.id,
      promotion_recommendation: '',
      member_name: 'UHURA, NYOTA',
    }));
    await db.summary_groups.update(group.id, { member_ids: ['eval-blank'] });
    await expect(closeSummaryGroup(group.id)).rejects.toThrow(/no promotion recommendation/);
    expect((await db.summary_groups.get(group.id))?.status).toBe('open');
  });

  it('refuses to close while a report is still with a reviewer', async () => {
    asCommand();
    const group = await createSummaryGroup({
      name: 'Out Group',
      reporting_senior_name: 'KIRK, JAMES T',
      period_to: '2026-11-15',
      grade_rate: 'E6',
      promotion_status: 'Regular',
      report_type: 'EVAL',
      status: 'open',
    });
    await db.evaluations.put(makeEval({
      id: 'eval-out',
      summary_group_id: group.id,
      routing_stage: 'rater',
      member_name: 'UHURA, NYOTA',
    }));
    await db.summary_groups.update(group.id, { member_ids: ['eval-out'] });
    await expect(closeSummaryGroup(group.id)).rejects.toThrow(/still with a reviewer/);
  });

  it('gives both members the same frozen average and the same five counts', async () => {
    asCommand();
    const group = await createSummaryGroup({
      name: 'Closed Group',
      reporting_senior_name: 'KIRK, JAMES T',
      period_to: '2026-11-15',
      grade_rate: 'E6',
      promotion_status: 'Regular',
      report_type: 'EVAL',
      status: 'open',
    });
    await db.evaluations.bulkPut([
      makeEval({
        id: 'eval-high',
        member_name: 'UHURA, NYOTA',
        summary_group_id: group.id,
        trait_grades: FIVES,
        promotion_recommendation: 'Early Promote',
        source_workspace_id: 'ws-uhura',
        trait_average: 5,
      }),
      makeEval({
        id: 'eval-low',
        member_name: 'SULU, HIKARU',
        summary_group_id: group.id,
        trait_grades: THREES,
        promotion_recommendation: 'Promotable',
        source_workspace_id: 'ws-sulu',
        trait_average: 3,
      }),
    ]);
    await db.summary_groups.update(group.id, { member_ids: ['eval-high', 'eval-low'] });

    const figures = await closeSummaryGroup(group.id);
    expect(figures.summaryGroupAverage).toBe(4);
    expect(figures.distribution).toMatchObject({
      'Early Promote': 1,
      'Must Promote': 0,
      Promotable: 1,
      Progressing: 0,
      'Significant Problems': 0,
    });
    expect(figures.distribution).not.toHaveProperty('NOB');

    const packages = await buildDebriefPackages(group.id);
    expect(packages).toHaveLength(2);
    for (const pkg of packages) {
      expect(pkg.release).toBe('debrief');
      expect(pkg.evaluation.summary_group_average).toBe(4);
      expect(pkg.evaluation.summary_group_distribution).toEqual(figures.distribution);
      expect(pkg.evaluation.ranking_released).toBe(true);
      expect(pkg.evaluation.trait_average).toBeTypeOf('number');
    }
    const uhura = packages.find((pkg) => pkg.evaluation.id === 'eval-high');
    const sulu = packages.find((pkg) => pkg.evaluation.id === 'eval-low');
    expect(uhura?.addressed_to).toBe('ws-uhura');
    expect(uhura?.evaluation.promotion_recommendation).toBe('Early Promote');
    expect(JSON.stringify(uhura)).not.toContain('SULU');
    expect(sulu?.addressed_to).toBe('ws-sulu');
    expect(sulu?.evaluation.promotion_recommendation).toBe('Promotable');
    expect(JSON.stringify(sulu)).not.toContain('UHURA');
  });

  it('keeps NOB out of the frozen counts and the frozen average', async () => {
    asCommand();
    const group = await createSummaryGroup({
      name: 'NOB Group',
      reporting_senior_name: 'KIRK, JAMES T',
      period_to: '2026-11-15',
      grade_rate: 'E6',
      promotion_status: 'Regular',
      report_type: 'EVAL',
      status: 'open',
    });
    await db.evaluations.bulkPut([
      makeEval({
        id: 'eval-graded',
        summary_group_id: group.id,
        trait_grades: FIVES,
        promotion_recommendation: 'Promotable',
        source_workspace_id: 'ws-graded',
      }),
      makeEval({
        id: 'eval-nob',
        summary_group_id: group.id,
        trait_grades: NOB_GRADES,
        promotion_recommendation: 'NOB',
        source_workspace_id: 'ws-nob',
      }),
    ]);
    await db.summary_groups.update(group.id, { member_ids: ['eval-graded', 'eval-nob'] });
    const figures = await closeSummaryGroup(group.id);
    expect(figures.summaryGroupAverage).toBe(5);
    expect(figures.distribution.Promotable).toBe(1);
    expect(figures.distribution).not.toHaveProperty('NOB');
    const packages = await buildDebriefPackages(group.id);
    expect(packages.every((pkg) => pkg.evaluation.summary_group_average === 5)).toBe(true);
    expect(packages.every((pkg) => pkg.evaluation.summary_group_distribution?.Promotable === 1)).toBe(true);
  });

  it('clears the frozen release when the group is reopened', async () => {
    asCommand();
    const group = await createSummaryGroup({
      name: 'Reopen Group',
      reporting_senior_name: 'KIRK, JAMES T',
      period_to: '2026-11-15',
      grade_rate: 'E6',
      promotion_status: 'Regular',
      report_type: 'EVAL',
      status: 'open',
    });
    await db.evaluations.put(makeEval({
      id: 'eval-one',
      summary_group_id: group.id,
      source_workspace_id: 'ws-one',
    }));
    await db.summary_groups.update(group.id, { member_ids: ['eval-one'] });
    await closeSummaryGroup(group.id);
    await reopenSummaryGroup(group.id);
    const stored = await db.summary_groups.get(group.id);
    expect(stored?.status).toBe('open');
    expect(stored?.frozen_at).toBeNull();
    expect(stored?.frozen_average).toBeNull();
    await expect(buildDebriefPackages(group.id)).rejects.toThrow(/Close the summary group/);
  });
});

describe('member and reviewer live pool', () => {
  it('does not write the live pool from a member workspace', async () => {
    noteWorkspaceIdentity({
      scope: 'member',
      workspaceId: 'ws-sailor',
      holderName: 'UHURA, NYOTA',
      holderRole: 'Sailor',
    });
    const group = await createSummaryGroup({
      name: 'Hidden Group',
      reporting_senior_name: 'KIRK, JAMES T',
      period_to: '2026-11-15',
      grade_rate: 'E6',
      promotion_status: 'Regular',
      report_type: 'EVAL',
      status: 'open',
    });
    await db.evaluations.bulkPut([
      makeEval({ id: 'eval-self', summary_group_id: group.id, trait_grades: FIVES }),
      makeEval({ id: 'eval-peer', summary_group_id: group.id, trait_grades: THREES, member_name: 'SULU, HIKARU' }),
    ]);
    const result = await persistSummaryGroupFigures(group.id);
    expect(result.memberCount).toBe(0);
    expect((await db.evaluations.get('eval-self'))?.summary_group_average).toBeUndefined();
    expect((await db.evaluations.get('eval-peer'))?.summary_group_average).toBeUndefined();
  });

  it('does not read another report when a member workspace prepares a draft PDF', async () => {
    noteWorkspaceIdentity({
      scope: 'member',
      workspaceId: 'ws-sailor',
      holderName: 'UHURA, NYOTA',
      holderRole: 'Sailor',
    });
    const self = makeEval({
      id: 'eval-self',
      summary_group_id: 'sg-shared',
      summary_group_average: 4.75,
      promotion_recommendation: 'Early Promote',
      trait_grades: THREES,
      trait_average: 3,
    });
    const peer = makeEval({
      id: 'eval-peer',
      summary_group_id: 'sg-shared',
      member_name: 'SULU, HIKARU',
      trait_grades: FIVES,
      summary_group_average: 5,
    });
    await db.evaluations.bulkPut([self, peer]);
    const reads = vi.spyOn(db.evaluations, 'toArray');
    const printed = await applyLiveSummaryFigures(self);
    expect(reads).not.toHaveBeenCalled();
    expect(printed.summary_group_average).toBeNull();
    expect(printed.summary_group_distribution).toBeNull();
    expect(printed.promotion_recommendation).toBeUndefined();
    expect(printed.trait_average).toBe(3);
    expect(printed.member_name).toBe('DOE, JOHN A');
    reads.mockRestore();
  });

  it('prints the frozen average and the five counts from a debrief copy', async () => {
    noteWorkspaceIdentity({
      scope: 'member',
      workspaceId: 'ws-sailor',
      holderName: 'UHURA, NYOTA',
      holderRole: 'Sailor',
    });
    const frozen = {
      'Significant Problems': 0,
      Progressing: 0,
      Promotable: 1,
      'Must Promote': 0,
      'Early Promote': 1,
    };
    const self = makeEval({
      id: 'eval-self',
      summary_group_id: 'sg-shared',
      summary_group_average: 4,
      summary_group_distribution: frozen,
      promotion_recommendation: 'Early Promote',
      ranking_released: true,
      trait_average: 5,
      trait_grades: FIVES,
    });
    await db.evaluations.bulkPut([
      self,
      makeEval({
        id: 'eval-peer',
        summary_group_id: 'sg-shared',
        member_name: 'SULU, HIKARU',
        trait_grades: THREES,
        summary_group_average: 3,
      }),
    ]);
    const reads = vi.spyOn(db.evaluations, 'toArray');
    const printed = await applyLiveSummaryFigures(self);
    expect(reads).not.toHaveBeenCalled();
    expect(printed.summary_group_average).toBe(4);
    expect(printed.summary_group_distribution).toEqual(frozen);
    expect(printed.promotion_recommendation).toBe('Early Promote');
    expect(printed.trait_average).toBe(5);
    reads.mockRestore();
  });
});
