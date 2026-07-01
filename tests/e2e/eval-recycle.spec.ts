import { test, expect } from '@playwright/test'
import { loadE2EIds } from './helpers/e2e-ids'
import { loginAsRole, logout, openEvalTab, recycleWithComments } from './helpers/auth'
import { assertEvalState, countReviewApprovals, resetRecycleEval } from './helpers/db'

test.describe('Eval recycle workflow', () => {
  const ids = loadE2EIds()
  const evalId = ids.evals.recycle

  test.beforeEach(async () => {
    await resetRecycleEval()
  })

  test('rater recycles one step back with comments and records approval', async ({ page }) => {
    await loginAsRole(page, 'rater')
    await openEvalTab(page, evalId, 'review')
    await assertEvalState(evalId, { routing_stage: 'rater', current_holder_id: ids.users.rater })

    await recycleWithComments(page, 'Please expand Block 43 substantiation.')
    await assertEvalState(evalId, { routing_stage: 'sailor', current_holder_id: ids.users.sailor })

    const returned = await countReviewApprovals(evalId, 'returned')
    expect(returned).toBeGreaterThan(0)

    await page.reload()
    await expect(page.getByText('Recycle / Review History')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Please expand Block 43 substantiation.')).toBeVisible()
    await logout(page)

    await loginAsRole(page, 'sailor')
    await openEvalTab(page, evalId, 'review')
    await expect(page.getByRole('button', { name: 'Route Forward →' })).toBeVisible()
  })
})
