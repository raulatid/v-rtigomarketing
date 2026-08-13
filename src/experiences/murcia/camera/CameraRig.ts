import * as THREE from 'three';
import type { CameraPoseConfig } from '../config/environmentConfig';
import { applyPoseToCamera, scalePoseDistance } from './applyPoseToCamera';

/**
 * Camera rig with a fixed elevation, a free horizontal yaw and a bounded zoom.
 *
 * Owns a `focus` point on the XZ plane. The camera sits at a slant distance
 * from that focus and always looks at it. Elevation and FOV never change during
 * navigation (docs/plans/002 Phase 3 and 5) — the navigable degrees of freedom
 * are where the focus is, which way the rig faces, and how far back it sits.
 *
 * Yaw and zoom are both kept separate from the pose, for the same reason. The
 * pose is environment configuration and gets re-resolved on every resize *and*
 * rewritten on every frame of a warp; both of those are user state and must
 * survive that, so `setPose` deliberately preserves them. Folding the zoom into
 * a pose at the call site instead would mean two writers on `distance` and the
 * warp would silently discard it.
 *
 * Distance being user state has one consequence worth stating: it is a *ground
 * footprint* input, so anything that clamps against the footprint has to be
 * recomputed when it changes, exactly as it is for yaw. `DragPanController`
 * fires `onZoomChanged` for that. Elevation staying fixed is now the last thing
 * holding the footprint analysis together.
 *
 * The rig does not clamp. Callers clamp the proposed focus before committing it
 * so that clamping never produces a visible snap — and callers clamp the zoom
 * scale to the configured band before setting it, for the same reason.
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
  /** User-driven zoom, multiplying the pose distance. Bounded by the caller. */
  private zoomScale = 1;

  constructor(camera: THREE.PerspectiveCamera, pose: CameraPoseConfig) {
    this.camera = camera;
    this.pose = pose;
    this.applyPose();
  }

  /**
   * The *configured* pose, without the user's zoom.
   *
   * Almost always the wrong one to read. Anything that re-derives a camera —
   * `cameraFraming.computeFramedFocus` builds a detached rig, the debug overlay
   * reports the distance, the check harnesses place a stand-in camera — needs
   * `getEffectivePose()`, or it works against a camera the user is not looking
   * through and misses by the zoom ratio.
   */
  getPose(): Readonly<CameraPoseConfig> {
    return this.pose;
  }

  /**
   * The pose actually in effect: the configured pose with the user's zoom
   * folded into its distance.
   *
   * A fresh object whenever the zoom is not 1, because `getPose()` hands back
   * `murciaConfig.camera` by identity and a caller mutating what it got would
   * corrupt the config for the rest of the session.
   */
  getEffectivePose(): CameraPoseConfig {
    return scalePoseDistance(this.pose, this.zoomScale);
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

  /** User zoom as a multiple of the pose distance. Clamp before calling. */
  getZoomScale(): number {
    return this.zoomScale;
  }

  /**
   * Sets the user zoom. Multiplies the pose distance rather than replacing it,
   * so it composes with a pose that is itself being rewritten — the warp moves
   * `distance` between 75 and 180 while a zoomed-in user is still zoomed in.
   *
   * Not clamped here: the band lives in NavigationConfig.zoom, which the rig
   * has no reason to know about, and clamping in two places is how the two
   * disagree. `DragPanController` clamps every proposal before it arrives.
   */
  setZoomScale(scale: number): void {
    if (scale === this.zoomScale) return;
    this.zoomScale = scale;
    this.applyPose();
  }

  /** Replaces the configured pose. The user's yaw and zoom are preserved. */
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
   * Recomputes the offset from the pose angles plus yaw at the zoomed distance,
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
