import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import {
  HEADLINE_FLIGHT,
  fadeIn,
  flightDuration,
  letterAngle,
  letterLag,
  liftAmount,
  liftStart,
  orbitRadius,
  planetCover,
  ringFrame,
  ringPoint,
  ringTurn,
  type RingFrame,
} from './headlineFlight'

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z)
const frame = (): RingFrame => ({ centre: v(), right: v(), toward: v(), radius: 1 })

// A camera on +Z looking at the origin, as the Earth's rest pose does.
const eye = v(0, 0, 14)
const centreDistance = 14
const restDistance = 11.8
const radius = orbitRadius(centreDistance, restDistance, 2)
const orbit = ringFrame(eye, v(1, 0, 0), v(0, 1, 0), v(), radius, HEADLINE_FLIGHT.tilt, frame())

describe('the orbit', () => {
  it('runs right to left across its near half, below its centre', () => {
    const right = ringPoint(orbit, 0, v())
    const near = ringPoint(orbit, Math.PI / 2, v())
    const left = ringPoint(orbit, Math.PI, v())
    expect(right.x).toBeCloseTo(radius)
    expect(left.x).toBeCloseTo(-radius)
    expect(near.x).toBeCloseTo(0)
    expect(near.z).toBeGreaterThan(0)
    expect(near.y).toBeLessThan(0)
  })

  it('keeps every point at its radius from the centre', () => {
    for (const angle of [0, 0.7, 2, 4, 5.5]) {
      expect(ringPoint(orbit, angle, v()).length()).toBeCloseTo(radius)
    }
  })

  it('passes its near point at the depth where the word is nearScale times its size', () => {
    const near = ringPoint(orbit, Math.PI / 2, v())
    expect(restDistance / (eye.z - near.z)).toBeCloseTo(HEADLINE_FLIGHT.nearScale)
  })

  it('never shrinks inside the planet', () => {
    expect(orbitRadius(3, 2, 2)).toBe(HEADLINE_FLIGHT.minRadius * 2)
  })
})

describe('the planet in the way', () => {
  it('hides a point behind it and leaves one in front or clear of the disc', () => {
    expect(planetCover(eye, v(0, 0, -3), v(), 2)).toBe(0)
    expect(planetCover(eye, v(0, 0, 3), v(), 2)).toBe(1)
    expect(planetCover(eye, v(4, 0, -3), v(), 2)).toBe(1)
  })

  it('fades across the limb rather than switching', () => {
    // Behind the planet, just inside its silhouette.
    const cover = planetCover(eye, v(2.05, 0, -0.5), v(), 2, 0.04)
    expect(cover).toBeGreaterThan(0)
    expect(cover).toBeLessThan(1)
  })

  it('hides the far point of the orbit and shows its near one', () => {
    expect(planetCover(eye, ringPoint(orbit, -Math.PI / 2, v()), v(), 2)).toBe(0)
    expect(planetCover(eye, ringPoint(orbit, Math.PI / 2, v()), v(), 2)).toBe(1)
  })
})

describe('a letter turning with the orbit', () => {
  it('faces the eye at the near point, goes edge-on on the way round and is turned away behind', () => {
    const at = (angle: number) => ringTurn(orbit, angle, eye, ringPoint(orbit, angle, v()))
    // Nearly square-on: the orbit is tipped by its tilt, and the eye, this
    // close, looks up at its near point by a few degrees more.
    expect(at(Math.PI / 2)).toBeGreaterThan(0.95)
    // Seen from this close, the orbit's side ends are already turned away: it
    // goes edge-on between the near point and each end, on both sides.
    expect(at(0)).toBeLessThan(0)
    expect(at(Math.PI)).toBeLessThan(0)
    const edgeOn = [0.1, 0.3, 0.5, 0.7, 0.9].map((k) => at((k * Math.PI) / 2))
    expect(Math.min(...edgeOn.map(Math.abs))).toBeLessThan(0.3)
    expect(at(-Math.PI / 2)).toBeLessThan(-0.9)
  })
})

describe('the schedule', () => {
  it('swings from behind the planet to its near point and stops there', () => {
    const { sweep, travel } = HEADLINE_FLIGHT
    expect(letterAngle(0, 0)).toBeCloseTo(Math.PI / 2 - sweep)
    expect(letterAngle(travel, 0)).toBeCloseTo(Math.PI / 2)
    expect(letterAngle(travel + 1, 0.2)).toBeCloseTo(Math.PI / 2 + 0.2)
    let last = -Infinity
    for (let t = 0; t <= travel; t += travel / 50) {
      const angle = letterAngle(t, 0)
      expect(angle).toBeGreaterThanOrEqual(last)
      last = angle
    }
  })

  it('pulls the letters back in reading order, only once they have stopped, and lands them all', () => {
    const count = 18
    expect(liftStart(0)).toBeGreaterThanOrEqual(HEADLINE_FLIGHT.travel)
    expect(liftStart(1)).toBeGreaterThan(liftStart(0))
    const end = flightDuration(count)
    for (const order of [0, 7, count - 1]) {
      expect(liftAmount(liftStart(order) - 0.01, order)).toBe(0)
      expect(liftAmount(end, order)).toBe(1)
    }
  })

  it('fades in over its own time', () => {
    expect(fadeIn(0)).toBe(0)
    expect(fadeIn(HEADLINE_FLIGHT.fadeIn)).toBe(1)
  })
})

describe('the spacing', () => {
  it('turns a pixel advance into the arc that spans it at the rest plane', () => {
    const focal = 1086
    const lag = letterLag(100, restDistance, radius, focal)
    // An arc R·lag at the rest plane, seen at `focal`.
    expect((radius * lag * focal) / restDistance).toBeCloseTo(100)
  })
})
