// @vitest-environment jsdom
import { expect, it } from 'vitest'
import { PerspectiveCamera, Vector3 } from 'three'
import { createFocusCameraRig } from './createFocusCameraRig'
import { advanceDepartureAim, createDepartureAimState } from './departureAim'
import { createCursorManager } from '../../../interaction/cursorManager'
import { INTERACTION_CONFIG } from '../interaction/interactionConfig'
import { EARTH_CONFIG } from '../config/earthConfig'
import { WARP_TRANSITION } from '../../../utils/warpTransition'

// The swing driven through the REAL rig, with a spinning globe and a viewer who
// committed from the far side of it — the case the warp's radial dolly cannot
// survive on its own. Successor to `approachContinuity.test.ts`, which asserted
// the zoom-driven steer this replaced.

const cfg = INTERACTION_CONFIG.camera
const SECONDS = WARP_TRANSITION.earthDepartureAimSeconds
const DESTINATION_PHI = (50 * Math.PI) / 180

function makeRig() {
  const canvas = document.createElement('canvas')
  const camera = new PerspectiveCamera(45, 16 / 9, 0.1, 1000)
  // Theta PI: the destination starts near theta 0, so this is the far side.
  const origin = new Vector3().setFromSphericalCoords(cfg.overviewRadius, Math.PI / 2, Math.PI)
  const rig = createFocusCameraRig({
    camera,
    domElement: canvas,
    cursor: createCursorManager(canvas),
    overviewPose: origin.toArray(),
    onEmptyClick() {},
    isOverSatellite: () => false,
  })
  rig.activate()
  return { rig, camera }
}

function angleBetweenDegrees(a: Vector3, b: Vector3): number {
  return (a.angleTo(b) * 180) / Math.PI
}

for (const fps of [30, 60, 120]) {
  it(`lands the camera above a spinning destination from the far side at ${fps} fps`, () => {
    const { rig, camera } = makeRig()
    const state = createDepartureAimState()
    const angles = { theta: 0, phi: 0 }
    const destination = new Vector3()
    const dt = 1 / fps
    const frames = Math.ceil(SECONDS * fps)
    let worstStepDegrees = 0
    const previous = new Vector3()
    try {
      // Zoomed fully in, and settled there, as a band-end commit leaves it.
      rig.setZoomDepth(1)
      for (let i = 0; i < fps * 3; i++) rig.update(dt)
      previous.copy(camera.position)

      rig.setDepartureLock(true)
      for (let i = 0; i <= frames; i++) {
        const progress = Math.min(1, i / frames)
        const theta = i * dt * EARTH_CONFIG.rotationSpeed
        destination.setFromSphericalCoords(2.06, DESTINATION_PHI, theta)
        advanceDepartureAim(
          state,
          progress,
          rig.getEasedOrbitAngles(angles),
          theta,
          DESTINATION_PHI,
          cfg.phiMin,
          cfg.phiMax,
          angles,
        )
        rig.setOrbitAnglesImmediate(angles.theta, angles.phi)
        rig.update(dt)
        worstStepDegrees = Math.max(worstStepDegrees, angleBetweenDegrees(previous, camera.position))
        previous.copy(camera.position)
      }

      // Exactly above it: the dolly that follows is radial and keeps this line.
      expect(angleBetweenDegrees(camera.position, destination)).toBeLessThan(0.01)
      // An in-out cubic peaks at 3x its mean rate (12t^2 at t = 0.5), and a half
      // turn is the longest swing there is. Anything much past that is a jump
      // rather than a turn.
      const meanStep = 180 / frames
      expect(worstStepDegrees).toBeLessThan(meanStep * 3.1)
    } finally {
      rig.dispose()
    }
  })
}

it('does not move the camera on its first frame', () => {
  const { rig, camera } = makeRig()
  const state = createDepartureAimState()
  const angles = { theta: 0, phi: 0 }
  try {
    rig.setOrbitAnglesImmediate(Math.PI, Math.PI / 2)
    rig.update(1 / 60)
    const before = camera.position.clone()

    rig.setDepartureLock(true)
    advanceDepartureAim(state, 0, rig.getEasedOrbitAngles(angles), 0, DESTINATION_PHI, cfg.phiMin, cfg.phiMax, angles)
    rig.setOrbitAnglesImmediate(angles.theta, angles.phi)
    rig.update(1 / 60)

    expect(angleBetweenDegrees(before, camera.position)).toBeLessThan(0.01)
  } finally {
    rig.dispose()
  }
})
