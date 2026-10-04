// src/lib/sharepointService.test.ts
// Tests for pure/config functions in sharepointService.ts.
// Network-calling functions (testSharePointConnection, syncEvaluationToSharePoint,
// sendSharePointEmail) are tested with mocked fetch.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_SP_CONFIG,
  getSharePointConfig,
  saveSharePointConfig,
  testSharePointConnection,
  sendSharePointEmail,
  syncEvaluationToSharePoint,
  type SharePointConfig,
} from './sharepointService';

// ─── DEFAULT_SP_CONFIG ────────────────────────────────────────────────────────
describe('DEFAULT_SP_CONFIG', () => {
  it('is disabled by default', () => {
    expect(DEFAULT_SP_CONFIG.enabled).toBe(false);
  });

  it('has a default siteUrl', () => {
    expect(DEFAULT_SP_CONFIG.siteUrl).toBeTruthy();
    expect(DEFAULT_SP_CONFIG.siteUrl).toContain('navy.mil');
  });

  it('has a default listName', () => {
    expect(DEFAULT_SP_CONFIG.listName).toBe('APEX_Evaluations');
  });

  it('autoSync is false by default', () => {
    expect(DEFAULT_SP_CONFIG.autoSync).toBe(false);
  });

  it('emailNotify is true by default', () => {
    expect(DEFAULT_SP_CONFIG.emailNotify).toBe(true);
  });
});

// ─── getSharePointConfig / saveSharePointConfig ───────────────────────────────
describe('getSharePointConfig + saveSharePointConfig', () => {
  const STORAGE_KEY = 'apex_v2_sharepoint_config';

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns DEFAULT_SP_CONFIG when localStorage is empty', () => {
    const config = getSharePointConfig();
    expect(config).toMatchObject(DEFAULT_SP_CONFIG);
  });

  it('returns DEFAULT_SP_CONFIG when localStorage throws (parse error)', () => {
    // Store invalid JSON
    localStorage.setItem(STORAGE_KEY, '{ invalid json }');
    const config = getSharePointConfig();
    expect(config).toMatchObject(DEFAULT_SP_CONFIG);
  });

  it('saves and retrieves a custom config', () => {
    const custom: SharePointConfig = {
      enabled: true,
      siteUrl: 'https://test.navy.mil/apex',
      listName: 'APEX_Test',
      autoSync: true,
      emailNotify: false,
    };
    saveSharePointConfig(custom);
    const retrieved = getSharePointConfig();
    expect(retrieved.enabled).toBe(true);
    expect(retrieved.siteUrl).toBe('https://test.navy.mil/apex');
    expect(retrieved.listName).toBe('APEX_Test');
    expect(retrieved.autoSync).toBe(true);
    expect(retrieved.emailNotify).toBe(false);
  });

  it('merges saved config with defaults (missing keys use DEFAULT)', () => {
    // Only save partial config (no autoSync key)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled: true, siteUrl: 'https://x.mil', listName: 'L' }));
    const config = getSharePointConfig();
    expect(config.enabled).toBe(true);
    // autoSync should fall back to DEFAULT_SP_CONFIG.autoSync
    expect(config.autoSync).toBe(DEFAULT_SP_CONFIG.autoSync);
  });

  it('handles localStorage.setItem throwing gracefully', () => {
    const originalSetItem = localStorage.setItem.bind(localStorage);
    vi.spyOn(localStorage, 'setItem').mockImplementationOnce(() => { throw new Error('QuotaExceededError'); });
    // Should not throw
    expect(() => saveSharePointConfig(DEFAULT_SP_CONFIG)).not.toThrow();
  });
});

// ─── testSharePointConnection ─────────────────────────────────────────────────
describe('testSharePointConnection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns failure when siteUrl is missing', async () => {
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, siteUrl: '', listName: 'L' };
    const result = await testSharePointConnection(config);
    expect(result.success).toBe(false);
    expect(result.message).toContain('required');
  });

  it('returns failure when listName is missing', async () => {
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, siteUrl: 'https://x.mil', listName: '' };
    const result = await testSharePointConnection(config);
    expect(result.success).toBe(false);
    expect(result.message).toContain('required');
  });

  it('returns failure with 404 message when list not found', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }));
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: true, siteUrl: 'https://test.mil', listName: 'Missing' };
    const result = await testSharePointConnection(config);
    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('returns failure with auth message on 401', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' }));
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: true, siteUrl: 'https://test.mil', listName: 'L' };
    const result = await testSharePointConnection(config);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Access Denied');
  });

  it('returns failure with auth message on 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' }));
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: true, siteUrl: 'https://test.mil', listName: 'L' };
    const result = await testSharePointConnection(config);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Access Denied');
  });

  it('returns failure with HTTP status on other non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: 'Server Error' }));
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: true, siteUrl: 'https://test.mil', listName: 'L' };
    const result = await testSharePointConnection(config);
    expect(result.success).toBe(false);
    expect(result.message).toContain('500');
  });

  it('returns success with item count on OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ d: { results: [{}, {}, {}] } }),
    }));
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: true, siteUrl: 'https://test.mil', listName: 'APEX_Evaluations' };
    const result = await testSharePointConnection(config);
    expect(result.success).toBe(true);
    expect(result.itemCount).toBe(3);
    expect(result.message).toContain('Successfully connected');
  });

  it('returns failure on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: true, siteUrl: 'https://test.mil', listName: 'L' };
    const result = await testSharePointConnection(config);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Network failure');
  });
});

// ─── sendSharePointEmail ──────────────────────────────────────────────────────
describe('sendSharePointEmail', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns failure when SharePoint is not enabled', async () => {
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: false };
    const result = await sendSharePointEmail(config, 'x@navy.mil', 'Subject', 'Body');
    expect(result.success).toBe(false);
    expect(result.message).toContain('not enabled');
  });

  it('returns failure when siteUrl is missing', async () => {
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: true, siteUrl: '' };
    const result = await sendSharePointEmail(config, 'x@navy.mil', 'Subject', 'Body');
    expect(result.success).toBe(false);
    expect(result.message).toContain('not enabled');
  });

  it('returns success on OK response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: true, siteUrl: 'https://test.mil', listName: 'L' };
    const result = await sendSharePointEmail(config, 'x@navy.mil', 'Subject', 'Body');
    expect(result.success).toBe(true);
    expect(result.message).toContain('dispatched');
  });

  it('returns failure on non-ok HTTP response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: true, siteUrl: 'https://test.mil', listName: 'L' };
    const result = await sendSharePointEmail(config, 'x@navy.mil', 'Subject', 'Body');
    expect(result.success).toBe(false);
    expect(result.message).toContain('500');
  });

  it('returns failure on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('CORS blocked')));
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: true, siteUrl: 'https://test.mil', listName: 'L' };
    const result = await sendSharePointEmail(config, 'x@navy.mil', 'Subject', 'Body');
    expect(result.success).toBe(false);
    expect(result.message).toContain('CORS blocked');
  });

  it('converts newlines to <br/> in the request body', async () => {
    let capturedBody: string | null = null;
    vi.stubGlobal('fetch', vi.fn().mockImplementation((_url, opts) => {
      capturedBody = opts.body;
      return Promise.resolve({ ok: true });
    }));
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: true, siteUrl: 'https://test.mil', listName: 'L' };
    await sendSharePointEmail(config, 'x@navy.mil', 'Subject', 'Line 1\nLine 2');
    expect(capturedBody).toContain('<br/>');
    expect(capturedBody).not.toContain('Line 1\nLine 2');
  });
});

// ─── syncEvaluationToSharePoint ───────────────────────────────────────────────
describe('syncEvaluationToSharePoint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  const mockEval: any = {
    id: 'eval-sp-001',
    report_type: 'EVAL',
    member_name: 'DOE, JOHN A',
    dod_id: '1234567890',
    grade_rate: 'PO1',
    period_to: '2025-09-30',
    routing_stage: 'sailor',
    promotion_recommendation: 'Promotable',
    trait_average: 4.0,
    current_holder_name: 'DOE, JOHN A',
    current_holder_role: 'Sailor',
  };

  it('returns failure when SP is disabled', async () => {
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: false, siteUrl: 'https://x.mil', listName: 'L' };
    const result = await syncEvaluationToSharePoint(mockEval, config);
    expect(result.success).toBe(false);
    expect(result.message).toContain('disabled');
  });

  it('returns failure when siteUrl is empty', async () => {
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: true, siteUrl: '', listName: 'L' };
    const result = await syncEvaluationToSharePoint(mockEval, config);
    expect(result.success).toBe(false);
  });

  it('returns success on OK sync', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: true, siteUrl: 'https://test.mil', listName: 'APEX_Evals' };
    const result = await syncEvaluationToSharePoint(mockEval, config);
    expect(result.success).toBe(true);
    expect(result.message).toContain('successfully synchronized');
  });

  it('returns failure on non-ok HTTP sync response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' }));
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: true, siteUrl: 'https://test.mil', listName: 'L' };
    const result = await syncEvaluationToSharePoint(mockEval, config);
    expect(result.success).toBe(false);
    expect(result.message).toContain('403');
  });

  it('returns failure on network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Timeout')));
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: true, siteUrl: 'https://test.mil', listName: 'L' };
    const result = await syncEvaluationToSharePoint(mockEval, config);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Timeout');
  });

  it('updates lastSyncAt in localStorage after successful sync', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: true, siteUrl: 'https://test.mil', listName: 'L' };
    await syncEvaluationToSharePoint(mockEval, config);
    const saved = getSharePointConfig();
    expect(saved.lastSyncAt).toBeTruthy();
  });

  it('handles eval with no trait_average gracefully', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const config: SharePointConfig = { ...DEFAULT_SP_CONFIG, enabled: true, siteUrl: 'https://test.mil', listName: 'L' };
    const evalNoAvg = { ...mockEval, trait_average: undefined };
    const result = await syncEvaluationToSharePoint(evalNoAvg, config);
    expect(result.success).toBe(true);
  });
});
