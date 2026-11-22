import type { SupportHit, SupportIndex } from './supportIndex';

/**
 * Light inheritance, the rules (prototype; see `supportIndex.ts`).
 *
 * The bake's own light for a detail is replaced by its support's, times a
 * constant per kind of face for what the support's bake cannot know: the
 * inside of a window's reveal or a parapet's inner face sees less sky than
 * the wall or roof it reads from. With the sun fixed and unknown to the
 * runtime, the factors are constants (`InheritanceShade`), tunable from the
 * URL while the prototype is judged.
 */

export interface InheritanceShade {
  /** Window faces that do not face out: jambs, lintel soffit, reveal. */
  windowReveal: number;
  /** Window faces that face up: the sill. */
  windowSill: number;
  /** Parapet faces that read from the roof without facing up: the inner side and the ends. */
  parapetInner: number;
  /** Faces that look down (parapet undersides). Almost never on screen. */
  underside: number;
}

export const DEFAULT_SHADE: InheritanceShade = {
  windowReveal: 0.6,
  windowSill: 0.85,
  parapetInner: 0.75,
  underside: 0.5,
};

/** How far behind a window's back plane its wall may be, in metres. */
export const WINDOW_REACH = 0.6;
/** How far from a parapet vertex its roof or facade may be, in metres. */
export const PARAPET_REACH = 2.5;
/** An outer parapet face and its facade are this parallel (cosine). */
const FACADE_ALIGN = 0.95;
/** A wall a window stands on faces the window's way at least this much (cosine). */
const WALL_ALIGN = 0.9;
/** A roof faces up at least this much (cosine). */
const ROOF_UP = 0.9;
/** Interpolated vs sampled UV at a face's centroid, in UV units: about 3 texels at 1024. */
const UV_AGREEMENT = 3 / 1024;

/** A face this close to its facade's plane is the facade's continuation, in metres. */
const COPLANAR = 0.1;

const isRoof = (_x: number, y: number) => y > ROOF_UP;

/** How far inside a parapet its roof-reading faces read the roof, in metres. */
const AWAY = 1;
const COMPASS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2],
];

type Filter = (x: number, y: number, z: number, key: string) => boolean;

/** The roof right below a point (within 0.2 m across, from 0.5 m above to 3 m below), or null. */
function roofBelow(index: SupportIndex, x: number, y: number, z: number, accept: Filter): SupportHit | null {
  const roof = index.nearest(x, y, z, 3, accept);
  return roof !== null && Math.hypot(roof.x - x, roof.z - z) < 0.2 && y - roof.y > -0.5 ? roof : null;
}

/** The roof below a point, or failing that the nearest roof within reach. */
function roofAt(index: SupportIndex, x: number, y: number, z: number, accept: Filter): SupportHit | null {
  return roofBelow(index, x, y, z, accept) ?? index.nearest(x, y, z, PARAPET_REACH, accept);
}


/**
 * The wall under a window: the nearest support triangle facing the window's
 * outward direction `(ox, oy, oz)` (unit, world), from the window's back-plane
 * centre `(x, y, z)`.
 */
export function sampleWindowWall(index: SupportIndex, x: number, y: number, z: number, ox: number, oy: number, oz: number): SupportHit | null {
  return index.nearest(x, y, z, WINDOW_REACH, (nx, ny, nz) => nx * ox + ny * oy + nz * oz > WALL_ALIGN);
}

/**
 * The shade of a window prototype face by its LOCAL unit normal; the
 * prototype faces out along local +Z (`facadeRecords.ts` turns it by yaw).
 */
export function windowFaceShade(_nx: number, ny: number, nz: number, shade: InheritanceShade): number {
  if (nz > 0.7) return 1;
  if (ny > 0.7) return shade.windowSill;
  if (ny < -0.7) return shade.underside;
  return shade.windowReveal;
}

export type ParapetFaceKind = 'top' | 'outer' | 'inner' | 'bottom';

export interface ParapetFaceLight {
  kind: ParapetFaceKind;
  key: string;
  /** uv per corner, 6 values. */
  uv: [number, number, number, number, number, number];
  shade: number;
  /** True when the three corners read one constant: the centroid's. */
  flat: boolean;
}

/**
 * Where one parapet triangle `p` (9 world floats) reads its light, or null
 * when no roof or facade is within reach.
 *
 * - Faces up: the roof under them.
 * - Vertical and parallel to a facade within reach: that facade, nearest
 *   point, which for the corners above the roof line is the facade's top edge.
 * - Any other vertical face (the inner side, the ends): the roof.
 * - Faces down: the roof, darkened.
 *
 * A face that reads the roof reads it `AWAY` inside the parapet, not at its
 * foot: the roof was baked with the parapet standing on it, and the strip at
 * the foot holds the parapet's own contact shadow (seen in the scene as a dark
 * outline on every roof, 2026-11-20). Inner faces look towards whichever
 * side has roof; top and bottom faces the first compass direction that does.
 *
 * Each corner samples its own point so long runs keep the roof's gradient;
 * if the corners land on different islands (their interpolation disagrees
 * with a direct sample at the centroid) the face takes the centroid's light.
 */
export function sampleParapetFace(index: SupportIndex, p: ArrayLike<number>, shade: InheritanceShade): ParapetFaceLight | null {
  const ex = p[3] - p[0], ey = p[4] - p[1], ez = p[5] - p[2];
  const fx = p[6] - p[0], fy = p[7] - p[1], fz = p[8] - p[2];
  let nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
  const length = Math.hypot(nx, ny, nz);
  if (length < 1e-12) return null;
  nx /= length; ny /= length; nz /= length;
  const cx = (p[0] + p[3] + p[6]) / 3, cy = (p[1] + p[4] + p[7]) / 3, cz = (p[2] + p[5] + p[8]) / 3;

  let kind: ParapetFaceKind;
  let centre: SupportHit | null;
  let filter: (x: number, y: number, z: number, key: string) => boolean;
  /** Horizontal offset from a point to where it reads the roof; zero for the facade. */
  let ax = 0, az = 0;
  if (ny > 0.7 || ny < -0.7) {
    kind = ny > 0 ? 'top' : 'bottom';
    filter = isRoof;
    const away = COMPASS.find(([dx, dz]) => roofBelow(index, cx + dx * AWAY, cy, cz + dz * AWAY, isRoof));
    if (away) { ax = away[0] * AWAY; az = away[1] * AWAY; }
    centre = roofAt(index, cx + ax, cy, cz + az, isRoof);
  } else {
    // The winding is not trusted: the parapets ship double-sided, and in the
    // scene faces whose normal pointed out of the roof read the roof's foot.
    // So a facade counts whichever way it faces, and the roof side is found
    // by looking both ways.
    const facing = (x: number, y: number, z: number) => Math.abs(x * nx + y * ny + z * nz) > FACADE_ALIGN;
    const facade = index.nearest(cx, cy, cz, PARAPET_REACH, facing);
    const coplanar = facade !== null &&
      Math.abs((cx - facade.x) * facade.nx + (cy - facade.y) * facade.ny + (cz - facade.z) * facade.nz) <= COPLANAR;
    const h = Math.hypot(nx, nz);
    const dx = nx / h, dz = nz / h;
    const side = roofBelow(index, cx + dx * AWAY, cy, cz + dz * AWAY, isRoof) ? 1
      : roofBelow(index, cx - dx * AWAY, cy, cz - dz * AWAY, isRoof) ? -1 : 0;
    if (coplanar || (facade && side === 0)) {
      kind = 'outer'; filter = facing; centre = facade;
    } else {
      kind = 'inner';
      filter = isRoof;
      ax = side * dx * AWAY; az = side * dz * AWAY;
      centre = roofAt(index, cx + ax, cy, cz + az, filter);
    }
  }
  if (!centre) return null;
  const key = centre.key;
  const own = (x: number, y: number, z: number, k: string) => k === key && filter(x, y, z, k);
  const corners: SupportHit[] = [];
  for (let c = 0; c < 3; c += 1) {
    const hit = kind === 'outer'
      ? index.nearest(p[c * 3], p[c * 3 + 1], p[c * 3 + 2], PARAPET_REACH, own)
      : roofAt(index, p[c * 3] + ax, p[c * 3 + 1], p[c * 3 + 2] + az, own);
    if (!hit) break;
    corners.push(hit);
  }
  let flat = corners.length < 3;
  if (!flat) {
    const mu = (corners[0].u + corners[1].u + corners[2].u) / 3;
    const mv = (corners[0].v + corners[1].v + corners[2].v) / 3;
    flat = Math.abs(mu - centre.u) > UV_AGREEMENT || Math.abs(mv - centre.v) > UV_AGREEMENT;
  }
  const uv: ParapetFaceLight['uv'] = flat
    ? [centre.u, centre.v, centre.u, centre.v, centre.u, centre.v]
    : [corners[0].u, corners[0].v, corners[1].u, corners[1].v, corners[2].u, corners[2].v];
  const factor = kind === 'bottom' ? shade.underside : kind === 'inner' ? shade.parapetInner : 1;
  return { kind, key, uv, shade: factor, flat };
}
