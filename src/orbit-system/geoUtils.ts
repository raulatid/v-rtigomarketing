import * as THREE from 'three'

// Offset validated at 0 against this project's Earth texture, which is the same
// asset earth-connections uses. Adjust THIS — never the city coordinates — if
// markers ever appear shifted relative to the map.
export const LONGITUDE_OFFSET = 0

export function latLngToVector3(lat: number, lng: number, radius: number): THREE.Vector3 {
  const phi = THREE.MathUtils.degToRad(90 - lat)
  const theta = THREE.MathUtils.degToRad(lng + 180 + LONGITUDE_OFFSET)

  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  )
}
