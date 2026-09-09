import { describe, expect, it } from 'vitest'
import { BLOG_TRANSITION, cinematicTravel, smootherstep } from './blogTransition'

// The return journey is not a second curve. It is the approach read with its
// endpoints swapped, and that is only the exact time-reversal if `cinematicTravel`
// is odd-symmetric about (0.5, 0.5). The lab's docblock claimed the opposite for a
// while and shipped the return on the corrected proof; this is that proof as an
// assertion, so the claim cannot quietly stop being true.

const POWERS = [1, 1.4, BLOG_TRANSITION.accelerationPower, 2, 3]

describe('cinematicTravel', () => {
  it('is odd-symmetric about (0.5, 0.5), which is what the return rests on', () => {
    for (const power of POWERS) {
      for (let x = 0; x <= 1.0001; x += 0.05) {
        const forward = cinematicTravel(x, power)
        const reversed = cinematicTravel(1 - x, power)
        expect(reversed, `power ${power} at x=${x.toFixed(2)}`).toBeCloseTo(1 - forward, 10)
      }
    }
  })

  it('starts at 0, ends at 1 and never turns back', () => {
    for (const power of POWERS) {
      expect(cinematicTravel(0, power)).toBe(0)
      expect(cinematicTravel(1, power)).toBe(1)

      let previous = -Infinity
      for (let x = 0; x <= 1.0001; x += 0.01) {
        const value = cinematicTravel(x, power)
        expect(value, `power ${power} at x=${x.toFixed(2)}`).toBeGreaterThanOrEqual(previous)
        previous = value
      }
    }
  })

  it('clamps its input rather than extrapolating past the endpoints', () => {
    // The clock cannot hand it an out-of-range progress, but a curve that
    // extrapolates would put the camera past the panel if one ever did — and past
    // the panel is inside it.
    expect(cinematicTravel(-4, 1.7)).toBe(0)
    expect(cinematicTravel(9, 1.7)).toBe(1)
  })

  it('spends more of the distance early than a linear travel does', () => {
    // The shape the number is chosen for: slow off the mark, quick through the
    // middle, a settle at the end. Linear (power 1) is the boundary case.
    expect(cinematicTravel(0.25, BLOG_TRANSITION.accelerationPower)).toBeLessThan(0.25)
    expect(cinematicTravel(0.75, BLOG_TRANSITION.accelerationPower)).toBeGreaterThan(0.75)
  })
})

describe('smootherstep', () => {
  it('clamps outside its edges and is symmetric between them', () => {
    expect(smootherstep(0.2, 0.8, 0.1)).toBe(0)
    expect(smootherstep(0.2, 0.8, 0.9)).toBe(1)
    expect(smootherstep(0.2, 0.8, 0.5)).toBeCloseTo(0.5, 10)
    expect(smootherstep(0.2, 0.8, 0.35)).toBeCloseTo(1 - smootherstep(0.2, 0.8, 0.65), 10)
  })

  it('survives a degenerate window rather than dividing by zero', () => {
    // Reachable: `handoffFade` of 0 with `handoffStart` at 1 collapses the window,
    // and a NaN opacity would leave the cover transparent over the one frame it
    // must be opaque.
    expect(Number.isFinite(smootherstep(0.5, 0.5, 0.5))).toBe(true)
  })
})

describe('the shipped limits', () => {
  it('starts the cover before the cut and the screen fade before the cover', () => {
    // The order these three happen in is the whole choreography: the panel stops
    // being a screen, then the page rises over it, then the route changes.
    expect(BLOG_TRANSITION.screenFadeStart).toBeLessThan(BLOG_TRANSITION.handoffStart)
    expect(BLOG_TRANSITION.handoffStart).toBeLessThan(1)
  })

  it('over-fills the frame rather than landing on its edge', () => {
    // At exactly 1 the readable core's edge lands on the viewport's edge, and a
    // rounded corner or a half-pixel of antialiased fringe shows at the one moment
    // nothing may.
    expect(BLOG_TRANSITION.fillOvershoot).toBeLessThan(1)
    expect(BLOG_TRANSITION.fillOvershoot).toBeGreaterThan(0.5)
  })

  it('comes back faster than it went in', () => {
    expect(BLOG_TRANSITION.returnDuration).toBeLessThan(BLOG_TRANSITION.duration)
    expect(BLOG_TRANSITION.returnDuration).toBeGreaterThan(0)
  })
})
