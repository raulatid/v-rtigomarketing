import { describe, expect, it } from 'vitest';
import { cryptoRandom, scatterTargets } from './observerScatter';

/** A small deterministic generator, so failures reproduce. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('scatterTargets', () => {
  it('returns the requested number of targets, pairwise separated', () => {
    const aspect = 16 / 9;
    const targets = scatterTargets({ count: 6, aspect, extent: 0.6, minAspect: 9 / 19.5, minSeparation: 0.12, random: seeded(1) })!;
    expect(targets).toHaveLength(6);
    for (let i = 0; i < targets.length; i++) {
      for (let j = i + 1; j < targets.length; j++) {
        const dx = (targets[i][0] - targets[j][0]) * aspect;
        const dy = targets[i][1] - targets[j][1];
        // In half-heights: 0.12 of the height is 0.24 of them.
        expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(0.24);
      }
    }
  });

  it('keeps every target on screen down to the narrowest aspect', () => {
    for (const aspect of [9 / 19.5, 1, 21 / 9]) {
      const targets = scatterTargets({ count: 5, aspect, extent: 0.6, minAspect: 9 / 19.5, minSeparation: 0.1, random: seeded(7) })!;
      for (const [x, y] of targets) {
        // Horizontal cap: 0.9 of the narrowest half-width, in half-heights.
        expect(Math.abs(x * aspect)).toBeLessThanOrEqual((9 / 19.5) * 0.9 + 1e-9);
        expect(Math.abs(y)).toBeLessThanOrEqual(0.6);
        // And therefore on screen, even on a phone held upright.
        expect(Math.abs(x)).toBeLessThanOrEqual(1);
      }
    }
  });

  it('gives up rather than returning fewer targets than asked', () => {
    expect(scatterTargets({ count: 50, aspect: 1, extent: 0.2, minAspect: 1, minSeparation: 0.3, random: seeded(3) })).toBeNull();
  });
});

describe('cryptoRandom', () => {
  it('stays in [0, 1)', () => {
    for (let i = 0; i < 1000; i++) {
      const v = cryptoRandom();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
