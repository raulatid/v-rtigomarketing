/**
 * Where a detail's light comes from when it has no lightmap island of its own.
 *
 * Prototype for the light-inheritance idea of
 * `docs/audits/reports/murcia-light-and-geometry-alternatives-2026-11-20.md` §3:
 * a window, or a face of a parapet, reads the baked light of the surface it is
 * mounted on instead of its own atlas cell. This index answers «which baked
 * triangle is nearest to this point, among those facing this way, and what is
 * its lightmap UV there».
 *
 * Pure: plain arrays in world space, no three.js objects, so it runs in Node
 * against the decoded GLB as well as in the page.
 */

export interface SupportSurface {
  /** Atlas key (`extras.lightmap_atlas`) of the surface. */
  key: string;
  /** World-space positions, xyz per vertex. */
  positions: ArrayLike<number>;
  /** Triangle indices, or null for a non-indexed list. */
  index: ArrayLike<number> | null;
  /** Lightmap UV (TEXCOORD_1), uv per vertex, in glTF orientation. */
  uv: ArrayLike<number>;
}

export interface SupportHit {
  key: string;
  u: number;
  v: number;
  /** The nearest point on the support, world space. */
  x: number; y: number; z: number;
  /** World distance from the query point to the support. */
  distance: number;
  /** Unit normal of the support triangle, world space. */
  nx: number; ny: number; nz: number;
}

/** Accepts or rejects a candidate by its unit normal and atlas key. */
export type SupportFilter = (nx: number, ny: number, nz: number, key: string) => boolean;

/** Grid cell edge in metres. A window is ~1–3 m wide; roofs reach tens of metres. */
const CELL = 2;

/**
 * Barycentrics are pulled this far towards the centroid before the UV is
 * read, so a point on a triangle's edge never lands on the island's border,
 * where the bake margin is thinnest.
 */
const INSET = 0.04;

export class SupportIndex {
  private readonly keys: string[] = [];
  /** Per triangle: 9 position floats. */
  private readonly tri: Float64Array;
  /** Per triangle: 6 uv floats. */
  private readonly uvs: Float64Array;
  /** Per triangle: unit normal. */
  private readonly normals: Float64Array;
  /** Per triangle: index into `keys`. */
  private readonly owner: Uint16Array;
  private readonly grid = new Map<number, number[]>();
  /** Last query stamp per triangle, so a triangle in several cells is tested once. */
  private readonly seen: Uint32Array;
  private stamp = 0;

  constructor(surfaces: readonly SupportSurface[]) {
    let total = 0;
    for (const s of surfaces) total += (s.index ? s.index.length : s.positions.length / 3) / 3;
    this.tri = new Float64Array(total * 9);
    this.uvs = new Float64Array(total * 6);
    this.normals = new Float64Array(total * 3);
    this.owner = new Uint16Array(total);
    this.seen = new Uint32Array(total);
    let t = 0;
    for (const surface of surfaces) {
      let keyIndex = this.keys.indexOf(surface.key);
      if (keyIndex < 0) keyIndex = this.keys.push(surface.key) - 1;
      const count = (surface.index ? surface.index.length : surface.positions.length / 3) / 3;
      for (let f = 0; f < count; f += 1) {
        for (let c = 0; c < 3; c += 1) {
          const vertex = surface.index ? surface.index[f * 3 + c] : f * 3 + c;
          for (let a = 0; a < 3; a += 1) this.tri[t * 9 + c * 3 + a] = surface.positions[vertex * 3 + a];
          this.uvs[t * 6 + c * 2] = surface.uv[vertex * 2];
          this.uvs[t * 6 + c * 2 + 1] = surface.uv[vertex * 2 + 1];
        }
        if (!this.computeNormal(t)) continue; // degenerate: never a support
        this.owner[t] = keyIndex;
        this.insert(t);
        t += 1;
      }
    }
    this.size = t;
  }

  /** Triangles that can be returned (degenerate ones are dropped). */
  size = 0;

  /**
   * The nearest accepted support triangle within `maxDistance` of the point,
   * and its lightmap UV at the nearest point on it.
   */
  nearest(x: number, y: number, z: number, maxDistance: number, accept: SupportFilter): SupportHit | null {
    this.stamp += 1;
    if (this.stamp === 0xffffffff) { this.seen.fill(0); this.stamp = 1; }
    const i0 = Math.floor((x - maxDistance) / CELL), i1 = Math.floor((x + maxDistance) / CELL);
    const k0 = Math.floor((z - maxDistance) / CELL), k1 = Math.floor((z + maxDistance) / CELL);
    let best = -1, bestD2 = maxDistance * maxDistance, bu = 0, bv = 0, bw = 0;
    for (let i = i0; i <= i1; i += 1) {
      for (let k = k0; k <= k1; k += 1) {
        const list = this.grid.get(cellKey(i, k));
        if (!list) continue;
        for (const t of list) {
          if (this.seen[t] === this.stamp) continue;
          this.seen[t] = this.stamp;
          const n = t * 3;
          if (!accept(this.normals[n], this.normals[n + 1], this.normals[n + 2], this.keys[this.owner[t]])) continue;
          closestOnTriangle(this.tri, t * 9, x, y, z, scratch);
          const d2 = scratch[3];
          if (d2 <= bestD2) { bestD2 = d2; best = t; bu = scratch[0]; bv = scratch[1]; bw = scratch[2]; }
        }
      }
    }
    if (best < 0) return null;
    // Pull towards the centroid: (b + INSET/3 · 1) / (1 + INSET) keeps the sum at 1.
    const a = (bu + INSET / 3) / (1 + INSET), b = (bv + INSET / 3) / (1 + INSET), c = (bw + INSET / 3) / (1 + INSET);
    const o = best * 6;
    const n = best * 3;
    const p = this.tri, q = best * 9;
    return {
      key: this.keys[this.owner[best]],
      x: bu * p[q] + bv * p[q + 3] + bw * p[q + 6],
      y: bu * p[q + 1] + bv * p[q + 4] + bw * p[q + 7],
      z: bu * p[q + 2] + bv * p[q + 5] + bw * p[q + 8],
      u: a * this.uvs[o] + b * this.uvs[o + 2] + c * this.uvs[o + 4],
      v: a * this.uvs[o + 1] + b * this.uvs[o + 3] + c * this.uvs[o + 5],
      distance: Math.sqrt(bestD2),
      nx: this.normals[n], ny: this.normals[n + 1], nz: this.normals[n + 2],
    };
  }

  private computeNormal(t: number): boolean {
    const p = this.tri, o = t * 9;
    const ex = p[o + 3] - p[o], ey = p[o + 4] - p[o + 1], ez = p[o + 5] - p[o + 2];
    const fx = p[o + 6] - p[o], fy = p[o + 7] - p[o + 1], fz = p[o + 8] - p[o + 2];
    const nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-9) return false;
    this.normals[t * 3] = nx / length;
    this.normals[t * 3 + 1] = ny / length;
    this.normals[t * 3 + 2] = nz / length;
    return true;
  }

  private insert(t: number): void {
    const p = this.tri, o = t * 9;
    const minX = Math.min(p[o], p[o + 3], p[o + 6]), maxX = Math.max(p[o], p[o + 3], p[o + 6]);
    const minZ = Math.min(p[o + 2], p[o + 5], p[o + 8]), maxZ = Math.max(p[o + 2], p[o + 5], p[o + 8]);
    for (let i = Math.floor(minX / CELL); i <= Math.floor(maxX / CELL); i += 1) {
      for (let k = Math.floor(minZ / CELL); k <= Math.floor(maxZ / CELL); k += 1) {
        const key = cellKey(i, k);
        const list = this.grid.get(key);
        if (list) list.push(t); else this.grid.set(key, [t]);
      }
    }
  }
}

function cellKey(i: number, k: number): number {
  // The city spans well under ±2^15 cells each way.
  return (i + 32768) * 65536 + (k + 32768);
}

const scratch = new Float64Array(4);

/**
 * Closest point on triangle `p[o..o+9]` to (x, y, z), as barycentrics in
 * out[0..3] and the squared distance in out[3]. Ericson, *Real-Time Collision
 * Detection*, §5.1.5.
 */
export function closestOnTriangle(p: ArrayLike<number>, o: number, x: number, y: number, z: number, out: Float64Array): void {
  const ax = p[o], ay = p[o + 1], az = p[o + 2];
  const abx = p[o + 3] - ax, aby = p[o + 4] - ay, abz = p[o + 5] - az;
  const acx = p[o + 6] - ax, acy = p[o + 7] - ay, acz = p[o + 8] - az;
  const apx = x - ax, apy = y - ay, apz = z - az;
  const d1 = abx * apx + aby * apy + abz * apz, d2 = acx * apx + acy * apy + acz * apz;
  let u: number, v: number, w: number;
  if (d1 <= 0 && d2 <= 0) { u = 1; v = 0; w = 0; } else {
    const bpx = x - p[o + 3], bpy = y - p[o + 4], bpz = z - p[o + 5];
    const d3 = abx * bpx + aby * bpy + abz * bpz, d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { u = 0; v = 1; w = 0; } else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const s = d1 / (d1 - d3); u = 1 - s; v = s; w = 0; } else {
        const cpx = x - p[o + 6], cpy = y - p[o + 7], cpz = z - p[o + 8];
        const d5 = abx * cpx + aby * cpy + abz * cpz, d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { u = 0; v = 0; w = 1; } else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const s = d2 / (d2 - d6); u = 1 - s; v = 0; w = s; } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              const s = (d4 - d3) / ((d4 - d3) + (d5 - d6)); u = 0; v = 1 - s; w = s;
            } else {
              const denom = 1 / (va + vb + vc); v = vb * denom; w = vc * denom; u = 1 - v - w;
            }
          }
        }
      }
    }
  }
  const qx = ax + abx * v + acx * w - x, qy = ay + aby * v + acy * w - y, qz = az + abz * v + acz * w - z;
  out[0] = u; out[1] = v; out[2] = w; out[3] = qx * qx + qy * qy + qz * qz;
}
