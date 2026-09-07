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
/**
 * The colour of the PROJECTED LIGHT — the halo behind the mark, the emitter
 * line and the cone beneath it. Deliberately NOT the case study's
 * `brandColor`, which each panel used to be lit in.
 *
 * The two were one value until 2026-09-07 and had no reason to be: the artwork
 * is the brand, and the light it hangs in is the site. Six brand colours meant
 * six differently-tinted projections of one effect, and the effect stopped
 * reading as a single piece of hardware showing six clients.
 *
 * `brandColor` is untouched by this and still does everything else it did — the
 * case panel accent, the chart marks, the metric rules, and the placeholder
 * plate `createBrandAtlas` draws for a brand with no artwork uploaded.
 *
 * SET THIS TO `null` to put the light back on each case's own colour. That is
 * the A/B this exists for, and it is one word.
 */
const HOLO_COLOR: string | null = '#38a9d6'

// See `panel.offsetY`. Hoisted because the emitter cone's mouth is derived from
// it: the cone has to stop exactly where the field's lower edge begins, and two
// numbers kept in step by hand drift the moment either is tuned.
const PANEL_OFFSET_Y = 0.29

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
    // The invitation's size breath (orbitAssignments.invitedCaseId): the inner
    // group swells to this at the top of each breath. Kept BELOW highlightScale
    // so hover still reads as "more" — orbitConfig.test.ts asserts the order.
    // A size change is what reads at overview scale; the halo alone did not.
    inviteScale: 1.08,
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
    // `modelSize`, not chosen independently: the core's lower edge is
    // `offsetY - height / 2`, and that edge is what has to stay off the model.
    //
    // 0.34 → 0.31 → 0.29 on 2026-09-07, at the client's request and then again
    // after seeing it: in a close-up the mark read as floating away from the
    // satellite it belongs to, and on a short viewport it could sit near the top
    // edge of the frame. The field's lower edge moves 0.27 → 0.22 with it, and so
    // does the cone's mouth — `coneMouthY` is derived from this constant, so the
    // light still lands exactly on the artwork with no second edit.
    //
    // 0.29 IS ALL BUT THE LAST OF THE TRAVEL. The guard in orbitConfig.test.ts
    // puts the floor at `modelSize / 2 × 0.8` = 0.208, i.e. offsetY > 0.278, and
    // 0.05 of the 0.062 available has now been spent. There is ~0.012 left, which
    // is not enough to be worth another nudge: a further move means revisiting
    // the guard, and that is its own decision with its own evidence, not a
    // ride-along on a tuning pass.
    //
    // That guard is deliberately conservative, and it is worth recording why,
    // because the arithmetic looks tighter than the scene is. `modelSize` (0.52)
    // is the max dimension of a model whose LONGEST AXIS IS THE SOLAR ARRAY: the
    // GLB normalises to 0.186 × 0.196 × 1.000, and the array is near-horizontal.
    // It can only pitch by the spinner's per-seed tilt (x ≤ 0.35 rad), so the
    // highest point any of the six satellites reaches over a full turn is 0.148,
    // not 0.26. Real clearance from the field's base at 0.29 is ~0.07 — half a
    // panel height — against the ~0.01 the guard reports. Measured from the
    // GLB's accessor min/max on 2026-09-07; not asserted, because a test on a
    // model nobody is changing is a mechanism to maintain for nothing.
    //
    // Note the panel itself did NOT double with the model: doubling `offsetY`
    // alone would have pushed the plate DEEPER into the model, because the
    // half-height being subtracted stayed put.
    offsetY: PANEL_OFFSET_Y,
    // Ceiling on the panel's fade, so the entrance can drive it 0→1 while the
    // panel still reads as a projection rather than a solid card.
    maxOpacity: 0.95,
    /** The light's colour, and what it is not. See HOLO_COLOR above. */
    holoColor: HOLO_COLOR,

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
    // Vertical room reserved BELOW the field, in pane heights. It used to be a
    // drawn stem; the emitter cone is the beam now, and what is left here is
    // just quad the emitter wash needs to fade out into without being clipped.
    // See panelFootprint.
    stemLength: 0.35,
    // Transparent margin around the deployed footprint, so hairlines and the
    // wings' terminal nodes are never clipped by the quad's edge.
    margin: 0.06,
    // ── The projection field (plan 008) ──
    // What replaced the split plate's dark glass. Nothing here draws an edge:
    // the field is bounded by falloff alone, so there is no rectangle, bracket
    // or border anywhere in it. Radii are in PANE HEIGHTS, measured in the
    // field's own space, so they hold as the field opens 1:1 → 2:1.

    // Falloff distance of the rear halo — brand light behind the mark, fading
    // to nothing in every direction. The only thing that says where the field
    // is, and it says so without a boundary.
    haloRadius: 0.46,
    // Peak alpha of that halo. Six of these are on screen at rest, so this is
    // the knob that decides whether the overview stays calm.
    haloStrength: 0.30,
    // The invitation: ONE satellite's field (orbitAssignments.invitedCaseId)
    // breathes brighter so the overview says "these are clickable". The gain
    // multiplies haloStrength at the top of the breath, and half of it lifts
    // the emitter line and wash, on the line's own 1.4 rad/s clock so all of
    // it pulses together. The duration is the fade in and out of the whole
    // effect — it yields to the hover bump and retires on the first selection,
    // and neither should snap.
    // 2.5 is where the line's alpha saturates; past it only the wash and
    // halo grow, so louder has to come from the cone and the size breath.
    inviteGain: 2.5,
    inviteDuration: 0.6,
    // The cone's share of the invitation, on its own knob because the cone is
    // additive and blows out at the panel's gain: density × (1 + this × pulse).
    coneInviteGain: 1.0,


    // ── The emitter cone (plan 008) ──
    // The volume the hologram is projected into: a real frustum mesh parented
    // to the satellite, not a stripe painted inside the billboard. See
    // createEmitterCone.ts. These are ABSOLUTE, in the same "Earth radius = 1"
    // units as `offsetY` — the cone is positioned in the satellite's frame
    // directly, so pane heights would be an indirection with nothing behind it.

    // Where the cone's foot sits, relative to the satellite's centre. AT the
    // centre, so the foot is buried inside the model: depth testing then hides
    // the part within the body and the light appears to come OUT of it. Held
    // clear of the body instead — the first attempt — the cone tapered to a
    // point in open space above the satellite and read as a wedge pointing at
    // it rather than a beam leaving it.
    coneFootY: 0.0,
    // Where the mouth ends — exactly the field's lower edge, so the light
    // arrives at the artwork and stops there instead of washing over it.
    coneMouthY: PANEL_OFFSET_Y - PANEL_HEIGHT / 2,
    // Mouth radius at rest, a shade inside the resting field's half-width
    // (`height / 2`) so the cone reads as arriving at the field rather than
    // framing it.
    coneMouthRadius: PANEL_HEIGHT * 0.34,
    // Foot radius. Narrow, but never zero: a true point makes the taper
    // converge to a bright singularity that reads as a hotspot.
    coneFootRadius: 0.012,
    // How much further the mouth opens at full deployment, as a fraction of
    // `coneMouthRadius`. The field goes 1:1 → 2:1, so its half-width doubles;
    // the cone follows most of the way rather than all of it, because a mouth
    // matching the field's width exactly draws a line along its edge.
    coneSpread: 0.85,
    // Overall brightness of the volume, and the knob that decides whether this
    // reads as light or as a solid object. LOW ON PURPOSE: the material is
    // additive and double-sided, so a fragment's contribution lands twice —
    // once through the near shell, once through the far one. At 0.5 the pair
    // saturated and six opaque funnels hung off the satellites like plumb-bobs.
    // Nothing here should come close to full white on its own.
    coneIntensity: 0.26,
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
