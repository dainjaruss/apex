// src/lib/commentFit.test.ts
// 100% coverage for commentFit.ts — text-wrap math, pitch constants, capacity table, and field specs.

import { describe, it, expect } from 'vitest';
import {
  wrapTextToWidth,
  measureTextFit,
  checkCommentFit,
  getCommentCapacity,
  resolveCommentPitch,
  commentPitchFields,
  asCommentPitch,
  getPrimaryDutiesFieldFit,
  COMMENT_PITCH,
  COMMENT_PITCH_V,
  FIELD_FIT,
  PRIMARY_DUTY_ABBREV_MAX,
} from './commentFit';

// ─── wrapTextToWidth ─────────────────────────────────────────────────────────
describe('wrapTextToWidth', () => {
  it('returns a single empty string for empty string input (empty paragraph)', () => {
    // wrapTextToWidth splits on '\n', so '' produces one empty paragraph → ['']
    expect(wrapTextToWidth('', 80)).toEqual(['']);
  });

  it('wraps a short single word without splitting', () => {
    expect(wrapTextToWidth('Hello', 80)).toEqual(['Hello']);
  });

  it('wraps a sentence at word boundaries', () => {
    const lines = wrapTextToWidth('The quick brown fox jumps over the lazy dog', 10);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(10);
    }
    // Reconstituted, all words are present
    expect(lines.join(' ').replace(/\s+/g, ' ').trim()).toBe(
      'The quick brown fox jumps over the lazy dog'
    );
  });

  it('force-splits a word longer than charsPerLine', () => {
    // 5-char width, 15-char word → 3 lines
    const lines = wrapTextToWidth('ABCDEFGHIJKLMNO', 5);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('ABCDE');
    expect(lines[1]).toBe('FGHIJ');
    expect(lines[2]).toBe('KLMNO');
  });

  it('preserves explicit newlines as empty or new lines', () => {
    const lines = wrapTextToWidth('Line one\n\nLine three', 80);
    expect(lines[0]).toBe('Line one');
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe('Line three');
  });

  it('handles multiple sequential spaces', () => {
    const lines = wrapTextToWidth('A  B', 80);
    expect(lines[0]).toContain('A');
    expect(lines[0]).toContain('B');
  });

  it('wraps multi-paragraph text preserving paragraph breaks', () => {
    const text = 'Para one sentence.\nPara two sentence.';
    const lines = wrapTextToWidth(text, 80);
    expect(lines).toHaveLength(2);
  });

  it('fits exactly at the boundary (last char on line)', () => {
    // 5 chars per line, 5-char word — should produce 1 line
    expect(wrapTextToWidth('ABCDE', 5)).toEqual(['ABCDE']);
  });

  it('wraps a word that is exactly charsPerLine+1 over two lines', () => {
    const lines = wrapTextToWidth('ABCDEF', 5);
    expect(lines[0]).toBe('ABCDE');
    expect(lines[1]).toBe('F');
  });
});

// ─── measureTextFit ──────────────────────────────────────────────────────────
describe('measureTextFit', () => {
  it('returns fit=true, linesUsed=0 for empty text', () => {
    const r = measureTextFit('', 90, 17);
    expect(r.fit).toBe(true);
    expect(r.linesUsed).toBe(0);
    expect(r.wrappedLines).toHaveLength(0);
  });

  it('returns fit=true when text fits within maxLines', () => {
    const r = measureTextFit('Short line', 90, 17);
    expect(r.fit).toBe(true);
    expect(r.linesUsed).toBe(1);
  });

  it('returns fit=false when text exceeds maxLines', () => {
    // Force 3 lines of 10 chars into maxLines=2
    const r = measureTextFit('AAAAAAAAAA BBBBBBBBBB CCCCCCCCCC', 10, 2);
    expect(r.fit).toBe(false);
    expect(r.linesUsed).toBeGreaterThan(2);
  });

  it('applies firstLineLead correctly — first line is shorter', () => {
    // 10-char line with 5-char lead: first line has only 5 available
    const r = measureTextFit('ABCDEFGHIJ', 10, 5, 5);
    // The lead consumes 5 chars on line 1, pushing "ABCDEFGHIJ" to line 2
    expect(r.linesUsed).toBeGreaterThan(1);
    // Returned first line should have lead stripped
    expect(r.wrappedLines[0]).not.toContain('     ');
  });

  it('returns correct charsPerLine and maxLines in result', () => {
    const r = measureTextFit('hello', 75, 14);
    expect(r.charsPerLine).toBe(75);
    expect(r.maxLines).toBe(14);
  });

  it('handles zero firstLineLead (default)', () => {
    const r = measureTextFit('hello world', 90, 17, 0);
    expect(r.linesUsed).toBe(1);
    expect(r.fit).toBe(true);
  });
});

// ─── asCommentPitch ───────────────────────────────────────────────────────────
describe('asCommentPitch', () => {
  it('maps 10 → "10"', () => expect(asCommentPitch(10)).toBe('10'));
  it('maps "10" → "10"', () => expect(asCommentPitch('10')).toBe('10'));
  it('maps 12 → "12"', () => expect(asCommentPitch(12)).toBe('12'));
  it('maps "12" → "12"', () => expect(asCommentPitch('12')).toBe('12'));
  it('maps undefined → "12" (default)', () => expect(asCommentPitch(undefined)).toBe('12'));
  it('maps any unknown value → "12"', () => expect(asCommentPitch('99')).toBe('12'));
});

// ─── COMMENT_PITCH constants ──────────────────────────────────────────────────
describe('COMMENT_PITCH constants', () => {
  it('10-pitch is 75 CPL at 12 pt', () => {
    expect(COMMENT_PITCH['10'].charsPerLine).toBe(75);
    expect(COMMENT_PITCH['10'].points).toBe(12);
  });

  it('12-pitch is 90 CPL at 10 pt', () => {
    expect(COMMENT_PITCH['12'].charsPerLine).toBe(90);
    expect(COMMENT_PITCH['12'].points).toBe(10);
  });
});

// ─── getCommentCapacity ───────────────────────────────────────────────────────
describe('getCommentCapacity', () => {
  it('EVAL 12-pitch → 17 lines', () => expect(getCommentCapacity('EVAL', '12')).toBe(17));
  it('EVAL 10-pitch → 14 lines', () => expect(getCommentCapacity('EVAL', '10')).toBe(14));
  it('CHIEFEVAL 12-pitch → 8 lines', () => expect(getCommentCapacity('CHIEFEVAL', '12')).toBe(8));
  it('CHIEFEVAL 10-pitch → 6 lines', () => expect(getCommentCapacity('CHIEFEVAL', '10')).toBe(6));
  it('FITREP 12-pitch → 19 lines', () => expect(getCommentCapacity('FITREP', '12')).toBe(19));
  it('FITREP 10-pitch → 16 lines', () => expect(getCommentCapacity('FITREP', '10')).toBe(16));

  it('unknown report type falls back to EVAL capacity', () => {
    expect(getCommentCapacity(undefined, '12')).toBe(17);
    expect(getCommentCapacity('UNKNOWN', '12')).toBe(17);
  });

  it('accepts numeric pitch values', () => {
    expect(getCommentCapacity('EVAL', 12)).toBe(17);
    expect(getCommentCapacity('EVAL', 10)).toBe(14);
  });
});

// ─── resolveCommentPitch ──────────────────────────────────────────────────────
describe('resolveCommentPitch', () => {
  it('returns "12" for null input (safe default)', () => {
    expect(resolveCommentPitch(null)).toBe('12');
  });

  it('returns "12" for undefined input', () => {
    expect(resolveCommentPitch(undefined)).toBe('12');
  });

  it('returns "12" when comment_pitch_v is missing (legacy draft)', () => {
    expect(resolveCommentPitch({ comment_pitch: '10' })).toBe('12');
  });

  it('returns "12" when comment_pitch_v is wrong version', () => {
    expect(resolveCommentPitch({ comment_pitch: '10', comment_pitch_v: 1 })).toBe('12');
  });

  it('returns "10" for a v2-stamped "10" pitch', () => {
    expect(resolveCommentPitch({ comment_pitch: '10', comment_pitch_v: COMMENT_PITCH_V })).toBe('10');
  });

  it('returns "12" for a v2-stamped "12" pitch', () => {
    expect(resolveCommentPitch({ comment_pitch: '12', comment_pitch_v: COMMENT_PITCH_V })).toBe('12');
  });

  it('returns "12" for a v2-stamped unknown pitch string', () => {
    expect(resolveCommentPitch({ comment_pitch: '99', comment_pitch_v: COMMENT_PITCH_V })).toBe('12');
  });
});

// ─── commentPitchFields ───────────────────────────────────────────────────────
describe('commentPitchFields', () => {
  it('stamps the correct version', () => {
    const f = commentPitchFields('10');
    expect(f.comment_pitch).toBe('10');
    expect(f.comment_pitch_v).toBe(COMMENT_PITCH_V);
  });

  it('works for 12-pitch', () => {
    const f = commentPitchFields('12');
    expect(f.comment_pitch).toBe('12');
  });
});

// ─── checkCommentFit ─────────────────────────────────────────────────────────
describe('checkCommentFit', () => {
  it('returns fit=true for short EVAL comment at 12-pitch', () => {
    const r = checkCommentFit('Short comment.', '12', 'EVAL');
    expect(r.fit).toBe(true);
    expect(r.charsPerLine).toBe(90);
    expect(r.maxLines).toBe(17);
  });

  it('returns fit=true for short CHIEFEVAL comment at 10-pitch', () => {
    const r = checkCommentFit('Short comment.', '10', 'CHIEFEVAL');
    expect(r.fit).toBe(true);
    expect(r.maxLines).toBe(6);
    expect(r.charsPerLine).toBe(75);
  });

  it('returns fit=false for a CHIEFEVAL comment that fills more than 8 lines at 12-pitch', () => {
    // 8 lines * 90 chars = 720 chars; add more
    const longText = Array(9).fill('A'.repeat(90)).join(' ');
    const r = checkCommentFit(longText, '12', 'CHIEFEVAL');
    expect(r.fit).toBe(false);
    expect(r.maxLines).toBe(8);
  });

  it('accepts numeric pitch', () => {
    const r = checkCommentFit('hello', 12, 'EVAL');
    expect(r.maxLines).toBe(17);
  });

  it('returns fit=true for FITREP at 19 lines capacity', () => {
    const r = checkCommentFit('One line.', '12', 'FITREP');
    expect(r.maxLines).toBe(19);
    expect(r.fit).toBe(true);
  });
});

// ─── FIELD_FIT constants ──────────────────────────────────────────────────────
describe('FIELD_FIT constants', () => {
  it('command_achievements: block 28, 91 CPL, 3 lines', () => {
    expect(FIELD_FIT.command_achievements.block).toBe(28);
    expect(FIELD_FIT.command_achievements.charsPerLine).toBe(91);
    expect(FIELD_FIT.command_achievements.maxLines).toBe(3);
  });

  it('primary_duties: block 29, 91 CPL, 3 lines, lead 20', () => {
    expect(FIELD_FIT.primary_duties.block).toBe(29);
    expect(FIELD_FIT.primary_duties.firstLineLead).toBe(20);
    expect(FIELD_FIT.primary_duties.maxLines).toBe(3);
  });

  it('primary_duties_extended: block 29, 91 CPL, 4 lines, lead 21', () => {
    expect(FIELD_FIT.primary_duties_extended.maxLines).toBe(4);
    expect(FIELD_FIT.primary_duties_extended.firstLineLead).toBe(21);
  });

  it('qualifications: block 44, 91 CPL, 2 lines', () => {
    expect(FIELD_FIT.qualifications.block).toBe(44);
    expect(FIELD_FIT.qualifications.maxLines).toBe(2);
  });

  it('reporting_senior_address: block 48, 30 CPL, 3 lines', () => {
    expect(FIELD_FIT.reporting_senior_address.charsPerLine).toBe(30);
    expect(FIELD_FIT.reporting_senior_address.maxLines).toBe(3);
  });
});

// ─── PRIMARY_DUTY_ABBREV_MAX ──────────────────────────────────────────────────
describe('PRIMARY_DUTY_ABBREV_MAX', () => {
  it('is 14 characters', () => {
    expect(PRIMARY_DUTY_ABBREV_MAX).toBe(14);
  });
});

// ─── getPrimaryDutiesFieldFit ─────────────────────────────────────────────────
describe('getPrimaryDutiesFieldFit', () => {
  it('returns extended (4-line, lead 21) for FITREP', () => {
    const spec = getPrimaryDutiesFieldFit('FITREP');
    expect(spec.maxLines).toBe(4);
    expect(spec.firstLineLead).toBe(21);
  });

  it('returns extended (4-line, lead 21) for CHIEFEVAL', () => {
    const spec = getPrimaryDutiesFieldFit('CHIEFEVAL');
    expect(spec.maxLines).toBe(4);
    expect(spec.firstLineLead).toBe(21);
  });

  it('returns standard (3-line, lead 20) for EVAL', () => {
    const spec = getPrimaryDutiesFieldFit('EVAL');
    expect(spec.maxLines).toBe(3);
    expect(spec.firstLineLead).toBe(20);
  });

  it('returns standard (3-line) for undefined report type', () => {
    const spec = getPrimaryDutiesFieldFit(undefined);
    expect(spec.maxLines).toBe(3);
  });
});
