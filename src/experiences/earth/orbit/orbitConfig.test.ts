import { describe, it, expect } from 'vitest'
import { ORBIT_CONFIG, ORBIT_PRESETS, orbitRevealDuration } from './orbitConfig'
import { panelFootprint } from './createHoloPanel'
import { artworkHalfHeight } from './createBrandAtlas'

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

  it('deploys its wings exactly to the 2:1 field, and no further', () => {
    // The lockup is contain-fitted into a 2:1 field centred on the core. Wings
    // that stop short would leave the logo's ends floating past the structure;
    // wings that overshoot would frame empty field.
    const panel = ORBIT_CONFIG.panel
    const deployedWidth = panel.height * (1 + 2 * (panel.wingGap + panel.wingLength))
    expect(deployedWidth).toBeCloseTo(panel.expandedWidth, 10)
  })

  it('lets the emitter cone reach the satellite model', () => {
    // The cone is the cue that the satellite projects the hologram. A cone
    // whose foot ends above the model leaves a visible gap the eye reads as
    // "floating", which is the thing being fixed — and it is how the first
    // attempt failed, tapering to a point in open space above the satellite.
    const { panel, satellite } = ORBIT_CONFIG
    expect(panel.coneFootY).toBeLessThan(satellite.modelSize / 2)
    expect(panel.coneMouthY).toBeGreaterThan(panel.coneFootY)
  })

  it('lands the cone mouth exactly on the field lower edge', () => {
    // Derived, not chosen: light that stops short of the artwork leaves the two
    // visibly unconnected, and light that overshoots washes across the mark.
    const panel = ORBIT_CONFIG.panel
    expect(panel.coneMouthY).toBeCloseTo(panel.offsetY - panel.height / 2, 10)
  })

  it('keeps the halo inside the quad that carries it', () => {
    // THE FAILURE THIS CATCHES: a falloff still alight at the quad's boundary
    // is clipped by it, and the clip is a crisp rectangle — the card being left
    // behind, redrawn in the brand's own colour. The halo has compact support,
    // so this asserts the support fits: its radius must clear the shorter of
    // the two vertical distances from the field's centre to the quad's edge.
    const panel = ORBIT_CONFIG.panel
    const { height, originY } = panelFootprint(panel)
    const toTop = (1 - originY) * height
    expect(panel.haloRadius).toBeLessThan(toTop)
  })

  it('keeps the artwork clear of the emitter line at the field base', () => {
    // THE FAILURE THIS CATCHES, and it is one this repository actually walked
    // into on 2026-09-04: the atlas used to draw the whole FILE, so the shipped
    // lockup's mark reached 0.246 pane heights and the supplier's own baked-in
    // margin was doing the clearing. Fitting to the measured ink made the mark
    // as large as the cell allows, which is the point — and took it to 0.422,
    // through a rail that sat at 0.41.
    //
    // The two numbers live in different modules (CELL.padY in createBrandAtlas,
    // the field's own geometry here) and nothing else connects them, so that
    // collision was invisible until it was on screen. This is that connection.
    //
    // REPOINTED 2026-09-07: the rails were removed at the client's request.
    // What is still drawn down there is the emitter line and its wash, at
    // p.y = -0.5 — where `fuv = p + 0.5` puts the bottom of the cell. That is a
    // structural constant of the field's own space rather than a tunable, so it
    // is written here instead of read from config.
    const FIELD_EDGE = 0.5
    // The cell's full height maps to p.y in +-0.5 at the deployed field, so the
    // artwork's half-height in pane units is half the padded fraction.
    //
    // Both kinds, because both are on screen through the deploy: the isotype is
    // still crossfading out over its last quarter.
    for (const kind of ['logo', 'isotype'] as const) {
      expect(artworkHalfHeight(kind), kind).toBeLessThan(FIELD_EDGE)
      // Not merely 'does not touch'. The wash climbs off that line into the
      // field with an e-fold of 0.20 pane heights (createHoloPanel's `wash`),
      // so ink parked within half of that sits in the brightest part of the
      // light rather than above it.
      expect(FIELD_EDGE - artworkHalfHeight(kind), kind).toBeGreaterThan(0.10)
    }
  })

  it('keeps the invitation quieter than the hover bump', () => {
    // The invited satellite breathes larger so the overview reads "clickable",
    // but hovering it must still be a step up, not a step sideways.
    const { panel, satellite } = ORBIT_CONFIG
    expect(satellite.inviteScale).toBeGreaterThan(1)
    expect(satellite.inviteScale).toBeLessThan(satellite.highlightScale)
    expect(panel.inviteGain).toBeGreaterThan(0)
    expect(panel.coneInviteGain).toBeGreaterThanOrEqual(0)
  })

  it('swells the tutorial pulse past the hover bump, but not into a lurch', () => {
    // The demonstration has to out-read the pointer's own answer — a viewer
    // with no cursor has nothing to compare it against — while staying a bump
    // rather than a jump. Only the invited satellite ever reaches it.
    const { satellite } = ORBIT_CONFIG
    expect(satellite.demoScale).toBeGreaterThan(satellite.highlightScale)
    expect(satellite.demoScale).toBeLessThanOrEqual(1.5)
  })

  it('keeps the hover light within the invitation, and the bump short', () => {
    // Hover reinforces the panel on the same eased strength as the bump. It
    // must not out-shine the invitation's own gain — the line saturates near
    // it — and the rise must be a beat, not a transition.
    const { panel, satellite } = ORBIT_CONFIG
    expect(panel.hoverGain).toBeGreaterThan(0)
    expect(panel.hoverGain).toBeLessThanOrEqual(panel.inviteGain)
    expect(panel.coneHoverGain).toBeGreaterThanOrEqual(0)
    expect(panel.coneHoverGain).toBeLessThanOrEqual(panel.coneInviteGain)
    expect(satellite.highlightDuration).toBeGreaterThan(0)
    expect(satellite.highlightDuration).toBeLessThan(1)
  })

  it('keeps the hover tutorial to one pulse that the cue announces', () => {
    // One per round: with the cycle down to three seconds, a round of two read
    // as a burst rather than as a single, repeated offer. The cue has to land
    // before the hover it announces, and every timing stays inside the bands
    // the brief set, so a retune cannot quietly turn a hint into a show.
    const t = ORBIT_CONFIG.tutorial
    expect(t.pulses).toBe(1)
    expect(t.armDelay).toBeGreaterThanOrEqual(0.8)
    expect(t.armDelay).toBeLessThanOrEqual(1.5)
    expect(t.hold).toBeGreaterThanOrEqual(0.3)
    expect(t.hold).toBeLessThanOrEqual(1.5)
    expect(t.gap).toBeGreaterThanOrEqual(0.3)
    expect(t.gap).toBeLessThanOrEqual(1.5)
    expect(t.cueLead).toBeGreaterThan(0)
    expect(t.cueLead).toBeLessThan(t.cueDuration)
    expect(t.cueDuration).toBeLessThanOrEqual(2)
    expect(t.cueCount).toBeGreaterThanOrEqual(10)
    expect(t.cueCount).toBeLessThanOrEqual(60)
    expect(t.cueRadius).toBeGreaterThan(ORBIT_CONFIG.satellite.modelSize / 2)
    expect(t.cueSize).toBeGreaterThan(0)
    expect(t.cueSize).toBeLessThanOrEqual(0.1)
    expect(t.visibleMarginNdc).toBeGreaterThan(0)
    expect(t.visibleMarginNdc).toBeLessThan(0.5)
    expect(t.reducedMotionHoldScale).toBeGreaterThanOrEqual(1)
  })

  it('repeats the offer on a three-second beat', () => {
    // The client's number. The four knobs below are the whole cycle, so any
    // retune that moved one of them without the others would silently change
    // how often the hint is made.
    const t = ORBIT_CONFIG.tutorial
    const cycle = t.pulses * (t.cueLead + t.hold + t.gap) + t.roundGap
    expect(cycle).toBeCloseTo(3, 6)
    // Still more quiet than pulse: the offer is made again, it does not run.
    expect(t.gap + t.roundGap).toBeGreaterThan(t.hold)
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
