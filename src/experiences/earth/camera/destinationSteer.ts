import * as THREE from 'three'
import { smootherstep } from '../../../utils/easing'
import type { WarpLimits } from '../../../utils/warpTransition'

/**
 * The zone to dive at: the third stage of Earth's zoom band.
 *
 * Past `earthGuideStart` the same scroll that zooms also swings the camera onto
 * the destination, so a viewer who pushes all the way arrives aimed at Spain
 * rather than at whatever part of the planet happened to be facing them.
 *
 * ## The drag is NOT gated
 *
 * This is the part worth being explicit about. The free orbit keeps every input
 * the whole way through — nothing is taken away, and a viewer who wants to look
 * elsewhere still can. What shrinks is the free orbit's WEIGHT in the blend. A
 * gate would make the globe go dead under the hand at exactly the moment the
 * viewer is most engaged with it; a blend makes the planet feel like it is
 * helping.
 *
 * ## The radius is not touched
 *
 * The steering changes where ON the sphere the viewer is looking from, never how
 * far away they are. The zoom stays theirs the whole way through, which is what
 * keeps this feeling like the same scroll doing more rather than like the zoom
 * being handed over to something else.
 *
 * ## Why this is not inside the focus rig
 *
 * It is a pure function of (free direction, destination, weight) with no state
 * of its own, and it is applied AFTER the rig has written its pose. Keeping it
 * out of `createFocusCameraRig` means the rig stays the one thing that owns the
 * orbit, and this stays something a reader can evaluate without holding the
 * rig's lifecycle in their head.
 */

/**
 * How much of the swing is engaged at a given band depth, 0..1.
 *
 * `smootherstep`, so the swing has zero slope where it begins: the planet must
 * not start turning the instant the viewer crosses a threshold, or the guide
 * announces itself as a mechanism instead of reading as the world helping.
 */
export function steerWeightFor(bandDepth: number, limits: WarpLimits): number {
  if (!Number.isFinite(bandDepth)) return 0
  return smootherstep(limits.earthGuideStart, 1, bandDepth)
}

/**
 * Below this gap the eased weight lands on its target. 1e-4 of the swing is
 * under a fiftieth of a degree even from the far side of the planet.
 */
const STEER_SETTLE_EPSILON = 1e-4

/**
 * Advances the steer the viewer actually sees one frame toward the band.
 *
 * THIS, NOT `steerWeightFor`, IS WHAT DRIVES THE CAMERA, and the difference is
 * the defect it exists to fix. The band lands in whole wheel notches — a tenth
 * of the depth each — and the rig eases the RADIUS across every one. Read raw,
 * the weight took each notch in a single frame instead: 0.10, 0.40, 0.40, 0.10
 * of the swing, so from the far side of the planet the notch from 0.7 to 0.8
 * turned the camera ~60 degrees while the zoom glided, and it read as the globe
 * snapping to Spain. The sandbox this was ported from kept the two values apart
 * for exactly that reason; the port had collapsed them.
 *
 * Chased at the rig's own rate, so the swing and the zoom are one motion that
 * settles together. Smoothing rather than animation: it settles where the band
 * left it and moves nowhere on its own.
 *
 * Lands exactly on the target inside `STEER_SETTLE_EPSILON`, because an
 * exponential never arrives — and a residual weight would keep overriding the
 * rig's aim every frame for nothing, and keep a return to rest from being rest.
 */
export function easeSteerWeight(
  current: number,
  bandDepth: number,
  limits: WarpLimits,
  rate: number,
  dt: number,
): number {
  if (!Number.isFinite(dt) || dt <= 0) return current
  const target = steerWeightFor(bandDepth, limits)
  if (!Number.isFinite(current)) return target
  const alpha = 1 - Math.exp(-Math.max(0, rate) * dt)
  const next = current + (target - current) * alpha
  return Math.abs(target - next) < STEER_SETTLE_EPSILON ? target : next
}

const steerRotation = new THREE.Quaternion()
const partialRotation = new THREE.Quaternion()
const alignedDirection = new THREE.Vector3()
const steeredDirection = new THREE.Vector3()

/**
 * Rotates a camera position partway onto the destination, and returns the point
 * it should now look at.
 *
 * `position` is read and written in place. `lookAt` is written in place and
 * returned. Both are the caller's; nothing is allocated per frame.
 *
 * The rotation is built with `setFromUnitVectors` and then slerped FROM
 * IDENTITY, rather than lerping the two directions and re-normalising. A lerp
 * between two points on a sphere cuts the chord and speeds up through the
 * middle; a slerp of the rotation travels the arc at a constant rate, which is
 * what makes a partial swing look like the same motion stopped early.
 */
export function applyDestinationSteer(
  position: THREE.Vector3,
  restLookAt: THREE.Vector3,
  destination: THREE.Vector3,
  weight: number,
  lookAt: THREE.Vector3,
): THREE.Vector3 {
  lookAt.copy(restLookAt)
  if (!(weight > 0)) return lookAt

  const radius = position.length()
  if (radius < 1e-6) return lookAt

  steeredDirection.copy(position).divideScalar(radius)
  alignedDirection.copy(destination).normalize()
  if (alignedDirection.lengthSq() < 1e-12) return lookAt

  steerRotation.setFromUnitVectors(steeredDirection, alignedDirection)
  partialRotation.identity().slerp(steerRotation, Math.min(1, weight))

  position.copy(steeredDirection).applyQuaternion(partialRotation).multiplyScalar(radius)
  lookAt.lerpVectors(restLookAt, destination, Math.min(1, weight))
  return lookAt
}
