import * as THREE from 'three';
import { vacuumDeparture, type WarpLimits } from '../../../utils/warpTransition';

/** Murcia's departure stretches the frame as the camera rises away. */
export function murciaDepartureVacuum(p: number, limits: WarpLimits): number {
  return vacuumDeparture(p, limits);
}

/**
 * Where Murcia's camera goes during an Earth <-> Murcia warp.
 *
 * The transition owns the timing and hands down two things: an amount, 0 at
 * rest and 1 at the cut, and which role this city is playing. Everything about
 * what the camera then DOES is here, because it is a property of this city's
 * pose and its terrain skirt, not of the transition (the same reasoning that
 * puts `warpCloseDistance` in the environment config). Nothing under
 * src/experiences may depend upward on src/app.
 *
 * The two roles are not mirror images — see ADR 006.
 */

/**
 * The two ends of the warp, resolved by the caller.
 *
 * Rest comes from the viewport-resolved pose so portrait overrides still apply;
 * the four far ends are environment data.
 */
export interface MurciaWarpTargets {
  restDistance: number;
  restElevation: number;
  /** Arriving: the closest approach, reached at the cut. */
  closeDistance: number;
  /** Departing: the pose the camera rises to, reached at the cut. */
  departDistance: number;
  departElevation: number;
}

/** The only two pose fields a warp is allowed to move. FOV is never touched. */
export interface MurciaWarpPose {
  distance: number;
  elevationDegrees: number;
}

/**
 * Arriving into Murcia: start close, pull back to rest. Elevation untouched.
 *
 * Arriving cannot come from far away. Distance may not exceed rest on this leg
 * because nothing pays for the extra ground reach, so the approach has to start
 * inside and settle outward. Constraint, not taste (ADR 005).
 */
export function murciaArrivalPose(
  targets: MurciaWarpTargets,
  amount: number,
): MurciaWarpPose {
  return {
    distance: THREE.MathUtils.lerp(targets.restDistance, targets.closeDistance, amount),
    elevationDegrees: targets.restElevation,
  };
}

/**
 * Departing Murcia: rise away from the city, back out toward the Earth it sits
 * in.
 *
 * Distance grows only a little; the elevation does the work. Steepening the
 * pitch shrinks the ground footprint faster than the extra distance grows it,
 * so this reads as receding while reaching LESS far than the resting pose the
 * skirt was measured for (ADR 006). Asserted directly, against the real
 * footprint maths, in checks/warp-transition.ts.
 */
export function murciaDeparturePose(
  targets: MurciaWarpTargets,
  amount: number,
): MurciaWarpPose {
  return {
    distance: THREE.MathUtils.lerp(targets.restDistance, targets.departDistance, amount),
    elevationDegrees: THREE.MathUtils.lerp(
      targets.restElevation,
      targets.departElevation,
      amount,
    ),
  };
}

/** The pose for an amount, dispatched on which leg this city is playing. */
export function murciaWarpPose(
  targets: MurciaWarpTargets,
  amount: number,
  departing: boolean,
): MurciaWarpPose {
  return departing
    ? murciaDeparturePose(targets, amount)
    : murciaArrivalPose(targets, amount);
}
