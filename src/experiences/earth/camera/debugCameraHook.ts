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
import { DEBUG_TOOLS_ENABLED } from '../../../app/buildFlags'
import { PROTO_SKY } from '../../../app/protoSky'
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
  freezeEarth(frozen?: boolean): void
  isEarthFrozen(): boolean
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
 */
export function installDebugCameraHook(rig: FocusCameraRig): () => void {
  if (!DEBUG_TOOLS_ENABLED) return () => {}

  window.__vertigoProto = {
    setCamera: (pose) => rig.setDebugPose(pose),
    freezeEarth: (frozen = true) => {
      earthFrozen = frozen
    },
    isEarthFrozen: () => earthFrozen,
    params: PROTO_SKY,
  }

  return () => {
    delete window.__vertigoProto
  }
}
