import * as THREE from 'three';
import type { CameraPoseConfig } from '../config/environmentConfig';

/**
 * Turns a pose plus a yaw into a placed camera. The only place that maths
 * exists.
 *
 * Extracted from `CameraRig` so `checks/warp-transition.ts` can compute the
 * ground footprint of a warp pose against the REAL placement instead of a
 * convenient stand-in — the same rule the rest of checks/ follows. A guard that
 * asserts a reimplementation guards nothing.
 *
 * Writes `offset` and `forward` if given, so the rig keeps owning them without
 * recomputing the angles a second time.
 */
export function applyPoseToCamera(
  camera: THREE.PerspectiveCamera,
  pose: CameraPoseConfig,
  focus: THREE.Vector3,
  yawDegrees: number,
  offset?: THREE.Vector3,
  forward?: THREE.Vector3,
): void {
  const elevation = THREE.MathUtils.degToRad(pose.elevationDegrees);
  const azimuth = THREE.MathUtils.degToRad(pose.azimuthDegrees + yawDegrees);

  const height = pose.distance * Math.sin(elevation);
  const ground = pose.distance * Math.cos(elevation);

  const sin = Math.sin(azimuth);
  const cos = Math.cos(azimuth);

  const localOffset = offset ?? new THREE.Vector3();
  localOffset.set(ground * sin, height, ground * cos);
  // The offset runs focus -> camera, so forward is its negation on XZ. Taken
  // from the angles rather than by normalizing the offset, which would divide
  // by zero at a 90 degree elevation.
  forward?.set(-sin, 0, -cos);

  camera.fov = pose.fov;
  camera.near = pose.near;
  camera.far = pose.far;
  camera.updateProjectionMatrix();

  camera.position.copy(focus).add(localOffset);
  camera.lookAt(focus.x, pose.lookAtHeight, focus.z);
  // `lookAt` writes the rotation, not the world matrix. Anything that reads the
  // camera before the renderer's next update — `Raycaster.setFromCamera` inside
  // computeGroundFootprint, `Vector3.project` — would otherwise see the
  // PREVIOUS pose, silently, and the very first read would see the identity.
  // Redundant during a normal frame; the price is one matrix compose.
  camera.updateMatrixWorld(true);
}
