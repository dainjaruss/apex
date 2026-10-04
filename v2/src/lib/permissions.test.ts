// src/lib/permissions.test.ts
// 100% coverage for permissions.ts — RBAC gates for summary group management.

import { describe, it, expect } from 'vitest';
import { canManageSummaryGroups, canViewSummaryAverage, canAssignSummaryGroup } from './permissions';
import type { Profile } from '@/types';

function makeProfile(role: string): Profile {
  return {
    id: 'test-id',
    name: 'Test User',
    rank: 'PO1',
    preferred_role: role,
    created_at: new Date().toISOString(),
  } as unknown as Profile;
}

// ─── canManageSummaryGroups ──────────────────────────────────────────────────
describe('canManageSummaryGroups', () => {
  it('returns false for null profile', () => {
    expect(canManageSummaryGroups(null)).toBe(false);
  });

  it('returns false for undefined profile', () => {
    expect(canManageSummaryGroups(undefined)).toBe(false);
  });

  it('returns true for Reporting Senior', () => {
    expect(canManageSummaryGroups(makeProfile('Reporting Senior'))).toBe(true);
  });

  it('returns true for Admin', () => {
    expect(canManageSummaryGroups(makeProfile('Admin'))).toBe(true);
  });

  it('returns false for Sailor', () => {
    expect(canManageSummaryGroups(makeProfile('Sailor'))).toBe(false);
  });

  it('returns false for Rater', () => {
    expect(canManageSummaryGroups(makeProfile('Rater'))).toBe(false);
  });

  it('returns false for Senior Rater', () => {
    expect(canManageSummaryGroups(makeProfile('Senior Rater'))).toBe(false);
  });
});

// ─── canViewSummaryAverage ──────────────────────────────────────────────────
describe('canViewSummaryAverage', () => {
  it('returns false for null profile', () => {
    expect(canViewSummaryAverage(null)).toBe(false);
  });

  it('returns false for undefined profile', () => {
    expect(canViewSummaryAverage(undefined)).toBe(false);
  });

  // Non-sailor roles can always see the average
  for (const role of ['Reporting Senior', 'Admin', 'Rater', 'Senior Rater']) {
    it(`always returns true for ${role} regardless of status`, () => {
      expect(canViewSummaryAverage(makeProfile(role), 'draft', 'pending')).toBe(true);
    });
  }

  // Sailor visibility is gated by eval status / routing stage
  it('returns false for Sailor with draft eval in pending stage', () => {
    expect(canViewSummaryAverage(makeProfile('Sailor'), 'draft', 'pending')).toBe(false);
  });

  it('returns true for Sailor when evalStatus=completed', () => {
    expect(canViewSummaryAverage(makeProfile('Sailor'), 'completed', 'pending')).toBe(true);
  });

  it('returns true for Sailor when evalStatus=archived', () => {
    expect(canViewSummaryAverage(makeProfile('Sailor'), 'archived', undefined)).toBe(true);
  });

  it('returns true for Sailor when routingStage=debrief', () => {
    expect(canViewSummaryAverage(makeProfile('Sailor'), 'draft', 'debrief')).toBe(true);
  });

  it('returns true for Sailor when routingStage=locked', () => {
    expect(canViewSummaryAverage(makeProfile('Sailor'), 'draft', 'locked')).toBe(true);
  });

  it('returns false for Sailor with undefined status and stage', () => {
    expect(canViewSummaryAverage(makeProfile('Sailor'), undefined, undefined)).toBe(false);
  });
});

// ─── canAssignSummaryGroup ───────────────────────────────────────────────────
describe('canAssignSummaryGroup', () => {
  it('returns false for null profile', () => {
    expect(canAssignSummaryGroup(null)).toBe(false);
  });

  it('returns false for undefined profile', () => {
    expect(canAssignSummaryGroup(undefined)).toBe(false);
  });

  it('returns true for Reporting Senior', () => {
    expect(canAssignSummaryGroup(makeProfile('Reporting Senior'))).toBe(true);
  });

  it('returns true for Admin', () => {
    expect(canAssignSummaryGroup(makeProfile('Admin'))).toBe(true);
  });

  it('returns false for Sailor', () => {
    expect(canAssignSummaryGroup(makeProfile('Sailor'))).toBe(false);
  });

  it('returns false for Rater', () => {
    expect(canAssignSummaryGroup(makeProfile('Rater'))).toBe(false);
  });
});
