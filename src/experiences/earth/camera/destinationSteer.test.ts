import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { applyDestinationSteer, easeSteerWeight, steerWeightFor } from './destinationSteer'
import { INTERACTION_CONFIG } from '../interaction/interactionConfig'
import { EARTH_CONFIG } from '../config/earthConfig'
import { WARP_LIMITS } from '../../../utils/warpTransition'

// The steer is the third stage of Earth's zoom band: past `earthGuideStart` the
// scroll that zooms also swings the camera onto the destination. What is pinned
// here is that the swing is CONTINUOUS — nothing about the camera may change
// discontinuously as the band crosses the threshold, or as the band steps.

const R = EARTH_CONFIG.radius
const START = WARP_LIMITS.earthGuideStart
const LERP_K = INTERACTION_CONFIG.camera.lerpK
const FRAME = 1 / 60

// A viewer looking at the far side of the planet from Spain, which is the case
// that makes any discontinuity largest: the swing has most of a half-turn to do.
const DESTINATION = new THREE.Vector3(R, 0, 0)
const SWING_DEGREES = 150
const FREE_POSITION = new THREE.Vector3(
  Math.cos(THREE.MathUtils.degToRad(SWING_DEGREES)),
  0,
  Math.sin(THREE.MathUtils.degToRad(SWING_DEGREES)),
).multiplyScalar(3 * R)
// Deliberately NOT the origin: the steer must compose with whatever the rig is
// aiming at, so at zero weight it has to hand that aim back untouched.
const RIG_LOOK_AT = new THREE.Vector3(0.02 * R, -0.01 * R, 0.015 * R)

interface Pose {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
}

function steeredPose(weight: number): Pose {
  const camera = new THREE.PerspectiveCamera()
  camera.position.copy(FREE_POSITION)
  const lookAt = applyDestinationSteer(
    camera.position,
    RIG_LOOK_AT,
    DESTINATION,
    weight,
    new THREE.Vector3(),
  )
  camera.lookAt(lookAt)
  return { position: camera.position.clone(), quaternion: camera.quaternion.clone() }
}

/** Degrees the camera turned, and degrees it swung about the planet, between two poses. */
function change(a: Pose, b: Pose): { turn: number; swing: number } {
  return {
    turn: THREE.MathUtils.radToDeg(a.quaternion.angleTo(b.quaternion)),
    swing: THREE.MathUtils.radToDeg(a.position.angleTo(b.position)),
  }
}

describe('the destination steer around its first threshold', () => {
  it('has zero weight up to the threshold and leaves it with zero slope', () => {
    const h = 1e-3
    expect(steerWeightFor(START - h, WARP_LIMITS)).toBe(0)
    expect(steerWeightFor(START, WARP_LIMITS)).toBe(0)
    const justAbove = steerWeightFor(START + h, WARP_LIMITS)
    expect(justAbove).toBeGreaterThan(0)
    // smootherstep grows as 10t^3 off its lower edge: a thousandth of the band
    // past the threshold is a weight of order 1e-7, not a step.
    expect(justAbove).toBeLessThan(1e-6)
    // And it reaches the whole swing exactly at the far end of the band.
    expect(steerWeightFor(1, WARP_LIMITS)).toBe(1)
  })

  it('is the identity at zero weight: the free pose AND the rig aim come back untouched', () => {
    const free = new THREE.PerspectiveCamera()
    free.position.copy(FREE_POSITION)
    free.lookAt(RIG_LOOK_AT)

    for (const depth of [START - 1e-3, START]) {
      const pose = steeredPose(steerWeightFor(depth, WARP_LIMITS))
      expect(pose.position.equals(FREE_POSITION), `position at depth ${depth}`).toBe(true)
      // Not `toBe(0)`: `angleTo` is 2·acos(dot), and the dot of two identical unit
      // quaternions rounds to 1 − 1e-16, which acos turns into ~1e-8.
      expect(pose.quaternion.angleTo(free.quaternion), `aim at depth ${depth}`).toBeLessThan(1e-6)
    }
  })

  it('moves the camera by a vanishing amount across the threshold, in position and orientation', () => {
    const below = steeredPose(steerWeightFor(START - 1e-3, WARP_LIMITS))
    const at = steeredPose(steerWeightFor(START, WARP_LIMITS))
    const above = steeredPose(steerWeightFor(START + 1e-3, WARP_LIMITS))

    expect(below.position.equals(at.position)).toBe(true)
    expect(change(below, at).turn).toBeLessThan(1e-6)
    // A thousandth of the band past the threshold moves nothing visible.
    expect(change(at, above).turn).toBeLessThan(1e-4)
    expect(change(at, above).swing).toBeLessThan(1e-4)
    expect(above.position.distanceTo(at.position)).toBeLessThan(1e-5 * R)
  })

  it('is smooth through the whole neighbourhood of the threshold, not just at three points', () => {
    let worstTurn = 0
    let previous = steeredPose(steerWeightFor(START - 0.05, WARP_LIMITS))
    for (let depth = START - 0.05; depth <= START + 0.05; depth += 1e-3) {
      const pose = steeredPose(steerWeightFor(depth, WARP_LIMITS))
      worstTurn = Math.max(worstTurn, change(previous, pose).turn)
      previous = pose
    }
    // The steepest point of this window, 0.05 of the band past the threshold,
    // moves the weight ~9e-4 per thousandth of depth: ~0.13 degrees of the
    // 150-degree swing. A discontinuity of any visible size is orders above that.
    expect(worstTurn).toBeLessThan(0.25)
  })
})

describe('the steer the viewer sees follows the band, it does not jump with it', () => {
  // THE DEFECT THIS FILE WAS WRITTEN FOR. The band lands in whole wheel notches —
  // 120 px of a 1200 px band, a tenth of the depth per notch — and the rig eases
  // the RADIUS across each one. The steer used to read the depth raw, so on a
  // single frame the notch from 0.7 to 0.8 moved the weight by 0.4: from a view
  // 150 degrees from Spain, a 60-degree snap while the zoom glided.

  /** Band depth per frame: a wheel notch every 20 frames from 0.5 to the end. */
  function notchedDepths(): number[] {
    const out: number[] = []
    for (let notch = 0; notch <= 5; notch += 1) {
      const depth = Math.min(1, 0.5 + notch * 0.1)
      for (let f = 0; f < 20; f += 1) out.push(depth)
    }
    for (let f = 0; f < 240; f += 1) out.push(1)
    return out
  }

  function drive(weightFor: (previous: number, depth: number) => number) {
    let weight = 0
    let previous = steeredPose(0)
    let worstSwing = 0
    let worstTurn = 0
    for (const depth of notchedDepths()) {
      weight = weightFor(weight, depth)
      const pose = steeredPose(weight)
      const { swing, turn } = change(previous, pose)
      worstSwing = Math.max(worstSwing, swing)
      worstTurn = Math.max(worstTurn, turn)
      previous = pose
    }
    return { weight, worstSwing, worstTurn }
  }

  it('reproduces the snap when the raw band depth drives the steer', () => {
    const raw = drive((_, depth) => steerWeightFor(depth, WARP_LIMITS))
    // Pinned so this file keeps proving it can SEE the defect: the 0.7 -> 0.8
    // notch alone is ~0.4 of the swing in one frame.
    expect(raw.worstSwing).toBeGreaterThan(0.35 * SWING_DEGREES)
  })

  it('never moves the camera more per frame than the radius ease would', () => {
    const eased = drive((w, depth) => easeSteerWeight(w, depth, WARP_LIMITS, LERP_K, FRAME))
    // A first-order chase closes at most `alpha` of the remaining gap per frame,
    // and the gap is at most the whole weight — so no frame may swing the camera
    // by more than `alpha` of the swing. At 60 Hz that is under 5% of it.
    const alpha = 1 - Math.exp(-LERP_K * FRAME)
    expect(eased.worstSwing).toBeLessThanOrEqual(alpha * SWING_DEGREES + 1e-9)
    // Orientation includes the aim's own lerp toward the destination, so it is
    // bounded more loosely — but still by the same rate, not by a notch.
    expect(eased.worstTurn).toBeLessThan(2 * alpha * SWING_DEGREES)
    // Easing must not cost the destination: held at the end of the band, the
    // steer arrives in full.
    expect(eased.weight).toBe(1)
  })
})

describe('easeSteerWeight', () => {
  it('starts from zero at the threshold and never overshoots the band', () => {
    let w = 0
    for (const depth of [START - 0.01, START, START + 0.01, START + 0.1, START + 0.2]) {
      const next = easeSteerWeight(w, depth, WARP_LIMITS, LERP_K, FRAME)
      const target = steerWeightFor(depth, WARP_LIMITS)
      expect(next).toBeGreaterThanOrEqual(w)
      expect(next).toBeLessThanOrEqual(target)
      w = next
    }
    expect(easeSteerWeight(0, START, WARP_LIMITS, LERP_K, FRAME)).toBe(0)
  })

  it('settles exactly rather than chasing an asymptote forever', () => {
    // A steer left at 1e-12 would keep overriding the rig's aim every frame for
    // nothing, and would never let a return to rest read as rest.
    let w = 1
    for (let f = 0; f < 600; f += 1) w = easeSteerWeight(w, 0, WARP_LIMITS, LERP_K, FRAME)
    expect(w).toBe(0)
  })

  it('does not move on a degenerate frame', () => {
    expect(easeSteerWeight(0.3, 1, WARP_LIMITS, LERP_K, 0)).toBe(0.3)
    expect(easeSteerWeight(0.3, 1, WARP_LIMITS, LERP_K, Number.NaN)).toBe(0.3)
    expect(easeSteerWeight(0.3, Number.NaN, WARP_LIMITS, LERP_K, FRAME)).toBeLessThan(0.3)
  })
})
