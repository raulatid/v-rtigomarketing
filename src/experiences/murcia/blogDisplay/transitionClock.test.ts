import { describe, expect, it, vi } from 'vitest'
import { createTransitionClock } from './transitionClock'

// What this clock is protecting is a ROUTE CHANGE. `onCut` opens the blog, so
// every property below is really a statement about when a visitor may and may not
// be taken somewhere.

interface Harness {
  clock: ReturnType<typeof createTransitionClock>
  onCut: ReturnType<typeof vi.fn>
  onComplete: ReturnType<typeof vi.fn>
  /** Progress as it was on the frame `onCut` fired. */
  progressAtCut: () => number | null
}

function harness(duration = 3, cut = 1): Harness {
  let progressAtCut: number | null = null
  const onCut = vi.fn(() => {
    progressAtCut = clock.progress
  })
  const onComplete = vi.fn()
  const clock = createTransitionClock({
    duration: () => duration,
    cut: () => cut,
    onCut,
    onComplete,
  })
  return { clock, onCut, onComplete, progressAtCut: () => progressAtCut }
}

describe('the transition clock', () => {
  it('refuses a second start while one is in flight, which is the whole double-click guard', () => {
    const h = harness()
    expect(h.clock.start()).toBe(true)
    expect(h.clock.start()).toBe(false)
    h.clock.step(1)
    expect(h.clock.start()).toBe(false)
    // Two clicks in one frame start one approach, and one route change.
    expect(h.onCut).not.toHaveBeenCalled()
  })

  it('fires onCut exactly once, with progress pinned to the cut', () => {
    // Every frame overshoots its target by some amount. Pinning means the frame the
    // route changes on is painted at the progress the cover was computed for,
    // rather than at whatever the overshoot happened to be.
    const h = harness(1, 0.5)
    h.clock.start()
    h.clock.step(0.87)
    expect(h.onCut).toHaveBeenCalledTimes(1)
    expect(h.progressAtCut()).toBe(0.5)

    h.clock.step(0.87)
    expect(h.onCut).toHaveBeenCalledTimes(1)
  })

  it('keeps the overshoot in elapsed, so a run is never longer than its duration', () => {
    // The painted progress is pinned for one frame; the time that actually passed
    // is not rewound with it.
    const h = harness(1, 0.5)
    h.clock.start()
    h.clock.step(0.87)
    h.clock.step(0.13)
    expect(h.onComplete).toHaveBeenCalledTimes(1)
  })

  it('reaches completion at rest, not at the last frame of the run', () => {
    // A handler reading `progress` or `committed` from `onComplete` sees rest — the
    // approach's own `onComplete` hands the camera back, and it must not do so
    // while the clock still claims to own it.
    let seen: { progress: number; committed: boolean } | null = null
    const clock = createTransitionClock({
      duration: () => 1,
      cut: () => 1,
      onCut: () => {},
      onComplete: () => {
        seen = { progress: clock.progress, committed: clock.committed }
      },
    })
    clock.start()
    clock.step(2)
    expect(seen).toEqual({ progress: 0, committed: false })
  })

  it('cancel fires neither callback, because onCut is a navigation', () => {
    // A teardown that fired the cut would open the blog because the city was being
    // disposed under the visitor.
    const h = harness()
    h.clock.start()
    h.clock.step(1)
    h.clock.cancel()
    h.clock.step(10)
    expect(h.onCut).not.toHaveBeenCalled()
    expect(h.onComplete).not.toHaveBeenCalled()
    expect(h.clock.committed).toBe(false)
    expect(h.clock.progress).toBe(0)
  })

  it('refuses a duration that cannot be animated rather than substituting one', () => {
    // A transition nobody can see is a mistake in the limits, and dividing by zero
    // lands progress at Infinity.
    for (const duration of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const h = harness(duration)
      expect(h.clock.start(), `duration ${String(duration)}`).toBe(false)
      expect(h.clock.committed).toBe(false)
    }
  })

  it('ignores a non-finite or negative delta rather than jumping', () => {
    const h = harness(1, 1)
    h.clock.start()
    h.clock.step(Number.NaN)
    expect(h.clock.progress).toBe(0)
    h.clock.step(-5)
    expect(h.clock.progress).toBe(0)
    expect(h.onCut).not.toHaveBeenCalled()
  })

  it('does not advance before it is started', () => {
    const h = harness()
    h.clock.step(10)
    expect(h.clock.progress).toBe(0)
    expect(h.onCut).not.toHaveBeenCalled()
  })

  it('cuts on the first frame even when that frame finishes the whole run', () => {
    // Reduced motion takes this path deliberately: it steps the full duration in
    // one call, and the route change still has to happen.
    const h = harness(3, 1)
    h.clock.start()
    h.clock.step(3)
    expect(h.onCut).toHaveBeenCalledTimes(1)
    expect(h.onComplete).toHaveBeenCalledTimes(1)
  })
})
