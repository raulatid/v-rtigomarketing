import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { SKY_FOCUS_NDC, solveAboutStops, type AboutGeometry, type AboutLens } from '../about/aboutPoses'
import { skyFocusOf } from './createSkySatellites'
import { createSkyPasses, VISIBLE_FROM, type SkyPass } from './skyPasses'

// The passes are judged the way the sky stop sees them: through a camera on
// its solved pose, over many laps. The tower is the prototypes' (aboutPoses.test.ts).

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

const STEP = 0.1
/** Ten minutes: five laps of every satellite. */
const SPAN = 600

function skyCamera(lens: AboutLens, layout: 'docked' | 'sheet') {
  const pose = solveAboutStops(GEOMETRY, lens, layout)[2]!
  const camera = new THREE.PerspectiveCamera(lens.fov, lens.aspect, 0.1, 5000)
  camera.position.copy(pose.position)
  camera.lookAt(pose.target)
  camera.updateMatrixWorld(true)
  return { camera, focus: skyFocusOf(camera, SKY_FOCUS_NDC[layout]) }
}

/** The visible stretches of a pass: [first, last] sample times with alpha > 0. */
function visibleSpans(pass: SkyPass): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  let from: number | null = null
  for (let t = 0; t <= SPAN; t += STEP) {
    const lit = pass.alpha(t) > 0
    if (lit && from === null) from = t
    if (!lit && from !== null) {
      spans.push([from, t - STEP])
      from = null
    }
  }
  return spans
}

const horizontalAngle = (a: readonly number[], b: readonly number[]) =>
  Math.abs(Math.atan2(a[0]! * b[2]! - a[2]! * b[0]!, a[0]! * b[0]! + a[2]! * b[2]!))

describe('the satellites over Murcia', () => {
  const { focus } = skyCamera(DESKTOP, 'docked')
  const passes = createSkyPasses({ count: 16, focus, seed: 11 })

  it('are unit directions, the same at the same second however they are reached', () => {
    for (const pass of passes) {
      const [x, y, z] = pass.direction(123.4)
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9)
      expect(pass.direction(123.4)).toEqual(createSkyPasses({ count: 16, focus, seed: 11 })[passes.indexOf(pass)]!.direction(123.4))
    }
  })

  it('cross the sky: each pass comes in and goes out on opposite sides', () => {
    let crossings = 0
    for (const pass of passes) {
      for (const [from, to] of visibleSpans(pass)) {
        if (from === 0 || to >= SPAN - STEP) continue
        expect(horizontalAngle(pass.direction(from), pass.direction(to))).toBeGreaterThan(Math.PI / 3)
        const middle = pass.direction((from + to) / 2)
        expect(middle[1]).toBeGreaterThan(pass.direction(from)[1])
        expect(middle[1]).toBeGreaterThan(pass.direction(to)[1])
        crossings++
      }
    }
    expect(crossings).toBeGreaterThan(50)
  })

  it('turn to a new line only while out of sight, below the horizon', () => {
    let turns = 0
    for (const pass of passes) {
      for (let t = 0; t < SPAN; t += STEP) {
        const a = pass.direction(t)
        const b = pass.direction(t + STEP)
        // A lap moves under 0.03 rad in a step; anything more is the plane turning.
        if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.05) continue
        turns++
        expect(Math.max(a[1], b[1])).toBeLessThan(0)
        expect(pass.alpha(t)).toBe(0)
        expect(pass.alpha(t + STEP)).toBe(0)
      }
    }
    expect(turns).toBeGreaterThan(50)
  })

  it('never show below the dark part of the sky', () => {
    for (const pass of passes) {
      for (let t = 0; t < 100; t += STEP) {
        if (pass.direction(t)[1] <= VISIBLE_FROM) expect(pass.alpha(t)).toBe(0)
      }
    }
  })

  it.each([
    ['desktop', DESKTOP, 'docked'],
    ['phone', PHONE, 'sheet'],
  ] as const)('mostly cross what the sky stop frames on a %s', (_, lens, layout) => {
    const { camera, focus } = skyCamera(lens, layout)
    const sky = createSkyPasses({ count: 16, focus, seed: 11 })
    const point = new THREE.Vector3()
    let passesSeen = 0
    let inFrame = 0
    for (const pass of sky) {
      for (const [from, to] of visibleSpans(pass)) {
        passesSeen++
        for (let t = from; t <= to; t += STEP) {
          if (pass.alpha(t) < 0.6) continue
          point.fromArray(pass.direction(t)).multiplyScalar(1000).add(camera.position).project(camera)
          if (Math.abs(point.x) < 0.8 && Math.abs(point.y) < 0.8 && point.z < 1) {
            inFrame++
            break
          }
        }
      }
    }
    expect(inFrame / passesSeen).toBeGreaterThan(0.8)
  })
})
