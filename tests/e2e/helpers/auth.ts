import { Page, expect } from '@playwright/test'
import { E2ERole, emailForRole, loadE2EIds } from './e2e-ids'

async function dismissConsent(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('apex_consent_accepted', 'true')
  })
}

export async function loginAs(page: Page, email: string, password: string) {
  await dismissConsent(page)
  await page.goto('/login')
  await page.locator('#login-email').fill(email)
  await page.locator('#login-password').fill(password)
  await page.getByRole('button', { name: 'Sign In' }).click()
  await page.waitForURL('**/dashboard', { timeout: 30_000 })
}

export async function loginAsRole(page: Page, role: E2ERole) {
  const ids = loadE2EIds()
  const password = process.env.E2E_TEST_PASSWORD || ids.password
  await loginAs(page, emailForRole(role), password)
}

export async function logout(page: Page) {
  await page.context().clearCookies()
  await dismissConsent(page)
  await page.goto('/login')
  await page.waitForURL('**/login', { timeout: 15_000 })
}

export async function openEvalTab(page: Page, evalId: string, tab: 'details' | 'review' | 'preview' | 'audit' = 'review') {
  await dismissConsent(page)
  await page.goto(`/evaluations/${evalId}?tab=${tab}`)
  await expect(page.getByText('APEX').first()).toBeVisible({ timeout: 30_000 })
  if (tab === 'review') {
    await page.waitForResponse(
      (r) => r.url().includes('/rest/v1/profiles') && r.request().method() === 'GET',
      { timeout: 15_000 },
    ).catch(() => null)
  }
}

function routeTargetSelect(page: Page, toUserId?: string) {
  if (toUserId) {
    return page.getByRole('combobox').filter({ has: page.locator(`option[value="${toUserId}"]`) })
  }
  return page.getByRole('combobox').filter({ has: page.getByText(/Route forward to a/) }).last()
}

export async function routeForward(page: Page, toUserId?: string) {
  const routeSelect = routeTargetSelect(page, toUserId)
  await routeSelect.waitFor({ state: 'visible', timeout: 15_000 })
  await page.waitForResponse(
    (r) => r.url().includes('/rest/v1/profiles') && r.request().method() === 'GET',
    { timeout: 15_000 },
  ).catch(() => null)

  if (toUserId) {
    await expect(routeSelect.locator(`option[value="${toUserId}"]`)).toHaveCount(1, { timeout: 10_000 })
    // Profiles fetch can resolve after selectOption and reset a controlled select — retry until stable.
    for (let attempt = 0; attempt < 8; attempt++) {
      await routeSelect.selectOption(toUserId)
      await page.waitForTimeout(250)
      if (await routeSelect.inputValue() === toUserId) break
      if (attempt === 7) {
        throw new Error(`Route target select did not stick on ${toUserId}`)
      }
    }
  }

  await page.getByRole('button', { name: 'Route Forward →' }).click()
  await page.waitForTimeout(2000)
}

export async function beginDebrief(page: Page) {
  await page.getByRole('button', { name: 'Begin Debrief' }).click()
  await page.waitForTimeout(1500)
}

export async function recycleWithComments(page: Page, comments: string) {
  await page.getByPlaceholder('What needs correcting?').fill(comments)
  await page.getByRole('button', { name: '← Recycle to Previous Holder' }).click()
  await page.waitForTimeout(1500)
}

export async function expectMemberOnDashboard(page: Page, memberName: string, visible: boolean) {
  const card = page.getByText(memberName, { exact: false })
  if (visible) {
    await expect(card.first()).toBeVisible({ timeout: 10_000 })
  } else {
    await expect(card).toHaveCount(0)
  }
}
