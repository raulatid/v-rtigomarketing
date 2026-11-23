import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { BRAND_LANES_NDC, solveAboutStops, type AboutGeometry, type AboutLayout } from '../about/aboutPoses'
import { PANEL_REACH } from '../about/aboutSky'
import { alongLane, createBrandCrossings, CROSS_SECONDS, type BrandLane } from './brandLanes'
import { skyFocusOf } from './createSkySatellites'

// The lanes are judged the way the sky stop sees them: through a camera on its
// solved pose, in client px, with the panels' real reach. The tower is the
// prototypes' (aboutPoses.test.ts).

const GEOMETRY: AboutGeometry = {
  screen: {
    centre: new THREE.Vector3(-294.25, 35.24, 311.57),
    normal: new THREE.Vector3(-0.697, 0, 0.716).normalize(),
    height: 47.3,
    width: 30,
  },
  logo: new THREE.Vector3(-291.31, 67.86, 308.13),
  rest: { position: new THREE.Vector3(-610.7, 294.4, 328.5), target: new THREE.Vector3(-285, 10, 300) },
}

interface Frame {
  readonly name: string
  readonly layout: AboutLayout
  readonly width: number
  readonly height: number
}

/** The usual frames and the shortest of each layout: the lanes are in NDC, the panels in px. */
const FRAMES: readonly Frame[] = [
  { name: 'desktop 1440×900', layout: 'docked', width: 1440, height: 900 },
  { name: 'desktop 1280×720', layout: 'docked', width: 1280, height: 720 },
  { name: 'desktop 1024×768', layout: 'docked', width: 1024, height: 768 },
  { name: 'phone 390×844', layout: 'sheet', width: 390, height: 844 },
  { name: 'phone 375×667', layout: 'sheet', width: 375, height: 667 },
]

/** The docked plate at 1440×900, client px, measured in the app on 2026-11-23. */
const DOCKED_PLATE_1440 = { left: 733, top: 145, right: 1152, bottom: 825 }

const STEP = 0.05
/** Several turns of five brands, after the first crossings are under way. */
const FROM = 30
const TO = 230
/** «In view»: a panel at least this opaque. «Showing»: any panel that can be seen at all. */
const IN_VIEW = 0.5
const SHOWING = 0.15

function stop(frame: Frame) {
  const pose = solveAboutStops(GEOMETRY, { fov: 35, aspect: frame.width / frame.height }, frame.layout)[2]!
  const camera = new THREE.PerspectiveCamera(35, frame.width / frame.height, 0.1, 5000)
  camera.position.copy(pose.position)
  camera.lookAt(pose.target)
  camera.updateMatrixWorld(true)
  const lanes: BrandLane[] = BRAND_LANES_NDC[frame.layout].map((lane) => ({
    from: skyFocusOf(camera, lane.from),
    to: skyFocusOf(camera, lane.to),
  }))
  const toClient = (d: readonly number[]) => {
    const v = new THREE.Vector3(d[0], d[1], d[2]).multiplyScalar(1000).add(camera.position).project(camera)
    return { x: (v.x * 0.5 + 0.5) * frame.width, y: (-v.y * 0.5 + 0.5) * frame.height }
  }
  return { lanes, toClient }
}

function sample(frame: Frame, brands: number) {
  const { lanes, toClient } = stop(frame)
  const { passes } = createBrandCrossings(lanes, brands)
  const moments: Array<Array<{ brand: number; opacity: number; x: number; y: number }>> = []
  for (let t = FROM; t < TO; t += STEP) {
    moments.push(
      passes
        .map((pass, brand) => ({ brand, opacity: pass.alpha(t), ...toClient(pass.direction(t)) }))
        .filter((panel) => panel.opacity >= SHOWING),
    )
  }
  return moments
}

/** Panels in view: opaque enough and on the canvas, where the host can place them. */
const inView = (frame: Frame, moment: ReadonlyArray<{ opacity: number; x: number; y: number }>) =>
  moment.filter((p) => p.opacity >= IN_VIEW && p.x >= 0 && p.x <= frame.width && p.y >= 0 && p.y <= frame.height).length

describe('the brand satellites of the sky stop', () => {
  for (const frame of FRAMES) {
    describe(frame.name, () => {
      it('keep two brands in view at every moment, and three for part of the time', () => {
        const moments = sample(frame, 5)
        expect(Math.min(...moments.map((moment) => inView(frame, moment)))).toBe(2)
        expect(moments.filter((moment) => inView(frame, moment) === 3).length / moments.length).toBeGreaterThan(0.15)
      })

      it('never let two panels touch, the names included', () => {
        for (const brands of [5, 3, 2]) {
          for (const moment of sample(frame, brands)) {
            for (let i = 0; i < moment.length; i += 1) {
              for (let j = i + 1; j < moment.length; j += 1) {
                const a = moment[i]!
                const b = moment[j]!
                const apart =
                  Math.abs(a.x - b.x) >= PANEL_REACH.left + PANEL_REACH.right ||
                  Math.abs(a.y - b.y) >= PANEL_REACH.up + PANEL_REACH.down
                expect(apart, `${a.brand} and ${b.brand} at (${a.x}, ${a.y}) and (${b.x}, ${b.y})`).toBe(true)
              }
            }
          }
        }
      })

      it('never cut a name off at the top of the frame', () => {
        for (const moment of sample(frame, 5)) {
          for (const panel of moment) {
            if (panel.opacity >= IN_VIEW) expect(panel.y - PANEL_REACH.up).toBeGreaterThanOrEqual(0)
          }
        }
      })
    })
  }

  it('never pass under the docked plate on a desktop', () => {
    const p = DOCKED_PLATE_1440
    for (const moment of sample(FRAMES[0]!, 5)) {
      for (const panel of moment) {
        if (panel.opacity < IN_VIEW) continue
        const under =
          panel.x + PANEL_REACH.right > p.left &&
          panel.x - PANEL_REACH.left < p.right &&
          panel.y - PANEL_REACH.up < p.bottom &&
          panel.y + PANEL_REACH.down > p.top
        expect(under).toBe(false)
      }
    }
  })

  it('take strict turns: no brand comes round before every other has', () => {
    const { lanes } = stop(FRAMES[0]!)
    const { passes, interval } = createBrandCrossings(lanes, 5)
    // Each crossing starts on an interval; which brand is just setting out.
    const starts: number[] = []
    for (let k = 0; k < 15; k += 1) {
      const t = k * interval + 0.01
      starts.push(passes.findIndex((pass) => pass.alpha(t) > 0 && pass.alpha(t - 0.02) === 0))
    }
    expect(starts).toEqual([0, 1, 2, 3, 4, 0, 1, 2, 3, 4, 0, 1, 2, 3, 4])
  })

  it('never ask one brand to be in two places: with fewer brands, the crossings spread out', () => {
    const { lanes } = stop(FRAMES[0]!)
    for (const brands of [1, 2]) {
      const { interval } = createBrandCrossings(lanes, brands)
      expect(interval * brands).toBeGreaterThanOrEqual(CROSS_SECONDS)
    }
    expect(Math.max(...sample(FRAMES[0]!, 1).map((moment) => moment.length))).toBe(1)
  })

  it('are where they are at a second however it is reached, and unit directions', () => {
    const { lanes } = stop(FRAMES[0]!)
    const a = createBrandCrossings(lanes, 5).passes
    const b = createBrandCrossings(lanes, 5).passes
    for (const t of [0, 3.3, 17.25, 101]) {
      for (let brand = 0; brand < 5; brand += 1) {
        expect(a[brand]!.direction(t)).toEqual(b[brand]!.direction(t))
        expect(Math.hypot(...a[brand]!.direction(t))).toBeCloseTo(1, 9)
      }
    }
    expect(alongLane(lanes[0]!, 0)).toEqual(lanes[0]!.from.map((v) => expect.closeTo(v, 9)))
    expect(alongLane(lanes[0]!, 1)).toEqual(lanes[0]!.to.map((v) => expect.closeTo(v, 9)))
  })

  it('show nothing without brands', () => {
    const { lanes } = stop(FRAMES[0]!)
    expect(createBrandCrossings(lanes, 0).passes).toEqual([])
  })
})
