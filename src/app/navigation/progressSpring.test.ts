import { describe, it, expect } from 'vitest'
import { createProgressSpring } from './progressSpring'
import { NAVIGATION_SPRING } from './navigationConfig'

// What this file asserts: that the painted value is elastic, terminating and
// stall-safe. What it deliberately does not: anything about accumulation — the
// spring never decides WHERE progress goes, only how the indicator travels
// there, and `navigationGesture.test.ts` owns the destination.
//
// Limits are read from the shipped config rather than restated, the same rule
// `navigationGesture.test.ts` cites: a mirrored copy of a tuned number is a
// test that keeps passing against a value the product no longer uses.

const LIMITS = NAVIGATION_SPRING

/** Steps at a steady 60fps toward a constant target, recording every frame. */
function drive(
  spring: ReturnType<typeof createProgressSpring>,
  target: number,
  seconds: number,
) {
  const dt = 1 / 60
  const values: number[] = []
  for (let t = 0; t < seconds; t += dt) values.push(spring.step(target, dt))
  return values
}

describe('convergence', () => {
  it('reaches a constant target and then returns it EXACTLY', () => {
    const spring = createProgressSpring(LIMITS)
    const values = drive(spring, 0.5, 2)
    expect(values[values.length - 1]).toBe(0.5)
    expect(spring.settled(0.5)).toBe(true)
  })

  it('returns to a literal 0 after the target drops, not an asymptote', () => {
    // The e2e contract: `--nav-progress` is polled to be exactly 0 after a
    // flick decays. An exponential tail that never lands would fail it.
    const spring = createProgressSpring(LIMITS)
    drive(spring, 0.4, 1)
    const values = drive(spring, 0, 2)
    expect(values[values.length - 1]).toBe(0)
    expect(spring.settled(0)).toBe(true)
  })
})

describe('elasticity', () => {
  it('overshoots a step subtly with the shipped damping', () => {
    const spring = createProgressSpring(LIMITS)
    const peak = Math.max(...drive(spring, 1, 2))
    // Under-damped: past the target, but only just — this is polish, not a toy.
    expect(peak).toBeGreaterThan(1.005)
    expect(peak).toBeLessThan(1.12)
  })

  it('does not overshoot at all when critically damped (reduced motion)', () => {
    const spring = createProgressSpring({
      ...LIMITS,
      damping: LIMITS.reducedMotionDamping,
    })
    const peak = Math.max(...drive(spring, 1, 2))
    expect(peak).toBeLessThanOrEqual(1)
  })
})

describe('stall safety', () => {
  it('survives a single 5-second frame without diverging', () => {
    // A hidden tab hands the next frame a huge dt. The integration must clamp,
    // not explode — the same hazard the accumulator's catchUp guards.
    const spring = createProgressSpring(LIMITS)
    const value = spring.step(1, 5)
    expect(Number.isFinite(value)).toBe(true)
    expect(value).toBeGreaterThanOrEqual(0)
    expect(value).toBeLessThanOrEqual(1.12)
  })
})

describe('reset', () => {
  it('snaps to the given value with no motion left', () => {
    const spring = createProgressSpring(LIMITS)
    drive(spring, 1, 0.2)
    spring.reset(0)
    expect(spring.settled(0)).toBe(true)
    expect(spring.step(0, 1 / 60)).toBe(0)
  })
})
