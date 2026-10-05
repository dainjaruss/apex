// src/lib/traitStandards.test.ts
// Tests for pure functions and constants in traitStandards.ts.

import { describe, it, expect } from 'vitest';
import {
  getCommentsBlock,
  getSubstantiationNote,
  resolveReportType,
  getTraitStandards,
  getTraitStandard,
  TRAIT_GRADE_LABELS,
  GRADE_SCALE_NOTE,
  SUBSTANTIATION_NOTE_EVAL,
  SUBSTANTIATION_NOTE_CHIEFEVAL,
  SUBSTANTIATION_NOTE_FITREP,
  ANCHOR_GRADES,
  navpersFormNumber,
  careerRecommendationBlock,
  careerRecommendationLabel,
  careerRecommendationLimitVerb,
  promotionBlock,
  qualificationsBlock,
  reportingSeniorAddressBlock,
  traitAverageLabel,
  summaryGroupAverageLabel,
  summaryBreakdownLabel,
} from './traitStandards';

// ─── getCommentsBlock ─────────────────────────────────────────────────────────
describe('getCommentsBlock', () => {
  it('returns 43 for EVAL (default)', () => {
    expect(getCommentsBlock('EVAL')).toBe(43);
  });

  it('returns 43 when report type is undefined', () => {
    expect(getCommentsBlock()).toBe(43);
  });

  it('returns 40 for CHIEFEVAL', () => {
    expect(getCommentsBlock('CHIEFEVAL')).toBe(40);
  });

  it('returns 41 for FITREP', () => {
    expect(getCommentsBlock('FITREP')).toBe(41);
  });

  it('returns 43 for unknown type', () => {
    expect(getCommentsBlock('UNKNOWN')).toBe(43);
  });
});

// ─── getSubstantiationNote ────────────────────────────────────────────────────
describe('getSubstantiationNote', () => {
  it('returns EVAL note by default', () => {
    expect(getSubstantiationNote()).toBe(SUBSTANTIATION_NOTE_EVAL);
  });

  it('returns EVAL note for EVAL report type', () => {
    expect(getSubstantiationNote('EVAL')).toBe(SUBSTANTIATION_NOTE_EVAL);
  });

  it('returns CHIEFEVAL note for CHIEFEVAL', () => {
    expect(getSubstantiationNote('CHIEFEVAL')).toBe(SUBSTANTIATION_NOTE_CHIEFEVAL);
    expect(getSubstantiationNote('CHIEFEVAL')).toContain('1616/27');
  });

  it('returns FITREP note for FITREP', () => {
    expect(getSubstantiationNote('FITREP')).toBe(SUBSTANTIATION_NOTE_FITREP);
    expect(getSubstantiationNote('FITREP')).toContain('1610/2');
  });

  it('CHIEFEVAL note mentions Block 40', () => {
    expect(getSubstantiationNote('CHIEFEVAL')).toContain('40');
  });

  it('FITREP note mentions Block 41', () => {
    expect(getSubstantiationNote('FITREP')).toContain('41');
  });

  it('EVAL note mentions Block 43', () => {
    expect(getSubstantiationNote('EVAL')).toContain('43');
  });
});

// ─── resolveReportType ────────────────────────────────────────────────────────
describe('resolveReportType', () => {
  it('returns report_type directly when set', () => {
    expect(resolveReportType({ report_type: 'CHIEFEVAL' })).toBe('CHIEFEVAL');
    expect(resolveReportType({ report_type: 'FITREP' })).toBe('FITREP');
    expect(resolveReportType({ report_type: 'EVAL' })).toBe('EVAL');
  });

  it('falls back to EVAL when report_type is null and no form id', () => {
    expect(resolveReportType({ report_type: null })).toBe('EVAL');
  });

  it('falls back to EVAL when both are absent', () => {
    expect(resolveReportType({})).toBe('EVAL');
  });

  it('detects CHIEFEVAL from form_definition_id containing c1616270', () => {
    expect(resolveReportType({ form_definition_id: 'c1616270-cafe-4b08-9df2-5d8f28d8b4cd' })).toBe('CHIEFEVAL');
  });

  it('detects CHIEFEVAL from form_definition_id starting with CHIEFEVAL', () => {
    expect(resolveReportType({ form_definition_id: 'CHIEFEVAL_some_id' })).toBe('CHIEFEVAL');
  });

  it('detects FITREP from form_definition_id containing f1610020', () => {
    expect(resolveReportType({ form_definition_id: 'f1610020-cafe-4b08-9df2-5d8f28d8b4cd' })).toBe('FITREP');
  });

  it('detects FITREP from form_definition_id containing f1610050', () => {
    expect(resolveReportType({ form_definition_id: 'f1610050-cafe-4b08-9df2-5d8f28d8b4cd' })).toBe('FITREP');
  });

  it('detects FITREP from form_definition_id starting with FITREP', () => {
    expect(resolveReportType({ form_definition_id: 'FITREP_W2_O6_some_id' })).toBe('FITREP');
  });

  it('prefers report_type over form_definition_id when both set', () => {
    expect(resolveReportType({ report_type: 'EVAL', form_definition_id: 'c1616270-xxxx' })).toBe('EVAL');
  });
});

// ─── getTraitStandards ────────────────────────────────────────────────────────
describe('getTraitStandards', () => {
  it('returns the EVAL trait standards for EVAL', () => {
    const standards = getTraitStandards('EVAL');
    expect(standards).toBeDefined();
    // EVAL has knowledge, work, eo, bearing, accomplishment, teamwork, leadership
    expect('knowledge' in standards).toBe(true);
    expect('work' in standards).toBe(true);
    expect('eo' in standards).toBe(true);
    expect('leadership' in standards).toBe(true);
  });

  it('returns CHIEFEVAL standards for CHIEFEVAL', () => {
    const standards = getTraitStandards('CHIEFEVAL');
    expect('technical_mastery' in standards).toBe(true);
    expect('accountability' in standards).toBe(true);
    expect('deckplate_leadership' in standards).toBe(true);
    // CHIEFEVAL should NOT have the EVAL-specific 'work' key
    expect('work' in standards).toBe(false);
  });

  it('returns FITREP standards for FITREP', () => {
    const standards = getTraitStandards('FITREP');
    expect('tactical_performance' in standards).toBe(true);
    expect('knowledge' in standards).toBe(true);
    // FITREP should NOT have 'work'
    expect('work' in standards).toBe(false);
  });

  it('defaults to EVAL standards for unknown type', () => {
    const standards = getTraitStandards('UNKNOWN');
    expect('knowledge' in standards).toBe(true);
  });

  it('defaults to EVAL when reportType is undefined', () => {
    const standards = getTraitStandards(undefined);
    expect('knowledge' in standards).toBe(true);
  });
});

// ─── getTraitStandard ─────────────────────────────────────────────────────────
describe('getTraitStandard', () => {
  it('returns the standard for a known EVAL trait key', () => {
    const std = getTraitStandard('EVAL', 'knowledge');
    expect(std).toBeDefined();
    expect(std?.block).toBe(33);
    expect(std?.title).toBeTruthy();
    expect(std?.anchors).toBeDefined();
  });

  it('returns undefined for an unknown trait key', () => {
    const std = getTraitStandard('EVAL', 'nonexistent_trait' as any);
    expect(std).toBeUndefined();
  });

  it('returns CHIEFEVAL accountability standard at Block 37', () => {
    const std = getTraitStandard('CHIEFEVAL', 'accountability' as any);
    expect(std).toBeDefined();
    expect(std?.block).toBe(37);
  });

  it('returns FITREP tactical_performance standard at Block 39', () => {
    const std = getTraitStandard('FITREP', 'tactical_performance' as any);
    expect(std).toBeDefined();
    expect(std?.block).toBe(39);
  });

  it('each EVAL standard has 1.0, 3.0, and 5.0 anchors', () => {
    for (const key of ['knowledge', 'work', 'eo', 'bearing', 'accomplishment', 'teamwork', 'leadership'] as const) {
      const std = getTraitStandard('EVAL', key);
      expect(std?.anchors?.['1.0'].length).toBeGreaterThan(0);
      expect(std?.anchors?.['3.0'].length).toBeGreaterThan(0);
      expect(std?.anchors?.['5.0'].length).toBeGreaterThan(0);
    }
  });

  it('each CHIEFEVAL standard has the standards array (no anchor columns)', () => {
    for (const key of ['technical_mastery', 'institutional_expertise', 'professionalism', 'integrity', 'accountability', 'deckplate_leadership', 'team_effectiveness'] as const) {
      const std = getTraitStandard('CHIEFEVAL', key as any);
      expect(std).toBeDefined();
      // CHIEFEVAL uses `standards` bullet list, not per-grade `anchors`
      expect(std?.standards || std?.anchors).toBeDefined();
    }
  });
});

// ─── Constants ────────────────────────────────────────────────────────────────
describe('TRAIT_GRADE_LABELS', () => {
  it('maps all 6 grades including NOB', () => {
    expect(TRAIT_GRADE_LABELS['1.0']).toBeTruthy();
    expect(TRAIT_GRADE_LABELS['2.0']).toBeTruthy();
    expect(TRAIT_GRADE_LABELS['3.0']).toBeTruthy();
    expect(TRAIT_GRADE_LABELS['4.0']).toBeTruthy();
    expect(TRAIT_GRADE_LABELS['5.0']).toBeTruthy();
    expect(TRAIT_GRADE_LABELS['NOB']).toBeTruthy();
  });

  it('1.0 label indicates below standards', () => {
    expect(TRAIT_GRADE_LABELS['1.0'].toLowerCase()).toContain('below');
  });

  it('5.0 label indicates greatly exceeds', () => {
    expect(TRAIT_GRADE_LABELS['5.0'].toLowerCase()).toContain('exceed');
  });
});

describe('GRADE_SCALE_NOTE', () => {
  it('has notes for all numeric grades and NOB', () => {
    expect(GRADE_SCALE_NOTE['1.0']).toBeTruthy();
    expect(GRADE_SCALE_NOTE['3.0']).toBeTruthy();
    expect(GRADE_SCALE_NOTE['5.0']).toBeTruthy();
    expect(GRADE_SCALE_NOTE['NOB']).toBeTruthy();
  });
});

describe('ANCHOR_GRADES', () => {
  it('contains exactly 1.0, 3.0, 5.0', () => {
    expect(ANCHOR_GRADES).toContain('1.0');
    expect(ANCHOR_GRADES).toContain('3.0');
    expect(ANCHOR_GRADES).toContain('5.0');
    expect(ANCHOR_GRADES).toHaveLength(3);
  });
});

describe('printed block numbers follow the REV 05-2025 blanks', () => {
  it('keeps an unknown report type on the enlisted EVAL', () => {
    expect(navpersFormNumber()).toBe('1616/26');
    expect(careerRecommendationBlock()).toBe(41);
    expect(promotionBlock()).toBe(45);
    expect(qualificationsBlock()).toBe(44);
    expect(reportingSeniorAddressBlock()).toBe(48);
    expect(traitAverageLabel()).toBe('Block 40 Individual Trait Average');
    expect(summaryGroupAverageLabel()).toBe('Summary Group Average');
    expect(summaryBreakdownLabel()).toBe('Block 46');
  });

  it('uses the CHIEFEVAL blank, including the two career-recommendation blocks', () => {
    expect(navpersFormNumber('CHIEFEVAL')).toBe('1616/27');
    expect(careerRecommendationBlock('CHIEFEVAL')).toBe(46);
    expect(careerRecommendationLabel('CHIEFEVAL')).toBe('Blocks 46 and 47');
    expect(careerRecommendationLimitVerb('CHIEFEVAL')).toBe('allow');
    expect(promotionBlock('CHIEFEVAL')).toBe(41);
    expect(qualificationsBlock('CHIEFEVAL')).toBeNull();
    expect(reportingSeniorAddressBlock('CHIEFEVAL')).toBe(51);
    expect(traitAverageLabel('CHIEFEVAL')).toBe('Block 43 Member Trait Average');
    expect(summaryGroupAverageLabel('CHIEFEVAL')).toBe('Block 45 Group Summary');
    expect(summaryBreakdownLabel('CHIEFEVAL')).toBe('Block 48');
  });

  it('uses the FITREP blank and does not invent a number for the trait average', () => {
    expect(navpersFormNumber('FITREP')).toBe('1610/2');
    expect(careerRecommendationBlock('FITREP')).toBe(40);
    expect(careerRecommendationLabel('FITREP')).toBe('Block 40');
    expect(careerRecommendationLimitVerb('FITREP')).toBe('allows');
    expect(promotionBlock('FITREP')).toBe(42);
    expect(qualificationsBlock('FITREP')).toBeNull();
    expect(reportingSeniorAddressBlock('FITREP')).toBe(44);
    expect(traitAverageLabel('FITREP')).toBe('Member Trait Average');
    expect(summaryGroupAverageLabel('FITREP')).toBe('Summary Group Average');
    expect(summaryBreakdownLabel('FITREP')).toBe('Block 43');
  });
});
