import { test, expect, type Page } from '@playwright/test'

/**
 * Admin A1 (verification) and A3 (reconcile) journeys against synthetic fixtures.
 *
 * Safety: fixtures must be unmatchable synthetic rows (is_available=false, no skills, no service
 * areas, no phone, @fixify.invalid) and, for reconcile, a past-dated booking. Never point these at
 * a real professional or at booking c779c0d4. Each test consumes its fixture (reject, approve,
 * close), so recreate fixtures before every run.
 *
 * Required env: E2E_TEST_PASSWORD, E2E_ADMIN_EMAIL. Per test:
 *   E2E_A1_REJECT_NAME    display name of a pending synthetic professional to reject
 *   E2E_A1_NODOCS_NAME    display name of a pending synthetic professional with NO documents
 *   E2E_RECONCILE_REF     reference shown in the Operations queue for a cancelled-booking /
 *                         assigned-job mismatch fixture
 *
 * Not yet run: execution needs E2E_TEST_PASSWORD, which is unavailable where this was written.
 */
const PASSWORD = process.env.E2E_TEST_PASSWORD
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL
test.skip(!PASSWORD || !ADMIN_EMAIL, 'Set E2E_TEST_PASSWORD and E2E_ADMIN_EMAIL to run the admin journeys')

async function signInAdmin(page: Page) {
  await page.goto('/auth/login?logged_out=1')
  await page.getByPlaceholder('you@example.com').fill(ADMIN_EMAIL ?? '')
  await page.getByPlaceholder('Enter your password').fill(PASSWORD ?? '')
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL('**/admin**')
}

function card(page: Page, name: string) {
  return page.locator('div', { hasText: name }).filter({ has: page.getByRole('button', { name: 'Approve' }) }).last()
}

test.describe('A1 professional verification', () => {
  test('approve is refused while required documents are missing', async ({ page }) => {
    const name = process.env.E2E_A1_NODOCS_NAME
    test.skip(!name, 'Set E2E_A1_NODOCS_NAME')
    await signInAdmin(page)
    await page.goto('/admin/professionals/verification')
    await card(page, name ?? '').getByRole('button', { name: 'Approve' }).click()
    await expect(page.getByText(/Required documents missing/)).toBeVisible()
    await expect(card(page, name ?? '')).toBeVisible()
  })

  test('reject needs a reason of at least 5 characters, then removes the card', async ({ page }) => {
    const name = process.env.E2E_A1_REJECT_NAME
    test.skip(!name, 'Set E2E_A1_REJECT_NAME')
    await signInAdmin(page)
    await page.goto('/admin/professionals/verification')
    await card(page, name ?? '').getByRole('button', { name: 'Reject' }).click()
    const confirm = page.getByRole('button', { name: 'Confirm Rejection' })
    await page.locator('#reject-reason').fill('abc')
    await expect(confirm).toBeDisabled()
    await page.locator('#reject-reason').fill('Synthetic fixture: rejected by e2e')
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect(page.getByText(name ?? '')).toHaveCount(0)
  })
})

test.describe('A3 operations reconcile', () => {
  test('reason is required, then the leftover job is closed and leaves the queue', async ({ page }) => {
    const ref = process.env.E2E_RECONCILE_REF
    test.skip(!ref, 'Set E2E_RECONCILE_REF')
    await signInAdmin(page)
    await page.goto('/admin/operations')
    await page.getByText(ref ?? '').first().click()
    const open = page.getByRole('button', { name: 'Close leftover job' })
    await expect(open).toBeDisabled()
    await page.locator('#reconcile-reason').fill('abc')
    await expect(open).toBeDisabled()
    await page.locator('#reconcile-reason').fill('Synthetic fixture: reconciled by e2e')
    await open.click()
    await page.getByRole('button', { name: 'Confirm: close job' }).click()
    await expect(page.getByText(/will leave the queue on refresh/)).toBeVisible()
  })
})
