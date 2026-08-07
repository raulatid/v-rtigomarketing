import * as THREE from 'three'
import { OrbitCurve } from './orbitUtils'
import { ORBIT_CONFIG, OrbitPreset } from './orbitConfig'

// One visible orbit path with a progressive draw-in via setDrawRange.
export function createOrbitLine(preset: OrbitPreset) {
  const orbitConfig = ORBIT_CONFIG.orbit
  const curve = new OrbitCurve(preset)
  const points = curve.getPoints(orbitConfig.segments)
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  geometry.setDrawRange(0, 0)

  const material = new THREE.LineBasicMaterial({
    color: orbitConfig.lineColor,
    transparent: true,
    opacity: orbitConfig.lineOpacity,
    depthWrite: false,
  })

  const line = new THREE.Line(geometry, material)
  // Nothing culls correctly while drawRange is growing from a zero-extent
  // bounding sphere, and the orbit is always near the Earth anyway.
  line.frustumCulled = false
  const totalPoints = points.length

  function setRevealProgress(progress: number) {
    geometry.setDrawRange(0, Math.floor(progress * totalPoints))
  }

  function dispose() {
    geometry.dispose()
    material.dispose()
  }

  return { curve, line, setRevealProgress, dispose }
}

export type OrbitLine = ReturnType<typeof createOrbitLine>
