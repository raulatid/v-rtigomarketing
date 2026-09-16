import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
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
          expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
          expect(Math.abs(point.x)).toBeLessThanOrEqual(0.5);
          expect(Math.abs(point.y)).toBeLessThanOrEqual(0.5);
          return point.toArray();
        });
      };
      expect(sample(100, 0)).toEqual(sample(0, 0));
      expect(sample(10, 1)).not.toEqual(sample(0, 1));
    });
  }
});
