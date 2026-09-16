import { smootherstep } from '../../../utils/easing'
import type { WarpLimits } from '../../../utils/warpTransition'
import { nearestEquivalentAngle } from './createFocusCameraRig'

/**
 * The zone to dive at: the third stage of Earth's zoom band.
 *
 * Past `earthGuideStart` the same scroll that zooms also turns the globe toward
 * the destination, so a viewer who pushes all the way arrives facing Spain rather
 * than whatever part of the planet happened to be facing them.
 *
 * ## It turns the ORBIT, the way a drag does
 *
 * The steer writes the rig's orbit TARGET, before `rig.update()`, and the rig
 * eases it with a faster angular response during guided approach, keeping the
 * radial zoom's original ease. It used to be applied AFTER the rig, as a
 * rotation of the finished camera, and that override knew nothing about what the
 * rig was doing. A satellite close-up opened past the threshold was re-aimed at
 * Spain on every frame; the drag went dead at full zoom, because the free orbit
 * had no weight left in the blend; and zooming out swung the camera back toward a
 * direction the viewer had long stopped looking at. As an input to the orbit, all
 * three are simply absent:
 *
 *   - a close-up owns the rig's target and ignores the orbit, so a satellite wins;
 *   - a drag writes the same orbit, so it is never dead and never undone;
 *   - zooming out rotates nothing — only zooming IN adds focus.
 *
 * ## Zooming in owes a fraction of the REMAINING turn
 *
 * `applied` is how much of the steer the orbit already carries. When the band's
 * weight rises from `applied` to `w`, the orbit turns `(w - applied) / (1 -
 * applied)` of the way that is left toward the destination. The fractions
 * compose, so any sequence of notches from the threshold to the end of the band
 * lands exactly on the destination — and a drag in between is respected, because
 * every later notch turns from wherever the viewer now is. A notch moves the
 * TARGET in one step; the rig's own ease turns it into a glide. The target is
 * fully aligned at `earthGuideEnd`, leaving the final band travel for settling.
 *
 * ## Following the destination while engaged
 *
 * The globe spins at ~2 degrees a second, so a view steered onto Spain would lose
 * it within seconds of the scroll stopping. While the steer is engaged the orbit
 * turns with the destination's own azimuth, in proportion to `applied`: locked on
 * at the end of the band, free again once the viewer zooms back out. Read from the
 * destination's position rather than from the spin constant, so a frozen globe
 * (`?freezeEarth`) follows nothing and there is no second copy of the spin rate.
 *
 * ## The radius is not touched
 *
 * The steering changes where ON the sphere the viewer looks from, never how far
 * away they are. The zoom stays theirs the whole way through.
 */

/**
 * How much of the turn is owed at a given band depth, 0..1.
 *
 * `smootherstep`, so the turn has zero slope where it begins: the planet must not
 * start turning the instant the viewer crosses a threshold, or the guide announces
 * itself as a mechanism instead of reading as the world helping.
 */
export function steerWeightFor(bandDepth: number, limits: WarpLimits): number {
  if (!Number.isFinite(bandDepth)) return 0
  return smootherstep(limits.earthGuideStart, limits.earthGuideEnd, bandDepth)
}

/** What the steer remembers between frames. Mutated in place. */
export interface OrbitSteerState {
  /** How much of the steer the orbit already carries, 0..1. */
  applied: number
  /**
   * The destination's azimuth on the last free frame, or null when there is
   * nothing to follow from — after a reset, a close-up, or a frame with no
   * destination to read.
   */
  previousDestinationTheta: number | null
}

export function createOrbitSteerState(): OrbitSteerState {
  return { applied: 0, previousDestinationTheta: null }
}

/**
 * Forgets everything, for a rig that has just re-seeded its orbit (`activate()`).
 * The next free frame owes the whole steer the band asks for, from wherever the
 * orbit now is.
 */
export function resetOrbitSteer(state: OrbitSteerState): void {
  state.applied = 0
  state.previousDestinationTheta = null
}

/** One frame's inputs. The caller may keep one object and rewrite its fields. */
export interface OrbitSteerFrame {
  bandDepth: number
  limits: WarpLimits
  /** The destination's direction from the Earth's centre, in the rig's spherical angles. */
  destinationTheta: number
  destinationPhi: number
  /** True while a satellite close-up owns the rig's target, flying in or holding. */
  focused: boolean
  /** The rig's own pitch limits, so the steer can never ask for a pole. */
  phiMin: number
  phiMax: number
}

/** The orbit target, as the rig's angles. Read and written in place. */
export interface OrbitAngles {
  theta: number
  phi: number
}

/**
 * Advances the steer by one frame: turns `orbit` in place and updates `state`.
 *
 * Allocation-free, because it runs every frame for the life of the scene.
 */
export function advanceOrbitSteer(
  state: OrbitSteerState,
  frame: OrbitSteerFrame,
  orbit: OrbitAngles,
): void {
  // A close-up owns the camera, and the orbit is left exactly as it is. The owed
  // weight is dropped rather than kept, so that the frame the close-up ends
  // re-applies the whole of it: the return flight lands where the zoom says the
  // viewer should be, not at the rest direction `returnToOverview` re-seeds.
  if (frame.focused) {
    resetOrbitSteer(state)
    return
  }

  const applied = Number.isFinite(state.applied) ? Math.min(1, Math.max(0, state.applied)) : 0

  // Follow the destination as the globe spins, in proportion to the engagement.
  // The shortest signed change, so the frame the azimuth wraps is not a turn.
  if (state.previousDestinationTheta !== null && applied > 0) {
    const turned =
      nearestEquivalentAngle(state.previousDestinationTheta, frame.destinationTheta) -
      state.previousDestinationTheta
    orbit.theta += applied * turned
  }

  // Zooming in owes a fraction of what is left; zooming out owes nothing.
  const weight = steerWeightFor(frame.bandDepth, frame.limits)
  if (weight > applied) {
    const fraction = applied >= 1 ? 1 : (weight - applied) / (1 - applied)
    const phi = Math.min(frame.phiMax, Math.max(frame.phiMin, frame.destinationPhi))
    orbit.theta += fraction * (nearestEquivalentAngle(orbit.theta, frame.destinationTheta) - orbit.theta)
    orbit.phi += fraction * (phi - orbit.phi)
  }

  state.applied = weight
  state.previousDestinationTheta = frame.destinationTheta
}

/**
 * How close the camera must be to the destination, in degrees round the globe,
 * before Earth may leave for Murcia.
 *
 * Measured at the Earth's centre, so it says how far round the planet the view
 * is rather than how far off-centre Spain looks: at the end of the band the
 * camera is ~6 R out, and 2 degrees round the globe puts Spain well under half a
 * degree off the middle of the frame. Loose enough that the rig's steady lag
 * behind the spinning destination (spin rate / lerpK, ~0.7 degrees) can never
 * hold back a commit from a camera that is already over Spain.
 */
export const EARTH_DEPARTURE_ALIGN_DEGREES = 2

/**
 * Is the camera above the destination: within `toleranceDegrees` of it, measured
 * at the Earth's centre?
 *
 * Give it the EASED camera position, not the orbit target, so it answers "has
 * the camera arrived" rather than "has it been asked to". A zero-length vector
 * has no direction to compare and answers false; what a missing destination
 * means is the caller's decision.
 */
export function isAboveDestination(
  camera: { x: number; y: number; z: number },
  destination: { x: number; y: number; z: number },
  toleranceDegrees: number,
): boolean {
  const a = Math.hypot(camera.x, camera.y, camera.z)
  const b = Math.hypot(destination.x, destination.y, destination.z)
  if (a < 1e-9 || b < 1e-9) return false
  const cos = (camera.x * destination.x + camera.y * destination.y + camera.z * destination.z) / (a * b)
  return Math.acos(Math.min(1, Math.max(-1, cos))) <= (toleranceDegrees * Math.PI) / 180
}
