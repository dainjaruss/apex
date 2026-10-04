// src/lib/routingService.test.ts
// Tests for the pure/deterministic functions in routingService.ts.
// DB-writing functions (forwardEvaluationCustody, etc.) are tested via the fake-indexeddb integration.

import { describe, it, expect } from 'vitest';
import {
  ROUTING_STAGES,
  NEXT_STAGE_MAP,
  PREV_STAGE_MAP,
  generateRoutingEmailUrl,
} from './routingService';
import type { Evaluation } from '@/types';

// ─── ROUTING_STAGES ──────────────────────────────────────────────────────────
describe('ROUTING_STAGES', () => {
  it('has 6 stages', () => {
    expect(ROUTING_STAGES).toHaveLength(6);
  });

  it('has all expected stage IDs in order', () => {
    const ids = ROUTING_STAGES.map(s => s.id);
    expect(ids).toContain('sailor');
    expect(ids).toContain('rater');
    expect(ids).toContain('senior_rater');
    expect(ids).toContain('reporting_senior');
    expect(ids).toContain('debrief');
    expect(ids).toContain('locked');
  });

  it('each stage has required fields', () => {
    for (const stage of ROUTING_STAGES) {
      expect(stage.id).toBeTruthy();
      expect(stage.label).toBeTruthy();
      expect(stage.role).toBeTruthy();
      expect(stage.description).toBeTruthy();
      expect(stage.actionRequired).toBeTruthy();
    }
  });
});

// ─── NEXT_STAGE_MAP ───────────────────────────────────────────────────────────
describe('NEXT_STAGE_MAP', () => {
  it('sailor → rater', () => expect(NEXT_STAGE_MAP.sailor).toBe('rater'));
  it('rater → senior_rater', () => expect(NEXT_STAGE_MAP.rater).toBe('senior_rater'));
  it('senior_rater → reporting_senior', () => expect(NEXT_STAGE_MAP.senior_rater).toBe('reporting_senior'));
  it('reporting_senior → debrief', () => expect(NEXT_STAGE_MAP.reporting_senior).toBe('debrief'));
  it('debrief → locked', () => expect(NEXT_STAGE_MAP.debrief).toBe('locked'));
  it('locked → null (terminal stage)', () => expect(NEXT_STAGE_MAP.locked).toBeNull());
  it('admin → locked', () => expect(NEXT_STAGE_MAP.admin).toBe('locked'));
});

// ─── PREV_STAGE_MAP ───────────────────────────────────────────────────────────
describe('PREV_STAGE_MAP', () => {
  it('sailor → null (initial stage, cannot go back)', () => expect(PREV_STAGE_MAP.sailor).toBeNull());
  it('rater → sailor', () => expect(PREV_STAGE_MAP.rater).toBe('sailor'));
  it('senior_rater → rater', () => expect(PREV_STAGE_MAP.senior_rater).toBe('rater'));
  it('reporting_senior → senior_rater', () => expect(PREV_STAGE_MAP.reporting_senior).toBe('senior_rater'));
  it('debrief → reporting_senior', () => expect(PREV_STAGE_MAP.debrief).toBe('reporting_senior'));
  it('locked → null', () => expect(PREV_STAGE_MAP.locked).toBeNull());
  it('admin → null', () => expect(PREV_STAGE_MAP.admin).toBeNull());
});

// ─── generateRoutingEmailUrl ─────────────────────────────────────────────────
const baseEval: Partial<Evaluation> = {
  id: 'eval-001',
  report_type: 'EVAL',
  member_name: 'SMITH, JOHN A',
  dod_id: '1234567890',
  grade_rate: 'PO1',
  period_to: '2025-09-30',
  routing_stage: 'sailor',
};

describe('generateRoutingEmailUrl', () => {
  it('generates a mailto URL for FORWARD action', () => {
    const { mailtoUrl, subject, bodyText } = generateRoutingEmailUrl(
      baseEval as Evaluation,
      'FORWARD',
      'JONES, MARY B',
      'mary.jones@navy.mil',
      '',
      'SMITH, JOHN A',
    );
    expect(mailtoUrl).toMatch(/^mailto:/);
    expect(mailtoUrl).toContain('subject=');
    expect(mailtoUrl).toContain('body=');
    expect(subject).toContain('ACTION REQUIRED');
    expect(subject).toContain('SMITH, JOHN A');
  });

  it('generates a RETURN subject with rework indicator', () => {
    const { subject } = generateRoutingEmailUrl(
      baseEval as Evaluation,
      'RETURN',
      'DOE, JANE',
      'jane.doe@navy.mil',
      'Please fix Block 43.',
      'SMITH, JOHN A',
    );
    expect(subject).toContain('RETURNED FOR REWORK');
  });

  it('includes member name and period in the email body', () => {
    const { bodyText } = generateRoutingEmailUrl(
      baseEval as Evaluation,
      'FORWARD',
      'JONES, MARY B',
      'mary.jones@navy.mil',
      '',
      'SMITH, JOHN A',
    );
    expect(bodyText).toContain('SMITH, JOHN A');
    expect(bodyText).toContain('2025-09-30');
    expect(bodyText).toContain('PO1');
  });

  it('includes routing notes when provided', () => {
    const { bodyText } = generateRoutingEmailUrl(
      baseEval as Evaluation,
      'FORWARD',
      'JONES',
      'jones@navy.mil',
      'Expedite routing please.',
      'SMITH',
    );
    expect(bodyText).toContain('Expedite routing please.');
  });

  it('omits ROUTING NOTES section when notes are empty', () => {
    const { bodyText } = generateRoutingEmailUrl(
      baseEval as Evaluation,
      'FORWARD',
      'JONES',
      'jones@navy.mil',
      '',
      'SMITH',
    );
    expect(bodyText).not.toContain('ROUTING NOTES');
  });

  it('PACK_AND_ROUTE mode includes .apex.json instructions', () => {
    const { bodyText } = generateRoutingEmailUrl(
      baseEval as Evaluation,
      'FORWARD',
      'JONES',
      'jones@navy.mil',
      '',
      'SMITH',
      'PACK_AND_ROUTE',
    );
    expect(bodyText).toContain('.apex.json');
  });

  it('SHAREPOINT mode includes SharePoint URL instructions', () => {
    const { bodyText } = generateRoutingEmailUrl(
      baseEval as Evaluation,
      'FORWARD',
      'JONES',
      'jones@navy.mil',
      '',
      'SMITH',
      'SHAREPOINT',
      { enabled: true, siteUrl: 'https://navy.sharepoint.com/apex', listName: 'APEX_Evals', emailNotify: true },
    );
    expect(bodyText).toContain('SHAREPOINT');
    expect(bodyText).toContain('https://navy.sharepoint.com/apex');
  });

  it('uses "Next Stage" label when routing_stage is not recognized', () => {
    const badEval = { ...baseEval, routing_stage: 'unknown_stage' as any } as Evaluation;
    const { bodyText } = generateRoutingEmailUrl(badEval, 'FORWARD', 'X', 'x@navy.mil', '', 'Y');
    expect(bodyText).toContain('Next Stage');
  });

  it('includes CUI classification header', () => {
    const { bodyText } = generateRoutingEmailUrl(
      baseEval as Evaluation, 'FORWARD', 'X', 'x@navy.mil', '', 'Y'
    );
    expect(bodyText).toContain('CUI');
    expect(bodyText).toContain('BUPERSINST 1610.10H');
  });

  it('includes forge access URL in body', () => {
    const { bodyText } = generateRoutingEmailUrl(
      baseEval as Evaluation, 'FORWARD', 'X', 'x@navy.mil', '', 'Y'
    );
    expect(bodyText).toContain('forge.navy.mil');
  });
});

// ─── DB-integration: forwardEvaluationCustody ─────────────────────────────────
import { beforeEach } from 'vitest';
import { db } from './db';
import { forwardEvaluationCustody, returnEvaluationCustody, executeEvaluationHandoff } from './routingService';
import type { Profile } from '@/types';

function makeTestEval(overrides: Partial<any> = {}): any {
  return {
    id: `eval-route-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    report_type: 'EVAL',
    member_name: 'JONES, MARY B',
    dod_id: '1111111111',
    grade_rate: 'PO2',
    period_from: '2025-01-01',
    period_to: '2025-09-30',
    duty_status: 'ACT',
    uic: 'N0001',
    ship_station: 'USS MOCK DDG-01',
    promotion_status: 'Regular',
    trait_grades: {},
    comments: '',
    career_recommendations: ['NA'],
    promotion_recommendation: 'Promotable',
    retention: 'Recommended',
    status: 'draft',
    routing_stage: 'sailor',
    custody_chain: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

const fromProfile: Profile = {
  id: 'prof-001',
  first_name: 'JOHN',
  last_name: 'SMITH',
  preferred_role: 'Rater',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as any;

beforeEach(async () => {
  // Clear evaluations table between tests so each test starts fresh
  await db.evaluations.clear();
});

describe('forwardEvaluationCustody — DB integration', () => {
  it('advances routing_stage from sailor → rater and persists to IndexedDB', async () => {
    const ev = makeTestEval({ routing_stage: 'sailor' });
    await db.evaluations.put(ev);

    const updated = await forwardEvaluationCustody(ev, fromProfile, 'JONES, MARY B', 'jones@navy.mil');

    expect(updated.routing_stage).toBe('rater');
    expect(updated.current_holder_name).toBe('JONES, MARY B');
    expect(updated.current_holder_email).toBe('jones@navy.mil');
    expect(updated.custody_chain).toHaveLength(1);
    expect(updated.custody_chain![0].action).toBe('forwarded');

    // Verify it was persisted
    const stored = await db.evaluations.get(ev.id);
    expect(stored?.routing_stage).toBe('rater');
  });

  it('advances rater → senior_rater', async () => {
    const ev = makeTestEval({ routing_stage: 'rater' });
    await db.evaluations.put(ev);
    const updated = await forwardEvaluationCustody(ev, fromProfile, 'BROWN, K', 'brown@navy.mil');
    expect(updated.routing_stage).toBe('senior_rater');
  });

  it('marks status completed and custody action signed when reaching locked', async () => {
    const ev = makeTestEval({ routing_stage: 'debrief' });
    await db.evaluations.put(ev);
    const updated = await forwardEvaluationCustody(ev, fromProfile, 'ADMIN', 'admin@navy.mil');
    expect(updated.routing_stage).toBe('locked');
    expect(updated.status).toBe('completed');
    expect(updated.custody_chain![0].action).toBe('signed');
  });

  it('appends to an existing custody chain', async () => {
    const existingRecord = {
      id: 'custody-prev-1',
      stage: 'sailor' as const,
      action: 'created' as const,
      from_name: 'DOE, JOHN A',
      to_name: 'DOE, JOHN A',
      transitioned_at: new Date().toISOString(),
      notes: '',
    };
    const ev = makeTestEval({ routing_stage: 'sailor', custody_chain: [existingRecord] });
    await db.evaluations.put(ev);
    const updated = await forwardEvaluationCustody(ev, fromProfile, 'JONES', 'j@navy.mil');
    expect(updated.custody_chain).toHaveLength(2);
  });

  it('clears return_notes when forwarding', async () => {
    const ev = makeTestEval({ routing_stage: 'sailor', return_notes: 'Fix Block 43.' });
    await db.evaluations.put(ev);
    const updated = await forwardEvaluationCustody(ev, fromProfile, 'JONES', 'j@navy.mil');
    expect(updated.return_notes).toBeUndefined();
  });
});

describe('returnEvaluationCustody — DB integration', () => {
  it('moves routing_stage from rater back to sailor', async () => {
    const ev = makeTestEval({ routing_stage: 'rater' });
    await db.evaluations.put(ev);

    const updated = await returnEvaluationCustody(ev, fromProfile, 'DOE, JOHN A', 'doe@navy.mil', 'Fix Block 43.');

    expect(updated.routing_stage).toBe('sailor');
    expect(updated.return_notes).toBe('Fix Block 43.');
    expect(updated.status).toBe('draft');
    expect(updated.custody_chain![0].action).toBe('returned');
    expect(updated.custody_chain![0].notes).toBe('Fix Block 43.');
  });

  it('moves senior_rater back to rater', async () => {
    const ev = makeTestEval({ routing_stage: 'senior_rater' });
    await db.evaluations.put(ev);
    const updated = await returnEvaluationCustody(ev, fromProfile, 'RATER', 'r@navy.mil', 'Recalibrate traits.');
    expect(updated.routing_stage).toBe('rater');
  });

  it('persists the returned evaluation in IndexedDB', async () => {
    const ev = makeTestEval({ routing_stage: 'reporting_senior' });
    await db.evaluations.put(ev);
    await returnEvaluationCustody(ev, fromProfile, 'SR', 'sr@navy.mil', 'Notes.');
    const stored = await db.evaluations.get(ev.id);
    expect(stored?.routing_stage).toBe('senior_rater');
    expect(stored?.return_notes).toBe('Notes.');
  });

  it('records the from_name as LASTNAME, FIRSTNAME from profile', async () => {
    const ev = makeTestEval({ routing_stage: 'rater' });
    await db.evaluations.put(ev);
    const updated = await returnEvaluationCustody(ev, fromProfile, 'SAILOR', 's@navy.mil', '');
    expect(updated.custody_chain![0].from_name).toBe('SMITH, JOHN');
  });
});

describe('executeEvaluationHandoff — PACK_AND_ROUTE mode', () => {
  beforeEach(() => {
    // Mock DOM APIs needed by exportSingleEvalTransfer
    if (typeof document !== 'undefined') {
      const mockAnchor = {
        href: '',
        download: '',
        click: () => {},
        style: { display: '' },
      };
      vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any);
      vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as any);
      vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as any);
    }
    (globalThis as any).URL = {
      createObjectURL: () => 'blob:mock',
      revokeObjectURL: () => {},
    };
  });

  it('returns updatedEvaluation with advanced routing_stage on FORWARD', async () => {
    const ev = makeTestEval({ routing_stage: 'sailor' });
    await db.evaluations.put(ev);

    const result = await executeEvaluationHandoff({
      evaluation: ev,
      action: 'FORWARD',
      fromProfile,
      toHolderName: 'JONES, M',
      toHolderEmail: 'jones@navy.mil',
      notes: '',
      mode: 'PACK_AND_ROUTE',
      sendEmail: false,
    });

    expect(result.updatedEvaluation.routing_stage).toBe('rater');
  });

  it('returns updatedEvaluation with prior routing_stage on RETURN', async () => {
    const ev = makeTestEval({ routing_stage: 'rater' });
    await db.evaluations.put(ev);

    const result = await executeEvaluationHandoff({
      evaluation: ev,
      action: 'RETURN',
      fromProfile,
      toHolderName: 'DOE, J',
      toHolderEmail: 'doe@navy.mil',
      notes: 'Rework needed.',
      mode: 'PACK_AND_ROUTE',
      sendEmail: false,
    });

    expect(result.updatedEvaluation.routing_stage).toBe('sailor');
  });

  it('includes mailtoUrl when sendEmail is true', async () => {
    const ev = makeTestEval({ routing_stage: 'sailor' });
    await db.evaluations.put(ev);

    const result = await executeEvaluationHandoff({
      evaluation: ev,
      action: 'FORWARD',
      fromProfile,
      toHolderName: 'JONES',
      toHolderEmail: 'j@navy.mil',
      notes: '',
      mode: 'PACK_AND_ROUTE',
      sendEmail: true,
    });

    expect(result.mailtoUrl).toMatch(/^mailto:/);
  });

  it('omits mailtoUrl when sendEmail is false', async () => {
    const ev = makeTestEval({ routing_stage: 'sailor' });
    await db.evaluations.put(ev);

    const result = await executeEvaluationHandoff({
      evaluation: ev,
      action: 'FORWARD',
      fromProfile,
      toHolderName: 'JONES',
      toHolderEmail: 'j@navy.mil',
      notes: '',
      mode: 'PACK_AND_ROUTE',
      sendEmail: false,
    });

    expect(result.mailtoUrl).toBeUndefined();
  });
});

// ─── executeEvaluationHandoff — SHAREPOINT mode ───────────────────────────────
import { vi } from 'vitest';

describe('executeEvaluationHandoff — SHAREPOINT mode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('syncs to SharePoint when mode is SHAREPOINT and config is enabled', async () => {
    // Pre-configure SharePoint as enabled
    localStorage.setItem(
      'apex_v2_sharepoint_config',
      JSON.stringify({ enabled: true, siteUrl: 'https://test.mil', listName: 'APEX_Evals', autoSync: false, emailNotify: false })
    );

    // Mock fetch to succeed for syncEvaluationToSharePoint
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const ev = makeTestEval({ routing_stage: 'sailor' });
    await db.evaluations.put(ev);

    const result = await executeEvaluationHandoff({
      evaluation: ev,
      action: 'FORWARD',
      fromProfile,
      toHolderName: 'JONES',
      toHolderEmail: 'jones@navy.mil',
      notes: '',
      mode: 'SHAREPOINT',
      sendEmail: false,
    });

    expect(result.updatedEvaluation.routing_stage).toBe('rater');
    expect(result.sharePointResult?.success).toBe(true);
  });

  it('sends SharePoint email when sendEmail + SHAREPOINT + enabled + emailNotify', async () => {
    localStorage.setItem(
      'apex_v2_sharepoint_config',
      JSON.stringify({ enabled: true, siteUrl: 'https://test.mil', listName: 'APEX_Evals', autoSync: false, emailNotify: true })
    );

    // Mock both sync and email fetch calls to succeed
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    const ev = makeTestEval({ routing_stage: 'sailor' });
    await db.evaluations.put(ev);

    const result = await executeEvaluationHandoff({
      evaluation: ev,
      action: 'FORWARD',
      fromProfile,
      toHolderName: 'JONES',
      toHolderEmail: 'jones@navy.mil',
      notes: '',
      mode: 'SHAREPOINT',
      sendEmail: true,
    });

    expect(result.mailtoUrl).toMatch(/^mailto:/);
    expect(result.sharePointResult?.success).toBe(true);
  });
});
