// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import * as THREE from 'three'
import { createLogoMotion, type LogoMotion } from './logoMotion'
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
  cornerMarginX: 80,
  cornerMarginY: 60,
  spinDuration: 1,
  spinPauseBefore: 0.25,
  swapCrossover: 0.5,
  swapDuration: 1,
  toCornerDuration: 0.5,
}

const FRAMED_DISTANCE = 100
const TWO_PI = Math.PI * 2

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

    it('places the corner by the closed form the framing implies', () => {
      motion.snapToCorner()
      const halfH = Math.tan(THREE.MathUtils.degToRad(45 / 2)) * FRAMED_DISTANCE
      const halfW = halfH * camera.aspect
      expect(group.position.x).toBeCloseTo(
        halfW * (-1 + (2 * CONFIG.cornerMarginX) / window.innerWidth),
        6,
      )
      expect(group.position.y).toBeCloseTo(
        halfH * (1 - (2 * CONFIG.cornerMarginY) / window.innerHeight),
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
})
