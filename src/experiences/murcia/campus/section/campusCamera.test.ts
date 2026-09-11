import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { createCampusCamera, type CampusCameraOptions, type CampusFraming } from './campusCamera'

// The framing is the site's layouts: on desktop the copy sits left and the
// camera pans the lake's centre right of centre; on a phone the copy sits at
// the bottom and the camera stands back and pans it up. Pinned by projecting
// the focus, which is what the eye sees.

const FOCUS = new THREE.Vector3(12, 5, -4)
const DISTANCE = 20
const DOCKED: CampusFraming = { x: 0.42, y: 0, distanceScale: 1 }

function rig(framing?: () => CampusFraming) {
  const camera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 1000)
  camera.position.set(40, 30, 60)
  const lookTarget = new THREE.Vector3(0, 0, 0)
  camera.lookAt(lookTarget)
  const options: CampusCameraOptions = {
    camera,
    lookTarget,
    onControl: () => {},
    focus: FOCUS,
    stops: 5,
    tuning: { distance: DISTANCE, elevationDeg: 24, direction: 1 },
    ...(framing ? { framing } : {}),
  }
  const campus = createCampusCamera(options)
  const land = () => {
    for (let i = 0; i < 400 && campus.flying; i += 1) campus.update(1 / 60)
    camera.updateMatrixWorld(true)
  }
  const focusOnScreen = () => FOCUS.clone().project(camera)
  return { camera, lookTarget, campus, land, focusOnScreen }
}

describe('the campus camera framing', () => {
  it('centres the focus when there is no framing, as the lab does', () => {
    const r = rig()
    r.campus.enter(1)
    r.land()
    expect(r.focusOnScreen().x).toBeCloseTo(0, 6)
    expect(r.focusOnScreen().y).toBeCloseTo(0, 6)
  })

  it('puts the focus the given fraction of the half-width right of centre, level', () => {
    const r = rig(() => DOCKED)
    r.campus.enter(1)
    r.land()
    expect(r.focusOnScreen().x).toBeCloseTo(0.42, 6)
    expect(r.focusOnScreen().y).toBeCloseTo(0, 6)
  })

  it('stands back by the given scale and puts the focus that fraction of the half-height up', () => {
    const r = rig(() => ({ x: 0, y: 0.4, distanceScale: 1.6 }))
    r.campus.enter(1)
    r.land()
    expect(r.focusOnScreen().x).toBeCloseTo(0, 6)
    expect(r.focusOnScreen().y).toBeCloseTo(0.4, 6)
    // A pan keeps the depth: the focus is the scaled distance in front of the camera.
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(r.camera.quaternion)
    expect(FOCUS.clone().sub(r.camera.position).dot(forward)).toBeCloseTo(DISTANCE * 1.6, 6)
  })

  it('keeps it there at every stop, and walks the target round rather than across', () => {
    const r = rig(() => DOCKED)
    r.campus.enter(1)
    r.land()
    r.campus.flyTo(2, 1)
    // Halfway along the arc the focus is still on its mark.
    for (let i = 0; i < 30; i += 1) r.campus.update(1 / 60)
    r.camera.updateMatrixWorld(true)
    expect(r.focusOnScreen().x).toBeCloseTo(0.42, 6)
    r.land()
    expect(r.focusOnScreen().x).toBeCloseTo(0.42, 6)
  })

  it('reframes a landed camera for a new aspect, and for a framing switched off', () => {
    let framing = DOCKED
    const r = rig(() => framing)
    r.campus.enter(1)
    r.land()
    r.camera.aspect = 21 / 9
    r.camera.updateProjectionMatrix()
    r.campus.reframe()
    r.camera.updateMatrixWorld(true)
    expect(r.focusOnScreen().x).toBeCloseTo(0.42, 6)
    framing = { x: 0, y: 0, distanceScale: 1 }
    r.campus.reframe()
    r.camera.updateMatrixWorld(true)
    expect(r.focusOnScreen().x).toBeCloseTo(0, 6)
  })

  it('leaves the overview alone: exit lands on the pose entering captured', () => {
    const r = rig(() => DOCKED)
    const position = r.camera.position.clone()
    const target = r.lookTarget.clone()
    r.campus.enter(1)
    r.land()
    r.campus.exit(1)
    r.land()
    expect(r.camera.position.distanceTo(position)).toBeLessThan(1e-9)
    expect(r.lookTarget.distanceTo(target)).toBeLessThan(1e-9)
    r.campus.reframe()
    expect(r.camera.position.distanceTo(position)).toBeLessThan(1e-9)
  })
})
