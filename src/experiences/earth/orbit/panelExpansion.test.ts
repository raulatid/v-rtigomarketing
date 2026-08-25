import { describe, expect, it } from 'vitest'
import { advanceExpansion, easeExpansion } from './panelExpansion'

const DURATION = 0.35

/** Runs `frames` steps of `delta` toward `target`, returning the final progress. */
function run(current: number, target: number, delta: number, frames: number): number {
  let value = current
  for (let i = 0; i < frames; i += 1) {
    value = advanceExpansion(value, target, delta, DURATION)
  }
  return value
}

describe('advancing the panel expansion', () => {
  it('opens to exactly 1 and stays there', () => {
    const opened = run(0, 1, DURATION / 4, 4)
    expect(opened).toBe(1)
    // One more frame must not push it past the end.
    expect(advanceExpansion(opened, 1, DURATION, 1)).toBe(1)
  })

  it('closes to exactly 0 and stays there', () => {
    const closed = run(1, 0, DURATION / 4, 4)
    expect(closed).toBe(0)
    expect(advanceExpansion(closed, 0, DURATION, 1)).toBe(0)
  })

  it('takes the same time to close as it took to open', () => {
    const step = DURATION / 7
    let frames = 0
    let value = 0
    while (value < 1 && frames < 100) {
      value = advanceExpansion(value, 1, step, DURATION)
      frames += 1
    }
    let back = 0
    while (value > 0 && back < 100) {
      value = advanceExpansion(value, 0, step, DURATION)
      back += 1
    }
    expect(back).toBe(frames)
  })

  it('lands on the target rather than overshooting on a huge delta', () => {
    // A backgrounded tab resuming. clampFrameDelta already guards the scene, but
    // the function must not depend on that to stay in range.
    expect(advanceExpansion(0, 1, 30, DURATION)).toBe(1)
    expect(advanceExpansion(1, 0, 30, DURATION)).toBe(0)
  })

  it('snaps to the target when the duration is zero or unusable', () => {
    expect(advanceExpansion(0, 1, 0.016, 0)).toBe(1)
    expect(advanceExpansion(1, 0, 0.016, Number.NaN)).toBe(0)
  })

  it('keeps NaN out of the uniform', () => {
    expect(advanceExpansion(Number.NaN, 1, 0.016, DURATION)).toBeGreaterThan(0)
    expect(Number.isFinite(advanceExpansion(Number.NaN, 1, 0.016, DURATION))).toBe(true)
  })
})

// The case a start-timestamp implementation gets wrong, and the one a user hits
// by clicking satellite B while A is still unfolding.
describe('reversing mid-transition', () => {
  it('turns around from where it is, without jumping to either end', () => {
    const half = advanceExpansion(0, 1, DURATION / 2, DURATION)
    expect(half).toBeGreaterThan(0)
    expect(half).toBeLessThan(1)

    const reversing = advanceExpansion(half, 0, DURATION / 10, DURATION)
    // Strictly below where it turned around: no snap to 1 first, no restart at 0.
    expect(reversing).toBeLessThan(half)
    expect(reversing).toBeGreaterThan(0)
  })

  it('needs only the remaining distance to finish reversing', () => {
    const step = DURATION / 10
    // Five steps out: halfway.
    const half = run(0, 1, step, 5)
    expect(half).toBeCloseTo(0.5, 5)

    // Five steps back must be exactly enough, and no more.
    expect(run(half, 0, step, 4)).toBeGreaterThan(0)
    expect(run(half, 0, step, 5)).toBe(0)
  })

  it('lets two panels advance from their own progress in the same frame', () => {
    // Satellite A caught 60% open, satellite B just selected.
    const a = advanceExpansion(0.6, 0, 0.05, DURATION)
    const b = advanceExpansion(0, 1, 0.05, DURATION)
    expect(a).toBeLessThan(0.6)
    expect(b).toBeGreaterThan(0)
    // Neither reads the other; they simply move in opposite directions.
    expect(a).toBeGreaterThan(0)
    expect(b).toBeLessThan(1)
  })
})

describe('easing the expansion', () => {
  it('pins both ends', () => {
    expect(easeExpansion(0)).toBe(0)
    expect(easeExpansion(1)).toBe(1)
  })

  it('is symmetric about the midpoint, so a reversal does not stumble', () => {
    for (const t of [0.1, 0.25, 0.4, 0.5]) {
      expect(easeExpansion(t) + easeExpansion(1 - t)).toBeCloseTo(1, 10)
    }
  })

  it('clamps out-of-range input instead of extrapolating', () => {
    expect(easeExpansion(-1)).toBe(0)
    expect(easeExpansion(2)).toBe(1)
    expect(easeExpansion(Number.NaN)).toBe(0)
  })
})
