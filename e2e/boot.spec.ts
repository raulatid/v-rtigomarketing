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

test('gives the drawing its full duration', async ({ page }) => {
  // The unit suite proves the pace against a simulated clock. This proves it
  // against a real one, which is where the bug actually lived: the playhead
  // used to spend its minimum duration in units of clamped frame time, so every
  // dropped frame stretched the intro, and the intro is exactly when frames
  // drop — three.js evaluating, 2.43MB of JPEG decoding and the GPU warmup all
  // land inside it. A build measured here ran the whole thing at 7fps and took
  // 10.0s. No unit test could have caught that; this is the one that does.
  await page.goto('/')
  await page.waitForFunction(() => window.__vertigoIntro !== undefined, undefined, {
    timeout: 30_000,
  })
  await page.evaluate(
    () => new Promise<void>((resolve) => void window.__vertigoIntro!.completed.then(() => resolve())),
  )

  const span = await page.evaluate(() => {
    const at = (name: string) => performance.getEntriesByName(name, 'mark')[0]?.startTime ?? NaN
    return {
      drawing: (at('vertigo:intro-complete') - at('vertigo:intro-visible')) / 1000,
      // How long the load itself took. The floor applies to a drawing that had
      // nothing to wait for; past that the drawing paces the real load and is
      // legitimately longer, so the upper bound has to be stated against this.
      readiness: (at('vertigo:scene-ready') - at('vertigo:intro-visible')) / 1000,
    }
  })

  // The floor: never a flash, however warm the cache.
  expect(span.drawing, `drawing lasted ${span.drawing.toFixed(2)}s`).toBeGreaterThan(2.9)

  // The ceiling: whatever it waited for, the ending is its own gesture and the
  // drawing does not run indefinitely past the load it was reporting.
  const ceiling = Math.max(3.0, span.readiness) + 1.5
  expect(
    span.drawing,
    `drawing lasted ${span.drawing.toFixed(2)}s against readiness at ${span.readiness.toFixed(2)}s`,
  ).toBeLessThan(ceiling)
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

test('never paints a light frame during boot', async ({ page, context }) => {
  // The regression this exists for: Murcia's GPU warm-up rendered its city with
  // `scene.background` set, three's WebGLBackground pushed that colour into the
  // SHARED renderer's clear colour and left it there, and Earth's next clear
  // painted the whole viewport pale blue for one frame. Users reported it as
  // the screen flashing white. Nothing structural catches it: the DOM is
  // correct, CLS is 0, and the frame is gone in 16 ms — only the pixels show it.
  //
  // A RELOAD rather than a first navigation, deliberately. Before a page's first
  // paint the browser still shows the PREVIOUS document, and in a fresh context
  // that is about:blank — a white frame that belongs to the blank tab and not to
  // this site. Reloading makes the previous document this same dark page, so any
  // light frame that appears is genuinely ours.
  await page.goto('/')
  await page.waitForFunction(() => window.__vertigoIntro !== undefined, undefined, {
    timeout: 30_000,
  })
  await page.evaluate(
    () => new Promise<void>((resolve) => void window.__vertigoIntro!.completed.then(() => resolve())),
  )

  const client = await context.newCDPSession(page)
  const frames: string[] = []
  client.on('Page.screencastFrame', (frame: { data: string; sessionId: number }) => {
    void client.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {})
    frames.push(frame.data)
  })
  await client.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1 })

  await page.reload()
  await page.waitForFunction(() => window.__vertigoIntro !== undefined, undefined, {
    timeout: 30_000,
  })
  await page.evaluate(
    () => new Promise<void>((resolve) => void window.__vertigoIntro!.completed.then(() => resolve())),
  )
  await client.send('Page.stopScreencast')

  expect(frames.length, 'the screencast captured nothing').toBeGreaterThan(10)

  // Decoded in a blank tab rather than in node: `sharp` is deliberately not a
  // dependency (see scripts/prepare-earth-textures.mjs), and this needs no more
  // than an OffscreenCanvas.
  const decoder = await context.newPage()
  const means: number[] = await decoder.evaluate(async (datas: string[]) => {
    const canvas = new OffscreenCanvas(160, 90)
    const g = canvas.getContext('2d', { willReadFrequently: true })!
    const out: number[] = []
    for (const data of datas) {
      const blob = await (await fetch(`data:image/jpeg;base64,${data}`)).blob()
      const bmp = await createImageBitmap(blob)
      g.drawImage(bmp, 0, 0, 160, 90)
      bmp.close()
      const { data: px } = g.getImageData(0, 0, 160, 90)
      let sum = 0
      for (let k = 0; k < px.length; k += 4) {
        sum += 0.2126 * px[k] + 0.7152 * px[k + 1] + 0.0722 * px[k + 2]
      }
      out.push(sum / (px.length / 4))
    }
    return out
  }, frames)
  await decoder.close()

  // #050507 is luma 5.5 and the drawing's white isotype on black lifts the mean
  // only into the low twenties; the regression measured 190. 60 sits far above
  // anything this design draws and far below the failure, so it needs no tuning
  // when the composition changes.
  const brightest = Math.max(...means)
  expect(
    brightest,
    `brightest boot frame had mean luminance ${brightest.toFixed(1)} across ${means.length} frames`,
  ).toBeLessThan(60)
})

/** Resolves when the loading draw hands over to the tail (plan 025). */
async function drawDone(page: Page) {
  await page.waitForFunction(() => window.__vertigoIntro !== undefined, undefined, {
    timeout: 30_000,
  })
  await page.evaluate(
    () => new Promise<void>((resolve) => void window.__vertigoIntro!.completed.then(() => resolve())),
  )
}

/**
 * Resolves once the master timeline's first tail phase (`shrink`) has
 * actually committed, closing the tick `drawDone` leaves open: `completed`
 * resolves a beat before `useMasterTimeline` runs, and until it runs a press
 * is still refused as `draw` (plan 025).
 *
 * The same synchronous effect that flips `phase` to `shrink` also writes
 * `--intro-scale` inline on the drawing (`useMasterTimeline.ts`, `setScale`
 * in `intro-draw/introDraw.ts`) — unset before it, `'1'` from the instant it
 * runs. Polling for that write is polling for the effect itself.
 */
async function tailStarted(page: Page) {
  await page.waitForFunction(
    () => {
      const svg = document.querySelector('svg.intro-svg') as SVGElement | null
      return svg !== null && svg.style.getPropertyValue('--intro-scale') !== ''
    },
    undefined,
    { timeout: 5_000 },
  )
}

test('a press during the tail lands on the globe', async ({ page }) => {
  await page.goto('/')
  await drawDone(page)
  // `completed` resolves before the timeline's first tail phase is committed
  // to React (a layout effect a tick later), so a press in that tick is still
  // `draw` and is refused by design. Wait for that commit itself.
  await tailStarted(page)
  // The tail is ~9.7 s; landing within 3 s of a press can only be the skip.
  await page.mouse.click(800, 450)
  await expect(page.locator('.audit-trigger')).toBeAttached({ timeout: 3_000 })
})

test('a press during loading does nothing', async ({ page }) => {
  // Hold a required resource back so the press lands while the draw is still
  // the loading cover.
  await page.route('**/earth/day*.ktx2', async (route) => {
    await new Promise((r) => setTimeout(r, 4_000))
    await route.continue()
  })
  await page.goto('/')
  await page.waitForFunction(() => window.__vertigoIntro !== undefined, undefined, {
    timeout: 30_000,
  })
  expect(await readiness(page)).not.toBe('ready')
  await page.mouse.click(800, 450)
  // Still loading: the draw stays up and nothing has landed.
  await expect(page.locator('svg.intro-svg')).toBeVisible()
  await expect(page.locator('.audit-trigger')).not.toBeAttached()
  // And the intro still completes on its own afterwards.
  await drawDone(page)
})

test('the first landing is remembered, with consent', async ({ page }) => {
  // The shared storageState seeds a REFUSED consent; the record is written only
  // on an accepted one (DECISIONS §51), so this visitor has said yes.
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'vertigo:consent',
      JSON.stringify({ v: 3, preferences: true, analytics: true, at: '2026-01-01T00:00:00.000Z' }),
    )
  })
  await page.goto('/')
  await drawDone(page)
  // Same tick hazard as above: the Escape skip's handleSeek no-ops while the
  // timeline ref is not yet set.
  await tailStarted(page)
  await page.keyboard.press('Escape')
  await expect(page.locator('.audit-trigger')).toBeAttached({ timeout: 3_000 })
  const record = await page.evaluate(() => window.localStorage.getItem('vertigo:intro'))
  expect(record).toBe(JSON.stringify({ v: 1, seen: true }))
})

test('a refused consent stores nothing', async ({ page }) => {
  // The shared storageState seeds a refused consent (`analytics: false`): the
  // landing must leave no `vertigo:intro` behind (DECISIONS §51).
  await page.goto('/')
  await drawDone(page)
  await tailStarted(page)
  await page.keyboard.press('Escape')
  await expect(page.locator('.audit-trigger')).toBeAttached({ timeout: 3_000 })
  const record = await page.evaluate(() => window.localStorage.getItem('vertigo:intro'))
  expect(record).toBeNull()
})

test('a returning visitor never sees the loading draw, and enters at the crossover', async ({ page }) => {
  await page.addInitScript(() => {
    // Remembering the intro requires preferences consent; the shared fixture
    // refuses it, so a stored record alone must not enable the returning path.
    window.localStorage.setItem('vertigo:consent', JSON.stringify({
      v: 3, preferences: true, analytics: false, at: '2026-01-01T00:00:00.000Z',
    }))
    window.localStorage.setItem('vertigo:intro', JSON.stringify({ v: 1, seen: true }))

    // Watches from before the first paint, every frame, for the 2D mark being on
    // screen at all. Sampling from the test would start too late to be evidence.
    const flags = window as unknown as { __markWasSeen?: boolean }
    flags.__markWasSeen = false
    const watch = () => {
      const svg = document.querySelector('svg.intro-svg')
      if (svg && getComputedStyle(svg).visibility !== 'hidden') flags.__markWasSeen = true
      requestAnimationFrame(watch)
    }
    requestAnimationFrame(watch)
  })
  await page.goto('/')
  await drawDone(page)
  // The wait was unseen and had no floor: this load is served from the preview
  // server on the same machine, far inside the grace after which a slow load
  // shows the drawing after all (`DRAW_TIMING.quietGrace`).
  // No press. It enters where the mark becomes 3D and the landing plays
  // (DECISIONS §51). So the site is NOT there at once — no control may mount
  // before `site` (§26.16) — and it IS there well inside the full tail's 9.7 s,
  // because the drawing, the shrink and the warp never ran.
  await tailStarted(page)
  await page.waitForTimeout(1_500)
  await expect(page.locator('.audit-trigger')).not.toBeAttached()
  await expect(page.locator('.audit-trigger')).toBeAttached({ timeout: 6_000 })
  const seen = await page.evaluate(
    () => (window as unknown as { __markWasSeen?: boolean }).__markWasSeen,
  )
  expect(seen, 'the 2D loading mark was on screen for a returning visitor').toBe(false)
})
