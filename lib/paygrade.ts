// lib/paygrade.ts
//
// Normalizes a Navy "grade/rate" string to a canonical paygrade (E-1..E-9, W-2..W-5,
// O-1..O-6) so two differently-written values can be compared. Used to gate summary-group
// eligibility by paygrade: per BUPERSINST 1610.10H an enlisted summary group is one paygrade
// only, so an E-3 must not be offered an E-6 group.
//
// The member's grade comes from a fixed registration list (canonical codes like SN, PO1 —
// see RANK_LABELS in app/register/page.tsx), but a group's grade_rate is free text typed by the
// Reporting Senior, so the parser also accepts explicit paygrades ("E-6", "E6", "PO1 (E-6)")
// and full rating abbreviations ("IT1" -> E-6, "BM2" -> E-5, "HMC" -> E-7).

// Canonical registration codes (mirror of RANK_LABELS in app/register/page.tsx).
const RANK_CODE_TO_PAYGRADE: Record<string, string> = {
  SR: 'E-1', SA: 'E-2', SN: 'E-3',
  PO3: 'E-4', PO2: 'E-5', PO1: 'E-6',
  CPO: 'E-7', SCPO: 'E-8', MCPO: 'E-9',
  WO2: 'W-2', WO3: 'W-3', WO4: 'W-4', WO5: 'W-5',
  ENS: 'O-1', LTJG: 'O-2', LT: 'O-3', LCDR: 'O-4', CDR: 'O-5', CAPT: 'O-6',
}

/**
 * Returns the canonical paygrade for a grade/rate string, or null if it can't be determined.
 * Examples: 'SN' -> 'E-3', 'PO1' -> 'E-6', 'IT1' -> 'E-6', 'E6' -> 'E-6', 'PO1 (E-6)' -> 'E-6'.
 */
export function paygradeOf(raw?: string | null): string | null {
  if (!raw) return null
  const s = raw.trim().toUpperCase()
  if (!s) return null

  // 1) Exact canonical registration code (the common case for a member's rank).
  if (RANK_CODE_TO_PAYGRADE[s]) return RANK_CODE_TO_PAYGRADE[s]

  // 2) An explicit paygrade token anywhere in the string ("E-6", "E6", "PO1 (E-6)", "W-2", "O-5").
  //    \b before the letter prevents matching the trailing "O1" inside ratings like "SO1"/"PO1".
  const token = s.match(/\b([EWO])-?([1-9])\b/)
  if (token) return `${token[1]}-${token[2]}`

  // 3) Full enlisted rating abbreviations, decoded by their paygrade suffix.
  //    Chiefs: ...CM = E-9 (Master), ...CS = E-8 (Senior), ...C = E-7 (Chief).
  if (/^[A-Z]+CM$/.test(s)) return 'E-9'
  if (/^[A-Z]+CS$/.test(s)) return 'E-8'
  if (/^[A-Z]+C$/.test(s)) return 'E-7'
  //    Petty officers: rating ending in 1/2/3 = PO1/PO2/PO3 = E-6/E-5/E-4.
  const last = s[s.length - 1]
  if (last === '1') return 'E-6'
  if (last === '2') return 'E-5'
  if (last === '3') return 'E-4'
  //    Apprentice families (Seaman/Fireman/Airman/...): ...R = E-1, ...A = E-2, ...N = E-3.
  if (/^[A-Z]R$/.test(s)) return 'E-1'
  if (/^[A-Z]A$/.test(s)) return 'E-2'
  if (/^[A-Z]N$/.test(s)) return 'E-3'

  return null
}

/** True only when both grades resolve to the same paygrade. Unknown on either side -> false. */
export function samePaygrade(a?: string | null, b?: string | null): boolean {
  const pa = paygradeOf(a)
  const pb = paygradeOf(b)
  return pa !== null && pa === pb
}
