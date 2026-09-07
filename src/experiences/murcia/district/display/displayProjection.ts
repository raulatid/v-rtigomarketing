import * as THREE from 'three';
import type { ElementRect } from '../../../../interaction/screenSpace';
import type { ScreenBox } from '../../../../interaction/touchTarget';
import { coreToPanelLocal, type DisplayRect } from './displayConfig';

/**
 * Where a control's drawn rectangle lands on screen, in CSS pixels.
 *
 * This is the projection the touch hit test grows from, and the one the guard
 * test measures — the same function, so the number the test asserts is the
 * number a finger meets. It is deliberately NOT a raycast: a raycast answers
 * "what is under this point", and the question here is the other way round,
 * "where is this control", which is what a minimum size has to be measured
 * against.
 *
 * Pure three.js. No DOM, no shader, no canvas — so it runs in a Node test with
 * a detached camera and a panel built from `displayConfig` alone.
 */

const corner = new THREE.Vector3();

/**
 * The bounding box of `rect`'s four corners after projection, into `out`.
 *
 * `panel` is the tilted face mesh (or any object sharing its world matrix); its
 * `matrixWorld` must be current. `null` when a corner is behind the camera —
 * a box through the eye is meaningless — but corners merely OFF the edge of the
 * canvas are kept: a control half off-screen must keep its on-screen half.
 *
 * A bounding box, not the projected quadrilateral. The panel leans 45° and
 * yaws with the camera, so the true shape is a trapezoid; the box overstates it
 * by a few pixels at the corners, which for a hit area is the right side to err
 * on and for a size floor changes nothing that matters.
 */
export function projectCoreRect(
  rect: DisplayRect,
  panel: THREE.Object3D,
  camera: THREE.Camera,
  canvas: ElementRect,
  out: ScreenBox = { left: 0, top: 0, right: 0, bottom: 0 },
): ScreenBox | null {
  if (canvas.width === 0 || canvas.height === 0) return null;

  let left = Number.POSITIVE_INFINITY;
  let top = Number.POSITIVE_INFINITY;
  let right = Number.NEGATIVE_INFINITY;
  let bottom = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < 4; i += 1) {
    const x = i & 1 ? rect.x + rect.width : rect.x;
    const y = i & 2 ? rect.y + rect.height : rect.y;
    coreToPanelLocal(x, y, corner);
    corner.applyMatrix4(panel.matrixWorld).project(camera);
    if (corner.z < -1 || corner.z > 1) return null;
    const clientX = canvas.left + ((corner.x + 1) / 2) * canvas.width;
    const clientY = canvas.top + ((1 - corner.y) / 2) * canvas.height;
    if (clientX < left) left = clientX;
    if (clientX > right) right = clientX;
    if (clientY < top) top = clientY;
    if (clientY > bottom) bottom = clientY;
  }

  out.left = left;
  out.top = top;
  out.right = right;
  out.bottom = bottom;
  return out;
}
