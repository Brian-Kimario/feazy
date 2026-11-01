import { test, expect, type Page } from '@playwright/test'

/**
 * Read-only admin console journeys. Nothing here clicks a state-changing control, so they are safe
 * against any environment the admin account can reach, including the shared project.
 * Required env: E2E_TEST_PASSWORD, E2E_ADMIN_EMAIL.
 */
const PASSWORD = process.env.E2E_TEST_PASSWORD
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL
test.skip(!PASSWORD || !ADMIN_EMAIL, 'Set E2E_TEST_PASSWORD and E2E_ADMIN_EMAIL to run the admin console journeys')

async function signInAdmin(page: Page) {
  await page.goto('/auth/login?logged_out=1')
  await page.getByPlaceholder('you@example.com').fill(ADMIN_EMAIL ?? '')
  await page.getByPlaceholder('Enter your password').fill(PASSWORD ?? '')
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL('**/admin**')
}

const PAGES = ['operations', 'exceptions', 'jobs', 'professionals', 'professionals/verification', 'customers', 'finance', 'communications', 'audit']

test.describe('admin console (read-only)', () => {
  for (const p of PAGES) {
    test(`/admin/${p} renders one heading and no error state`, async ({ page }) => {
      await signInAdmin(page)
      await page.goto(`/admin/${p}`)
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
      await expect(page.getByRole('alert').filter({ hasText: /Could not load/ })).toHaveCount(0)
    })
  }

  test('jobs assignment filter narrows the directory via the URL', async ({ page }) => {
    await signInAdmin(page)
    await page.goto('/admin/jobs?assignment=no_professional')
    await expect(page).toHaveURL(/assignment=no_professional/)
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
  })

  test('a keyboard user reaches the skip link first', async ({ page }) => {
    await signInAdmin(page)
    await page.goto('/admin')
    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
  })

  test('a non-admin path is refused', async ({ page }) => {
    await page.goto('/admin/finance')
    await expect(page).not.toHaveURL(/\/admin\/finance/)
  })
})
