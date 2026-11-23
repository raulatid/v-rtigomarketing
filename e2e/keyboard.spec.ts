import { test, expect, type Locator, type Page } from '@playwright/test'

/**
 * The site from the keyboard alone: every surface the 2026-11-18 accessibility
 * audit found the focus lost on or escaping from, walked with Tab, Shift+Tab,
 * Enter and Escape, asserting `activeElement` and that a modal keeps the focus
 * in. Desktop only (the chromium project); the consent banner is seeded away
 * by the config, so Tab is not detoured through it.
 *
 * Waits on states rather than on time: in CI the scene runs on a software
 * renderer at a few frames a second, and every flight is that much slower. A
 * press the scene may refuse while it is still busy (a satellite still
 * entering, a flight still landing) is retried until it is taken. Nothing here
 * assumes how many cases, services or posts the CMS publishes.
 */

test.describe.configure({ timeout: 180_000 })

async function reachSite(page: Page) {
  await page.goto('/')
  await page.waitForSelector('.audit-trigger', { timeout: 75_000 })
  await page.waitForTimeout(400)
}

/** Murcia is built, the warp has landed and its UI is showing. */
async function reachMurcia(page: Page) {
  await expect(page.locator('.nav')).toHaveAttribute('data-state', 'idle', { timeout: 90_000 })
  const rail = page.locator('.nav-control')
  await rail.focus()
  await expect(rail).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(rail).toHaveAttribute('aria-label', 'Volver a la Tierra', { timeout: 60_000 })
  await expect(page.locator('.murcia-ui')).toBeVisible({ timeout: 60_000 })
}

/** Focuses a control and proves it took the focus: `.focus()` on a hidden or disabled one is silent. */
async function focusOn(control: Locator) {
  await control.focus()
  await expect(control).toBeFocused()
}

const isFocused = (target: Locator) => target.evaluate((el) => el === document.activeElement).catch(() => false)

/**
 * Presses Enter on `control` until `landed` holds: the scene refuses a press
 * while it is busy and does not queue it. Checks `landed` FIRST on every try,
 * so a press taken late is never pressed again (the way in hides once taken).
 */
async function pressUntil(page: Page, control: Locator, landed: Locator, timeout = 120_000) {
  await expect(async () => {
    if (await isFocused(landed)) return
    await focusOn(control)
    await page.keyboard.press('Enter')
    await expect(landed).toBeFocused({ timeout: 10_000 })
  }).toPass({ timeout })
}

/** Escape until `landed` has the focus, for the same reason, checked the same way. */
async function escapeUntil(page: Page, landed: Locator, timeout = 120_000) {
  await expect(async () => {
    if (await isFocused(landed)) return
    await page.keyboard.press('Escape')
    await expect(landed).toBeFocused({ timeout: 10_000 })
  }).toPass({ timeout })
}

/**
 * The trap at its two edges: from the last reachable control Tab goes to the
 * first, and from the first Shift+Tab goes to the last. Reachable is what the
 * trap itself counts (`src/components/focusTrap.ts`).
 */
async function trapsAtBothEdges(page: Page, selector: string) {
  const edges = async () =>
    page.evaluate((sel) => {
      const root = document.querySelector(sel)!
      const all = Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.tabIndex >= 0 && !el.closest('[inert], [aria-hidden="true"]') && el.getClientRects().length > 0)
      all.forEach((el, i) => el.setAttribute('data-trap-index', String(i)))
      return all.length
    }, selector)
  const count = await edges()
  expect(count, `nothing reachable in ${selector}`).toBeGreaterThan(1)
  const first = page.locator(`${selector} [data-trap-index="0"]`)
  const last = page.locator(`${selector} [data-trap-index="${count - 1}"]`)
  await focusOn(last)
  await page.keyboard.press('Tab')
  await expect(first).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(last).toBeFocused()
}

test.describe('the site from the keyboard', () => {
  test('the intro offers nothing to tab to (D3)', async ({ page }) => {
    await page.goto('/')
    // The intro is running and the app has mounted: the rail exists, inert.
    await page.waitForFunction(() => (window as unknown as Record<string, unknown>).__vertigoIntro !== undefined)
    await expect(page.locator('.nav')).toHaveAttribute('inert', '', { timeout: 30_000 })
    await expect(page.locator('.audit-trigger')).toHaveCount(0)
    await page.keyboard.press('Tab')
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true)
  })

  test('a case opens from its button, takes the focus to its title and gives it back (T1, T2)', async ({ page }) => {
    await reachSite(page)
    const first = page.locator('.case-list__control').first()
    await pressUntil(page, first, page.locator('.case-panel__title'))
    await expect(first).toHaveAttribute('aria-expanded', 'true')
    await page.keyboard.press('Escape')
    await expect(first).toBeFocused({ timeout: 10_000 })
  })

  test('Contacto keeps Tab inside and gives the focus back to its trigger (F1)', async ({ page }) => {
    await reachSite(page)
    const trigger = page.locator('.contact-trigger')
    await focusOn(trigger)
    await page.keyboard.press('Enter')
    await expect(page.locator('.contact-panel .modal-title')).toBeFocused()
    await trapsAtBothEdges(page, '.contact-panel')
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
  })

  test('the legal panel over Contacto closes alone on Escape (F4)', async ({ page }) => {
    await reachSite(page)
    await focusOn(page.locator('.contact-trigger'))
    await page.keyboard.press('Enter')
    await expect(page.locator('.contact-panel .modal-title')).toBeFocused()
    const link = page.locator('.contact-note__link')
    await focusOn(link)
    await page.keyboard.press('Enter')
    await expect(page.locator('.legal-panel')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.legal-panel')).toHaveCount(0)
    await expect(page.locator('.contact-panel')).toBeVisible()
    await expect(link).toBeFocused()
  })

  test('the audit curtain is a dialog that keeps Tab inside (F2)', async ({ page }) => {
    await reachSite(page)
    const trigger = page.locator('.audit-trigger')
    await focusOn(trigger)
    await page.keyboard.press('Enter')
    await expect(page.locator('.audit-overlay')).toHaveAttribute('aria-modal', 'true')
    await expect(page.locator('.audit-title')).toBeFocused({ timeout: 15_000 })
    await trapsAtBothEdges(page, '.audit-overlay')
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused({ timeout: 15_000 })
  })

  test('Servicios and Conócenos never drop the focus to <body> (M1, M3)', async ({ page }) => {
    test.setTimeout(300_000)
    await reachSite(page)
    await reachMurcia(page)
    // By group rather than by text: the services' name is the CMS's.
    const servicesWayIn = page.locator('.district-a11y:not([aria-label="Conócenos"]) .district-a11y-control').first()
    const aboutWayIn = page.locator('.district-a11y[aria-label="Conócenos"] .district-a11y-control').first()
    const plate = '.campus-overlay:not(.campus-overlay--about)'

    await pressUntil(page, servicesWayIn, page.locator(`${plate} .campus-overlay__title`))
    // A step keeps the focus on the plate however many services there are:
    // on the arrow, or on the title if that was the last one.
    const nextArrow = page.locator(`${plate} .campus-overlay__page--next`)
    if (await nextArrow.isEnabled()) {
      await focusOn(nextArrow)
      await page.keyboard.press('Enter')
      await expect
        .poll(() => page.evaluate((sel) => document.querySelector(sel)!.contains(document.activeElement), plate), { timeout: 30_000 })
        .toBe(true)
    }
    await escapeUntil(page, servicesWayIn)

    // Taken once the camera is back from the campus.
    await pressUntil(page, aboutWayIn, page.locator('.about-paging .campus-overlay__page--next'))
    await expect(page.locator('.district-a11y-live').filter({ hasText: 'Conócenos · 01 / 03' })).toHaveCount(1)
    await escapeUntil(page, aboutWayIn)
  })

  test('back to the blog index lands on the card of the article left (B6)', async ({ page }) => {
    await page.goto('/blog')
    // Hydrated: the route focuses its heading once React has mounted it. A
    // press before that would be the shell's plain link, a full page load.
    await expect(page.locator('.blog-hero__title')).toBeFocused({ timeout: 30_000 })
    const card = page.locator('.blog-card').first()
    const href = await card.getAttribute('href', { timeout: 15_000 })
    await focusOn(card)
    await page.keyboard.press('Enter')
    await expect(page.locator('.blog-article__title')).toBeFocused({ timeout: 15_000 })
    await page.goBack()
    await expect(page.locator(`.blog-card[href="${href}"]`)).toBeFocused({ timeout: 15_000 })
  })
})
