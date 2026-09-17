import * as THREE from 'three';

import type {
  CameraPoseConfig,
  EnvironmentConfig,
  ZoomFarConfig,
} from '../config/environmentConfig';

/**
 * Where Murcia's camera goes for a given zoom depth.
 *
 * The viewer owns one number, -1 .. +1, and it stays where they leave it
 * (`app/navigation/zoomBand.ts`). This is where that number becomes a pose, and
 * it lives here for the same reason `warpPose.ts` does: what a city does with a
 * scalar is a property of ITS pose and ITS terrain skirt, not of the navigation
 * layer that produced the scalar. Nothing under src/experiences may depend
 * upward on src/app, so the depth arrives as a plain number with no provenance.
 *
 * ── The two halves are not mirror images ──
 *
 * The same asymmetry `warpPose.ts` records, and it has the same cause. Zooming
 * IN shrinks the ground footprint, so it costs nothing and only the distance
 * moves. Zooming OUT grows it, and rest already spends all but ~59 units of the
 * skirt — so it cannot simply pull back. It rises as it recedes, and steepening
 * the pitch shrinks the footprint faster than the extra distance grows it
 * (ADR 006). `checks/footprint.ts` sweeps the whole band against the real
 * footprint maths rather than trusting that argument.
 *
 * Which is also why +1 is the OUTWARD end here and the inward one on Earth: the
 * band's positive direction always faces the other world, and Murcia is left by
 * climbing out of it.
 *
 * FOV is never touched, on either half. Widening the lens would grow the
 * footprint at no distance cost, which is precisely the thing the skirt cannot
 * absorb, and `applyPoseToCamera` would carry it straight into the bounds maths.
 */

/** The ends of the band, resolved by the caller. */
export interface MurciaZoomTargets {
  /** The viewport-resolved resting pose, so portrait overrides survive a zoom. */
  restDistance: number;
  restElevation: number;
  /** Depth -1. Closest approach; elevation is unchanged there. */
  nearDistance: number;
  /** Depth +1. The furthest, highest pose a viewer may park at. */
  farDistance: number;
  farElevation: number;
}

/** The only two pose fields a zoom is allowed to move. Matches MurciaWarpPose. */
export interface MurciaZoomPose {
  distance: number;
  elevationDegrees: number;
}

/**
 * Reads the band's ends off an environment and a resolved resting pose.
 *
 * The near end is a SCALE in config and a distance here, resolved against the
 * pose the viewport actually produced — so a portrait override moves both ends
 * of the band with it instead of leaving the near end measured against a
 * distance nobody is at.
 *
 * The far end is absolute, so it cannot follow the pose that way: the caller
 * resolves it for the same viewport (`resolveZoomFar`) and hands it in.
 */
export function murciaZoomTargets(
  env: EnvironmentConfig,
  rest: CameraPoseConfig,
  far: ZoomFarConfig,
): MurciaZoomTargets {
  return {
    restDistance: rest.distance,
    restElevation: rest.elevationDegrees,
    nearDistance: rest.distance * env.zoomNearScale,
    farDistance: far.distance,
    farElevation: far.elevationDegrees,
  };
}

/**
 * Depth -1 .. +1 -> the pose to sit at.
 *
 * Piecewise about rest rather than one lerp across the whole band, because the
 * two halves move different things: the far half is the only one that touches
 * elevation. Clamped, so a caller that has lost track of its own bounds parks
 * the camera at a measured pose instead of extrapolating off the plate.
 */
export function murciaZoomPose(
  targets: MurciaZoomTargets,
  depth: number,
): MurciaZoomPose {
  const d = THREE.MathUtils.clamp(depth, -1, 1);

  if (d >= 0) {
    return {
      distance: THREE.MathUtils.lerp(targets.restDistance, targets.farDistance, d),
      elevationDegrees: THREE.MathUtils.lerp(
        targets.restElevation,
        targets.farElevation,
        d,
      ),
    };
  }

  return {
    distance: THREE.MathUtils.lerp(targets.restDistance, targets.nearDistance, -d),
    elevationDegrees: targets.restElevation,
  };
}
