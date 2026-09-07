import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { isPointVisible, orbitVisibility } from './satelliteVisibility'
import { ORBIT_CONFIG, ORBIT_PRESETS } from './orbitConfig'
import { invitedCaseId, orbitAssignments } from './orbitAssignments'
import { overviewRestPosition } from '../camera/overviewPose'
import { earthZoomRadius } from '../camera/zoomPose'
import { DEFAULT_APP_CONFIG } from '../config/introConfig'
import { EARTH_CONFIG } from '../config/earthConfig'

// Where the invited satellite is on screen, from the REAL rest camera, over a
// whole revolution, at every supported viewport. This is the test that would
// have caught the 2026-09-07 finding: the tutorial's target rode the widest,
// steepest orbit and was OFF SCREEN at the exact frame the satellites settled
// on both phone profiles, in frame only ~70% of the time. It was moved to the
// orbit that is visible the whole way round; this pins that, so a future
// reassignment — or a rest camera that moves it off — fails here.

const VIEWPORTS: Array<[string, number, number]> = [
  ['393x852 portrait', 393, 852],
  ['412x915 portrait', 412, 915],
  ['844x390 landscape', 844, 390],
  ['1600x900 desktop', 1600, 900],
]

/** The overview rest camera, as the rig places it at zoom depth 0. */
function restCamera(width: number, height: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(DEFAULT_APP_CONFIG.normalFov, width / height, 0.1, 5000)
  camera.position.set(...overviewRestPosition(earthZoomRadius(0)))
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  return camera
}

function presetFor(caseId: string) {
  const orbitId = orbitAssignments.find((a) => a.caseId === caseId)?.orbitId
  const preset = ORBIT_PRESETS.find((p) => p.id === orbitId)
  if (!preset) throw new Error(`${caseId} rides no orbit`)
  return preset
}

describe('isPointVisible', () => {
  const camera = restCamera(1600, 900)

  it('accepts a point in front of the planet and inside the frame', () => {
    // Toward the camera from the origin, a little off the planet.
    const point = camera.position.clone().normalize().multiplyScalar(EARTH_CONFIG.radius * 1.5)
    expect(isPointVisible(camera, point)).toBe(true)
  })

  it('rejects a point behind the planet', () => {
    const point = camera.position.clone().normalize().multiplyScalar(-EARTH_CONFIG.radius * 1.5)
    expect(isPointVisible(camera, point)).toBe(false)
  })

  it('rejects a point off the side of the frame, and one behind the camera', () => {
    const side = new THREE.Vector3().crossVectors(camera.position, new THREE.Vector3(0, 1, 0))
    side.normalize().multiplyScalar(60)
    expect(isPointVisible(camera, side)).toBe(false)
    const behind = camera.position.clone().multiplyScalar(1.5)
    expect(isPointVisible(camera, behind)).toBe(false)
  })

  it('honours the margin', () => {
    // Find a point near the frame's right edge and check the margin excludes it.
    const point = camera.position.clone().normalize().multiplyScalar(EARTH_CONFIG.radius * 1.5)
    const side = new THREE.Vector3().crossVectors(camera.position, new THREE.Vector3(0, 1, 0))
    side.normalize()
    let step = 0
    while (isPointVisible(camera, point, 0) && step < 200) {
      point.addScaledVector(side, 0.1)
      step += 1
    }
    point.addScaledVector(side, -0.3)
    expect(isPointVisible(camera, point, 0)).toBe(true)
    expect(isPointVisible(camera, point, 0.3)).toBe(false)
  })
})

describe('the invited satellite, from the rest camera', () => {
  const preset = presetFor(invitedCaseId)
  const t = ORBIT_CONFIG.tutorial
  const margin = t.visibleMarginNdc
  /** The whole sequence, from settling: the beat, then every pulse with its rest. */
  const sequenceSeconds = t.armDelay + t.pulses * (t.cueLead + t.hold + t.gap)

  for (const [label, width, height] of VIEWPORTS) {
    it(`${label}: is on screen the whole way round`, () => {
      // No margin here: this is "never hidden", the property the swap bought.
      const v = orbitVisibility(preset, restCamera(width, height), 0)
      expect(v.fraction, 'fraction of a revolution in frame').toBeGreaterThanOrEqual(0.95)
    })

    it(`${label}: is inside the tutorial's margin when it settles, and stays there long enough`, () => {
      // What the tutorial actually needs: the target well inside the frame at
      // the moment it can arm, and still there for the whole sequence — with
      // room to spare, because a phone's first frames are its slowest.
      const v = orbitVisibility(preset, restCamera(width, height), margin)
      expect(v.visibleAtStart, 'visible where it starts idling').toBe(true)
      expect(v.firstVisibleAfterSeconds).toBe(0)
      expect(v.visibleFromStartSeconds, 'seconds visible from idle start').toBeGreaterThanOrEqual(
        sequenceSeconds * 2,
      )
    })
  }

  it('would have failed on the orbit it used to ride, in portrait', () => {
    // The finding, kept as a fact rather than a memory: orbit-06 hides the
    // target at idle start on a phone. If this ever passes, the rest camera or
    // the presets moved and the swap above may no longer be needed.
    const old = ORBIT_PRESETS.find((p) => p.id === 'orbit-06')!
    const v = orbitVisibility(old, restCamera(393, 852), margin)
    expect(v.visibleAtStart).toBe(false)
    expect(orbitVisibility(old, restCamera(393, 852), 0).fraction).toBeLessThan(0.95)
  })
})
