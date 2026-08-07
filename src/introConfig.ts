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

  backdropStarCount: 2600,
  backdropRadius: 180,
  backdropJitter: 0.15,

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
