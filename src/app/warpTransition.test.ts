import { describe, it, expect } from 'vitest'
import {
  SCRUB_CEILING,
  SCRUB_EASE,
  WARP_TRANSITION,
  dollyAmount,
  earthFov,
  earthRadiusScale,
  flash,
  motionBlur,
  scrubProgress,
  speed,
  transitionLeg,
} from './warpTransition'

// This module is deliberately free of three, React and the DOM so that
// checks/warp-transition.ts can drive the real curves. These are the properties
// that harness does NOT cover: it asserts the camera-distance envelope and the
// ground footprint, which is the safety case. What is asserted here is the shape
// of the timeline itself.
const SAMPLES = Array.from({ length: 401 }, (_, i) => i / 400)
const { cut, flashWidth, speedPeakWidth } = WARP_TRANSITION

describe('transitionLeg', () => {
  it('partitions [0,1] with no gap and no overlap', () => {
    for (const p of SAMPLES) {
      const { localT } = transitionLeg(p)
      expect(localT).toBeGreaterThanOrEqual(0)
      expect(localT).toBeLessThanOrEqual(1)
    }
  })

  it('switches legs exactly once, and at the cut', () => {
    const flips = SAMPLES.slice(1).filter(
      (p, i) => transitionLeg(p).departing !== transitionLeg(SAMPLES[i]).departing,
    )
    expect(flips).toHaveLength(1)
    expect(flips[0]).toBeCloseTo(cut, 2)
  })

  it('runs the departing leg 0 → 1 and the arriving leg 0 → 1', () => {
    expect(transitionLeg(0).localT).toBe(0)
    expect(transitionLeg(1).localT).toBe(1)
    // Continuous across the handover: the departing leg finishes where the
    // arriving leg starts, so nothing jumps at the cut.
    expect(transitionLeg(cut - 1e-6).localT).toBeCloseTo(1, 4)
    expect(transitionLeg(cut + 1e-6).localT).toBeCloseTo(0, 4)
  })
})

describe('dollyAmount', () => {
  // The envelope: 0 at both rest poses, 1 at the cut. It says nothing about
  // direction — that is each world's business — so what is asserted is the
  // shape, not a pose.
  it('rests at both ends and peaks at the cut', () => {
    expect(dollyAmount(0).amount).toBe(0)
    expect(dollyAmount(1).amount).toBe(0)
    expect(dollyAmount(cut).amount).toBeCloseTo(1, 6)
  })

  it('never leaves 0..1', () => {
    for (const p of SAMPLES) {
      const { amount } = dollyAmount(p)
      expect(amount).toBeGreaterThanOrEqual(0)
      expect(amount).toBeLessThanOrEqual(1)
    }
  })
})

describe('flash', () => {
  it('reaches full cover at the cut', () => {
    expect(flash(cut)).toBe(1)
  })

  it('is fully clear outside its own window', () => {
    // The concealment must be over before the transition ends, or the last
    // frames of the arriving world are dimmed for no reason.
    expect(flash(cut - flashWidth)).toBe(0)
    expect(flash(cut + flashWidth)).toBe(0)
    expect(flash(0)).toBe(0)
    expect(flash(1)).toBe(0)
  })

  it('peaks inside the speed bell, so the cover is narrower than the surge', () => {
    // The nested widths are the design: position full, speed +/-0.34, flash
    // +/-0.17. A flash as wide as the speed bell would read as a dissolve.
    expect(flashWidth).toBeLessThan(speedPeakWidth)
    for (const p of SAMPLES) {
      if (flash(p) > 0) expect(speed(p)).toBeGreaterThan(0)
    }
  })
})

describe('motionBlur', () => {
  it('reads zero at both rest poses', () => {
    // Non-zero blur at rest would leave the resting scene permanently smeared —
    // the AfterimagePass is fed this value directly.
    expect(motionBlur(0)).toBe(0)
    expect(motionBlur(1)).toBe(0)
  })

  it('never exceeds its configured strength', () => {
    for (const p of SAMPLES) {
      expect(motionBlur(p)).toBeLessThanOrEqual(WARP_TRANSITION.motionBlurStrength)
    }
  })
})

describe('the Earth leg returns to rest on its own', () => {
  it('restores the resting FOV at both ends', () => {
    // The intro hands the camera back at normalFov; if the surge did not close
    // itself the site would rest at the warp FOV.
    expect(earthFov(0)).toBe(WARP_TRANSITION.earthRestFov)
    expect(earthFov(1)).toBe(WARP_TRANSITION.earthRestFov)
    expect(earthFov(cut)).toBeCloseTo(WARP_TRANSITION.earthWarpFov, 6)
  })

  it('restores the resting radius at both ends', () => {
    expect(earthRadiusScale(dollyAmount(0).amount)).toBe(1)
    expect(earthRadiusScale(dollyAmount(1).amount)).toBe(1)
    expect(earthRadiusScale(dollyAmount(cut).amount)).toBeCloseTo(
      WARP_TRANSITION.earthCloseFactor,
      6,
    )
  })
})

describe('the safety envelope is internally consistent', () => {
  // Not the footprint sweep — checks/warp-transition.ts owns that, over the real
  // computeGroundFootprint. This only asserts that the declared bounds do not
  // contradict each other, which is the failure a constant edit produces and
  // which the sweep would report as a confusing pose failure.
  it('keeps the arriving approach inside its own bounds', () => {
    expect(WARP_TRANSITION.murciaCloseDistance).toBeGreaterThanOrEqual(
      WARP_TRANSITION.murciaMinDistance,
    )
    expect(WARP_TRANSITION.murciaCloseDistance).toBeLessThanOrEqual(
      WARP_TRANSITION.murciaMaxDistance,
    )
  })

  it('lets the departing leg exceed rest, but only up to its own ceiling', () => {
    expect(WARP_TRANSITION.murciaDepartDistance).toBeGreaterThan(
      WARP_TRANSITION.murciaRestDistance,
    )
    expect(WARP_TRANSITION.murciaDepartDistance).toBeLessThanOrEqual(
      WARP_TRANSITION.murciaDepartMaxDistance,
    )
    // The rise is what pays for the extra distance (ADR 006). Distance above
    // rest without elevation above rest is the unsafe combination.
    expect(WARP_TRANSITION.murciaDepartElevation).toBeGreaterThan(
      WARP_TRANSITION.murciaRestElevation,
    )
  })
})

describe('the reversible scrub band', () => {
  // A gesture is reversible and usually abandoned; a warp runs once and is
  // concealed. These are the properties that make driving one from the other
  // safe, and every one of them is the reason a constant may not simply be
  // retuned in isolation.
  const GESTURES = Array.from({ length: 201 }, (_, i) => i / 200)

  it('derives its ceiling from the flash bell rather than hardcoding it', () => {
    expect(SCRUB_CEILING).toBeCloseTo(cut - flashWidth, 12)
  })

  it('never darkens the screen, anywhere in the band', () => {
    // THE load-bearing property. If this fails, an abandoned gesture leaves the
    // viewer looking at a partly black screen with nothing happening.
    for (const g of GESTURES) expect(flash(scrubProgress(g))).toBe(0)
  })

  it('stays inside the departing leg for the whole band', () => {
    // `transitionLeg` splits on the eased value and assumes a single pass. It is
    // safe here only because the flag never changes across the band, so a
    // gesture that goes backwards can never cross a leg boundary in reverse.
    for (const g of GESTURES) expect(transitionLeg(scrubProgress(g)).departing).toBe(true)
  })

  it('runs 0 -> SCRUB_CEILING exactly, and clamps outside 0..1', () => {
    expect(scrubProgress(0)).toBe(0)
    expect(scrubProgress(1)).toBe(SCRUB_CEILING)
    expect(scrubProgress(-1)).toBe(0)
    expect(scrubProgress(2)).toBe(SCRUB_CEILING)
  })

  it('is monotonic and bounded', () => {
    let previous = -1
    for (const g of GESTURES) {
      const p = scrubProgress(g)
      expect(p).toBeGreaterThan(previous)
      expect(p).toBeLessThanOrEqual(SCRUB_CEILING)
      previous = p
    }
  })

  it('answers its very first input visibly', () => {
    // The reason SCRUB_EASE exists. One capped wheel event is 120/900 of the
    // gesture; mapped straight onto `p` that is an amount of 0.015 — a 1%
    // camera move, which nobody sees. The band must do better than that, or the
    // rail was carrying feedback the scene cannot replace.
    const oneNotch = 120 / 900
    const { amount } = dollyAmount(scrubProgress(oneNotch))
    expect(amount).toBeGreaterThan(0.08)
  })

  it('hands over to the cinematic below the cut, with room for the flash', () => {
    expect(SCRUB_CEILING).toBeLessThan(cut)
    // The committed warp still has its whole flash bell left to play.
    expect(flash(cut)).toBeGreaterThan(0.99)
  })

  it('keeps SCRUB_EASE in the range where the curve still reads as a gesture', () => {
    // Provisional and judged, but not arbitrary: below ~1.5 the first input is
    // invisible again, above ~3 the travel is spent in the first third.
    expect(SCRUB_EASE).toBeGreaterThanOrEqual(1.5)
    expect(SCRUB_EASE).toBeLessThanOrEqual(3)
  })
})
