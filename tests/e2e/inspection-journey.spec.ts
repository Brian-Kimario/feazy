import { execFileSync } from 'node:child_process'
import { test, expect, type Page } from '@playwright/test'

/**
 * Authenticated inspection + materials journey. Runs only against a disposable LOCAL Supabase stack
 * seeded with supabase/seeds/local_synthetic_catalogue.sql and the synthetic *@feazy.test accounts.
 * Opt in with E2E_LOCAL_JOURNEY=1 and PLAYWRIGHT_TEST_BASE_URL. Never point this at a shared project.
 * E2E_DB_URL (the local Postgres URL, `supabase status`) lets the journey check database state after each step.
 */
const ENABLED = process.env.E2E_LOCAL_JOURNEY === '1'
const PASSWORD = process.env.E2E_LOCAL_PASSWORD ?? ''
const DB_URL = process.env.E2E_DB_URL ?? ''
const SHOTS = process.env.E2E_SHOTS_DIR
// Extra browser contexts do not inherit the config's baseURL, so they take the same origin explicitly.
const BASE_URL = process.env.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000'

test.skip(!ENABLED, 'set E2E_LOCAL_JOURNEY=1 against a local stack')
test.describe.configure({ mode: 'serial' })

async function signIn(page: Page, door: 'customer' | 'professional', email: string) {
  await page.goto(`/auth/login?as=${door}&logged_out=1`)
  // Wait for the form to hydrate. A fill made before hydration can be reset by React, which left the email empty on WebKit.
  await page.waitForLoadState('networkidle')
  const emailField = page.getByPlaceholder('you@example.com')
  await emailField.fill(email)
  await expect(emailField).toHaveValue(email)
  await page.getByPlaceholder('Enter your password').fill(PASSWORD)
  await page.locator('form button[type="submit"]').click()
  await page.waitForURL((u) => !u.pathname.startsWith('/auth/login'))
  // The post-login redirect can still be loading. A goto issued during it is interrupted on WebKit, so let it settle.
  await page.waitForLoadState('networkidle')
}

async function shot(page: Page, name: string) {
  if (!SHOTS) return
  // Firefox refuses a full-page capture taller than 32767px. Fall back to the viewport rather than fail the journey.
  await page
    .screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true })
    .catch(() => page.screenshot({ path: `${SHOTS}/${name}.png` }))
}

let bookingUrl = ''
const inspectorUserId = process.env.E2E_INSPECTOR_ID ?? ''

/** Runs one scalar query against the local database. The id comes from our own test state and is checked as a UUID. */
function dbScalar(sql: string): string {
  if (!DB_URL) throw new Error('set E2E_DB_URL to the local database URL to check database state')
  return execFileSync('psql', [DB_URL, '-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
  }).trim()
}

// Each run starts from the seeded state. Otherwise an open booking from the last run trips the duplicate-inspection guard (P0005).
test.beforeAll(() => {
  if (!DB_URL) return
  execFileSync('bash', ['scripts/seed-local-e2e-users.sh'], { env: { ...process.env, DB_URL }, stdio: 'pipe' })
})

function bookingId(): string {
  const id = bookingUrl.split('/').pop() ?? ''
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error(`no booking id captured from ${bookingUrl}`)
  return id
}

/** Latest visit for the journey's booking, as `status|outcome`. */
function latestVisit(): string {
  return dbScalar(
    `select status || '|' || coalesce(outcome, '') from inspection_visits where booking_id = '${bookingId()}' order by created_at desc limit 1`,
  )
}

test('customer books a free inspection and picks materials', async ({ page }) => {
  await signIn(page, 'customer', 'customer@feazy.test')
  await page.goto('/customer/bookings/new')
  // Coming-soon categories are not offered.
  await expect(page.getByRole('tab', { name: 'Pest Control' })).toHaveCount(0)
  await page.getByRole('tab', { name: 'Plumbing' }).click()
  await page.getByRole('button', { name: /Leak repair/ }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByText('Materials and brands you prefer')).toBeVisible()
  await shot(page, 'customer-wizard-materials')
  await page.getByLabel(/Jaquar Basin tap/).check()
  await page.getByLabel(/Waterproofing sealant/).check()
  await page.getByRole('button', { name: 'Continue' }).click()
  const d = new Date(Date.now() + 3 * 86400000)
  d.setHours(11, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  await page.locator('#scheduled_start').fill(
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T11:00`,
  )
  await page.getByRole('button', { name: 'Review' }).last().click()
  await shot(page, 'customer-wizard-review')
  await page.getByRole('button', { name: 'Confirm booking' }).click()
  await page.getByRole('button', { name: /View booking/ }).click()
  await page.waitForURL(/\/customer\/bookings\/[0-9a-f-]{36}/)
  bookingUrl = new URL(page.url()).pathname
  // With free inspection on, no visit fee is charged: the booking is priced after inspection.
  await expect(page.getByText('Quote after inspection').first()).toBeVisible()
  await expect(page.getByText('Jaquar Basin tap').first()).toBeVisible()
  await shot(page, 'customer-booking-detail')
})

test('admin registers an inspector and assigns the free visit', async ({ page }) => {
  await signIn(page, 'customer', 'admin@feazy.test')
  await page.goto('/admin/inspections')
  await expect(page.getByRole('heading', { name: 'Free inspections' })).toBeVisible()
  await expect(page.getByText(/Needs action \(1\)/)).toBeVisible()
  // Controlled inputs filled before hydration can lose their values (seen on WebKit), which leaves the submit disabled.
  await page.waitForLoadState('networkidle')
  // Failed action: a non-inspector account id is refused.
  await page.getByLabel(/Account id/).fill('00000000-0000-0000-0000-000000000000')
  await page.getByLabel(/^Name/).fill('Ghost')
  await page.getByRole('button', { name: 'Register inspector' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  // Successful registration.
  await page.getByLabel(/Account id/).fill(inspectorUserId)
  await page.getByLabel(/^Name/).fill('Ravi Inspector')
  await page.getByLabel(/^Phone/).fill('9000000001')
  await page.getByRole('button', { name: 'Register inspector' }).click()
  await expect(page.getByRole('status')).toHaveText('Saved.')
  // The form calls router.refresh() after a save, so the list updates in place. A manual reload here aborts that
  // in-flight refresh on Firefox (NS_BINDING_ABORTED).
  await expect(page.getByText('Ravi Inspector ·')).toBeVisible()
  // Role-based, because a dev-only "Open in editor" button also matches the plain label 'Inspector'.
  await page.getByRole('combobox', { name: /^Inspector/ }).selectOption({ label: 'Ravi Inspector' })
  const d = new Date(Date.now() + 2 * 86400000)
  const pad = (n: number) => String(n).padStart(2, '0')
  await page.getByLabel('Visit time').fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T10:00`)
  await page.getByRole('button', { name: 'Assign' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Assigned.' })).toBeVisible()
  await shot(page, 'admin-inspections')
  // The visit must exist for this booking, with the inspector assigned and the booking still awaiting inspection.
  expect(latestVisit()).toBe('scheduled|')
  expect(dbScalar(`select count(*) from jobs where booking_id = '${bookingId()}'`)).toBe('0')
})

test('inspector confirms materials and submits findings', async ({ page }) => {
  await signIn(page, 'professional', 'inspector@feazy.test')
  // Sign-in redirects to the inspector dashboard itself. A manual goto on WebKit interrupts that redirect, so wait for it.
  await page.waitForURL(/\/inspector(\?|$)/)
  await shot(page, 'inspector-dashboard')
  await page.getByRole('link', { name: /Leak repair/ }).first().click()
  await page.waitForURL(/\/inspector\/visits\//)
  await expect(page.getByText('Customer asked').first()).toBeVisible()
  // Failed action: report too short keeps the submit disabled.
  await expect(page.getByRole('button', { name: 'Submit report' })).toBeDisabled()
  await page.getByLabel(/Jaquar Basin tap/).check()
  await page.getByLabel(/Quantity/).first().fill('2')
  await page.getByRole('button', { name: 'Save materials' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Materials saved' })).toBeVisible()
  // Failed action: zero quantity refused.
  await page.getByLabel(/Quantity/).first().fill('0')
  await page.getByRole('button', { name: 'Save materials' }).click()
  await expect(page.getByRole('alert').first()).toBeVisible()
  await page.getByLabel(/Quantity/).first().fill('2')
  await page.getByRole('button', { name: 'Save materials' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Materials saved' })).toBeVisible()
  await shot(page, 'inspector-visit')
  await page.getByLabel(/Findings/).fill('Basin tap cartridge worn; supply valve seized. Replacement needed.')
  await page.getByRole('button', { name: 'Submit report' }).click()
  await page.waitForLoadState('networkidle')
  await shot(page, 'inspector-after-report')
  // A repair finding completes the visit and hands the booking to matching in the same transaction.
  expect(latestVisit()).toBe('completed|repair_needed')
  expect(
    dbScalar(
      `select count(*) from jobs where booking_id = '${bookingId()}' and professional_id is not null and current_state = 'assigned'`,
    ),
  ).toBe('1')
})

test('customer sees findings and confirmed materials; unauthorized roles are blocked', async ({ page, browser }) => {
  await signIn(page, 'customer', 'customer@feazy.test')
  await page.goto(bookingUrl)
  await expect(page.getByText(/Basin tap cartridge worn/)).toBeVisible()
  await expect(page.getByText(/Jaquar Basin tap/).first()).toBeVisible()
  await shot(page, 'customer-after-inspection')
  for (const path of ['/admin/inspections', '/admin/catalogue', '/inspector']) {
    await page.goto(path)
    await expect(page).not.toHaveURL(new RegExp(`${path}$`))
  }
  // A different customer cannot open someone else's booking.
  const ctx = await browser.newContext({ baseURL: BASE_URL })
  const other = await ctx.newPage()
  await signIn(other, 'customer', 'stranger@feazy.test')
  const res = await other.goto(bookingUrl)
  await expect(other.getByText(/Basin tap cartridge worn/)).toHaveCount(0)
  expect(res?.status() === 404 || !other.url().endsWith(bookingUrl) || (await other.getByText(/not found|can.t find|no access/i).count()) > 0).toBeTruthy()
  await ctx.close()
})

test('admin catalogue: availability controls the booking flow and material pricing validates', async ({ page, browser }) => {
  await signIn(page, 'customer', 'admin@feazy.test')
  await page.goto('/admin/catalogue')
  await shot(page, 'admin-catalogue')
  const painting = page.locator('li', { hasText: 'Painting' }).filter({ has: page.getByLabel('Availability') }).first()
  await expect(painting.getByRole('status').filter({ hasText: 'No verified professionals' })).toBeVisible()
  const customerCtx = await browser.newContext({ baseURL: BASE_URL })
  const cust = await customerCtx.newPage()
  await signIn(cust, 'customer', 'customer@feazy.test')
  await cust.goto('/customer/bookings/new')
  await expect(cust.getByRole('tab', { name: 'Painting' })).toBeVisible()
  await painting.getByLabel('Availability').selectOption('coming_soon')
  await painting.getByRole('button', { name: 'Save' }).click()
  await expect(painting.getByText('Saved.')).toBeVisible()
  await cust.goto('/customer/bookings/new')
  await expect(cust.getByRole('tab', { name: 'Painting' })).toHaveCount(0)
  // restore
  await painting.getByLabel('Availability').selectOption('bookable')
  await painting.getByRole('button', { name: 'Save' }).click()
  await expect(painting.getByText('Saved.')).toBeVisible()
  // material pricing: invalid refused, valid saved and shown to customers
  const tap = page.locator('div', { has: page.locator('input[value="Basin tap"]') }).last()
  const priceField = page.getByLabel(/Guide price/).first()
  await priceField.fill('-5')
  await page.getByRole('button', { name: 'Save material' }).first().click()
  await expect(page.getByRole('alert').first()).toBeVisible()
  await priceField.fill('1500')
  await page.getByRole('button', { name: 'Save material' }).first().click()
  await expect(page.getByText('Saved.').first()).toBeVisible()
  void tap
  await customerCtx.close()
})

test('fixed-price service books directly with no inspection visit', async ({ page }) => {
  await signIn(page, 'customer', 'customer@feazy.test')
  await page.goto('/customer/bookings/new')
  await page.getByRole('tab', { name: 'Electrical' }).click()
  await page.getByRole('button', { name: /Fan installation/ }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  const d = new Date(Date.now() + 4 * 86400000)
  const pad = (n: number) => String(n).padStart(2, '0')
  await page.locator('#scheduled_start').fill(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T12:00`)
  await page.getByRole('button', { name: 'Review' }).last().click()
  await page.getByRole('button', { name: 'Confirm booking' }).click()
  await page.getByRole('button', { name: /View booking/ }).click()
  await page.waitForURL(/\/customer\/bookings\/[0-9a-f-]{36}/)
  await expect(page.getByText(/free inspection/i)).toHaveCount(0)
  await shot(page, 'customer-fixed-price-booking')
})

// Phone, tablet and desktop widths. The journeys above run at the default viewport.
const VIEWPORTS = [
  { label: 'phone', width: 375, height: 812 },
  { label: 'tablet', width: 768, height: 1024 },
  { label: 'desktop-1280', width: 1280, height: 800 },
  { label: 'desktop-1440', width: 1440, height: 900 },
]

for (const vp of VIEWPORTS) {
  test(`${vp.label} layouts render without horizontal overflow`, async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: BASE_URL, viewport: { width: vp.width, height: vp.height } })
    const page = await ctx.newPage()
    const check = async (name: string) => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow, `${vp.label} ${name} overflows`).toBeLessThanOrEqual(1)
      // Viewport-sized, not full page: Firefox refuses a full-page capture taller than 32767px on long admin pages.
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${vp.label}-${name}.png` })
    }
    await signIn(page, 'customer', 'customer@feazy.test')
    await page.goto('/customer/bookings/new'); await check('customer-wizard')
    await page.goto(bookingUrl); await check('customer-booking')
    await ctx.clearCookies()
    await signIn(page, 'professional', 'inspector@feazy.test')
    // Sign-in redirects to the inspector dashboard; see the inspector journey above.
    await page.waitForURL(/\/inspector(\?|$)/); await check('inspector')
    await ctx.clearCookies()
    await signIn(page, 'customer', 'admin@feazy.test')
    await page.goto('/admin/inspections'); await check('admin-inspections')
    await page.goto('/admin/catalogue'); await check('admin-catalogue')
    await ctx.close()
  })
}

test('professional sees the inspected job with confirmed materials and can accept it', async ({ page }) => {
  await signIn(page, 'professional', 'pro@feazy.test')
  await page.goto('/professional/requests')
  await shot(page, 'professional-requests')
  const card = page.getByRole('article', { name: /Leak repair/ })
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Accept', exact: true }).click()
  await page.waitForURL(/\/professional\/jobs\/[0-9a-f-]{36}/, { timeout: 15000 }).catch(async () => {
    await page.goto('/professional/jobs')
    await page.getByRole('link', { name: /Leak repair/ }).first().click()
    await page.waitForURL(/\/professional\/jobs\/[0-9a-f-]{36}/)
  })
  await expect(page.getByText(/Jaquar Basin tap/).first()).toBeVisible()
  await expect(page.getByText(/Basin tap cartridge worn/).first()).toBeVisible()
  await shot(page, 'professional-job')
  await shot(page, 'professional-job-accepted')
})
