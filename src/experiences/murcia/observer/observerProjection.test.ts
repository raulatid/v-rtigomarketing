import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ViewpointMarker } from './observerAuthoring';
import {
  compositionError,
  createObserverSample,
  projectMarkers,
  PROJECTION_STRIDE,
  sampleCamera,
  type CompositionError,
} from './observerProjection';

/** At the origin, looking down -Z. */
function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(35, 2, 1, 1000);
  c.updateMatrixWorld(true);
  return c;
}

describe('projectMarkers', () => {
  it('puts a point on the view axis at the centre of the screen', () => {
    const out = new Float32Array(PROJECTION_STRIDE);
    projectMarkers(camera(), [{ position: [0, 0, -100] }], out);
    expect(out[0]).toBeCloseTo(0, 6);
    expect(out[1]).toBeCloseTo(0, 6);
    expect(out[2]).toBe(1);
  });

  it('converges points at different depths along one sight line', () => {
    const c = camera();
    const dir = new THREE.Vector3(0.2, 0.1, -1).normalize();
    const markers: ViewpointMarker[] = [20, 150, 600].map((d) => ({
      position: dir.clone().multiplyScalar(d).toArray() as [number, number, number],
    }));
    const out = new Float32Array(markers.length * PROJECTION_STRIDE);
    projectMarkers(c, markers, out);
    for (let i = 1; i < markers.length; i++) {
      expect(out[i * PROJECTION_STRIDE]).toBeCloseTo(out[0], 5);
      expect(out[i * PROJECTION_STRIDE + 1]).toBeCloseTo(out[1], 5);
    }
  });

  it('flags a point behind the camera', () => {
    const out = new Float32Array(PROJECTION_STRIDE);
    projectMarkers(camera(), [{ position: [0, 0, 50] }], out);
    expect(out[2]).toBe(0);
  });
});

describe('compositionError', () => {
  const markers: ViewpointMarker[] = [
    { position: [0, 0, 0], expectedNdc: [0, 0] },
    { position: [0, 0, 0], expectedNdc: [0.5, 0] },
    { position: [0, 0, 0] },
  ];
  const out: CompositionError = { meanPx: 0, maxPx: 0, scored: 0 };

  it('measures in pixels and ignores unscored markers', () => {
    // First exact; second 0.1 NDC right of target = 0.1 * 1000 / 2 = 50 px.
    const projected = new Float32Array([0, 0, 1, 0.6, 0, 1, 0.9, 0.9, 1]);
    compositionError(projected, markers, 1000, 500, out);
    expect(out.scored).toBe(2);
    expect(out.maxPx).toBeCloseTo(50, 4);
    expect(out.meanPx).toBeCloseTo(25, 4);
  });

  it('is unbounded when a scored marker is behind the camera', () => {
    const projected = new Float32Array([0, 0, 1, 0.5, 0, 0, 0, 0, 1]);
    compositionError(projected, markers, 1000, 500, out);
    expect(out.maxPx).toBe(Infinity);
  });
});

describe('sampleCamera', () => {
  it('reads position, direction and lens, with unknown speed on the first frame', () => {
    const c = camera();
    c.position.set(1, 2, 3);
    c.updateMatrixWorld(true);
    const s = createObserverSample();
    sampleCamera(c, null, 1 / 60, s);
    expect(s.position.toArray()).toEqual([1, 2, 3]);
    expect(s.forward.z).toBeCloseTo(-1, 6);
    expect(s.fov).toBe(35);
    expect(s.linearSpeed).toBe(Infinity);
  });

  it('measures linear and angular speed against the previous sample', () => {
    const c = camera();
    const a = createObserverSample();
    sampleCamera(c, null, 0.5, a);
    c.position.set(1, 0, 0);
    c.rotateY(THREE.MathUtils.degToRad(2));
    c.updateMatrixWorld(true);
    const b = createObserverSample();
    sampleCamera(c, a, 0.5, b);
    expect(b.linearSpeed).toBeCloseTo(2, 5);
    expect(b.angularSpeedDegrees).toBeCloseTo(4, 3);
  });
});
