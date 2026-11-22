import { describe, expect, it } from 'vitest';
import { rasterizeWindowFront } from './windowFront';

const srgb = (v: number) => Math.round((v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055) * 255);

/**
 * A 2 × 2 m back panel at z = 0, grey, and in front of its left half a
 * 1 × 2 m panel at z = 0.2, white, wound backwards (facing −Z).
 */
function panels() {
  const positions = [
    -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0,
    -1, -1, 0.2, 0, -1, 0.2, 0, 1, 0.2, -1, 1, 0.2,
  ];
  const colours = [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
  const index = [0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6];
  return { positions, colours, index };
}

describe('rasterizeWindowFront', () => {
  it('keeps the frontmost face whichever way it is wound, and covers the extent', () => {
    const { positions, colours, index } = panels();
    const front = rasterizeWindowFront(positions, colours, 3, index, 8, () => 1);
    expect([front.minX, front.maxX, front.minY, front.maxY, front.backZ]).toEqual([-1, 1, -1, 1, 0]);
    expect(front.coverage).toBeCloseTo(1, 6);
    expect(front.levels.map(l => l.length)).toEqual([8, 4, 2, 1].map(s => s * s * 4));
    const texel = (x: number, y: number) => Array.from(front.levels[0].subarray((y * 8 + x) * 4, (y * 8 + x) * 4 + 4));
    expect(texel(1, 4)).toEqual([255, 255, 255, 255]);
    expect(texel(6, 4)).toEqual([srgb(0.2), srgb(0.2), srgb(0.2), 255]);
  });

  it('multiplies each face by its shade, from the normal turned to the viewer', () => {
    const { positions, colours, index } = panels();
    const seen: number[] = [];
    const front = rasterizeWindowFront(positions, colours, 3, index, 8, (_x, _y, z) => { seen.push(z); return 0.5; });
    expect(seen.every(z => z > 0)).toBe(true);
    expect(front.levels[0][(4 * 8 + 1) * 4]).toBe(srgb(0.5));
  });

  it('leaves uncovered texels transparent but coloured like the window', () => {
    // Only the right half, so the left half is empty.
    const positions = [0, -1, 0, 1, -1, 0, 1, 1, 0, 0, 1, 0, -1, -1, -0.5];
    const colours = [0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0.2, 0, 0, 0];
    // The last vertex only widens the extent; no triangle uses it.
    const front = rasterizeWindowFront(positions, colours, 3, [0, 1, 2, 0, 2, 3], 8, () => 1);
    expect(front.coverage).toBeCloseTo(0.5, 6);
    const empty = Array.from(front.levels[0].subarray((4 * 8 + 1) * 4, (4 * 8 + 1) * 4 + 4));
    expect(empty).toEqual([srgb(0.2), srgb(0.2), srgb(0.2), 0]);
    expect(front.levels[3][3]).toBe(128);
  });
});
