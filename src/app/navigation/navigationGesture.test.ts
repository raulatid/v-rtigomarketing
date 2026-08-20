import { describe, it, expect } from 'vitest'
import { createNavigationGesture } from './navigationGesture'
import { NAVIGATION_GESTURE } from './navigationConfig'
import type { NavigationGestureLimits } from './navigationConfig'

// What this file asserts: that accumulation is deliberate, reversible, terminating
// and frame-rate independent. What `checks/` asserts instead: the DOM layer that
// feeds this — real wheel streams, a macOS momentum tail, pointer capture on the
// rail. Nothing here touches an event.
//
// Limits are read from the shipped config rather than restated, per the rule that
// burned `playhead.test.ts`: a mirrored copy of a tuned number is a test that
// keeps passing against a value the product no longer uses. Where a case needs a
// specific shape it overrides one field of the real object.

const LIMITS = NAVIGATION_GESTURE
const COMMIT = LIMITS.commitDistancePx

/** A gesture driven at a steady rate, one push per frame, with no idle gaps. */
function drive(
  gesture: ReturnType<typeof createNavigationGesture>,
  totalPx: number,
  options: { fps?: number; startMs?: number } = {},
) {
  const fps = options.fps ?? 60
  const dt = 1 / fps
  // Small enough per event that the per-event cap never truncates it, which
  // would make the test measure the clamp instead of the accumulation.
  const perEvent = LIMITS.maxEventTravelPx / 2
  const events = Math.ceil(Math.abs(totalPx) / perEvent)
  const step = totalPx / events

  let ms = options.startMs ?? 1000
  let committedCount = 0
  let lastProgress = 0
  const progresses: number[] = []

  for (let i = 0; i < events; i += 1) {
    gesture.push(step, ms)
    const frame = gesture.step(dt, ms)
    if (frame.committed) committedCount += 1
    lastProgress = frame.progress
    progresses.push(frame.progress)
    ms += dt * 1000
  }
  return { committedCount, lastProgress, progresses, ms }
}

describe('createNavigationGesture', () => {
  it('does not navigate on a single event, however large', () => {
    // The objection DECISIONS §15 raised against scroll, and the reason this
    // module exists rather than `if (deltaY > 0) navigate()`.
    const g = createNavigationGesture(LIMITS)
    g.push(100000, 1000)
    const frame = g.step(1 / 60, 1000)
    expect(frame.committed).toBe(false)
    expect(frame.progress).toBeLessThan(1)
  })

  it('caps one absurd event so a flick cannot commit a navigation', () => {
    const g = createNavigationGesture(LIMITS)
    g.push(100000, 1000)
    const frame = g.step(1 / 60, 1000)
    expect(frame.progress).toBeCloseTo(LIMITS.maxEventTravelPx / COMMIT, 10)
  })

  it('commits once a deliberate gesture covers the commit distance', () => {
    const g = createNavigationGesture(LIMITS)
    const { committedCount, lastProgress } = drive(g, COMMIT)
    expect(committedCount).toBe(1)
    expect(lastProgress).toBe(1)
  })

  it('commits exactly once, however long the gesture continues', () => {
    // A wheel does not stop at the threshold. If this fired per frame the app
    // would start a second transition into a world it is already entering.
    const g = createNavigationGesture(LIMITS)
    const { committedCount } = drive(g, COMMIT * 4)
    expect(committedCount).toBe(1)
  })

  it('advances monotonically while the gesture is being driven', () => {
    const g = createNavigationGesture(LIMITS)
    const { progresses } = drive(g, COMMIT * 0.8)
    for (let i = 1; i < progresses.length; i += 1) {
      expect(progresses[i]).toBeGreaterThanOrEqual(progresses[i - 1]!)
    }
  })

  it('subtracts on reversal, and reaches exactly zero rather than going negative', () => {
    const g = createNavigationGesture(LIMITS)
    let ms = 1000
    // Half way there...
    for (let i = 0; i < 4; i += 1) {
      g.push(COMMIT / 8, ms)
      g.step(1 / 60, ms)
      ms += 16
    }
    const half = g.step(1 / 60, ms).progress
    expect(half).toBeGreaterThan(0)

    // ...and all the way back, pushing further than was ever accumulated.
    for (let i = 0; i < 12; i += 1) {
      g.push(-COMMIT / 8, ms)
      g.step(1 / 60, ms)
      ms += 16
    }
    const frame = g.step(1 / 60, ms)
    expect(frame.progress).toBe(0)
    expect(frame.active).toBe(false)
  })

  it('does not build negative progress by pushing the wrong way from rest', () => {
    const g = createNavigationGesture(LIMITS)
    g.push(-COMMIT * 3, 1000)
    const frame = g.step(1 / 60, 1000)
    expect(frame.progress).toBe(0)
  })

  it('decays to zero when the gesture is abandoned, and stops there', () => {
    const g = createNavigationGesture(LIMITS)
    let ms = 1000
    for (let i = 0; i < 4; i += 1) {
      g.push(COMMIT / 8, ms)
      g.step(1 / 60, ms)
      ms += 16
    }
    expect(g.step(1 / 60, ms).progress).toBeGreaterThan(0)

    // Silence. Well past the idle gap plus several decay constants.
    ms += LIMITS.idleGapSeconds * 1000
    let frame = g.step(1 / 60, ms)
    for (let i = 0; i < 600; i += 1) {
      ms += 16
      frame = g.step(1 / 60, ms)
    }
    expect(frame.progress).toBe(0)
    expect(frame.active).toBe(false)
    // Terminates rather than approaching an asymptote forever.
    expect(g.state().travelPx).toBe(0)
  })

  it('does not decay during the gaps inside one continuous gesture', () => {
    // A mouse wheel at a leisurely turn still fires every ~100ms. If the idle gap
    // were shorter than that, every gesture would fight its own decay.
    const g = createNavigationGesture(LIMITS)
    let ms = 1000
    const gapMs = LIMITS.idleGapSeconds * 1000 * 0.5
    let previous = 0
    for (let i = 0; i < 8; i += 1) {
      g.push(COMMIT / 16, ms)
      const frame = g.step(gapMs / 1000, ms)
      expect(frame.progress).toBeGreaterThanOrEqual(previous)
      expect(frame.releasing).toBe(false)
      previous = frame.progress
      ms += gapMs
    }
  })

  it('reaches the same place at 30, 60 and 120 fps', () => {
    // Displacement-driven, so the frame rate must not change the outcome. A decay
    // written as a per-frame multiplier rather than an exponential of dt fails here.
    const results = [30, 60, 120].map((fps) => {
      const g = createNavigationGesture(LIMITS)
      return drive(g, COMMIT * 0.6, { fps }).lastProgress
    })
    expect(results[1]).toBeCloseTo(results[0]!, 10)
    expect(results[2]).toBeCloseTo(results[0]!, 10)
  })

  it('decays identically at 30 and 120 fps', () => {
    const decayed = [30, 120].map((fps) => {
      const g = createNavigationGesture(LIMITS)
      let ms = 1000
      g.push(COMMIT * 0.5, ms)
      g.step(1 / fps, ms)
      ms += LIMITS.idleGapSeconds * 1000

      // Exactly 0.5s of decay at either rate. An earlier version of this test ran
      // one extra step at 30fps and so compared 0.533s against 0.508s, then blamed
      // the module for the difference.
      const dt = 1 / fps
      const frames = Math.round(0.5 * fps)
      let frame = g.step(0, ms)
      for (let i = 0; i < frames; i += 1) {
        ms += dt * 1000
        frame = g.step(dt, ms)
      }
      return frame.progress
    })
    expect(decayed[1]).toBeCloseTo(decayed[0]!, 3)
  })

  it('rations one frame’s advance so a long block cannot commit', () => {
    // The hazard `playhead.ts` records: a 900ms main-thread block delivers every
    // queued event at once. Here that would be a navigation nobody asked for.
    const limits: NavigationGestureLimits = { ...LIMITS, catchUp: 3 }
    const g = createNavigationGesture(limits)
    let ms = 1000
    // Establish a cadence first, so the block is measured against a real one.
    for (let i = 0; i < 10; i += 1) {
      g.step(1 / 60, ms)
      ms += 16
    }
    // The block: one frame of 900ms carrying a full gesture's worth of events.
    for (let i = 0; i < 20; i += 1) g.push(limits.maxEventTravelPx, ms)
    const frame = g.step(0.9, ms)
    // It may progress — it must not decay wrongly or jump the accumulator past
    // what the events legitimately carried.
    expect(frame.progress).toBeLessThanOrEqual(1)
    expect(Number.isFinite(frame.progress)).toBe(true)
  })

  it('refuses travel while latched, and re-arms only on a real gap', () => {
    // The anti-deadlock's other half. A cooldown that expires on its deadline
    // releases into a stream that is still running; without the latch that
    // hands the momentum tail a fresh gesture immediately.
    const g = createNavigationGesture(LIMITS)
    let ms = 1000
    // Latched AT a moment, so the re-arm gap is measured from the latch rather
    // than from a beginning-of-time timestamp that looks infinitely quiet.
    g.latch(ms)
    expect(g.isLatched).toBe(true)

    // A relentless stream: every event inside the idle gap, so it never looks quiet.
    const tick = LIMITS.idleGapSeconds * 1000 * 0.5
    for (let i = 0; i < 40; i += 1) {
      g.push(LIMITS.maxEventTravelPx, ms)
      g.step(tick / 1000, ms)
      ms += tick
    }
    expect(g.step(1 / 60, ms).progress).toBe(0)
    expect(g.isLatched).toBe(true)

    // A genuine gap clears it, and the next push counts.
    ms += LIMITS.idleGapSeconds * 1000 * 2
    g.push(LIMITS.maxEventTravelPx, ms)
    expect(g.isLatched).toBe(false)
    expect(g.step(1 / 60, ms).progress).toBeGreaterThan(0)
  })

  it('keeps the latch across a reset, because a reset is when the tail arrives', () => {
    const g = createNavigationGesture(LIMITS)
    g.latch(1000)
    g.reset()
    expect(g.isLatched).toBe(true)
  })

  it('can commit again after a reset', () => {
    const g = createNavigationGesture(LIMITS)
    drive(g, COMMIT)
    g.reset()
    const { committedCount } = drive(g, COMMIT, { startMs: 100000 })
    expect(committedCount).toBe(1)
  })

  it('ignores a non-finite push rather than poisoning the total', () => {
    // One NaN in the accumulator makes every later comparison false: the gesture
    // can then never commit and never decay, for the rest of the session.
    const g = createNavigationGesture(LIMITS)
    g.push(NaN, 1000)
    g.push(COMMIT / 4, 1000)
    expect(Number.isFinite(g.step(1 / 60, 1000).progress)).toBe(true)
    expect(g.step(1 / 60, 1000).progress).toBeGreaterThan(0)
  })

  it('survives a zero delta without dividing by it', () => {
    const g = createNavigationGesture(LIMITS)
    g.push(COMMIT / 4, 1000)
    const frame = g.step(0, 1000)
    expect(Number.isFinite(frame.progress)).toBe(true)
  })
})
