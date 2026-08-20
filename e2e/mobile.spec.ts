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

/**
 * Reveal the case panel and wait for it to arrive.
 *
 * The wait is not padding. The sheet enters on a 220ms `translateY` and changes
 * stop on a 320ms `height`, so a geometry read taken in the same tick as the
 * class describes a panel still below the fold — which is how the first version
 * of the scroll test below measured its header at y=884 on a 915px viewport and
 * then compared it against y=548 once the transition had finished.
 *
 * The tests that use this measure LAYOUT, not motion, so they call
 * `asLayoutTest` first: the stylesheet collapses every one of those transitions
 * to 0.01ms under reduced motion, which makes the reads deterministic instead
 * of racing a clock — and exercises that reduced-motion rule while it is at it.
 */
async function showCasePanel(page: Page): Promise<void> {
  await page.locator('.case-panel').evaluate((el) => el.classList.add('is-visible'))
  await settle(page)
}

/** Poll until the panel's top edge stops moving, so a read describes it at rest. */
async function settle(page: Page): Promise<void> {
  const top = () =>
    page.locator('.case-panel').evaluate((el) => Math.round(el.getBoundingClientRect().top))
  let previous = Number.NaN
  await expect
    .poll(async () => {
      const current = await top()
      const stable = current === previous
      previous = current
      return stable
    }, { intervals: [50, 50, 100, 100, 250], timeout: 5_000 })
    .toBe(true)
}

/**
 * For a test about where things sit rather than how they get there.
 *
 * Called before `bootToReady`, because the boot path reads reduced motion once
 * at startup. The stylesheet collapses the sheet's transitions to 0.01ms under
 * it, so geometry reads describe a settled panel instead of racing a clock.
 */
async function asLayoutTest(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' })
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

test('the sheet has two stops and the peek one leaves the satellite visible', async ({
  page,
}) => {
  // The defect this replaces: one fixed 60dvh sheet whose top edge landed at
  // 40% of the screen, while the close-up centres the satellite at 50%. Tapping
  // a satellite hid it behind a panel describing it, and 28-38% of the case sat
  // behind a scroll with no handle and no stop to say so.
  //
  // Driven through the DOM rather than by tapping an orbiting satellite, for
  // the reason the test above gives: reaching a real selection is a timing test,
  // and what is being checked here is layout.
  await asLayoutTest(page)
  await bootToReady(page)

  const panel = page.locator('.case-panel')
  const handle = page.locator('.case-panel__handle')
  await showCasePanel(page)

  const geometry = () =>
    panel.evaluate((el) => {
      const box = el.getBoundingClientRect()
      return {
        stop: el.getAttribute('data-stop'),
        top: box.top,
        height: box.height,
        vh: window.innerHeight,
      }
    })

  // ── Peek ──
  const peek = await geometry()
  expect(peek.stop).toBe('peek')
  expect(peek.height / peek.vh).toBeCloseTo(0.4, 1)

  // THE point of the stop. The satellite is centred vertically, because
  // closeUpScreenOffset returns 0 wherever the panel is a sheet, so the sheet's
  // top edge has to stay below the middle of the screen.
  expect(
    peek.top,
    `sheet top ${peek.top.toFixed(0)} must stay below the vertical centre ${(peek.vh / 2).toFixed(0)}`,
  ).toBeGreaterThan(peek.vh / 2)

  // The handle is a real 44px control, not a decorative grip.
  const handleBox = await handle.boundingBox()
  expect(handleBox?.height).toBeGreaterThanOrEqual(44)

  // ── Expanded ──
  await handle.click()
  await expect(panel).toHaveAttribute('data-stop', 'expanded')
  await settle(page)
  const expanded = await geometry()
  expect(expanded.height / expanded.vh).toBeCloseTo(0.85, 1)
  expect(expanded.height).toBeGreaterThan(peek.height)

  // ── And back ──
  await handle.click()
  await expect(panel).toHaveAttribute('data-stop', 'peek')
  await settle(page)
  expect((await geometry()).height).toBeCloseTo(peek.height, 0)
})

test('a phone in landscape gets the sheet, not the desktop dock', async ({ page }) => {
  // The trigger was `max-width: 767px` alone, and a phone in landscape is
  // 852x393 — wide enough to miss it entirely. The panel fell back to the
  // desktop dock: 324px wide and 820px TALL on a 393px-tall screen, centred
  // with translateY(-50%), `overflow-y: visible`, with roughly half the case
  // off-screen top and bottom and no way to reach it. The query is now
  // `(max-width: 767px), (max-height: 500px)`.
  await asLayoutTest(page)
  await bootToReady(page)
  await page.setViewportSize({ width: 852, height: 393 })

  const panel = page.locator('.case-panel')
  await showCasePanel(page)

  const box = await panel.evaluate((el) => {
    const s = getComputedStyle(el)
    return {
      left: s.left,
      right: s.right,
      width: el.getBoundingClientRect().width,
      height: el.getBoundingClientRect().height,
      viewport: document.documentElement.clientWidth,
      vh: window.innerHeight,
      handle: getComputedStyle(el.querySelector('.case-panel__handle')!).display,
    }
  })

  expect(box.left).toBe('0px')
  expect(box.right).toBe('0px')
  expect(box.width).toBe(box.viewport)
  expect(box.handle).toBe('block')
  // The thing that actually broke: the panel was taller than the screen.
  expect(
    box.height,
    `panel is ${box.height.toFixed(0)}px tall on a ${box.vh}px viewport`,
  ).toBeLessThanOrEqual(box.vh)
})

test('the header stays put while the case scrolls', async ({ page }) => {
  // A sheet whose close button scrolls away cannot be dismissed without
  // scrolling back up first. The handle and header are outside the scrolling
  // body precisely so that cannot happen.
  await asLayoutTest(page)
  await bootToReady(page)

  const panel = page.locator('.case-panel')
  await panel.evaluate((el) => {
    // Enough content to guarantee an overflow at either stop.
    el.querySelector('.case-panel__details')!.innerHTML = Array.from(
      { length: 12 },
      (_, i) => `<li>Línea de detalle número ${i + 1} para forzar el desbordamiento.</li>`,
    ).join('')
  })
  await showCasePanel(page)

  const headerTop = () =>
    page.locator('.case-panel__header').evaluate((el) => el.getBoundingClientRect().top)

  const before = await headerTop()
  const scrolled = await page
    .locator('.case-panel__body')
    .evaluate((el) => {
      el.scrollTop = el.scrollHeight
      return el.scrollTop
    })

  expect(scrolled, 'the body must actually be scrollable for this to prove anything').toBeGreaterThan(0)
  expect(await headerTop()).toBeCloseTo(before, 0)
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

test('the navigation rail is a real touch target and owns its gesture', async ({ page }) => {
  // On touch this is the ONLY way between the two worlds — the marker no longer
  // navigates and the return button is gone (`adr/009`) — which makes it a primary
  // control rather than chrome, and the 44px minimum applies to it directly.
  //
  // The audit that set that rule found six controls below it, and named
  // `.experience-switch` as the one that mattered because it was "the only way out
  // of Murcia". This is that control's replacement, so it inherits the assertion.
  await page.goto('/')
  await page.waitForFunction(() => window.__vertigoIntro !== undefined, undefined, {
    timeout: 30_000,
  })

  const rail = page.locator('.nav-rail')
  await expect(rail).toBeVisible()

  const box = await rail.boundingBox()
  expect(box?.width).toBeGreaterThanOrEqual(44)
  expect(box?.height).toBeGreaterThanOrEqual(44)

  // It must sit inside the viewport, not hang off the edge it is docked to.
  const viewport = page.viewportSize()!
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)

  // `touch-action: none` is what stops the browser claiming the vertical drag as a
  // scroll. The canvas sets its own; this element is a SIBLING and inherits nothing.
  const touchAction = await rail.evaluate((el) => getComputedStyle(el).touchAction)
  expect(touchAction).toBe('none')
})
