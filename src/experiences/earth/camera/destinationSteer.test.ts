import { describe, expect, it } from 'vitest'
import {
  EARTH_DEPARTURE_ALIGN_DEGREES,
  advanceOrbitSteer,
  createOrbitSteerState,
  isAboveDestination,
  resetOrbitSteer,
  steerWeightFor,
  type OrbitAngles,
  type OrbitSteerFrame,
} from './destinationSteer'
import { INTERACTION_CONFIG } from '../interaction/interactionConfig'
import { EARTH_CONFIG } from '../config/earthConfig'
import { WARP_LIMITS } from '../../../utils/warpTransition'

// The steer is the third stage of Earth's zoom band: past `earthGuideStart`,
// zooming in also turns the rig's ORBIT toward the destination. What is pinned
// here is the contract that replaced the old post-rig override: continuous at
// the threshold, lands on the destination, never undone by zooming out, never in
// the way of a drag or a satellite close-up, and following the spin while
// engaged.

const START = WARP_LIMITS.earthGuideStart
const { phiMin, phiMax } = INTERACTION_CONFIG.camera
const DEG = Math.PI / 180

// The destination, in the rig's spherical angles (theta about +Y from +Z, phi
// down from +Y) — Spain sits about 50 degrees from the pole.
const DEST_THETA = 0.3
const DEST_PHI = 50 * DEG
// A viewer on the equator, 150 degrees round the globe from it: the case with the
// most turn to do, and so the one where any discontinuity is largest.
const FREE: OrbitAngles = { theta: DEST_THETA + 150 * DEG, phi: 90 * DEG }

function frame(depth: number, overrides: Partial<OrbitSteerFrame> = {}): OrbitSteerFrame {
  return {
    bandDepth: depth,
    limits: WARP_LIMITS,
    destinationTheta: DEST_THETA,
    destinationPhi: DEST_PHI,
    focused: false,
    phiMin,
    phiMax,
    ...overrides,
  }
}

function direction(a: OrbitAngles): [number, number, number] {
  // THREE.Vector3.setFromSphericalCoords, without the dependency.
  return [Math.sin(a.phi) * Math.sin(a.theta), Math.cos(a.phi), Math.sin(a.phi) * Math.cos(a.theta)]
}

/** Degrees between two orbit directions on the sphere. */
function separation(a: OrbitAngles, b: OrbitAngles): number {
  const x = direction(a)
  const y = direction(b)
  const dot = x[0] * y[0] + x[1] * y[1] + x[2] * y[2]
  return Math.acos(Math.min(1, Math.max(-1, dot))) / DEG
}

const DESTINATION: OrbitAngles = { theta: DEST_THETA, phi: DEST_PHI }

function steer(depths: number[], start: OrbitAngles = FREE) {
  const state = createOrbitSteerState()
  const orbit = { ...start }
  for (const depth of depths) advanceOrbitSteer(state, frame(depth), orbit)
  return { state, orbit }
}

describe('the orbit steer around its first threshold', () => {
  it('owes nothing up to the threshold, and leaves it with zero slope', () => {
    expect(steerWeightFor(START - 1e-3, WARP_LIMITS)).toBe(0)
    expect(steerWeightFor(START, WARP_LIMITS)).toBe(0)
    const justAbove = steerWeightFor(START + 1e-3, WARP_LIMITS)
    expect(justAbove).toBeGreaterThan(0)
    expect(justAbove).toBeLessThan(1e-6)
    expect(steerWeightFor(1, WARP_LIMITS)).toBe(1)
  })

  it('leaves the orbit exactly alone below and at the threshold', () => {
    expect(steer([START - 0.2, START - 1e-3]).orbit).toEqual(FREE)
    expect(steer([START - 1e-3, START]).orbit).toEqual(FREE)
  })

  it('moves it by a vanishing amount just past the threshold', () => {
    const { orbit } = steer([START, START + 1e-3])
    expect(separation(orbit, FREE)).toBeLessThan(1e-4)
  })

  it('is smooth through the whole neighbourhood of the threshold', () => {
    const state = createOrbitSteerState()
    const orbit = { ...FREE }
    let worst = 0
    for (let depth = START - 0.05; depth <= START + 0.05; depth += 1e-3) {
      const before = { ...orbit }
      advanceOrbitSteer(state, frame(depth), orbit)
      worst = Math.max(worst, separation(before, orbit))
    }
    // The steepest point of this window, 0.05 past the threshold, owes ~9e-4 of
    // the turn per thousandth of depth: ~0.13 degrees of a 150-degree turn. A
    // discontinuity of any visible size is orders above that.
    expect(worst).toBeLessThan(0.25)
  })
})

describe('zooming in turns the orbit onto the destination', () => {
  it('lands exactly on it at the end of the band, whatever the notches were', () => {
    for (const pattern of [
      [0.6, 0.7, 0.8, 0.9, 1.0],
      [0.65, 1.0],
      [1.0],
      [0.61, 0.62, 0.7, 0.71, 0.95, 0.99, 1.0],
    ]) {
      const { orbit } = steer(pattern)
      expect(separation(orbit, DESTINATION), `notches ${pattern.join(' ')}`).toBeLessThan(1e-6)
    }
  })

  it('never asks for more pitch than the rig allows', () => {
    const { orbit } = steer([1.0], FREE)
    advanceOrbitSteer(createOrbitSteerState(), frame(1, { destinationPhi: 0 }), orbit)
    expect(orbit.phi).toBeGreaterThanOrEqual(phiMin)
  })
})

describe('zooming out only zooms', () => {
  it('rotates nothing on the way back out, and zooming in again continues from there', () => {
    const { state, orbit } = steer([0.6, 0.7, 0.8])
    const turned = { ...orbit }
    for (const depth of [0.75, 0.7, 0.6, 0.3, 0]) advanceOrbitSteer(state, frame(depth), orbit)
    expect(orbit).toEqual(turned)

    for (const depth of [0.7, 0.9, 1.0]) advanceOrbitSteer(state, frame(depth), orbit)
    expect(separation(orbit, DESTINATION)).toBeLessThan(1e-6)
  })
})

describe('the drag is never dead and never undone', () => {
  it('keeps a drag made mid-band: the next notch turns from where the viewer now is', () => {
    const { state, orbit } = steer([0.6, 0.8])
    orbit.theta += 40 * DEG // the viewer drags away
    const dragged = { ...orbit }

    advanceOrbitSteer(state, frame(0.9), orbit)
    // A fraction of the way from the DRAGGED position — not a return to the
    // position before the drag.
    const owed =
      (steerWeightFor(0.9, WARP_LIMITS) - steerWeightFor(0.8, WARP_LIMITS)) /
      (1 - steerWeightFor(0.8, WARP_LIMITS))
    expect(separation(orbit, DESTINATION)).toBeCloseTo((1 - owed) * separation(dragged, DESTINATION), 0)
    expect(separation(orbit, DESTINATION)).toBeLessThan(separation(dragged, DESTINATION))
  })

  it('keeps a drag made at full zoom, with nothing pulling it back', () => {
    const { state, orbit } = steer([1.0])
    orbit.theta += 20 * DEG
    const dragged = { ...orbit }
    for (let f = 0; f < 60; f += 1) advanceOrbitSteer(state, frame(1), orbit)
    // Not toEqual: nearestEquivalentAngle(a, a) rounds to within ~1e-16 of a,
    // and sixty frames of that is float noise, not a pull.
    expect(orbit.theta).toBeCloseTo(dragged.theta, 12)
    expect(orbit.phi).toBe(dragged.phi)
  })
})

describe('the view follows the destination while engaged', () => {
  function spin(depth: number, stepDegrees: number, frames: number) {
    const { state, orbit } = steer([depth])
    const start = { ...orbit }
    let theta = DEST_THETA
    for (let f = 0; f < frames; f += 1) {
      theta += stepDegrees * DEG
      advanceOrbitSteer(state, frame(depth, { destinationTheta: theta }), orbit)
    }
    return { start, orbit }
  }

  it('turns with it one for one at full zoom', () => {
    const { start, orbit } = spin(1, 0.5, 40)
    expect((orbit.theta - start.theta) / DEG).toBeCloseTo(20, 9)
  })

  it('does not follow at all below the threshold', () => {
    const { start, orbit } = spin(0.3, 0.5, 40)
    expect(orbit).toEqual(start)
  })

  it('keeps a drag offset relative to the destination while following', () => {
    const { state, orbit } = steer([1.0])
    orbit.theta += 20 * DEG
    let theta = DEST_THETA
    for (let f = 0; f < 40; f += 1) {
      theta += 0.5 * DEG
      advanceOrbitSteer(state, frame(1, { destinationTheta: theta }), orbit)
    }
    expect((orbit.theta - theta) / DEG).toBeCloseTo(20, 9)
  })

  it('takes the short way across the azimuth seam', () => {
    const state = createOrbitSteerState()
    const orbit = { theta: Math.PI - 0.01, phi: DEST_PHI }
    advanceOrbitSteer(state, frame(1, { destinationTheta: Math.PI - 0.01 }), orbit)
    const before = orbit.theta
    // The destination crosses from +PI to -PI: a turn of 0.02, not of 2*PI.
    advanceOrbitSteer(state, frame(1, { destinationTheta: -Math.PI + 0.01 }), orbit)
    expect(orbit.theta - before).toBeCloseTo(0.02, 9)
  })
})

describe('a satellite close-up owns the camera', () => {
  it('leaves the orbit alone while focused, even with the band full and the globe spinning', () => {
    const { state, orbit } = steer([1.0])
    const before = { ...orbit }
    for (let f = 0; f < 30; f += 1) {
      advanceOrbitSteer(state, frame(1, { focused: true, destinationTheta: DEST_THETA + f * DEG }), orbit)
    }
    expect(orbit).toEqual(before)
  })

  it('re-applies the whole owed turn the frame the close-up ends', () => {
    const { state } = steer([1.0])
    advanceOrbitSteer(state, frame(1, { focused: true }), { ...FREE })
    // `returnToOverview` re-seeds the orbit at the rest direction.
    const orbit = { ...FREE }
    advanceOrbitSteer(state, frame(1), orbit)
    expect(separation(orbit, DESTINATION)).toBeLessThan(1e-6)
  })
})

describe('resetOrbitSteer', () => {
  it('owes the whole band again from wherever the orbit is', () => {
    const { state } = steer([1.0])
    resetOrbitSteer(state)
    expect(state).toEqual(createOrbitSteerState())
    const orbit = { ...FREE }
    advanceOrbitSteer(state, frame(0.3), orbit)
    expect(orbit).toEqual(FREE)
  })
})

describe('isAboveDestination — the gate on leaving Earth', () => {
  const TOL = EARTH_DEPARTURE_ALIGN_DEGREES
  // Spain on +Z, just above the surface; the camera `deg` degrees round the globe from it.
  const SPAIN = { x: 0, y: 0, z: 1.03 }
  const camera = (deg: number, distance = 6) => ({
    x: Math.sin(deg * DEG) * distance,
    y: 0,
    z: Math.cos(deg * DEG) * distance,
  })

  it('opens inside the tolerance and stays shut outside it', () => {
    expect(isAboveDestination(camera(0), SPAIN, TOL)).toBe(true)
    expect(isAboveDestination(camera(TOL * 0.9), SPAIN, TOL)).toBe(true)
    expect(isAboveDestination(camera(TOL * 1.1), SPAIN, TOL)).toBe(false)
    expect(isAboveDestination(camera(150), SPAIN, TOL)).toBe(false)
  })

  it('measures round the globe, so how far out the camera is does not change the answer', () => {
    for (const distance of [1.5, 6, 20]) {
      expect(isAboveDestination(camera(TOL * 0.9, distance), SPAIN, TOL), `at ${distance}`).toBe(true)
      expect(isAboveDestination(camera(TOL * 1.1, distance), SPAIN, TOL), `at ${distance}`).toBe(false)
    }
  })

  it('answers false for a direction it cannot measure', () => {
    expect(isAboveDestination({ x: 0, y: 0, z: 0 }, SPAIN, TOL)).toBe(false)
    expect(isAboveDestination(camera(0), { x: 0, y: 0, z: 0 }, TOL)).toBe(false)
  })

  it('is looser than the lag the rig carries behind the spinning destination', () => {
    // A first-order ease trailing a target that turns at a constant rate settles
    // `rate / k` behind it. If that ever exceeded the tolerance, a camera parked
    // over Spain at the end of the band would never be allowed to leave.
    const lagDegrees = EARTH_CONFIG.rotationSpeed / INTERACTION_CONFIG.camera.lerpK / DEG
    expect(lagDegrees).toBeLessThan(TOL)
  })
})
