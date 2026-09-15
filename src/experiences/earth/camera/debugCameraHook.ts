/**
 * `window.__vertigoProto` — the dev-only handle a capture script drives the
 * Earth scene from.
 *
 * This closes a gap `e2e/backdrop.spec.ts` names out loud. Its deleted seam
 * test left a comment saying a genuine seam test "would have to aim the camera
 * at the seam, which needs a camera-control hook this suite does not have.
 * Worth adding when there is one". This is that hook, and the sky-cubemap
 * comparison is what finally needed it: five identical camera states across
 * five sky variants is 25 screenshots that are only comparable if the camera is
 * the SAME camera, to the pixel, in every one of them.
 *
 * Two operations, both about determinism rather than convenience:
 *
 *   setCamera — an exact pose, snapped, no ease. Delegates to the focus rig's
 *               setDebugPose; there is still exactly one camera owner.
 *   freezeEarth — stops the 0.035 rad/s surface spin. The only thing in the
 *               resting scene that makes a shot taken at a wall-clock delay a
 *               shot of a different frame each run.
 *
 * Installed only when DEBUG_TOOLS_ENABLED, so nothing reaches this in a
 * production build.
 */
import { DEBUG_TOOLS_ENABLED } from '../../../platform/buildFlags'
import { PROTO_SKY } from '../config/protoSky'
import type { FocusCameraRig } from './createFocusCameraRig'

export interface DebugCameraPose {
  radius?: number
  theta?: number
  phi?: number
  fov?: number
  lookAt?: [number, number, number]
}

export interface VertigoProtoApi {
  setCamera(pose: DebugCameraPose): void
  /**
   * Where the camera actually is. The capture script asserts against this
   * rather than trusting setCamera, because a pose that silently did not take
   * produces 25 plausible screenshots of the wrong thing.
   */
  getCamera(): ReturnType<FocusCameraRig['getDebugPose']>
  freezeEarth(frozen?: boolean): void
  isEarthFrozen(): boolean
  /**
   * True once EVERY satellite has finished its entrance and is idling.
   *
   * A capture script needs this because readiness lands long before the
   * satellites are on screen: the orbit lines draw, then a head rides each one
   * to its end, and only then does the satellite fade up in its place. Waiting
   * a fixed number of seconds after `boot.readiness()` instead is a race, and
   * it is a race that has already produced a checkpoint judged on shots with no
   * satellites in them — under swiftshader the reveal can still be finishing
   * seconds after a generous-looking delay.
   */
  satellitesIdle(): boolean
  /** The parsed URL parameters, so a script can assert it got the run it asked for. */
  params: typeof PROTO_SKY
}

declare global {
  interface Window {
    __vertigoProto?: VertigoProtoApi
  }
}

/**
 * Module state rather than a ref, because EarthScene's frame callback reads it
 * and the rig's effect writes it, and they have no component relationship. It
 * is a single boolean owned by a dev tool; threading it through props would
 * cost more than it explains.
 */
let earthFrozen = PROTO_SKY.freezeEarth

/** Read by EarthScene's spin. False in every build where the hook is absent. */
export function isEarthFrozen(): boolean {
  return earthFrozen
}

/**
 * Publishes the hook and returns its teardown. Safe to call unconditionally —
 * it installs nothing when the flag is off.
 *
 * `satellitesIdle` arrives as a PREDICATE rather than the orbit system itself.
 * The probe is one boolean and the caller already holds the system; taking the
 * whole object would put an `orbit/` import into `camera/` to read a single
 * flag, and this module deliberately knows about nothing but the rig.
 */
export function installDebugCameraHook(
  rig: FocusCameraRig,
  satellitesIdle: () => boolean,
): () => void {
  if (!DEBUG_TOOLS_ENABLED) return () => {}

  window.__vertigoProto = {
    setCamera: (pose) => rig.setDebugPose(pose),
    getCamera: () => rig.getDebugPose(),
    freezeEarth: (frozen = true) => {
      earthFrozen = frozen
    },
    isEarthFrozen: () => earthFrozen,
    satellitesIdle,
    params: PROTO_SKY,
  }

  return () => {
    delete window.__vertigoProto
  }
}
