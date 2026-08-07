import * as THREE from 'three'
import { ORBIT_CONFIG } from './orbitConfig'
import { createCircleTexture } from './orbitUtils'
// Deterministic even distribution — no runtime randomness, so the cloud looks
// identical on every load. Lifted to a shared util when the space backdrop
// needed the same distribution (plan 004 §5); the zero-jitter path is
// numerically identical to the local version it replaced.
import { fibonacciSpherePoints } from '../utils/fibonacciSphere'

export function createConnectivityCloud() {
  const cloudConfig = ORBIT_CONFIG.cloud

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute(
    'position',
    new THREE.BufferAttribute(
      fibonacciSpherePoints(cloudConfig.pointCount, cloudConfig.radius),
      3,
    ),
  )

  const material = new THREE.PointsMaterial({
    color: cloudConfig.color,
    size: cloudConfig.size,
    sizeAttenuation: true,
    map: createCircleTexture(64),
    alphaTest: 0.5,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })

  const points = new THREE.Points(geometry, material)

  function update(delta: number, elapsed: number) {
    points.rotation.y += delta * cloudConfig.rotationSpeedY
    points.rotation.x += delta * cloudConfig.rotationSpeedX

    const fadeIn = THREE.MathUtils.clamp(elapsed / cloudConfig.fadeInDuration, 0, 1)
    const pulse = 1 + Math.sin(elapsed * 0.6) * cloudConfig.pulseStrength
    material.opacity = cloudConfig.opacity * fadeIn * pulse
  }

  function reset() {
    material.opacity = 0
    points.rotation.set(0, 0, 0)
  }

  function dispose() {
    geometry.dispose()
    material.map?.dispose()
    material.dispose()
  }

  return { points, update, reset, dispose }
}

export type ConnectivityCloud = ReturnType<typeof createConnectivityCloud>
