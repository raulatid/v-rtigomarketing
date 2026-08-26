import type { CaseStudy } from '../../../content/types'

// Configuration for the orbital satellite system, ported from
// earth-connections/src/scenes/earth-connections/orbit-system/orbitConfig.js.
//
// IMPORTANT — scale. Every radius here is expressed in "Earth radius = 1" units,
// which is what earth-connections uses. Our Earth is radius 2, so the whole
// orbit group is mounted with scale={2} rather than these numbers being
// rewritten. Keep it that way: it means presets stay diffable against the
// source project.

/**
 * The brand panel's height, and the only size knob it has.
 *
 * The panel rests as a SQUARE showing the brand's isotype and unfolds to 2:1
 * showing the full lockup, so both of its widths are derived from this rather
 * than written out independently. Retuning the panel then moves both states
 * together and the 1:1 → 2:1 relationship cannot drift.
 *
 * If the resting square reads small in the overview, raise this — never widen
 * the collapsed state on its own. Raising it also lowers the panel's bottom edge
 * toward the satellite model, so re-check `panel.offsetY` against the
 * `satellite.modelSize` reasoning documented there.
 */
const PANEL_HEIGHT = 0.14
// See `panel.wingGap`. Hoisted because `panel.wingLength` is derived from it.
const WING_GAP = 0.04

export const ORBIT_CONFIG = {
  orbit: {
    segments: 256,
    // Back at the source's value. It was raised to 0.09 for a while, because
    // completed orbits all but vanish once their head glow fades — if the paths
    // ever need to read stronger again, that is the tested value to reach for.
    // Radii here stay in the source's "Earth radius = 1" units: DECISIONS.md
    // 26.10, reconciled at the mount rather than rewritten.
    lineOpacity: 0.02,
    lineColor: 0xffffff,
    // Seconds each orbit line takes to draw in.
    introDuration: 1.8,
    // Seconds between consecutive orbit draw-in starts.
    introStagger: 0.18,
    // Seconds before the first orbit starts drawing.
    introStartDelay: 0.2,
  },

  headGlow: {
    size: 0.045,
    color: 0xffffff,
    opacity: 0.9,
    // Seconds the head takes to fade out once its orbit completes.
    fadeOutDuration: 0.35,
  },

  satellite: {
    // Radius of the invisible raycast/hover sphere. It tracks `modelSize` rather
    // than standing on its own: 0.10 was the old flat badge's footprint, and
    // leaving it there while the model doubled would have buried the hit target
    // inside the model, giving the outer half of every satellite a dead zone the
    // cursor passes straight through.
    baseSize: 0.20,
    // World size (max dimension) of the satellite GLB, in Earth-radius=1 units.
    // The model template is normalised to unit size, so this is the only knob.
    //
    // DOUBLED from 0.26 on 2026-08-20 — the model read too small in the
    // overview. `baseSize`, `panel.offsetY` and `interactionConfig`'s
    // `closeUp.distance` are all derived from this number; see DECISIONS 26.11.
    modelSize: 0.52,
    // Continuous self-rotation in radians/second (varied ±15% per satellite).
    // Runs through the case-panel freeze so enter/exit never interrupts it.
    modelSpinSpeed: 0.25,
    introScaleStart: 0.65,
    introDuration: 0.55,
    // Hover/selection bump. Applied to an INNER group — the outer group's scale
    // is written every frame by the intro animation and would overwrite it.
    highlightScale: 1.14,
  },

  // Holographic brand panel floating above each satellite. All sizes are in the
  // same "Earth radius = 1" units as everything else in this file.
  panel: {
    // All three derived from PANEL_HEIGHT — see the note on it for why.
    //
    // Panel aspect no longer has to match the atlas cell aspect: the shader
    // contain-fits every sample against the panel's current aspect, which is
    // what lets one quad show a 1:1 symbol and a 2:1 lockup without distorting
    // either.
    height: PANEL_HEIGHT,
    /** Square: the isotype at rest. */
    collapsedWidth: PANEL_HEIGHT,
    /** 2:1: the full lockup while the case study is selected. */
    expandedWidth: PANEL_HEIGHT * 2,
    // The unfold. Fast enough not to lag the camera's move to the close-up,
    // slow enough to read as a deliberate reveal rather than a pop. Reversible
    // at any point: selecting another satellite mid-unfold turns this one around
    // from wherever it is.
    expandDuration: 0.35,
    // Height of the CORE'S CENTRE above the satellite's centre. DERIVED FROM
    // `modelSize`, not chosen independently: the model's max dimension is
    // `modelSize` (0.52), so its top sits near 0.26, and the core's lower edge
    // is `offsetY - height / 2`. At 0.34 that edge lands at 0.27 — just clear
    // of the model — and the stem (`stemLength` × `height` ≈ 0.05) reaches back
    // down to 0.22, so the emitter beam visibly enters the model's top rather
    // than stopping short of it or the core sitting on it.
    //
    // Note the panel itself did NOT double with the model: doubling `offsetY`
    // alone would have pushed the plate DEEPER into the model, because the
    // half-height being subtracted stayed put.
    offsetY: 0.34,
    // Ceiling on the panel's fade, so the entrance can drive it 0→1 while the
    // panel still reads as a projection rather than a solid card.
    maxOpacity: 0.95,

    // ── The split plate (plan 007) ──
    // The hologram is a square CORE that holds the isotype, with two lateral
    // WINGS that deploy from it on selection to make the 2:1 field the lockup
    // needs, and a STEM beneath it carrying the emitter beam down toward the
    // satellite. Everything below is in PANE HEIGHTS — multiples of `height` —
    // so the composition is one shape that `height` scales as a whole.
    //
    // The quad itself never changes size: it is always the fully deployed
    // footprint, and the shader draws only the parts the expansion has opened.
    // That is what lets one quad and one draw call carry a three-part silhouette.

    // Space between the core's edge and a wing's root. The wings are a
    // separate structure that deploys, not the core getting wider; the gap is
    // what says so.
    wingGap: 0.04,
    // Each wing's deployed length. Derived so core + gap + wing on both sides
    // lands exactly on `expandedWidth`: the wings terminate where the 2:1 field
    // ends, and the lockup's contain-fit reaches the wing tips and no further.
    wingLength: 0.5 - WING_GAP,
    // Wing height as a fraction of the core's. Shorter than the core, so the
    // silhouette steps down at the wing roots (┌─ ─┐ / ───┤ ├───) instead of
    // one rectangle stretching. The logo cell's vertical padding (56/512 per
    // side) keeps the lockup's ink inside this band.
    wingHeight: 0.82,
    // Length of the stem below the core's bottom edge, where the emitter beam
    // fades toward the satellite. At 0.35 pane heights the beam's foot lands
    // just above the model's top (see `offsetY`) so the two visibly meet.
    stemLength: 0.35,
    // Arm length of the core's corner brackets, from the corner along each edge.
    bracketLength: 0.14,
    // Transparent margin around the deployed footprint, so hairlines and the
    // wings' terminal nodes are never clipped by the quad's edge.
    margin: 0.06,
    // Peak alpha of the dark glass, at the pane's bottom edge; the top edge
    // sits at 70% of it. Matches `.case-panel` beside it — the two describe
    // the same brand and should look like the same material. The chrome is
    // deliberately NOT brand-coloured except for the emitter line: the artwork
    // inside is the brand's, and a tinted pane under a real logo is a colour
    // cast on someone's trademark.
    glassAlpha: 0.42,
  },

  cloud: {
    pointCount: 200,
    radius: 1.1,
    color: 0xffffff,
    opacity: 0.2,
    size: 0.04,
    // Fraction of base opacity the breathing pulse adds/removes.
    pulseStrength: 0.08,
    fadeInDuration: 1.2,
    rotationSpeedY: 0.015,
    rotationSpeedX: 0.004,
  },
}

export interface OrbitPreset {
  id: string
  radius: number
  inclination: number
  rotationY: number
  speed: number
  phase: number
}

// Six fixed orbits — controlled variation, no runtime randomness.
export const ORBIT_PRESETS: OrbitPreset[] = [
  { id: 'orbit-01', radius: 1.52, inclination: 18, rotationY: 20, speed: 0.035, phase: 0.05 },
  { id: 'orbit-02', radius: 1.6, inclination: -26, rotationY: 72, speed: 0.028, phase: 0.22 },
  { id: 'orbit-03', radius: 1.68, inclination: 38, rotationY: 118, speed: 0.024, phase: 0.41 },
  { id: 'orbit-04', radius: 1.76, inclination: -42, rotationY: 164, speed: 0.021, phase: 0.63 },
  { id: 'orbit-05', radius: 1.84, inclination: 58, rotationY: 210, speed: 0.018, phase: 0.78 },
  { id: 'orbit-06', radius: 1.92, inclination: -64, rotationY: 292, speed: 0.016, phase: 0.91 },
]

// The satellite's content type IS the case-study type — there is no second
// shape to keep in sync. Content lives in src/content/caseStudies.ts (placeholder
// data today, generated from WordPress at build time later); this module only
// decides which orbit each one rides. `logo` is the real logo's URL — always a
// path under /public, because the media pipeline mirrors CMS uploads rather than
// hotlinking them; while null (or if the image fails to load), the atlas keeps
// its generated mark-and-wordmark plate.
export type SatelliteDef = CaseStudy

// NO CONTENT RE-EXPORT HERE, and it is load-bearing rather than tidiness.
//
// This module used to carry `export const SATELLITES = CASE_STUDIES`. That made
// it a module BOTH chunks need: `useMasterTimeline` (app entry) imports
// `orbitRevealDuration` from here, and `createOrbitSystem` (scene chunk) imported
// `SATELLITES`. Rollup resolves a shared module by hoisting it into the common
// chunk — the app entry — and re-exporting, so every word of case-study prose was
// pinned inside a chunk with a hard 320,000 B budget that FAILS the build.
//
// `createOrbitSystem` imports the content directly instead. Nothing about the
// orbits' geometry depends on what rides them, so this module now holds only
// numbers and stays cheap to share.

// DESTINATION_MARKER stood here. The marker system is gone (the product
// removed it outright — see navigation/destination.ts), and the coordinates
// moved there with the warp aim that consumes them.

// The total time the reveal takes, derived rather than hardcoded so the
// timeline's hold always matches the animation actually playing.
//
// TAKES THE COUNT rather than reading the content. Two reasons, and the second
// is the one that bites: the number of orbits is decided by the assignment
// table, not by how many case studies exist — and reading `SATELLITES.length`
// here made this module a VALUE dependency of `useMasterTimeline`, which
// `App.tsx` imports. That dragged every word of case-study prose into the app
// entry chunk, which has a hard 320,000 B budget that fails the build. The
// timeline needs a number; it should be given a number.
export function orbitRevealDuration(count: number): number {
  const { introStartDelay, introStagger, introDuration } = ORBIT_CONFIG.orbit
  // At least one: a scene with no orbits still has to hold for something, and a
  // negative stagger would run the timeline backwards.
  const orbits = Math.max(count, 1)
  const lastStart = introStartDelay + (orbits - 1) * introStagger
  return lastStart + introDuration + ORBIT_CONFIG.satellite.introDuration
}
