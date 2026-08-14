import { test, expect, type ConsoleMessage, type Page } from '@playwright/test'

/**
 * The mobile surface, on a real device profile.  `npm run e2e`
 *
 * Runs under the `mobile-android` and `mobile-ios-shaped` projects only — see
 * playwright.config.ts, including the part about both of them being Chromium
 * and therefore proving nothing about Safari.
 *
 * The device profile is not a detail. A context with `hasTouch: true` alone
 * still reports `hover: hover`, so every `(hover: none)` and `(pointer: coarse)`
 * rule stays inert and a touch fix looks verified when it is not
 * (PROJECT_MEMORY, "Things that will bite you again"). Most of what this file
 * covers now lives behind exactly those queries.
 */

function collect(page: Page) {
  const errors: string[] = []
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

async function bootToReady(page: Page): Promise<void> {
  await page.goto('/')
  await expect
    .poll(() => page.evaluate(() => window.__vertigoIntro?.boot.readiness() ?? 'absent'), {
      timeout: 75_000,
    })
    .toBe('ready')
}

test('boots on a phone, fills the viewport, and never scrolls sideways', async ({ page }) => {
  const errors = collect(page)
  await bootToReady(page)

  const canvas = page.locator('canvas')
  await expect(canvas).toHaveCount(1)

  // Horizontal overflow is the classic narrow-viewport failure, and it is
  // invisible here without asserting it: the page is `overflow: hidden`, so an
  // element escaping the viewport is silently clipped rather than producing a
  // scrollbar anyone would notice.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)

  expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([])
})

test('the case panel is a bottom sheet, not a 142px column', async ({ page }) => {
  await bootToReady(page)

  // Asserted on the element rather than on a selection, because the panel is
  // always mounted and toggled by class — and reaching a real selection means
  // tapping an orbiting satellite, which is a timing test rather than a layout
  // one. What is being checked here is that the media query applies at all.
  const box = await page.locator('.case-panel').evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      left: s.left,
      right: s.right,
      width: el.getBoundingClientRect().width,
      radius: s.borderTopLeftRadius + ' ' + s.borderBottomLeftRadius,
      viewport: document.documentElement.clientWidth,
    }
  })

  // Full-bleed: the defect was `right: 20vw; width: min(420px, 38vw)`, which at
  // 393px left ~70px of usable content inside the padding.
  expect(box.left).toBe('0px')
  expect(box.right).toBe('0px')
  expect(box.width).toBe(box.viewport)
  // Rounded at the top, square at the bottom — the shape that reads as a sheet
  // rising from the edge rather than a floating card.
  expect(box.radius).toBe('14px 0px')
})

test('a lost WebGL context says so instead of going quietly blank', async ({ page }) => {
  // The failure this guards is silence. Before 2026-08-14 nothing listened for
  // `webglcontextlost`: three stops rendering, React never re-renders, the
  // error boundary cannot see a DOM event, and the visitor is left with a black
  // rectangle and no explanation. On iOS that is what memory pressure looks
  // like from inside the page, so it is the expected end of a long session
  // rather than a driver curiosity.
  await bootToReady(page)

  await expect(page.locator('.context-lost')).toHaveCount(0)

  // WEBGL_lose_context is how the platform lets a page reproduce it. The event
  // is the real one — same type, same target, same default-prevented
  // semantics — which is what makes this a test of the handler rather than of a
  // synthetic dispatch.
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas')!
    const gl = canvas.getContext('webgl2')!
    gl.getExtension('WEBGL_lose_context')!.loseContext()
  })

  const notice = page.locator('.context-lost')
  await expect(notice).toBeVisible({ timeout: 10_000 })
  // Spanish, like every other visitor-facing string (DECISIONS section 11).
  await expect(notice).toContainText('Se ha interrumpido la experiencia')
  // And it offers the one action that actually works. There is no recovery
  // path — see graphics/contextLoss.ts for why restoration is its own project
  // — so a reload is not a cop-out, it is the honest remedy.
  await expect(notice.getByRole('button', { name: 'Recargar' })).toBeVisible()
})

test('the loading caption wraps instead of being clipped', async ({ page }) => {
  // The two longest captions are the slow-network and hard-failure strings —
  // the states a phone on cellular is most likely to reach, and the ones that
  // were being cut off at both edges by `white-space: nowrap` under
  // `body { overflow: hidden }`.
  await page.goto('/')
  await page.waitForFunction(() => window.__vertigoIntro !== undefined, undefined, {
    timeout: 30_000,
  })

  const fits = await page.evaluate(() => {
    const caption = document.querySelector('.intro-caption') as HTMLElement | null
    if (!caption) return null
    // Force the longest string rather than waiting for a slow network to
    // produce it: this is a layout assertion, not a timing one.
    caption.textContent = 'Esto está tardando más de lo habitual'
    const rect = caption.getBoundingClientRect()
    return { left: rect.left, right: rect.right, viewport: document.documentElement.clientWidth }
  })

  expect(fits).not.toBeNull()
  expect(fits!.left).toBeGreaterThanOrEqual(0)
  expect(fits!.right).toBeLessThanOrEqual(fits!.viewport)
})
