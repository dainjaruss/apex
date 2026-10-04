// src/lib/formDefinitions.test.ts
// Tests for pure async functions in formDefinitions.ts.

import { describe, it, expect } from 'vitest';
import {
  getFormDefinition,
  listActiveForms,
  getEvalSeed,
  getChiefEvalSeed,
  getFitrepSeed,
} from './formDefinitions';

// ─── getFormDefinition ────────────────────────────────────────────────────────
describe('getFormDefinition', () => {
  it('returns EVAL definition for "EVAL"', async () => {
    const def = await getFormDefinition('EVAL');
    expect(def).not.toBeNull();
    expect(def.form_code).toBe('EVAL');
    expect(def.navpers_number).toBe('1616/26');
    expect(def.paygrade_range).toBe('E1-E6');
  });

  it('returns CHIEFEVAL definition for "CHIEFEVAL"', async () => {
    const def = await getFormDefinition('CHIEFEVAL');
    expect(def).not.toBeNull();
    expect(def.form_code).toBe('CHIEFEVAL');
    expect(def.navpers_number).toBe('1616/27');
    expect(def.paygrade_range).toBe('E7-E9');
  });

  it('returns FITREP_W2_O6 definition for "FITREP_W2_O6"', async () => {
    const def = await getFormDefinition('FITREP_W2_O6');
    expect(def).not.toBeNull();
    expect(def.form_code).toBe('FITREP_W2_O6');
    expect(def.navpers_number).toBe('1610/2');
    expect(def.paygrade_range).toBe('W2-O6');
  });

  it('returns null for an unknown form code', async () => {
    const def = await getFormDefinition('UNKNOWN_FORM');
    expect(def).toBeNull();
  });

  it('each definition includes a blocks object with a title', async () => {
    for (const code of ['EVAL', 'CHIEFEVAL', 'FITREP_W2_O6']) {
      const def = await getFormDefinition(code);
      expect(def.blocks).toBeDefined();
      expect(def.blocks.title).toBeTruthy();
    }
  });

  it('each definition includes Block 1 (Name)', async () => {
    for (const code of ['EVAL', 'CHIEFEVAL', 'FITREP_W2_O6']) {
      const def = await getFormDefinition(code);
      const block1 = def.blocks.blocks.find((b: any) => b.number === 1);
      expect(block1).toBeDefined();
      expect(block1.name).toBe('Name');
    }
  });
});

// ─── listActiveForms ──────────────────────────────────────────────────────────
describe('listActiveForms', () => {
  it('returns an array of all active form definitions', async () => {
    const forms = await listActiveForms();
    expect(Array.isArray(forms)).toBe(true);
    expect(forms.length).toBeGreaterThanOrEqual(3);
  });

  it('includes EVAL, CHIEFEVAL, and FITREP_W2_O6', async () => {
    const forms = await listActiveForms();
    const codes = forms.map((f: any) => f.form_code);
    expect(codes).toContain('EVAL');
    expect(codes).toContain('CHIEFEVAL');
    expect(codes).toContain('FITREP_W2_O6');
  });

  it('each form has a navpers_number', async () => {
    const forms = await listActiveForms();
    for (const form of forms) {
      expect((form as any).navpers_number).toBeTruthy();
    }
  });
});

// ─── getEvalSeed ──────────────────────────────────────────────────────────────
describe('getEvalSeed', () => {
  it('returns a seed with EVAL form_definition_id', () => {
    const seed = getEvalSeed();
    expect(seed.form_definition_id).toBe('e1616260-cafe-4b08-9df2-5d8f28d8b4cd');
  });

  it('starts with empty member fields', () => {
    const seed = getEvalSeed();
    expect(seed.member_name).toBe('');
    expect(seed.dod_id).toBe('');
    expect(seed.grade_rate).toBe('');
  });

  it('defaults duty_status to ACT', () => {
    const seed = getEvalSeed();
    expect(seed.duty_status).toBe('ACT');
  });

  it('defaults promotion_status to Regular', () => {
    const seed = getEvalSeed();
    expect(seed.promotion_status).toBe('Regular');
  });

  it('starts with empty trait_grades object', () => {
    const seed = getEvalSeed();
    expect(seed.trait_grades).toEqual({});
  });

  it('status is draft', () => {
    const seed = getEvalSeed();
    expect(seed.status).toBe('draft');
  });

  it('promotion_recommendation defaults to Promotable', () => {
    const seed = getEvalSeed();
    expect(seed.promotion_recommendation).toBe('Promotable');
  });

  it('retention defaults to Recommended', () => {
    const seed = getEvalSeed();
    expect(seed.retention).toBe('Recommended');
  });

  it('billet_subcategory defaults to NA', () => {
    const seed = getEvalSeed();
    expect(seed.block_values.billet_subcategory).toBe('NA');
  });

  it('career_recommendations has exactly two empty slots', () => {
    const seed = getEvalSeed();
    expect(seed.career_recommendations).toEqual(['', '']);
  });
});

// ─── getChiefEvalSeed ─────────────────────────────────────────────────────────
describe('getChiefEvalSeed', () => {
  it('returns a seed with CHIEFEVAL form_definition_id', () => {
    const seed = getChiefEvalSeed();
    expect(seed.form_definition_id).toBe('c1616270-cafe-4b08-9df2-5d8f28d8b4cd');
  });

  it('has report_type CHIEFEVAL', () => {
    const seed = getChiefEvalSeed();
    expect(seed.report_type).toBe('CHIEFEVAL');
  });

  it('does NOT have a retention field (E7-E9 no retention block)', () => {
    const seed = getChiefEvalSeed();
    expect((seed as any).retention).toBeUndefined();
  });

  it('has empty trait_grades', () => {
    const seed = getChiefEvalSeed();
    expect(seed.trait_grades).toEqual({});
  });
});

// ─── getFitrepSeed ────────────────────────────────────────────────────────────
describe('getFitrepSeed', () => {
  it('returns a seed with default FITREP_W2_O6 form_definition_id', () => {
    const seed = getFitrepSeed();
    expect(seed.form_definition_id).toBe('f1610020-cafe-4b08-9df2-5d8f28d8b4cd');
  });

  it('accepts FITREP_O7_O8 form code', () => {
    const seed = getFitrepSeed('FITREP_O7_O8');
    expect(seed.form_definition_id).toBe('f1610050-cafe-4b08-9df2-5d8f28d8b4cd');
  });

  it('has report_type FITREP', () => {
    const seed = getFitrepSeed();
    expect(seed.report_type).toBe('FITREP');
  });

  it('does NOT have a retention field (officer, no retention block)', () => {
    const seed = getFitrepSeed();
    expect((seed as any).retention).toBeUndefined();
  });

  it('has empty trait_grades', () => {
    const seed = getFitrepSeed();
    expect(seed.trait_grades).toEqual({});
  });

  it('defaults to FITREP_W2_O6 id for unknown form code', () => {
    const seed = getFitrepSeed('FITREP_UNKNOWN');
    expect(seed.form_definition_id).toBe('f1610020-cafe-4b08-9df2-5d8f28d8b4cd');
  });
});
