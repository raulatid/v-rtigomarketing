// Tunable timings for the intro timeline. The debug overlay edits these live.

// TYPE-ONLY, and it has to stay that way. P0's fields live in
// intro-draw/drawConfig.ts because the draw module owns everything it needs
// (DECISIONS.md, "Code that runs first depends on nothing") — and a VALUE
// import here would make Rollup hoist drawConfig into a chunk shared by the
// boot entry and the app bundle, costing the drawing an extra round trip
// before it can start. The defaults are read from the live module instead, in
// defaultIntroConfig() below.
//
// Note the P0 fields are RELATIVE STAGE WEIGHTS, not seconds — P0's duration
// comes from load progress. `fillDuration` is the exception, still real seconds.
import type { DrawConfig } from './intro-draw/drawConfig'
// A VALUE import, unlike the type-only one above, and safe for the same reason
// that one is not: the boot entry never reaches this module. It is here so the
// band defaults have one source of truth shared with the star distribution and
// the sky shell. The build's chunk assertion is what actually guards this.
import { GALAXY_BAND } from './space/galaxyBand'

export interface IntroConfig extends DrawConfig {
  // ── P1 shrink ──
  shrinkDuration: number
  // Free aesthetic choice, not a calibration constraint: the P3 crossover puts
  // both marks at zero, so this never has to match the GLB's apparent size.
  shrinkTargetSize: number

  // ── P2 warp ──
  warpDuration: number
  normalFov: number
  maxTravelFov: number
  accelerationPower: number
  speedPeakWidth: number
  sceneSwapProgress: number
  overlayStrength: number
  motionBlurStrength: number
  afterimageDampMax: number
  // The DOM SVG can't be touched by the composer, so it fakes the same motion.
  svgWarpBlur: number
  svgWarpStretch: number
  starCount: number

  // ── P3 swap (scale-through-zero crossover) ──
  swapDuration: number
  swapCrossover: number
  swapFlashStrength: number
  swapFlashWidth: number

  // ── P4 corner ──
  spinPauseBefore: number
  spinDuration: number
  toCornerDuration: number
  // Multiplier on the model's fit distance. Higher = smaller on screen AND a
  // flatter frustum, which keeps the pixel→world corner mapping linear.
  cornerFramePadding: number
  // Distance from the viewport edge to the logo's CENTRE, in px.
  cornerMarginX: number
  cornerMarginY: number

  // ── Persistent space backdrop (visible from the warp's cut onward) ──
  // Points on a SHELL, not in a volume: nothing can then render between the
  // camera and the Earth. backdropRadius must stay well above
  // INTERACTION_CONFIG.camera.zoomMax (22) or that guarantee breaks.
  backdropStarCount: number
  backdropRadius: number
  // Per-point radial jitter as a fraction of the radius, so the field reads as a
  // volume with depth rather than a hollow sphere when you orbit.
  backdropJitter: number
  // Angular clumping of the backdrop stars. 0 is a uniform sky; 1 is heavily
  // knotted and concentrated along the galactic band. Angular only — it never
  // touches the shell radius, which is what keeps stars off the Earth.
  backdropClusterStrength: number
  // Alpha amplitude of the star twinkle. 0 disables it entirely. Only stars
  // above SPACE_CONFIG.star.twinkleSizeMin scintillate.
  backdropTwinkle: number

  // ── The sky behind the star shell ──
  // A photographic Milky Way panorama, downloaded during P0. These are all
  // sampling parameters — none of them touches the texture, so they are plain
  // uniform writes and cost nothing to drag.
  //
  // Exposure. The panorama is a long-exposure photograph and arrives far
  // brighter than a backdrop should be beside a lit planet.
  skyBrightness: number
  // Gamma on the sampled sky, applied before the brightness multiply. Above 1
  // deepens the darks without moving the band's core, which is what makes the
  // sky read as DISTANT rather than merely dim — dimming alone flattens it
  // toward an even grey. This and skyBrightness are the depth pair.
  skyContrast: number
  // Shared with the star distribution, so the stars and the gas cannot
  // disagree about where the galaxy is. skyBandWidth is the star field's alone
  // — the photograph has whatever width it was photographed with — but it is
  // kept here because both still have to name the same plane.
  skyBandWidth: number
  skyBandTilt: number
  // Rotation about the galactic pole: which stretch of the Milky Way sits
  // behind the Earth. Compositional only; the star field is invariant under it.
  skyBandYaw: number

  // ── Bloom ──
  // The one post-process the scene has beyond the warp's motion blur. Without
  // it nothing in the frame can look luminous rather than painted — a star is
  // just a bright matte dot. Threshold is the parameter that matters: too low
  // and the Earth's day side hazes over, and the sun glint on the ocean is
  // already at the top of the range before bloom sees it.
  //
  // strength 0 disables the pass outright rather than merely rendering nothing,
  // so it is also the performance escape hatch.
  bloomStrength: number
  bloomRadius: number
  bloomThreshold: number

  // ── P5 orbits ──
  // Extra delay after the logo departs centre before the orbit reveal starts.
  // 0 means "the moment it departs" — the focus handoff. Raise it to separate
  // the two beats further; lowering below 0 is not possible by design.
  orbitsStartOffset: number
}

/** Everything the master timeline owns — P1 onward. P0's half comes from the
 *  draw module at runtime; see defaultIntroConfig(). */
export const DEFAULT_APP_CONFIG: Omit<IntroConfig, keyof DrawConfig> = {
  shrinkDuration: 0.8,
  shrinkTargetSize: 9,

  warpDuration: 2.6,
  normalFov: 45,
  maxTravelFov: 68,
  accelerationPower: 1.7,
  speedPeakWidth: 0.34,
  sceneSwapProgress: 0.5,
  overlayStrength: 0.22,
  motionBlurStrength: 0.22,
  afterimageDampMax: 0.82,
  svgWarpBlur: 6,
  svgWarpStretch: 0.25,
  starCount: 2000,

  swapDuration: 0.7,
  swapCrossover: 0.45,
  swapFlashStrength: 0.35,
  swapFlashWidth: 0.08,

  spinPauseBefore: 0.15,
  spinDuration: 2.0,
  toCornerDuration: 1.2,
  cornerFramePadding: 20,
  cornerMarginX: 48,
  cornerMarginY: 48,

  backdropStarCount: 3500,
  backdropRadius: 180,
  backdropJitter: 0.15,
  backdropClusterStrength: 0.6,
  backdropTwinkle: 0.15,

  skyBrightness: 0.22,
  skyContrast: 1.25,
  skyBandWidth: GALAXY_BAND.defaultWidth,
  skyBandTilt: GALAXY_BAND.defaultTilt,
  skyBandYaw: GALAXY_BAND.defaultYaw,

  bloomStrength: 0.55,
  bloomRadius: 0.5,
  bloomThreshold: 0.62,

  orbitsStartOffset: 0,
}

// The full config, assembled at runtime: the app's half from the literal above,
// P0's half from the drawing that is already on screen. Used for the initial
// React state and for the debug panel's Reset.
//
// The fallback only fires if the boot entry is missing, which index.html makes
// impossible — the P0 sliders would read blank, and nothing else would break.
export function defaultIntroConfig(): IntroConfig {
  const drawDefaults = window.__vertigoIntro?.handle.getConfig()
  return { ...DEFAULT_APP_CONFIG, ...(drawDefaults ?? ({} as DrawConfig)) }
}

// Phases of the master timeline. 'site' is the resting end state: Earth at rest,
// the 3D isotype idling in the corner, satellites orbiting.
export type Phase = 'draw' | 'shrink' | 'warp' | 'swap' | 'corner' | 'orbits' | 'site'

export const PHASE_ORDER: Phase[] = [
  'draw',
  'shrink',
  'warp',
  'swap',
  'corner',
  'orbits',
  'site',
]
