import * as THREE from 'three'

// Offset validated at 0 against this project's Earth texture, which is the same
// asset earth-connections uses. Adjust THIS — never the city coordinates — if
// markers ever appear shifted relative to the map.
export const LONGITUDE_OFFSET = 0

/**
 * The Y rotation that turns a lat/lng to face the camera, which sits on +Z.
 *
 * Derivation: rotating a point about Y by θ maps its angle from +Z, a, to
 * a + θ. So facing the camera means θ = -a, where a = atan2(x, z).
 *
 * Computed from the coordinates rather than hardcoded, so moving a destination
 * marker cannot silently leave the Earth pointing at the wrong place.
 */
export function spinToFace(lat: number, lng: number): number {
  const p = latLngToVector3(lat, lng, 1)
  return -Math.atan2(p.x, p.z)
}

export function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat)
  const theta = THREE.MathUtils.degToRad(lng + 180 + LONGITUDE_OFFSET)

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}
