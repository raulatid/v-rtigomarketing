import * as THREE from 'three'
import { latLngToVector3 } from '../orbit/geoUtils'

// The navigation destination: where the Earth leg of the warp aims, and the
// place the globe turns to face at rest (EarthScene's spinToFace).
//
// This used to be DESTINATION_MARKER in orbitConfig, feeding a marker system —
// a pulsing dot, a hover tag reading "Explorar la ciudad →", a raycast and a
// cursor hint. The product removed all of that: after `adr/009` navigation is a
// gesture, so a marker that looked clickable but wasn't was a false affordance,
// and one hidden as an invisible anchor would have been a UI object kept alive
// purely as a navigation dependency. Navigation destination ≠ UI marker; the
// warp consumes THIS data directly.
//
// Singular, not a list, for the reason the marker's config recorded: the
// destination is navigation, and a second one would mean an ambiguous entry
// point rather than more content.
export const DESTINATION = {
  id: 'murcia',
  // Real coordinates for Murcia, Spain — the warp has to aim at the actual
  // city for the globe to mean anything.
  lat: 37.9922,
  lng: -1.1307,
} as const

// Fraction of the Earth radius the aim point sits above the surface. 1.03 is
// the altitude the marker dot had (ORBIT_CONFIG.markers.radius), kept so the
// warp's look-at is bit-identical to what it aimed at before the marker went.
export const DESTINATION_SURFACE_OFFSET = 1.03

/**
 * Writes the destination's current world position into `target` and returns
 * it. The shape CameraController consumes: EarthScene publishes one of these
 * (closing over its spin group), so the camera never sees the scene graph.
 */
export type DestinationResolver = (target: THREE.Vector3) => THREE.Vector3

/**
 * The destination in the spin group's local space, in scene units.
 *
 * `earthRadius` is the Earth's scene radius (EARTH_CONFIG.radius) — the
 * lat/lng maths works on the unit sphere, so the caller says how big the
 * planet actually is.
 */
export function destinationLocalPosition(
  earthRadius: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  return target.copy(
    latLngToVector3(DESTINATION.lat, DESTINATION.lng, DESTINATION_SURFACE_OFFSET * earthRadius),
  )
}

/**
 * The destination in world space, right now.
 *
 * World, not local: the destination turns with the Earth's surface, so only
 * the world position says where the city actually is this frame. The parent
 * chain is refreshed first — the same guarantee Object3D.getWorldPosition gave
 * the marker dot — so a spin applied since the last render is not missed.
 */
export function destinationWorldPosition(
  spinGroup: THREE.Object3D,
  earthRadius: number,
  target: THREE.Vector3,
): THREE.Vector3 {
  spinGroup.updateWorldMatrix(true, false)
  return destinationLocalPosition(earthRadius, target).applyMatrix4(spinGroup.matrixWorld)
}
