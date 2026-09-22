import { vacuumDeparture, createDefaultWarpLimits } from './warpTransition'
import { describe, it, expect } from 'vitest'
import {
  WARP_LIMITS,
  WARP_TRANSITION,
  dollyAmount,
  earthFov,
  earthDollyRadius,
  earthRadiusScale,
  flash,
  motionBlur,
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
      const { localT } = transitionLeg(p, WARP_LIMITS)
      expect(localT).toBeGreaterThanOrEqual(0)
      expect(localT).toBeLessThanOrEqual(1)
    }
  })

  it('switches legs exactly once, and at the cut', () => {
    const flips = SAMPLES.slice(1).filter(
      (p, i) => transitionLeg(p, WARP_LIMITS).departing !== transitionLeg(SAMPLES[i], WARP_LIMITS).departing,
    )
    expect(flips).toHaveLength(1)
    expect(flips[0]).toBeCloseTo(cut, 2)
  })

  it('runs the departing leg 0 → 1 and the arriving leg 0 → 1', () => {
    expect(transitionLeg(0, WARP_LIMITS).localT).toBe(0)
    expect(transitionLeg(1, WARP_LIMITS).localT).toBe(1)
    // Continuous across the handover: the departing leg finishes where the
    // arriving leg starts, so nothing jumps at the cut.
    expect(transitionLeg(cut - 1e-6, WARP_LIMITS).localT).toBeCloseTo(1, 4)
    expect(transitionLeg(cut + 1e-6, WARP_LIMITS).localT).toBeCloseTo(0, 4)
  })
})

describe('dollyAmount', () => {
  // The envelope: 0 at both rest poses, 1 at the cut. It says nothing about
  // direction — that is each world's business — so what is asserted is the
  // shape, not a pose.
  it('rests at both ends and peaks at the cut', () => {
    expect(dollyAmount(0, WARP_LIMITS).amount).toBe(0)
    expect(dollyAmount(1, WARP_LIMITS).amount).toBe(0)
    expect(dollyAmount(cut, WARP_LIMITS).amount).toBeCloseTo(1, 6)
  })

  it('never leaves 0..1', () => {
    for (const p of SAMPLES) {
      const { amount } = dollyAmount(p, WARP_LIMITS)
      expect(amount).toBeGreaterThanOrEqual(0)
      expect(amount).toBeLessThanOrEqual(1)
    }
  })
})

describe('flash', () => {
  it('reaches full cover at the cut', () => {
    expect(flash(cut, WARP_LIMITS)).toBe(1)
  })

  it('is fully clear outside its own window', () => {
    // The concealment must be over before the transition ends, or the last
    // frames of the arriving world are dimmed for no reason.
    expect(flash(cut - flashWidth, WARP_LIMITS)).toBe(0)
    expect(flash(cut + flashWidth, WARP_LIMITS)).toBe(0)
    expect(flash(0, WARP_LIMITS)).toBe(0)
    expect(flash(1, WARP_LIMITS)).toBe(0)
  })

  it('peaks inside the speed bell, so the cover is narrower than the surge', () => {
    // The nested widths are the design: position full, speed +/-0.34, flash
    // +/-0.17. A flash as wide as the speed bell would read as a dissolve.
    expect(flashWidth).toBeLessThan(speedPeakWidth)
    for (const p of SAMPLES) {
      if (flash(p, WARP_LIMITS) > 0) expect(speed(p, WARP_LIMITS)).toBeGreaterThan(0)
    }
  })
})

describe('motionBlur', () => {
  it('reads zero at both rest poses', () => {
    // Non-zero blur at rest would leave the resting scene permanently smeared —
    // the AfterimagePass is fed this value directly.
    expect(motionBlur(0, WARP_LIMITS)).toBe(0)
    expect(motionBlur(1, WARP_LIMITS)).toBe(0)
  })

  it('never exceeds its configured strength', () => {
    for (const p of SAMPLES) {
      expect(motionBlur(p, WARP_LIMITS)).toBeLessThanOrEqual(WARP_TRANSITION.motionBlurStrength)
    }
  })
})

describe('the Earth leg returns to rest on its own', () => {
  it('restores the resting FOV at both ends', () => {
    // The intro hands the camera back at normalFov; if the surge did not close
    // itself the site would rest at the warp FOV.
    expect(earthFov(0, WARP_LIMITS)).toBe(WARP_TRANSITION.earthRestFov)
    expect(earthFov(1, WARP_LIMITS)).toBe(WARP_TRANSITION.earthRestFov)
    expect(earthFov(cut, WARP_LIMITS)).toBeCloseTo(WARP_TRANSITION.earthWarpFov, 6)
  })

  it('restores the resting radius at both ends', () => {
    expect(earthRadiusScale(dollyAmount(0, WARP_LIMITS).amount, WARP_LIMITS)).toBe(1)
    expect(earthRadiusScale(dollyAmount(1, WARP_LIMITS).amount, WARP_LIMITS)).toBe(1)
    expect(earthRadiusScale(dollyAmount(cut, WARP_LIMITS).amount, WARP_LIMITS)).toBeCloseTo(
      WARP_TRANSITION.earthCloseFactor,
      6,
    )
  })
})

describe('earthDollyRadius', () => {
  const floor = WARP_TRANSITION.earthMinDollyRadius

  it('is the bare factor from far out, where the floor is not in play', () => {
    // Arriving from Murcia and committing from rest both start out here, and
    // neither may change because the zoom's near end moved.
    expect(earthDollyRadius(18, 1, WARP_LIMITS)).toBeCloseTo(18 * WARP_TRANSITION.earthCloseFactor, 9)
    expect(earthDollyRadius(18, 0, WARP_LIMITS)).toBe(18)
  })

  it('stops at the floor from close in, instead of diving through the surface', () => {
    // "Close in" is any anchor inside `floor / earthCloseFactor` — 14 units —
    // where the bare factor would land inside the floor and the floor takes
    // over. Earth's zoom band ends at 7.2, well inside that, but the anchor is
    // DERIVED rather than borrowed from the band: the rule belongs to the two
    // constants above and holds for every anchor in the range. It used to be
    // written as a literal 3.84 and went stale twice in a month.
    const closeIn = floor / WARP_TRANSITION.earthCloseFactor / 2
    expect(earthDollyRadius(closeIn, 1, WARP_LIMITS)).toBe(floor)
    expect(earthDollyRadius(closeIn, 0.5, WARP_LIMITS)).toBeCloseTo((closeIn + floor) / 2, 9)
  })

  it('never pushes a camera already inside the floor back OUT', () => {
    expect(earthDollyRadius(2.5, 1, WARP_LIMITS)).toBe(2.5)
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

describe('the whole cinematic is available to a commit', () => {
  // The scrub used to spend the first third of the departing leg before the
  // commit even started, so this file asserted where the band had to stop. The
  // zoom that replaced it (`adr/014`) never touches `p` at all: a commit runs
  // the timeline from 0 whatever the viewer had zoomed to, and it is the POSE
  // the warp is re-based on, not the progress. What is left to assert is that
  // the timeline the commit inherits is the entire one.
  it('starts at rest and conceals nothing before it', () => {
    expect(dollyAmount(0, WARP_LIMITS).amount).toBe(0)
    expect(flash(0, WARP_LIMITS)).toBe(0)
    expect(transitionLeg(0, WARP_LIMITS).departing).toBe(true)
  })

  it('still has its whole flash bell left at the cut', () => {
    expect(flash(cut, WARP_LIMITS)).toBeGreaterThan(0.99)
  })
})

describe('vacuumDeparture', () => {
  const limits = createDefaultWarpLimits()
  it('starts at zero, grows immediately, and reaches full before the flash', () => {
    expect(vacuumDeparture(0, limits)).toBe(0)
    expect(vacuumDeparture(0.001, limits)).toBeGreaterThan(0)
    expect(vacuumDeparture(limits.cut - limits.flashWidth, limits)).toBe(1)
  })
  it('is monotone and bounded throughout departure', () => {
    let previous = 0
    for (let i = 0; i <= 500; i++) {
      const amount = vacuumDeparture(i / 1000, limits)
      expect(amount).toBeGreaterThanOrEqual(previous)
      expect(amount).toBeLessThanOrEqual(1)
      previous = amount
    }
  })
})
