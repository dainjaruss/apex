// src/lib/validationEngine.test.ts
// Tests for validationEngine.ts — block mapping, trait map selection, runFullValidation cross-field rules,
// and generateErrorReport formatting.

import { describe, it, expect } from 'vitest';
import {
  getBlockForField,
  getTraitMap,
  runFullValidation,
  generateErrorReport,
} from './validationEngine';
import type { Evaluation } from '@/types';

// ─── getBlockForField ─────────────────────────────────────────────────────────
describe('getBlockForField', () => {
  it('maps known scalar fields to their block numbers', () => {
    expect(getBlockForField('member_name')).toBe(1);
    expect(getBlockForField('grade_rate')).toBe(2);
    expect(getBlockForField('dod_id')).toBe(4);
    expect(getBlockForField('duty_status')).toBe(5);
    expect(getBlockForField('uic')).toBe(6);
    expect(getBlockForField('period_from')).toBe(14);
    expect(getBlockForField('period_to')).toBe(15);
    expect(getBlockForField('billet_subcategory')).toBe(21);
    expect(getBlockForField('comments')).toBe(43);
    expect(getBlockForField('promotion_recommendation')).toBe(45);
  });

  it('maps trait_grades.knowledge → Block 33 (EVAL)', () => {
    expect(getBlockForField('trait_grades.knowledge')).toBe(33);
  });

  it('maps trait_grades.work → Block 34 (EVAL)', () => {
    expect(getBlockForField('trait_grades.work')).toBe(34);
  });

  it('maps trait_grades.leadership → Block 39 (EVAL)', () => {
    expect(getBlockForField('trait_grades.leadership')).toBe(39);
  });

  it('maps bare trait_grades to Block 33 (fallback)', () => {
    expect(getBlockForField('trait_grades')).toBe(33);
  });

  it('returns undefined for unknown field', () => {
    expect(getBlockForField('nonexistent_field')).toBeUndefined();
  });
});

// ─── getTraitMap ──────────────────────────────────────────────────────────────
describe('getTraitMap', () => {
  it('returns EVAL (enlisted) map by default', () => {
    const map = getTraitMap('EVAL');
    expect(map.knowledge).toBe(33);
    expect(map.leadership).toBe(39);
    expect(map.eo).toBe(35);
  });

  it('returns EVAL map when reportType is undefined', () => {
    const map = getTraitMap(undefined);
    expect(map.knowledge).toBe(33);
  });

  it('returns CHIEFEVAL map with accountability at Block 37', () => {
    const map = getTraitMap('CHIEFEVAL');
    expect(map.technical_mastery).toBe(33);
    expect(map.accountability).toBe(37);
    expect(map.deckplate_leadership).toBe(38);
    expect(map.team_effectiveness).toBe(39);
  });

  it('returns FITREP map with tactical_performance at Block 39', () => {
    const map = getTraitMap('FITREP');
    expect(map.knowledge).toBe(33);
    expect(map.tactical_performance).toBe(39);
  });
});

// ─── Evaluation fixture builder ───────────────────────────────────────────────
function makeFullEval(overrides: Partial<Evaluation> = {}): Evaluation {
  return {
    id: 'eval-test-1',
    report_type: 'EVAL',
    member_name: 'DOE, JOHN A',
    dod_id: '1234567890',
    grade_rate: 'PO1',
    designator: 'SW',
    period_from: '2025-01-01',
    period_to: '2025-09-30',
    duty_status: 'ACT',
    uic: 'N1234',
    ship_station: 'USS TEST DDG-99',
    promotion_status: 'Regular',
    trait_grades: {
      knowledge: '4.0', work: '4.0', eo: '4.0', bearing: '4.0',
      accomplishment: '4.0', teamwork: '4.0', leadership: '4.0',
    },
    comments: 'Shipmate performed exceptionally well throughout the reporting period.',
    career_recommendations: ['LCPO'],
    promotion_recommendation: 'Promotable',
    retention: 'Recommended',
    status: 'draft',
    block_values: {
      physical_readiness: 'P',
      date_reported: '2025-09-30',
      billet_subcategory: 'NA',
      reporting_senior_name: 'SMITH, J A',
      reporting_senior_grade: 'CAPT',
      reporting_senior_designator: '1110',
      reporting_senior_title: 'CO',
      reporting_senior_uic: 'N0002',
      reporting_senior_dod_id: '9876543210',
      command_achievements: 'BATTLE E RECIPIENT FY26',
      primary_duty_abbrev: 'IT1',
      primary_duties: 'INFORMATION SYSTEMS TECHNICIAN',
      date_counseled: '2025-09-15',
      counselor: 'SMITH, J A',
      periodic: true,
      regular_report: true,
      comment_pitch: '12',
      comment_pitch_v: 2,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as unknown as Evaluation;
}

// ─── runFullValidation — clean eval ─────────────────────────────────────────
describe('runFullValidation — clean evaluation', () => {
  it('passes a fully valid EVAL with no errors or warnings (except designator warning)', () => {
    const ev = makeFullEval();
    const result = runFullValidation(ev);
    expect(result.errors).toHaveLength(0);
  });

  it('returns success:true for a clean eval', () => {
    const result = runFullValidation(makeFullEval());
    expect(result.success).toBe(true);
  });
});

// ─── runFullValidation — occasion rules ─────────────────────────────────────
describe('runFullValidation — Occasion for Report (Blocks 10-13)', () => {
  it('errors when no occasion is selected', () => {
    const ev = makeFullEval({
      block_values: { ...makeFullEval().block_values, periodic: false, detachment_individual: false, promotion_frocking: false, special: false } as any,
    });
    const result = runFullValidation(ev);
    const occasionErr = result.errors.find(e => e.field === 'occasion');
    expect(occasionErr).toBeDefined();
    expect(occasionErr?.block).toBe(10);
  });

  it('errors when Special is combined with another occasion', () => {
    const ev = makeFullEval({
      block_values: { ...makeFullEval().block_values, periodic: true, special: true } as any,
    });
    const result = runFullValidation(ev);
    const specialErr = result.errors.find(e => e.block === 13);
    expect(specialErr).toBeDefined();
    expect(specialErr?.message).toContain('Special');
  });

  it('allows a solo Special report', () => {
    const ev = makeFullEval({
      block_values: { ...makeFullEval().block_values, periodic: false, special: true } as any,
    });
    const result = runFullValidation(ev);
    const specialErr = result.errors.find(e => e.block === 13);
    expect(specialErr).toBeUndefined();
  });
});

// ─── runFullValidation — type of report rules ────────────────────────────────
describe('runFullValidation — Type of Report (Blocks 16-18)', () => {
  it('errors when no type is selected', () => {
    const ev = makeFullEval({
      block_values: {
        ...makeFullEval().block_values,
        regular_report: false,
        concurrent_report: false,
        not_observed: false,
      } as any,
    });
    const result = runFullValidation(ev);
    const typeErr = result.errors.find(e => e.field === 'type' && e.block === 16);
    expect(typeErr).toBeDefined();
  });

  it('warns when not_observed is selected', () => {
    const ev = makeFullEval({
      block_values: {
        ...makeFullEval().block_values,
        not_observed: true,
        regular_report: false,
      } as any,
    });
    const result = runFullValidation(ev);
    const notObsWarn = result.warnings.find(w => w.field === 'type' && w.block === 16);
    expect(notObsWarn).toBeDefined();
    expect(notObsWarn?.message).toContain('Not Observed');
  });
});

// ─── runFullValidation — ungraded traits ─────────────────────────────────────
describe('runFullValidation — trait grading (Block 33-39)', () => {
  it('errors for each ungraded trait on an observed report', () => {
    const ev = makeFullEval({
      trait_grades: { knowledge: '4.0' }, // only one trait graded
    });
    const result = runFullValidation(ev);
    const traitErrors = result.errors.filter(e => e.field.startsWith('trait_grades.'));
    expect(traitErrors.length).toBeGreaterThan(0);
  });

  it('does NOT require trait grades on a not_observed report', () => {
    const ev = makeFullEval({
      trait_grades: {},
      block_values: {
        ...makeFullEval().block_values,
        not_observed: true,
        regular_report: false,
        promotion_recommendation: 'NOB',
      } as any,
      promotion_recommendation: 'NOB',
    });
    const result = runFullValidation(ev);
    const traitErrors = result.errors.filter(e => e.field.startsWith('trait_grades.'));
    expect(traitErrors).toHaveLength(0);
  });
});

// ─── runFullValidation — Block 43 substantiation ──────────────────────────────
describe('runFullValidation — Block 43 substantiation', () => {
  it('errors when a 1.0 trait is present but comments are empty', () => {
    const ev = makeFullEval({
      trait_grades: { knowledge: '1.0', work: '4.0', eo: '4.0', bearing: '4.0', accomplishment: '4.0', teamwork: '4.0', leadership: '4.0' },
      comments: '',
    });
    const result = runFullValidation(ev);
    const substErr = result.errors.find(e => e.block === 43 && e.message.includes('substantiate'));
    expect(substErr).toBeDefined();
  });

  it('warns (not errors) when a 1.0 trait is present and comments are populated', () => {
    const ev = makeFullEval({
      trait_grades: { knowledge: '1.0', work: '4.0', eo: '4.0', bearing: '4.0', accomplishment: '4.0', teamwork: '4.0', leadership: '4.0' },
      comments: 'Knowledge was severely deficient due to...',
    });
    const result = runFullValidation(ev);
    const substWarn = result.warnings.find(w => w.block === 43);
    expect(substWarn).toBeDefined();
    const substErr = result.errors.find(e => e.block === 43 && e.message.includes('substantiate'));
    expect(substErr).toBeUndefined();
  });

  it('errors when 3+ 2.0 grades are present on an EVAL and comments are empty', () => {
    const ev = makeFullEval({
      trait_grades: { knowledge: '2.0', work: '2.0', eo: '2.0', bearing: '4.0', accomplishment: '4.0', teamwork: '4.0', leadership: '4.0' },
      comments: '',
    });
    const result = runFullValidation(ev);
    const substErr = result.errors.find(e => e.block === 43);
    expect(substErr).toBeDefined();
  });

  it('errors when EO (Block 35) is 2.0 and comments are empty', () => {
    const ev = makeFullEval({
      trait_grades: { knowledge: '4.0', work: '4.0', eo: '2.0', bearing: '4.0', accomplishment: '4.0', teamwork: '4.0', leadership: '4.0' },
      comments: '',
    });
    const result = runFullValidation(ev);
    const substErr = result.errors.find(e => e.block === 43);
    expect(substErr).toBeDefined();
  });
});

// ─── runFullValidation — 3-two-grade promotion bar ───────────────────────────
describe('runFullValidation — three 2.0 grades bar Promotable', () => {
  it('errors when 3+ 2.0 grades and rec is Promotable', () => {
    const ev = makeFullEval({
      trait_grades: { knowledge: '2.0', work: '2.0', eo: '4.0', bearing: '2.0', accomplishment: '4.0', teamwork: '4.0', leadership: '4.0' },
      promotion_recommendation: 'Promotable',
      comments: 'Some comment to avoid substantiation error.',
    });
    const result = runFullValidation(ev);
    const barErr = result.errors.find(e => e.block === 45);
    expect(barErr).toBeDefined();
    expect(barErr?.message).toContain('2.0');
  });

  it('does NOT flag the bar for Progressing with 3+ 2.0 grades', () => {
    const ev = makeFullEval({
      trait_grades: { knowledge: '2.0', work: '2.0', eo: '4.0', bearing: '2.0', accomplishment: '4.0', teamwork: '4.0', leadership: '4.0' },
      promotion_recommendation: 'Progressing',
      comments: 'Some comment.',
    });
    const result = runFullValidation(ev);
    const barErr = result.errors.find(e => e.block === 45);
    expect(barErr).toBeUndefined();
  });
});

// ─── runFullValidation — comment overflow ─────────────────────────────────────
describe('runFullValidation — comment text overflow', () => {
  it('errors when CHIEFEVAL comments exceed 8 lines at 12-pitch', () => {
    // 9 lines * 90 chars
    const longComment = Array(9).fill('A'.repeat(89)).join('\n');
    const ev = makeFullEval({
      report_type: 'CHIEFEVAL',
      trait_grades: {
        technical_mastery: '4.0', institutional_expertise: '4.0', professionalism: '4.0',
        integrity: '4.0', accountability: '4.0', deckplate_leadership: '4.0', team_effectiveness: '4.0',
      },
      comments: longComment,
    });
    const result = runFullValidation(ev);
    const overflowErr = result.errors.find(e => e.field === 'comments' && e.message.includes('exceeds'));
    expect(overflowErr).toBeDefined();
  });
});

// ─── runFullValidation — starred billet subcategory ───────────────────────────
describe('runFullValidation — starred billet subcategory', () => {
  it('warns when STUDENT subcategory is not mentioned in Block 29', () => {
    const ev = makeFullEval({
      block_values: {
        ...makeFullEval().block_values,
        billet_subcategory: 'STUDENT',
        primary_duties: 'INFORMATION SYSTEMS TECHNICIAN',
        primary_duty_abbrev: 'IT1',
      } as any,
    });
    const result = runFullValidation(ev);
    const subcatWarn = result.warnings.find(w => w.field === 'billet_subcategory');
    expect(subcatWarn).toBeDefined();
    expect(subcatWarn?.message).toContain('STUDENT');
  });

  it('does not warn when STUDENT appears in Block 29', () => {
    const ev = makeFullEval({
      block_values: {
        ...makeFullEval().block_values,
        billet_subcategory: 'STUDENT',
        primary_duties: 'STUDENT AT NPS MONTEREY',
        primary_duty_abbrev: 'STUDENT',
      } as any,
    });
    const result = runFullValidation(ev);
    const subcatWarn = result.warnings.find(w => w.field === 'billet_subcategory');
    expect(subcatWarn).toBeUndefined();
  });
});

// ─── runFullValidation — designator warning ───────────────────────────────────
describe('runFullValidation — designator', () => {
  it('warns when designator is absent on an enlisted EVAL', () => {
    const ev = makeFullEval({ designator: undefined });
    const result = runFullValidation(ev);
    const desigWarn = result.warnings.find(w => w.field === 'designator');
    expect(desigWarn).toBeDefined();
  });

  it('does NOT warn when designator is present', () => {
    const ev = makeFullEval({ designator: 'SW' });
    const result = runFullValidation(ev);
    const desigWarn = result.warnings.find(w => w.field === 'designator');
    expect(desigWarn).toBeUndefined();
  });
});

// ─── generateErrorReport ──────────────────────────────────────────────────────
describe('generateErrorReport', () => {
  it('returns success message for a clean result', () => {
    const report = generateErrorReport({ success: true, errors: [], warnings: [] });
    expect(report).toContain('✓ Validation Complete');
  });

  it('formats errors with block numbers', () => {
    const result = {
      success: false,
      errors: [{ field: 'comments', block: 43, message: 'Block 43 is too long.', severity: 'error' as const }],
      warnings: [],
    };
    const report = generateErrorReport(result);
    expect(report).toContain('[Block 43]');
    expect(report).toContain('Block 43 is too long.');
    expect(report).toContain('Validation Errors (1)');
  });

  it('formats warnings separately from errors', () => {
    const result = {
      success: true,
      errors: [],
      warnings: [{ field: 'designator', block: 3, message: 'Check designator.', severity: 'warning' as const }],
    };
    const report = generateErrorReport(result);
    expect(report).toContain('Validation Warnings (1)');
    expect(report).toContain('[Block 3]');
  });

  it('handles issues without block numbers as [General]', () => {
    const result = {
      success: false,
      errors: [{ field: 'occasion', block: undefined, message: 'Select an occasion.', severity: 'error' as const }],
      warnings: [],
    };
    const report = generateErrorReport(result);
    expect(report).toContain('[General]');
  });

  it('includes both errors and warnings sections when both are present', () => {
    const result = {
      success: false,
      errors: [{ field: 'member_name', block: 1, message: 'Name required.', severity: 'error' as const }],
      warnings: [{ field: 'designator', block: 3, message: 'Check designator.', severity: 'warning' as const }],
    };
    const report = generateErrorReport(result);
    expect(report).toContain('Validation Errors');
    expect(report).toContain('Validation Warnings');
  });
});

// ─── runFullValidation — FITREP EO (Block 34) substantiation ─────────────────
describe('runFullValidation — FITREP EO Block 34 substantiation', () => {
  function makeFitrepEval(overrides: Partial<Evaluation> = {}): Evaluation {
    return {
      id: 'fitrep-test-1',
      report_type: 'FITREP',
      member_name: 'DOE, JOHN A',
      dod_id: '1234567890',
      grade_rate: 'O3',
      designator: '1110',
      period_from: '2025-01-01',
      period_to: '2025-09-30',
      duty_status: 'ACT',
      uic: 'N1234',
      ship_station: 'USS TEST DDG-99',
      promotion_status: 'Regular',
      trait_grades: {
        knowledge: '4.0', eo: '4.0', bearing: '4.0',
        teamwork: '4.0', accomplishment: '4.0', leadership: '4.0',
        tactical_performance: '4.0',
      },
      comments: 'Excellent officer who demonstrated superior tactical performance.',
      career_recommendations: ['DEPARTMENT HEAD'],
      promotion_recommendation: 'Promotable',
      status: 'draft',
      block_values: {
        physical_readiness: 'P',
        date_reported: '2025-09-30',
        billet_subcategory: 'NA',
        reporting_senior_name: 'SMITH, J A',
        reporting_senior_grade: 'CAPT',
        reporting_senior_designator: '1110',
        reporting_senior_title: 'CO',
        reporting_senior_uic: 'N0002',
        reporting_senior_dod_id: '9876543210',
        command_achievements: 'BATTLE E RECIPIENT FY26',
        primary_duty_abbrev: 'OPS',
        primary_duties: 'OPERATIONS OFFICER',
        date_counseled: '2025-09-15',
        counselor: 'SMITH, J A',
        periodic: true,
        regular_report: true,
        comment_pitch: '12',
        comment_pitch_v: 2,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    } as unknown as Evaluation;
  }

  it('errors when FITREP Block 34 (EO/climate) is 2.0 and comments are empty', () => {
    const ev = makeFitrepEval({
      trait_grades: {
        knowledge: '4.0', eo: '2.0', bearing: '4.0',
        teamwork: '4.0', accomplishment: '4.0', leadership: '4.0',
        tactical_performance: '4.0',
      },
      comments: '',
    });
    const result = runFullValidation(ev);
    // The engine emits substantiation errors on block 43 regardless of form type
    const substErr = result.errors.find(e => e.block === 43 && e.message.includes('substantiate'));
    expect(substErr).toBeDefined();
    expect(substErr?.message).toContain('2.0');
  });

  it('warns (not errors) when FITREP Block 34 is 2.0 and comments exist', () => {
    const ev = makeFitrepEval({
      trait_grades: {
        knowledge: '4.0', eo: '2.0', bearing: '4.0',
        teamwork: '4.0', accomplishment: '4.0', leadership: '4.0',
        tactical_performance: '4.0',
      },
      comments: 'Command climate was impacted by the following factors...',
    });
    const result = runFullValidation(ev);
    const substWarn = result.warnings.find(w => w.block === 43);
    expect(substWarn).toBeDefined();
    const substErr = result.errors.find(e => e.block === 43 && e.message.includes('substantiate'));
    expect(substErr).toBeUndefined();
  });

  it('errors when FITREP has 3+ 2.0 marks and comments are empty', () => {
    const ev = makeFitrepEval({
      trait_grades: {
        knowledge: '2.0', eo: '2.0', bearing: '2.0',
        teamwork: '4.0', accomplishment: '4.0', leadership: '4.0',
        tactical_performance: '4.0',
      },
      comments: '',
      promotion_recommendation: 'Progressing',
    });
    const result = runFullValidation(ev);
    const substErr = result.errors.find(e => e.block === 43 && e.message.includes('substantiate'));
    expect(substErr).toBeDefined();
  });

  it('clean FITREP returns success:true', () => {
    const ev = makeFitrepEval();
    const result = runFullValidation(ev);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ─── runFullValidation — CHIEFEVAL substantiation (every 2.0 triggers) ───────
describe('runFullValidation — CHIEFEVAL all-2.0 substantiation', () => {
  function makeChiefEval(overrides: Partial<Evaluation> = {}): Evaluation {
    return {
      id: 'chiefeval-test-1',
      report_type: 'CHIEFEVAL',
      member_name: 'DOE, JOHN A',
      dod_id: '1234567890',
      grade_rate: 'E7',
      period_from: '2025-01-01',
      period_to: '2025-09-30',
      duty_status: 'ACT',
      uic: 'N1234',
      ship_station: 'USS TEST DDG-99',
      promotion_status: 'Regular',
      trait_grades: {
        technical_mastery: '4.0', institutional_expertise: '4.0',
        professionalism: '4.0', integrity: '4.0',
        accountability: '4.0', deckplate_leadership: '4.0',
        team_effectiveness: '4.0',
      },
      comments: 'Chief petty officer demonstrated exceptional leadership.',
      career_recommendations: ['SENIOR CHIEF'],
      promotion_recommendation: 'Promotable',
      status: 'draft',
      block_values: {
        physical_readiness: 'P',
        date_reported: '2025-09-30',
        billet_subcategory: 'NA',
        reporting_senior_name: 'SMITH, J A',
        reporting_senior_grade: 'CAPT',
        reporting_senior_designator: '1110',
        reporting_senior_title: 'CO',
        reporting_senior_uic: 'N0002',
        reporting_senior_dod_id: '9876543210',
        command_achievements: 'BATTLE E RECIPIENT FY26',
        primary_duty_abbrev: 'ITC',
        primary_duties: 'INFORMATION SYSTEMS TECH CHIEF',
        date_counseled: '2025-09-15',
        counselor: 'SMITH, J A',
        periodic: true,
        regular_report: true,
        comment_pitch: '12',
        comment_pitch_v: 2,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    } as unknown as Evaluation;
  }

  it('errors when any single CHIEFEVAL trait is 2.0 and comments are empty', () => {
    const ev = makeChiefEval({
      trait_grades: {
        technical_mastery: '2.0', institutional_expertise: '4.0',
        professionalism: '4.0', integrity: '4.0',
        accountability: '4.0', deckplate_leadership: '4.0',
        team_effectiveness: '4.0',
      },
      comments: '',
    });
    const result = runFullValidation(ev);
    // Engine hard-codes block 43 for substantiation errors across all form types
    const substErr = result.errors.find(e => e.block === 43 && e.message.includes('substantiate'));
    expect(substErr).toBeDefined();
    expect(substErr?.message).toContain('substantiate');
  });

  it('warns when single CHIEFEVAL 2.0 is present and comments are non-empty', () => {
    const ev = makeChiefEval({
      trait_grades: {
        technical_mastery: '2.0', institutional_expertise: '4.0',
        professionalism: '4.0', integrity: '4.0',
        accountability: '4.0', deckplate_leadership: '4.0',
        team_effectiveness: '4.0',
      },
      comments: 'Technical mastery was limited due to ...',
    });
    const result = runFullValidation(ev);
    const substWarn = result.warnings.find(w => w.block === 43);
    expect(substWarn).toBeDefined();
    const substErr = result.errors.find(e => e.block === 43 && e.message.includes('substantiate'));
    expect(substErr).toBeUndefined();
  });

  it('clean CHIEFEVAL with all 4.0 traits returns success:true', () => {
    const ev = makeChiefEval();
    const result = runFullValidation(ev);
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ─── runFullValidation — field overflow checks ────────────────────────────────
describe('runFullValidation — field overflow (primary_duties, command_achievements)', () => {
  it('errors when primary_duties overflows Block 29B', () => {
    // Block 29B allows 3 lines at ~50 chars each — 4 lines definitely overflows
    const longDuties = Array(5).fill('INFORMATION SYSTEMS ADMINISTRATOR').join('\n');
    const ev = makeFullEval({
      block_values: {
        ...makeFullEval().block_values,
        primary_duties: longDuties,
      } as any,
    });
    const result = runFullValidation(ev);
    const overflowErr = result.errors.find(e => e.field === 'primary_duties');
    expect(overflowErr).toBeDefined();
    expect(overflowErr?.message).toContain('exceeds');
  });

  it('errors when command_achievements overflows Block 28', () => {
    // Block 28 is a short field — 30+ lines will exceed it
    const longAchievements = Array(35).fill('BATTLE E RECIPIENT AWARD').join('\n');
    const ev = makeFullEval({
      block_values: {
        ...makeFullEval().block_values,
        command_achievements: longAchievements,
      } as any,
    });
    const result = runFullValidation(ev);
    const overflowErr = result.errors.find(e => e.field === 'command_achievements');
    expect(overflowErr).toBeDefined();
  });
});

// ─── runFullValidation — FITREP 1.0 mark substantiation path ─────────────────
describe('runFullValidation — FITREP 1.0 mark', () => {
  function makeFitrepEvalClean(overrides: Partial<Evaluation> = {}): Evaluation {
    return {
      id: 'fitrep-1pt-test',
      report_type: 'FITREP',
      member_name: 'DOE, JOHN A',
      dod_id: '1234567890',
      grade_rate: 'O3',
      designator: '1110',
      period_from: '2025-01-01',
      period_to: '2025-09-30',
      duty_status: 'ACT',
      uic: 'N1234',
      ship_station: 'USS TEST DDG-99',
      promotion_status: 'Regular',
      trait_grades: {
        knowledge: '4.0', eo: '4.0', bearing: '4.0',
        teamwork: '4.0', accomplishment: '4.0', leadership: '4.0',
        tactical_performance: '4.0',
      },
      comments: 'Solid officer throughout the reporting period.',
      career_recommendations: ['DEPARTMENT HEAD'],
      promotion_recommendation: 'Promotable',
      status: 'draft',
      block_values: {
        physical_readiness: 'P',
        date_reported: '2025-09-30',
        billet_subcategory: 'NA',
        reporting_senior_name: 'SMITH, J A',
        reporting_senior_grade: 'CAPT',
        reporting_senior_designator: '1110',
        reporting_senior_title: 'CO',
        reporting_senior_uic: 'N0002',
        reporting_senior_dod_id: '9876543210',
        command_achievements: 'BATTLE E FY26',
        primary_duty_abbrev: 'OPS',
        primary_duties: 'OPERATIONS OFFICER',
        date_counseled: '2025-09-15',
        counselor: 'SMITH, J A',
        periodic: true,
        regular_report: true,
        comment_pitch: '12',
        comment_pitch_v: 2,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    } as unknown as Evaluation;
  }

  it('errors on empty comments when FITREP has a 1.0 trait (hits onesBlocks path)', () => {
    const ev = makeFitrepEvalClean({
      trait_grades: {
        knowledge: '1.0', eo: '4.0', bearing: '4.0',
        teamwork: '4.0', accomplishment: '4.0', leadership: '4.0',
        tactical_performance: '4.0',
      },
      comments: '',
      promotion_recommendation: 'Progressing',
    });
    const result = runFullValidation(ev);
    const substErr = result.errors.find(e => e.block === 43 && e.message.includes('1.0'));
    expect(substErr).toBeDefined();
  });

  it('warns on non-empty comments when FITREP has a 1.0 trait', () => {
    const ev = makeFitrepEvalClean({
      trait_grades: {
        knowledge: '1.0', eo: '4.0', bearing: '4.0',
        teamwork: '4.0', accomplishment: '4.0', leadership: '4.0',
        tactical_performance: '4.0',
      },
      comments: 'Block 33 Professional Expertise assessed as 1.0 due to ...',
      promotion_recommendation: 'Progressing',
    });
    const result = runFullValidation(ev);
    const substWarn = result.warnings.find(w => w.block === 43);
    expect(substWarn).toBeDefined();
  });
});

// ─── runFullValidation — CHIEFEVAL 1.0 mark path ─────────────────────────────
describe('runFullValidation — CHIEFEVAL 1.0 mark', () => {
  function makeChiefEvalClean(overrides: Partial<Evaluation> = {}): Evaluation {
    return {
      id: 'chiefeval-1pt-test',
      report_type: 'CHIEFEVAL',
      member_name: 'DOE, JOHN A',
      dod_id: '1234567890',
      grade_rate: 'E7',
      period_from: '2025-01-01',
      period_to: '2025-09-30',
      duty_status: 'ACT',
      uic: 'N1234',
      ship_station: 'USS TEST DDG-99',
      promotion_status: 'Regular',
      trait_grades: {
        technical_mastery: '4.0', institutional_expertise: '4.0',
        professionalism: '4.0', integrity: '4.0',
        accountability: '4.0', deckplate_leadership: '4.0',
        team_effectiveness: '4.0',
      },
      comments: 'Chief demonstrated strong leadership.',
      career_recommendations: ['SENIOR CHIEF'],
      promotion_recommendation: 'Promotable',
      status: 'draft',
      block_values: {
        physical_readiness: 'P',
        date_reported: '2025-09-30',
        billet_subcategory: 'NA',
        reporting_senior_name: 'SMITH, J A',
        reporting_senior_grade: 'CAPT',
        reporting_senior_designator: '1110',
        reporting_senior_title: 'CO',
        reporting_senior_uic: 'N0002',
        reporting_senior_dod_id: '9876543210',
        command_achievements: 'BATTLE E FY26',
        primary_duty_abbrev: 'ITC',
        primary_duties: 'IT SYSTEMS CHIEF',
        date_counseled: '2025-09-15',
        counselor: 'SMITH, J A',
        periodic: true,
        regular_report: true,
        comment_pitch: '12',
        comment_pitch_v: 2,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    } as unknown as Evaluation;
  }

  it('errors on empty comments when CHIEFEVAL has a 1.0 trait (hits onesBlocks path)', () => {
    const ev = makeChiefEvalClean({
      trait_grades: {
        technical_mastery: '1.0', institutional_expertise: '4.0',
        professionalism: '4.0', integrity: '4.0',
        accountability: '4.0', deckplate_leadership: '4.0',
        team_effectiveness: '4.0',
      },
      comments: '',
      promotion_recommendation: 'Progressing',
    });
    const result = runFullValidation(ev);
    const substErr = result.errors.find(e => e.block === 43 && e.message.includes('1.0'));
    expect(substErr).toBeDefined();
  });
});
