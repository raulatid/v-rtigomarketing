import { CASE_STUDIES, CaseStudy } from '../data/caseStudies'

// Configuration for the orbital satellite system, ported from
// earth-connections/src/scenes/earth-connections/orbit-system/orbitConfig.js.
//
// IMPORTANT — scale. Every radius here is expressed in "Earth radius = 1" units,
// which is what earth-connections uses. Our Earth is radius 2, so the whole
// orbit group is mounted with scale={2} rather than these numbers being
// rewritten. Keep it that way: it means presets stay diffable against the
// source project.

export const ORBIT_CONFIG = {
  orbit: {
    segments: 256,
    // Back at the source's value. It was raised to 0.09 for a while (see
    // DECISIONS.md, "hover bump" entry) because completed orbits all but vanish
    // once their head glow fades — if the paths ever need to read stronger
    // again, that is the tested value to reach for.
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
    // Radius of the invisible raycast/hover sphere (the old badge's footprint,
    // kept so hover feel is unchanged after the switch to the GLB model).
    baseSize: 0.10,
    // World size (max dimension) of the satellite GLB, in Earth-radius=1 units.
    // The model template is normalised to unit size, so this is the only knob.
    modelSize: 0.26,
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
    // 2:1, matching the atlas cell aspect — change both together or the plate
    // stretches. At 0.28 the panel is roughly 5% of viewport height in the
    // overview (readable, attention-grabbing) and about a third of it at the
    // case-panel close-up.
    width: 0.28,
    height: 0.14,
    // Height above the satellite's centre. The model's max dimension is
    // `modelSize` (0.26), so at 0.12 the panel's lower edge tucks slightly
    // behind the top of the model rather than floating clear of it — tuned by
    // eye; raise toward 0.22 for full separation.
    offsetY: 0.12,
    // Ceiling on the panel's fade, so the entrance can drive it 0→1 while the
    // panel still reads as a projection rather than a solid card.
    maxOpacity: 0.95,
    // The holographic chrome: frame, brackets and edge bleed. Deliberately not
    // the brand colour — the frame is Vertigo's language, the plate inside is
    // the brand's.
    frameColor: 0x8fd0ff,
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

  markers: {
    // Distance from Earth centre (Earth radius = 1).
    radius: 1.03,
    markerSize: 0.013,
    // Invisible raycast target, larger for comfortable hover.
    hitSize: 0.055,
    markerColor: 0xffffff,
    markerOpacity: 0.85,
    markerHoverScale: 1.6,
    // Destination markers read as a place you can go, not a label. Accent
    // colour, larger, and they pulse — the only moving marker on the globe,
    // which is what makes it findable without an instruction.
    destinationColor: 0x4fb0ff,
    destinationScale: 1.5,
    destinationPulsePeriod: 2.6,
    destinationPulseAmount: 0.22,
    // Outward offset of the CSS2D tag from the marker.
    tagOffset: 0.13,
    // Camera-facing dot product below which a marker is hidden and hover-disabled.
    visibilityThreshold: 0.15,
    // Dot-product range over which a marker fades near the limb (no hard pop).
    visibilityFadeRange: 0.15,
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
// shape to keep in sync. Content lives in src/data/caseStudies.ts (sample data
// today, an API response later); this module only decides which orbit each one
// rides. `logo` is a texture path under /public; while null, a generated text
// badge is used.
export type SatelliteDef = CaseStudy

// This binding is the API seam. When the content is fetched, this becomes the
// value OrbitSystemLayer waits on, gated the same way the Earth textures are.
export const SATELLITES: SatelliteDef[] = CASE_STUDIES

export interface GeoMarkerDef {
  id: string
  lat: number
  lng: number
  title: string
  text: string
  /**
   * `case` markers are labels — hover shows the payload and that is all.
   * `destination` markers are navigation: they are clickable, drawn with an
   * accent, and selecting one asks the application to travel there.
   *
   * Recorded in the data rather than inferred from the id, so the difference is
   * visible where the markers are declared instead of implied somewhere else.
   */
  kind?: 'case' | 'destination'
}

// Five world cities. `text` values are editable placeholders, not real metrics.
// Spanish exonyms where they exist — the site is Spanish throughout.
export const GEO_MARKERS: GeoMarkerDef[] = [
  {
    id: 'new-york',
    lat: 40.7128,
    lng: -74.006,
    title: 'Nueva York',
    text: '+42% de visibilidad orgánica',
  },
  { id: 'london', lat: 51.5074, lng: -0.1278, title: 'Londres', text: 'Crecimiento en el top 3' },
  {
    id: 'tokyo',
    lat: 35.6762,
    lng: 139.6503,
    title: 'Tokio',
    text: 'Expansión SEO internacional',
  },
  {
    id: 'sydney',
    lat: -33.8688,
    lng: 151.2093,
    title: 'Sídney',
    text: 'Señal de autoridad regional',
  },
  {
    id: 'sao-paulo',
    lat: -23.5505,
    lng: -46.6333,
    title: 'São Paulo',
    text: 'Mayor presencia en buscadores',
  },
  // The way into the Murcia experience. Real coordinates for Murcia, Spain —
  // the marker has to sit on the actual city for the globe to mean anything.
  {
    id: 'murcia',
    lat: 37.9922,
    lng: -1.1307,
    title: 'Murcia',
    text: 'Explorar la ciudad →',
    kind: 'destination',
  },
]

// The total time the reveal takes, derived rather than hardcoded so the
// timeline's hold always matches the animation actually playing.
export function orbitRevealDuration(): number {
  const { introStartDelay, introStagger, introDuration } = ORBIT_CONFIG.orbit
  const lastStart = introStartDelay + (ORBIT_PRESETS.length - 1) * introStagger
  return lastStart + introDuration + ORBIT_CONFIG.satellite.introDuration
}
