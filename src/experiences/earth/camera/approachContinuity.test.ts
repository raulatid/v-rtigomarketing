// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { createFocusCameraRig } from './createFocusCameraRig'
import { advanceOrbitSteer, createOrbitSteerState, isAboveDestination, EARTH_DEPARTURE_ALIGN_DEGREES } from './destinationSteer'
import { createCursorManager } from '../../../interaction/cursorManager'
import { INTERACTION_CONFIG } from '../interaction/interactionConfig'
import { EARTH_CONFIG } from '../config/earthConfig'
import { WARP_LIMITS } from '../../../utils/warpTransition'
import { earthZoomRadius } from './zoomPose'

// Exercise the actual steering + rig, including camera lag and a spinning globe.
// Navigation observes this camera on the next frame, just as the app does.
for (const fps of [30, 60, 120]) {
  for (const gestureSeconds of [0, 0.3, 0.6, 1.2]) {
    it(`keeps the approach moving through alignment at ${fps} fps / ${gestureSeconds}s zoom`, () => {
      const cfg = INTERACTION_CONFIG.camera
      const canvas = document.createElement('canvas')
      const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 1000)
      const origin = new Vector3().setFromSphericalCoords(cfg.overviewRadius, Math.PI / 2, Math.PI)
      const rig = createFocusCameraRig({
        camera, domElement: canvas, cursor: createCursorManager(canvas),
        overviewPose: origin.toArray(), onEmptyClick() {}, isOverSatellite: () => false,
      })
      rig.activate()
      const state = createOrbitSteerState()
      const angles = { theta: 0, phi: 0 }
      const destination = new Vector3()
      let alignedAt = Infinity
      let radialTravelLeft = 0
      const dt = 1 / fps
      try {
        for (let i = 1; i <= Math.ceil((gestureSeconds + 1) * fps); i++) {
          const time = i * dt
          const depth = gestureSeconds === 0 ? 1 : Math.min(1, time / gestureSeconds)
          const theta = time * EARTH_CONFIG.rotationSpeed
          const phi = 50 * Math.PI / 180
          destination.setFromSphericalCoords(2.06, phi, theta)
          rig.setZoomDepth(depth)
          rig.setApproachLock(depth > WARP_LIMITS.earthGuideStart)
          rig.getOrbitAngles(angles)
          advanceOrbitSteer(state, {
            bandDepth: depth, limits: WARP_LIMITS, destinationTheta: theta,
            destinationPhi: phi, focused: false, phiMin: cfg.phiMin, phiMax: cfg.phiMax,
          }, angles)
          rig.setOrbitAngles(angles.theta, angles.phi)
          rig.update(dt)
          if (depth === 1 && isAboveDestination(camera.position, destination, EARTH_DEPARTURE_ALIGN_DEGREES)) {
            alignedAt = time
            radialTravelLeft = camera.position.length() - earthZoomRadius(1)
            break
          }
        }
        // Even a fast full-band gesture must not leave a stationary camera
        // waiting for its turn: alignment finishes during the radial approach.
        expect(alignedAt - gestureSeconds).toBeLessThan(gestureSeconds === 0 ? 0.45 : 0.3)
        expect(radialTravelLeft).toBeGreaterThan(0.1)
        if (gestureSeconds >= 1.2) expect(alignedAt - gestureSeconds).toBeLessThanOrEqual(dt + 1e-6)
      } finally {
        rig.dispose()
      }
    })
  }
}
