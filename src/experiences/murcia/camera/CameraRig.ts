import * as THREE from 'three';
import type { CameraPoseConfig } from '../config/environmentConfig';
import { applyPoseToCamera, scalePoseDistance } from './applyPoseToCamera';

/**
 * Camera rig with a fixed elevation, a free horizontal yaw and a flight-driven
 * distance scale.
 *
 * Owns a `focus` point on the XZ plane. The camera sits at a slant distance
 * from that focus and always looks at it. Elevation and FOV never change during
 * navigation (docs/plans/002 Phase 3 and 5) — the navigable degrees of freedom
 * are where the focus is, which way the rig faces, and how far back it sits.
 *
 * Yaw and the distance scale are both kept separate from the pose, for the same
 * reason. The pose is environment configuration and gets re-resolved on every resize
 * *and* rewritten on every frame of a warp; both of the others must survive that, so
 * `setPose` deliberately preserves them. Folding the scale into a pose at the call
 * site instead would mean two writers on `distance` and the warp would silently
 * discard it.
 *
 * THE SCALE IS NO LONGER USER STATE, and that is the whole of what changed with
 * `adr/009`. It was the wheel-and-pinch zoom band; there is no zoom any more. The
 * mechanism survived because a controlled focus flight needs exactly it — a way to
 * move distance that composes with a yaw the user still owns — so it changed owner
 * rather than dying, from `DragPanController` to `CameraFlight`.
 *
 * Distance remains a *ground footprint* input, so anything clamping against the
 * footprint has to be recomputed when it changes, exactly as for yaw. That is now the
 * flight's `resolveBounds` rather than a drag callback. Elevation staying fixed is
 * still the last thing holding the footprint analysis together.
 *
 * The rig does not clamp. Callers clamp the proposed focus before committing it so
 * that clamping never produces a visible snap — and the flight clamps its distance
 * scale to the configured floor before setting it, for the same reason.
 */
export class CameraRig {
  readonly focus = new THREE.Vector3();

  private readonly camera: THREE.PerspectiveCamera;
  private readonly offset = new THREE.Vector3();
  /** Unit vector on XZ pointing from the camera toward the focus. */
  private readonly forward = new THREE.Vector3(0, 0, -1);
  private pose: CameraPoseConfig;
  /** User-driven yaw, degrees, added to the pose azimuth. Unbounded. */
  private yawDegrees = 0;
  /** Flight-driven distance scale, multiplying the pose distance. Bounded by the caller. */
  private distanceScale = 1;

  constructor(camera: THREE.PerspectiveCamera, pose: CameraPoseConfig) {
    this.camera = camera;
    this.pose = pose;
    this.applyPose();
  }

  /**
   * The *configured* pose, without any flight dolly folded in.
   *
   * Almost always the wrong one to read. Anything that re-derives a camera —
   * `cameraFraming.computeFramedFocus` builds a detached rig, the debug overlay
   * reports the distance, the check harnesses place a stand-in camera — needs
   * `getEffectivePose()`, or it works against a camera nobody is looking through
   * and misses by the dolly ratio.
   */
  getPose(): Readonly<CameraPoseConfig> {
    return this.pose;
  }

  /**
   * The pose actually in effect: the configured pose with the flight's dolly
   * folded into its distance.
   *
   * A fresh object whenever the scale is not 1, because `getPose()` hands back
   * `murciaConfig.camera` by identity and a caller mutating what it got would
   * corrupt the config for the rest of the session.
   */
  getEffectivePose(): CameraPoseConfig {
    return scalePoseDistance(this.pose, this.distanceScale);
  }

  /** Camera offset from the focus. Read-only; mutate via setPose or setYaw. */
  getOffset(): Readonly<THREE.Vector3> {
    return this.offset;
  }

  /** Height of the camera above the ground plane at the current pose. */
  getHeight(): number {
    return this.offset.y;
  }

  /** User yaw in degrees, unbounded — it accumulates through full turns. */
  getYaw(): number {
    return this.yawDegrees;
  }

  /** Pose azimuth plus user yaw: the direction the rig actually faces. */
  getAzimuthDegrees(): number {
    return this.pose.azimuthDegrees + this.yawDegrees;
  }

  /**
   * Ground-plane direction the camera is facing, normalized.
   *
   * This is what "forward" means for navigation: drag-to-move translates the
   * focus along this vector, so moving forward always means into the screen
   * regardless of how far the rig has been turned.
   */
  getForward(): Readonly<THREE.Vector3> {
    return this.forward;
  }

  /**
   * Sets the user yaw. Unbounded on purpose: wrapping to [0, 360) would make a
   * turn past the seam jump, and the smoothing that drives this reads the value
   * as a continuous quantity.
   */
  setYaw(degrees: number): void {
    if (degrees === this.yawDegrees) return;
    this.yawDegrees = degrees;
    this.applyPose();
  }

  /** Flight dolly as a multiple of the pose distance. Clamp before calling. */
  getDistanceScale(): number {
    return this.distanceScale;
  }

  /**
   * Sets the flight dolly. Multiplies the pose distance rather than replacing it, so
   * it composes with a pose that is itself being rewritten — the warp moves `distance`
   * between 75 and 180, and a district flight that is part-way in stays part-way in.
   *
   * Not clamped here: the floor lives in `FocusFlightConfig`, which the rig has no
   * reason to know about, and clamping in two places is how the two disagree.
   * `CameraFlight` clamps every proposal before it arrives.
   *
   * ONE WRITER, and it is now a narrow one. This used to be driven by the wheel and
   * the pinch, which meant a user input could change a ground-footprint term at any
   * moment. Only a flight moves it now, only inward, and only between a district
   * being selected and closed.
   */
  setDistanceScale(scale: number): void {
    if (scale === this.distanceScale) return;
    this.distanceScale = scale;
    this.applyPose();
  }

  /** Replaces the configured pose. The yaw and the flight dolly are preserved. */
  setPose(pose: CameraPoseConfig): void {
    this.pose = pose;
    this.applyPose();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  setFocus(x: number, z: number): void {
    this.focus.set(x, 0, z);
    this.updateCamera();
  }

  /**
   * Recomputes the offset from the pose angles plus yaw at the scaled distance,
   * and re-places the camera.
   */
  private applyPose(): void {
    applyPoseToCamera(
      this.camera,
      this.getEffectivePose(),
      this.focus,
      this.yawDegrees,
      this.offset,
      this.forward,
    );
  }

  private updateCamera(): void {
    this.camera.position.copy(this.focus).add(this.offset);
    this.camera.lookAt(this.focus.x, this.pose.lookAtHeight, this.focus.z);
  }
}
