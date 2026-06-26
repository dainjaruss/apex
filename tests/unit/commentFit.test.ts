import { describe, it, expect } from 'vitest'
import { measureTextFit, wrapTextToWidth, FIELD_FIT } from '../../lib/commentFit'

describe('measureTextFit — firstLineLead (Block 29A shares Block 29 line 1)', () => {
  it('defaults to no lead and matches a flat wrap', () => {
    const text = Array.from({ length: 33 }, () => 'COMMTEC').join(' ') // 263 chars
    const fit = measureTextFit(text, 91, 3)
    expect(fit.linesUsed).toBe(wrapTextToWidth(text, 91).length)
    expect(fit.linesUsed).toBe(3)
    expect(fit.fit).toBe(true)
  })

  it('reserves the lead on line 1, so a body that fits flat can overflow', () => {
    const text = Array.from({ length: 33 }, () => 'COMMTEC').join(' ') // 263 chars
    const flat = measureTextFit(text, 91, 3, 0)
    const withLead = measureTextFit(text, 91, 3, 20)
    expect(flat.linesUsed).toBe(3)
    expect(flat.fit).toBe(true)
    // The 29A box steals ~20 chars from line 1, pushing the text to a 4th line.
    expect(withLead.linesUsed).toBe(4)
    expect(withLead.fit).toBe(false)
  })

  it('line count equals the PDF wrap (same lead padding the renderer uses)', () => {
    for (let t = 0; t < 50; t++) {
      const n = 5 + ((t * 97) % 60)
      const wlen = 3 + ((t * 13) % 9)
      const body = Array.from({ length: n }, (_, i) => 'D'.repeat(1 + ((i * 7 + t) % wlen))).join(' ')
      const measured = measureTextFit(body, 91, 3, 20).linesUsed
      const pdfWrap = wrapTextToWidth(' '.repeat(20) + body, 91).length
      expect(measured).toBe(pdfWrap)
    }
  })

  it('strips the reserved lead spaces from the returned first line', () => {
    const fit = measureTextFit('REACTOR OPERATOR', 91, 3, 20)
    expect(fit.wrappedLines[0].startsWith(' ')).toBe(false)
    expect(fit.wrappedLines[0]).toBe('REACTOR OPERATOR')
  })

  it('Block 29 (primary_duties) carries the 20-char first-line lead', () => {
    expect(FIELD_FIT.primary_duties.firstLineLead).toBe(20)
    // Blocks without an inline lead box stay undefined.
    expect(FIELD_FIT.command_achievements.firstLineLead).toBeUndefined()
    expect(FIELD_FIT.qualifications.firstLineLead).toBeUndefined()
  })
})
