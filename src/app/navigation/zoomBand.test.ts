import { describe, it, expect } from 'vitest'
import { createZoomBand } from './zoomBand'
import { NAVIGATION_ZOOM } from './navigationConfig'
import type { ZoomBandLimits } from './navigationConfig'

// What this file asserts: that the zoom is a POSITION — it stays, it is
// bounded, it is symmetric, and it hands the caller exactly the travel it could
// not use. What it deliberately does not assert: anything about what a camera
// then does with the depth, which belongs to each world's own `zoomPose`.
//
// Limits are read from the shipped config rather than restated, per the rule
// that burned `playhead.test.ts`: a mirrored copy of a tuned number is a test
// that keeps passing against a value the product no longer uses.

const LIMITS = NAVIGATION_ZOOM
const TOWARD = LIMITS.towardTravelPx
const AWAY = LIMITS.awayTravelPx
const CAP = LIMITS.maxEventTravelPx

/** Feeds `totalPx` as a stream of events, none of them past the per-event cap. */
function drive(band: ReturnType<typeof createZoomBand>, totalPx: number): number {
  const events = Math.ceil(Math.abs(totalPx) / CAP)
  const step = totalPx / events
  let overflow = 0
  for (let i = 0; i < events; i += 1) overflow += band.push(step)
  return overflow
}

describe('createZoomBand', () => {
  it('starts at rest', () => {
    const band = createZoomBand(LIMITS)
    expect(band.depth).toBe(0)
    expect(band.atLimit).toBe(false)
  })

  it('STAYS where it was left, however long nothing happens', () => {
    // The whole reason this module exists. The accumulator beside it decays on
    // its own; a zoom that did the same is the bounce the client rejected.
    const band = createZoomBand(LIMITS)
    drive(band, TOWARD / 2)
    const settled = band.depth
    expect(settled).toBeCloseTo(0.5, 10)
    // There is no clock to advance, which is itself the assertion: nothing in
    // the interface can move the depth except travel.
    expect(band.depth).toBe(settled)
  })

  it('reaches exactly +1 at the transition limit and stops there', () => {
    const band = createZoomBand(LIMITS)
    drive(band, TOWARD)
    expect(band.depth).toBe(1)
    expect(band.atLimit).toBe(true)

    drive(band, TOWARD * 4)
    expect(band.depth).toBe(1)
  })

  it('reaches exactly -1 at the far limit and stops there', () => {
    const band = createZoomBand(LIMITS)
    drive(band, -AWAY * 4)
    expect(band.depth).toBe(-1)
    expect(band.atLimit).toBe(false)
  })

  it('is reversible: the same travel back returns it to rest exactly', () => {
    const band = createZoomBand(LIMITS)
    drive(band, TOWARD * 0.6)
    drive(band, -TOWARD * 0.6)
    expect(band.depth).toBeCloseTo(0, 10)
  })

  it('caps one absurd event so a dropped frame cannot cross the band', () => {
    const band = createZoomBand(LIMITS)
    band.push(100000)
    expect(band.depth).toBeCloseTo(CAP / TOWARD, 10)
  })
})

describe('the overflow, which is what navigates', () => {
  it('absorbs everything until the limit, and reports nothing', () => {
    const band = createZoomBand(LIMITS)
    expect(drive(band, TOWARD * 0.99)).toBe(0)
  })

  it('reports only the part of the journey past the limit', () => {
    const band = createZoomBand(LIMITS)
    const overflow = drive(band, TOWARD + 200)
    expect(overflow).toBeCloseTo(200, 8)
    expect(band.depth).toBe(1)
  })

  it('loses no pixel at the seam, even when one event straddles it', () => {
    // The event that crosses the limit is part zoom and part push. Dropping the
    // remainder would reopen a dead zone the size of one event right at the
    // moment the viewer is watching most closely.
    const band = createZoomBand({ ...LIMITS, towardTravelPx: CAP * 1.5 })
    band.push(CAP)
    const overflow = band.push(CAP)
    expect(overflow).toBeCloseTo(CAP * 0.5, 10)
    expect(band.depth).toBe(1)
  })

  it('reports the whole of an event once it is already pinned', () => {
    const band = createZoomBand(LIMITS)
    drive(band, TOWARD)
    expect(band.push(CAP)).toBeCloseTo(CAP, 10)
  })

  it('never overflows at the far end, because there is nothing out there', () => {
    const band = createZoomBand(LIMITS)
    expect(drive(band, -AWAY * 3)).toBe(0)
  })

  it('reports nothing while unzooming from the limit', () => {
    const band = createZoomBand(LIMITS)
    drive(band, TOWARD)
    expect(drive(band, -TOWARD * 0.5)).toBe(0)
    expect(band.depth).toBeCloseTo(0.5, 10)
    expect(band.atLimit).toBe(false)
  })
})

describe('the two halves are measured independently', () => {
  const LOPSIDED: ZoomBandLimits = { ...LIMITS, towardTravelPx: 300, awayTravelPx: 900 }

  it('normalises each side against its own span', () => {
    const band = createZoomBand(LOPSIDED)
    drive(band, 150)
    expect(band.depth).toBeCloseTo(0.5, 10)
    drive(band, -600)
    expect(band.depth).toBeCloseTo(-0.5, 10)
  })

  it('crossing rest costs both spans, not one', () => {
    // The trap a normalised accumulator falls into: a depth of -1 is 900px from
    // rest and +1 is 300px from it, so a sweep from one end to the other is
    // 1200px of travel and not 600.
    const band = createZoomBand(LOPSIDED)
    drive(band, -LOPSIDED.awayTravelPx)
    expect(band.depth).toBe(-1)
    drive(band, LOPSIDED.awayTravelPx)
    expect(band.depth).toBeCloseTo(0, 10)
    drive(band, LOPSIDED.towardTravelPx)
    expect(band.depth).toBe(1)
  })
})

describe('robustness', () => {
  it('ignores a non-finite push rather than poisoning the position', () => {
    // One NaN makes every later comparison false: the band could then never
    // reach a limit and never come home, for the rest of the session.
    const band = createZoomBand(LIMITS)
    band.push(NaN)
    band.push(Infinity)
    drive(band, TOWARD / 4)
    expect(Number.isFinite(band.depth)).toBe(true)
    expect(band.depth).toBeCloseTo(0.25, 10)
  })

  it('survives a zero-width half without dividing by it', () => {
    const band = createZoomBand({ ...LIMITS, awayTravelPx: 0 })
    drive(band, -1000)
    expect(Number.isFinite(band.depth)).toBe(true)
    expect(band.depth).toBe(0)
  })

  it('reset returns to rest with nothing left over', () => {
    const band = createZoomBand(LIMITS)
    drive(band, TOWARD)
    band.reset()
    expect(band.depth).toBe(0)
    expect(band.atLimit).toBe(false)
  })
})
