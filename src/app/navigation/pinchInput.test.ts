// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { createNavigationInput } from './createNavigationInput'
import type { NavigationContext } from './createNavigationInput'
import { NAVIGATION_PINCH } from './navigationConfig'

// The pinch, through the REAL DOM path: window capture listeners, the synthetic
// cancel, the backlog transfer, the accumulator and the frame loop.
// `pinchClassifier.test.ts` proves the decision in isolation; this proves the
// wiring around it, which is where every bug in the gesture that came before
// this one actually lived.
//
// The assertion that matters most is not "a pinch navigates". It is
// `reachedTheWorld` — how many of the gesture's own moves were let through to
// the scene. Unlike the one-finger prototype this one never swallows, so the
// count must be EVERY move, always: Earth's orbit may not be made worse to add
// a second control, and here it does not even pay latency for the privilege.

/** The grip a gesture opens from. Deliberately not special — see below. */
const START = 150

/**
 * How far the fingers must separate to commit, in this environment.
 *
 * Derived from the viewport exactly as the module does, rather than written
 * down: the whole point of the 2026-08-26 change is that this is a property of
 * the SCREEN and not of the grip, and a test that hardcoded it would not notice
 * if that stopped being true.
 */
const SHORT_SIDE = Math.min(window.innerWidth, window.innerHeight)
const COMMIT_GROWTH = SHORT_SIDE * NAVIGATION_PINCH.commitFraction
const CLAIM = NAVIGATION_PINCH.claimGrowthPx

/**
 * Every input built by setup(), disposed after each test.
 *
 * In an afterEach rather than at the end of each test, because a failing expect
 * throws and would skip the cleanup — leaving live window listeners that see the
 * NEXT test's gestures. One real failure then cascades into a screenful of fake
 * ones, which is exactly what happened when the last generation of these tests
 * was written.
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
  })
  live.push(input)
  return {
    host,
    context,
    input,
    commits,
    world: () => reachedTheWorld,
    cancels: () => cancels,
    progress: () => Number(rail.style.getPropertyValue('--nav-progress')) || 0,
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
 * `fromDistance` is explicit rather than assumed to be START, and that matters:
 * a helper that always restarted from the opening grip would teleport the
 * fingers at the start of any second leg, and the accumulator would clamp that
 * jump at `maxEventTravelPx` — so a reversal test would measure the clamp
 * instead of the reversal.
 */
function pinchFromTo(
  host: HTMLElement,
  fromDistance: number,
  toDistance: number,
  steps = 8,
) {
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

/**
 * Carries both contacts sideways together, separation unchanged.
 *
 * This is Murcia's OTHER two-finger gesture — centroid rotation — and the only
 * thing in the application that competes with a pinch for the same fingers.
 */
function carry(host: HTMLElement, distance: number, steps = 8) {
  const half = START / 2
  for (let i = 1; i <= steps; i += 1) {
    const dx = (distance * i) / steps
    host.dispatchEvent(pe('pointermove', 400 - half + dx, 500, 1))
    host.dispatchEvent(pe('pointermove', 400 + half + dx, 500, 2))
  }
}

const frames = (ms = 120) => new Promise((r) => setTimeout(r, ms))

describe('a deliberate spread claims the gesture', () => {
  it('scrubs the world when two fingers spread on Earth', async () => {
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 0.4)
    await frames()
    expect(t.progress()).toBeCloseTo(0.4, 1)
  })

  it('lets every move reach the world, because it never swallows', async () => {
    // The acceptance criterion. The one-finger prototype bought its decline with
    // held-back moves; this one has nothing to buy, so it withholds nothing.
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 0.4, 8)
    await frames()
    expect(t.world()).toBe(16)
  })

  it('cancels Earth’s orbit exactly once per contact, at the claim', async () => {
    // Not swallowing means the first finger may be mid-drag. The cancel is how
    // that drag is ended, and it must not fire before the verdict lands.
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    expect(t.cancels()).toBe(0)
    spread(t.host, COMMIT_GROWTH * 0.4)
    await frames()
    expect(t.cancels()).toBe(2)
  })

  it('counts the growth spent proving intent, so there is no dead zone', async () => {
    // The backlog. Claiming costs `claimGrowthPx` of evidence, and if that
    // growth were discarded the scrub would open with a hole exactly that size.
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, CLAIM, 1)
    await frames()
    expect(t.progress()).toBeCloseTo(CLAIM / COMMIT_GROWTH, 2)
  })

  it('loses nothing to the per-event clamp when the claim overshoots', async () => {
    // Fingers move in steps, so the first sample past the claim is usually well
    // past it. Handing over the intended figure rather than the delivered one
    // dropped the difference silently, which reopened a smaller version of the
    // very dead zone the backlog exists to close.
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 0.6, 8)
    await frames(200)
    expect(t.progress()).toBeCloseTo(0.6, 1)
  })

  it('commits when the fingers open by the full commit growth', async () => {
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 1.05, 20)
    await frames(200)
    expect(t.commits).toEqual(['enter-murcia'])
  })

  it('costs the same effort from a tight grip as from a wide one', async () => {
    // THE regression this file exists to prevent. Under the old ratio signal a
    // 40px grip committed after 24px of growth and a 250px grip after 150px, so
    // the gesture people actually make — starting with the fingers close — was
    // the one that fired almost immediately.
    for (const grip of [30, 300]) {
      const t = setup({ current: 'earth' })
      place(t.host, 'pointerdown', grip)
      pinchFromTo(t.host, grip, grip + COMMIT_GROWTH * 0.5, 10)
      await frames()
      expect(t.progress()).toBeCloseTo(0.5, 1)
      live.pop()!.dispose()
      document.body.innerHTML = ''
    }
  })
})

describe('everything that is not a spread on Earth', () => {
  it('does not navigate on a close', async () => {
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, -CLAIM * 4, 20)
    await frames()
    expect(t.progress()).toBe(0)
    expect(t.commits).toEqual([])
  })

  it('does not navigate on two fingers resting still', async () => {
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, CLAIM - 4, 10)
    await frames()
    expect(t.progress()).toBe(0)
  })

  it('does not navigate on a single finger, however far it moves', async () => {
    const t = setup({ current: 'earth' })
    t.host.dispatchEvent(pe('pointerdown', 200, 700, 1))
    for (let i = 1; i <= 12; i += 1) {
      t.host.dispatchEvent(pe('pointermove', 200, 700 - i * 40, 1))
    }
    await frames()
    expect(t.progress()).toBe(0)
    expect(t.world()).toBe(12)
    expect(t.cancels()).toBe(0)
  })

  it('does not navigate from two contacts too close to be two fingers', async () => {
    const tight = NAVIGATION_PINCH.minStartDistancePx - 5
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', tight)
    pinchFromTo(t.host, tight, tight + COMMIT_GROWTH, 10)
    await frames()
    expect(t.progress()).toBe(0)
  })

  it('hands the gesture back when a third finger lands', async () => {
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 0.4)
    await frames()
    expect(t.progress()).toBeGreaterThan(0)

    t.host.dispatchEvent(pe('pointerdown', 600, 300, 3))
    await frames(600)
    expect(t.progress()).toBe(0)
    expect(t.commits).toEqual([])
  })

  it('does not navigate on a SPREAD in Murcia — that is the wrong way out', async () => {
    // Leaving Murcia is an ascent (ADR 006): the camera rises away from the
    // city, so closing is eligible and opening is not. The mirror of Earth,
    // decided by `towardOther` rather than by anything in the classifier.
    const t = setup({ current: 'murcia' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH, 20)
    await frames()
    expect(t.progress()).toBe(0)
    expect(t.cancels()).toBe(0)
  })

  it('is inert while something else owns the viewer’s attention', async () => {
    const t = setup({ current: 'earth', canNavigate: false })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH, 20)
    await frames()
    expect(t.progress()).toBe(0)
  })
})

/**
 * The grip a CLOSING gesture has to open from.
 *
 * Not a detail. The two directions are not equally bounded: a spread is limited
 * by the screen, but a close is limited by how far apart the fingers started —
 * you cannot close by more than you began with. Committing out of Murcia
 * therefore requires deliberately starting wide, where committing out of Earth
 * only requires starting somewhere.
 *
 * Symmetric in effort, asymmetric in what the hand has to do first, and that is
 * a question for the device rather than for this file.
 */
const WIDE = COMMIT_GROWTH * 1.1 + NAVIGATION_PINCH.minStartDistancePx

/** Closes the grip by `shrink` px from WIDE. */
function close(host: HTMLElement, shrink: number, steps = 8) {
  pinchFromTo(host, WIDE, WIDE - shrink, steps)
}

describe('Murcia — the mirror direction, and its rival', () => {
  it('scrubs toward Earth when two fingers close', async () => {
    const t = setup({ current: 'murcia' })
    place(t.host, 'pointerdown', WIDE)
    close(t.host, COMMIT_GROWTH * 0.4)
    await frames()
    expect(t.progress()).toBeCloseTo(0.4, 1)
  })

  it('commits back to Earth on a full close', async () => {
    const t = setup({ current: 'murcia' })
    place(t.host, 'pointerdown', WIDE)
    close(t.host, COMMIT_GROWTH * 1.02, 20)
    await frames(200)
    expect(t.commits).toEqual(['exit-murcia'])
  })

  it('hands the fingers back to rotation when they travel as a pair', async () => {
    // Two fingers moving sideways together, separation unchanged: that is the
    // city being turned, and it must stay the city being turned.
    const t = setup({ current: 'murcia' })
    place(t.host, 'pointerdown', START)
    carry(t.host, 120, 12)
    await frames()
    expect(t.progress()).toBe(0)
    expect(t.commits).toEqual([])
    // And nothing was taken from the controller on the way past.
    expect(t.cancels()).toBe(0)
  })

  it('declines a close that is really a turn', async () => {
    // The ambiguous case, and the one the asymmetry exists to settle. The pair
    // is carried further than the rival threshold while the separation closes;
    // the turn was already under way, so it keeps the fingers.
    const t = setup({ current: 'murcia' })
    place(t.host, 'pointerdown', START)
    const half = START / 2
    for (let i = 1; i <= 12; i += 1) {
      const dx = (140 * i) / 12
      const shrink = (COMMIT_GROWTH * 0.5 * i) / 12
      t.host.dispatchEvent(pe('pointermove', 400 - half + dx + shrink / 2, 500, 1))
      t.host.dispatchEvent(pe('pointermove', 400 + half + dx - shrink / 2, 500, 2))
    }
    await frames()
    expect(t.progress()).toBe(0)
    expect(t.cancels()).toBe(0)
  })

  it('still claims a clean close, because a rival that never moved is no rival', async () => {
    const t = setup({ current: 'murcia' })
    place(t.host, 'pointerdown', WIDE)
    close(t.host, COMMIT_GROWTH * 0.4)
    await frames()
    expect(t.progress()).toBeGreaterThan(0.2)
    expect(t.cancels()).toBe(2)
  })

  it('costs the same travel as leaving Earth did', async () => {
    // One commit distance, one mapping, both worlds. The only thing that differs
    // is which way the fingers go — and, per WIDE above, where they must start.
    const earth = setup({ current: 'earth' })
    place(earth.host, 'pointerdown', START)
    spread(earth.host, COMMIT_GROWTH * 0.5, 10)
    await frames()
    const earthProgress = earth.progress()
    live.pop()!.dispose()
    document.body.innerHTML = ''

    const murcia = setup({ current: 'murcia' })
    place(murcia.host, 'pointerdown', WIDE)
    close(murcia.host, COMMIT_GROWTH * 0.5, 10)
    await frames()
    expect(murcia.progress()).toBeCloseTo(earthProgress, 2)
  })
})

describe('direct manipulation', () => {
  it('holds its position while the fingers hold theirs', async () => {
    // THE property the keep-alive exists for. The accumulator retreats after
    // `idleGapSeconds` of silence because a wheel cannot say it has stopped —
    // but a pinch that is being held is not silence, it is a held input.
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 0.5)
    await frames()
    const held = t.progress()
    expect(held).toBeGreaterThan(0.1)

    await frames(1400)
    expect(t.progress()).toBeCloseTo(held, 3)
  })

  it('reverses when the fingers reverse', async () => {
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 0.6)
    await frames()
    const peak = t.progress()

    // Back toward the starting grip, CONTINUING from where the fingers are.
    // Growth in px is additive, so this arrives as plain negative pushes and
    // subtracts through the existing clamp at zero — no reversal code.
    pinchFromTo(t.host, START + COMMIT_GROWTH * 0.6, START + COMMIT_GROWTH * 0.15, 8)
    await frames()
    expect(t.progress()).toBeLessThan(peak * 0.5)
    expect(t.progress()).toBeCloseTo(0.15, 1)
  })

  it('returns to a literal zero when released below the commit', async () => {
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 0.5)
    await frames()
    expect(t.progress()).toBeGreaterThan(0.1)

    place(t.host, 'pointerup', START + COMMIT_GROWTH * 0.5)
    await frames(900)
    expect(t.progress()).toBe(0)
    expect(t.commits).toEqual([])
  })

  it('ends the gesture when one finger of two lifts', async () => {
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 0.5)
    await frames()

    t.host.dispatchEvent(pe('pointerup', 300, 500, 1))
    await frames(900)
    expect(t.progress()).toBe(0)
  })

  it('does not accumulate across two disconnected pinches', async () => {
    // A lift is an explicit abandon. Without that, three half-pinches in a row
    // would navigate — which is the accidental-warp objection the accumulator
    // exists to answer, arriving by a different road.
    const t = setup({ current: 'earth' })
    for (let i = 0; i < 3; i += 1) {
      place(t.host, 'pointerdown', START)
      spread(t.host, COMMIT_GROWTH * 0.4, 8)
      await frames()
      place(t.host, 'pointerup', START + COMMIT_GROWTH * 0.4)
      await frames(900)
      expect(t.progress()).toBe(0)
    }
    expect(t.commits).toEqual([])
  })
})

describe('teardown', () => {
  it('dispose removes the window listeners', async () => {
    const t = setup({ current: 'earth' })
    t.input.dispose()
    live.length = 0

    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH, 20)
    await frames()
    expect(t.progress()).toBe(0)
    expect(t.commits).toEqual([])
  })
})
