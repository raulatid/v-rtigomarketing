import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { billboardBottom } from './billboardBounds'

describe('shader billboard bounds', () => {
  const rect = { left: 0, top: 20, width: 400, height: 800 }
  it('uses camera-aligned edges even when the parent is rotated and scaled', () => {
    const camera = new THREE.PerspectiveCamera(90, 0.5, 0.1, 100)
    camera.position.z = 10
    const parent = new THREE.Group()
    parent.rotation.z = Math.PI / 2
    parent.scale.setScalar(2)
    const quad = new THREE.Object3D()
    quad.scale.y = 3
    parent.add(quad)
    // The shader's bottom is 3 units below centre, irrespective of rotation.
    expect(billboardBottom(quad, camera, rect, -0.5, new THREE.Vector3())).toBeCloseTo(540)
  })
  it('includes the offset artwork field within the larger transparent quad', () => {
    const camera = new THREE.PerspectiveCamera(90, 0.5, 0.1, 100)
    camera.position.z = 10
    const quad = new THREE.Object3D()
    quad.scale.y = 4
    expect(billboardBottom(quad, camera, rect, 0.1, new THREE.Vector3())).toBeCloseTo(404)
  })
  it('does not return misleading coordinates for a logo behind the camera', () => {
    const camera = new THREE.PerspectiveCamera(90, 0.5, 0.1, 100)
    const quad = new THREE.Object3D()
    quad.position.z = 1
    expect(billboardBottom(quad, camera, rect, -0.5, new THREE.Vector3())).toBeNull()
  })
})
