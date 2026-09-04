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
 * **Inward (`zoomNearFactor`, 0.63).** Not free to choose. The committed warp
 * dollies from wherever the camera is by `earthRadiusScale`, which bottoms out
 * at 0.25 — so the closest point of a transition committed from full zoom-in is
 * `overviewRadius * 0.63 * 0.25` = 2.2 units, against an Earth of radius 2. That
 * is the pose the cut has always landed on, and it is under full flash cover.
 * Going deeper would put the camera inside the planet before the flash closed.
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
export function earthZoomScale(depth: number): number {
  // Non-finite lands at REST rather than propagating. One NaN reaching
  // `orbit.radius` puts the camera at an unrecoverable position for the rest of
  // the session — every later lerp toward it is NaN too — and there is no
  // meaningful zoom to fall back to except the one the intro landed at.
  if (!Number.isFinite(depth)) return 1
  const d = THREE.MathUtils.clamp(depth, -1, 1)
  return d >= 0
    ? THREE.MathUtils.lerp(1, cfg.zoomNearFactor, d)
    : THREE.MathUtils.lerp(1, cfg.zoomFarFactor, -d)
}

/** The orbit radius for a depth. The rig's `orbit.radius` and nothing else. */
export function earthZoomRadius(depth: number): number {
  return cfg.overviewRadius * earthZoomScale(depth)
}
