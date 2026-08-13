import { describe, it, expect } from 'vitest'
import { fibonacciSpherePoints, pointSeed } from './fibonacciSphere'

function radii(positions: Float32Array): number[] {
  const out: number[] = []
  for (let i = 0; i < positions.length; i += 3) {
    out.push(Math.hypot(positions[i], positions[i + 1], positions[i + 2]))
  }
  return out
}

describe('fibonacciSpherePoints', () => {
  it('returns three components per point', () => {
    expect(fibonacciSpherePoints(64, 10)).toHaveLength(64 * 3)
    expect(fibonacciSpherePoints(1, 10)).toHaveLength(3)
    expect(fibonacciSpherePoints(0, 10)).toHaveLength(0)
  })

  it('puts every point on the shell when jitter is zero', () => {
    // This is the non-occlusion guarantee in its provable form: with an exact
    // shell enclosing the camera, no point can pass in front of the Earth. It is
    // asserted across the parameter space rather than at the shipped defaults,
    // because a break here is intermittent by nature — a handful of points at
    // some orbit angles, which no single screenshot reliably catches.
    for (const count of [1, 2, 7, 350, 3500]) {
      for (const radius of [1, 22, 180, 1000]) {
        for (const r of radii(fibonacciSpherePoints(count, radius))) {
          expect(r).toBeCloseTo(radius, 3)
        }
      }
    }
  })

  it('keeps jittered points inside their stated fraction of the radius', () => {
    const jitter = 0.15
    const radius = 180
    for (const r of radii(fibonacciSpherePoints(2000, radius, jitter))) {
      expect(r).toBeGreaterThanOrEqual(radius * (1 - jitter) - 1e-3)
      expect(r).toBeLessThanOrEqual(radius * (1 + jitter) + 1e-3)
    }
  })

  it('survives count === 1 without producing NaN', () => {
    // count - 1 is 0, and the division by it produced NaN for every component —
    // a single point that silently vanished rather than sitting at the pole. The
    // `|| 1` guard is what stops it, and only the debug sliders' minimums keep
    // that input unreachable today.
    const single = fibonacciSpherePoints(1, 5)
    for (const value of single) expect(Number.isNaN(value)).toBe(false)
    expect(Math.hypot(single[0], single[1], single[2])).toBeCloseTo(5, 6)
  })

  it('is deterministic across calls', () => {
    // Both consumers want an identical field on every load, and a stable field
    // is what makes a screenshot diffable at all.
    expect(Array.from(fibonacciSpherePoints(500, 12, 0.1))).toEqual(
      Array.from(fibonacciSpherePoints(500, 12, 0.1)),
    )
  })

  it('spreads points over the full range of latitudes', () => {
    // A distribution collapsed onto one hemisphere would still satisfy the
    // radius bound above while looking obviously wrong.
    const positions = fibonacciSpherePoints(1000, 1)
    const ys: number[] = []
    for (let i = 1; i < positions.length; i += 3) ys.push(positions[i])
    expect(Math.min(...ys)).toBeCloseTo(-1, 2)
    expect(Math.max(...ys)).toBeCloseTo(1, 2)
  })
})

describe('pointSeed', () => {
  it('stays in [0, 1)', () => {
    for (let i = 0; i < 5000; i += 1) {
      const seed = pointSeed(i)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThan(1)
    }
  })

  it('is deterministic per index', () => {
    expect(pointSeed(42)).toBe(pointSeed(42))
  })

  it('does not repeat trivially between neighbours', () => {
    // Bucketing points into magnitude tiers with a seed that varies slowly would
    // band the sky into stripes rather than mixing the tiers.
    const seeds = Array.from({ length: 200 }, (_, i) => pointSeed(i))
    const unique = new Set(seeds.map((s) => s.toFixed(6)))
    expect(unique.size).toBeGreaterThan(190)
  })
})
