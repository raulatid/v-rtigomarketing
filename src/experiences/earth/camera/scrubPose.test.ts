import { describe, it, expect } from 'vitest'
import * as THREE from 'three'
import { applyScrubPose } from './scrubPose'
import { SCRUB_CEILING, WARP_TRANSITION, scrubProgress } from '../../../app/warpTransition'

// The post-rig modifier. What matters is that it COMPOSES with whatever pose the
// rig just wrote rather than replacing it — that is the whole reason it exists
// separately from CameraController's cinematic override, and the reason Earth's
// orbit no longer has to freeze for the length of a gesture.

const ORIGIN = new THREE.Vector3(0, 0, 0)
const START_DISTANCE = 100

function cameraAt(x: number, y: number, z: number) {
  const cam = new THREE.PerspectiveCamera(WARP_TRANSITION.earthRestFov, 16 / 9, 0.1, 5000)
  cam.position.set(x, y, z)
  cam.lookAt(ORIGIN)
  cam.updateProjectionMatrix()
  return cam
}

/**
 * How much bigger the Earth actually gets on screen.
 *
 * Distance alone is not the answer and assuming it was is what this module got
 * wrong: angular size goes as `1/distance` AND as `1/tan(fov/2)`, so a dolly and
 * a widening lens fight. This is the number the viewer's eye reports, and it is
 * the only one a gesture that means "closer" can be judged against.
 */
function onScreenScale(cam: THREE.PerspectiveCamera) {
  const tan = (deg: number) => Math.tan((deg * Math.PI) / 360)
  return (
    (START_DISTANCE / cam.position.length()) *
    (tan(WARP_TRANSITION.earthRestFov) / tan(cam.fov))
  )
}

describe('applyScrubPose', () => {
  it('costs nothing at rest', () => {
    // Called unconditionally every frame, so the resting case has to be free AND
    // has to leave the rig's pose untouched to the last bit.
    const cam = cameraAt(0, 0, 100)
    applyScrubPose(cam, 0, ORIGIN)
    expect(cam.position.toArray()).toEqual([0, 0, 100])
    expect(cam.fov).toBe(WARP_TRANSITION.earthRestFov)
  })

  it('keeps the orbit the viewer dragged to, and only changes the distance', () => {
    // The failure this catches: scaling in world axes instead of along the
    // camera's own, which would swing an off-axis viewer back toward the pole.
    const cam = cameraAt(60, 40, 80)
    const before = cam.position.clone().normalize()
    applyScrubPose(cam, SCRUB_CEILING, ORIGIN)
    const after = cam.position.clone().normalize()
    expect(after.angleTo(before)).toBeLessThan(1e-6)
  })

  it('closes on the planet by the full band amount', () => {
    const cam = cameraAt(0, 0, 100)
    applyScrubPose(cam, SCRUB_CEILING, ORIGIN)
    // 63% — the same number checks/warp-transition.ts section 7 reports.
    expect(cam.position.length()).toBeCloseTo(63.0, 1)
  })

  it('moves monotonically inward as the gesture grows', () => {
    let previous = Infinity
    for (const g of [0.1, 0.25, 0.5, 0.75, 1]) {
      const cam = cameraAt(0, 0, 100)
      applyScrubPose(cam, scrubProgress(g), ORIGIN)
      expect(cam.position.length()).toBeLessThan(previous)
      previous = cam.position.length()
    }
  })

  it('leaves the FOV at rest — the surge belongs to the cinematic', () => {
    // This wrote `earthFov(progress)` until 2026-08-25, for continuity with the
    // cinematic. It was cancelling the gesture: the surge reaches 59.5 deg at the
    // top of the band, which de-magnifies by x0.725 against the dolly's x1.587.
    // The continuity is bought back at the commit instead, by the FOV catch-up in
    // CameraController.
    const cam = cameraAt(0, 0, 100)
    applyScrubPose(cam, SCRUB_CEILING, ORIGIN)
    expect(cam.fov).toBe(WARP_TRANSITION.earthRestFov)
  })

  it('grows the Earth on screen monotonically, to x1.587 at the ceiling', () => {
    // THE assertion this module exists to satisfy, and the one that was false
    // while the surge was applied here: net scale then ran 1.00 -> 1.18 -> 1.15,
    // peaking at half a gesture and going BACKWARDS after it. A gesture whose
    // whole meaning is "bring it closer" cannot shrink what it is driving.
    let previous = 1
    for (const g of [0.1, 0.25, 0.5, 0.75, 1]) {
      const cam = cameraAt(0, 0, START_DISTANCE)
      applyScrubPose(cam, scrubProgress(g), ORIGIN)
      const scale = onScreenScale(cam)
      expect(scale).toBeGreaterThan(previous)
      previous = scale
    }
    expect(previous).toBeCloseTo(1.587, 2)
  })

  it('re-aims at the point the rig used, not at the origin', () => {
    // The rig eases its aim, so mid-return from a close-up the look-at is
    // genuinely somewhere else. Assuming the origin here would leave the camera
    // pointing at whatever it was aimed at BEFORE the dolly, which after a
    // radial move is no longer the rig's target.
    //
    // Note the dolly is radial about the world origin, not along the view axis,
    // so when the aim point is off-origin the rotation genuinely does change —
    // re-aiming is what keeps it correct, and this is the assertion that the
    // caller's point wins rather than a hardcoded one.
    const elsewhere = new THREE.Vector3(0, 12, 0)
    const cam = cameraAt(0, 0, 100)
    applyScrubPose(cam, SCRUB_CEILING, elsewhere)

    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion)
    const toTarget = elsewhere.clone().sub(cam.position).normalize()
    expect(forward.angleTo(toTarget)).toBeLessThan(1e-6)
  })
})
