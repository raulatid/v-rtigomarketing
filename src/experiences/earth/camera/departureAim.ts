import { easeInOutCubic } from '../../../utils/easing'
import { nearestEquivalentAngle } from './createFocusCameraRig'

/**
 * The swing above the destination, between a commit toward Murcia and the warp.
 *
 * ── Why it exists at all ──
 *
 * `CameraController.applyWarp` dollies along whatever radius it finds the camera
 * on and never re-orbits, so a departure from the far side of the planet dives
 * straight through it. Every departure therefore has to BEGIN above the
 * destination, from an orbit the viewer was free to leave anywhere.
 *
 * ── What it replaced, and what must not come back ──
 *
 * A steer driven by the zoom itself (`destinationSteer.ts`, DECISIONS §44): past
 * a depth threshold the scroll that zoomed also turned the globe. Because a fast
 * gesture could fill the band before an eased turn landed, that design needed
 * the orbit LOCKED for most of the band and the commit HELD until the camera
 * arrived — two thresholds, and a zone where the viewer could zoom but not look.
 * A phase of fixed length after the commit has no race to win, so both went.
 *
 * ── Pure, and the rig stays the only camera writer ──
 *
 * This resolves orbit ANGLES and nothing else. `InteractionLayer` hands them to
 * the rig, which places the camera as it always does; the radius is not touched,
 * so a zoom still easing when the viewer committed simply finishes easing.
 */

export interface DepartureAimState {
  /** Where the camera actually was on the first frame. Null until captured. */
  startTheta: number | null
  startPhi: number
  /**
   * The destination's azimuth, UNWRAPPED against the previous frame's.
   *
   * The globe spins, so the goal moves for the whole swing. Re-resolving "the
   * short way from the start" every frame would let a goal sitting near half a
   * turn away flip sides mid-swing and send the camera back the way it came;
   * following the previous goal instead picks the direction once and keeps it.
   */
  goalTheta: number
}

export interface OrbitAngles {
  theta: number
  phi: number
}

export function createDepartureAimState(): DepartureAimState {
  return { startTheta: null, startPhi: 0, goalTheta: 0 }
}

export function resetDepartureAim(state: DepartureAimState): void {
  state.startTheta = null
}

/**
 * The orbit angles for this frame of the swing, written into `out`.
 *
 * `from` is read on the first frame only, and must be where the camera IS (the
 * rig's eased angles) rather than where a drag has asked it to be — the swing
 * replaces that ease, so starting from the target would jump by whatever the
 * ease still owed.
 *
 * At `progress` 1 the result is the destination exactly, wherever it has spun to.
 */
export function advanceDepartureAim(
  state: DepartureAimState,
  progress: number,
  from: OrbitAngles,
  destinationTheta: number,
  destinationPhi: number,
  phiMin: number,
  phiMax: number,
  out: OrbitAngles,
): OrbitAngles {
  if (state.startTheta === null) {
    state.startTheta = from.theta
    state.startPhi = from.phi
    state.goalTheta = nearestEquivalentAngle(from.theta, destinationTheta)
  } else {
    state.goalTheta = nearestEquivalentAngle(state.goalTheta, destinationTheta)
  }

  const t = easeInOutCubic(Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0)))
  const goalPhi = Math.min(phiMax, Math.max(phiMin, destinationPhi))
  out.theta = state.startTheta + (state.goalTheta - state.startTheta) * t
  out.phi = state.startPhi + (goalPhi - state.startPhi) * t
  return out
}
