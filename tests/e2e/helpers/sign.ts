import { Page, expect } from '@playwright/test'
import { E2ERole, emailForRole, loadE2EIds } from './e2e-ids'

const BLOCK_LABELS: Record<number, string> = {
  42: 'Rater Signature',
  49: 'Senior Rater Signature',
  50: 'Reporting Senior Signature',
  51: 'Individual Evaluated (Member) Signature',
}

const SIGNER_NAMES: Record<number, Partial<Record<E2ERole, string>>> = {
  42: { rater: 'RAY, ALAN M' },
  49: { seniorRater: 'SMITH, BETTY L' },
  51: { sailor: 'DOE, JOHN A' },
  50: { reportingSenior: 'JONES, C R' },
}

/** Sign a NAVPERS block via the credential modal on the Details tab. */
export async function signBlock(page: Page, block: number, role: E2ERole) {
  const ids = loadE2EIds()
  const password = process.env.E2E_TEST_PASSWORD || ids.password
  const label = BLOCK_LABELS[block]
  if (!label) throw new Error(`Unknown signature block ${block}`)

  await page.getByRole('tab', { name: 'Form Details' }).click()
  const row = page.locator('div.flex.items-center.justify-between').filter({ hasText: `${block}: ${label}` })
  await row.getByRole('button', { name: '✍ Sign' }).click()

  await expect(page.getByRole('heading', { name: `Sign Block ${block}` })).toBeVisible()

  const typedName = SIGNER_NAMES[block]?.[role] || 'DOE, JOHN A'
  await page.getByPlaceholder('DOE, JOHN A').fill(typedName)
  await page.getByPlaceholder('you@navy.mil').fill(emailForRole(role))
  await page.locator('input[type="password"]').last().fill(password)
  await page.getByRole('checkbox').check()

  // Click and wait for the /api/sign response (can be slow on cloud Supabase)
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/api/sign') && r.request().method() === 'POST',
      { timeout: 45_000 },
    ),
    page.getByRole('button', { name: 'Sign & Certify' }).click(),
  ])

  // Surface API errors as actionable test failures
  if (!response.ok()) {
    const body = await response.json().catch(() => ({ error: 'unknown' }))
    throw new Error(`/api/sign returned ${response.status()} for block ${block}: ${body.error || 'unknown error'}`)
  }

  await expect(page.getByRole('heading', { name: `Sign Block ${block}` })).toBeHidden({ timeout: 10_000 })
  await page.waitForTimeout(1000)
}
