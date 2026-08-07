import * as THREE from 'three';
import type { CameraPoseConfig } from '../config/environmentConfig';

/**
 * Camera rig with a fixed elevation and a free horizontal yaw.
 *
 * Owns a `focus` point on the XZ plane. The camera sits at a constant slant
 * distance from that focus and always looks at it. Elevation, distance and FOV
 * never change during navigation (docs/plans/002 Phase 3 and 5) — the navigable
 * degrees of freedom are where the focus is and which way the rig faces.
 *
 * Yaw is kept separate from `pose.azimuthDegrees`. The pose is environment
 * configuration and gets re-resolved on every resize; the yaw is user state and
 * must survive that, so `setPose` deliberately preserves it.
 *
 * The rig does not clamp. Callers clamp the proposed focus before committing it
 * so that clamping never produces a visible snap.
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

  constructor(camera: THREE.PerspectiveCamera, pose: CameraPoseConfig) {
    this.camera = camera;
    this.pose = pose;
    this.applyPose();
  }

  getPose(): Readonly<CameraPoseConfig> {
    return this.pose;
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

  /** Replaces the configured pose. The user's yaw is preserved. */
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

  /** Recomputes the offset from the pose angles plus yaw, and re-places the camera. */
  private applyPose(): void {
    const elevation = THREE.MathUtils.degToRad(this.pose.elevationDegrees);
    const azimuth = THREE.MathUtils.degToRad(this.getAzimuthDegrees());

    const height = this.pose.distance * Math.sin(elevation);
    const ground = this.pose.distance * Math.cos(elevation);

    const sin = Math.sin(azimuth);
    const cos = Math.cos(azimuth);

    this.offset.set(ground * sin, height, ground * cos);
    // The offset runs focus -> camera, so forward is its negation on XZ. Taken
    // from the angles rather than by normalizing the offset, which would divide
    // by zero at a 90 degree elevation.
    this.forward.set(-sin, 0, -cos);

    this.camera.fov = this.pose.fov;
    this.camera.near = this.pose.near;
    this.camera.far = this.pose.far;
    this.camera.updateProjectionMatrix();

    this.updateCamera();
  }

  private updateCamera(): void {
    this.camera.position.copy(this.focus).add(this.offset);
    this.camera.lookAt(this.focus.x, this.pose.lookAtHeight, this.focus.z);
  }
}
