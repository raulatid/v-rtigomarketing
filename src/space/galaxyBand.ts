import * as THREE from 'three'

// The galaxy's plane. This is the single term shared by the star distribution
// and the nebula shader, and sharing it is the whole design: it is what makes
// the result read as one galaxy seen from inside rather than as two unrelated
// effects layered on each other.
//
// THE GLSL TWIN. `bandDensity` below is duplicated in
// `src/shaders/nebula/bake.frag.glsl`. The formula is deliberately one line so
// the duplication cannot hide a discrepancy, and the two PARAMETERS (axis,
// width) are not duplicated at all — the shader receives them as uniforms
// derived from these same functions, so the only thing that could drift is the
// gaussian itself. If you change it here, change it there.
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
