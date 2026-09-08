import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { NavigableArea } from './navigableArea'
import { murciaConfig } from '../config/murciaConfig'
import type { BoundsRect } from '../config/environmentConfig'

// These properties were unreachable while the pipeline lived as six fields on
// MurciaExperience: asserting any of them meant constructing a WebGL renderer, a
// DOM container and a loaded GLB. The two pointer harnesses cover the pipeline's
// OUTPUT through the real controller; this covers the derivation itself.

const nav = murciaConfig.navigation

/** A plate offset from the origin, so an inset cannot pass by symmetry. */
const PLATE: BoundsRect = { minX: -200, maxX: 120, minZ: -160, maxZ: 90 }

function terrainAt(rect: BoundsRect): THREE.Mesh {
  const width = rect.maxX - rect.minX
  const depth = rect.maxZ - rect.minZ
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, 0.1, depth))
  mesh.position.set((rect.minX + rect.maxX) / 2, 0, (rect.minZ + rect.maxZ) / 2)
  mesh.updateMatrixWorld(true)
  return mesh
}

describe('NavigableArea', () => {
  describe('the plate', () => {
    it('measures the terrain mesh on XZ, ignoring its height', () => {
      const area = new NavigableArea(nav)
      area.setPlateFromObject(terrainAt(PLATE))
      const plate = area.plateBounds!
      expect(plate.minX).toBeCloseTo(PLATE.minX, 6)
      expect(plate.maxX).toBeCloseTo(PLATE.maxX, 6)
      expect(plate.minZ).toBeCloseTo(PLATE.minZ, 6)
      expect(plate.maxZ).toBeCloseTo(PLATE.maxZ, 6)
    })
  })

  describe('the configured area', () => {
    it('insets the plate when the config derives bounds from terrain', () => {
      const area = new NavigableArea({ ...nav, deriveBoundsFromTerrain: true, boundsInset: 20 })
      area.setPlateFromObject(terrainAt(PLATE))
      area.deriveConfigured(nav.bounds)

      const c = area.configuredBounds!
      // Inset PULLS IN on every side — expandRect by a negative amount.
      expect(c.minX).toBeCloseTo(PLATE.minX + 20, 6)
      expect(c.maxX).toBeCloseTo(PLATE.maxX - 20, 6)
      expect(c.minZ).toBeCloseTo(PLATE.minZ + 20, 6)
      expect(c.maxZ).toBeCloseTo(PLATE.maxZ - 20, 6)
    })

    it('falls back to the authored rectangle when no plate was found', () => {
      // The honest failure: the config assumed the asset carries a terrain
      // mesh and it does not. Deriving from nothing would give an empty area.
      const area = new NavigableArea({ ...nav, deriveBoundsFromTerrain: true })
      area.deriveConfigured(nav.bounds)
      expect(area.configuredBounds).toEqual(nav.bounds)
    })

    it('ignores the plate when the config authored its own bounds', () => {
      const area = new NavigableArea({ ...nav, deriveBoundsFromTerrain: false })
      area.setPlateFromObject(terrainAt(PLATE))
      area.deriveConfigured(nav.bounds)
      expect(area.configuredBounds).toEqual(nav.bounds)
    })

    it('copies the fallback rather than aliasing the config object', () => {
      // murciaConfig.navigation.bounds is shared module state; handing it out by
      // identity would let a later mutation corrupt the session's config.
      const area = new NavigableArea({ ...nav, deriveBoundsFromTerrain: false })
      area.deriveConfigured(nav.bounds)
      expect(area.configuredBounds).not.toBe(nav.bounds)
    })
  })

  describe('when there is no terrain skirt', () => {
    it('uses the plate as the visual extent', () => {
      const area = new NavigableArea(nav)
      area.setPlateFromObject(terrainAt(PLATE))
      area.disableFootprintInsets(murciaConfig.contentBounds)

      const visual = area.visualBounds!
      expect(visual.minX).toBeCloseTo(PLATE.minX, 6)
      expect(visual.maxZ).toBeCloseTo(PLATE.maxZ, 6)
    })

    it('falls back to the content bounds when there is no plate either', () => {
      const area = new NavigableArea(nav)
      area.disableFootprintInsets(murciaConfig.contentBounds)
      expect(area.visualBounds).toEqual(murciaConfig.contentBounds)
    })

    it('drops the footprint inset but keeps the station term', () => {
      // The whole point of disabling the footprint inset: applying it against a
      // raw plate edge collapses navigation to a sliver. An honest usable area
      // beats a silently unusable one.
      //
      // The station term is NOT part of that bargain (DECISIONS §39). Being
      // unable to hide the plate edge is a reason to accept seeing it; it is not
      // a reason to let the camera stand off the plate entirely. This assertion
      // is what stops the flag being widened back into "no insets at all".
      const area = new NavigableArea({ ...nav, deriveBoundsFromTerrain: false })
      area.setPlateFromObject(terrainAt(PLATE))
      area.disableFootprintInsets(murciaConfig.contentBounds)
      area.deriveConfigured(nav.bounds)

      // 120 units north of the focus and well above it: the camera would sit
      // past the plate's +Z edge for any focus in the top 120 units of it.
      const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 5000)
      camera.position.set(0, 120, 120)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld(true)

      const c = area.configuredBounds!
      const effective = area.recompute(camera, new THREE.Vector3(0, 0, 0))!

      // X is untouched: the camera has no X offset here, so nothing constrains it.
      expect(effective.minX).toBeCloseTo(c.minX + nav.edgeSafetyMargin, 6)
      expect(effective.maxX).toBeCloseTo(c.maxX - nav.edgeSafetyMargin, 6)
      // +Z is pulled in by the whole offset: focus.z + 120 must stay on the plate.
      expect(effective.maxZ).toBeCloseTo(c.maxZ - 120 - nav.edgeSafetyMargin, 6)
      expect(effective.minZ).toBeCloseTo(c.minZ, 6)
    })
  })

  // DECISIONS §39. The camera offset depends only on yaw, pitch and distance and
  // never on the focus, so "the eye is inside R" is itself a rectangle in focus
  // space — which is why this is one more intersection and not a solver.
  describe('the station term', () => {
    function areaWithSkirt(): NavigableArea {
      const area = new NavigableArea({ ...nav, deriveBoundsFromTerrain: false })
      area.setPlateFromObject(terrainAt(PLATE))
      // Generous, so the footprint term cannot bind and the station term is the
      // only thing under test.
      area.setVisualBounds({ minX: -5000, maxX: 5000, minZ: -5000, maxZ: 5000 })
      area.deriveConfigured(nav.bounds)
      return area
    }

    function cameraAt(x: number, y: number, z: number): THREE.PerspectiveCamera {
      const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 5000)
      camera.position.set(x, y, z)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld(true)
      return camera
    }

    it('shifts the area one-sidedly, in the direction the camera stands', () => {
      // The load-bearing property. A symmetric shrink would cost 2x the offset
      // and collapse Murcia's 352-unit plate outright; the camera is on ONE side,
      // so the surviving width is `width - offset`.
      const area = areaWithSkirt()
      const c = area.configuredBounds!
      const e = area.recompute(cameraAt(150, 100, 0), new THREE.Vector3(0, 0, 0))!

      expect(e.maxX).toBeCloseTo(c.maxX - 150 - nav.edgeSafetyMargin, 6)
      expect(e.minX).toBeCloseTo(c.minX, 6)
      expect(e.maxX - e.minX).toBeCloseTo(c.maxX - c.minX - 150 - nav.edgeSafetyMargin, 6)
    })

    it('keeps the camera on the plate at the most permissive focus', () => {
      const area = areaWithSkirt()
      const c = area.configuredBounds!
      const offsetX = 150
      const offsetZ = -90
      const e = area.recompute(cameraAt(offsetX, 100, offsetZ), new THREE.Vector3(0, 0, 0))!

      // Drive the focus to every corner it is now allowed to reach and place the
      // camera there. This is the invariant the whole term exists for.
      for (const [fx, fz] of [
        [e.minX, e.minZ],
        [e.maxX, e.minZ],
        [e.minX, e.maxZ],
        [e.maxX, e.maxZ],
      ]) {
        expect(fx! + offsetX).toBeGreaterThanOrEqual(c.minX)
        expect(fx! + offsetX).toBeLessThanOrEqual(c.maxX)
        expect(fz! + offsetZ).toBeGreaterThanOrEqual(c.minZ)
        expect(fz! + offsetZ).toBeLessThanOrEqual(c.maxZ)
      }
    })

    it('collapses rather than inverts when the offset outruns the plate', () => {
      // An inverted rectangle makes every clamp comparison meaningless and so
      // removes the limits entirely — the one outcome worse than a pinned focus.
      const area = areaWithSkirt()
      const c = area.configuredBounds!
      const tooFar = (c.maxX - c.minX) * 2
      const e = area.recompute(cameraAt(tooFar, 400, 0), new THREE.Vector3(0, 0, 0))!

      expect(e.minX).toBeLessThanOrEqual(e.maxX)
      expect(e.minZ).toBeLessThanOrEqual(e.maxZ)
    })

    it('follows the camera when only the yaw changes', () => {
      // The area is a function of the POSE, not of the plate alone. This is why
      // `onYawChanged` recomputes: a turn moves the eye without moving the focus.
      const area = areaWithSkirt()
      const north = { ...area.recompute(cameraAt(0, 100, 140), new THREE.Vector3())! }
      const south = { ...area.recompute(cameraAt(0, 100, -140), new THREE.Vector3())! }

      expect(north.maxZ).toBeLessThan(south.maxZ)
      expect(north.minZ).toBeLessThan(south.minZ)
    })
  })

  describe('recompute', () => {
    it('returns null until both the visual and configured areas exist', () => {
      const area = new NavigableArea(nav)
      const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 5000)
      camera.updateMatrixWorld(true)
      expect(area.recompute(camera, new THREE.Vector3())).toBeNull()

      area.deriveConfigured(nav.bounds)
      // Configured alone is not enough — without a visual extent there is
      // nothing for the footprint to be held inside of.
      expect(area.recompute(camera, new THREE.Vector3())).toBeNull()
    })

    it('never widens the configured area', () => {
      // The footprint may only pull the area IN. A recompute that grew it would
      // let the camera see past the ground it was inset from.
      const area = new NavigableArea({ ...nav, deriveBoundsFromTerrain: true })
      area.setPlateFromObject(terrainAt(PLATE))
      area.setVisualBounds({ minX: -240, maxX: 160, minZ: -200, maxZ: 130 })
      area.deriveConfigured(nav.bounds)

      const camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 5000)
      camera.position.set(0, 140, 140)
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld(true)

      const c = area.configuredBounds!
      const e = area.recompute(camera, new THREE.Vector3(0, 0, 0))!
      expect(e.minX).toBeGreaterThanOrEqual(c.minX)
      expect(e.maxX).toBeLessThanOrEqual(c.maxX)
      expect(e.minZ).toBeGreaterThanOrEqual(c.minZ)
      expect(e.maxZ).toBeLessThanOrEqual(c.maxZ)
    })
  })

  describe('initialBounds', () => {
    it('prefers effective, then configured, then the caller fallback', () => {
      const fallback: BoundsRect = { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }
      const area = new NavigableArea({ ...nav, deriveBoundsFromTerrain: false })

      // Nothing derived yet: the controller still has to be given something.
      expect(area.initialBounds(fallback)).toEqual(fallback)

      area.deriveConfigured(nav.bounds)
      expect(area.initialBounds(fallback)).toEqual(nav.bounds)
    })
  })
})
