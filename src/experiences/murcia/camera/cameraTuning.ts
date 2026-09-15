import type { BoundsRect, EnvironmentConfig } from '../config/environmentConfig'

/**
 * The numbers the camera rig reads, and nothing else.
 *
 * ## Why this is not one struct with the app's navigation config
 *
 * The sandbox this was ported from (`vertigo-lab`, `camera-navigation`) kept
 * every tunable in one `NavigationTuning` object held by reference, because a
 * lil-gui panel mutated that object and everything read it live. There is no
 * panel here, and the struct's two halves turn out to be disjoint: the app's
 * input reads only the travel distances, the rig reads only what is below, and
 * nothing reads both.
 *
 * They are also on opposite sides of a boundary the architecture check enforces
 * — `checks/architecture.ts` section 2 forbids anything under `src/experiences/`
 * from importing `src/app/navigation/`, because scene navigation is the one
 * thing that knows both worlds exist. So splitting the struct is not a
 * concession; it is the shape the disjointness was already in.
 *
 * What DOES survive is the by-reference property, within this layer: the object
 * is created once by `MurciaExperience`, `applyNavigationQueryOverrides` may
 * mutate it at construction, and both `CameraRig` and `createCameraInput` hold
 * that same object. Cloning it would silently break the query overrides.
 */
export interface CameraTuning {
  /**
   * Degrees of yaw per viewport WIDTH of horizontal drag.
   *
   * POSITIVE, and that is a decision rather than an oversight. A positive gain
   * makes the world follow the finger: drag right and the camera yaws left, so
   * the ground slides right with the hand. The opposite sign — moving the camera
   * the way the finger moves — is self-consistent and is what was shipped first
   * in the sandbox; it was reported as "the navigation is backwards" on first
   * use. See the sign note in `CameraRig.drag`.
   */
  rotationGain: number
  /**
   * World units of travel per viewport HEIGHT of vertical drag, at the
   * reference radius.
   *
   * Also positive: drag DOWN and the camera advances, because the ground is
   * being pulled toward the viewer.
   */
  travelGain: number
  /**
   * Whether travel scales with how far back the camera is.
   *
   * On, so a drag covers the same fraction of the VISIBLE ground at every zoom.
   * Without it a drag that crosses the frame when zoomed in barely moves when
   * zoomed out, and the gesture stops meaning one thing.
   */
  scaleTravelWithDistance: boolean
  /**
   * The radius the travel gain was tuned at. Travel is multiplied by
   * `radius / this`, so changing the rest distance does not change the feel.
   */
  travelReferenceRadius: number

  /**
   * Spring frequencies, rad/s, per axis. Higher is tighter.
   *
   * THESE ARE SECOND-ORDER ANGULAR FREQUENCIES and they are not interchangeable
   * with a first-order rate or an inverse time constant, both of which also
   * appear in this codebase wearing the same shape. A figure taken from a
   * pre-spring table has to be multiplied by about 1.58 before it means the same
   * motion here.
   */
  rotationDamping: number
  travelDamping: number
  /**
   * The zoom's frequency. Note it is driven CRITICALLY damped regardless of
   * `dampingRatio` — see `CameraRig.update`.
   */
  zoomDamping: number
  /**
   * Damping ratio for rotation and travel. Below 1, so the camera LANDS rather
   * than stopping: it passes the stopped target once by about 1.4 units and
   * returns. That overshoot is the point, and `checks/navigation-feel.ts` bounds
   * it rather than forbidding it.
   */
  dampingRatio: number

  /** Rest elevation in degrees. The band moves it; this is where it starts. */
  pitchDegrees: number
  /** Safety clamp on the camera radius. The zoom band is bounded before this. */
  minRadius: number
  maxRadius: number

  /**
   * Where the navigation TARGET may go. The camera itself sits behind it.
   *
   * Grown past the authored plate rather than inset into it, so the viewer can
   * bring the plate's own edges to the middle of the frame.
   */
  bounds: BoundsRect

  /**
   * The camera leans a little toward a hovering cursor.
   *
   * An ornament, not a navigation: it is added at pose time and never enters the
   * targets, so the bounds clamp, a reset and a snapshot all stay clean. First
   * order rather than a spring, deliberately — a spring would bounce when the
   * mouse stops, which is exactly when the viewer is looking at it.
   */
  cursorFollow: boolean
  /**
   * Seconds of stillness before the lean returns.
   *
   * The clock lives in the rig rather than the input layer, because the input
   * layer has no frame tick and a mouse that stops moving would never reopen the
   * gate. Dragging, zooming and pinching restart it; hovering does not.
   */
  cursorIdleDelay: number
  cursorYawDegrees: number
  cursorPitchDegrees: number
  /** First-order rate for the lean, 1/s. */
  cursorDamping: number
}

/**
 * The shipped defaults, hand-tuned in the sandbox and promoted there.
 *
 * Takes the environment so the numbers that already have an owner keep it:
 * the rest elevation, the radius clamp and the bounds are all derived from
 * `murciaConfig` rather than restated here. Only the feel numbers — gains,
 * frequencies, the lean — are authored in this file.
 */
export function createDefaultCameraTuning(
  env: EnvironmentConfig,
  restDistance: number,
  restElevation: number,
  bounds: BoundsRect,
): CameraTuning {
  return {
    // 100 until 2026-09-15, when the client found the turn too fast (DECISIONS §44).
    rotationGain: 75,
    travelGain: 130,
    scaleTravelWithDistance: true,
    travelReferenceRadius: TRAVEL_REFERENCE_RADIUS,

    rotationDamping: 4,
    travelDamping: 7,
    zoomDamping: 3,
    dampingRatio: 0.85,

    pitchDegrees: restElevation,
    minRadius: restDistance * env.zoomNearScale,
    maxRadius: env.zoomFarDistance,

    bounds,

    cursorFollow: true,
    cursorIdleDelay: 2,
    cursorYawDegrees: 2.5,
    cursorPitchDegrees: 1,
    cursorDamping: 4,
  }
}

/**
 * A tuning for a rig that exists only to be measured.
 *
 * `cameraFraming.computeFramedFocus` and the check harnesses build DETACHED
 * rigs, to exercise the real pose maths rather than a second copy of it that
 * could drift. Those rigs are never stepped, so every feel number below is
 * irrelevant to them — what matters is that the bounds do not clamp a focus the
 * caller is deliberately probing outside the city.
 *
 * Separate from `createDefaultCameraTuning` on purpose: passing the shipped
 * tuning to a measurement rig would silently clamp the probe, and passing this
 * one to the live rig would remove the bounds entirely. Neither mistake is
 * possible when the two have different names.
 */
export function measurementCameraTuning(restElevation: number): CameraTuning {
  return {
    rotationGain: 0,
    travelGain: 0,
    scaleTravelWithDistance: false,
    travelReferenceRadius: TRAVEL_REFERENCE_RADIUS,
    rotationDamping: 1,
    travelDamping: 1,
    zoomDamping: 1,
    dampingRatio: 1,
    pitchDegrees: restElevation,
    minRadius: 1,
    maxRadius: Number.MAX_SAFE_INTEGER,
    bounds: {
      minX: -Infinity,
      maxX: Infinity,
      minZ: -Infinity,
      maxZ: Infinity,
    },
    cursorFollow: false,
    cursorIdleDelay: 0,
    cursorYawDegrees: 0,
    cursorPitchDegrees: 0,
    cursorDamping: 1,
  }
}

/**
 * The radius the travel gain was measured at.
 *
 * A constant rather than the live rest distance, so re-judging where the camera
 * rests does not silently re-scale every drag. If the rest distance moves, the
 * effective gain moves with it by design — that is what keeps a drag covering
 * the same fraction of the visible ground.
 */
export const TRAVEL_REFERENCE_RADIUS = 285
