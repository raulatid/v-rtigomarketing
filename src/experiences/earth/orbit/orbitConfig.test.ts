import { describe, it, expect } from 'vitest'
import { ORBIT_CONFIG, ORBIT_PRESETS, orbitRevealDuration } from './orbitConfig'

// The pairing assertions that stood here moved to resolveOrbitCases.test.ts,
// and the satellite-id assertion to content/caseStudies.test.ts. Neither was
// about orbits: `SATELLITES.length === ORBIT_PRESETS.length` asserted that the
// content happened to be the same length as the presets, which is exactly the
// coincidence id-based resolution exists to stop relying on.

describe('the orbit presets', () => {
  it('gives every preset a distinct id', () => {
    // Assignments name presets by id, so a duplicate makes one of them
    // unreachable and silently drops an orbit.
    const ids = ORBIT_PRESETS.map((preset) => preset.id)
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
  it('is positive and finite for every count the scene can produce', () => {
    // The timeline holds for exactly this long; a NaN or zero would either drop
    // the hold entirely or hang the intro on it. Zero is reachable now that the
    // count comes from the assignment table rather than from the preset list.
    for (const count of [0, 1, 6, 9]) {
      const duration = orbitRevealDuration(count)
      expect(Number.isFinite(duration), `count ${count}`).toBe(true)
      expect(duration, `count ${count}`).toBeGreaterThan(0)
    }
  })

  it('treats no orbits the same as one', () => {
    // A scene with nothing assigned still has to hold for something, and a
    // negative stagger would run the timeline backwards.
    expect(orbitRevealDuration(0)).toBe(orbitRevealDuration(1))
  })

  it('outlasts the animation it is holding for', () => {
    // Asserted as a bound rather than by restating the formula: a test that
    // recomputed introStartDelay + (n-1)*stagger + duration would agree with the
    // function even if both were wrong. The failure that matters is a hold
    // SHORTER than what is playing, which cuts the reveal off mid-flight.
    const { introStartDelay, introStagger, introDuration } = ORBIT_CONFIG.orbit
    expect(orbitRevealDuration(1)).toBeGreaterThanOrEqual(introStartDelay + introDuration)
    expect(orbitRevealDuration(2)).toBeGreaterThan(introStartDelay + introStagger)
  })

  it('grows by exactly one stagger per additional orbit', () => {
    // The property the hold depends on: each orbit starts one stagger after the
    // last, so the hold must track the count linearly. A formula that used the
    // preset count instead would not move at all here.
    const { introStagger } = ORBIT_CONFIG.orbit
    expect(orbitRevealDuration(4) - orbitRevealDuration(3)).toBeCloseTo(introStagger, 9)
    expect(orbitRevealDuration(9) - orbitRevealDuration(8)).toBeCloseTo(introStagger, 9)
  })
})

describe('the brand panel', () => {
  it('rests square and unfolds to exactly 2:1', () => {
    // The atlas cells are 1:1 and 2:1. The shader contain-fits, so a mismatch
    // would not throw — it would letterbox artwork that should fill the panel,
    // which is the kind of wrong nobody files a bug about.
    const panel = ORBIT_CONFIG.panel
    expect(panel.collapsedWidth / panel.height).toBe(1)
    expect(panel.expandedWidth / panel.height).toBe(2)
  })

  it('derives both widths from the height, so retuning cannot break the ratio', () => {
    // The guard on the tuning note in orbitConfig.ts: raise `height` and both
    // states move together. Someone widening `collapsedWidth` on its own to make
    // the resting panel read larger would break the 1:1 the isotype needs.
    const panel = ORBIT_CONFIG.panel
    expect(panel.collapsedWidth).toBe(panel.height)
    expect(panel.expandedWidth).toBe(panel.height * 2)
  })

  it('unfolds fast enough to keep pace with the camera move', () => {
    // Longer than the close-up flight and the panel is still opening after the
    // case panel has settled, which reads as lag rather than as one gesture.
    expect(ORBIT_CONFIG.panel.expandDuration).toBeGreaterThan(0)
    expect(ORBIT_CONFIG.panel.expandDuration).toBeLessThan(1)
  })

  it('keeps the panel clear of the satellite model it floats above', () => {
    // offsetY is derived from modelSize: the model's top sits near modelSize/2,
    // and the panel's lower edge at offsetY - height/2. Raising `height` for
    // legibility pushes that edge down into the model, which is the one thing
    // the tuning note asks to re-check.
    const { panel, satellite } = ORBIT_CONFIG
    const panelBottom = panel.offsetY - panel.height / 2
    const modelTop = satellite.modelSize / 2
    expect(panelBottom).toBeGreaterThan(modelTop * 0.8)
  })
})
