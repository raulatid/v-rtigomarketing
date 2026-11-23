import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { solveAboutStops, type AboutGeometry, type AboutLayout } from '../about/aboutPoses'
import {
  ISOTYPE_GLOW,
  isotypeGlowAt,
  PULSE_LEAD,
  PULSE_REACH,
  PULSE_SECONDS,
  pulseAt,
  REVEAL_EDGE,
  revealedAt,
} from './skyPulse'

// The tower is the prototypes' (aboutPoses.test.ts, brandLanes.test.ts).
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

const FRAMES: ReadonlyArray<{ name: string; layout: AboutLayout; width: number; height: number }> = [
  { name: 'desktop 1440×900', layout: 'docked', width: 1440, height: 900 },
  { name: 'desktop 1280×720', layout: 'docked', width: 1280, height: 720 },
  { name: 'desktop 1024×768', layout: 'docked', width: 1024, height: 768 },
  { name: 'desktop 1920×1080', layout: 'docked', width: 1920, height: 1080 },
  { name: 'phone 390×844', layout: 'sheet', width: 390, height: 844 },
  { name: 'phone 375×667', layout: 'sheet', width: 375, height: 667 },
  { name: 'tablet 768×1024', layout: 'sheet', width: 768, height: 1024 },
]

describe('the sky pulse', () => {
  it('reveals nothing and gives no light before it leaves', () => {
    const before = pulseAt(-0.2)
    expect(before.glow).toBe(0)
    expect(before.done).toBe(false)
    expect(revealedAt(before, 0)).toBe(0)
  })

  it('runs its front out from the isotype, never back, to its reach', () => {
    let last = -Infinity
    for (let t = 0; t <= PULSE_SECONDS; t += 0.01) {
      const { front } = pulseAt(t)
      expect(front).toBeGreaterThanOrEqual(last)
      last = front
    }
    expect(pulseAt(PULSE_SECONDS).front).toBeCloseTo(PULSE_REACH, 6)
    expect(pulseAt(PULSE_SECONDS).done).toBe(true)
    // Fast out of the isotype and braking at the edges: ahead of a steady front all the way.
    for (const share of [0.25, 0.5, 0.75]) {
      expect(pulseAt(PULSE_SECONDS * share).front).toBeGreaterThan(PULSE_REACH * share)
    }
  })

  it('lights the ring as it leaves and has it dark by the time it runs out', () => {
    expect(pulseAt(0).glow).toBe(0)
    expect(pulseAt(PULSE_SECONDS * 0.3).glow).toBeCloseTo(1, 6)
    expect(pulseAt(PULSE_SECONDS).glow).toBe(0)
  })

  it('reveals what the front has crossed, nearer first, and everything once it is done', () => {
    const frame = pulseAt(0.3)
    expect(revealedAt(frame, frame.front - REVEAL_EDGE)).toBe(1)
    expect(revealedAt(frame, frame.front)).toBe(0)
    expect(revealedAt(frame, 0.1)).toBeGreaterThanOrEqual(revealedAt(frame, 0.2))
    expect(revealedAt(pulseAt(PULSE_SECONDS), 3)).toBe(1)
    expect(revealedAt(pulseAt(Number.POSITIVE_INFINITY), 3)).toBe(1)
  })

  it('leaves 0.7 s into the 1.0 s flight to the sky', () => {
    expect(1.0 - PULSE_LEAD).toBeCloseTo(0.7, 6)
  })

  // When the ring runs out the veil goes: anything of the frame still outside
  // the front would jump from the day to the night in one frame.
  it.each(FRAMES)('runs out past the farthest corner of the sky stop, $name', (frame) => {
    const aspect = frame.width / frame.height
    const pose = solveAboutStops(GEOMETRY, { fov: 35, aspect }, frame.layout)[2]!
    const camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 5000)
    camera.position.copy(pose.position)
    camera.lookAt(pose.target)
    camera.updateMatrixWorld(true)
    const origin = GEOMETRY.logo.clone().sub(pose.position).normalize()
    let farthest = 0
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      const corner = new THREE.Vector3(x, y, 0.5).unproject(camera).sub(camera.position).normalize()
      farthest = Math.max(farthest, corner.angleTo(origin))
    }
    expect(farthest).toBeLessThan(PULSE_REACH - REVEAL_EDGE)
  })

  it('flashes the isotype as the ring leaves and settles it to an ember', () => {
    expect(isotypeGlowAt(-0.1)).toBe(0)
    expect(isotypeGlowAt(0)).toBeCloseTo(ISOTYPE_GLOW.flash, 6)
    expect(isotypeGlowAt(3)).toBeCloseTo(ISOTYPE_GLOW.ember, 6)
    for (let t = 0; t < 3; t += 0.05) expect(isotypeGlowAt(t)).toBeGreaterThanOrEqual(ISOTYPE_GLOW.ember * 0.5)
  })
})
