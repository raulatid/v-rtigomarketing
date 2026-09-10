import { describe, expect, it } from 'vitest'
import { satelliteAssemblyScale } from './satelliteScale'
import { ORBIT_CONFIG } from './orbitConfig'

// The factor that makes the satellite two sizes. `isPhoneViewport`'s own
// behaviour is asserted in camera/closeUpFraming.test.ts; what is asserted here
// is that the factor is DERIVED from the two authored sizes rather than written
// out, and that the phone is the unscaled one.

describe('satelliteAssemblyScale', () => {
  it('leaves the phone at the authored size', () => {
    // 1 exactly, not "about 1": `modelSize` and every constant derived from it
    // are tuned against the phone, so the phone must get them untouched. A
    // factor of 0.999 here would be a silent retune of the shipped size.
    expect(satelliteAssemblyScale(393, 852), 'portrait').toBe(1)
    expect(satelliteAssemblyScale(852, 393), 'landscape').toBe(1)
  })

  it('shrinks a wide viewport to the wide size, and by exactly the ratio', () => {
    // Derived rather than restated: a test carrying 0.818 would agree with a
    // future retune of either size and assert nothing. The property is that the
    // scale takes the assembly from one authored size to the other.
    const { modelSize, wideModelSize } = ORBIT_CONFIG.satellite
    const factor = satelliteAssemblyScale(1600, 900)
    expect(factor).toBeCloseTo(wideModelSize / modelSize, 12)
    expect(modelSize * factor).toBeCloseTo(wideModelSize, 12)
  })

  it('never returns something that would collapse or invert a satellite', () => {
    // The value is written straight into a group scale, so a zero or a negative
    // would put six satellites at a point or inside out. Guarded across the
    // viewports the site actually meets, including the unmeasured one.
    for (const [w, h] of [
      [0, 0],
      [393, 852],
      [852, 393],
      [768, 1024],
      [1600, 900],
      [3840, 2160],
    ] as const) {
      const factor = satelliteAssemblyScale(w, h)
      expect(Number.isFinite(factor), `${w}x${h}`).toBe(true)
      expect(factor, `${w}x${h}`).toBeGreaterThan(0)
      expect(factor, `${w}x${h}`).toBeLessThanOrEqual(1)
    }
  })
})
