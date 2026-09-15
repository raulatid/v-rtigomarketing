import { test, expect, type Page } from '@playwright/test'

async function motionReads(page: Page) {
  return page.evaluate(() => (window as unknown as { motionReads: boolean[] }).motionReads)
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.addInitScript(() => {
    const reads: boolean[] = []
    ;(window as unknown as { motionReads: boolean[] }).motionReads = reads
    const matchMedia = window.matchMedia.bind(window)
    window.matchMedia = (query) => {
      const result = matchMedia(query)
      if (query === '(prefers-reduced-motion: reduce)') reads.push(result.matches)
      return result
    }
  })
})

test('boot snapshot survives a preference change, late panels and the city round trip', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.audit-trigger')).toBeVisible({ timeout: 75_000 })
  expect(await page.evaluate(() => window.__vertigoIntro?.reducedMotion)).toBe(true)
  expect(await motionReads(page)).toEqual([true])

  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.locator('.audit-trigger').click()
  await expect(page.locator('.audit-panel')).toBeVisible()
  await page.locator('.audit-close').click()
  await expect(page.locator('.audit-panel')).toBeHidden()

  const control = page.locator('.nav-control')
  await control.focus()
  await page.keyboard.press('Enter')
  await expect(control).toHaveAttribute('aria-label', 'Volver a la Tierra')
  await expect(page.locator('.nav')).toHaveAttribute('data-state', 'idle')
  await control.focus()
  await page.keyboard.press('Enter')
  await expect(control).toHaveAttribute('aria-label', 'Ir a Murcia')
  expect(await motionReads(page)).toEqual([true])
})

test('a cold blog and its deferred logo share a snapshot until reload', async ({ page }) => {
  await page.goto('/blog')
  await expect(page.locator('.blog-topbar__stage')).toHaveAttribute('data-gl', 'ready')
  expect(await page.evaluate(() => window.__vertigoIntro)).toBeUndefined()
  expect(await motionReads(page)).toEqual([true])
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.locator('.audit-trigger').click()
  await expect(page.locator('.audit-panel')).toBeVisible()
  expect(await motionReads(page)).toEqual([true])

  await page.reload()
  await expect(page.locator('.blog-topbar__stage')).toHaveAttribute('data-gl', 'ready')
  expect(await motionReads(page)).toEqual([false])
})
