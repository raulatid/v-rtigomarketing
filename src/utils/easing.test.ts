import { describe, it, expect } from 'vitest'
import {
  clamp01,
  cinematicSpeed,
  cinematicTravel,
  lerp,
  lerpVec3,
  narrowPeak,
  smootherstep,
} from './easing'

const SAMPLES = Array.from({ length: 201 }, (_, i) => i / 200)

describe('cinematicTravel', () => {
  it('starts at rest and arrives fully', () => {
    // The endpoints are what the warp depends on: a curve that does not reach 1
    // leaves the camera short of its arriving pose, permanently.
    expect(cinematicTravel(0)).toBe(0)
    expect(cinematicTravel(1)).toBe(1)
  })

  it('never goes backwards', () => {
    // Monotonicity rather than sampled values: a non-monotonic position curve
    // makes the camera reverse mid-warp, which no endpoint check would catch.
    for (const [i, t] of SAMPLES.slice(1).entries()) {
      expect(cinematicTravel(t)).toBeGreaterThanOrEqual(cinematicTravel(SAMPLES[i]))
    }
  })

  it('is symmetric about the midpoint', () => {
    // warpTransition.transitionLeg splits on the eased value while the scene cut
    // keys off raw progress. The two agree ONLY because this curve is symmetric,
    // and that agreement is inherited deliberately rather than derived.
    for (const t of SAMPLES) {
      expect(cinematicTravel(t)).toBeCloseTo(1 - cinematicTravel(1 - t), 10)
    }
    expect(cinematicTravel(0.5)).toBeCloseTo(0.5, 10)
  })

  it('clamps its input rather than extrapolating', () => {
    expect(cinematicTravel(-1)).toBe(0)
    expect(cinematicTravel(2)).toBe(1)
  })
})

describe('cinematicSpeed', () => {
  const peak = 0.5
  const width = 0.34

  it('peaks at the peak and is silent outside the width', () => {
    expect(cinematicSpeed(peak, peak, width)).toBe(1)
    expect(cinematicSpeed(peak - width, peak, width)).toBe(0)
    expect(cinematicSpeed(peak + width, peak, width)).toBe(0)
  })

  it('stays within 0..1 everywhere', () => {
    for (const t of SAMPLES) {
      const v = cinematicSpeed(t, peak, width)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('is symmetric about its peak', () => {
    for (const d of [0.05, 0.1, 0.2, 0.33]) {
      expect(cinematicSpeed(peak - d, peak, width)).toBeCloseTo(
        cinematicSpeed(peak + d, peak, width),
        10,
      )
    }
  })
})

describe('narrowPeak', () => {
  const centre = 0.5
  const width = 0.12

  it('reaches full cover at the centre and nothing at the edges', () => {
    expect(narrowPeak(centre, centre, width)).toBe(1)
    expect(narrowPeak(centre - width, centre, width)).toBe(0)
    expect(narrowPeak(centre + width, centre, width)).toBe(0)
  })

  it('is narrower than the speed bell at the shipped widths', () => {
    // The nested widths are the design (position full, speed +/-0.34, flash
    // +/-0.17): a flash as wide as the surge reads as a dissolve rather than a
    // flicker.
    expect(narrowPeak(0.5 + 0.2, 0.5, 0.17)).toBe(0)
    expect(cinematicSpeed(0.5 + 0.2, 0.5, 0.34)).toBeGreaterThan(0)
  })
})

describe('smootherstep', () => {
  it('pins its endpoints and stays inside them', () => {
    expect(smootherstep(0, 1, 0)).toBe(0)
    expect(smootherstep(0, 1, 1)).toBe(1)
    for (const t of SAMPLES) {
      const v = smootherstep(0, 1, t)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('has zero first derivative at both edges', () => {
    // That flatness is the whole reason this is smootherstep rather than a
    // lerp: it is what keeps the FOV surge and the flash from starting with a
    // visible kick.
    const h = 1e-4
    expect(smootherstep(0, 1, h) / h).toBeLessThan(1e-3)
    expect((1 - smootherstep(0, 1, 1 - h)) / h).toBeLessThan(1e-3)
  })

  it('degenerates in three different ways when the two edges are equal', () => {
    // Recorded as CURRENT BEHAVIOUR, not endorsed as a contract — and it is
    // stranger than "it returns NaN", which is what plan 000 expected.
    //
    // (x - edge) / 0 is signed: below the edge it is -Infinity, above it is
    // +Infinity, and exactly ON it is 0/0. clamp01 turns the first two into a
    // clean 0 and 1, so the function behaves like a step edge — and only the
    // exact hit produces NaN, because Math.min/Math.max propagate it.
    //
    // So the hazard is not "degenerate edges are broken". It is that they work
    // convincingly except on the one input a caller is most likely to pass: the
    // edge itself. A NaN there goes straight into a camera pose without an error.
    expect(smootherstep(0.5, 0.5, 0)).toBe(0)
    expect(smootherstep(0.5, 0.5, 1)).toBe(1)
    expect(Number.isNaN(smootherstep(0.5, 0.5, 0.5))).toBe(true)

    // Unreachable from the shipped call sites — cinematicSpeed and narrowPeak
    // both pass the literals (0, 1) — so this is a latent trap for the next
    // caller rather than a live bug. If one ever needs a degenerate pair, the
    // fix is a guard inside smootherstep, and this test changes with it.
    expect(Number.isNaN(smootherstep(1, 1, 1))).toBe(true)
  })
})

describe('clamp01 and lerp', () => {
  it('clamps to the unit interval', () => {
    expect(clamp01(-0.5)).toBe(0)
    expect(clamp01(1.5)).toBe(1)
    expect(clamp01(0.25)).toBe(0.25)
  })

  it('lerps the endpoints exactly', () => {
    // Exactly, not approximately: `lerp(a, b, 1)` returning b - epsilon leaves
    // every animated value fractionally short of its target at rest.
    expect(lerp(10, 20, 0)).toBe(10)
    expect(lerp(10, 20, 1)).toBe(20)
    expect(lerp(10, 20, 0.5)).toBe(15)
  })

  it('lerps each component of a vector independently', () => {
    expect(lerpVec3([0, 0, 0], [2, 4, 6], 0.5)).toEqual([1, 2, 3])
    expect(lerpVec3([1, 2, 3], [4, 5, 6], 0)).toEqual([1, 2, 3])
    expect(lerpVec3([1, 2, 3], [4, 5, 6], 1)).toEqual([4, 5, 6])
  })
})
