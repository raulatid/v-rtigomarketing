// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNavigationInput } from './createNavigationInput'
import type { NavigationContext } from './createNavigationInput'
import { NAVIGATION_PINCH, NAVIGATION_ZOOM, commitTravelPx } from './navigationConfig'

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
 * Where a fraction of a full commit growth ends up, now that there are two
 * stages in series (`adr/014`).
 *
 * A full opening of the hand is still worth exactly one journey — `pinchGain` is
 * scaled against the total — but the journey is `towardTravelPx` of persistent
 * zoom followed by `commitDistancePx` of pushing against its limit. So most of
 * the gestures below now move the ZOOM and leave the accumulator at rest, and a
 * test that asserted a fraction of `--nav-progress` has to ask the other one.
 *
 * Derived rather than written down, for the reason `COMMIT_GROWTH` is: the split
 * between the two stages is explicitly tunable, and these tests are about the
 * wiring rather than about today's numbers.
 */
const BAND_FRACTION = NAVIGATION_ZOOM.towardTravelPx / commitTravelPx()

/** Zoom depth after opening the hand by `fraction` of a full commit growth. */
const depthAfter = (fraction: number) => Math.min(1, fraction / BAND_FRACTION)

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
    progress: () => Number(rail.style.getPropertyValue('--nav-progress')) || 0,
    /**
     * The persistent zoom, -1 .. +1, as the application would receive it.
     *
     * Where most of a pinch goes since `adr/014`. It is read through the real
     * callback rather than off the band, so a gesture that moved the camera
     * without telling anyone would still fail.
     */
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
  it('zooms the world in when two fingers spread on Earth', async () => {
    // 40% of a full journey, which is inside the zoom band: the camera moves and
    // the commit accumulator is not touched. This asserted a fraction of
    // `--nav-progress` until `adr/014` put the zoom in front of it.
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 0.4)
    await frames()
    expect(t.depth()).toBeCloseTo(depthAfter(0.4), 1)
    expect(t.progress()).toBe(0)
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
    // growth were discarded the zoom would open with a hole exactly that size —
    // the fingers would move and the world would not, through the part of the
    // gesture the viewer is watching most closely.
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, CLAIM, 1)
    await frames()
    expect(t.depth()).toBeCloseTo(depthAfter(CLAIM / COMMIT_GROWTH), 2)
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
    expect(t.depth()).toBeCloseTo(depthAfter(0.6), 1)
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
      expect(t.depth()).toBeCloseTo(depthAfter(0.5), 1)
      live.pop()!.dispose()
      document.body.innerHTML = ''
    }
  })
})

describe('everything that is not a spread on Earth', () => {
  it('zooms out on a close, and cannot navigate on it', async () => {
    // The other half of the band. Earth's transition end is fully zoomed IN, so
    // closing runs away from it and no amount of closing commits — but it is a
    // control now rather than a refusal, and it moves the camera.
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, -CLAIM * 4, 20)
    await frames()
    expect(t.progress()).toBe(0)
    expect(t.commits).toEqual([])
    expect(t.depth()).toBeLessThan(0)
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
    const zoomed = t.depth()
    expect(zoomed).toBeGreaterThan(0)

    t.host.dispatchEvent(pe('pointerdown', 600, 300, 3))
    await frames(600)
    expect(t.progress()).toBe(0)
    expect(t.commits).toEqual([])
    // The gesture is over; the camera is not undone. Handing the fingers back
    // means this stops READING them, not that it rewinds what they already did —
    // the zoom is a position, and the viewer put it there deliberately.
    expect(t.depth()).toBeCloseTo(zoomed, 6)

    // And nothing they do with three fingers moves it any further.
    spread(t.host, COMMIT_GROWTH * 0.8, 12)
    await frames()
    expect(t.depth()).toBeCloseTo(zoomed, 6)
  })

  it('zooms OUT on a spread in Murcia, and cannot navigate on it', async () => {
    // Leaving Murcia is an ascent (ADR 006): the camera rises away from the
    // city, so closing faces Earth and opening faces the ground. The mirror of
    // Earth, decided by `towardOther` rather than by anything in the classifier.
    //
    // `adr/014` changed what the wrong way COSTS, not what it achieves. It used
    // to be declined outright and do nothing at all; it is now the far half of
    // the zoom — a real control, claimed like any other, which is why the orbit
    // is cancelled here where it used to be left alone — and that end of the
    // band returns no overflow, so no amount of it navigates.
    const t = setup({ current: 'murcia' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH, 20)
    await frames()
    expect(t.progress()).toBe(0)
    expect(t.commits).toEqual([])
    expect(t.depth()).toBeLessThan(0)
    expect(t.cancels()).toBe(2)
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
  it('zooms out toward Earth when two fingers close', async () => {
    // Positive depth always faces the other world, which is why the same number
    // means "closer" on Earth and "further out" here: leaving a city is a climb.
    const t = setup({ current: 'murcia' })
    place(t.host, 'pointerdown', WIDE)
    close(t.host, COMMIT_GROWTH * 0.4)
    await frames()
    expect(t.depth()).toBeCloseTo(depthAfter(0.4), 1)
    expect(t.progress()).toBe(0)
  })

  it('will not leave on the same close that zoomed out, however hard it is pushed', async () => {
    // Leaving the city and zooming out of it are one motion, and a close is
    // bounded by how wide the fingers started — so before 2026-09-06 an ordinary
    // pinch-to-zoom-out ran off the end of the band and out of the world. One
    // pinch now parks at the far end and stays there.
    const t = setup({ current: 'murcia' })
    place(t.host, 'pointerdown', WIDE)
    close(t.host, COMMIT_GROWTH * 1.02, 20)
    await frames(200)
    expect(t.depth()).toBeCloseTo(1, 6)
    expect(t.progress()).toBe(0)
    expect(t.commits).toEqual([])
  })

  it('commits back to Earth on a SECOND close, which begins already parked', async () => {
    const t = setup({ current: 'murcia' })
    place(t.host, 'pointerdown', WIDE)
    close(t.host, COMMIT_GROWTH * 1.02, 20)
    place(t.host, 'pointerup', WIDE - COMMIT_GROWTH * 1.02)
    await frames(200)
    expect(t.commits).toEqual([])

    // The zoom is persistent, so this pair arms at the exit-facing end and
    // everything it has goes to the push.
    place(t.host, 'pointerdown', WIDE)
    close(t.host, COMMIT_GROWTH * 0.5, 12)
    await frames(200)
    expect(t.commits).toEqual(['exit-murcia'])
  })

  it('never leaks commit travel out of a gesture that may not commit', async () => {
    // The whole shape of the refusal, in one gesture: park at the end, push
    // against it, come back off it, park again, push again. The indicator must
    // read a literal zero at every one of those, because overflow that reached
    // the accumulator and then decayed would look identical a frame later and
    // would bank a commit the viewer never asked for.
    const t = setup({ current: 'murcia' })
    place(t.host, 'pointerdown', WIDE)

    const parked = COMMIT_GROWTH * BAND_FRACTION
    let d = WIDE
    const closeTo = (growth: number, steps = 10) => {
      const next = WIDE - growth
      pinchFromTo(t.host, d, next, steps)
      d = next
    }

    closeTo(parked * 0.5)
    await frames()
    expect(t.depth()).toBeCloseTo(0.5, 1)
    expect(t.progress()).toBe(0)

    closeTo(parked)
    await frames()
    expect(t.depth()).toBeCloseTo(1, 6)
    expect(t.progress()).toBe(0)

    // Pushing past the parked end.
    closeTo(parked + COMMIT_GROWTH * 0.25)
    await frames()
    expect(t.depth()).toBeCloseTo(1, 6)
    expect(t.progress()).toBe(0)

    // Back off it, and the zoom follows the fingers out again.
    closeTo(parked * 0.6)
    await frames()
    expect(t.depth()).toBeLessThan(0.9)
    expect(t.progress()).toBe(0)

    // Park a second time and push again, still inside the one gesture.
    closeTo(parked + COMMIT_GROWTH * 0.3)
    await frames()
    expect(t.depth()).toBeCloseTo(1, 6)
    expect(t.progress()).toBe(0)
    expect(t.commits).toEqual([])

    // Lifting banks nothing either, so the next pinch starts from a clean
    // accumulator and a full band.
    place(t.host, 'pointerup', d)
    await frames(900)
    expect(t.progress()).toBe(0)
    expect(t.depth()).toBeCloseTo(1, 6)

    place(t.host, 'pointerdown', WIDE)
    close(t.host, COMMIT_GROWTH * 0.5, 12)
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
    // is carried far further than the close can account for; the turn was
    // already under way, so it keeps the fingers.
    //
    // The close was half a journey here until 2026-09-06, which under the
    // allowance is no longer a turn at all — a hand that closes by 161px while
    // sliding 140px has done more closing than sliding, and calling that a
    // rotation is what made Murcia impossible to zoom. The gesture is now stated
    // as what its name says: mostly a carry, with the separation barely moving.
    const t = setup({ current: 'murcia' })
    place(t.host, 'pointerdown', START)
    const half = START / 2
    for (let i = 1; i <= 12; i += 1) {
      const dx = (140 * i) / 12
      const shrink = (COMMIT_GROWTH * 0.15 * i) / 12
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
    expect(t.depth()).toBeGreaterThan(0.2)
    expect(t.cancels()).toBe(2)
  })

  it('costs the same travel as leaving Earth did', async () => {
    // One journey, one mapping, both worlds. The only thing that differs is
    // which way the fingers go — and, per WIDE above, where they must start.
    //
    // Measured on the zoom rather than the indicator since `adr/014`, because
    // half a journey no longer reaches the indicator in either world. The
    // property is unchanged: identical growth buys identical travel.
    const earth = setup({ current: 'earth' })
    place(earth.host, 'pointerdown', START)
    spread(earth.host, COMMIT_GROWTH * 0.5, 10)
    await frames()
    const earthDepth = earth.depth()
    live.pop()!.dispose()
    document.body.innerHTML = ''

    const murcia = setup({ current: 'murcia' })
    place(murcia.host, 'pointerdown', WIDE)
    close(murcia.host, COMMIT_GROWTH * 0.5, 10)
    await frames()
    expect(murcia.depth()).toBeCloseTo(earthDepth, 2)
  })
})

/**
 * A growth that saturates the band and pushes some way past it.
 *
 * The `direct manipulation` cases below are all about the ACCUMULATOR — its
 * keep-alive, its retreat, its clamp at zero — and since `adr/014` the
 * accumulator does not see an event until the zoom band is full. Half a journey
 * no longer reaches it, so these ask for most of one.
 */
const PAST_BAND = BAND_FRACTION + 0.233

describe('direct manipulation', () => {
  it('holds its position while the fingers hold theirs', async () => {
    // THE property the keep-alive exists for. The accumulator retreats after
    // `idleGapSeconds` of silence because a wheel cannot say it has stopped —
    // but a pinch that is being held is not silence, it is a held input.
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * PAST_BAND)
    await frames()
    const held = t.progress()
    expect(held).toBeGreaterThan(0.1)

    await frames(1400)
    expect(t.progress()).toBeCloseTo(held, 3)
  })

  it('drains the commit before it gives back any zoom', async () => {
    // Reversing retraces the track backwards, so it unwinds in the reverse of
    // the order it was laid down: the banked commit goes first, and only what is
    // left over pulls the camera back out.
    //
    // Both halves matter. If the zoom gave way first the camera would retreat
    // while a nearly-full total sat invisible behind it, and the next nudge would
    // warp from a pose that no longer looked like the edge of anything.
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * PAST_BAND)
    await frames()
    expect(t.progress()).toBeGreaterThan(0.5)
    expect(t.depth()).toBeCloseTo(1, 6)

    // Back toward the starting grip, CONTINUING from where the fingers are.
    // Growth in px is additive, so this arrives as plain negative pushes and
    // subtracts through the existing clamp at zero — no reversal code.
    //
    // Part of the way first: enough to move the indicator, not enough to empty
    // it. The camera must not have budged.
    const banked = t.progress()
    pinchFromTo(t.host, START + COMMIT_GROWTH * PAST_BAND, START + COMMIT_GROWTH * 0.8, 8)
    await frames()
    expect(t.progress()).toBeLessThan(banked)
    expect(t.progress()).toBeGreaterThan(0)
    expect(t.depth()).toBeCloseTo(1, 6)

    // The rest of the way. Now that there is nothing banked, the same gesture
    // starts giving the zoom back.
    pinchFromTo(t.host, START + COMMIT_GROWTH * 0.8, START + COMMIT_GROWTH * 0.15, 8)
    await frames()
    expect(t.progress()).toBe(0)
    expect(t.depth()).toBeCloseTo(depthAfter(0.15), 1)
  })

  it('returns to a literal zero when released below the commit', async () => {
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * PAST_BAND)
    await frames()
    expect(t.progress()).toBeGreaterThan(0.1)

    place(t.host, 'pointerup', START + COMMIT_GROWTH * PAST_BAND)
    await frames(900)
    expect(t.progress()).toBe(0)
    expect(t.commits).toEqual([])
    // The indicator drained; the camera did not move an inch. That is the whole
    // of the "hold, then push" behaviour — during the commit stage the world is
    // pinned at the limit, so the retreat is something the viewer reads rather
    // than something they watch happen to the scene.
    expect(t.depth()).toBeCloseTo(1, 6)
  })

  it('ends the gesture when one finger of two lifts', async () => {
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * PAST_BAND)
    await frames()

    t.host.dispatchEvent(pe('pointerup', 300, 500, 1))
    await frames(900)
    expect(t.progress()).toBe(0)
  })

  it('does not bank a commit across two disconnected pinches', async () => {
    // A lift is an explicit abandon. Without that, a series of small pushes
    // against the zoom limit would navigate — which is the accidental-warp
    // objection the accumulator exists to answer, arriving by a different road.
    //
    // Scoped to the commit stage, which is the only stage that still refuses to
    // remember. The ZOOM is deliberately the opposite: it is a position the
    // viewer put the camera in, and it survives being let go of, which is why
    // the band is saturated first here rather than being part of what is
    // repeated.
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * BAND_FRACTION, 8)
    place(t.host, 'pointerup', START + COMMIT_GROWTH * BAND_FRACTION)
    await frames(900)
    expect(t.depth()).toBeCloseTo(1, 6)

    for (let i = 0; i < 3; i += 1) {
      place(t.host, 'pointerdown', START)
      spread(t.host, COMMIT_GROWTH * 0.15, 8)
      await frames()
      expect(t.progress()).toBeGreaterThan(0)
      place(t.host, 'pointerup', START + COMMIT_GROWTH * 0.15)
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

/**
 * The gestures a real hand makes.
 *
 * Every rival case above moves the two contacts perfectly symmetrically about a
 * fixed centroid, and so does `checks/navigation-feel.ts` §10. That is not what
 * a hand does: a thumb tends to stay where it is while the finger travels, a
 * grip drifts vertically as it closes, and a slow device delivers the whole
 * thing in two coalesced events instead of sixteen.
 *
 * Each of those moves the CENTROID as an unavoidable consequence of the pinch
 * itself — an anchored-thumb close of `g` moves it by `g/2` — which is the
 * signal the rival rule reads. The cases below are the ones the client reported
 * as "sometimes rotate, sometimes nothing happens".
 *
 * The last case is the boundary from the other side, and it matters as much as
 * the rest: whatever allowance the rule makes for a pinch's own centroid travel
 * must not swallow a real turn.
 *
 * Ownership is read here as `cancels()` — two synthetic cancels mean navigation
 * took the fingers, none means the city kept them. The yaw half of the same
 * question is asserted where a rig exists, in `checks/navigation-feel.ts` §10.
 */
describe('Murcia — asymmetric hands, which is what real ones are', () => {
  /** One contact anchored, the other doing all the travelling. */
  function anchoredClose(host: HTMLElement, shrink: number, steps = 8) {
    const right = 400 + WIDE / 2
    for (let i = 1; i <= steps; i += 1) {
      // Only the moving finger reports. An anchored thumb emits no pointermove,
      // so the centroid this module computes is stale by half the travel for as
      // long as the gesture lasts — it never gets the correcting event.
      host.dispatchEvent(pe('pointermove', right - (shrink * i) / steps, 500, 2))
    }
  }

  /** A symmetric close that also slides down the screen as it goes. */
  function driftingClose(host: HTMLElement, shrink: number, drift: number, steps = 16) {
    for (let i = 1; i <= steps; i += 1) {
      const half = (WIDE - (shrink * i) / steps) / 2
      const y = 500 + (drift * i) / steps
      host.dispatchEvent(pe('pointermove', 400 - half, y, 1))
      host.dispatchEvent(pe('pointermove', 400 + half, y, 2))
    }
  }

  /** Two contacts one above the other, `distance` apart, centred on x=400. */
  function placeVertical(host: HTMLElement, type: string, distance: number) {
    const half = distance / 2
    host.dispatchEvent(pe(type, 400, 500 - half, 1))
    host.dispatchEvent(pe(type, 400, 500 + half, 2))
  }

  /** Closes a vertical grip while carrying the whole pair sideways. */
  function carriedVerticalClose(
    host: HTMLElement,
    shrink: number,
    carryX: number,
    steps = 16,
  ) {
    for (let i = 1; i <= steps; i += 1) {
      const half = (WIDE - (shrink * i) / steps) / 2
      const x = 400 + (carryX * i) / steps
      host.dispatchEvent(pe('pointermove', x, 500 - half, 1))
      host.dispatchEvent(pe('pointermove', x, 500 + half, 2))
    }
  }

  it('zooms on a close made with an anchored thumb', async () => {
    // The ordinary phone pinch. The separation is ground truth and it is
    // closing; that the midpoint slid is arithmetic, not intent.
    const t = setup({ current: 'murcia' })
    place(t.host, 'pointerdown', WIDE)
    anchoredClose(t.host, COMMIT_GROWTH * 0.4)
    await frames()
    expect(t.cancels()).toBe(2)
    expect(t.depth()).toBeGreaterThan(0.2)
    expect(t.commits).toEqual([])
  })

  it('zooms on a close that drifts down the screen', async () => {
    // Murcia turns on the centroid's X and reads its Y as nothing at all, so a
    // vertical drift can only ever decline the zoom in favour of a rotation of
    // zero degrees. Whatever else happens, this must not be the gesture that
    // does nothing.
    const t = setup({ current: 'murcia' })
    place(t.host, 'pointerdown', WIDE)
    driftingClose(t.host, COMMIT_GROWTH * 0.4, 80)
    await frames()
    expect(t.cancels()).toBe(2)
    expect(t.depth()).toBeGreaterThan(0.2)
  })

  it('classifies a coarsely sampled close the same as a fine one', async () => {
    // A slow build coalesces pointermoves, so one event carries what sixteen
    // would have. The CLASSIFICATION must not depend on the sampling rate; the
    // pose may, since the per-event cap and its carry-forward are in play.
    const fine = setup({ current: 'murcia' })
    place(fine.host, 'pointerdown', WIDE)
    close(fine.host, COMMIT_GROWTH * 0.4, 16)
    await frames()
    expect(fine.cancels()).toBe(2)
    expect(fine.depth()).toBeGreaterThan(0)
    live.pop()!.dispose()
    document.body.innerHTML = ''

    const coarse = setup({ current: 'murcia' })
    place(coarse.host, 'pointerdown', WIDE)
    close(coarse.host, COMMIT_GROWTH * 0.4, 2)
    await frames()
    expect(coarse.cancels()).toBe(2)
    expect(coarse.depth()).toBeGreaterThan(0)
  })

  it('still hands a carried vertical grip back to the turn', async () => {
    // The boundary from the other side. The fingers are separated vertically,
    // so the pinch can account for no sideways centroid travel whatsoever — and
    // the pair is carried further than any allowance could excuse. This is a
    // turn, and it must stay one.
    const t = setup({ current: 'murcia' })
    placeVertical(t.host, 'pointerdown', WIDE)
    carriedVerticalClose(t.host, COMMIT_GROWTH * 0.4, 140)
    await frames()
    expect(t.cancels()).toBe(0)
    expect(t.progress()).toBe(0)
    expect(t.depth()).toBe(0)
    expect(t.commits).toEqual([])
  })
})

describe('the gesture that commits is spent', () => {
  it('stops reading the fingers at the commit, so the tail cannot zoom the new world', async () => {
    // The hand that commits is still moving. Its remaining travel arrives AFTER
    // the worlds have swapped, and `towardOther` signs it under the new one —
    // where the very spread that just entered Murcia means zoom IN.
    //
    // Resetting the accumulator at the commit was never enough, because the band
    // is fed from the same events and does not reset. Measured on a phone-shaped
    // build on 2026-09-06: the city was entered at depth -1, parked at the
    // closest the camera goes, with the whole band to cross before zooming out
    // did anything. Most of "zoom in Murcia does not work" was this.
    const t = setup({ current: 'earth' })
    place(t.host, 'pointerdown', START)
    spread(t.host, COMMIT_GROWTH * 1.05, 20)
    await frames(200)
    expect(t.commits).toEqual(['enter-murcia'])

    // The application swaps the world and resets the zoom at the cut; here the
    // only question is whether these fingers can still write anything at all.
    const parked = t.depth()
    t.context.current = 'murcia'
    const held = START + COMMIT_GROWTH * 1.05
    pinchFromTo(t.host, held, held + COMMIT_GROWTH * 0.6, 12)
    await frames()
    expect(t.depth()).toBeCloseTo(parked, 6)
    expect(t.commits).toEqual(['enter-murcia'])
  })
})

describe('a focused display is let go of by the gesture that would have left', () => {
  // The district's display holds the viewer and refuses navigation. On a phone
  // its close is a drawn glyph a finger can miss, so the pinch that means "out"
  // must still mean out: one level, not one world. Offered through
  // NavigationContext.releaseFocus; refused as before when nothing offers it.

  it('releases on a close in Murcia — once — and navigates nothing', async () => {
    const releaseFocus = vi.fn()
    const t = setup({ current: 'murcia', canNavigate: false, releaseFocus })
    place(t.host, 'pointerdown', WIDE)
    close(t.host, CLAIM + 4)
    expect(releaseFocus).toHaveBeenCalledTimes(1)
    // The fingers are taken from whatever was following them, as a claim does.
    expect(t.cancels()).toBe(2)

    // The rest of the same hand is spent: no zoom, no commit, however far.
    pinchFromTo(t.host, WIDE - CLAIM - 4, WIDE - COMMIT_GROWTH, 20)
    await frames()
    expect(releaseFocus).toHaveBeenCalledTimes(1)
    expect(t.commits).toEqual([])
    expect(t.depth()).toBe(0)
    expect(t.progress()).toBe(0)
  })

  it('does not release on a spread, which is not the way out', async () => {
    const releaseFocus = vi.fn()
    const t = setup({ current: 'murcia', canNavigate: false, releaseFocus })
    place(t.host, 'pointerdown', START)
    spread(t.host, CLAIM + 4)
    await frames()
    expect(releaseFocus).not.toHaveBeenCalled()
    expect(t.depth()).toBe(0)
    // And spent all the same: a spread that then reverses is not a fresh close.
    pinchFromTo(t.host, START + CLAIM + 4, START - CLAIM - 4)
    await frames()
    expect(releaseFocus).not.toHaveBeenCalled()
  })

  it('hands a carried pair to the turn, exactly as a navigating pinch would', async () => {
    const releaseFocus = vi.fn()
    const t = setup({ current: 'murcia', canNavigate: false, releaseFocus })
    place(t.host, 'pointerdown', START)
    carry(t.host, 30)
    await frames()
    expect(releaseFocus).not.toHaveBeenCalled()
    expect(t.cancels()).toBe(0)
  })

  it('is a fresh decision per sequence: a second close after lifting releases again', async () => {
    const releaseFocus = vi.fn()
    const t = setup({ current: 'murcia', canNavigate: false, releaseFocus })
    place(t.host, 'pointerdown', WIDE)
    close(t.host, CLAIM + 4)
    place(t.host, 'pointerup', WIDE - CLAIM - 4)
    place(t.host, 'pointerdown', WIDE)
    close(t.host, CLAIM + 4)
    expect(releaseFocus).toHaveBeenCalledTimes(2)
  })

  it('refuses as before when the attention-holder offers no release', async () => {
    const t = setup({ current: 'murcia', canNavigate: false, releaseFocus: null })
    place(t.host, 'pointerdown', WIDE)
    close(t.host, COMMIT_GROWTH, 20)
    await frames()
    expect(t.cancels()).toBe(0)
    expect(t.commits).toEqual([])
    expect(t.progress()).toBe(0)
  })
})
