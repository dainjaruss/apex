import { test, expect } from '@playwright/test'
import { loadE2EIds, userIdForRole } from './helpers/e2e-ids'
import { loginAsRole, logout, openEvalTab, routeForward, expectMemberOnDashboard } from './helpers/auth'
import { resetRoutingEval, resetRecycleEval } from './helpers/db'

test.describe('Dashboard custody views', () => {
  const ids = loadE2EIds()
  const evalId = ids.evals.routing
  const memberName = 'DOE, JOHN A'

  test.beforeEach(async () => {
    await resetRoutingEval()
    await resetRecycleEval()
  })

  test('partitions inbox vs drafts and shows non-holder banner', async ({ page }) => {
    // Sailor holds draft initially
    await loginAsRole(page, 'sailor')
    await expectMemberOnDashboard(page, memberName, true)
    await expect(page.getByText('My Drafts').locator('..').getByText(memberName).first()).toBeVisible()
    await logout(page)

    // Route to rater
    await loginAsRole(page, 'sailor')
    await openEvalTab(page, evalId, 'review')
    await routeForward(page, userIdForRole(ids, 'rater'))
    await logout(page)

    // Sailor no longer sees eval in their custody lists
    await loginAsRole(page, 'sailor')
    await page.goto('/dashboard')
    await expectMemberOnDashboard(page, memberName, false)
    await logout(page)

    // Rater sees eval in inbox
    await loginAsRole(page, 'rater')
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { name: memberName, exact: true })).toBeVisible()
    await logout(page)

    // Non-holder sailor sees custody banner on eval page
    await loginAsRole(page, 'sailor')
    await openEvalTab(page, evalId, 'review')
    await expect(page.getByText(/currently with the/i)).toBeVisible()
    await expect(page.getByRole('paragraph').filter({ hasText: /currently with the/i })).toContainText('Rater')
  })
})
