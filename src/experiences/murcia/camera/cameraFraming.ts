import * as THREE from 'three';
import { CameraRig } from './CameraRig';
import type { CameraPoseConfig } from '../config/environmentConfig';

/**
 * Framing a point into the part of the canvas that UI is *not* covering.
 *
 * Everything here is pure: it answers "where would the focus have to be" without
 * touching the live rig, the live camera or the Scene. That matters because the
 * obvious implementation — point the real rig at the destination, raycast, put it
 * back — jumps the camera for a frame and fires the rig's yaw-changed side
 * effects on the way through.
 */

/** The subset of DOMRect this module needs, so it can be tested without a DOM. */
export interface ScreenRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Ndc {
  x: number;
  y: number;
}

function right(r: ScreenRect): number {
  return r.left + r.width;
}
function bottom(r: ScreenRect): number {
  return r.top + r.height;
}
function area(r: ScreenRect): number {
  return Math.max(0, r.width) * Math.max(0, r.height);
}

/**
 * The largest rectangle of `canvas` left uncovered by `obstruction`.
 *
 * Written generically rather than as "subtract a right-hand panel" and
 * "subtract a bottom sheet", so the desktop dock and the mobile sheet share one
 * implementation and neither assumes the UI is flush with a canvas edge — or
 * that the canvas fills the viewport, which stops being true as soon as the app
 * shell puts anything beside it.
 */
export function unobstructedRect(
  canvas: ScreenRect,
  obstruction: ScreenRect | null,
): ScreenRect {
  if (!obstruction) return canvas;

  const overlap: ScreenRect = {
    left: Math.max(canvas.left, obstruction.left),
    top: Math.max(canvas.top, obstruction.top),
    width: Math.min(right(canvas), right(obstruction)) - Math.max(canvas.left, obstruction.left),
    height: Math.min(bottom(canvas), bottom(obstruction)) - Math.max(canvas.top, obstruction.top),
  };
  if (overlap.width <= 0 || overlap.height <= 0) return canvas;

  const candidates: ScreenRect[] = [
    { left: canvas.left, top: canvas.top, width: overlap.left - canvas.left, height: canvas.height },
    {
      left: right(overlap),
      top: canvas.top,
      width: right(canvas) - right(overlap),
      height: canvas.height,
    },
    { left: canvas.left, top: canvas.top, width: canvas.width, height: overlap.top - canvas.top },
    {
      left: canvas.left,
      top: bottom(overlap),
      width: canvas.width,
      height: bottom(canvas) - bottom(overlap),
    },
  ];

  let best = candidates[0]!;
  for (const candidate of candidates) {
    if (area(candidate) > area(best)) best = candidate;
  }
  // Fully covered: nothing useful to frame into, so frame to the whole canvas
  // rather than to a degenerate strip.
  return area(best) > 0 ? best : canvas;
}

/**
 * Centre of the unobstructed region, in normalized device coordinates.
 *
 * NDC is relative to the *canvas*, not the viewport, because that is the space
 * the projection matrix works in.
 *
 * Reproduces the closed forms for the two shipped layouts: a right-docked panel
 * of width P on a canvas of width W gives `x = -P/W`, and a bottom sheet of
 * height S on height H gives `y = +S/H`.
 */
export function unobstructedCenterNdc(
  canvas: ScreenRect,
  obstruction: ScreenRect | null,
): Ndc {
  if (canvas.width <= 0 || canvas.height <= 0) return { x: 0, y: 0 };
  const visible = unobstructedRect(canvas, obstruction);
  const centerX = visible.left + visible.width / 2;
  const centerY = visible.top + visible.height / 2;
  return {
    x: ((centerX - canvas.left) / canvas.width) * 2 - 1,
    y: -((centerY - canvas.top) / canvas.height) * 2 + 1,
  };
}

export interface FramedFocusRequest {
  pose: CameraPoseConfig;
  aspect: number;
  /** Rig yaw the flight will settle on, degrees. */
  yawDegrees: number;
  /** Y of the plane drags and framing are solved against. */
  groundPlaneHeight: number;
  /** World point that should end up under `ndc`. */
  target: { x: number; z: number };
  ndc: Ndc;
}

/**
 * Focus position that puts `target` under `ndc`.
 *
 * The camera sits at a fixed offset from the focus, so moving the focus by d
 * translates the whole view by d: a world point W lands where W − d used to be.
 * With the focus at the target, ray `ndc` hits the ground at P; we want the
 * target there instead, so d = target − P and the framed focus is target + d.
 *
 * Returns null when the ray misses the ground plane — near-horizon NDCs can —
 * and the caller should then fall back to the unframed target rather than
 * inventing a position.
 */
export function computeFramedFocus(request: FramedFocusRequest): { x: number; z: number } | null {
  const camera = new THREE.PerspectiveCamera();
  // A detached rig, so the real pose maths is exercised rather than a second
  // copy of it that could drift from CameraRig.
  const rig = new CameraRig(camera, request.pose);
  rig.setAspect(request.aspect);
  rig.setYaw(request.yawDegrees);
  rig.setFocus(request.target.x, request.target.z);
  camera.updateMatrixWorld(true);

  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(request.ndc.x, request.ndc.y), camera);

  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -request.groundPlaneHeight);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(plane, hit) === null) return null;

  return {
    x: request.target.x + (request.target.x - hit.x),
    z: request.target.z + (request.target.z - hit.z),
  };
}
