import { test, expect, type Page } from '@playwright/test'

/**
 * The paths a visitor takes when the machine will not run the experience.
 *
 * These are the ones reasoning is worst at: PROJECT_MEMORY records that the
 * production failure classes "need vite preview plus request blocking, not
 * reasoning", and that a fallback which exists only in a comment is worse than
 * none at all.
 */

async function bootState(page: Page): Promise<string> {
  return page.evaluate(() => window.__vertigoIntro?.boot.readiness() ?? 'absent')
}

test('no WebGL 2: says so, and never evaluates the scene chunk', async ({ browser }) => {
  // isWebGLAvailable probes for `webgl2` specifically, because three 0.174's
  // renderer requires it — probing for `webgl` would report support the
  // renderer cannot use. Refusing the context is how that branch is reached.
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function patched(
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      if (type === 'webgl2' || type === 'webgl') return null
      return original.apply(this, [type, ...rest] as never)
    } as typeof original
  })

  const requested: string[] = []
  page.on('request', (r) => requested.push(r.url()))

  await page.goto('/')

  await expect.poll(() => bootState(page), { timeout: 45_000 }).toBe('fatal')

  const reason = await page.evaluate(() => window.__vertigoIntro?.boot.fatalReason() ?? '')
  expect(reason).toContain('WebGL')

  // What the early check actually saves is EVALUATION, not download — and that
  // is worth stating precisely, because LazyScene's comment claims the second:
  // "on a device with no WebGL there is nothing to download. Without this the
  // visitor waits for 1.2MB of three.js". They do wait for it. `introEntry()`
  // in vite.config.ts injects `<link rel="modulepreload">` for every non-entry
  // chunk, so three.js and SceneCanvas are fetched at first parse regardless of
  // what LazyScene later decides. Measured here: both arrive.
  //
  // The saving is still real and still the expensive half — modulepreload
  // fetches and compiles without EVALUATING, so 800 KB of three.js never runs
  // on the main thread and no Canvas is ever mounted. That is what is asserted.
  const three = requested.filter((url) => /three|SceneCanvas/i.test(url))
  expect(three.length, 'modulepreload means these are expected to be fetched').toBeGreaterThan(0)

  // No R3F canvas was ever mounted. The probe canvas isWebGLAvailable creates is
  // detached and thrown away, so nothing should be in the document.
  await expect(page.locator('canvas')).toHaveCount(0)

  await context.close()
})

test('a blocked required asset is fatal, not a silent wait', async ({ browser }) => {
  // Confirmed behaviour per PROJECT_MEMORY: a required asset gives `fatal` and
  // the Spanish caption. The caption is the visitor-facing half and is the part
  // that would be easy to lose without noticing.
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.route('**/earth/*.jpg', (route) => route.abort())
  await page.route('**/earth/*.webp', (route) => route.abort())
  await page.goto('/')

  await expect.poll(() => bootState(page), { timeout: 60_000 }).toBe('fatal')
  await expect(page.locator('text=No se pudo cargar la experiencia')).toBeVisible({
    timeout: 15_000,
  })

  await context.close()
})

test('a blocked OPTIONAL asset still reaches ready', async ({ browser }) => {
  // murcia:model is the 456 KB file that once trapped every visitor. It is
  // prefetched during the intro and must never be able to hold it back — that
  // is exactly what `required: false` buys, and it is asserted end to end
  // rather than only against the state machine.
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.route('**/models/*.glb', (route) => route.abort())
  await page.goto('/')

  await expect.poll(() => bootState(page), { timeout: 75_000 }).toBe('ready')
  const progress = await page.evaluate(() => window.__vertigoIntro?.boot.progress() ?? 0)
  expect(progress).toBeGreaterThan(0.5)

  await context.close()
})

test('prefers-reduced-motion still reaches a ready scene', async ({ browser }) => {
  // Reduced motion changes how things move, never whether they arrive. The
  // flash and the cut still play, because concealing a substitution is not a
  // motion effect (warpTransition.prefersReducedMotion is read once by the
  // caller, and the envelope itself is untouched).
  const context = await browser.newContext({ reducedMotion: 'reduce' })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('/')
  await expect.poll(() => bootState(page), { timeout: 75_000 }).toBe('ready')
  await expect(page.locator('canvas').first()).toBeVisible()
  expect(errors).toEqual([])

  await context.close()
})
