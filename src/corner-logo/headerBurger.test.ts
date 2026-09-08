// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { createHeaderBurger, type HeaderBurger, type HeaderBurgerMetrics } from './headerBurger'

// The burger is the header's other corner and, like the motion machine, it is
// arithmetic: metrics in CSS pixels go in, a transform comes out. Nothing here
// needs a renderer, a GLB or a DOM node.
//
// The metrics below are deliberately NOT the shipped ones (22x2 at a 6px pitch,
// four bars). These assert the placement, which must hold for any tuning; the
// numbers the stylesheet draws are a separate question, and asserting both in
// one place is how a test starts failing for the wrong reason.
const FRAMED_DISTANCE = 100

const METRICS: HeaderBurgerMetrics = {
  count: 3,
  centerRightPx: 40,
  centerYPx: 60,
  barLengthPx: 20,
  barThicknessPx: 4,
  pitchPx: 8,
  tone: 'dark',
}

function halfHeight(): number {
  return Math.tan(THREE.MathUtils.degToRad(45 / 2)) * FRAMED_DISTANCE
}

/** World units per CSS pixel at the bars' plane — the mapping the module uses. */
function worldPerPx(surfaceHeightPx = window.innerHeight): number {
  return (2 * halfHeight()) / surfaceHeightPx
}

let camera: THREE.PerspectiveCamera
let burger: HeaderBurger

beforeEach(() => {
  camera = new THREE.PerspectiveCamera(45, 16 / 9, 1, 1000)
  // Where assemble() puts it, and nothing moves it afterwards — which is what
  // lets both corner modules read the framing distance back off the camera.
  camera.position.set(0, 0, FRAMED_DISTANCE)
  camera.updateProjectionMatrix()
  burger = createHeaderBurger(camera)
})

describe('createHeaderBurger', () => {
  describe('nothing to draw', () => {
    it('starts hidden, so the blog gets four invisible meshes and no bars', () => {
      expect(burger.group.visible).toBe(false)
    })

    it('draws nothing until it is measured, however often it is updated', () => {
      burger.update()
      expect(burger.group.visible).toBe(false)
      expect(burger.group.children).toHaveLength(0)
    })

    it('hides again on null — the desktop line, and the intro before there are actions', () => {
      burger.set(METRICS)
      expect(burger.group.visible).toBe(true)
      burger.set(null)
      expect(burger.group.visible).toBe(false)
    })
  })

  describe('the stack', () => {
    it('builds the count it is given, whatever that is', () => {
      burger.set({ ...METRICS, count: 4 })
      expect(burger.group.children).toHaveLength(4)
    })

    it('rebuilds on a count change rather than accumulating', () => {
      burger.set({ ...METRICS, count: 4 })
      burger.set({ ...METRICS, count: 2 })
      expect(burger.group.children).toHaveLength(2)
      burger.set({ ...METRICS, count: 5 })
      expect(burger.group.children).toHaveLength(5)
    })

    it('spaces the bars at the pitch and centres the stack on the origin', () => {
      burger.set({ ...METRICS, count: 4 })
      const ys = burger.group.children.map((bar) => bar.position.y)
      // Index 0 is the topmost bar on screen, so world Y descends.
      expect(ys).toEqual([12, 4, -4, -12])
      expect(ys.reduce((a, b) => a + b, 0)).toBeCloseTo(0, 10)
    })

    it('sizes each bar in CSS pixels, extruded toward the viewer', () => {
      burger.set(METRICS)
      const bar = burger.group.children[0]
      expect(bar.scale.x).toBe(METRICS.barLengthPx)
      expect(bar.scale.y).toBe(METRICS.barThicknessPx)
      // The depth is this module's own — the stylesheet has no word for it.
      expect(bar.scale.z).toBeGreaterThan(0)
    })

    it('holds one static pose, so the extrusion is visible without any motion', () => {
      burger.set(METRICS)
      // Both a pitch and a yaw: without the pair an unlit box is a flat
      // rectangle however it is turned.
      expect(burger.group.rotation.x).not.toBe(0)
      expect(burger.group.rotation.y).not.toBe(0)
      const before = burger.group.rotation.x
      burger.update()
      expect(burger.group.rotation.x).toBe(before)
    })
  })

  describe('placement', () => {
    it('anchors the stack centre to the right inset and the line', () => {
      burger.set(METRICS)
      const perPx = worldPerPx()
      const halfW = halfHeight() * camera.aspect
      expect(burger.group.position.x).toBeCloseTo(halfW - METRICS.centerRightPx * perPx, 10)
      expect(burger.group.position.y).toBeCloseTo(halfHeight() - METRICS.centerYPx * perPx, 10)
    })

    it('scales so one unit of the authored geometry is one CSS pixel', () => {
      burger.set(METRICS)
      expect(burger.group.scale.x).toBeCloseTo(worldPerPx(), 10)
    })

    it('re-anchors from update() alone when the surface shrinks', () => {
      burger.set(METRICS)
      // The blog draws the same scene into a canvas a few dozen pixels tall;
      // the scene's surface is the window. Nothing else has to notice.
      burger.setSurfaceHeight(44)
      burger.update()
      const perPx = worldPerPx(44)
      expect(burger.group.scale.x).toBeCloseTo(perPx, 10)
      expect(burger.group.position.x).toBeCloseTo(
        halfHeight() * camera.aspect - METRICS.centerRightPx * perPx,
        10,
      )
    })

    it('re-anchors from update() alone when the aspect changes', () => {
      burger.set(METRICS)
      const before = burger.group.position.x
      camera.aspect = 9 / 16
      camera.updateProjectionMatrix()
      burger.update()
      expect(burger.group.position.x).not.toBeCloseTo(before, 5)
      expect(burger.group.position.x).toBeCloseTo(
        halfHeight() * camera.aspect - METRICS.centerRightPx * worldPerPx(),
        10,
      )
    })

    it('keeps the previous basis when handed a zero-height surface', () => {
      burger.set(METRICS)
      const before = burger.group.scale.x
      // A display:none ancestor, or a ResizeObserver's first callback.
      burger.setSurfaceHeight(0)
      burger.update()
      expect(burger.group.scale.x).toBeCloseTo(before, 10)
    })
  })

  describe('tone', () => {
    /** The materials, deduplicated — three shades across the box's six slots. */
    function shades(): number[] {
      const bar = burger.group.children[0] as THREE.Mesh
      const materials = bar.material as THREE.MeshBasicMaterial[]
      return [...new Set(materials.map((m) => m.color.getHex()))]
    }

    it('is brand white over the black sky and ink over Murcia and paper', () => {
      burger.set({ ...METRICS, tone: 'dark' })
      // The front face, which carries the contrast the stylesheet argues for.
      expect(shades()).toContain(0xffffff)
      burger.set({ ...METRICS, tone: 'light' })
      expect(shades()).toContain(0x0b0b0d)
    })

    it('shades the faces apart, or a static box reads as a flat rectangle', () => {
      burger.set({ ...METRICS, tone: 'dark' })
      expect(shades()).toHaveLength(3)
      burger.set({ ...METRICS, tone: 'light' })
      expect(shades()).toHaveLength(3)
    })

    it('flips the tone without rebuilding the stack', () => {
      burger.set(METRICS)
      const bar = burger.group.children[0]
      burger.set({ ...METRICS, tone: 'light' })
      expect(burger.group.children[0]).toBe(bar)
    })
  })
})
