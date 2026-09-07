import * as THREE from 'three'
import { EARTH_CONFIG } from '../config/earthConfig'
import { OrbitCurve } from './orbitUtils'
import type { OrbitPreset } from './orbitConfig'

// Whether a satellite can be SEEN — inside the frame, with a margin, and not
// behind the planet. The hover tutorial asks this every frame before it arms
// (a demonstration aimed off screen teaches nothing), and the visibility test
// asks it over a whole revolution at every supported viewport so the invited
// satellite can never be reassigned to an orbit that hides it.
//
// Pure three.js maths, no DOM: the test runs it in Node against the real
// presets and the real rest camera.

/**
 * The radius the Earth occludes at. A shade over the sphere, for the
 * atmosphere shell drawn around it — a satellite skimming the limb is behind
 * haze, not visible.
 */
export const OCCLUDER_RADIUS = EARTH_CONFIG.radius * 1.04

const scratch = new THREE.Vector3()
const toPoint = new THREE.Vector3()

/**
 * True when `world` projects inside the frame by `marginNdc` on both axes and
 * the segment camera→point does not pass through the Earth.
 *
 * The frustum test is the three conditions `worldToClient` uses: `z` alone
 * lets a point behind the camera report a plausible mirrored position, and
 * `x`/`y` alone would pass a point that is off to the side. The occlusion is a
 * segment–sphere test rather than a ray one so a point BETWEEN the camera and
 * the planet is not counted as hidden by it.
 */
export function isPointVisible(
  camera: THREE.Camera,
  world: THREE.Vector3,
  marginNdc = 0,
  occluderRadius = OCCLUDER_RADIUS,
): boolean {
  scratch.copy(world).project(camera)
  const limit = 1 - marginNdc
  if (scratch.z < -1 || scratch.z > 1) return false
  if (scratch.x < -limit || scratch.x > limit || scratch.y < -limit || scratch.y > limit) {
    return false
  }
  // Closest approach of the camera→point segment to the origin.
  toPoint.copy(world).sub(camera.position)
  const length2 = toPoint.lengthSq()
  if (length2 === 0) return true
  const along = THREE.MathUtils.clamp(-camera.position.dot(toPoint) / length2, 0, 1)
  scratch.copy(camera.position).addScaledVector(toPoint, along)
  return scratch.lengthSq() >= occluderRadius * occluderRadius
}

export interface OrbitVisibility {
  /** Fraction of a revolution the satellite is visible, 0..1. */
  fraction: number
  /** Visible at the point it starts idling (curve t = 0). */
  visibleAtStart: boolean
  /** Seconds from idle start until first visible, 0 when visible at start. */
  firstVisibleAfterSeconds: number
  /**
   * Seconds from idle start until it first LEAVES visibility — how long the
   * tutorial has, from the moment the satellite settles, before its target
   * drifts out of the margin. Infinity when it never does.
   */
  visibleFromStartSeconds: number
}

/**
 * The visibility of one orbit over a full revolution, from `camera`.
 *
 * Idle motion starts at curve t = 0 — `createOrbitSystem` seeds
 * `idleProgressOffset = 1`, and `(1 + 0) % 1` is where the drawing head
 * finished — and advances at `preset.speed` revolutions per second. The curve
 * is in "Earth radius = 1" units and the orbit group is mounted at
 * `EARTH_CONFIG.radius`, so points are scaled up here, exactly as the scene does.
 */
export function orbitVisibility(
  preset: OrbitPreset,
  camera: THREE.Camera,
  marginNdc = 0,
  samples = 2000,
): OrbitVisibility {
  const curve = new OrbitCurve(preset)
  const point = new THREE.Vector3()
  const seconds = (t: number) => (preset.speed > 0 ? t / preset.speed : Number.POSITIVE_INFINITY)
  let visible = 0
  let visibleAtStart = false
  let firstVisibleAfterSeconds = Number.POSITIVE_INFINITY
  let visibleFromStartSeconds = Number.POSITIVE_INFINITY
  for (let i = 0; i < samples; i += 1) {
    const t = i / samples
    curve.getPoint(t, point).multiplyScalar(EARTH_CONFIG.radius)
    const seen = isPointVisible(camera, point, marginNdc)
    if (i === 0) visibleAtStart = seen
    if (seen) {
      visible += 1
      if (firstVisibleAfterSeconds === Number.POSITIVE_INFINITY) {
        firstVisibleAfterSeconds = seconds(t)
      }
    } else if (visibleAtStart && visibleFromStartSeconds === Number.POSITIVE_INFINITY) {
      visibleFromStartSeconds = seconds(t)
    }
  }
  return {
    fraction: visible / samples,
    visibleAtStart,
    firstVisibleAfterSeconds: visibleAtStart ? 0 : firstVisibleAfterSeconds,
    visibleFromStartSeconds: visibleAtStart ? visibleFromStartSeconds : 0,
  }
}
