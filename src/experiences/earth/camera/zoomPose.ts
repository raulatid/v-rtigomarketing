import * as THREE from 'three'
import { INTERACTION_CONFIG } from '../interaction/interactionConfig'

// Where Earth's camera sits for a given zoom depth.
//
// Replaces `scrubPose.ts`, and the difference is the whole of `adr/014`. The
// scrub bent the camera along the first third of the warp cinematic, reversibly,
// and let go of it the moment the viewer stopped pushing. This is an ordinary
// zoom: one radius, on the orbit sphere, that stays where it is left.
//
// ── Why this is a NUMBER and not a camera write ──
//
// `scrubPose` had to move the camera itself, after `rig.update()`, because the
// rig would have overwritten anything written before it. That constraint is
// gone: the rig's orbit radius is a real input again, so the zoom feeds the rig
// instead of correcting it afterwards. One writer per frame, in one place, which
// is what removing OrbitControls bought in the first place — and the rig's
// existing radius ease (`lerpK`) then smooths a wheel notch for free, where the
// scrub needed a spring in the navigation layer to do the same job.
//
// ── The band ──
//
//   depth +1  toward Murcia, so INWARD
//   depth  0  `overviewRadius`, where the intro lands
//   depth -1  outward
//
// +1 is the transition-facing end here and the outward end in Murcia, because
// the band's positive direction always faces the other world and Murcia is down
// there. `app/navigation/zoomBand.ts` owns that convention; this only has to
// honour it.

const cfg = INTERACTION_CONFIG.camera

/**
 * Depth -1 .. +1 -> a multiple of `overviewRadius`.
 *
 * Piecewise about rest so the two ends can be judged independently, which they
 * were: they answer different questions and are constrained by different things.
 *
 * **Inward (`zoomNearFactor`).** `ZOOM_NEAR_CLEARANCE` times the height of the
 * outermost satellite orbit, so the band ends OUTSIDE the satellites rather than
 * among them — 7.2 units against a planet of 2. It ended among them for four
 * days and that framing showed the surface texture's texels; the clearance is
 * what buys the distance back while keeping the end tied to the orbits.
 *
 * It used to be pinned at 0.63 by the warp: the committed dolly was a bare 0.25
 * of the departure radius, so a nearer end would have put the camera inside the
 * planet before the flash closed. The dolly has a floor now (`earthDollyRadius`,
 * 3.5 units), and the near end is free of it — with room to spare, since a
 * commit from 7.2 dives to 3.5 rather than barely moving.
 *
 * A viewport on the NARROW surface maps stops at 12 instead, and for an
 * unrelated reason — the texture, not the orbits. See
 * `interactionConfig.zoomNearFactorNarrow`, which carries the derivation. It is
 * further out, so every argument above still holds for it: it clears the
 * satellites by more, and a commit from 12 reaches the same 3.5 floor.
 *
 * **Outward (`zoomFarFactor`, 11/7).** This is `zoomMax: 11 * R`, the far end of
 * the band `adr/009` retired, brought back unchanged — it was tuned against this
 * globe and nothing about the globe has changed. Safe against the star shell:
 * `checks/space-backdrop.ts` puts the nearest star at 153 units and this reaches
 * 22, so the shell still encloses the camera by a factor of seven.
 *
 * Clamped, so a caller that has lost track of its own bounds parks the camera at
 * a judged radius instead of extrapolating into the planet or out through the
 * stars.
 */
export function earthZoomScale(depth: number, nearFactor: number = cfg.zoomNearFactor): number {
  // Non-finite lands at REST rather than propagating. One NaN reaching
  // `orbit.radius` puts the camera at an unrecoverable position for the rest of
  // the session — every later lerp toward it is NaN too — and there is no
  // meaningful zoom to fall back to except the one the intro landed at.
  if (!Number.isFinite(depth)) return 1
  const d = THREE.MathUtils.clamp(depth, -1, 1)
  return d >= 0
    ? THREE.MathUtils.lerp(1, nearFactor, d)
    : THREE.MathUtils.lerp(1, cfg.zoomFarFactor, -d)
}

/**
 * The orbit radius for a depth. The rig's `orbit.radius` and nothing else.
 *
 * `nearFactor` is a parameter because the near end depends on which SURFACE MAPS
 * this session loaded, not on the composition: a viewport carrying the 1024-wide
 * narrow set stops further out, because the same framing that reads at x1.03
 * against a 4096 map reads at x3.6 against a quarter of it. The caller resolves
 * it — `createFocusCameraRig` — from the latched tier, never from the live
 * viewport, so a phone that rotates keeps the end its textures earned.
 */
export function earthZoomRadius(
  depth: number,
  overviewRadius = cfg.overviewRadius,
  nearFactor: number = cfg.zoomNearFactor,
): number {
  if (overviewRadius === cfg.overviewRadius) {
    return cfg.overviewRadius * earthZoomScale(depth, nearFactor)
  }
  const d = Number.isFinite(depth) ? THREE.MathUtils.clamp(depth, -1, 1) : 0
  // Change the resting composition without moving either zoom endpoint or the
  // closest approach of the committed warp.
  const endpoint = cfg.overviewRadius * (d >= 0 ? nearFactor : cfg.zoomFarFactor)
  return THREE.MathUtils.lerp(overviewRadius, endpoint, Math.abs(d))
}
