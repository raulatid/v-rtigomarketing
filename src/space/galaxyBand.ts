import * as THREE from 'three'

// The galaxy's plane. This is the single term shared by the star distribution
// and the sky panorama, and sharing it is the whole design: it is what makes
// the result read as one galaxy seen from inside rather than as two unrelated
// effects layered on each other.
//
// `bandDensity` used to have a hand-maintained GLSL twin in the procedural
// nebula's bake shader. That shader is gone — the sky is a photograph now — so
// the gaussian exists once, here, and the shader's only remaining share of this
// module is the orientation matrix below. One less thing that can drift.
//
// Nothing in this module may import a `.glsl` file or touch `window`: it is
// bundled into `checks/space-backdrop.ts` and run in Node.

export const GALAXY_BAND = {
  // Degrees away from a horizontal band. 0 puts the galactic plane on the XZ
  // plane; the default tips it so the band cuts the frame diagonally rather
  // than sitting level with the Earth's equator.
  defaultTilt: 22,
  // Half-width of the gaussian, in units of `dot(direction, axis)`.
  //
  // Tuned down from 0.35 on the evidence of a screenshot: 0.35 puts the band's
  // edges about 41 degrees off the plane, so against a 45 degree FOV the gas
  // ran past both edges of the frame and there was no dark sky to read it
  // against. A band you cannot see the edge of is not a band.
  defaultWidth: 0.22,
  // Rotation about the galactic pole, in degrees — which stretch of the Milky
  // Way ends up behind the Earth. Purely compositional: it changes the view,
  // never the geometry, and the star field is invariant under it because the
  // band is rotationally symmetric about its own axis.
  //
  // At 0 the default camera (down -Z) looks at u = 0.25 of the panorama, a
  // plain stretch of the band. u falls by 1/360 per degree of yaw, so 270 puts
  // the galactic core — u = 0.5, the brightest and most structured thing in the
  // sky — dead centre, which is exactly where the Earth is and therefore the
  // one place it cannot be seen.
  //
  // 250 offsets it by about 0.055 in u. The 16:9 frame spans ~0.2 at a 45
  // degree vertical FOV and the Earth covers roughly the middle 0.04 of that,
  // so the core clears the planet and still sits well inside the frame.
  defaultYaw: 250,
} as const

/** The galactic pole. Unit length by construction, at any tilt. */
export function bandAxis(tiltDegrees: number): THREE.Vector3 {
  const t = THREE.MathUtils.degToRad(tiltDegrees)
  return new THREE.Vector3(Math.sin(t), Math.cos(t), 0).normalize()
}

/**
 * 1 on the galactic plane, falling off as a gaussian toward the poles.
 *
 * `direction` need not be normalised. A zero-length direction returns 0 rather
 * than NaN — a NaN here would propagate into every star position downstream and
 * silently empty the sky.
 */
export function bandDensity(
  direction: THREE.Vector3,
  axis: THREE.Vector3,
  width: number,
): number {
  const length = direction.length()
  if (length === 0) return 0
  const d = direction.dot(axis) / length
  const t = d / width
  return Math.exp(-t * t)
}

/**
 * World direction -> panorama direction, for the equirect sky shell.
 *
 * The shipped panorama is in GALACTIC coordinates: its galactic plane sits on
 * the horizontal centreline, which under the equirect mapping in
 * `shell.frag.glsl` means its pole is +Y. The scene's pole is `bandAxis(tilt)`,
 * because that is where the star distribution puts the band. This is the
 * rotation that reconciles the two, and it is the ONLY thing keeping the
 * photographed gas and the generated stars on the same galaxy.
 *
 * Composed as yaw-about-the-pole THEN pole-to-+Y, so `yawDegrees` spins the sky
 * about its own axis rather than about the world's.
 *
 * If a celestial/equatorial panorama is ever substituted, the fixed
 * galactic->equatorial rotation composes on the right of this and nothing else
 * changes.
 */
export function skyOrientation(tiltDegrees: number, yawDegrees: number): THREE.Matrix3 {
  const toPole = new THREE.Quaternion().setFromUnitVectors(
    bandAxis(tiltDegrees),
    new THREE.Vector3(0, 1, 0),
  )
  // Applied after, so it is a rotation about the panorama's own pole (+Y).
  const yaw = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    THREE.MathUtils.degToRad(yawDegrees),
  )
  return new THREE.Matrix3().setFromMatrix4(
    new THREE.Matrix4().makeRotationFromQuaternion(yaw.multiply(toPole)),
  )
}
