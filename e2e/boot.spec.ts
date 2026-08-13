import { test, expect, type ConsoleMessage, type Page } from '@playwright/test'

/**
 * Does the thing boot, and does it boot cleanly.
 *
 * These assert what the numeric harnesses structurally cannot: that the modules
 * they prove correct in isolation actually compose into a page that reaches its
 * end state in a real browser, on a real build, without throwing on the way.
 */

/** Everything the page said, so a failure names the message rather than a count. */
function collect(page: Page) {
  const errors: string[] = []
  const rejections: string[] = []
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => rejections.push(error.message))
  return { errors, rejections }
}

/** Boot state, read from the handle the intro chunk publishes on window. */
async function readiness(page: Page): Promise<string> {
  return page.evaluate(() => window.__vertigoIntro?.boot.readiness() ?? 'absent')
}

test('boots to a ready scene with a visible canvas', async ({ page }) => {
  const log = collect(page)
  await page.goto('/')

  // The boot state is the honest signal, not a timer: readiness means every
  // REQUIRED resource completed, which is the contract bootState exists for.
  await expect
    .poll(() => readiness(page), { timeout: 75_000 })
    .toBe('ready')

  const canvas = page.locator('canvas')
  await expect(canvas.first()).toBeVisible()

  // Exactly one WebGL canvas — DECISIONS section 2, and the property that was
  // measured across three round trips rather than assumed. Two would mean a
  // second renderer had appeared.
  await expect(canvas).toHaveCount(1)

  const size = await canvas.first().boundingBox()
  expect(size?.width ?? 0).toBeGreaterThan(0)
  expect(size?.height ?? 0).toBeGreaterThan(0)

  expect(log.errors, `console errors: ${log.errors.join(' | ')}`).toEqual([])
  expect(log.rejections, `unhandled rejections: ${log.rejections.join(' | ')}`).toEqual([])
})

test('reaches the site phase and finishes the intro', async ({ page }) => {
  await page.goto('/')

  // `completed` resolves the first time the fill finishes. Awaiting the promise
  // the app itself exposes beats polling for a visual cue.
  await page.waitForFunction(
    () => window.__vertigoIntro !== undefined,
    undefined,
    { timeout: 30_000 },
  )
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        void window.__vertigoIntro!.completed.then(() => resolve())
      }),
  )

  // The drawing hands over rather than sitting on top of the scene forever.
  // It sits at z-index 20, above the canvas, so a drawing that never leaves is
  // a blank-looking site rather than an error.
  await expect(page.locator('svg.intro-svg')).toBeHidden({ timeout: 30_000 })
})

test('never reports ready before it is', async ({ page }) => {
  // The trap bootState exists for: with no measured progress the autonomous
  // curve still carries the drawing to the pre-ready limit, so the drawing can
  // look nearly finished while nothing has downloaded. Anything shown to a
  // visitor must read measured progress and readiness, never the playhead.
  await page.goto('/')
  await page.waitForFunction(() => window.__vertigoIntro !== undefined, undefined, {
    timeout: 30_000,
  })

  const lied = await page.evaluate(async () => {
    const intro = window.__vertigoIntro!
    // Sample across the intro: readiness must never be 'ready' while a required
    // resource is still pending.
    for (let i = 0; i < 60; i += 1) {
      const ready = intro.boot.readiness() === 'ready'
      const pending = intro.boot.pending()
      const requiredPending = pending.filter(
        (id) => id !== 'satellite:assets' && id !== 'murcia:model',
      )
      if (ready && requiredPending.length > 0) return { ready, requiredPending }
      await new Promise((r) => setTimeout(r, 250))
    }
    return null
  })

  expect(lied, `claimed ready while still pending: ${JSON.stringify(lied)}`).toBeNull()
})
