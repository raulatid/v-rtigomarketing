import { cinematicSpeed, cinematicTravel, lerp, narrowPeak } from '../utils/easing'

// The Earth <-> Murcia warp, as pure functions of one progress value.
//
// Same structure as the intro's warp (docs/DECISIONS.md 26.6): ONE
// progress value read through three curves with deliberately nested widths.
// Position runs the full width so the move feels continuous; the speed bell is
// narrower so the FOV surge and blur ramp inside it; the flash is narrower
// still so it reads as a flicker rather than a fade.
//
// Kept free of three.js, React and the DOM on purpose: checks/warp-transition.ts
// asserts the safety envelope below against THIS module, the way
// src/intro-draw/playhead.test.ts asserts against the real playhead. A guard
// that tests a reimplementation guards nothing.

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
  /** The configured resting elevation. Must equal murciaConfig.camera.elevationDegrees. */
  murciaRestElevation: 30,
  /** Closest approach, arriving. See the envelope below before changing this. */
  murciaCloseDistance: 75,
  /** The departure pose, leaving. Must equal murciaConfig.warpDepart*. */
  murciaDepartDistance: 180,
  murciaDepartElevation: 50,

  /**
   * THE SAFETY ENVELOPE. Asserted by checks/warp-transition.ts.
   *
   * The real invariant is a footprint, not a distance: NO WARP POSE MAY REACH
   * FURTHER ACROSS THE GROUND THAN THE RESTING POSE DOES. The terrain skirt is
   * 700 units wide (murciaConfig.terrainTransition.width — read it there, never
   * from here): 600 was what a camera at 165/30deg needs at every azimuth on a
   * 5120x1440 viewport with only +50 units to spare, and the last 100 pays for
   * the zoom band. Anything that reaches further puts the plate edge on
   * screen for ultrawide viewers only, silently, with nothing wrong on the
   * machine the change was made on. PROJECT_MEMORY, "The number that can hurt
   * you", records exactly that: going 110 -> 165 silently put the plate edge on
   * screen for ultrawide users.
   *
   * That invariant is now asserted literally, by running the real
   * computeGroundFootprint over the real poses. The distance bounds below are
   * kept as the cheap first line of defence, and they are direction-aware:
   *
   *   arriving  — may never exceed the resting distance, because arriving does
   *               not change elevation and so has nothing to pay with.
   *   departing — may exceed it, but only as far as murciaDepartMaxDistance,
   *               and only because the elevation rises with it. Distance and
   *               elevation are not separable here; neither bound means
   *               anything without the footprint sweep.
   *
   * Lower bound — below about 60 the intuition "closer is always safer" stops
   * holding. lookAtHeight is a fixed 5.85 rather than a fraction of distance,
   * so as the camera drops it tilts up relative to the rig, the effective pitch
   * collapses through the ~28 degree floor where the bounds maths degenerates
   * (PROJECT_MEMORY, "The number that can hurt you"), and the footprint
   * diverges again.
   */
  murciaMaxDistance: 165,
  murciaDepartMaxDistance: 180,
  murciaMinDistance: 60,
} as const

/**
 * Which leg the transition is on, and how far through that leg.
 *
 * Split on the EASED value, matching CameraController's intro warp. Note that
 * the scene cut keys off raw progress instead (DECISIONS.md 26.6) — the two
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
 * How far the camera is from rest, 0 at both ends and 1 at the cut, plus which
 * role the visible world is playing.
 *
 * This is an ENVELOPE, not a direction. It rises 0 -> 1 for the world being
 * left and falls 1 -> 0 for the world being entered, and says nothing about
 * which way either of them moves — that is the role's business. Each world maps
 * the amount onto its own departing and arriving poses, which is what keeps the
 * two experiences from needing to know anything about each other.
 *
 * It used to say more than that: one pose mapping served both roles, so the
 * world being left always rushed IN. That is right descending into Murcia and
 * wrong leaving it, because Murcia is inside the Earth (ADR 006).
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

// Murcia's pose mapping deliberately does NOT live here. The transition hands
// down an amount and a role; what a city does with them is the city's business,
// and `src/experiences/` may not depend upward on the shell (ARCHITECTURE §13).
// See src/experiences/murcia/camera/warpPose.ts. The envelope constants above
// are mirrors of murciaConfig, asserted equal by checks/warp-transition.ts.

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
