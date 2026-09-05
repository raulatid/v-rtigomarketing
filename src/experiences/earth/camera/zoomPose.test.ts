import { describe, it, expect } from 'vitest'
import { earthZoomRadius, earthZoomScale } from './zoomPose'
import { INTERACTION_CONFIG } from '../interaction/interactionConfig'
import { earthRadiusScale } from '../../../app/warpTransition'
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
    // reached x1.587 at full gesture and that was judged to read; zooming in
    // holds exactly that number, and zooming out is the same ratio the other way.
    expect(onScreenScale(1)).toBeCloseTo(1.587, 2)
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
    // The constraint that fixes `zoomNearFactor`. A committed warp dollies from
    // wherever the camera IS by `earthRadiusScale`, which bottoms out at the cut
    // — so the closest point of a transition committed from full zoom-in is this
    // product, and it has to clear the Earth's surface or the camera ends up
    // inside the planet before the flash has closed over it.
    const closest = earthZoomRadius(1) * earthRadiusScale(1)
    expect(closest).toBeGreaterThan(EARTH_CONFIG.radius)
    // 2.2 -> 2.84 when overviewRadius went 7R -> 9R on 2026-09-05. The margin
    // over the surface GREW, which is the direction that costs nothing: the
    // whole band is a set of factors on the overview radius, so pulling the
    // resting camera back carries the cut out with it. The literal is kept
    // rather than dropped because it is the one number here that would move
    // silently — the assertion above only says "outside the planet", and a
    // future retune could halve this margin without tripping it.
    expect(closest).toBeCloseTo(2.84, 1)
  })

  it('zooming fully out stays well inside the star shell', () => {
    // checks/space-backdrop.ts holds the real measurement — the nearest star sits
    // at 153 units. This is the cheap restatement of the same invariant, so a
    // retune of the far end fails here before it fails a harness.
    expect(earthZoomRadius(-1)).toBeLessThan(150)
  })
})
