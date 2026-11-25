import { SupportIndex, type SupportHit, type SupportSurface } from './supportIndex';
import { WINDOW_PROBES as PROBES, sampleParapetFace, sampleWindowWall, type InheritanceShade } from './lightInheritance';

/**
 * The query half of light inheritance (`inheritLight.ts`): which support each
 * window and each parapet face reads, from plain arrays in world space.
 *
 * Split out so it can run in a worker (`inheritanceWorker.ts`): with the v9
 * city it is ~0.4 s of main thread on a desktop and over 2 s on a phone, and
 * it ran right after the h1 landed, as the line under it faded in
 * (measured 2026-11-25). `inheritLight` gathers the input from the scene and
 * builds the meshes from the answer; nothing here knows three.js.
 */

export interface WindowQuery {
  count: number;
  /** Per instance, `WINDOW_PROBES` world points in the order they are tried, xyz each. */
  probes: Float64Array;
  /** Per instance, the window's outward unit direction, world space. */
  out: Float64Array;
}

export interface ParapetQuery {
  /** Per face, its three corners in world space: 9 floats. */
  triangles: Float64Array;
}

export interface InheritanceInput {
  surfaces: SupportSurface[];
  windows: WindowQuery[];
  parapets: ParapetQuery[];
  shade: InheritanceShade;
}

export interface WindowAnswer {
  /** Per instance, an index into `keys`, or -1 when nothing lights it. */
  key: Int32Array;
  /** Per instance, the lightmap uv it reads. */
  uv: Float32Array;
  /** How many were lit only by the fallback. */
  fallback: number;
}

export interface ParapetAnswer {
  /** Per face, an index into `keys`, or -1 when nothing lights it. */
  key: Int32Array;
  /** Per face, uv per corner: 6 floats. */
  uv: Float32Array;
  shade: Float32Array;
  fallback: number;
}

export interface InheritanceSolution {
  keys: string[];
  windows: WindowAnswer[];
  parapets: ParapetAnswer[];
  /** Support triangles indexed (degenerate ones are dropped). */
  supports: number;
}

/**
 * The last resort for a window or parapet face with no wall or roof where the
 * rules look (one window and 9 parapet faces of the v8 city): the nearest
 * support in any orientation within this many metres, read flat.
 */
const FALLBACK_REACH = 5;
const anySupport = () => true;

export function solveInheritance(input: InheritanceInput): InheritanceSolution {
  const index = new SupportIndex(input.surfaces);
  const keys: string[] = [];
  const keyOf = (key: string) => {
    let at = keys.indexOf(key);
    if (at < 0) at = keys.push(key) - 1;
    return at;
  };

  const windows = input.windows.map(({ count, probes, out }): WindowAnswer => {
    const key = new Int32Array(count).fill(-1);
    const uv = new Float32Array(count * 2);
    let fallback = 0;
    for (let i = 0; i < count; i += 1) {
      const ox = out[i * 3], oy = out[i * 3 + 1], oz = out[i * 3 + 2];
      let hit: SupportHit | null = null;
      let p = 0;
      for (let k = 0; k < PROBES; k += 1) {
        p = (i * PROBES + k) * 3;
        hit = sampleWindowWall(index, probes[p], probes[p + 1], probes[p + 2], ox, oy, oz);
        if (hit) break;
      }
      if (!hit) {
        // From the last probe tried: the centre.
        hit = index.nearest(probes[p], probes[p + 1], probes[p + 2], FALLBACK_REACH, anySupport);
        if (hit) fallback += 1;
      }
      if (!hit) continue;
      key[i] = keyOf(hit.key);
      uv[i * 2] = hit.u;
      uv[i * 2 + 1] = hit.v;
    }
    return { key, uv, fallback };
  });

  const parapets = input.parapets.map(({ triangles }): ParapetAnswer => {
    const faces = triangles.length / 9;
    const key = new Int32Array(faces).fill(-1);
    const uv = new Float32Array(faces * 6);
    const shade = new Float32Array(faces).fill(1);
    const tri = new Float64Array(9);
    let fallback = 0;
    for (let f = 0; f < faces; f += 1) {
      tri.set(triangles.subarray(f * 9, f * 9 + 9));
      const sampled = sampleParapetFace(index, tri, input.shade);
      if (sampled) {
        key[f] = keyOf(sampled.key);
        uv.set(sampled.uv, f * 6);
        shade[f] = sampled.shade;
        continue;
      }
      const hit = index.nearest((tri[0] + tri[3] + tri[6]) / 3, (tri[1] + tri[4] + tri[7]) / 3, (tri[2] + tri[5] + tri[8]) / 3, FALLBACK_REACH, anySupport);
      if (!hit) continue;
      fallback += 1;
      key[f] = keyOf(hit.key);
      uv.set([hit.u, hit.v, hit.u, hit.v, hit.u, hit.v], f * 6);
    }
    return { key, uv, shade, fallback };
  });

  return { keys, windows, parapets, supports: index.size };
}

/** The buffers of a solution, to hand it across without copying. */
export function solutionTransfer(solution: InheritanceSolution): ArrayBuffer[] {
  return [
    ...solution.windows.flatMap(w => [w.key.buffer, w.uv.buffer]),
    ...solution.parapets.flatMap(p => [p.key.buffer, p.uv.buffer, p.shade.buffer]),
  ] as ArrayBuffer[];
}
