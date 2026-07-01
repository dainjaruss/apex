import { test, expect } from '@playwright/test'
import { loginAsRole, logout, openEvalTab, routeForward, beginDebrief } from './helpers/auth'
import { assertEvalState, resetRoutingEval } from './helpers/db'
import { signBlock } from './helpers/sign'
import { loadE2EIds, userIdForRole } from './helpers/e2e-ids'

test.describe('Full BUPERS eval routing workflow', () => {
  const ids = loadE2EIds()
  const evalId = ids.evals.routing

  test.beforeEach(async () => {
    await resetRoutingEval()
  })

  test('routes through custody chain, debriefs, signs, locks, and finalizes', async ({ page }) => {
    // Sailor → Rater
    await loginAsRole(page, 'sailor')
    await openEvalTab(page, evalId, 'review')
    await assertEvalState(evalId, { routing_stage: 'sailor', current_holder_id: ids.users.sailor })
    await routeForward(page, userIdForRole(ids, 'rater'))
    await assertEvalState(evalId, { routing_stage: 'rater', current_holder_id: ids.users.rater })
    await logout(page)

    // Rater → Senior Rater
    await loginAsRole(page, 'rater')
    await openEvalTab(page, evalId, 'review')
    await routeForward(page, userIdForRole(ids, 'seniorRater'))
    await assertEvalState(evalId, { routing_stage: 'senior_rater', current_holder_id: ids.users.seniorRater })
    await logout(page)

    // Senior Rater → Reporting Senior
    await loginAsRole(page, 'seniorRater')
    await openEvalTab(page, evalId, 'review')
    await routeForward(page, userIdForRole(ids, 'reportingSenior'))
    await assertEvalState(evalId, { routing_stage: 'reporting_senior', current_holder_id: ids.users.reportingSenior })
    await logout(page)

    // Reporting Senior begins debrief
    await loginAsRole(page, 'reportingSenior')
    await openEvalTab(page, evalId, 'review')
    await beginDebrief(page)
    await assertEvalState(evalId, { routing_stage: 'debrief' })
    await logout(page)

    // Sign blocks 42, 49, 51, then 50 (locks)
    await loginAsRole(page, 'rater')
    await openEvalTab(page, evalId, 'details')
    await signBlock(page, 42, 'rater')
    await logout(page)

    await loginAsRole(page, 'seniorRater')
    await openEvalTab(page, evalId, 'details')
    await signBlock(page, 49, 'seniorRater')
    await logout(page)

    await loginAsRole(page, 'sailor')
    await openEvalTab(page, evalId, 'details')
    await signBlock(page, 51, 'sailor')
    await logout(page)

    await loginAsRole(page, 'reportingSenior')
    await openEvalTab(page, evalId, 'details')
    await signBlock(page, 50, 'reportingSenior')
    await assertEvalState(evalId, { signature_locked: true, routing_stage: 'locked' })
    await logout(page)

    // Sailor finalizes on export portal
    await loginAsRole(page, 'sailor')
    await page.goto(`/evaluations/${evalId}/export`)
    await expect(page.getByText('PASSED', { exact: true })).toBeVisible({ timeout: 30_000 })
    await page.getByRole('button', { name: 'Finalize & Submit' }).click()
    await page.waitForURL('**/dashboard', { timeout: 30_000 })
    await assertEvalState(evalId, { status: 'completed' })
  })
})
