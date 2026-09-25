import { expect, test, type Page } from '@playwright/test'

/**
 * The cookie consent banner, end to end.
 *
 * Every other spec runs with a choice already stored (playwright.config.ts
 * seeds it), so a first-load banner never sits under their coordinate clicks
 * or in their baselines. This is the one spec that wants to see it, so it
 * starts each context empty.
 *
 * What only the built artifact can tell: that the banner mounts at phase
 * 'site' and not before, that a choice survives a reload through real
 * localStorage, and that the cold `blog.html` — which has no App at all —
 * carries its own copy under its own legal panel.
 */

test.use({ storageState: { cookies: [], origins: [] } })

const KEY = 'vertigo:consent'

/** Waits for the intro to land. The audit trigger only exists at phase 'site'. */
async function reachSite(page: Page) {
  await page.waitForSelector('.audit-trigger', { state: 'attached', timeout: 75_000 })
  await page.waitForTimeout(400)
}

async function stored(page: Page): Promise<unknown> {
  return page.evaluate((key) => {
    const raw = localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  }, KEY)
}

test.describe('the cookie consent banner', () => {
  test('saves categories independently and synchronizes withdrawal across tabs', async ({ page, context }) => {
    await page.goto('/blog')
    await page.getByRole('button', { name: 'Configurar cookies' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.locator('details')).not.toHaveAttribute('open', '')
    await dialog.getByRole('switch', { name: 'Preferencias de experiencia' }).check()
    await dialog.getByRole('button', { name: 'Guardar preferencias' }).click()
    expect(await stored(page)).toMatchObject({ v: 4, preferences: true, analytics: false })
    await dialog.getByRole('button', { name: 'Cerrar', exact: true }).click()
    await page.reload()
    await page.getByRole('button', { name: 'Cookies y preferencias' }).click()
    await expect(dialog.getByRole('switch', { name: 'Preferencias de experiencia' })).toBeChecked()
    const other = await context.newPage()
    await other.goto('/blog')
    await other.getByRole('button', { name: 'Cookies y preferencias' }).click()
    await page.evaluate(() => localStorage.setItem('vertigo:intro', JSON.stringify({ v: 1, seen: true })))
    await dialog.getByRole('button', { name: 'Rechazar todas' }).click()
    await expect(other.getByRole('switch', { name: 'Preferencias de experiencia' })).not.toBeChecked()
    expect(await page.evaluate(() => localStorage.getItem('vertigo:intro'))).toBeNull()
    await dialog.getByRole('button', { name: 'Aceptar todas' }).click()
    await expect(other.getByRole('switch', { name: 'Analítica' })).toBeChecked()
    await dialog.getByRole('switch', { name: 'Analítica' }).uncheck()
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Cookies y preferencias' }).click()
    await expect(dialog.getByRole('switch', { name: 'Analítica' })).toBeChecked()
    await dialog.locator('summary').click()
    await expect(dialog.locator('details')).toHaveAttribute('open', '')
    await other.close()
  })
  test('asks once the intro lands, not before, and Escape does not dismiss it', async ({ page }) => {
    await page.goto('/')
    // Readiness is the drawing's fill; the handover to 'site' takes several
    // seconds more. No chrome until then (DECISIONS §26.16), the banner included.
    await expect
      .poll(() => page.evaluate(() => window.__vertigoIntro?.boot.readiness() ?? 'absent'), {
        timeout: 75_000,
      })
      .toBe('ready')
    await expect(page.locator('.consent-banner')).toHaveCount(0)

    await reachSite(page)
    const region = page.getByRole('region', { name: /cookies/i })
    await expect(region).toBeVisible()
    await expect(region).toHaveAttribute('data-state', 'open')
    await expect(region.getByRole('button', { name: 'Aceptar todas' })).toBeVisible()
    await expect(region.getByRole('button', { name: 'Rechazar todas' })).toBeVisible()
    await expect(region.getByRole('button', { name: 'Configurar cookies' })).toBeVisible()
    expect(await stored(page)).toBeNull()

    // Non-modal: Escape keeps its meaning for the surfaces that own it and
    // leaves the question standing.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(400)
    await expect(region).toBeVisible()
  })

  test('accepting stores the choice and it stays gone after a reload', async ({ page }) => {
    await page.goto('/')
    await reachSite(page)
    await page.getByRole('button', { name: 'Aceptar todas' }).click()
    await expect(page.locator('.consent-banner')).toHaveCount(0)
    expect(await stored(page)).toMatchObject({ v: 4, preferences: true, analytics: true })

    await page.reload()
    await reachSite(page)
    await expect(page.locator('.consent-banner')).toHaveCount(0)
  })

  test('refusing is stored the same way', async ({ page }) => {
    await page.goto('/')
    await reachSite(page)
    await page.getByRole('button', { name: 'Rechazar todas' }).click()
    await expect(page.locator('.consent-banner')).toHaveCount(0)
    expect(await stored(page)).toMatchObject({ v: 4, preferences: false, analytics: false })
  })

  test('a record of another version asks again', async ({ page }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, JSON.stringify({ v: 0, analytics: true, at: '2026-01-01T00:00:00.000Z' }))
    }, KEY)
    await page.goto('/')
    await reachSite(page)
    await expect(page.getByRole('region', { name: /cookies/i })).toBeVisible()
  })

  test('the cold blog carries its own copy, and its link opens the policy', async ({ page }) => {
    await page.goto('/blog')
    const region = page.locator('.blog-root .consent-banner')
    await expect(region).toBeVisible()
    await region.getByRole('button', { name: 'Configurar cookies' }).click()
    await expect(page.locator('#blog-legal-title')).toHaveText('Cookies y preferencias')
    // The panel opens OVER the banner: both live inside `.blog-root`, and the
    // banner is the lower layer. The close control must be reachable.
    await page.getByRole('button', { name: 'Cerrar' }).click()
    await expect(page.locator('#blog-legal-title')).toHaveCount(0)
    await expect(region).toBeVisible()
  })

  test('on a phone the sheet keeps 44px targets and never scrolls sideways', async ({ page }) => {
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/blog')
    const region = page.locator('.blog-root .consent-banner')
    await expect(region).toBeVisible()
    for (const name of ['Aceptar todas', 'Rechazar todas', 'Configurar cookies']) {
      const box = await region.getByRole('button', { name }).boundingBox()
      expect(box, name).not.toBeNull()
      expect(box!.height, name).toBeGreaterThanOrEqual(44)
      expect(box!.x + box!.width, name).toBeLessThanOrEqual(393)
    }
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)
  })
})
