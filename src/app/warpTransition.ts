import { cinematicSpeed, cinematicTravel, lerp, narrowPeak } from '../utils/easing'

// The Earth <-> Murcia warp, as pure functions of one progress value.
//
// Same structure as the intro's warp (docs/earth/DECISIONS.md:180-206): ONE
// progress value read through three curves with deliberately nested widths.
// Position runs the full width so the move feels continuous; the speed bell is
// narrower so the FOV surge and blur ramp inside it; the flash is narrower
// still so it reads as a flicker rather than a fade.
//
// Kept free of three.js, React and the DOM on purpose: checks/warp-transition.ts
// asserts the safety envelope below against THIS module, the way
// scripts/simulate-intro.mjs asserts against the real playhead. A guard that
// tests a reimplementation guards nothing.

export const WARP_TRANSITION = {
  /** Seconds. Long enough to read as a journey, short enough not to be a wait. */
  duration: 1.6,

  /** The cut. Both bells are centred here and the scene swap fires here. */
  cut: 0.5,

  /** Exponent for cinematicTravel. 1 is linear; higher is a sharper ease-in-out. */
  accelerationPower: 1.7,

  /** Half-width of the speed bell, in progress units. Drives FOV and blur. */
  speedPeakWidth: 0.34,

  /**
   * Half-width of the flash bell. Wider than the intro's 0.10 because this cut
   * is between two worlds of very different luminance (black space against a
   * pale grey sky), so the cover has to hold long enough to hide the jump.
   */
  flashWidth: 0.17,

  /** Peak blur, fed to the AfterimagePass the same way state.motionBlur is. */
  motionBlurStrength: 0.34,

  // ─── Earth leg ───

  /** Must match introConfig.normalFov — the FOV the site phase rests at. */
  earthRestFov: 45,
  /** Peak of the surge. The intro uses 68 over 2.6s; this is shorter and harder. */
  earthWarpFov: 74,
  /**
   * Fraction of the camera's resting radius at the closest point. Applied to
   * whatever radius the viewer has dragged to, so the dolly works from any
   * orbit position rather than assuming the default.
   */
  earthCloseFactor: 0.25,

  // ─── Murcia leg ───

  /** The configured resting distance. Must equal murciaConfig.camera.distance. */
  murciaRestDistance: 165,
  /** Closest approach. See the envelope below before changing this. */
  murciaCloseDistance: 75,

  /**
   * THE SAFETY ENVELOPE. Asserted by checks/warp-transition.ts.
   *
   * Upper bound — the camera must NEVER pull back past the configured resting
   * distance. Ground reach grows about 1.33 world units per unit of distance,
   * and the measured worst-case terrain-skirt margin is only +50 units at
   * 5120x1440 (16:9 has +229, portrait +306). So distance ~200 puts the plate
   * edge on screen for ultrawide viewers, with no error and nothing visible on
   * a normal monitor. PROJECT_MEMORY 10.6 records exactly this failure:
   * "Going 110 -> 165 silently put the plate edge on screen for ultrawide users."
   *
   * Lower bound — below about 60 the intuition "closer is always safer" stops
   * holding. lookAtHeight is a fixed 5.85 rather than a fraction of distance,
   * so as the camera drops it tilts up relative to the rig, the effective pitch
   * collapses through the ~28 degree floor where the bounds maths degenerates
   * (PROJECT_MEMORY 5), and the footprint diverges again.
   */
  murciaMaxDistance: 165,
  murciaMinDistance: 60,
} as const

/**
 * Which leg the transition is on, and how far through that leg.
 *
 * Split on the EASED value, matching CameraController's intro warp. Note that
 * the scene cut keys off raw progress instead (DECISIONS.md:202-206) — the two
 * agree only because cinematicTravel is symmetric about 0.5. That is inherited
 * from the intro deliberately rather than diverged from.
 */
export function transitionLeg(p: number): { departing: boolean; localT: number } {
  const travelT = cinematicTravel(p, WARP_TRANSITION.accelerationPower)
  const departing = travelT < 0.5
  return {
    departing,
    localT: departing ? travelT * 2 : (travelT - 0.5) * 2,
  }
}

/**
 * How far "in" the camera is, 0 at rest and 1 at the closest point.
 *
 * The same value serves both sides, which is what keeps the two experiences
 * from needing to know anything about each other: the world being left rises
 * 0 -> 1 as it rushes in, and the world being entered falls 1 -> 0 as it pulls
 * back out. Each experience applies it only while it is the one rendering.
 */
export function dollyAmount(p: number): { departing: boolean; amount: number } {
  const { departing, localT } = transitionLeg(p)
  return { departing, amount: departing ? localT : 1 - localT }
}

/** The wide bell. Drives the FOV surge and the motion blur. */
export function speed(p: number): number {
  return cinematicSpeed(p, WARP_TRANSITION.cut, WARP_TRANSITION.speedPeakWidth)
}

/**
 * The flash, 0..1. Reaches full cover at the cut.
 *
 * Full black rather than the intro's 0.22: that flash conceals a substitution
 * between two similar dark scenes, this one conceals a jump between two
 * unrelated worlds. Shaped by narrowPeak rather than a linear ramp so it still
 * spikes and recovers like the intro's, instead of reading as a dissolve.
 */
export function flash(p: number): number {
  return narrowPeak(p, WARP_TRANSITION.cut, WARP_TRANSITION.flashWidth)
}

/** Earth's FOV surge. Returns to the resting FOV at both ends on its own. */
export function earthFov(p: number): number {
  return lerp(WARP_TRANSITION.earthRestFov, WARP_TRANSITION.earthWarpFov, speed(p))
}

/** Scale applied to Earth's camera radius: 1 at rest, earthCloseFactor at the cut. */
export function earthRadiusScale(amount: number): number {
  return lerp(1, WARP_TRANSITION.earthCloseFactor, amount)
}

/** Murcia's camera distance for a dolly amount. Stays inside the envelope. */
export function murciaDollyDistance(amount: number): number {
  return lerp(
    WARP_TRANSITION.murciaRestDistance,
    WARP_TRANSITION.murciaCloseDistance,
    amount,
  )
}

/** The blur amount fed to the AfterimagePass, matching state.motionBlur's scale. */
export function motionBlur(p: number): number {
  return speed(p) * WARP_TRANSITION.motionBlurStrength
}

/**
 * Impure, and deliberately not used by the functions above so the envelope
 * stays testable. Callers read it once and skip the camera work; the flash and
 * the cut still play, because concealing the jump is not a motion effect.
 */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
