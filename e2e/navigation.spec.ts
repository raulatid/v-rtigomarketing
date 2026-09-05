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
 * `navigationGesture.test.ts`, `zoomBand.test.ts` and `navigationMachine.test.ts`
 * prove the accumulation, the band and the state guards in isolation, against
 * numbers. They cannot prove that a real `wheel` event reaches them with the right
 * sign, that the two stages are wired in series in the right order, that the scene
 * actually swaps, or that the direction mapping flips with it. That is what is here.
 *
 * Since `adr/014` the gesture is two stages — 600px of persistent zoom, then 300px
 * of pushing against its limit — and only the second one decays. That is asserted
 * here rather than in a unit test because PERSISTENCE is a claim about what survives
 * between gestures, and the cheapest honest way to observe it is to spend a gesture,
 * let it retreat, and then navigate on travel that could not possibly have been
 * enough from rest.
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
      progress: Number(getComputedStyle(el).getPropertyValue('--nav-progress')) || 0,
      opacity: getComputedStyle(el).opacity,
    }
  })
}

/**
 * A wheel stream, paced from inside the page.
 *
 * `deltaY` is per event and `count` is how many, so a test states a gesture in the
 * units the accumulator actually measures: pixels of travel, never event counts.
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
    const errors = collect(page)
    await page.goto('/')
    await reachSite(page)

    expect(await inMurcia(page)).toBe(false)
    expect((await rail(page))?.direction).toBe('down')

    // ── One enormous event must not navigate, and does not even arm one ──
    // The objection DECISIONS §15 raised against scroll, and the reason the
    // accumulator exists. A single event is capped at 120px, and since `adr/014`
    // that 120px goes to the ZOOM: the first 600px of any gesture is absorbed by
    // the band, so a flick moves the camera and leaves the commit accumulator
    // untouched. `--nav-progress` reads the accumulator, so it stays at zero.
    await wheelStream(page, 100_000, 1)
    expect(await inMurcia(page)).toBe(false)
    expect((await rail(page))!.progress).toBe(0)

    // ── Crossing the band arms a commit, and abandoning it still retreats ──
    // 720px on top of the flick's 120: the band takes the first 600 and the rest
    // spills into the accumulator, which is the only stage that decays.
    await wheelStream(page, 120, 6)
    expect(await inMurcia(page)).toBe(false)
    const armed = await rail(page)
    expect(armed!.progress).toBeGreaterThan(0)
    expect(armed!.progress).toBeLessThan(1)

    await expect.poll(async () => (await rail(page))!.progress, { timeout: 8000 }).toBe(0)

    // ── The zoom did NOT retreat with it ──
    // THE assertion `adr/014` exists for, and it is observable from here without
    // reading the camera. 480px is comfortably inside the 600px band: from a
    // rested zoom it could not reach the accumulator at all, let alone the 300px
    // commit. It navigates only because the camera is still parked at the limit
    // the abandoned gesture left it at.
    await wheelStream(page, 120, 4)
    await expect.poll(() => inMurcia(page), { timeout: 10_000 }).toBe(true)

    // The rail now points the other way, without the accumulator knowing which
    // world it is in — direction is derived from the current experience.
    await expect.poll(async () => (await rail(page))!.direction, { timeout: 5000 }).toBe('up')

    // ── The momentum tail must not bounce straight back ──
    // The trackpad hazard `docs/plans/002` §4 calls out: a commit followed by the
    // inertial remainder of the same physical gesture must not navigate again.
    // Faster and longer than the gesture that committed, which is what a tail is.
    await wheelStream(page, 120, 40, 8)
    await page.waitForTimeout(3000)
    expect(await inMurcia(page)).toBe(true)

    // ── And the reverse gesture comes home ──
    await wheelStream(page, -120, 14)
    await expect.poll(() => inMurcia(page), { timeout: 10_000 }).toBe(false)

    expect(errors).toEqual([])
  })

  test('scrolling the wrong way never navigates, however far', async ({ page }) => {
    await page.goto('/')
    await reachSite(page)

    // Up, from Earth, is away from Murcia. It is no longer nothing — `adr/014`
    // gave that direction the other half of the zoom band, so the globe really
    // does recede — but the far end is a DEAD STOP that returns no overflow. So
    // 2400px of scrolling arms no commit and the accumulator never moves.
    //
    // The failure this catches is a band that spilled at both ends: the wrong way
    // out of a world would then navigate you out of it, which is the one thing a
    // direction convention exists to prevent.
    await wheelStream(page, -120, 20)
    await page.waitForTimeout(500)

    expect(await inMurcia(page)).toBe(false)
    expect((await rail(page))!.progress).toBe(0)

    // And the zoom being persistent must not turn into a debt: coming back the
    // other way has to cross the band it just spent before it can arm anything.
    // 480px is most of one crossing and not nearly two, so it leaves the camera
    // short of the limit with the accumulator still empty.
    await wheelStream(page, 120, 4)
    await page.waitForTimeout(500)
    expect(await inMurcia(page)).toBe(false)
    expect((await rail(page))!.progress).toBe(0)
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
    await wheelStream(page, 120, 20)
    await page.waitForTimeout(500)
    expect(await inMurcia(page)).toBe(false)
    expect((await rail(page))!.state).toBe('suppressed')
  })

  test('arriving in Murcia names the two places worth clicking', async ({ page }) => {
    // The city is a skyline with two clickable things in it and, until the
    // beacons, nothing that said which two. `#controls-hint` ends with "Toca un
    // distrito iluminado" — a thing the viewer cannot pick out — and the mobile
    // audit found that pill already at opacity 0 by the time the city settled.
    //
    // ── Why this RECORDS rather than polls ──
    // The beacons are on screen for six seconds. This file's own header explains
    // that `setTimeout(16)` fires every ~415ms here while the software renderer
    // saturates the main thread, and `expect.poll` is starved by exactly the
    // same contention — measured at over seven seconds to notice the scene had
    // swapped. A poll can therefore miss the whole window and report an absence
    // that never happened. So an observer installed BEFORE the journey records
    // what the beacons did, and the assertions read the recording afterwards.
    await page.goto('/')
    await reachSite(page)

    const beacons = page.locator('.district-beacons')
    // Mounted with the city, and silent until the viewer is actually in it.
    await expect(beacons).toHaveCount(1)
    expect(await beacons.getAttribute('data-visible')).toBeNull()

    await page.evaluate(() => {
      const el = document.querySelector('.district-beacons')!
      const record: {
        shown: boolean
        retired: boolean
        pinned: string[]
        offScreen: string[]
        pointerEvents: string
      } = { shown: false, retired: false, pinned: [], offScreen: [], pointerEvents: '' }
      ;(window as unknown as Record<string, unknown>).__beaconRecord = record

      new MutationObserver(() => {
        if (el.getAttribute('data-visible') !== 'true') {
          if (record.shown) record.retired = true
          return
        }
        record.shown = true
        record.pointerEvents = getComputedStyle(el).pointerEvents
        // Sampled the moment they appear, because by the time a starved poll
        // could look they may already have retired.
        for (const pin of el.querySelectorAll<HTMLElement>('.district-beacon')) {
          const id = pin.dataset.beacon ?? '?'
          if (pin.dataset.pinned !== 'true') {
            record.offScreen.push(id)
            continue
          }
          const box = pin.getBoundingClientRect()
          const inside =
            box.left >= 0 &&
            box.left <= window.innerWidth &&
            box.top >= 0 &&
            box.top <= window.innerHeight
          record.pinned.push(id + (inside ? ':inside' : ':outside'))
        }
      }).observe(el, { attributes: true, attributeFilter: ['data-visible'], subtree: false })
    })

    // 2400px: the zoom band absorbs the first 600 (`adr/014`) and the rest
    // spills into the accumulator, which commits at 300. Comfortably over, so
    // this stays a test of what happens ON arrival, not of the threshold.
    await wheelStream(page, 120, 20)
    await expect.poll(() => inMurcia(page), { timeout: 15_000 }).toBe(true)

    const record = await page.evaluate(
      () =>
        (window as unknown as Record<string, unknown>).__beaconRecord as {
          shown: boolean
          retired: boolean
          pinned: string[]
          offScreen: string[]
          pointerEvents: string
        },
    )

    // THE point: arriving offers them at all. The failure this guards is the
    // controls pill's — dismissed by the tail of the very gesture that carried
    // the viewer in, so it was never once seen.
    expect(record.shown, 'the beacons never appeared on arrival').toBe(true)

    // Both places are named, and each is pinned somewhere on the canvas rather
    // than parked off-screen where a projection that had lost its frustum test
    // would put it.
    expect(record.offScreen, 'a beacon was showing but pinned to nothing').toEqual([])
    expect(record.pinned.sort()).toEqual(['blog:inside', 'servicios:inside'])

    // A cue, never a control: ADR 009 deleted the parallel navigation
    // affordances and this must not quietly add one back.
    await expect(beacons).toHaveAttribute('aria-hidden', 'true')
    expect(record.pointerEvents).toBe('none')

    // And they do not stay. Six seconds of dwell, then gone on their own —
    // there is no permanent overlay on the city.
    await expect
      .poll(
        async () =>
          (
            await page.evaluate(
              () =>
                (
                  (window as unknown as Record<string, unknown>).__beaconRecord as {
                    retired: boolean
                  }
                ).retired,
            )
          ),
        { timeout: 15_000 },
      )
      .toBe(true)
  })
})
