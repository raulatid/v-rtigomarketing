import { cinematicSpeed, cinematicTravel, lerp, narrowPeak, smootherstep } from './easing'

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

  /**
   * Where the third stage of Earth's band begins. Past this depth the same
   * scroll that zooms also swings the camera onto the destination, so the
   * viewer arrives aimed at Spain rather than at whatever they happened to be
   * looking at. Below it the orbit is entirely free.
   */
  earthGuideStart: 0.6,

  // ─── Murcia leg ───

  /** The configured resting distance. Must equal murciaConfig.camera.distance. */
  murciaRestDistance: 285,
  /** The configured resting elevation. Must equal murciaConfig.camera.elevationDegrees. */
  murciaRestElevation: 35,
  /** Closest approach, arriving. See the envelope below before changing this. */
  murciaCloseDistance: 75,
  /** The departure pose, leaving. Must equal murciaConfig.warpDepart*. */
  murciaDepartDistance: 470,
  murciaDepartElevation: 66,

  /**
   * THE SAFETY ENVELOPE. Asserted by checks/warp-transition.ts.
   *
   * The real invariant is a footprint, not a distance: NO WARP POSE MAY REACH
   * FURTHER ACROSS THE GROUND THAN THE RESTING POSE DOES. The terrain skirt is
   * 700 units wide (murciaConfig.terrainTransition.width — read it there, never
   * from here). Anything that reaches further puts the world's edge on screen
   * for ultrawide viewers only, silently, with nothing wrong on the machine the
   * change was made on. PROJECT_MEMORY, "The number that can hurt you", records
   * exactly that: going 110 -> 165 silently put the plate edge on screen for
   * ultrawide users.
   *
   * WHAT THE SKIRT WRAPS CHANGED on 2026-09-04, and this comment used to state
   * the old arithmetic as though it were the invariant. It was not. The skirt
   * now wraps `SUELO_CIUDAD` — the filler city, 741 units past the plate in the
   * thinnest direction — rather than the plate itself, which is what lets rest
   * sit at 225/19deg with the horizon in frame at all. "Reaches ~573" no longer
   * has a finite value to quote: at 19 degrees the resting frustum passes the
   * horizon and its reach is the `maxGroundDistance` clamp. checks/footprint.ts
   * §2 states what replaced it, and is what actually holds this line.
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
   * so as the camera drops it tilts up relative to the rig and the footprint
   * diverges again (PROJECT_MEMORY, "The number that can hurt you"). The bound
   * outlives the ~28 degree pitch floor it used to be justified by — with the
   * skirt out at the filler city's edge that floor is gone — because the
   * divergence itself is not about the skirt: it is lookAtHeight being a
   * constant, and 60 is still where it starts to bite.
   */
  murciaMaxDistance: 285,
  murciaDepartMaxDistance: 470,
  murciaMinDistance: 60,

  // ─── The vacuum ───
  //
  // A screen-space pass on the way OUT of Murcia only: radial UV magnification,
  // a radial streak blur, and a grey vignette. It is scrubbed from the viewer's
  // own scroll before the commit and carried to full on the speed bell after,
  // so the effect belongs to the gesture rather than to the cinematic.
  //
  // Deliberately NOT a FOV widening. FOV would grow the ground footprint at no
  // distance cost, which is exactly what the safety envelope above exists to
  // prevent — the edge of the world would appear for ultrawide viewers with
  // every distance bound still satisfied.

  /** Where the scrub starts, as a position in the whole-journey approach 0..1. */
  murciaVacuumStart: 0.7,

  /** Peak radial magnification at the edges. */
  vacuumDistortAmount: 0.18,
  /** Above 1 the centre holds still and only the edges tear. */
  vacuumDistortPower: 2.5,
  /** Peak radial streak blur. */
  vacuumBlurAmount: 0.35,
  /** Peak vignette coverage. */
  vacuumVignetteAmount: 0.76,
  /** Radius at which the vignette begins; above 1 it starts outside the corners. */
  vacuumVignetteStart: 1.1,
} as const

/**
 * The vignette tint. A cool grey rather than black, so the darkening reads as
 * atmosphere thickening rather than as the flash arriving early.
 */
export const VACUUM_VIGNETTE_COLOR = 0x2a2e33

/**
 * The movable subset of WARP_TRANSITION.
 *
 * Every curve below takes this as a REQUIRED parameter rather than defaulting
 * to WARP_TRANSITION. That is deliberate: a default turns "which numbers is
 * this frame using?" into a question the reader cannot answer at the call site,
 * and the two answers differ precisely when someone is mid-experiment. Passing
 * it costs one argument and removes the class of bug entirely.
 *
 * earthRestFov is NOT here — it must match introConfig.normalFov, so it is
 * not a number anyone may move independently.
 */
export interface WarpLimits {
  cut: number
  accelerationPower: number
  speedPeakWidth: number
  flashWidth: number
  motionBlurStrength: number
  earthCloseFactor: number
  earthGuideStart: number
  earthWarpFov: number
  murciaVacuumStart: number
  vacuumDistortAmount: number
  vacuumDistortPower: number
  vacuumBlurAmount: number
  vacuumVignetteAmount: number
  vacuumVignetteStart: number
}

export function createDefaultWarpLimits(): WarpLimits {
  return {
    cut: WARP_TRANSITION.cut,
    accelerationPower: WARP_TRANSITION.accelerationPower,
    speedPeakWidth: WARP_TRANSITION.speedPeakWidth,
    flashWidth: WARP_TRANSITION.flashWidth,
    motionBlurStrength: WARP_TRANSITION.motionBlurStrength,
    earthCloseFactor: WARP_TRANSITION.earthCloseFactor,
    earthGuideStart: WARP_TRANSITION.earthGuideStart,
    earthWarpFov: WARP_TRANSITION.earthWarpFov,
    murciaVacuumStart: WARP_TRANSITION.murciaVacuumStart,
    vacuumDistortAmount: WARP_TRANSITION.vacuumDistortAmount,
    vacuumDistortPower: WARP_TRANSITION.vacuumDistortPower,
    vacuumBlurAmount: WARP_TRANSITION.vacuumBlurAmount,
    vacuumVignetteAmount: WARP_TRANSITION.vacuumVignetteAmount,
    vacuumVignetteStart: WARP_TRANSITION.vacuumVignetteStart,
  }
}

// ─── There is no scrub band any more ───
//
// `SCRUB_CEILING`, `SCRUB_EASE` and `scrubProgress` lived here between
// `adr/009` and `adr/014`. They mapped a reversible gesture onto the first third
// of this cinematic, which was the only way to give a gesture something to look
// at while the product had no zoom.
//
// It is gone because the product has a zoom again, and the two cannot both own
// the camera's distance. What a viewer drives now is
// `app/navigation/zoomBand.ts`, which each world composes UNDER this progress
// through its own `camera/zoomPose`; this module is back to describing exactly
// one thing, the committed cinematic, which runs 0 -> 1 once and is concealed at
// the cut. `adr/009`'s original objection — that `transitionLeg` and
// `dollyAmount` assume a single pass — is answered by not asking them to do
// anything else, rather than by carving out a band where the assumption holds.

/**
 * Which leg the transition is on, and how far through that leg.
 *
 * Split on the EASED value, matching CameraController's intro warp. Note that
 * the scene cut keys off raw progress instead (DECISIONS.md 26.6) — the two
 * agree only because cinematicTravel is symmetric about 0.5. That is inherited
 * from the intro deliberately rather than diverged from.
 */
export function transitionLeg(
  p: number,
  limits: WarpLimits,
): { departing: boolean; localT: number } {
  const travelT = cinematicTravel(p, limits.accelerationPower)
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
export function dollyAmount(
  p: number,
  limits: WarpLimits,
): { departing: boolean; amount: number } {
  const { departing, localT } = transitionLeg(p, limits)
  return { departing, amount: departing ? localT : 1 - localT }
}

/** The wide bell. Drives the FOV surge and the motion blur. */
export function speed(p: number, limits: WarpLimits): number {
  return cinematicSpeed(p, limits.cut, limits.speedPeakWidth)
}

/**
 * The flash, 0..1. Reaches full cover at the cut.
 *
 * Full black rather than the intro's 0.22: that flash conceals a substitution
 * between two similar dark scenes, this one conceals a jump between two
 * unrelated worlds. Shaped by narrowPeak rather than a linear ramp so it still
 * spikes and recovers like the intro's, instead of reading as a dissolve.
 */
export function flash(p: number, limits: WarpLimits): number {
  return narrowPeak(p, limits.cut, limits.flashWidth)
}

/** Earth's FOV surge. Returns to the resting FOV at both ends on its own. */
export function earthFov(p: number, limits: WarpLimits): number {
  return lerp(WARP_TRANSITION.earthRestFov, limits.earthWarpFov, speed(p, limits))
}

/** Scale applied to Earth's camera radius: 1 at rest, earthCloseFactor at the cut. */
export function earthRadiusScale(amount: number, limits: WarpLimits): number {
  return lerp(1, limits.earthCloseFactor, amount)
}

// Murcia's pose mapping deliberately does NOT live here. The transition hands
// down an amount and a role; what a city does with them is the city's business,
// and `src/experiences/` may not depend upward on the shell (ARCHITECTURE §13).
// See src/experiences/murcia/camera/warpPose.ts. The envelope constants above
// are mirrors of murciaConfig, asserted equal by checks/warp-transition.ts.

/** The blur amount fed to the AfterimagePass, matching state.motionBlur's scale. */
export function motionBlur(p: number, limits: WarpLimits): number {
  return speed(p, limits) * limits.motionBlurStrength
}

/**
 * The vacuum, scrubbed from the viewer's own scroll. Reversible, and 0 until
 * the approach passes murciaVacuumStart.
 *
 * Takes the RAW approach, never a spring-painted one. An indicator that lags
 * reads as receiving your input; a screen-space effect that lags reads as the
 * renderer struggling.
 */
export function vacuumScrub(approach: number, limits: WarpLimits): number {
  return smootherstep(limits.murciaVacuumStart, 1, approach)
}

/**
 * The vacuum once the cinematic owns the camera: carried from wherever the
 * scrub had reached at the commit up to full on the speed bell.
 *
 * The latch is load-bearing. speed(0) is 0, so reading the bell alone would
 * snap the effect back to nothing on the first committed frame — visible as a
 * flinch exactly when the viewer has just succeeded.
 */
export function vacuumCommitted(atCommit: number, p: number, limits: WarpLimits): number {
  return atCommit + (1 - atCommit) * speed(p, limits)
}

/**
 * The one live instance of the movable numbers.
 *
 * Exported rather than defaulted inside each curve, so a call site still says
 * which numbers it is using and a reader can follow the reference. There is
 * exactly one of these because the app has no live-tuning panel; it stays a
 * mutable object so a query-string override can move a number at construction
 * without every holder needing to be told.
 */
export const WARP_LIMITS: WarpLimits = createDefaultWarpLimits()
