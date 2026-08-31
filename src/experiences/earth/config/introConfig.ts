// Tunable timings for the intro timeline. The debug overlay edits these live.

// TYPE-ONLY, and it has to stay that way. P0's fields live in
// intro-draw/drawConfig.ts because the draw module owns everything it needs
// (DECISIONS.md 26.4, "Code that runs first depends on nothing") — and a VALUE
// import here would make Rollup hoist drawConfig into a chunk shared by the
// boot entry and the app bundle, costing the drawing an extra round trip
// before it can start. The defaults are read from the live module instead, in
// defaultIntroConfig() below.
//
// Note the P0 fields are RELATIVE STAGE WEIGHTS, not seconds — P0's duration
// comes from load progress. `fillDuration` is the exception, still real seconds.
import type { DrawConfig } from '../../../intro-draw/drawConfig'
// A VALUE import, unlike the type-only one above, and it is here so the band
// defaults have one source of truth shared with the star distribution and the
// sky shell.
//
// Pointed at `galaxyBandConfig` rather than `galaxyBand` deliberately, though
// not load-bearingly. This module sits in the app ENTRY chunk, and
// `galaxyBand.ts` imports three at module scope; while the constants lived
// there, the entry carried a static import of the 820 KB three chunk for three
// numbers — which is not a download (the scene modulepreloads three anyway) but
// an EVALUATION, the whole library running on the main thread before React
// rendered. Splitting the constants into their own module is what fixed that,
// and Rollup does tree-shake through the re-export, so both spellings emit the
// same bundle today — measured, not assumed. Naming the three-free module keeps
// it true by intent rather than by the optimiser's discretion, and tells whoever
// adds a second constant here which side of the line they are on. The build's
// structural assertion on the entry's chunk imports is what actually guards it.
import { GALAXY_BAND } from '../scene/space/galaxyBandConfig'

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
  // camera and the Earth. backdropRadius must stay well above the camera's fixed
  // orbit radius (EARTH_REST, 14) or that guarantee breaks. It used to have to
  // clear the wheel-zoom ceiling of 22; there is no zoom any more (`adr/009`).
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
  // Exposure. The panorama is a long-exposure photograph and arrives brighter
  // than a backdrop should be beside a lit planet.
  //
  // THIS PAIR IS TUNED TO THE IMAGE and does not survive swapping it. At the
  // old ESO panorama's 0.22 / 1.25 the current public-domain source renders
  // almost entirely BLACK — it is a dimmer photograph, and a gamma above 1
  // crushes what little signal it has down in the darks. 0.60 / 1.00 is where
  // it reads. If a newly swapped sky ever looks broken, drag these two in the
  // debug overlay before concluding the image is wrong; that is what they are
  // exposed for, and skipping that step is how a good image gets rejected.
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

  // ── The polar caps ──
  // The panorama is a flat photograph with no zenith and no nadir, and the
  // asset-side correction that removed the resulting pinwheel left each cap an
  // exactly radially symmetric gradient — a funnel. The shell repairs it by
  // borrowing structure from a rotated second sample of the same texture.
  // Full account on `skyCapRotation` in scene/space/galaxyBand.ts.

  // Latitude, degrees, where the borrowing begins.
  //
  // THERE IS A HARD FLOOR AT 62.2 AND IT IS NOT A MATTER OF TASTE. At rest the
  // camera's phi is fixed at 90 degrees, so the nearest sky pole is exactly
  // 90 - skyBandTilt = 68 degrees off the view axis, and the default yaw puts
  // the south pole at precisely that worst case. At the e2e viewport of
  // 1600x900 and normalFov 45 the frame half-diagonal is 40.2 degrees, so a
  // frame CORNER reaches latitude 62.2. Start below that and the cap blend is
  // in the resting frame and the committed backdrop baselines move.
  //
  // Which makes those baselines passing unchanged the EVIDENCE that this stays
  // in the caps, exactly as the 2026-08-19 correction used them. If they move,
  // that is the test working — do not absorb it with `npm run e2e:update`.
  // `checks/space-backdrop.ts` section 7 asserts the margin from the real
  // modules so it cannot rot silently.
  //
  // 68 is the clean geometric number and leaves 5.8 degrees of margin; a
  // 2560x1080 ultrawide's corner then sees a weight around 1%.
  skyCapStart: number
  // Latitude, degrees, where the borrowing reaches full strength. 84 rather
  // than 90 because the primary's own structure dies between 75 and 80, so the
  // borrowed patch arrives at full weight exactly where there is nothing left
  // for it to double-expose with.
  skyCapFull: number
  // How much of the borrowed variation is applied. 0 turns the cap off — and
  // skips the second texture fetch entirely, which is the mobile escape hatch
  // as well as the before/after.
  //
  // 0.35 was chosen by rendering the pole at 74 degrees FOV at the SCENE's
  // exposure across 0 / 0.3 / 0.5 / 0.7, and it is deliberately low. Above
  // about 0.5 the borrowed patch stops reading as gas and starts reading as a
  // mottled disc pasted over the pole — the cap becomes its own artifact, which
  // is the third time this sky has done that. Judge it at brightness 0.60
  // through ACES, NOT at the preview tool's 2.4x detection gain, which makes
  // 0.7 look reasonable and 0.35 look like nothing.
  //
  // This is the smaller half of the repair and it is meant to be. The dashes
  // are removed in the ASSET (the polar median in prepare-sky-panorama.mjs);
  // what is left for this is the perfect radial SYMMETRY of what remains, and
  // a little real structure is all that takes.
  skyCapStrength: number

  // ── Grain ──
  // The other half of the report. The sky is magnified 1.76x (11.4 px/deg of
  // texture against ~20 px/deg of viewport) and 3.5x at DPR 2, and bilinear
  // magnification of a soft image reads as "pixeled". The magnification is
  // fixed by a standing client decision that space backgrounds are 4096x2048,
  // so it cannot be answered with resolution; what it CAN be given is
  // high-frequency content for the eye to resolve, which is the same reason
  // film grain rescues a soft scan.
  //
  // 0 disables it and removes its whole cost. It moves every pixel of both e2e
  // baselines, so it is regenerated deliberately and reviewed as a diff — a
  // uniform fine texture change with no structural change. If the diff shows
  // structure, the grain is aliasing and `grainCellDegrees` is too small.
  skyGrain: number

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

  skyBrightness: 0.60,
  skyContrast: 1.00,
  skyBandWidth: GALAXY_BAND.defaultWidth,
  skyBandTilt: GALAXY_BAND.defaultTilt,
  skyBandYaw: GALAXY_BAND.defaultYaw,

  skyCapStart: 68,
  skyCapFull: 84,
  skyCapStrength: 0.35,
  skyGrain: 0.12,

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
