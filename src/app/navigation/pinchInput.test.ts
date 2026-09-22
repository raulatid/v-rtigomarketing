// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNavigationInput } from './createNavigationInput'
import type { NavigationContext } from './createNavigationInput'
import { NAVIGATION_PINCH } from './navigationConfig'

// The pinch, through the REAL DOM path: window capture listeners, the synthetic
// cancel, the accumulator and the frame loop.
//
// This file used to be twice this size and had a sibling, `pinchClassifier.test.ts`,
// because two fingers in Murcia meant either a zoom or a centroid rotation and
// something had to decide which. Two-finger rotation is gone. A pair now means
// exactly one thing, so the whole arbitration — the verdict states, the rival
// travel, the claim backlog, the allowance for an anchored thumb — went with it,
// and what is left to prove is the wiring rather than a decision.
//
// The acceptance criterion is still `reachedTheWorld`: this module never swallows
// moves, so every move must reach the scene. Earth's orbit may not be made worse
// to add a second control.

/** The grip a gesture opens from. Deliberately not special — see below. */
const START = 150

/**
 * How far the fingers must separate to commit, in this environment.
 *
 * Derived from the viewport exactly as the module does, rather than written
 * down: the commit is a property of the SCREEN and not of the grip, and a test
 * that hardcoded it would not notice if that stopped being true.
 */
const SHORT_SIDE = Math.min(window.innerWidth, window.innerHeight)
const COMMIT_GROWTH = SHORT_SIDE * NAVIGATION_PINCH.commitFraction

/** The one threshold left in the gesture, and it guards a dismissal. */
const RELEASE = NAVIGATION_PINCH.releaseGrowthPx

/** Zoom depth after a fraction of the viewport-scaled band travel. */
const depthAfter = (fraction: number) => Math.min(1, fraction)

/** A grip wide enough that a full commit's worth of closing still fits inside it. */
const WIDE = COMMIT_GROWTH * 1.1 + NAVIGATION_PINCH.minStartDistancePx

/**
 * Every input built by setup(), disposed after each test.
 *
 * In an afterEach rather than at the end of each test, because a failing expect
 * throws and would skip the cleanup — leaving live window listeners that see the
 * NEXT test's gestures.
 */
const live: Array<{ dispose: () => void }> = []
afterEach(() => {
  while (live.length) live.pop()!.dispose()
  document.body.innerHTML = ''
})

function setup(initial: Partial<NavigationContext> = {}) {
  const rail = document.createElement('div')
  const host = document.createElement('div')
  document.body.append(rail, host)
  const context: NavigationContext = { current: 'earth', canNavigate: true, ...initial }
  const commits: string[] = []
  let reachedTheWorld = 0
  let cancels = 0
  let depth = 0
  host.addEventListener('pointermove', () => {
    reachedTheWorld += 1
  })
  host.addEventListener('pointercancel', () => {
    cancels += 1
  })
  const input = createNavigationInput({
    root: rail,
    getContext: () => ({ ...context }),
    onCommit: (intent) => commits.push(intent),
    onZoom: (value) => {
      depth = value
    },
  })
  live.push(input)
  return {
    host,
    context,
    input,
    commits,
    world: () => reachedTheWorld,
    cancels: () => cancels,
    /** The persistent zoom, -1 .. +1, read through the real callback. */
    depth: () => depth,
  }
}

function pe(type: string, x: number, y: number, pointerId: number, pointerType = 'touch') {
  return new PointerEvent(type, {
    pointerId,
    pointerType,
    isPrimary: pointerId === 1,
    button: 0,
    buttons: 1,
    clientX: x,
    clientY: y,
    bubbles: true,
    cancelable: true,
  })
}

/** Two contacts on a horizontal line, `distance` apart, centred on x=400. */
function place(host: HTMLElement, type: string, distance: number) {
  const half = distance / 2
  host.dispatchEvent(pe(type, 400 - half, 500, 1))
  host.dispatchEvent(pe(type, 400 + half, 500, 2))
}

/**
 * Moves the two contacts from `fromDistance` to `toDistance` in `steps`.
 *
 * Each step moves ONE contact and then the other, in separate events, because
 * that is what a real touchscreen does — and it is precisely the pattern that
 * made a per-sample ratio unusable.
 *
 * `fromDistance` is explicit rather than assumed to be START: a helper that
 * always restarted from the opening grip would teleport the fingers at the start
 * of any second leg, and the accumulator would clamp that jump at
 * `maxEventTravelPx` — so a reversal test would measure the clamp instead.
 */
function pinchFromTo(host: HTMLElement, fromDistance: number, toDistance: number, steps = 8) {
  for (let i = 1; i <= steps; i += 1) {
    const d = fromDistance + ((toDistance - fromDistance) * i) / steps
    const half = d / 2
    host.dispatchEvent(pe('pointermove', 400 - half, 500, 1))
    host.dispatchEvent(pe('pointermove', 400 + half, 500, 2))
  }
}

/** Opens (or closes, if negative) the grip by `growth` px from START. */
function spread(host: HTMLElement, growth: number, steps = 8) {
  pinchFromTo(host, START, START + growth, steps)
}

/** Closes the grip by `shrink` px from WIDE. */
function close(host: HTMLElement, shrink: number, steps = 8) {
  pinchFromTo(host, WIDE, WIDE - shrink, steps)
}

const frames = (ms = 120) => new Promise((r) => setTimeout(r, ms))

describe('the pair arms on the second contact', () => {
  it('zooms the world in when two fingers spread on Earth', async () => {
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 0.4)
    await frames()
    expect(t.depth()).toBeCloseTo(depthAfter(0.4), 1)
  })

  it('takes the fingers at the second contact, before any movement', async () => {
    // THE behavioural change. The cancel used to wait for a claim, because until
    // the verdict landed the pair might still have belonged to the turn. There is
    // no verdict now, so the fingers are taken the moment there are two of them —
    // which is also the moment the viewer can see they meant a pinch.
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    expect(t.cancels()).toBe(2)
  })

  it('drives the band from the very first sample, with no dead zone', async () => {
    // A claim used to cost evidence, and that evidence had to be paid back out of
    // a backlog or the zoom opened with a hole the size of the threshold. Nothing
    // is owed now: the first millimetre of separation moves the world.
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 0.05, 1)
    await frames()
    expect(t.depth()).toBeGreaterThan(0)
    expect(t.depth()).toBeCloseTo(depthAfter(0.05), 2)
  })

  it('lets every move reach the world, because it never swallows', async () => {
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 0.4, 8)
    await frames()
    expect(t.world()).toBe(16)
  })

  it('loses nothing to the per-event clamp when a spread is fast', async () => {
    // `maxEventTravelPx` exists so one absurd wheel event cannot navigate. A pinch
    // is a position rather than an impulse, so the clamp is respected and the
    // remainder is CARRIED. Eight steps of a 60% spread ask for more than one
    // event may deliver; none of it may be dropped.
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 0.6, 8)
    await frames(200)
    expect(t.depth()).toBeCloseTo(depthAfter(0.6), 1)
  })

  it('fills the band without committing on a single full spread', async () => {
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 1.05, 20)
    await frames(200)
    expect(t.commits).toEqual([])
    expect(t.depth()).toBeCloseTo(1)
  })

  it('costs the same effort from a tight grip as from a wide one', async () => {
    // THE regression this file exists to prevent. Under the old ratio signal a
    // 40px grip committed after 24px of growth and a 250px grip after 150px, so
    // the gesture people actually make — fingers starting close — was the one that
    // fired by accident. Growth in absolute pixels has no such dependence.
    //
    // One input at a time, disposed between grips. Every input listens on
    // `window`, so two live at once would each see the other's gesture.
    for (const grip of [30, 300]) {
      const t = setup({ current: 'earth' })
      place(t.host, 'pointerdown', grip)
      pinchFromTo(t.host, grip, grip + COMMIT_GROWTH * 0.5, 10)
      await frames()
      expect(t.depth()).toBeCloseTo(depthAfter(0.5), 1)
      live.pop()!.dispose()
      document.body.innerHTML = ''
    }
  })
})

describe('a pair is spent, never paused', () => {
  it('ends the gesture when one finger of two lifts', async () => {
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 0.3)
    await frames()
    const parked = t.depth()

    t.host.dispatchEvent(pe('pointerup', 400 - START / 2, 500, 1))
    // The remaining finger has no separation and therefore no scale. Further
    // movement must not be read as a pinch resuming.
    t.host.dispatchEvent(pe('pointermove', 400, 500, 2))
    await frames()
    expect(t.depth()).toBeCloseTo(parked, 5)
  })

  it('ends the gesture when a third finger lands', async () => {
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 0.3)
    await frames()
    const parked = t.depth()

    t.host.dispatchEvent(pe('pointerdown', 400, 600, 3))
    pinchFromTo(t.host, START + COMMIT_GROWTH * 0.3, START + COMMIT_GROWTH * 0.9)
    await frames()
    expect(t.depth()).toBeCloseTo(parked, 5)
    expect(t.commits).toEqual([])
  })

  it('does not add fingertip drift across disconnected pinches', async () => {
    const t = setup()
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 1.05, 20)
    place(t.host, 'pointerup', START + COMMIT_GROWTH * 1.05)
    await frames()
    expect(t.depth()).toBeCloseTo(1)
    for (let i = 0; i < 3; i++) {
      place(t.host, 'pointerdown', START)
      spread(t.host, RELEASE - 1)
      place(t.host, 'pointerup', START + RELEASE - 1)
      await frames()
    }
    expect(t.commits).toEqual([])
  })

})

describe('Murcia may only leave from a band already at its limit', () => {
  it('zooms out toward Earth when two fingers close', async () => {
    // Positive depth always faces the other world, which is why closing in Murcia
    // and spreading on Earth produce the same sign.
    const t = setup({ current: 'murcia' })
    place(t.host, 'pointerdown', WIDE)
    close(t.host, COMMIT_GROWTH * 0.4)
    await frames()
    expect(t.depth()).toBeCloseTo(depthAfter(0.4), 1)
    expect(t.commits).toEqual([])
  })

  it('refuses to commit when the pinch began with band left to spend', async () => {
    // Leaving the city and zooming out of it are the same motion. A close that
    // started unsaturated spends everything on the zoom and stops there — the
    // client's "when the zoom out triggers it just jumps out to Earth".
    const t = setup({ current: 'murcia' })
    place(t.host, 'pointerdown', WIDE)
    close(t.host, COMMIT_GROWTH * 1.05, 20)
    await frames(200)
    expect(t.commits).toEqual([])
    expect(t.depth()).toBeCloseTo(1, 2)
  })

  it('commits on a SECOND close, which begins already parked at the limit', async () => {
    const t = setup({ current: 'murcia' })
    place(t.host, 'pointerdown', WIDE)
    close(t.host, COMMIT_GROWTH * 1.05, 20)
    await frames(200)
    place(t.host, 'pointerup', WIDE - COMMIT_GROWTH * 1.05)

    place(t.host, 'pointerdown', WIDE)
    close(t.host, COMMIT_GROWTH * 1.05, 20)
    await frames(200)
    expect(t.commits).toEqual(['exit-murcia'])
  })
})

describe('a focused display is let go of by opening the hand', () => {
  // The one place a threshold survives. Feeding the band needs none — a pixel of
  // growth moves it by a pixel and the viewer can take it straight back — but
  // dismissing what someone is reading cannot be undone.

  it('releases on a close in Murcia, once, and navigates nothing', async () => {
    const releaseFocus = vi.fn()
    const t = setup({ current: 'murcia', canNavigate: false, releaseFocus })
    place(t.host, 'pointerdown', WIDE)
    close(t.host, RELEASE + 4)
    expect(releaseFocus).toHaveBeenCalledTimes(1)
    // The fingers are taken from whatever was following them.
    expect(t.cancels()).toBe(2)

    // The rest of the same hand is spent: no zoom, no commit, however far.
    pinchFromTo(t.host, WIDE - RELEASE - 4, WIDE - COMMIT_GROWTH, 20)
    await frames()
    expect(releaseFocus).toHaveBeenCalledTimes(1)
    expect(t.commits).toEqual([])
    expect(t.depth()).toBe(0)
  })

  it('does not release on fingertip drift below the threshold', async () => {
    const releaseFocus = vi.fn()
    const t = setup({ current: 'murcia', canNavigate: false, releaseFocus })
    place(t.host, 'pointerdown', WIDE)
    close(t.host, RELEASE - 6)
    await frames()
    expect(releaseFocus).not.toHaveBeenCalled()
    expect(t.cancels()).toBe(0)
  })

  it('does not release on a spread, which is not the way out', async () => {
    const releaseFocus = vi.fn()
    const t = setup({ current: 'murcia', canNavigate: false, releaseFocus })
    place(t.host, 'pointerdown', START)
    spread(t.host, RELEASE + 40)
    await frames()
    expect(releaseFocus).not.toHaveBeenCalled()
    expect(t.depth()).toBe(0)
  })

  it('refuses when nothing offers a release', async () => {
    const t = setup({ current: 'murcia', canNavigate: false, releaseFocus: null })
    place(t.host, 'pointerdown', WIDE)
    close(t.host, COMMIT_GROWTH * 0.5)
    await frames()
    expect(t.commits).toEqual([])
    expect(t.depth()).toBe(0)
    expect(t.cancels()).toBe(0)
  })

  it('is a fresh decision per sequence: a second close after lifting releases again', async () => {
    const releaseFocus = vi.fn()
    const t = setup({ current: 'murcia', canNavigate: false, releaseFocus })
    place(t.host, 'pointerdown', WIDE)
    close(t.host, RELEASE + 4)
    place(t.host, 'pointerup', WIDE - RELEASE - 4)

    place(t.host, 'pointerdown', WIDE)
    close(t.host, RELEASE + 4)
    await frames()
    expect(releaseFocus).toHaveBeenCalledTimes(2)
  })
})

describe.each(['earth', 'murcia'] as const)('shared pinch commitment in %s', (current) => {
  const sign = current === 'earth' ? 1 : -1
  const grip = current === 'earth' ? START : WIDE
  it('requires a new pair and deliberate growth, then spends its remaining movement', async () => {
    const t = setup({ current })
    place(t.host, 'pointerdown', grip)
    pinchFromTo(t.host, grip, grip + sign * COMMIT_GROWTH * 1.05, 20)
    await frames()
    expect(t.depth()).toBeCloseTo(1)
    expect(t.commits).toEqual([])
    place(t.host, 'pointerup', grip + sign * COMMIT_GROWTH * 1.05)
    place(t.host, 'pointerdown', grip)
    pinchFromTo(t.host, grip, grip + sign * (RELEASE - 1))
    await frames()
    expect(t.commits).toEqual([])
    pinchFromTo(t.host, grip + sign * (RELEASE - 1), grip + sign * RELEASE)
    await frames()
    expect(t.commits).toEqual([current === 'earth' ? 'enter-murcia' : 'exit-murcia'])
    t.context.current = current === 'earth' ? 'murcia' : 'earth'
    t.input.resetZoom()
    t.input.settle()
    await frames(450)
    pinchFromTo(t.host, grip + sign * RELEASE, grip + sign * COMMIT_GROWTH, 20)
    expect(t.depth()).toBe(0)
    expect(t.commits).toHaveLength(1)
  })

  it('cannot acquire commit permission by reaching saturation inside a pinch', async () => {
    const t = setup({ current })
    place(t.host, 'pointerdown', grip)
    pinchFromTo(t.host, grip, grip + sign * COMMIT_GROWTH * 0.8, 20)
    place(t.host, 'pointerup', grip + sign * COMMIT_GROWTH * 0.8)
    place(t.host, 'pointerdown', grip)
    pinchFromTo(t.host, grip, grip + sign * COMMIT_GROWTH * 0.5, 20)
    await frames()
    expect(t.depth()).toBeCloseTo(1)
    expect(t.commits).toEqual([])
  })
})
