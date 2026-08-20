import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  DESTINATION,
  DESTINATION_SURFACE_OFFSET,
  destinationLocalPosition,
  destinationWorldPosition,
} from './destination'
import { latLngToVector3 } from '../orbit/geoUtils'

// The navigation destination replaced the marker system (the tag, the dot, the
// hover raycast — all deleted). The warp still has to aim at the real city, so
// these assertions carry over from orbitConfig.test.ts, where they guarded
// DESTINATION_MARKER, plus a parity proof against the scene-graph object the
// marker used to be.

describe('DESTINATION', () => {
  it('is Murcia, at the real coordinates', () => {
    expect(DESTINATION.id).toBe('murcia')
    expect(DESTINATION.lat).toBeCloseTo(37.99, 1)
    expect(DESTINATION.lng).toBeCloseTo(-1.13, 1)
  })

  it('stays inside valid geographic ranges', () => {
    expect(DESTINATION.lat).toBeGreaterThanOrEqual(-90)
    expect(DESTINATION.lat).toBeLessThanOrEqual(90)
    expect(DESTINATION.lng).toBeGreaterThanOrEqual(-180)
    expect(DESTINATION.lng).toBeLessThanOrEqual(180)
  })
})

describe('destinationLocalPosition', () => {
  it('sits just above the Earth surface at the destination', () => {
    const earthRadius = 2
    const expected = latLngToVector3(
      DESTINATION.lat,
      DESTINATION.lng,
      DESTINATION_SURFACE_OFFSET * earthRadius,
    )
    const actual = destinationLocalPosition(earthRadius, new THREE.Vector3())
    expect(actual.distanceTo(expected)).toBeLessThan(1e-12)
  })

  it('writes into and returns the given target', () => {
    const target = new THREE.Vector3()
    const returned = destinationLocalPosition(2, target)
    expect(returned).toBe(target)
    expect(target.lengthSq()).toBeGreaterThan(0)
  })
})

describe('destinationWorldPosition', () => {
  it('tracks the spinning Earth exactly as the old marker child object did', () => {
    // The marker was: spin group > layer group (scale = earthRadius) > dot at
    // latLngToVector3(lat, lng, 1.03). Its world position is the ground truth
    // the resolver must reproduce without any scene-graph object.
    const earthRadius = 2
    const spin = new THREE.Group()
    spin.position.set(0.4, -1.2, 3)
    spin.rotation.y = 1.234

    const layer = new THREE.Group()
    layer.scale.setScalar(earthRadius)
    const dot = new THREE.Object3D()
    dot.position.copy(
      latLngToVector3(DESTINATION.lat, DESTINATION.lng, DESTINATION_SURFACE_OFFSET),
    )
    spin.add(layer)
    layer.add(dot)

    const legacy = dot.getWorldPosition(new THREE.Vector3())
    const actual = destinationWorldPosition(spin, earthRadius, new THREE.Vector3())
    expect(actual.distanceTo(legacy)).toBeLessThan(1e-12)
  })

  it('follows a rotation applied after the last matrix update', () => {
    // getWorldPosition on the old dot forced a fresh parent-chain update; the
    // resolver must be no staler, or the warp would aim at where the city WAS.
    const spin = new THREE.Group()
    const before = destinationWorldPosition(spin, 2, new THREE.Vector3())
    spin.rotation.y = Math.PI / 2
    const after = destinationWorldPosition(spin, 2, new THREE.Vector3())
    expect(after.distanceTo(before)).toBeGreaterThan(0.1)
  })
})
