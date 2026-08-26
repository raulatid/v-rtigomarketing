import * as THREE from 'three'
import { dollyAmount, earthRadiusScale } from '../../../app/warpTransition'

// Earth's half of a SCRUBBED warp — the reversible part a viewer drives with the
// wheel, before anything has been committed.
//
// ── Why this is not in CameraController ──
//
// Because of frame order. Every Earth layer runs at `useFrame` priority 0, so
// they run in JSX order, and CameraController is FIRST while the interaction rig
// is LAST. The rig therefore always wins: anything CameraController writes to
// the camera while the rig is live is overwritten in the same frame, before
// RenderPipeline draws at priority 1.
//
// That is exactly why a committed cinematic asks the rig to stand down — with
// the rig silent, CameraController is the sole writer and may own the pose
// outright. A gesture cannot do that. Freezing the rig for the length of a
// gesture is what made Earth feel dead for over a second after every scroll:
// the tail of an abandoned gesture is deliberately long, and the rig sat out all
// of it while pointer input kept accumulating behind its back.
//
// So the two are different in kind, and this module is the difference:
//
//   a cinematic REPLACES the pose  — CameraController, rig stood down
//   a gesture   MODIFIES the pose  — here, immediately after rig.update()
//
// Applied last, it is still exactly one effective writer per frame, in a defined
// order, which is the invariant that removing OrbitControls bought.

/**
 * Bends the live camera toward the other world by `progress`.
 *
 * `progress` is `state.transitionProgress` restricted to the scrub band — see
 * `scrubProgress` in `app/warpTransition`. Zero is rest and costs nothing, which
 * is why the caller may call this unconditionally.
 *
 * `lookAt` must be the point the rig aimed at this frame (`rig.getLookAt()`).
 * Reading it rather than assuming the origin is not defensive: the rig eases its
 * aim, so during a return from a close-up it is genuinely somewhere else, and
 * scaling the position without re-aiming would let the globe slide off centre.
 *
 * ── Position only. The FOV surge belongs to the cinematic ──
 *
 * This wrote `earthFov(progress)` until 2026-08-25, for continuity with the
 * cinematic that takes over at a commit. It was cancelling the very thing the
 * gesture is for. The dolly magnifies the Earth by x1.587 across the band and
 * the surge widens the lens by 45 -> 59.5 deg, which de-magnifies by x0.725 —
 * so the net on-screen scale ran 1.00 -> 1.18 -> 1.15, PEAKING at half a gesture
 * and then going slightly backwards. A viewer driving the world toward them
 * watched it stop growing and start shrinking.
 *
 * That is right for a cinematic, where a widening lens on an accelerating dolly
 * is the rush of the warp. It is wrong for a pose a person is driving, where the
 * only question the eye asks is "is it getting closer". Held at rest the net is
 * the dolly's own 1.00 -> 1.587, monotone the whole way.
 *
 * The continuity this used to buy is paid for at the commit instead, by the FOV
 * catch-up in `CameraController.applyWarp` — a bounded blend that costs 200ms of
 * a 1.6s cinematic and is invisible against its acceleration.
 *
 * Reduced motion is unaffected by the change: it already skipped the surge and
 * kept the approach, so what it always drew is what everyone now draws. That is
 * also why this no longer takes the flag.
 */
export function applyScrubPose(
  camera: THREE.PerspectiveCamera,
  progress: number,
  lookAt: THREE.Vector3,
): void {
  if (!(progress > 0)) return

  const { amount } = dollyAmount(progress)

  // Radially, about the world origin — which is Earth's centre, and which is
  // what `earthRadiusScale` is defined against. The viewer keeps the orbit they
  // dragged to and only the distance changes. Same relationship the cinematic
  // uses, applied to a live pose instead of a captured one.
  //
  // Note that radial is NOT the same as "along the view axis" whenever the aim
  // point is not the origin — during the ease back from a satellite close-up it
  // briefly is not, and the framing shifts a little as a result. That matches
  // what the cinematic already does, and the two cannot overlap for long: a
  // selected satellite makes `canNavigate` false, so no gesture accumulates.
  camera.position.setLength(camera.position.length() * earthRadiusScale(amount))
  camera.lookAt(lookAt)
}
