import { describe, it, expect } from 'vitest'
import { shortestYawDelta } from './CameraFlight'

// The delta is added to CameraRig's UNBOUNDED yaw, which never wraps — wrapping
// would make a rotation past the seam jump, and the smoothing that drives it
// reads the value as continuous. So the only thing that keeps a flight from
// taking the long way round is this function.
describe('shortestYawDelta', () => {
  it('never asks for more than half a turn', () => {
    for (let current = -720; current <= 720; current += 7) {
      for (let target = -720; target <= 720; target += 11) {
        expect(Math.abs(shortestYawDelta(current, target))).toBeLessThanOrEqual(180)
      }
    }
  })

  it('crosses the seam the short way', () => {
    // The case the function exists for: 350 -> 10 is +20, not -340.
    expect(shortestYawDelta(350, 10)).toBeCloseTo(20, 10)
    expect(shortestYawDelta(10, 350)).toBeCloseTo(-20, 10)
  })

  it('gets the sign right on either side', () => {
    expect(shortestYawDelta(0, 90)).toBeCloseTo(90, 10)
    expect(shortestYawDelta(0, -90)).toBeCloseTo(-90, 10)
    expect(shortestYawDelta(90, 0)).toBeCloseTo(-90, 10)
  })

  it('settles the exact half turn at -180 rather than by floating-point luck', () => {
    // Equally short in both directions; the half-open range [-180, 180) picks.
    expect(shortestYawDelta(0, 180)).toBe(-180)
    expect(shortestYawDelta(180, 0)).toBe(-180)
  })

  it('is a no-op when the target is already the current heading', () => {
    expect(shortestYawDelta(37, 37)).toBe(0)
    expect(shortestYawDelta(37, 37 + 360)).toBe(0)
  })

  it('preserves a wound-up yaw', () => {
    // 730 degrees of accumulated turning stays wound up: the delta describes the
    // move, not an absolute heading, so adding it never unwinds the rig.
    const woundUp = 730
    const delta = shortestYawDelta(woundUp, 10)
    expect(woundUp + delta).toBeCloseTo(730, 10)
  })

  it('lands on the target heading, modulo a full turn', () => {
    for (let current = -400; current <= 400; current += 13) {
      for (const target of [0, 45, 137, -95, 359]) {
        const landed = current + shortestYawDelta(current, target)
        const difference = ((landed - target) % 360 + 360) % 360
        expect(Math.min(difference, 360 - difference)).toBeLessThan(1e-9)
      }
    }
  })
})
