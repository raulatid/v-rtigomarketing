import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import {
  aimSoSubjectLandsAt,
  solveAboutStops,
  solveScreenView,
  type AboutGeometry,
  type AboutLens,
  type AboutPose,
} from './aboutPoses'

// The stops are judged where the eye judges them: by projecting the subject
// through a camera placed on the solved pose. The tower is the one the
// prototypes measured (plan 027); only its scale matters.

const GEOMETRY: AboutGeometry = {
  screen: {
    centre: new THREE.Vector3(-294.25, 35.24, 311.57),
    normal: new THREE.Vector3(-0.697, 0, 0.716).normalize(),
    height: 47.3,
    width: 30,
  },
  logo: new THREE.Vector3(-291.31, 67.86, 308.13),
}

const DESKTOP: AboutLens = { fov: 35, aspect: 1440 / 900 }
const PHONE: AboutLens = { fov: 35, aspect: 390 / 844 }

function cameraOn(pose: AboutPose, lens: AboutLens): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(lens.fov, lens.aspect, 0.1, 5000)
  camera.position.copy(pose.position)
  camera.lookAt(pose.target)
  camera.updateMatrixWorld(true)
  return camera
}

const onScreen = (point: THREE.Vector3, camera: THREE.Camera) => point.clone().project(camera)

/** The camera's right axis has no height: the view does not roll. */
const rollOf = (camera: THREE.Camera) => new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion).y

describe('the screen stop', () => {
  it('fills the asked share of the tighter axis: the height on a desktop', () => {
    const camera = cameraOn(solveScreenView(GEOMETRY.screen, DESKTOP.fov, DESKTOP.aspect, 0.7), DESKTOP)
    const half = GEOMETRY.screen.height / 2
    const top = onScreen(GEOMETRY.screen.centre.clone().setY(GEOMETRY.screen.centre.y + half), camera)
    const bottom = onScreen(GEOMETRY.screen.centre.clone().setY(GEOMETRY.screen.centre.y - half), camera)
    expect((top.y - bottom.y) / 2).toBeCloseTo(0.7, 6)
  })

  it('and the width on a portrait phone', () => {
    const camera = cameraOn(solveScreenView(GEOMETRY.screen, PHONE.fov, PHONE.aspect, 0.5), PHONE)
    const across = new THREE.Vector3(-GEOMETRY.screen.normal.z, 0, GEOMETRY.screen.normal.x)
    const half = GEOMETRY.screen.width / 2
    const left = onScreen(GEOMETRY.screen.centre.clone().addScaledVector(across, -half), camera)
    const right = onScreen(GEOMETRY.screen.centre.clone().addScaledVector(across, half), camera)
    expect(Math.abs(right.x - left.x) / 2).toBeCloseTo(0.5, 6)
  })

  it('stands square in front of it', () => {
    const pose = solveScreenView(GEOMETRY.screen, DESKTOP.fov, DESKTOP.aspect, 0.7)
    const towards = pose.position.clone().sub(GEOMETRY.screen.centre).normalize()
    expect(towards.angleTo(GEOMETRY.screen.normal)).toBeCloseTo(0, 9)
  })
})

describe('aiming so the subject lands at a point of the picture', () => {
  it('lands it there, without rolling the view', () => {
    const eye = GEOMETRY.logo.clone().addScaledVector(GEOMETRY.screen.normal, 34).setY(GEOMETRY.logo.y - 10)
    const camera = cameraOn(aimSoSubjectLandsAt(eye, GEOMETRY.logo, DESKTOP, { x: -0.45, y: -0.55 }), DESKTOP)
    const landed = onScreen(GEOMETRY.logo, camera)
    expect(landed.x).toBeCloseTo(-0.45, 4)
    expect(landed.y).toBeCloseTo(-0.55, 4)
    expect(rollOf(camera)).toBeCloseTo(0, 9)
  })
})

describe('the three stops', () => {
  const at = (layout: 'docked' | 'sheet', lens: AboutLens) => {
    const [screen, rooftop, sky] = solveAboutStops(GEOMETRY, lens, layout).map((pose) => cameraOn(pose, lens))
    return { screen: screen!, rooftop: rooftop!, sky: sky! }
  }

  it('frame their subjects where the desktop plate leaves room', () => {
    const { screen, rooftop, sky } = at('docked', DESKTOP)
    const centre = onScreen(GEOMETRY.screen.centre, screen)
    expect(centre.x).toBeCloseTo(-0.42, 4)
    expect(centre.y).toBeCloseTo(0, 4)
    const logo = onScreen(GEOMETRY.logo, rooftop)
    expect(logo.x).toBeCloseTo(-0.42, 4)
    expect(logo.y).toBeCloseTo(0, 4)
    const high = onScreen(GEOMETRY.logo, sky)
    expect(high.x).toBeCloseTo(-0.45, 4)
    expect(high.y).toBeCloseTo(-0.55, 4)
  })

  it('and above the phone sheet', () => {
    const { screen, rooftop, sky } = at('sheet', PHONE)
    const centre = onScreen(GEOMETRY.screen.centre, screen)
    expect(centre.x).toBeCloseTo(0, 4)
    expect(centre.y).toBeCloseTo(0.32, 4)
    // Seen from above the strip's middle, not panned down to the rooftops.
    expect(screen.position.y).toBeGreaterThan(GEOMETRY.screen.centre.y)
    expect(onScreen(GEOMETRY.logo, rooftop).y).toBeCloseTo(0.45, 4)
    const high = onScreen(GEOMETRY.logo, sky)
    expect(high.x).toBeCloseTo(0, 4)
    expect(high.y).toBeCloseTo(0.3, 4)
  })

  it('look down on the rooftop and up into the sky, never rolling', () => {
    const { screen, rooftop, sky } = at('docked', DESKTOP)
    const pitch = (camera: THREE.Camera) =>
      THREE.MathUtils.radToDeg(Math.asin(new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion).y))
    expect(pitch(rooftop)).toBeCloseTo(-40, 6)
    expect(pitch(sky)).toBeGreaterThan(15)
    // The phone too: its satellites run in the dark above the frame's middle.
    expect(pitch(at('sheet', PHONE).sky)).toBeGreaterThan(15)
    for (const camera of [screen, rooftop, sky]) expect(rollOf(camera)).toBeCloseTo(0, 9)
  })
})
