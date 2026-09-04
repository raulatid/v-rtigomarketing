// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { createLogoMotion, DEFAULT_CORNER_METRICS, type LogoMotion } from './logoMotion'
import type { CornerLogoConfig } from './cornerLogoConfig'

// The reveal was unreachable from a test while it shared a closure with two
// GLTF loads, a KTX2 transcoder and a compileAsync — reaching `update()` meant
// standing up a WebGL context and serving two binaries. It reads a config, a
// group and a camera and writes a transform, so all of this is now arithmetic.
//
// The config here is deliberately NOT the shipped one. These assert the machine,
// which must hold for any tuning; the shipped numbers are a separate question
// and asserting both in one place is how a test starts failing for the wrong
// reason.
const CONFIG: CornerLogoConfig = {
  cornerFramePadding: 3,
  spinDuration: 1,
  spinPauseBefore: 0.25,
  swapCrossover: 0.5,
  swapDuration: 1,
  toCornerDuration: 0.5,
}

const FRAMED_DISTANCE = 100
const TWO_PI = Math.PI * 2

// A header line that is not the shipped one, for the same reason as CONFIG.
const METRICS = { insetLeftPx: 80, centerYPx: 60, heightPx: 30 }
// A model box, as assemble() would measure it: 2 wide, 1 tall.
const MODEL = new THREE.Vector3(2, 1, 0.2)

function halfHeight(): number {
  return Math.tan(THREE.MathUtils.degToRad(45 / 2)) * FRAMED_DISTANCE
}

/** World units per CSS pixel at the model plane — the mapping the machine uses. */
function worldPerPx(): number {
  return (2 * halfHeight()) / window.innerHeight
}

let group: THREE.Group
let camera: THREE.PerspectiveCamera
let motion: LogoMotion

beforeEach(() => {
  group = new THREE.Group()
  camera = new THREE.PerspectiveCamera(45, 16 / 9, 1, 1000)
  // Where assemble() puts it. Nothing moves it afterwards, which is what lets
  // the motion module read the framing distance back off the camera.
  camera.position.set(0, 0, FRAMED_DISTANCE)
  camera.updateProjectionMatrix()
  motion = createLogoMotion(CONFIG, group, camera)
})

/** Advance in fixed steps, the way a frame loop would. */
function run(seconds: number, dt = 1 / 60) {
  for (let t = 0; t < seconds; t += dt) motion.update(dt)
}

describe('createLogoMotion', () => {
  describe('hidden', () => {
    it('starts hidden and invisible', () => {
      expect(motion.isVisible()).toBe(false)
      expect(group.visible).toBe(false)
    })

    it('does not advance while hidden', () => {
      // The pipeline skips update() entirely while !isDrawable, but the machine
      // must not depend on that: advancing the clock while hidden is what would
      // make the reveal start mid-spin.
      run(5)
      expect(motion.isVisible()).toBe(false)
      expect(group.rotation.y).toBe(0)
      expect(group.position.x).toBe(0)
    })
  })

  describe('start', () => {
    it('reveals the group at zero scale, so it can bloom up', () => {
      motion.start()
      expect(motion.isVisible()).toBe(true)
      expect(group.visible).toBe(true)
      expect(group.scale.x).toBe(0)
    })

    it('is a no-op once already running', () => {
      motion.start()
      run(0.5)
      const rotation = group.rotation.y
      expect(rotation).toBeGreaterThan(0)
      motion.start()
      // A second call must not restart the spin from zero.
      expect(group.rotation.y).toBe(rotation)
    })
  })

  describe('the spin', () => {
    it('holds still for spinPauseBefore, then turns', () => {
      motion.start()
      run(CONFIG.spinPauseBefore * 0.5)
      expect(group.rotation.y).toBe(0)
      run(CONFIG.spinPauseBefore)
      expect(group.rotation.y).toBeGreaterThan(0)
    })

    it('blooms the scale up to 1 and does not overshoot', () => {
      motion.start()
      let peak = 0
      for (let i = 0; i < 240; i++) {
        motion.update(1 / 60)
        peak = Math.max(peak, group.scale.x)
      }
      expect(peak).toBeLessThanOrEqual(1 + 1e-9)
      expect(group.scale.x).toBeCloseTo(1, 6)
    })

    it('lands on exactly one full turn', () => {
      motion.start()
      run(CONFIG.spinPauseBefore + CONFIG.spinDuration + 0.1)
      expect(group.rotation.y).toBeCloseTo(TWO_PI, 6)
    })

    it('turns monotonically', () => {
      motion.start()
      let previous = -1
      for (let i = 0; i < 80; i++) {
        motion.update(1 / 60)
        expect(group.rotation.y).toBeGreaterThanOrEqual(previous)
        previous = group.rotation.y
      }
    })
  })

  describe('the flight to the corner', () => {
    it('ends up top-left of centre', () => {
      motion.start()
      run(5)
      // Left is negative x, up is positive y. A sign flip here would put the
      // logo off the opposite corner and still look like "it moved".
      expect(group.position.x).toBeLessThan(0)
      expect(group.position.y).toBeGreaterThan(0)
    })

    it('puts the centre on the header line without a model to measure', () => {
      // No model size: scale stays 1 and the box has no width to offset by, so
      // the position IS the inset and the line, converted to world units.
      motion.setCornerMetrics(METRICS)
      motion.snapToCorner()
      const halfH = halfHeight()
      const halfW = halfH * camera.aspect
      expect(group.scale.x).toBe(1)
      expect(group.position.x).toBeCloseTo(-halfW + METRICS.insetLeftPx * worldPerPx(), 6)
      expect(group.position.y).toBeCloseTo(halfH - METRICS.centerYPx * worldPerPx(), 6)
    })

    it('anchors the box edge to the inset and its height to the line', () => {
      motion.setModelSize(MODEL)
      motion.setCornerMetrics(METRICS)
      motion.snapToCorner()
      const halfH = halfHeight()
      const halfW = halfH * camera.aspect
      const perPx = worldPerPx()
      // The box is heightPx tall on screen whatever the framing made it.
      const scale = (METRICS.heightPx * perPx) / MODEL.y
      expect(group.scale.x).toBeCloseTo(scale, 9)
      // Left EDGE at the inset: the centre sits half the scaled width further in.
      const leftEdge = group.position.x - (scale * MODEL.x) / 2
      expect(leftEdge).toBeCloseTo(-halfW + METRICS.insetLeftPx * perPx, 6)
      expect(group.position.y).toBeCloseTo(halfH - METRICS.centerYPx * perPx, 6)
    })

    it('follows the header when the line moves', () => {
      motion.setModelSize(MODEL)
      motion.setCornerMetrics(METRICS)
      motion.snapToCorner()
      const before = { x: group.position.x, y: group.position.y, s: group.scale.x }

      // The phone breakpoint: a tighter inset, a lower line, a shorter control.
      motion.setCornerMetrics({ insetLeftPx: 12, centerYPx: 34, heightPx: 24 })
      motion.update(1 / 60)

      expect(group.position.x).toBeLessThan(before.x)
      expect(group.position.y).toBeGreaterThan(before.y)
      expect(group.scale.x).toBeLessThan(before.s)
    })

    it('flies from the crossover size to the header size', () => {
      motion.setModelSize(MODEL)
      motion.setCornerMetrics(METRICS)
      motion.start()
      run(CONFIG.spinPauseBefore + CONFIG.spinDuration + 0.05)
      // Leaving the spin at (or a frame or two past) the size the crossover needed …
      expect(group.scale.x).toBeCloseTo(1, 1)
      run(CONFIG.toCornerDuration + 0.1)
      // … and parked at the size the header asked for.
      expect(group.scale.x).toBeCloseTo((METRICS.heightPx * worldPerPx()) / MODEL.y, 9)
    })

    it('uses the desktop header until it is measured', () => {
      motion.snapToCorner()
      const halfH = halfHeight()
      expect(group.position.y).toBeCloseTo(
        halfH - DEFAULT_CORNER_METRICS.centerYPx * worldPerPx(),
        6,
      )
    })

    it('re-anchors on a resize without being told', () => {
      motion.snapToCorner()
      const before = group.position.x

      // Only the projection changes; the corner is recomputed per frame, which
      // is what makes a resize free.
      camera.aspect = 1
      camera.updateProjectionMatrix()
      motion.update(1 / 60)

      expect(group.position.x).not.toBeCloseTo(before, 6)
    })

    it('arrives at the same place the flight was aiming for', () => {
      motion.snapToCorner()
      const snapped = group.position.clone()

      motion.reset()
      motion.start()
      run(6)

      expect(group.position.x).toBeCloseTo(snapped.x, 6)
    })
  })

  describe('idling', () => {
    it('keeps rotating past the full turn', () => {
      motion.snapToCorner()
      expect(group.rotation.y).toBeCloseTo(TWO_PI, 6)
      run(1)
      expect(group.rotation.y).toBeGreaterThan(TWO_PI)
    })

    it('floats around the corner rather than drifting away from it', () => {
      motion.snapToCorner()
      const anchor = group.position.y
      let min = Infinity
      let max = -Infinity
      for (let i = 0; i < 600; i++) {
        motion.update(1 / 60)
        min = Math.min(min, group.position.y)
        max = Math.max(max, group.position.y)
      }
      // Bounded, and centred on the anchor — a drift would show as an envelope
      // that has moved off it.
      expect(max - min).toBeLessThan(0.1)
      expect((min + max) / 2).toBeCloseTo(anchor, 2)
    })

    it('holds x still while floating y', () => {
      motion.snapToCorner()
      const x = group.position.x
      run(2)
      expect(group.position.x).toBeCloseTo(x, 6)
    })
  })

  describe('snapToCorner', () => {
    it('skips the spin and the flight entirely', () => {
      motion.snapToCorner()
      expect(motion.isVisible()).toBe(true)
      expect(group.scale.x).toBe(1)
      expect(group.rotation.y).toBeCloseTo(TWO_PI, 6)
      expect(group.position.x).toBeLessThan(0)
    })
  })

  describe('reset', () => {
    it('returns to the hidden pose', () => {
      motion.snapToCorner()
      run(1)
      motion.reset()

      expect(motion.isVisible()).toBe(false)
      expect(group.visible).toBe(false)
      expect(group.position.x).toBe(0)
      expect(group.rotation.y).toBe(0)
      expect(group.scale.x).toBe(0)
    })

    it('allows the sequence to be replayed from the beginning', () => {
      motion.start()
      run(6)
      motion.reset()
      motion.start()
      expect(group.scale.x).toBe(0)
      expect(group.rotation.y).toBe(0)
    })
  })

  // The pixel→world mapping used to divide by `window.innerHeight`, which is the
  // render surface only because the scene canvas fills the window. The blog's
  // header draws the same logo into a canvas a few dozen pixels tall
  // (blog/headerLogoRuntime.ts), so the divisor is now supplied.
  describe('the surface the pixels are measured against', () => {
    /** The blog header's stage: 44 CSS px square. */
    const SMALL = 44

    function smallWorldPerPx(): number {
      return (2 * halfHeight()) / SMALL
    }

    it('defaults to the window, so the scene is unchanged', () => {
      motion.setModelSize(MODEL)
      motion.setCornerMetrics(METRICS)
      motion.snapToCorner()

      // The same expectation the corner cases above assert, restated here so a
      // regression in the default shows up beside the override that caused it.
      expect(group.scale.x).toBeCloseTo((METRICS.heightPx * worldPerPx()) / MODEL.y, 6)
    })

    it('scales the model to the header line within a small surface', () => {
      motion.setModelSize(MODEL)
      motion.setSurfaceHeight(SMALL)
      motion.setCornerMetrics({ insetLeftPx: 0, centerYPx: SMALL / 2, heightPx: 26 })
      motion.snapToCorner()

      expect(group.scale.x).toBeCloseTo((26 * smallWorldPerPx()) / MODEL.y, 6)
      // Two orders of magnitude apart from the windowed answer — the bug this
      // parameter exists to prevent would be invisible in a ratio test.
      expect(group.scale.x).toBeGreaterThan((26 * worldPerPx()) / MODEL.y)
    })

    it('centres the model when the inset is half the leftover width', () => {
      const markHeight = 26
      const markWidth = (MODEL.x / MODEL.y) * markHeight
      camera.aspect = 1
      camera.updateProjectionMatrix()

      motion.setModelSize(MODEL)
      motion.setSurfaceHeight(SMALL)
      motion.setCornerMetrics({
        insetLeftPx: (SMALL - markWidth) / 2,
        centerYPx: SMALL / 2,
        heightPx: markHeight,
      })
      motion.snapToCorner()

      // This is how headerLogoRuntime centres the mark: the motion module
      // anchors the box's LEFT EDGE, so centring is arithmetic at the call site
      // rather than a second placement mode in here.
      expect(group.position.x).toBeCloseTo(0, 6)
      expect(group.position.y).toBeCloseTo(0, 6)
    })

    it('ignores a zero-height surface rather than dividing by it', () => {
      motion.setModelSize(MODEL)
      motion.setSurfaceHeight(SMALL)
      // What a ResizeObserver reports for a box that has not been laid out yet.
      motion.setSurfaceHeight(0)
      motion.setCornerMetrics({ insetLeftPx: 0, centerYPx: SMALL / 2, heightPx: 26 })
      motion.snapToCorner()

      expect(Number.isFinite(group.scale.x)).toBe(true)
      expect(group.scale.x).toBeCloseTo((26 * smallWorldPerPx()) / MODEL.y, 6)
    })
  })
})
