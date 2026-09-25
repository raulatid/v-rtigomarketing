import * as THREE from 'three';
import type { ViewpointMarker } from './observerAuthoring';

/**
 * What the camera is doing on one frame.
 *
 * Plain numbers and two vectors: the rest detector reads the speeds, and the
 * position, direction and lens are what `viewClient` reports to the server.
 */
export interface ObserverSample {
  readonly position: THREE.Vector3;
  /** Unit view direction. */
  readonly forward: THREE.Vector3;
  fov: number;
  /** World units per second since the previous sample; Infinity without one. */
  linearSpeed: number;
  /** Degrees per second of view-direction change; Infinity without one. */
  angularSpeedDegrees: number;
}

export function createObserverSample(): ObserverSample {
  return {
    position: new THREE.Vector3(),
    forward: new THREE.Vector3(0, 0, -1),
    fov: 0,
    linearSpeed: Infinity,
    angularSpeedDegrees: Infinity,
  };
}

const RAD_TO_DEG = 180 / Math.PI;

/**
 * Reads `camera` into `out`, with speeds measured against `previous`.
 *
 * `previous` null means there is nothing to measure against — the first frame
 * back from a flight — and the speeds read as Infinity, so a hold cannot begin
 * on a frame whose stillness is unknown.
 *
 * Reads the world matrix, which `applyPoseToCamera` leaves current on the frame
 * it writes.
 */
export function sampleCamera(
  camera: THREE.PerspectiveCamera,
  previous: ObserverSample | null,
  dt: number,
  out: ObserverSample,
): void {
  out.position.setFromMatrixPosition(camera.matrixWorld);
  camera.getWorldDirection(out.forward);
  out.fov = camera.fov;

  if (previous === null || !(dt > 0)) {
    out.linearSpeed = Infinity;
    out.angularSpeedDegrees = Infinity;
    return;
  }
  out.linearSpeed = out.position.distanceTo(previous.position) / dt;
  out.angularSpeedDegrees = (out.forward.angleTo(previous.forward) * RAD_TO_DEG) / dt;
}

/** Floats per marker in a projection buffer: ndcX, ndcY, inFront (1 or 0). */
export const PROJECTION_STRIDE = 3;

const scratch = new THREE.Vector3();

/**
 * World anchors -> NDC, written into `out` at `PROJECTION_STRIDE`.
 *
 * `inFront` is 0 for a point behind the camera or outside the depth range: its
 * projected x/y are then mirrored nonsense and must not be drawn or scored.
 */
export function projectMarkers(
  camera: THREE.Camera,
  markers: readonly ViewpointMarker[],
  out: Float32Array,
): void {
  for (let i = 0; i < markers.length; i++) {
    const [x, y, z] = markers[i].position;
    scratch.set(x, y, z).project(camera);
    const o = i * PROJECTION_STRIDE;
    out[o] = scratch.x;
    out[o + 1] = scratch.y;
    out[o + 2] = scratch.z > -1 && scratch.z < 1 ? 1 : 0;
  }
}

export interface CompositionError {
  /** Mean screen distance to `expectedNdc`, pixels. */
  meanPx: number;
  /** Worst marker, pixels. Infinity if a scored marker is behind the camera. */
  maxPx: number;
  /** Markers that carry an `expectedNdc`. */
  scored: number;
}

/**
 * How far the projected anchors are from where they should land, in pixels of a
 * `width` x `height` viewport — the measure that is actually the composition,
 * as opposed to the pose that produces it.
 */
export function compositionError(
  projected: Float32Array,
  markers: readonly ViewpointMarker[],
  width: number,
  height: number,
  out: CompositionError,
): void {
  let sum = 0;
  let max = 0;
  let scored = 0;
  for (let i = 0; i < markers.length; i++) {
    const expected = markers[i].expectedNdc;
    if (!expected) continue;
    scored++;
    const o = i * PROJECTION_STRIDE;
    if (projected[o + 2] === 0) {
      max = Infinity;
      sum = Infinity;
      continue;
    }
    const dx = ((projected[o] - expected[0]) * width) / 2;
    const dy = ((projected[o + 1] - expected[1]) * height) / 2;
    const d = Math.hypot(dx, dy);
    sum += d;
    if (d > max) max = d;
  }
  out.scored = scored;
  out.meanPx = scored > 0 ? sum / scored : 0;
  out.maxPx = max;
}
