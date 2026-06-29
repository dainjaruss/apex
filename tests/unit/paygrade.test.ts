// tests/unit/paygrade.test.ts
import { describe, it, expect } from 'vitest'
import { paygradeOf, samePaygrade } from '@/lib/paygrade'

describe('paygradeOf', () => {
  it('maps canonical registration rank codes to paygrades', () => {
    expect(paygradeOf('SR')).toBe('E-1')
    expect(paygradeOf('SA')).toBe('E-2')
    expect(paygradeOf('SN')).toBe('E-3')
    expect(paygradeOf('PO3')).toBe('E-4')
    expect(paygradeOf('PO2')).toBe('E-5')
    expect(paygradeOf('PO1')).toBe('E-6')
    expect(paygradeOf('CPO')).toBe('E-7')
    expect(paygradeOf('SCPO')).toBe('E-8')
    expect(paygradeOf('MCPO')).toBe('E-9')
  })

  it('reads explicit paygrade tokens in any common form', () => {
    expect(paygradeOf('E-6')).toBe('E-6')
    expect(paygradeOf('E6')).toBe('E-6')
    expect(paygradeOf('e3')).toBe('E-3')
    expect(paygradeOf('PO1 (E-6)')).toBe('E-6')
    expect(paygradeOf('W-2')).toBe('W-2')
    expect(paygradeOf('O-5')).toBe('O-5')
  })

  it('decodes full rating abbreviations by their paygrade suffix', () => {
    expect(paygradeOf('IT1')).toBe('E-6')
    expect(paygradeOf('BM2')).toBe('E-5')
    expect(paygradeOf('YN3')).toBe('E-4')
    expect(paygradeOf('SO1')).toBe('E-6') // \b guard: not misread as O-1
    expect(paygradeOf('HMC')).toBe('E-7')
    expect(paygradeOf('ITCS')).toBe('E-8')
    expect(paygradeOf('ITCM')).toBe('E-9')
    expect(paygradeOf('FN')).toBe('E-3') // Fireman
    expect(paygradeOf('AA')).toBe('E-2') // Airman Apprentice
  })

  it('is case- and whitespace-insensitive', () => {
    expect(paygradeOf('  po1  ')).toBe('E-6')
    expect(paygradeOf('sn')).toBe('E-3')
  })

  it('returns null when the paygrade cannot be determined', () => {
    expect(paygradeOf('')).toBeNull()
    expect(paygradeOf(null)).toBeNull()
    expect(paygradeOf(undefined)).toBeNull()
    expect(paygradeOf('XYZ')).toBeNull()
  })
})

describe('samePaygrade (the gate)', () => {
  it('does NOT match an E-3 against an E-6 group', () => {
    expect(samePaygrade('SN', 'PO1')).toBe(false)
    expect(samePaygrade('E-3', 'E-6')).toBe(false)
    expect(samePaygrade('SN', 'IT1')).toBe(false)
  })

  it('matches the same paygrade written differently', () => {
    expect(samePaygrade('PO1', 'E-6')).toBe(true)
    expect(samePaygrade('IT1', 'PO1')).toBe(true)
    expect(samePaygrade('SN', 'E3')).toBe(true)
  })

  it('is false when either side is unknown', () => {
    expect(samePaygrade('SN', 'XYZ')).toBe(false)
    expect(samePaygrade('', 'PO1')).toBe(false)
  })
})
