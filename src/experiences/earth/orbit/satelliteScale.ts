import { ORBIT_CONFIG } from './orbitConfig'
import { isPhoneViewport } from '../camera/closeUpFraming'

/**
 * How large the satellite assembly is on THIS viewport, as a factor.
 *
 * THE ONE NUMBER. `ORBIT_CONFIG.satellite.modelSize` (0.88) is the phone size
 * and the size every derived constant in `orbitConfig.ts` is tuned against —
 * the isotype panel's height, its offset above the model, the emitter cone, the
 * raycast sphere, the tutorial cue's shell. A wide viewport wants a smaller
 * satellite (`wideModelSize`, 0.72), and the ONLY thing that changes is this
 * factor, applied as a single group scale inside `createSatellite`.
 *
 * That is what keeps two sizes honest. Authoring a second set of constants
 * would mean maintaining every one of those relationships twice, and worse, it
 * could not work at all: each of them is baked into geometry at construction,
 * and `OrbitSystemLayer`'s build effect deliberately never re-runs on a resize.
 * A scale is the only expression of size that can change after the fact.
 *
 * Pure — no three.js, no DOM, no `window` — so the unit tier drives it
 * directly, and so the caller decides where the viewport comes from: R3F's
 * `size` in the layer, `domElement.clientWidth/clientHeight` in the camera rig.
 * (DECISIONS §22.)
 */
export function satelliteAssemblyScale(viewportWidthPx: number, viewportHeightPx: number): number {
  if (isPhoneViewport(viewportWidthPx, viewportHeightPx)) return 1
  return ORBIT_CONFIG.satellite.wideModelSize / ORBIT_CONFIG.satellite.modelSize
}
