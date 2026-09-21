import { describe, it, expect } from 'vitest'
import { earthZoomRadius, earthZoomScale } from './zoomPose'
import { INTERACTION_CONFIG, ZOOM_NEAR_CLEARANCE } from '../interaction/interactionConfig'
import { WARP_LIMITS, earthDollyRadius } from '../../../utils/warpTransition'
import { ORBIT_PRESETS } from '../orbit/orbitConfig'
import { EARTH_CONFIG } from '../config/earthConfig'

// Replaces `scrubPose.test.ts`, which tested a camera modifier that no longer
// exists. The assertions that survived the move are the ones about what the
// VIEWER sees — on-screen scale, monotonicity, the ends of the range — because
// those were always the real contract; the ones about composing with the rig's
// pose went with the mechanism, since the zoom is now an input to the rig rather
// than a correction applied after it.

const cfg = INTERACTION_CONFIG.camera
const REST = cfg.overviewRadius

/** How much bigger the Earth gets on screen. The lens never moves, so it is 1/r. */
const onScreenScale = (depth: number) => REST / earthZoomRadius(depth)

describe('earthZoomScale', () => {
  it('is exactly 1 at rest, so an untouched session sits where the intro left it', () => {
    // Not `toBeCloseTo`. `createFocusCameraRig.setZoomDepth` compares the radius
    // against its current one to decide whether to write anything at all, and
    // `CameraController` pulls the arriving warp back to a hardcoded EARTH_REST
    // that has to be the same number to the bit.
    expect(earthZoomScale(0)).toBe(1)
    expect(earthZoomRadius(0)).toBe(REST)
  })

  it('reaches its two ends exactly', () => {
    expect(earthZoomScale(1)).toBe(cfg.zoomNearFactor)
    expect(earthZoomScale(-1)).toBe(cfg.zoomFarFactor)
  })

  it('moves inward toward Murcia and outward away from it', () => {
    // The band's sign convention, which is the one thing about this module that
    // is not local: +1 always faces the other world, and the other world is down
    // there. Murcia's zoomPose reads the same depth the opposite way round.
    expect(earthZoomRadius(1)).toBeLessThan(REST)
    expect(earthZoomRadius(-1)).toBeGreaterThan(REST)
  })

  it('grows the Earth on screen monotonically across the whole band', () => {
    // THE assertion the scrub's own test existed to satisfy, carried over intact:
    // a control whose whole meaning is "bring it closer" must never shrink what
    // it is driving, anywhere in its range.
    let previous = 0
    for (let d = -1; d <= 1.0001; d += 0.05) {
      const scale = onScreenScale(Math.min(1, d))
      expect(scale).toBeGreaterThan(previous)
      previous = scale
    }
  })

  it('is worth a scale change a person can see, in both directions', () => {
    // Below about 1.5 an approach stops reading as one. The scrub this replaced
    // reached x1.587 at full gesture and that was judged to read, and zooming in
    // held exactly that number until 2026-09-17, when the near end moved to the
    // satellites' height (x4.69). It went to x2.5 on 2026-09-21 — 18 / 7.2 —
    // when that end was pulled back off the texture. Zooming out is unchanged.
    expect(onScreenScale(1)).toBeGreaterThan(1.5)
    expect(onScreenScale(1)).toBeCloseTo(2.5, 2)
    expect(onScreenScale(-1)).toBeCloseTo(7 / 11, 3)
  })

  it('clamps rather than extrapolating into the planet or through the stars', () => {
    expect(earthZoomScale(5)).toBe(cfg.zoomNearFactor)
    expect(earthZoomScale(-5)).toBe(cfg.zoomFarFactor)
    expect(earthZoomScale(NaN)).toBe(1)
  })
})

describe('the ends are where they are for reasons outside this module', () => {
  it('zooming fully in still leaves the cut outside the planet', () => {
    // A committed warp dollies from wherever the camera IS, and its closest
    // point has to clear the Earth's surface or the camera ends up inside the
    // planet before the flash has closed over it. This used to be what fixed
    // `zoomNearFactor`; the dolly's floor carries it now, from every depth.
    const closest = earthDollyRadius(earthZoomRadius(1), 1, WARP_LIMITS)
    expect(closest).toBeGreaterThan(EARTH_CONFIG.radius)
    for (const depth of [-1, 0, 0.5, 1]) {
      expect(earthDollyRadius(earthZoomRadius(depth), 1, WARP_LIMITS)).toBeGreaterThan(
        EARTH_CONFIG.radius,
      )
    }
    // 2.2 -> 2.84 when overviewRadius went 7R -> 9R on 2026-09-05, then 2.84 ->
    // 3.5 on 2026-09-21 to keep the surface texture off the lens at the cut.
    // The margin over the surface has only ever GROWN, which is the direction
    // that costs nothing. The literal is kept rather than dropped because it is
    // the one number here that would move silently — the assertion above only
    // says "outside the planet", and a future retune could halve this margin
    // without tripping it.
    expect(closest).toBeCloseTo(3.5, 1)
  })

  it('ends the zoom clear of the satellites, at a multiple of their orbit', () => {
    const outermost = Math.max(...ORBIT_PRESETS.map((orbit) => orbit.radius)) * EARTH_CONFIG.radius
    // Re-derived rather than restated: the whole point of the near end being a
    // function of ORBIT_PRESETS is that it follows them, and a literal here
    // would stop noticing if they moved.
    expect(earthZoomRadius(1)).toBeCloseTo(outermost * ZOOM_NEAR_CLEARANCE, 9)
    // OUTSIDE them, which is the property the clearance exists to create — the
    // band ended exactly ON this orbit until 2026-09-21 and that was too close
    // to the surface to hold the texture together.
    expect(earthZoomRadius(1)).toBeGreaterThan(outermost)
    // And from the closer desktop overview too: the ends do not move with it.
    expect(earthZoomRadius(1, cfg.desktopOverviewRadius)).toBeCloseTo(
      outermost * ZOOM_NEAR_CLEARANCE,
      9,
    )
  })

  it('stops a narrow-texture viewport further out, and still reaches the dolly floor', () => {
    // The near end is a function of the SURFACE MAPS, not of the composition: a
    // phone carries 1024-wide maps, so the framing that reads at x1.03 against
    // the desktop's 4096 reads at x3.6 against a quarter of it. 12 units spends
    // roughly half that magnification and leaves the globe at 41% of the height.
    // `interactionConfig.zoomNearFactorNarrow` carries the table.
    const narrow = earthZoomRadius(1, cfg.overviewRadius, cfg.zoomNearFactorNarrow)
    expect(narrow).toBeCloseTo(12, 9)
    expect(narrow).toBeGreaterThan(earthZoomRadius(1))

    // Everything the default end is argued from still holds for it, BECAUSE it
    // is further out — asserted rather than reasoned, since "further out is
    // always safer" is the kind of claim that stops being true quietly.
    const outermost = Math.max(...ORBIT_PRESETS.map((orbit) => orbit.radius)) * EARTH_CONFIG.radius
    expect(narrow).toBeGreaterThan(outermost)
    const closest = earthDollyRadius(narrow, 1, WARP_LIMITS)
    expect(closest).toBeGreaterThan(EARTH_CONFIG.radius)
    expect(closest).toBeLessThan(narrow)

    // Rest and the far end are the texture tier's business not at all: only the
    // inward half of the band moves.
    expect(earthZoomRadius(0, cfg.overviewRadius, cfg.zoomNearFactorNarrow)).toBe(earthZoomRadius(0))
    expect(earthZoomRadius(-1, cfg.overviewRadius, cfg.zoomNearFactorNarrow)).toBe(earthZoomRadius(-1))
  })

  it('zooming fully out stays well inside the star shell', () => {
    // checks/space-backdrop.ts holds the real measurement — the nearest star sits
    // at 153 units. This is the cheap restatement of the same invariant, so a
    // retune of the far end fails here before it fails a harness.
    expect(earthZoomRadius(-1)).toBeLessThan(150)
  })
})
