import { describe, expect, it } from 'vitest';
import { SupportIndex, type SupportSurface } from './supportIndex';
import { DEFAULT_SHADE, sampleParapetFace, sampleWindowWall, windowFaceShade } from './lightInheritance';

/**
 * A 10 × 10 m block, 20 m tall, centred on the origin: a roof at y = 20 and
 * a facade facing +X at x = 5. Each surface's lightmap UV is a linear
 * function of position, so a sample can be checked by arithmetic.
 */
function block(): SupportSurface[] {
  const roof = [-5, 20, -5, 5, 20, -5, 5, 20, 5, -5, 20, 5];
  const roofUv = roof.flatMap((_, i, a) => (i % 3 === 0 ? [(a[i] + 5) / 40, (a[i + 2] + 5) / 40] : []));
  const facade = [5, 0, -5, 5, 0, 5, 5, 20, 5, 5, 20, -5];
  const facadeUv = facade.flatMap((_, i, a) => (i % 3 === 0 ? [0.5 + (a[i + 2] + 5) / 40, a[i + 1] / 40] : []));
  return [
    // Wound so the roof faces +Y and the facade +X.
    { key: 'roof', positions: roof, index: [0, 2, 1, 0, 3, 2], uv: roofUv },
    { key: 'facade', positions: facade, index: [0, 2, 1, 0, 3, 2], uv: facadeUv },
  ];
}

describe('SupportIndex', () => {
  it('finds the nearest triangle among those accepted and reads its UV there', () => {
    const index = new SupportIndex(block());
    const hit = index.nearest(5.1, 10, 1, 0.6, (nx) => nx > 0.9);
    expect(hit?.key).toBe('facade');
    expect(hit?.distance).toBeCloseTo(0.1, 6);
    expect(hit?.nx).toBeCloseTo(1, 6);
    // The inset pulls toward the triangle's centroid; the UV stays within a texel of the exact point.
    expect(hit!.u).toBeCloseTo(0.5 + 6 / 40, 2);
    expect(hit!.v).toBeCloseTo(10 / 40, 2);
  });

  it('returns null out of reach or when nothing is accepted', () => {
    const index = new SupportIndex(block());
    expect(index.nearest(6, 10, 0, 0.6, () => true)).toBeNull();
    expect(index.nearest(5.1, 10, 0, 0.6, (_x, y) => y > 0.9)).toBeNull();
  });
});

describe('light inheritance rules', () => {
  it('puts a window on the wall it faces out from', () => {
    const index = new SupportIndex(block());
    expect(sampleWindowWall(index, 5.1, 10, 0, 1, 0, 0)?.key).toBe('facade');
    // A window facing the other way does not take that wall.
    expect(sampleWindowWall(index, 5.1, 10, 0, -1, 0, 0)).toBeNull();
  });

  it('shades window faces by their local normal', () => {
    expect(windowFaceShade(0, 0, 1, DEFAULT_SHADE)).toBe(1);
    expect(windowFaceShade(0, 1, 0, DEFAULT_SHADE)).toBe(DEFAULT_SHADE.windowSill);
    expect(windowFaceShade(1, 0, 0, DEFAULT_SHADE)).toBe(DEFAULT_SHADE.windowReveal);
  });

  it('classifies parapet faces: top and inner read the roof, outer the facade', () => {
    const index = new SupportIndex(block());
    // A parapet 1 m tall and 0.3 m thick along the east edge, x 4.7..5.
    const top = [4.7, 21, -1, 4.7, 21, 1, 5, 21, 1];
    const outer = [5, 20, -1, 5, 21, 1, 5, 20, 1]; // faces +X, coplanar with the facade
    const inner = [4.7, 20, -1, 4.7, 20, 1, 4.7, 21, 1]; // faces −X, over the roof
    const t = sampleParapetFace(index, top, DEFAULT_SHADE);
    const o = sampleParapetFace(index, outer, DEFAULT_SHADE);
    const i = sampleParapetFace(index, inner, DEFAULT_SHADE);
    expect([t?.kind, t?.key, t?.shade]).toEqual(['top', 'roof', 1]);
    expect([o?.kind, o?.key, o?.shade]).toEqual(['outer', 'facade', 1]);
    expect([i?.kind, i?.key, i?.shade]).toEqual(['inner', 'roof', DEFAULT_SHADE.parapetInner]);
    // Corners on one island keep their own samples.
    expect(t?.flat).toBe(false);
  });

  it('takes the roof for an inner face even when a parallel facade is within reach', () => {
    // A wall facing −X at x = 3, the way the inner face looks, 1.7 m off: the
    // case the v8 probe found in two thirds of the faces that met a facade.
    const surfaces = block();
    surfaces.push({ key: 'neighbour', positions: [3, 0, -5, 3, 0, 5, 3, 30, 5], index: null, uv: [0, 0, 0, 1, 1, 1] });
    expect(new SupportIndex(surfaces).nearest(4.7, 20.5, 0, 2.5, (nx) => nx < -0.95)?.key).toBe('neighbour');
    const index = new SupportIndex(surfaces);
    const inner = [4.7, 20, -1, 4.7, 20, 1, 4.7, 21, 1];
    const light = sampleParapetFace(index, inner, DEFAULT_SHADE);
    expect([light?.kind, light?.key]).toEqual(['inner', 'roof']);
  });
});
