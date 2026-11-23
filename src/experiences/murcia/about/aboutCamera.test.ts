import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { createAboutCamera, easeArrive } from './aboutCamera'
import type { AboutPose } from './aboutPoses'

// The section's camera on its own: the promises the hand-over rests on. The
// rig side of them — one writer, no snap, claims — is `check:about`.

const STOPS: AboutPose[] = [
  { position: new THREE.Vector3(10, 20, 60), target: new THREE.Vector3(0, 20, 0) },
  { position: new THREE.Vector3(30, 60, 30), target: new THREE.Vector3(0, 40, 0) },
  { position: new THREE.Vector3(20, 10, 40), target: new THREE.Vector3(0, 50, 0) },
]

function make(poses: () => readonly AboutPose[] = () => STOPS) {
  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 1000)
  camera.position.set(-80, 120, 200)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld(true)
  const origin = { position: camera.position.clone(), quaternion: camera.quaternion.clone() }
  const onControl = vi.fn()
  const about = createAboutCamera({ camera, poses, onControl })
  const land = () => {
    for (let i = 0; i < 400 && about.flying; i += 1) about.update(1 / 60)
  }
  return { camera, origin, onControl, about, land }
}

const pitchOf = (camera: THREE.Camera) => Math.asin(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).y)

describe('the Conócenos camera', () => {
  it('takes the camera once and lands exactly on each stop', () => {
    const r = make()
    r.about.enter(1)
    expect(r.onControl).toHaveBeenCalledTimes(1)
    expect(r.onControl).toHaveBeenLastCalledWith(false)
    r.land()
    expect(r.camera.position.distanceTo(STOPS[0]!.position)).toBeLessThan(1e-9)
    r.about.flyTo(2, 1)
    r.land()
    expect(r.camera.position.distanceTo(STOPS[2]!.position)).toBeLessThan(1e-9)
    const aim = new THREE.Vector3(0, 0, -1).applyQuaternion(r.camera.quaternion)
    expect(aim.angleTo(STOPS[2]!.target.clone().sub(STOPS[2]!.position))).toBeLessThan(1e-6)
    expect(r.onControl).toHaveBeenCalledTimes(1)
  })

  it('lands the way out on the pose it was entered from, quaternion included, and only then hands back', () => {
    const r = make()
    r.about.enter(1)
    r.land()
    r.about.exit(1)
    r.about.update(0.5)
    expect(r.onControl).toHaveBeenCalledTimes(1)
    r.land()
    expect(r.camera.position.distanceTo(r.origin.position)).toBeLessThan(1e-9)
    expect(r.camera.quaternion.angleTo(r.origin.quaternion)).toBeLessThan(1e-9)
    expect(r.onControl).toHaveBeenLastCalledWith(true)
    expect(r.about.inSection).toBe(false)
  })

  it('rises and tips up as the warp leaves from a stop, measured from where it started', () => {
    const r = make()
    r.about.enter(1)
    r.land()
    r.about.flyTo(2, 1)
    r.land()
    const start = r.camera.position.clone()
    const startPitch = pitchOf(r.camera)
    r.about.departure(0.5)
    const half = r.camera.position.y
    // Called every frame with the same amount: nothing accumulates.
    r.about.departure(0.5)
    expect(r.camera.position.y).toBeCloseTo(half, 9)
    r.about.departure(1)
    expect(r.camera.position.y).toBeGreaterThan(half)
    expect(half).toBeGreaterThan(start.y)
    expect(r.camera.position.x).toBeCloseTo(start.x, 9)
    expect(r.camera.position.z).toBeCloseTo(start.z, 9)
    expect(pitchOf(r.camera)).toBeGreaterThan(startPitch)
    expect(THREE.MathUtils.radToDeg(pitchOf(r.camera))).toBeCloseTo(80, 6)
  })

  it('abandons in one write: back on the entry pose, control returned', () => {
    const r = make()
    r.about.enter(1)
    r.land()
    r.about.departure(0.7)
    r.about.abandon()
    expect(r.camera.position.distanceTo(r.origin.position)).toBeLessThan(1e-9)
    expect(r.camera.quaternion.angleTo(r.origin.quaternion)).toBeLessThan(1e-9)
    expect(r.onControl).toHaveBeenLastCalledWith(true)
    expect(r.about.inSection).toBe(false)
    expect(r.about.flying).toBe(false)
  })

  it('does nothing on abandon outside a visit', () => {
    const r = make()
    r.about.abandon()
    expect(r.onControl).not.toHaveBeenCalled()
    expect(r.camera.position.distanceTo(r.origin.position)).toBe(0)
  })

  it('re-places a held stop for a new viewport, and not mid-flight', () => {
    let poses = STOPS
    const r = make(() => poses)
    r.about.enter(1)
    r.about.update(0.2)
    const midFlight = r.camera.position.clone()
    poses = STOPS.map((pose) => ({ position: pose.position.clone().addScalar(5), target: pose.target }))
    r.about.reframe()
    expect(r.camera.position.distanceTo(midFlight)).toBe(0)
    r.land()
    poses = STOPS.map((pose) => ({ position: pose.position.clone().addScalar(9), target: pose.target }))
    r.about.reframe()
    expect(r.camera.position.distanceTo(poses[0]!.position)).toBeLessThan(1e-9)
  })

  it('flies a leg on the curve it is given, and lands on the stop all the same', () => {
    const halfway = (ease?: (t: number) => number) => {
      const r = make()
      r.about.enter(1)
      r.land()
      r.about.flyTo(2, 1, ease)
      r.about.update(0.5)
      const covered = r.camera.position.distanceTo(STOPS[0]!.position) / STOPS[2]!.position.distanceTo(STOPS[0]!.position)
      r.land()
      expect(r.camera.position.distanceTo(STOPS[2]!.position)).toBeLessThan(1e-9)
      return covered
    }
    expect(halfway()).toBeCloseTo(0.5, 6)
    expect(halfway(easeArrive)).toBeCloseTo(0.9375, 6)
  })
})

describe('easeArrive', () => {
  it('runs from 0 to 1 without overshoot, starting and landing softly', () => {
    expect(easeArrive(0)).toBe(0)
    expect(easeArrive(1)).toBe(1)
    let last = 0
    for (let i = 1; i <= 1000; i += 1) {
      const value = easeArrive(i / 1000)
      expect(value).toBeGreaterThanOrEqual(last)
      expect(value).toBeLessThanOrEqual(1)
      last = value
    }
    const h = 1e-4
    expect(easeArrive(h) / h).toBeLessThan(0.01)
    expect((1 - easeArrive(1 - h)) / h).toBeLessThan(0.01)
  })

  it('is most of the way there at half its time', () => {
    expect(easeArrive(0.5)).toBeGreaterThan(0.93)
  })
})
