import { describe, expect, it } from 'vitest';
import { Matrix3, Vector3 } from 'three';
import { FIGURE_KINDS } from '../content/servicesContent';
import { figureLayout } from './figureLayouts';
import { seededRandom } from './maskSampling';

const frame = { center: new Vector3(), right: new Vector3(1, 0, 0), up: new Vector3(0, 1, 0), width: 1 };
const samples = Array.from({ length: 4000 }, (_, i) => [Math.sin(i) * 0.45, Math.cos(i) * 0.45] as const);

describe('service diagrams', () => {
  for (const kind of FIGURE_KINDS) {
    it(`${kind} stays within its framing and is stationary with reduced motion`, () => {
      const sample = (time: number, amplitude: number) => {
        const layout = figureLayout(kind, frame, time, { speed: 1, amplitude }, samples);
        const random = seededRandom(1337);
        return samples.map((_, i) => {
          const point = new Vector3();
          layout(i, samples.length, random, point, i / samples.length);
          expect(point.toArray().every(Number.isFinite)).toBe(true);
          expect(Math.abs(point.x)).toBeLessThanOrEqual(0.5);
          expect(Math.abs(point.y)).toBeLessThanOrEqual(0.5);
          expect(Math.abs(point.z)).toBeLessThanOrEqual(0.5);
          // The constant Y rotation must also fit, including at oblique angles.
          expect(Math.hypot(point.x, point.z)).toBeLessThanOrEqual(0.5);
          return point.toArray();
        });
      };
      const still = sample(0, 0);
      expect(sample(100, 0)).toEqual(still);
      expect(sample(10, 1)).not.toEqual(sample(0, 1));
      expect(Math.max(...still.map(p => p[2]!)) - Math.min(...still.map(p => p[2]!))).toBeGreaterThan(0.2);
      // A tilted flat drawing also has Z extent. Nonzero covariance volume
      // proves the point cloud is not confined to ANY plane.
      const mean = [0, 1, 2].map(axis => still.reduce((sum, p) => sum + p[axis]!, 0) / still.length);
      const covariance = new Matrix3();
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          covariance.elements[col * 3 + row] = still.reduce((sum, p) =>
            sum + (p[row]! - mean[row]!) * (p[col]! - mean[col]!), 0) / still.length;
        }
      }
      expect(covariance.determinant()).toBeGreaterThan(0.000001);
    });
  }
});
