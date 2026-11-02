import { test, expect, type Page } from '@playwright/test'

/**
 * A1/A3 critical paths that need no fixture beyond the seeded test accounts.
 * Admin approve/reject and reconcile journeys need synthetic verification and mismatch
 * fixtures plus an admin session and are NOT covered here yet.
 *
 * The shared password comes from the environment; without it these skip (or fail when
 * E2E_REQUIRED=1). E2E_CANCEL_BOOKING_ID must be a synthetic, past-dated, open booking of
 * customer.a@fixify.dev with no job; it is cancelled by the last test.
 */
const PASSWORD = process.env.E2E_TEST_PASSWORD
test.skip(!PASSWORD, 'Set E2E_TEST_PASSWORD to run the A1/A3 specs')

const CANCEL_BOOKING = process.env.E2E_CANCEL_BOOKING_ID

async function signIn(page: Page, door: 'customer' | 'professional', email: string) {
  await page.goto(`/auth/login?as=${door}&logged_out=1`)
  await page.getByPlaceholder('you@example.com').fill(email)
  await page.getByPlaceholder('Enter your password').fill(PASSWORD ?? '')
  await page.locator('form button[type="submit"]').click()
}

const ADMIN_PAGES = ['/admin', '/admin/operations', '/admin/professionals', '/admin/jobs']

test.describe('admin console is closed to other roles', () => {
  for (const [door, email, home] of [
    ['customer', 'customer.a@fixify.dev', '/customer'],
    ['professional', 'pro.a@fixify.dev', '/professional'],
  ] as const) {
    test(`${door} cannot open any admin page`, async ({ page }) => {
      await signIn(page, door, email)
      await page.waitForURL(`**${home}`)
      for (const path of ADMIN_PAGES) {
        await page.goto(path)
        expect(new URL(page.url()).pathname, path).toBe(home)
      }
    })
  }
})

test.describe('customer cancel control', () => {
  test.skip(!CANCEL_BOOKING, 'Set E2E_CANCEL_BOOKING_ID to a synthetic open booking')

  test('requires a reason, then cancels and shows the cancelled notice', async ({ page }) => {
    await signIn(page, 'customer', 'customer.a@fixify.dev')
    await page.waitForURL('**/customer')
    await page.goto(`/customer/bookings/${CANCEL_BOOKING}`)
    await page.getByRole('button', { name: 'Cancel booking' }).click()
    await page.getByRole('button', { name: 'Confirm cancellation' }).click()
    // No reason chosen yet: the booking must still be open.
    await expect(page.getByRole('button', { name: 'Confirm cancellation' })).toBeVisible()
    await page.getByRole('radio').first().check()
    await page.getByRole('button', { name: 'Confirm cancellation' }).click()
    await expect(page.getByText('This booking is cancelled')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Cancel booking' })).toHaveCount(0)
  })
})
