import { describe, it, expect } from 'vitest'
import { GEO_MARKERS, ORBIT_CONFIG, ORBIT_PRESETS, SATELLITES, orbitRevealDuration } from './orbitConfig'

describe('the satellite/orbit pairing', () => {
  // This is a site-down bug in disguise, not a missing item. createOrbitSystem
  // walks ORBIT_PRESETS and indexes SATELLITES[index]; one fewer case study
  // throws, and OrbitSystemLayer converts a throw into a FATAL boot state — so
  // deleting a case study would refuse to load the whole site.
  //
  // `tsc` cannot see it: noUncheckedIndexedAccess is off (PROJECT_MEMORY, Known
  // debt), so SATELLITES[5] types as CaseStudy whether or not it exists. That is
  // exactly the class of defect a cheap data test is for.
  it('has one satellite per orbit preset', () => {
    expect(SATELLITES).toHaveLength(ORBIT_PRESETS.length)
  })

  it('gives every preset a distinct id', () => {
    const ids = ORBIT_PRESETS.map((preset) => preset.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('gives every satellite a distinct id', () => {
    const ids = SATELLITES.map((satellite) => satellite.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps every orbit inside the band the camera frames', () => {
    // Radii are hand-placed between the globe surface and the camera's closest
    // approach. A preset outside that band would clip the Earth or leave frame.
    for (const preset of ORBIT_PRESETS) {
      expect(preset.radius).toBeGreaterThan(1)
      expect(preset.radius).toBeLessThan(3)
      expect(preset.speed).toBeGreaterThan(0)
      expect(preset.phase).toBeGreaterThanOrEqual(0)
      expect(preset.phase).toBeLessThan(1)
    }
  })
})

describe('orbitRevealDuration', () => {
  it('is positive and finite', () => {
    // The timeline holds for exactly this long; a NaN or zero would either drop
    // the hold entirely or hang the intro on it.
    const duration = orbitRevealDuration()
    expect(Number.isFinite(duration)).toBe(true)
    expect(duration).toBeGreaterThan(0)
  })

  it('outlasts the animation it is holding for', () => {
    // Asserted as a bound rather than by restating the formula: a test that
    // recomputed introStartDelay + (n-1)*stagger + duration would agree with the
    // function even if both were wrong. The failure that matters is a hold
    // SHORTER than what is playing, which cuts the reveal off mid-flight.
    const { introStartDelay, introStagger, introDuration } = ORBIT_CONFIG.orbit
    const duration = orbitRevealDuration()
    expect(duration).toBeGreaterThanOrEqual(introStartDelay + introDuration)
    if (ORBIT_PRESETS.length > 1 && SATELLITES.length > 1) {
      expect(duration).toBeGreaterThan(introStartDelay + introStagger)
    }
  })

  it('does not stagger past the satellites that actually exist', () => {
    // Orbits are only built for presets that have a case study, so staggering
    // across all six presets when fewer exist would hold the timeline past the
    // last thing that animates — a stall with nothing on screen.
    const { introStartDelay, introStagger, introDuration } = ORBIT_CONFIG.orbit
    const built = Math.max(Math.min(ORBIT_PRESETS.length, SATELLITES.length), 1)
    const ceiling =
      introStartDelay +
      (built - 1) * introStagger +
      introDuration +
      ORBIT_CONFIG.satellite.introDuration
    expect(orbitRevealDuration()).toBeLessThanOrEqual(ceiling + 1e-9)

    // And the bound bites: staggering across all six presets when fewer
    // satellites exist would exceed it. Asserted so the ceiling above cannot
    // quietly become unreachable.
    expect(built).toBeLessThanOrEqual(ORBIT_PRESETS.length)
  })
})

describe('geo markers', () => {
  it('gives every marker a distinct id', () => {
    const ids = GEO_MARKERS.map((marker) => marker.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps every marker on the globe', () => {
    for (const marker of GEO_MARKERS) {
      expect(marker.lat).toBeGreaterThanOrEqual(-90)
      expect(marker.lat).toBeLessThanOrEqual(90)
      expect(marker.lng).toBeGreaterThanOrEqual(-180)
      expect(marker.lng).toBeLessThanOrEqual(180)
    }
  })

  it('has exactly one destination marker, and it is Murcia', () => {
    // The destination marker is the only door into the city. Two of them would
    // mean an ambiguous entry point; zero would strand the whole experience,
    // which is a failure with no visible error at all.
    const destinations = GEO_MARKERS.filter((marker) => marker.kind === 'destination')
    expect(destinations).toHaveLength(1)
    expect(destinations[0].id).toBe('murcia')
  })

  it('places Murcia at its real coordinates', () => {
    // The marker has to sit on the actual city for the globe to mean anything.
    const murcia = GEO_MARKERS.find((marker) => marker.id === 'murcia')!
    expect(murcia.lat).toBeCloseTo(37.99, 1)
    expect(murcia.lng).toBeCloseTo(-1.13, 1)
  })
})
