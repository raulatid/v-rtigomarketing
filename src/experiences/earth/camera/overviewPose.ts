import { INTERACTION_CONFIG } from '../interaction/interactionConfig'

/**
 * The overview camera's resting point, as a position.
 *
 * One function so the intro's landing point (`CameraController.EARTH_REST`),
 * the rig's overview pose, and the Node harnesses all derive the same vector
 * from the same three config numbers — radius, theta, phi — and cannot drift
 * apart. The rig reads the angles back out of this vector with
 * `THREE.Spherical`, so the convention here has to be three.js's own:
 *
 *     x = r · sin φ · sin θ,   y = r · cos φ,   z = r · sin φ · cos θ
 *
 * `radius` is a parameter because the arriving warp's far point is the same
 * direction further out (`EARTH_FAR`): the dolly then pulls straight in along
 * the view ray, whatever the rest orientation is.
 *
 * No three.js import: `checks/earth-orbit.ts` bundles this for Node.
 */
export function overviewRestPosition(
  radius = INTERACTION_CONFIG.camera.overviewRadius,
  cfg = INTERACTION_CONFIG.camera,
): [number, number, number] {
  const theta = (cfg.overviewThetaDegrees * Math.PI) / 180
  const phi = (cfg.overviewPhiDegrees * Math.PI) / 180
  const sinPhi = Math.sin(phi)
  return [radius * sinPhi * Math.sin(theta), radius * Math.cos(phi), radius * sinPhi * Math.cos(theta)]
}
