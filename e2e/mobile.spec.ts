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

/**
 * Waits for the intro to hand over, which is NOT the same as booting.
 *
 * `bootToReady` waits for the loader to finish; the intro then plays for about
 * nine seconds more, and navigation is refused for all of it (the intro owns the
 * camera until phase 'site'). A navigation test that skipped this would find the
 * gesture inert — and worse, a test asserting a gesture does NOTHING would pass
 * for the wrong reason. The audit trigger only exists at 'site'.
 */
async function reachSite(page: Page): Promise<void> {
  // ATTACHED, not visible: on a phone the trigger lives behind the header's
  // burger (2026-09-03) and is `visibility: hidden` until the menu opens. It
  // still mounts only at phase 'site', which is all this gate needs.
  await page.waitForSelector('.audit-trigger', { state: 'attached', timeout: 75_000 })
  await page.waitForTimeout(400)
}

/** True once Murcia is the experience being drawn. Its UI host is the tell. */
async function inMurcia(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const host = document.querySelector('.murcia-ui')
    return host ? getComputedStyle(host).display !== 'none' : false
  })
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

test('the sheet opens expanded, and lowering it uncovers the satellite', async ({
  page,
}) => {
  // Two stops, and which one a case OPENS at is the thing that changed on
  // 2026-09-05 at the client's request: it opened at peek, and reaching the
  // case cost a second deliberate tap on a grip that gave no hint of what it
  // hid. Peek is still here and still does its job — it is now what the handle
  // LOWERS to, rather than the state a case starts in.
  //
  // The original defect both stops exist for: one fixed 60dvh sheet whose top
  // edge landed at 40% of the screen, hiding 28-38% of the case behind a scroll
  // with no handle and no stop to say so.
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

  // ── Opens expanded ──
  const expanded = await geometry()
  expect(expanded.stop).toBe('expanded')
  expect(expanded.height / expanded.vh).toBeCloseTo(0.85, 1)

  // The handle is a real 44px control, not a decorative grip.
  const handleBox = await handle.boundingBox()
  expect(handleBox?.height).toBeGreaterThanOrEqual(44)

  // ── The grip sits on the sheet's centre ──
  // The defect this guards, fixed 2026-09-05: `width: 100%` resolved against the
  // sheet's CONTENT box while `margin: 0 -1.5rem` bled the button out to the
  // left edge, so the control stopped 3rem short of the right one. The grip
  // centres on the BUTTON, so it sat 24px left of the sheet's real centre on
  // every phone, and the tap target lost 48px off its right side.
  //
  // Asserted on the BUTTON rather than on the `::before` pill: the pill's own
  // centring (left: 50% against a negative half-width margin, on both axes) is
  // static CSS that cannot drift. What drifted was the box it centres itself
  // in. Height was asserted here before today; x was not, which is why this
  // shipped.
  const alignment = await panel.evaluate((el) => {
    const sheet = el.getBoundingClientRect()
    const button = el.querySelector('.case-panel__handle')!.getBoundingClientRect()
    return {
      sheetWidth: sheet.width,
      buttonWidth: button.width,
      sheetCentre: sheet.left + sheet.width / 2,
      buttonCentre: button.left + button.width / 2,
    }
  })
  expect(
    alignment.buttonWidth,
    `handle is ${alignment.buttonWidth.toFixed(0)}px against a ${alignment.sheetWidth.toFixed(0)}px sheet`,
  ).toBeCloseTo(alignment.sheetWidth, 0)
  expect(
    alignment.buttonCentre,
    `grip centre ${alignment.buttonCentre.toFixed(1)} against sheet centre ${alignment.sheetCentre.toFixed(1)}`,
  ).toBeCloseTo(alignment.sheetCentre, 0)

  // ── Lowering it uncovers the satellite ──
  await handle.click()
  await expect(panel).toHaveAttribute('data-stop', 'peek')
  await settle(page)
  const peek = await geometry()
  expect(peek.height / peek.vh).toBeCloseTo(0.4, 1)
  expect(peek.height).toBeLessThan(expanded.height)

  // THE point of the stop. The satellite is centred vertically, because
  // closeUpScreenOffset returns 0 wherever the panel is a sheet, so the sheet's
  // top edge has to stay below the middle of the screen.
  expect(
    peek.top,
    `sheet top ${peek.top.toFixed(0)} must stay below the vertical centre ${(peek.vh / 2).toFixed(0)}`,
  ).toBeGreaterThan(peek.vh / 2)

  // ── And back up ──
  await handle.click()
  await expect(panel).toHaveAttribute('data-stop', 'expanded')
  await settle(page)
  expect((await geometry()).height).toBeCloseTo(expanded.height, 0)
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

/**
 * A two-finger gesture, dispatched from inside the page.
 *
 * Real touch events with controlled timing, paced by `setTimeout` for the same
 * reason `wheelStream` is: Playwright's own touch dispatch is a CDP round trip,
 * and on a main thread this starved by a software renderer those land seconds
 * apart. `event.timeStamp` is generation time, so a real finger produces true
 * timings however late the handler runs.
 *
 * It proves the LOGIC and nothing else. Both mobile projects are Chromium
 * (playwright.config.ts says so at length), so this says nothing about Safari,
 * and no synthetic gesture can say anything about feel.
 */
async function pinch(
  page: Page,
  opts: { from: number; to: number; shiftX?: number; steps?: number; lift?: boolean },
) {
  const { from, to, shiftX = 0, steps = 20, lift = true } = opts
  await page.evaluate(
    ([f, t, shift, n, doLift]) =>
      new Promise<void>((resolve) => {
        const canvas = document.querySelector('canvas')!
        const cx = window.innerWidth / 2
        const cy = window.innerHeight / 2
        const fire = (type: string, id: number, x: number) =>
          canvas.dispatchEvent(
            new PointerEvent(type, {
              pointerId: id,
              pointerType: 'touch',
              button: 0,
              buttons: 1,
              clientX: x,
              clientY: cy,
              bubbles: true,
              cancelable: true,
            }),
          )
        fire('pointerdown', 1, cx - (f as number) / 2)
        fire('pointerdown', 2, cx + (f as number) / 2)
        let i = 0
        const step = () => {
          i += 1
          const d = (f as number) + (((t as number) - (f as number)) * i) / (n as number)
          const off = ((shift as number) * i) / (n as number)
          fire('pointermove', 1, cx - d / 2 + off)
          fire('pointermove', 2, cx + d / 2 + off)
          if (i < (n as number)) {
            setTimeout(step, 16)
            return
          }
          if (doLift) {
            fire('pointerup', 1, cx - d / 2 + off)
            fire('pointerup', 2, cx + d / 2 + off)
          }
          setTimeout(resolve, 80)
        }
        setTimeout(step, 16)
      }),
    [from, to, shiftX, steps, lift] as const,
  )
}

/**
 * How far the fingers must separate to commit, on this viewport.
 *
 * ONE full journey, which since `adr/014` is two stages: the first two thirds of
 * this cross the zoom band and the last third pushes against its limit. The
 * fraction is unchanged by that split on purpose — `pinchGain` is scaled against
 * the TOTAL, so what a full opening of the hand is worth stayed the same and every
 * number here kept its meaning.
 */
function commitGrowth(page: Page) {
  const v = page.viewportSize()!
  // Mirrors `pinchGain`: the shorter side is what constrains how far two fingers
  // can travel apart, whichever way the phone is held.
  return Math.min(v.width, v.height) * 0.28
}

test('two separate spreads enter Murcia, and two closes come back', async ({ page }) => {
  // On touch this is the ONLY way between the two worlds — the rail is gone
  // (`adr/012`), the marker no longer navigates and the return button went with
  // `adr/009`. Everything below is therefore a primary control, not chrome.
  //
  // Longer than the file default because the journey got longer, not slower:
  // `adr/015` made leaving the city a second close, so this drives FOUR in-page
  // gestures across a boot and a cinematic. Each one is paced at 16ms per step
  // through a main thread running on a software renderer, where a single pinch
  // has been measured at 10-35s.
  test.setTimeout(240_000)
  await bootToReady(page)
  await reachSite(page)
  const growth = commitGrowth(page)

  // Partial zoom persists after release, without committing.
  await pinch(page, { from: 60, to: 60 + growth * 0.45 })
  await page.waitForTimeout(1800)
  expect(await inMurcia(page)).toBe(false)

  // The next spread fills the remaining band; a fresh spread then commits.
  await pinch(page, { from: 60, to: 60 + growth * 1.05 })
  expect(await inMurcia(page)).toBe(false)
  await pinch(page, { from: 60, to: 60 + growth * 1.05 })
  await expect.poll(() => inMurcia(page), { timeout: 10_000 }).toBe(true)

  // Closing is the way out, because leaving is an ascent (ADR 006) — but since
  // `adr/015` it takes TWO closes, and this is where that is proved end to end.
  //
  // The wait is not politeness. The navigation machine is `locked` for the
  // remainder of the cinematic and then in `cooldown`, and a gesture fired
  // inside that window is refused by design; this test used to fire the return
  // the instant `.murcia-ui` appeared and raced it, which is the whole of the
  // nondeterminism recorded in `docs/plans/011-phone-menu-glass-field.md`. With
  // two closes it is not merely flaky but wrong — a refused first close parks
  // nothing, so the second one would be the first.
  await expect
    .poll(() => page.locator('.nav').getAttribute('data-state'), { timeout: 15_000 })
    .toBe('idle')

  const wide = growth * 1.1 + 40
  // One. Parks the zoom against the far end of the band and stops there.
  await pinch(page, { from: wide, to: wide - growth * 1.05 })
  await page.waitForTimeout(600)
  expect(await inMurcia(page)).toBe(true)

  // Two. Begins already parked, because the zoom is persistent, so everything
  // this one has goes into the push.
  //
  // A full close rather than the 0.6 that is arithmetically sufficient, because
  // what this test is for is the SHAPE — two closes leave, one does not — and a
  // fixture cut to the minimum would start failing for arithmetic reasons the
  // moment the 600/300 split moved. It is also what a hand does.
  //
  // This is the assertion that caught the entry gesture's tail: with the city
  // being entered at depth -1 rather than at rest, the first close was spent
  // crossing the band and the second still had nothing to push with.
  await pinch(page, { from: wide, to: wide - growth * 1.05 })
  await expect.poll(() => inMurcia(page), { timeout: 15_000 }).toBe(false)
})

test('ordinary two-finger use is left alone', async ({ page }) => {
  await bootToReady(page)
  await reachSite(page)
  const growth = commitGrowth(page)

  // Two fingers carried sideways together used to be Murcia's rotate, and this
  // test existed because the two gestures competed for the same fingers. They no
  // longer do — two-finger rotation is gone (DECISIONS §44) and a pair means only
  // a pinch — so what is left to prove is simpler and still worth proving: a
  // carried pair changes no SEPARATION, so it feeds the band nothing and cannot
  // travel between worlds however far it is dragged.
  await pinch(page, { from: 200, to: 200, shiftX: growth, steps: 16 })
  await page.waitForTimeout(600)
  expect(await inMurcia(page)).toBe(false)

  // Closing on Earth is the wrong way out. It is not nothing — `adr/014` made it
  // the other half of the zoom, and the pair drives the band from its first
  // sample so the globe recedes under the fingers — but that end of the band is a
  // dead stop that returns no overflow, so it cannot navigate however far it goes.
  await pinch(page, { from: 40 + growth, to: 40, steps: 22 })
  await page.waitForTimeout(600)
  expect(await inMurcia(page)).toBe(false)
})

test('the accessible control is reachable and names its destination', async ({ page }) => {
  // A pinch is not a universal input. This is the path for everyone it excludes,
  // and the reason removing the rail did not remove anyone's route to Murcia.
  await bootToReady(page)
  await reachSite(page)

  const control = page.locator('.nav-control')
  await expect(control).toHaveAttribute('aria-label', 'Ir a Murcia')

  // Clipped rather than hidden: a transparent 44px box over the canvas would
  // swallow taps meant for the world, but display:none would not be focusable.
  await control.focus()
  await expect(control).toBeFocused()

  // Visible once focused, so a sighted keyboard user can see what they landed on.
  const box = await control.boundingBox()
  expect(box!.height).toBeGreaterThanOrEqual(44)
})

/**
 * The phone menu. On the SCENE the viewport itself hinges away and slides down,
 * and the menu is the layer it uncovers behind itself (plan 023); on the BLOG
 * it is still the plan-011 glass field, because there is no scene canvas there
 * to move.
 *
 * The motion is CSS and is judged by eye. What these prove is the contract —
 * what opens it, what closes it, that the canvas underneath is neither
 * remounted nor resized by it, and that the doors sit in the band the card
 * leaves free.
 */

async function openMenu(page: Page): Promise<void> {
  await page.locator('.site-header__burger').click()
  // React writes the boolean as the string "true".
  await expect(page.locator('.site-header')).toHaveAttribute('data-menu-open', 'true')
  await expect(page.locator('.site-header')).toHaveAttribute('data-menu-state', 'open')
}

async function expectFolded(page: Page): Promise<void> {
  // "Not open" is only true once the card is back: the header stays open for
  // the whole of its way home.
  await expect(page.locator('.site-header')).not.toHaveAttribute('data-menu-open', 'true')
}

/** Sub-pixel rounding at DPR 3 is not a layout bug. */
function expectNear(actual: number, expected: number, what: string) {
  expect(Math.abs(actual - expected), `${what}: ${actual} vs ${expected}`).toBeLessThan(1)
}

/**
 * The drawing buffer's size and the canvas element's identity — what a resize
 * or a remount would change, and the menu must change neither.
 *
 * Identity by a probe attribute, the blog.spec.ts idiom: the first call stamps
 * the element, later calls read the stamp back, and a remounted canvas is a
 * new node with no stamp. Not the renderer's resource counts — Murcia keeps
 * loading after the handover, so those drift with time whatever the menu does.
 */
async function canvasState(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('.scene-canvas canvas')!
    if (!canvas.hasAttribute('data-e2e-probe')) canvas.setAttribute('data-e2e-probe', 'canvas')
    return {
      width: canvas.width,
      height: canvas.height,
      probe: canvas.getAttribute('data-e2e-probe'),
    }
  })
}

test('the burger hinges the scene away, and Auditoría opens from the layer behind it', async ({
  page,
}) => {
  const errors = collect(page)
  await bootToReady(page)
  await reachSite(page)

  // Folded: mounted (reachSite waited on that) but not shown, and the scene is
  // perfectly fullscreen and flat — no transform at all, not an identity one.
  const audit = page.locator('.audit-trigger')
  await expect(audit).toBeHidden()
  const viewport = page.locator('.app__viewport')
  await expect(viewport).toHaveCSS('transform', 'none')
  const closed = await page.evaluate(() => {
    const canvas = document.querySelector('.scene-canvas')!.getBoundingClientRect()
    return {
      canvas,
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    }
  })
  expectNear(closed.canvas.left, 0, 'canvas left')
  expectNear(closed.canvas.top, 0, 'canvas top')
  expectNear(closed.canvas.width, closed.width, 'canvas width')
  expectNear(closed.canvas.height, closed.height, 'canvas height')
  const before = await canvasState(page)

  await openMenu(page)
  // The card is a 3D transform, and the layer behind it is live.
  await expect(viewport).toHaveCSS('transform', /^matrix3d\(/)
  await expect(page.locator('.contact-trigger')).toBeVisible()
  await expect(audit).toBeVisible()

  // A card that overflows the viewport must not widen the document: a
  // transform is not layout, and this is the assertion that says so.
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth)

  // NOTHING RESIZED, NOTHING REBUILT. R3F measures the canvas container; a
  // client rect includes the card's transform, and a resize event while the
  // menu is up is exactly when the default measurement would re-read it
  // (SceneCanvas.tsx on `offsetSize`). So provoke one, and check the drawing
  // buffer and the renderer's resource counts are what they were.
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  await page.waitForTimeout(300)
  const during = await canvasState(page)
  expect(during).toEqual(before)

  // Choosing a door folds the menu and opens the door in the same tick: the
  // card returns to fullscreen under the arriving curtain.
  await page.getByRole('button', { name: 'Auditoría' }).click()
  await expect(page.locator('.audit-overlay')).toHaveAttribute('data-state', /entering|open/)
  await expectFolded(page)
  await expect(viewport).toHaveCSS('transform', 'none')

  // And once it is open the burger is gone: on a phone the menu is the only way
  // in, so nothing is unreachable, and the header sits above the curtain.
  await expect(page.locator('.site-header__burger')).toBeHidden()

  expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([])
})

test('a tap on the card, Escape and the burger all close the menu, and open nothing', async ({
  page,
}) => {
  await bootToReady(page)
  await reachSite(page)
  const before = await canvasState(page)

  // The card is pointer-events: none while the menu is up, so a tap on the
  // tilted scene lands on the layer's own ground — and that is "outside".
  await openMenu(page)
  await page.mouse.click(196, 720)
  await expectFolded(page)
  // Hidden once the close has run its course (a delayed visibility flip).
  await expect(page.locator('.audit-trigger')).toBeHidden()

  await openMenu(page)
  await page.keyboard.press('Escape')
  await expectFolded(page)

  await openMenu(page)
  await page.locator('.site-header__burger').click()
  await expectFolded(page)
  await expect(page.locator('.site-header__burger')).toHaveAttribute('aria-expanded', 'false')

  // None of the three opened anything, and three round trips rebuilt nothing.
  await expect(page.locator('.audit-overlay')).toHaveAttribute('data-state', 'closed')
  await expect(page.locator('.modal-panel')).toHaveCount(0)
  expect(await canvasState(page)).toEqual(before)
})

test('the doors sit in the band the card leaves free', async ({ page }) => {
  await asLayoutTest(page)
  await bootToReady(page)
  await reachSite(page)
  await openMenu(page)

  const g = await page.evaluate(() => {
    const rect = (selector: string) => document.querySelector(selector)!.getBoundingClientRect()
    return {
      // A client rect INCLUDES the transform, which here is the point: this is
      // where the card actually is on screen.
      card: rect('.app__viewport'),
      audit: rect('.audit-trigger'),
      contact: rect('.contact-trigger'),
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
    }
  })
  // The card has dropped and receded: its top edge is well below the header
  // and it is narrower than the viewport, because it is further away.
  expect(g.card.top).toBeGreaterThan(g.height * 0.25)
  expect(g.card.width).toBeLessThan(g.width)
  // Both doors sit entirely in the band above the card, inside the viewport,
  // and keep a touch target's height.
  for (const [name, door] of [
    ['Auditoría', g.audit],
    ['Contacto', g.contact],
  ] as const) {
    expect(door.bottom, `${name} above the card`).toBeLessThanOrEqual(g.card.top)
    expect(door.left, `${name} inside the viewport`).toBeGreaterThanOrEqual(0)
    expect(door.right, `${name} inside the viewport`).toBeLessThanOrEqual(g.width)
    expect(door.height, `${name} touch target`).toBeGreaterThanOrEqual(44)
  }
  // Numbered in order, top to bottom.
  expect(g.audit.bottom).toBeLessThanOrEqual(g.contact.top)
})

/**
 * The blog on a phone.  `design/blog/MovilArticulo.dc.html` is the artboard.
 *
 * Driven through the COLD document — `page.goto('/blog')` loads `blog.html`,
 * which has never heard of three.js. That is not a shortcut around the warm
 * path: both hosts mount the same `BlogRoute`, and what is asserted here is
 * layout, type and tap targets, none of which can differ between them.
 * `e2e/blog.spec.ts` owns the warm/cold distinction itself.
 *
 * Every assertion is relational rather than pinned to 390px, because these run
 * on both mobile projects and a Pixel 7 is 412px wide.
 */

/** A 2x1 grey PNG. Small enough to inline, real enough to decode. */
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAYAAAD0In+KAAAAEklEQVR4nGP8//8/AzJgYkAFRPMBz2wDGgBjNhAAAAAASUVORK5CYII=',
  'base64',
)

/** Keeps the run hermetic; the covers are real Sanity CDN URLs. */
async function interceptImages(page: Page) {
  await page.route('https://cdn.sanity.io/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: PIXEL }),
  )
}

/**
 * Two surfaces, because only one of them is the scroller.
 *
 * `.blog-root` is `position: fixed; inset: 0; overflow-y: auto`, and a computed
 * `overflow-y: auto` drags `overflow-x` to `auto` with it. A full-bleed figure
 * one pixel too wide therefore produces a horizontal scrollbar on the blog that
 * `document.documentElement` never sees.
 */
async function assertNoSideways(page: Page) {
  const sizes = await page.evaluate(() => {
    const root = document.querySelector('.blog-root')!
    return {
      docScroll: document.documentElement.scrollWidth,
      docClient: document.documentElement.clientWidth,
      rootScroll: root.scrollWidth,
      rootClient: root.clientWidth,
    }
  })
  expect(sizes.docScroll, 'the document scrolls sideways').toBeLessThanOrEqual(sizes.docClient)
  expect(sizes.rootScroll, 'the blog scrolls sideways').toBeLessThanOrEqual(sizes.rootClient)
}

async function openBlogIndex(page: Page) {
  await interceptImages(page)
  await page.goto('/blog')
  await page.waitForSelector('.blog-card')
}

/** The index's first card is the newest post, and it has a cover. */
async function openFirstArticle(page: Page) {
  await page.locator('.blog-card').first().click()
  await page.waitForSelector('.blog-article')
}

test.describe('the blog on a phone', () => {
  test('the index fits the column and every control is a 44px target', async ({ page }) => {
    const errors = collect(page)
    await openBlogIndex(page)

    await assertNoSideways(page)

    // The gutter the artboard draws, and the one the full-bleed rule is paired
    // with. The article moved to 20px before this phase; the index, the related
    // list and the footer were left at the desktop 24px and did not line up.
    await expect(page.locator('.blog-page')).toHaveCSS('padding-left', '20px')

    const back = (await page.locator('.blog-back').boundingBox())!
    expect(back.width).toBeGreaterThanOrEqual(44)
    expect(back.height).toBeGreaterThanOrEqual(44)

    const pills = page.locator('.blog-pill')
    expect(await pills.count()).toBeGreaterThan(0)
    for (const pill of await pills.all()) {
      const box = (await pill.boundingBox())!
      expect(box.height, 'a topic pill is under 44px').toBeGreaterThanOrEqual(44)
    }

    const search = (await page.locator('.blog-search').boundingBox())!
    expect(search.height).toBeGreaterThanOrEqual(44)
    // 16px or larger, or iOS zooms the whole page in when the field takes focus
    // and offers no way back out.
    const inputSize = await page
      .locator('.blog-search__input')
      .evaluate((el) => parseFloat(getComputedStyle(el).fontSize))
    expect(inputSize).toBeGreaterThanOrEqual(16)

    // One column, asserted on the track list rather than by comparing two cards'
    // x: the content carries two posts and one of them is the featured slot, so
    // a card-to-card comparison would have nothing to compare.
    const tracks = await page.evaluate(() => ({
      grid: getComputedStyle(document.querySelector('.blog-grid')!).gridTemplateColumns,
      featured: getComputedStyle(document.querySelector('.blog-card--featured')!)
        .gridTemplateColumns,
    }))
    expect(tracks.grid.split(' ')).toHaveLength(1)
    expect(tracks.featured.split(' ')).toHaveLength(1)

    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([])
  })

  test('an article reads at the artboard type scale', async ({ page }) => {
    const errors = collect(page)
    await openBlogIndex(page)
    await openFirstArticle(page)

    await assertNoSideways(page)
    await expect(page.locator('.blog-article')).toHaveCSS('padding-left', '20px')

    const type = await page.evaluate(() => {
      const title = document.querySelector('.blog-article__title')!
      const body = document.querySelector('.blog-body')!
      return {
        title: parseFloat(getComputedStyle(title).fontSize),
        body: parseFloat(getComputedStyle(body).fontSize),
        leading: parseFloat(getComputedStyle(body).lineHeight),
        serif: getComputedStyle(body).fontFamily,
        ui: getComputedStyle(title).fontFamily,
      }
    })

    // 1.85rem, down from the desktop 2.75rem.
    expect(type.title).toBeGreaterThan(28)
    expect(type.title).toBeLessThan(32)
    // 1.125rem / 1.6 — the reading size, down from 1.25rem / 1.65.
    expect(type.body).toBeCloseTo(18, 0)
    expect(type.leading).toBeCloseTo(28.8, 0)

    // The two faces stay on their own sides of the design: Source Serif 4 for
    // prose, Inter for anything that is interface. Both are registered under
    // blog-specific family names so they cannot restyle the 3D site.
    expect(type.serif).toContain('Vertigo Blog Serif')
    expect(type.ui).toContain('Vertigo Blog Inter')

    expect(errors, `console errors: ${errors.join(' | ')}`).toEqual([])
  })

  test('article images run edge to edge, and their captions do not', async ({ page }) => {
    await openBlogIndex(page)
    await openFirstArticle(page)

    // A body image is the case the old rule missed: it reached
    // `.blog-article > .blog-figure` only, so the cover bled and every image
    // after it stayed in a rounded 350px box. The published posts carry no image
    // block, so the real cover figure is CLONED into `.blog-body` — the markup
    // under test is still BlogFigure's own output, moved to the position the
    // rule has to cover. The caption is appended for the same reason: no cover
    // has one today, and the artboard pushes it back inside the gutter while the
    // image bleeds past it.
    await page.evaluate(() => {
      const cover = document.querySelector('.blog-article > .blog-figure')!
      const clone = cover.cloneNode(true) as HTMLElement
      const caption = document.createElement('figcaption')
      caption.className = 'blog-figure__caption'
      caption.textContent = 'Pie de foto de prueba.'
      clone.append(caption)
      document.querySelector('.blog-body')!.prepend(clone)
    })

    const figures = page.locator('.blog-article > .blog-figure, .blog-body > .blog-figure')
    expect(await figures.count(), 'no figure to measure').toBe(2)

    const rootWidth = await page.locator('.blog-root').evaluate((el) => el.clientWidth)

    for (const figure of await figures.all()) {
      const box = (await figure.boundingBox())!
      expect(box.x, 'a figure does not start at the left edge').toBeCloseTo(0, 0)
      expect(box.width, 'a figure is not the full width of the blog').toBeCloseTo(rootWidth, 0)
      await expect(figure.locator('.blog-figure__img')).toHaveCSS('border-radius', '0px')
    }

    // Measured on the TEXT, not on the caption box. The caption is a block
    // inside the bled figure, so its border box legitimately starts at x=0 and
    // it is the 20px padding that carries the words back inside the gutter — a
    // bounding-box read would pass whether that padding existed or not.
    const captionText = await page.evaluate(() => {
      const caption = document.querySelector('.blog-body .blog-figure__caption')!
      const range = document.createRange()
      range.selectNodeContents(caption)
      return range.getBoundingClientRect().left
    })
    expect(captionText, 'the caption bled with the image instead of staying inset').toBeCloseTo(
      20,
      0,
    )

    await assertNoSideways(page)
  })

  test('the article top bar carries three named 44px controls', async ({ page }) => {
    await openBlogIndex(page)
    await openFirstArticle(page)

    // The artboard draws back / mark / search. Before this phase the mark was an
    // aria-hidden decoration and the third cell an empty spacer, so a phone had
    // one control where the design has three.
    const controls = [
      { locator: page.locator('.blog-back'), name: 'Ir atrás' },
      { locator: page.locator('.blog-topbar__home'), name: 'Inicio del blog' },
      { locator: page.locator('.blog-topbar__search'), name: 'Buscar en el blog' },
    ]

    for (const { locator, name } of controls) {
      await expect(locator).toHaveAccessibleName(name)
      const box = (await locator.boundingBox())!
      expect(box.width, name + ' is under 44px wide').toBeGreaterThanOrEqual(44)
      expect(box.height, name + ' is under 44px tall').toBeGreaterThanOrEqual(44)
    }

    // Search is not a decoration either: it unwinds to the index and leaves the
    // caret in the field, which is the whole reason it is worth a third of the
    // bar. An icon that only navigated would be named for something it does not
    // do.
    await page.locator('.blog-topbar__search').click()
    await expect(page.locator('.blog-search__input')).toBeFocused()
    expect(new URL(page.url()).pathname).toBe('/blog')
  })

  test('the blog scrolls, the page underneath does not, and back returns', async ({ page }) => {
    await openBlogIndex(page)
    await openFirstArticle(page)

    const root = page.locator('.blog-root')
    const scrollable = await root.evaluate((el) => el.scrollHeight - el.clientHeight)
    expect(scrollable, 'the article must overflow for this to prove anything').toBeGreaterThan(0)

    const moved = await root.evaluate((el) => {
      el.scrollTop = Math.min(600, el.scrollHeight - el.clientHeight)
      return el.scrollTop
    })
    expect(moved).toBeGreaterThan(0)

    // `.blog-root` is a fixed overlay and the document behind it has nothing
    // to scroll. If this ever moves, the two are fighting, and a phone gets the
    // rubber-banding `overscroll-behavior: contain` exists to prevent.
    expect(await page.evaluate(() => window.scrollY)).toBe(0)

    await page.locator('.blog-back').click()
    await expect(page.locator('.blog-page')).toBeVisible()
    expect(new URL(page.url()).pathname).toBe('/blog')
  })

  test('the burger opens the same menu, on paper', async ({ page }) => {
    await asLayoutTest(page)
    await openBlogIndex(page)
    await page.waitForSelector('.audit-trigger', { state: 'attached' })
    await openMenu(page)
    await expect(page.locator('.audit-trigger')).toBeVisible()

    const surface = page.locator('.blog-surface')
    const viewport = surface.locator('.site-menu-viewport')
    await expect(surface).toHaveAttribute('data-menu-state', 'open')
    await expect(viewport).not.toHaveCSS('transform', 'none')
    await expect(surface.locator('.site-menu-caption').first()).toBeVisible()
    await expect(page.locator('.site-header__field')).toHaveCount(0)
    const headerBox = await page.locator('.site-header').boundingBox()
    await page.locator('.site-header__burger').click()
    await expect(surface).toHaveAttribute('data-menu-state', 'closed')
    await expect(viewport).toHaveCSS('transform', 'none')
    expect(await page.locator('.site-header').boundingBox()).toEqual(headerBox)
    await assertNoSideways(page)
  })
})

/**
 * Where the services campus's lake is on screen — the one place a tap enters.
 *
 * The same seam, and the same reasoning, as `clickBlogDisplay` in blog.spec.ts:
 * the lake's position depends on the camera pose and on the GLB, so a
 * hardcoded point would turn this into a test of the city's layout that breaks
 * on the next re-export. The seam kept its name through the campus port
 * (plan 024); it answers with the lake now.
 */
/** The seam's answer, or why it has none. Polled by `bringDistrictIntoView`. */
async function districtProbe(
  page: Page,
): Promise<{ reason: 'ok' | 'no-seam' | 'off-screen'; point: { x: number; y: number } | null }> {
  return page.evaluate(() => {
    const probe = (window as unknown as Record<string, unknown>).__vertigoDistrictPoint
    if (typeof probe !== 'function') return { reason: 'no-seam' as const, point: null }
    const point = (probe as () => { x: number; y: number } | null)()
    return { reason: point === null ? ('off-screen' as const) : ('ok' as const), point }
  })
}

async function bringDistrictIntoView(page: Page): Promise<{ x: number; y: number }> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    // Polled rather than read once: the campus's flights integrate clamped
    // frame deltas, so their 1.4s take far longer in wall-clock on a software
    // renderer at a few frames a second, and a camera still arriving would
    // otherwise read as a lake that is not there.
    let reason: 'ok' | 'no-seam' | 'off-screen' = 'off-screen'
    try {
      await expect
        .poll(async () => (reason = (await districtProbe(page)).reason), { timeout: 8_000 })
        .toBe('ok')
    } catch {
      expect(reason, 'the district never resolved against this city model').not.toBe('no-seam')
      await panBy(page, -320, 0)
      continue
    }
    const settled = await districtProbe(page)
    if (settled.point) return settled.point
  }
  throw new Error('the lake never came into view, after five pans')
}

/**
 * One finger, dragged across the canvas — the city's pan.
 *
 * In-page for the reason `pinch` is: Playwright's touch dispatch is a CDP round
 * trip, and on a main thread starved by a software renderer those land seconds
 * apart. Six steps rather than the pinch's twenty, because a pan has no
 * classifier to convince — it only has to cross `touchDragThresholdPx`.
 */
async function panBy(page: Page, dx: number, dy: number) {
  await page.evaluate(
    ([ddx, ddy]) =>
      new Promise<void>((resolve) => {
        const canvas = document.querySelector('canvas')!
        const cx = window.innerWidth / 2
        const cy = window.innerHeight / 2
        const fire = (type: string, x: number, y: number) =>
          canvas.dispatchEvent(
            new PointerEvent(type, {
              pointerId: 1,
              pointerType: 'touch',
              button: 0,
              buttons: 1,
              clientX: x,
              clientY: y,
              bubbles: true,
              cancelable: true,
            }),
          )
        fire('pointerdown', cx, cy)
        let i = 0
        const n = 6
        const step = () => {
          i += 1
          fire('pointermove', cx + (ddx * i) / n, cy + (ddy * i) / n)
          if (i < n) {
            setTimeout(step, 16)
            return
          }
          fire('pointerup', cx + ddx, cy + ddy)
          setTimeout(resolve, 120)
        }
        setTimeout(step, 16)
      }),
    [dx, dy] as const,
  )
}

/** True while the services section holds the viewer. Its live region is the observable. */
async function districtOpen(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (document.querySelector('.district-a11y-live')?.textContent ?? '') !== '',
  )
}

test('a finger opens the services section, closes it, and opens it again', async ({ page }) => {
  // Reported by the client 2026-09-06, from mobile only: the district opened
  // once and was then deaf to every tap, or was deaf from the first one. The
  // cause was a press ledger that a release could fail to clear, and a latch is
  // only a latch on the SECOND attempt — so the re-open below is the whole point
  // of this test and the first open is its setup. The campus's interaction
  // (`campus/campusInteraction.ts`) keeps the same ledger, so the same test
  // still guards it.
  //
  // A full boot, a cinematic and three touch interactions, on a software
  // renderer where one gesture has been measured at 10-35s.
  test.setTimeout(240_000)
  await bootToReady(page)
  await reachSite(page)

  await pinch(page, { from: 60, to: 60 + commitGrowth(page) * 1.05 })
  expect(await inMurcia(page)).toBe(false)
  await pinch(page, { from: 60, to: 60 + commitGrowth(page) * 1.05 })
  await expect.poll(() => inMurcia(page), { timeout: 15_000 }).toBe(true)
  // The arrival cinematic owns the camera, and a press fired inside it reads as
  // "stop the flight" rather than as a choice — by design, and it would make
  // the first tap below fail for a reason that is not this test's subject.
  await expect
    .poll(() => page.locator('.nav').getAttribute('data-state'), { timeout: 20_000 })
    .toBe('idle')

  // THE CAMPUS MAY NOT BE ON SCREEN WHEN YOU ARRIVE, and the panning inside
  // `bringDistrictIntoView` is not convenience — it was the measured state of
  // this viewport, and a SEPARATE defect from the one this test guards.
  //
  // Recorded 2026-09-06 on both phone profiles: at the arrival pose the
  // district's buildings are outside the frustum, the arrival beacons show and
  // pin to NOTHING (`offScreen: ['servicios', 'blog']`), and the hint frame
  // says "Toca un distrito iluminado" over a city with no lit district in it.
  // One leftward pan brings it to x≈284 of 393 and a second to x≈85; a third
  // carries it off the far edge. Desktop at 1600x900 has it on screen at
  // arrival — which is what makes this a portrait-aspect defect rather than a
  // pose that is simply wrong everywhere.
  //
  // Deliberately not asserted here. Where the camera should sit is a
  // composition decision with no single correct answer, and pinning one in a
  // test would be this file deciding it. What this test does assert is that the
  // tap round trip works once the lake IS reachable.
  const first = await bringDistrictIntoView(page)

  await page.touchscreen.tap(first.x, first.y)
  await expect.poll(() => districtOpen(page), { timeout: 20_000 }).toBe(true)

  // Out by the keyboard's route: Escape goes back one level, and on the intro
  // there is only one. The overlay's close is the next test's subject.
  await page.keyboard.press('Escape')
  await expect.poll(() => districtOpen(page), { timeout: 20_000 }).toBe(false)

  // Re-found rather than reused, and it takes another pan: the exit dollies the
  // camera back to where the visitor tapped from. A stale point would miss and
  // look exactly like the latch this test is watching for — and the exit flight
  // has to land first, because the campus ignores presses while it flies.
  await waitDistrictSettled(page)
  const again = await bringDistrictIntoView(page)
  await page.touchscreen.tap(again.x, again.y)
  await expect.poll(() => districtOpen(page), { timeout: 20_000 }).toBe(true)
})

/**
 * Waits for the campus's flight to land. It ignores presses while it flies, so
 * a tap fired mid-flight would be lost rather than read. A flight is 1.4 s of
 * scene time — at least 14 frames at the 0.1 s delta clamp — and the phone
 * profiles render at under a frame a second here, so the wait is generous.
 */
async function waitDistrictSettled(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const settled = (window as unknown as Record<string, unknown>).__vertigoDistrictSettled
          return typeof settled === 'function' ? (settled as () => boolean)() : null
        }),
      { timeout: 60_000 },
    )
    .toBe(true)
}

/**
 * The overlay's close button, once the section's copy is showing.
 *
 * Real DOM rather than a seam: the close is a button in `.campus-overlay`, and
 * the copy — with it — appears only once the flight has landed and the
 * particles have risen and settled. That is 2 s of scene time (the 1.4 s
 * flight runs inside it), and scene time advances by at most 0.1 s a frame
 * (`clampFrameDelta`), so on a software renderer at one or two frames a second
 * it is tens of seconds of wall clock. Until then the layer is
 * `visibility: hidden` and takes no press.
 */
async function settledCloseButton(page: Page): Promise<{ x: number; y: number }> {
  await waitDistrictSettled(page)
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const layer = document.querySelector('.campus-overlay')
          return layer ? getComputedStyle(layer).visibility : null
        }),
      { timeout: 150_000 },
    )
    .toBe('visible')
  const point = await page.evaluate(() => {
    const close = document.querySelector<HTMLButtonElement>('.campus-overlay__back')
    if (!close) return null
    const r = close.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })
  expect(point, 'the overlay has no close button').not.toBeNull()
  return point!
}

test('a touch user can leave the services section two ways: its close, and a pinch out', async ({
  page,
}) => {
  // The other half of the mobile report. Once the old display was open, the
  // only way out on a phone was a ~19 CSS px close glyph: the pinch was refused
  // while a district held the viewer, Escape needs a keyboard and the a11y
  // VOLVER only unclips for one. The campus keeps both touch-native exits: a
  // 40 px close in its overlay, and the pinch, which must not need aim.
  //
  // Two visits, each waiting out the particles' rise before its copy — and
  // its close — appear: see `settledCloseButton` for why that is minutes here.
  test.setTimeout(480_000)
  await bootToReady(page)
  await reachSite(page)

  await pinch(page, { from: 60, to: 60 + commitGrowth(page) * 1.05 })
  expect(await inMurcia(page)).toBe(false)
  await pinch(page, { from: 60, to: 60 + commitGrowth(page) * 1.05 })
  await expect.poll(() => inMurcia(page), { timeout: 15_000 }).toBe(true)
  await expect
    .poll(() => page.locator('.nav').getAttribute('data-state'), { timeout: 20_000 })
    .toBe('idle')

  const first = await bringDistrictIntoView(page)
  await page.touchscreen.tap(first.x, first.y)
  await expect.poll(() => districtOpen(page), { timeout: 20_000 }).toBe(true)

  // 1. The close, once the copy is showing.
  const close = await settledCloseButton(page)
  await page.touchscreen.tap(close.x, close.y)
  await expect.poll(() => districtOpen(page), { timeout: 20_000 }).toBe(false)
  // The close starts the exit flight, and the campus ignores presses while a
  // flight plays — so it is waited out before going back in.
  await waitDistrictSettled(page)

  // 2. Back in, then a pinch OUT — a close in Murcia — with no aim at all.
  const again = await bringDistrictIntoView(page)
  await page.touchscreen.tap(again.x, again.y)
  await expect.poll(() => districtOpen(page), { timeout: 20_000 }).toBe(true)
  // Only the flight is waited out, not the copy: the pinch leaves whether or not
  // the section has finished forming, and the rise is minutes on this renderer.
  await waitDistrictSettled(page)
  await pinch(page, { from: 200, to: 120 })
  await expect.poll(() => districtOpen(page), { timeout: 20_000 }).toBe(false)
  // One level, not one world.
  expect(await inMurcia(page)).toBe(true)
})
