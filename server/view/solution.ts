/**
 * Is a reported camera at a stage's vantage point. The one function that knows
 * the answer, and it runs only here.
 *
 * Stillness is not judged: the browser reports only once its camera has rested,
 * and a script can claim stillness as easily as a pose, so checking it here
 * would buy nothing.
 */

import type { Vec3, ViewStage } from './config.js'

export interface ViewSample {
  position: Vec3
  /** Need not be normalised. */
  forward: Vec3
  fov: number
}

export interface ViewDeviation {
  inside: boolean
  distance: number
  angleDegrees: number
  fovDelta: number
}

const RAD_TO_DEG = 180 / Math.PI

/** Measured rather than merely judged, so the authoring overlay can show the margin. */
export function measure(sample: ViewSample, stage: ViewStage): ViewDeviation {
  const [px, py, pz] = sample.position
  const [sx, sy, sz] = stage.position
  const distance = Math.hypot(px - sx, py - sy, pz - sz)

  const [fx, fy, fz] = sample.forward
  const length = Math.hypot(fx, fy, fz)
  const [tx, ty, tz] = stage.forward
  const cos = length > 0 ? (fx * tx + fy * ty + fz * tz) / length : -1
  const angleDegrees = Math.acos(Math.min(1, Math.max(-1, cos))) * RAD_TO_DEG

  const fovDelta = sample.fov - stage.fov
  const { tolerance } = stage
  return {
    inside:
      length > 0 &&
      distance <= tolerance.positionUnits &&
      angleDegrees <= tolerance.angleDegrees &&
      Math.abs(fovDelta) <= tolerance.fovDegrees,
    distance,
    angleDegrees,
    fovDelta,
  }
}

export function evaluatePose(sample: ViewSample, stage: ViewStage): boolean {
  return measure(sample, stage).inside
}
