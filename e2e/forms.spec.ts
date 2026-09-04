import { test, expect, type Page } from '@playwright/test'

/**
 * The two forms, end to end against the REAL endpoint.  `npm run e2e`
 *
 * ── Why this can exist at all ──
 *
 * `playwright.config.ts` runs `npm run preview` — `vite preview`, not
 * `vercel dev` — so Vercel's own function runtime is never involved here. What
 * answers `/api/*` is the `apiRouting()` plugin in `vite.config.ts`, calling
 * exactly the `server/endpoint.ts` that answers in production. Without that
 * plugin these tests could only stub the endpoint with `page.route`, which
 * proves the client can parse a fixture and would let a broken handler ship
 * green.
 *
 * ── And why it cannot send mail ──
 *
 * The preview server has no `RESEND_API_KEY`, so `readMailConfig` returns a dry
 * run and `handleSubmission` never calls the transport. The FIRST test below
 * asserts that, and it is deliberately first: it is the one line standing
 * between a misconfigured machine and this suite emailing the client every time
 * somebody runs it.
 */

/** Waits for the intro to land. The audit trigger only exists at phase 'site'. */
async function reachSite(page: Page) {
  await page.waitForSelector('.audit-trigger', { timeout: 75_000 })
  await page.waitForTimeout(400)
}

/** Fills a contact dialog that is already open. */
async function fillContact(page: Page, overrides: Partial<Record<string, string>> = {}) {
  await page.fill('#contact-name', overrides.name ?? 'Nombre Prueba')
  await page.fill('#contact-email', overrides.email ?? 'prueba@example.com')
  await page.fill('#contact-message', overrides.message ?? 'Hola, escribo desde el e2e.')
}

/**
 * The server refuses anything filled faster than a person could. Every test
 * that means to succeed waits it out — which also means these tests prove the
 * check is really there.
 */
const MIN_FILL_MS = 3_000

test.describe('the forms reach a real endpoint', () => {
  test('the preview server is in dry run, so this suite cannot send mail', async ({ page }) => {
    // FIRST, and the most important assertion in the file. If a machine running
    // this had RESEND_API_KEY set, every other test below would put a real
    // message in somebody's inbox.
    const response = await page.request.post('/api/contact', {
      data: {
        name: 'Nombre Prueba',
        email: 'prueba@example.com',
        message: 'Comprobación del modo de prueba.',
        empresa: '',
        startedAt: Date.now() - 30_000,
      },
    })

    expect(response.status()).toBe(200)
    const body = (await response.json()) as { ok: boolean; delivery?: string }
    expect(body.ok).toBe(true)
    expect(
      body.delivery,
      'the preview server is configured to SEND — refusing to run the rest of this file',
    ).toBe('dry-run')
  })

  test('the endpoint validates on the server, whatever the browser allowed', async ({ page }) => {
    // Posted directly, bypassing the form: this is what a script sees, and the
    // answer to API-3 ("no server-side form controls").
    const response = await page.request.post('/api/audit', {
      data: {
        plan: 'no-such-plan',
        name: '',
        email: 'nope',
        website: 'http://169.254.169.254/latest/meta-data/',
        phone: '',
        empresa: '',
        startedAt: Date.now() - 30_000,
      },
    })

    expect(response.status()).toBe(422)
    const body = (await response.json()) as { code: string; fields: Record<string, string> }
    expect(body.code).toBe('invalid')
    // API-2: the metadata address the old client regex accepted.
    expect(Object.keys(body.fields).sort()).toEqual(['email', 'name', 'plan', 'website'])
  })

  test('a filled honeypot is accepted and silently discarded', async ({ page }) => {
    const response = await page.request.post('/api/contact', {
      data: {
        name: 'Bot',
        email: 'bot@example.com',
        message: 'Compre nuestras cosas.',
        empresa: 'Bot Industries',
        startedAt: Date.now() - 30_000,
      },
    })

    // 200 so the script learns nothing, `discarded` so this test can tell the
    // difference that the script cannot.
    expect(response.status()).toBe(200)
    expect((await response.json()) as { delivery?: string }).toMatchObject({
      ok: true,
      delivery: 'discarded',
    })
  })

  test('a submission filled impossibly fast is refused, and says to wait', async ({ page }) => {
    const response = await page.request.post('/api/contact', {
      data: {
        name: 'Nombre Prueba',
        email: 'veloz@example.com',
        message: 'Instantáneo.',
        empresa: '',
        startedAt: Date.now(),
      },
    })

    expect(response.status()).toBe(429)
    const body = (await response.json()) as { code: string; retryAfterSeconds: number }
    expect(body.code).toBe('rate_limited')
    expect(body.retryAfterSeconds).toBeGreaterThan(0)
    expect(response.headers()['retry-after']).toBeTruthy()
  })

  test('the endpoint refuses everything but a JSON POST', async ({ page }) => {
    const get = await page.request.get('/api/contact')
    expect(get.status()).toBe(405)
    expect(get.headers().allow).toBe('POST')

    const text = await page.request.post('/api/contact', {
      headers: { 'content-type': 'text/plain' },
      data: 'name=x',
    })
    expect(text.status()).toBe(415)
  })
})

test.describe('the contact dialog', () => {
  test('reaches the delivered state through the real endpoint', async ({ page }) => {
    await page.goto('/')
    await reachSite(page)

    await page.locator('.contact-trigger').click()
    await expect(page.locator('.contact-form')).toBeVisible()

    await fillContact(page)
    // The dialog opened moments ago; the server would refuse it as too fast.
    await page.waitForTimeout(MIN_FILL_MS)

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/contact')),
      page.locator('.contact-cta').click(),
    ])
    expect(response.status()).toBe(200)

    // The receipt, and its copy comes from the CMS rather than from the source.
    const success = page.locator('.contact-success')
    await expect(success).toBeVisible()
    await expect(success.locator('h2')).not.toBeEmpty()
    await expect(page.locator('.contact-form')).toHaveCount(0)
  })

  test('shows a rate-limited refusal differently from a generic failure', async ({ page }) => {
    // Stubbed, not provoked: the limiter is process-global and the preview
    // server is reused between runs, so a real 429 here would depend on what
    // any earlier test happened to leave behind.
    await page.goto('/')
    await reachSite(page)

    await page.route('**/api/contact', (route) =>
      route.fulfill({
        status: 429,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, code: 'rate_limited', retryAfterSeconds: 60 }),
      }),
    )

    await page.locator('.contact-trigger').click()
    await fillContact(page)
    await page.waitForTimeout(MIN_FILL_MS)
    await page.locator('.contact-cta').click()

    const error = page.locator('.contact-form__error')
    await expect(error).toBeVisible()
    await expect(error).toContainText(/espera un minuto/i)
    // The generic line must NOT be what a rate-limited person reads.
    await expect(error).not.toContainText(/escríbenos directamente/i)
  })

  test('renders a field the server rejected against that field', async ({ page }) => {
    await page.goto('/')
    await reachSite(page)

    await page.route('**/api/contact', (route) =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: false,
          code: 'invalid',
          fields: { email: 'Ese dominio no existe.' },
        }),
      }),
    )

    await page.locator('.contact-trigger').click()
    await fillContact(page)
    await page.waitForTimeout(MIN_FILL_MS)
    await page.locator('.contact-cta').click()

    await expect(page.locator('#contact-email')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('#contact-email-error')).toContainText('Ese dominio no existe.')
    // And it clears when the person edits the field, without a second request.
    await page.fill('#contact-email', 'otra@example.com')
    await expect(page.locator('#contact-email-error')).toHaveCount(0)
  })

  test('never reaches the delivered state when the endpoint fails', async ({ page }) => {
    // The whole honesty rule, seen from the outside.
    await page.goto('/')
    await reachSite(page)

    await page.route('**/api/contact', (route) =>
      route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, code: 'upstream_failed' }),
      }),
    )

    await page.locator('.contact-trigger').click()
    await fillContact(page)
    await page.waitForTimeout(MIN_FILL_MS)
    await page.locator('.contact-cta').click()

    await expect(page.locator('.contact-form__error')).toBeVisible()
    await expect(page.locator('.contact-success')).toHaveCount(0)
    await expect(page.locator('.contact-form')).toBeVisible()
  })
})

test.describe('the honeypot', () => {
  test('is invisible, unreachable by keyboard and hidden from assistive tech', async ({ page }) => {
    await page.goto('/')
    await reachSite(page)
    await page.locator('.contact-trigger').click()
    await expect(page.locator('.contact-form')).toBeVisible()

    const field = page.locator('#contact-empresa')
    await expect(field).toHaveAttribute('tabindex', '-1')
    await expect(field).toHaveCount(1)

    // Off screen rather than display:none — the cruder scripts skip the latter,
    // and skipping is what would make the field useless.
    const box = await field.boundingBox()
    expect(box === null || box.x < 0).toBe(true)

    // Its wrapper is aria-hidden, so nothing reads it out.
    const hidden = await field.evaluate((el) => el.closest('[aria-hidden="true"]') !== null)
    expect(hidden).toBe(true)
  })
})
