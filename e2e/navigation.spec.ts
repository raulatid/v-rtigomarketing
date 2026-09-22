import { test, expect, type ConsoleMessage, type Page } from '@playwright/test'

/**
 * Earth <-> Murcia navigation, driven the way a visitor drives it.
 *
 * There was no end-to-end coverage of the round trip at all before this file, and
 * `adr/009` deleted the only DOM-addressable way out of Murcia — the return button
 * — so what little could have been asserted through the DOM went with it. This is
 * the replacement, and it is new coverage rather than a migration.
 *
 * ## What this asserts that the unit tests cannot
 *
 * The input, zoom-band and state-machine unit tests cover thresholds and guards.
 * This suite checks the scene substitution and direction mapping in a browser.
 *
 * Both worlds leave at the end of their persistent zoom band, with no extra push.
 * The round trip checks a partial approach, its persistence,
 * the forward journey, momentum protection and the backward return.
 *
 * ## Why the events are dispatched rather than driven through the mouse
 *
 * `page.mouse.wheel` posts through the browser's input pipeline, which is starved
 * by the same main thread the software renderer is saturating. Measured on this
 * build: `setTimeout(16)` fired every ~415ms while the renderer still reported
 * 33fps. Dispatching from inside the page keeps the events on a clock this test
 * can reason about; they still travel the real listener path, and `event.timeStamp`
 * is still the real one, which is the only thing the accumulator reads.
 *
 * That starvation is not an artifact worth engineering around — it is the reason
 * `idleGapSeconds` is 0.5 rather than 0.18, and it is recorded in navigationConfig.
 */

function collect(page: Page) {
  const errors: string[] = []
  page.on('console', (message: ConsoleMessage) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  return errors
}

/** True once Murcia is the experience being drawn. Its UI host is the tell. */
async function inMurcia(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const host = document.querySelector('.murcia-ui')
    return host ? getComputedStyle(host).display !== 'none' : false
  })
}

async function rail(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.nav')
    if (!el) return null
    return {
      state: el.dataset.state ?? '',
      direction: el.dataset.direction ?? '',
      opacity: getComputedStyle(el).opacity,
    }
  })
}

/**
 * A wheel stream, paced from inside the page.
 *
 * `deltaY` is per event and `count` is how many, so a test states a gesture in the
 * units the zoom band measures: pixels of travel, never event counts.
 */
async function wheelStream(page: Page, deltaY: number, count: number, gapMs = 16) {
  await page.evaluate(
    ([dy, n, gap]) =>
      new Promise<void>((resolve) => {
        let sent = 0
        const step = () => {
          window.dispatchEvent(
            new WheelEvent('wheel', {
              deltaY: dy,
              deltaMode: 0,
              bubbles: true,
              cancelable: true,
            }),
          )
          sent += 1
          if (sent < n) setTimeout(step, gap)
          else setTimeout(resolve, 60)
        }
        step()
      }),
    [deltaY, count, gapMs] as const,
  )
}

/** Waits for the intro to land. The audit trigger only exists at phase 'site'. */
async function reachSite(page: Page) {
  await page.waitForSelector('.audit-trigger', { timeout: 75_000 })
  await page.waitForTimeout(400)
}

test.describe('Earth <-> Murcia gesture navigation', () => {
  for (const width of [1600, 393]) {
    test(`city logo returns to Earth at viewport width ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      // On phones the audit trigger lives inside the closed menu.
      await page.locator('.audit-trigger').waitFor({ state: 'attached', timeout: 75_000 })
      await expect(page.locator('.nav')).toHaveAttribute('data-state', 'idle')
      const home = page.locator('.scene-home')
      await expect(home).toHaveCount(0)
      const navigation = page.locator('.nav-control')
      await expect(navigation).toBeEnabled()
      await navigation.focus()
      await navigation.press('Enter')
      await expect.poll(() => inMurcia(page)).toBe(true)
      await expect(page.locator('.nav')).toHaveAttribute('data-state', 'idle')
      await expect(home).toBeEnabled()
      const box = await home.boundingBox()
      expect(box!.width).toBeGreaterThanOrEqual(44)
      expect(box!.height).toBeGreaterThanOrEqual(44)
      // Enter through the same accessible action that opens the 3D services.
      const enterServices = page.locator('.district-a11y-control').first()
      await enterServices.focus()
      await enterServices.press('Enter')
      await expect(home).toBeDisabled()
      await expect(home).toBeHidden()
      expect(await inMurcia(page)).toBe(true)
      // A flight ignores exit input until it lands; retry the user's Escape
      // until the overview (and its logo control) is available again.
      await expect(async () => {
        await page.keyboard.press('Escape')
        await expect(home).toBeEnabled({ timeout: 1000 })
      }).toPass({ timeout: 30_000 })
      await home.click()
      await expect.poll(() => inMurcia(page)).toBe(false)
      await expect(home).toHaveCount(0)
      await expect(page.locator('.nav')).toHaveAttribute('data-state', 'idle')
    })
  }

  test('navigation stands down while something else owns attention', async ({ page }) => {
    // The regression this guards: the state was only painted inside the gesture
    // frame loop, so opening a panel never repainted it — it sat 'idle' behind
    // the audit form (and through the whole intro), advertising a navigation the
    // context refuses. It must derive from the application's semantic conditions
    // with NO input event involved.
    //
    // The opacity half of this test went with the rail (`adr/012`): there is
    // nothing drawn to fade any more. `data-state` is what carries the meaning
    // now — the hint reads it, and its own tests assert it stays away while
    // navigation is refused.
    await page.goto('/')

    // The intro owns the camera: refused from the first derive.
    await expect.poll(async () => (await rail(page))?.state).toBe('suppressed')

    await reachSite(page)
    await expect.poll(async () => (await rail(page))?.state).toBe('idle')

    // The audit panel takes the viewer's attention; navigation stands down the
    // moment it opens and returns when it closes — no gesture in between.
    await page.click('.audit-trigger')
    await expect.poll(async () => (await rail(page))?.state).toBe('suppressed')

    await page.click('.audit-close')
    await expect.poll(async () => (await rail(page))?.state).toBe('idle')
  })
  test('a deliberate gesture makes the round trip, and a flick does not', async ({ page }) => {
    // Includes boot, both 1200px crossings, and a sustained momentum tail.
    test.setTimeout(180_000)
    const errors = collect(page)
    await page.goto('/')
    await reachSite(page)

    expect(await inMurcia(page)).toBe(false)
    expect((await rail(page))?.direction).toBe('down')

    // ── One enormous event must not navigate, and does not even arm one ──
    // A single event contributes at most 120px to the 1200px band.
    await wheelStream(page, -100_000, 1)
    expect(await inMurcia(page)).toBe(false)

    // Both worlds leave at the zoom limit, without a push
    // stage. A partial approach remains on Earth and persists across a pause.
    await wheelStream(page, -120, 4)
    expect(await inMurcia(page)).toBe(false)
    await page.waitForTimeout(1500)

    // Together with the first capped flick, this crosses the 1200px band.
    // These six events alone could not reach the limit from rest.
    await wheelStream(page, -120, 6)
    await expect.poll(() => inMurcia(page), { timeout: 30_000 }).toBe(true)

    // Direction is derived from the current experience.
    await expect.poll(async () => (await rail(page))!.direction, { timeout: 5000 }).toBe('up')

    // ── The momentum tail must not bounce straight back ──
    // The trackpad hazard `docs/plans/002` §4 calls out: a commit followed by the
    // inertial remainder of the same physical gesture must not navigate again.
    // Faster and longer than the gesture that committed, which is what a tail is.
    await wheelStream(page, -120, 60, 8)
    await page.waitForTimeout(3000)
    expect(await inMurcia(page)).toBe(true)

    // ── And the reverse gesture comes home ──
    await expect.poll(async () => (await rail(page))!.state).toBe('idle')
    await wheelStream(page, 120, 40)
    await expect.poll(() => inMurcia(page), { timeout: 10_000 }).toBe(false)

    expect(errors).toEqual([])
  })

  test('scrolling the wrong way never navigates, however far', async ({ page }) => {
    await page.goto('/')
    await reachSite(page)

    // Backward wheel rotation on Earth is away from Murcia. `adr/014`
    // gave that direction the other half of the zoom band, so the globe really
    // does recede — but the far end is a DEAD STOP that returns no overflow. So
    // 2400px of scrolling cannot commit at the wrong end of the band.
    //
    // The failure this catches is a band that spilled at both ends: the wrong way
    // out of a world would then navigate you out of it, which is the one thing a
    // direction convention exists to prevent.
    await wheelStream(page, 120, 20)
    await page.waitForTimeout(500)

    expect(await inMurcia(page)).toBe(false)

    // And the zoom being persistent must not turn into a debt: coming back the
    // other way has to cross the band it just spent before it can arm anything.
    // 960px is most of one crossing and not nearly two, so it leaves the camera
    // short of the navigation threshold.
    await wheelStream(page, -120, 8)
    await page.waitForTimeout(500)
    expect(await inMurcia(page)).toBe(false)
  })

  test('the accessible control commits, and names where it goes', async ({ page }) => {
    await page.goto('/')
    await reachSite(page)

    // Not a second control reintroduced against the gesture-only decision — it is
    // the ONLY control for anyone a pinch excludes: keyboard users, switch access,
    // screen readers, anyone who cannot make a two-finger gesture. `adr/009`
    // records this as the one DECISIONS §15 objection the gesture cannot answer,
    // and `adr/012` records why removing the rail did not remove it.
    const control = page.locator('.nav-control')
    await expect(control).toHaveAttribute('aria-label', 'Ir a Murcia')

    // Clipped to a pixel, so it cannot swallow taps meant for the world — but
    // reachable, which display:none and visibility:hidden would not be.
    await control.focus()
    await expect(control).toBeFocused()

    // One press, not eight. A button is not the slider it replaced: there is no
    // accidental Enter on a control you had to tab to and which announced its
    // destination first.
    await page.keyboard.press('Enter')
    await expect.poll(() => inMurcia(page), { timeout: 10_000 }).toBe(true)

    // And the label follows the destination rather than describing the journey.
    await expect(control).toHaveAttribute('aria-label', 'Volver a la Tierra')
    // Both adapters must observe the same live transition channel on return.
    await expect.poll(async () => (await rail(page))?.state).toBe('idle')
    await control.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => inMurcia(page), { timeout: 10_000 }).toBe(false)
    await expect(control).toHaveAttribute('aria-label', 'Ir a Murcia')
  })
  test('the wheel still scrolls a panel that has its own overflow', async ({ page }) => {
    await page.goto('/')
    await reachSite(page)

    // The global wheel listener is the only `preventDefault` in the application
    // now, and an unconditional one would stop the audit panel scrolling — a
    // regression invisible until someone opens a long panel on a short screen,
    // which is the case that panel exists for.
    await page.locator('.audit-trigger').click()
    const panel = page.locator('.audit-panel')
    await expect(panel).toBeVisible()

    const scrolled = await panel.evaluate((el) => {
      if (el.scrollHeight <= el.clientHeight) return 'not-scrollable'
      el.scrollTop = 0
      el.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, bubbles: true, cancelable: true }))
      return 'scrollable'
    })

    if (scrolled === 'scrollable') {
      // The browser performs the scroll only for a trusted event, so what is
      // asserted here is the part this code owns: the listener did not cancel it.
      const cancelled = await panel.evaluate((el) => {
        const event = new WheelEvent('wheel', { deltaY: 200, bubbles: true, cancelable: true })
        el.dispatchEvent(event)
        return event.defaultPrevented
      })
      expect(cancelled).toBe(false)
    }

    // And the gesture is refused while the panel owns the viewer's attention.
    await wheelStream(page, -120, 40)
    await page.waitForTimeout(500)
    expect(await inMurcia(page)).toBe(false)
    expect((await rail(page))!.state).toBe('suppressed')
  })

  test('the Earth hint answers stillness, and clears the footer while it floats', async ({
    page,
  }) => {
    // NEW COVERAGE, and it is new because it only just became possible. Until
    // 2026-09-09 this hint was ~770 points inside the canvas: `hintConfig.ts`
    // and PROJECT_MEMORY §11.68 both promised an e2e that could assert only
    // "something rasterized", because canvas pixels are not addressable and an
    // image baseline of system-ui copy is platform-bound. It is DOM now (§43),
    // so the two things that were actually worth proving can be.
    //
    // Neither is provable in a unit test. `hintIdle.test.ts` proves the rule
    // against numbers; it cannot prove that a real wheel event reaches it, that
    // the scene paints the attribute the stylesheet is waiting on, or that the
    // sentence and the copyright mark do not collide once both are laid out.
    await page.goto('/')
    await reachSite(page)

    const hint = page.locator('.earth-hint')

    // It is offered on stillness. Nothing here acts, so it arrives on its own —
    // which is the whole difference from Murcia's plate, offered on arrival.
    await expect(hint).toHaveAttribute('data-visible', '', { timeout: 15_000 })

    // THE COLLISION THE BOTTOM EXPRESSION EXISTS TO PREVENT. `.site-footer` owns
    // the bottom ~26px and the sentence is nearly full width, so it cannot miss
    // "© 2026 Vértigo" horizontally — vertical clearance is the only lever.
    //
    // Measured at the BOTTOM of the float, not at rest: the figure rests one
    // amplitude above its floor precisely so the down half of the swing lands on
    // it, and a version that reserved nothing passed at rest and collided in
    // motion. Sampling the live rect a few times over one 6s period catches that.
    const footerTop = await page
      .locator('.site-footer')
      .evaluate((el) => el.getBoundingClientRect().top)

    let lowest = -Infinity
    for (let i = 0; i < 12; i += 1) {
      lowest = Math.max(
        lowest,
        await hint.evaluate((el) => el.getBoundingClientRect().bottom),
      )
      await page.waitForTimeout(550)
    }
    expect(lowest).toBeLessThanOrEqual(footerTop)

    // And it steps aside the moment the viewer acts. One event, far below the
    // 1200px the gesture needs, so this dismisses the hint without navigating.
    await wheelStream(page, -40, 1)
    await expect(hint).not.toHaveAttribute('data-visible', '', { timeout: 5_000 })

    // Then it comes back, because it answers a state and not an edge. This is
    // the half the arrival rule could not express: `onHintVisible` fired once
    // per arrival and then never again.
    await expect(hint).toHaveAttribute('data-visible', '', { timeout: 15_000 })
  })
})
