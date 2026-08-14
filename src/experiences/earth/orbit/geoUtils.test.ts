import { describe, it, expect } from 'vitest'
import { LONGITUDE_OFFSET, latLngToVector3, spinToFace } from './geoUtils'
import { GEO_MARKERS } from './orbitConfig'

const RADIUS = 1

describe('latLngToVector3', () => {
  it('puts every point on the sphere of the requested radius', () => {
    for (const radius of [1, 2.5, 100]) {
      for (let lat = -90; lat <= 90; lat += 15) {
        for (let lng = -180; lng <= 180; lng += 15) {
          expect(latLngToVector3(lat, lng, radius).length()).toBeCloseTo(radius, 6)
        }
      }
    }
  })

  it('puts the poles on the Y axis', () => {
    const north = latLngToVector3(90, 0, RADIUS)
    expect(north.y).toBeCloseTo(1, 6)
    expect(north.x).toBeCloseTo(0, 6)
    expect(north.z).toBeCloseTo(0, 6)

    expect(latLngToVector3(-90, 0, RADIUS).y).toBeCloseTo(-1, 6)
  })

  it('keeps the equator in the XZ plane', () => {
    for (let lng = -180; lng <= 180; lng += 30) {
      expect(latLngToVector3(0, lng, RADIUS).y).toBeCloseTo(0, 6)
    }
  })

  it('is continuous across the antimeridian', () => {
    // ±180 is the same meridian. A discontinuity here would jump any marker
    // near the date line.
    const west = latLngToVector3(0, -180, RADIUS)
    const east = latLngToVector3(0, 180, RADIUS)
    expect(west.x).toBeCloseTo(east.x, 6)
    expect(west.z).toBeCloseTo(east.z, 6)
  })

  it('separates the real marker coordinates', () => {
    // Two cities mapping to the same point would stack their labels with no
    // error anywhere.
    const points = GEO_MARKERS.map((m) => latLngToVector3(m.lat, m.lng, RADIUS))
    for (let i = 0; i < points.length; i += 1) {
      for (let j = i + 1; j < points.length; j += 1) {
        expect(points[i].distanceTo(points[j])).toBeGreaterThan(0.01)
      }
    }
  })
})

describe('spinToFace', () => {
  it('turns the requested point toward the camera on +Z', () => {
    // The derivation: rotating about Y by θ maps a point's angle from +Z, a, to
    // a + θ, so facing the camera means θ = -a. Verified by applying the
    // rotation rather than by restating the formula — a restated formula would
    // agree with a sign error.
    for (const [lat, lng] of [
      [0, 0],
      [37.99, -1.13],
      [-33.87, 151.21],
      [51.51, -0.13],
    ]) {
      const point = latLngToVector3(lat, lng, RADIUS)
      point.applyAxisAngle({ x: 0, y: 1, z: 0 } as never, spinToFace(lat, lng))
      // Facing the camera means the X component vanishes and Z is positive.
      expect(point.x).toBeCloseTo(0, 6)
      expect(point.z).toBeGreaterThan(0)
    }
  })

  it('is computed from the coordinates, not hardcoded', () => {
    // Moving a destination marker must move the Earth's resting heading with it.
    expect(spinToFace(0, 10)).not.toBeCloseTo(spinToFace(0, 20), 3)
  })
})

describe('LONGITUDE_OFFSET', () => {
  it('is zero, which is the value validated against the shipped texture', () => {
    // Recorded deliberately: this is the dial to turn if markers ever appear
    // shifted relative to the map, and the city coordinates are NOT.
    expect(LONGITUDE_OFFSET).toBe(0)
  })
})
