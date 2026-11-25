import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Derives what the water shader needs from the ribbon geometry alone: the bank
 * outline, and the overall direction the river runs in.
 *
 * WHY THIS EXISTS. The obvious source for "where is the bank" and "which way is
 * downstream" is the UV set, and `rio` ships a `TEXCOORD_0` attribute — so the
 * first version of this shader used it. Then the mesh was decoded and measured:
 * all 22 vertices carry the identical UV (0, 1). The attribute is present and
 * completely empty; the plane was never unwrapped.
 *
 * A UV-driven shader on that mesh does not fail loudly. It samples one constant
 * coordinate everywhere, which makes the whole river read as a single flat band
 * of "shore" with the current running due world-X. That looks like a shader bug
 * and is actually an export bug, and it would have cost a long time to find.
 *
 * So the outputs are computed here, from the only thing that is trustworthy —
 * the positions and the topology — and handed to the material:
 *
 *   bankSegments  the outline minus the two end caps, as local-space segments.
 *                 The fragment stage measures the exact distance to the nearest
 *                 one, so shore ramp and wall shadow are in METRES from the edge
 *                 and stay correct where the channel narrows or bends.
 *   axis          the river's overall direction, unsigned. Which end is upstream
 *                 is a coin toss a person has to call (`config.flowReversed`).
 *   channel       per-vertex channel coordinates — metres along the centre line
 *                 and metres across it — plus the local current direction. The
 *                 ripples are drawn in these so they follow every bend; drawn
 *                 along `axis` alone they ran straight across the bends, up to
 *                 ~55 degrees off the current in the west half of `rio`.
 *
 * Nothing is written onto the geometry here; `loadCity` sets `channel` as
 * attributes. The bank distance stays an outline test in the shader: the ribbon
 * has no interior vertices, so no per-vertex field could carry it.
 *
 * THE RIGHT LONG-TERM FIX IS STILL A PROPER UNWRAP IN BLENDER. Real UVs would
 * also unlock textured riverbed detail, which nothing here can synthesise.
 */

export interface RiverFrame {
  /** Estimated mean channel width, in world units, from area and perimeter. */
  width: number;
  /** Boundary edges classified as banks rather than end caps. */
  bankEdgeCount: number;
  capEdgeCount: number;
  /**
   * The bank edges as local-space segments, 6 floats each (x, y, z of one end,
   * then the other). Order-free: the shader takes the nearest, so no chain is
   * needed. Feed to `RioWater.setBankSegments`.
   */
  bankSegments: Float32Array;
  /** The overall river axis in local XZ, unit length. Feed to `setFlowAxis`. */
  axis: { x: number; z: number };
  /**
   * Channel coordinates for every vertex of the geometry passed in, or null
   * when no centre line could be traced. Set as the `riverCoord` and
   * `riverTangent` attributes and build the material with `followChannel`.
   */
  channel: RiverChannel | null;
  warnings: string[];
}

/**
 * The river's own coordinate system, sampled per vertex, local space.
 *
 * `coordinates` holds (along, across) per vertex: metres along the centre line,
 * increasing in the direction of `axis`, and signed metres from it, positive
 * towards (-tangent.z, tangent.x) — the shader's `acrossAxis`. `tangents` holds
 * the unit XZ direction of the centre line there. Two floats per vertex each,
 * in vertex order.
 *
 * Along is an arc length, not a rotation of the world plane, which is what lets
 * the pattern turn with the river without the shear a rotating frame produced
 * (see `uFlowAxis` in the fragment shader).
 */
export interface RiverChannel {
  coordinates: Float32Array;
  tangents: Float32Array;
}

/** Centre-line polyline, local XZ, with arc length and smoothed tangents. */
interface Centerline {
  x: number[];
  z: number[];
  s: number[];
  tx: number[];
  tz: number[];
  /**
   * Every bank vertex, with the centre-line point of the SHORTEST rung it
   * belongs to — its cross-section. Sampling a bank vertex there, rather than
   * at its nearest point on the centre line, keeps both ends of a cross-section
   * at the same `along`: on the inside of a bend the nearest point slides back
   * along the previous leg (~4 m at a 46 degree turn across 20 m).
   */
  anchors: Array<{ x: number; z: number; k: number }>;
}

type Triangle = readonly [number, number, number];

interface Edge {
  a: number;
  b: number;
}

export function computeRiverFrame(geometry: THREE.BufferGeometry): RiverFrame {
  const position = geometry.getAttribute('position');
  if (!position) {
    return {
      width: 0, bankEdgeCount: 0, capEdgeCount: 0,
      bankSegments: new Float32Array(0), axis: { x: 1, z: 0 }, channel: null,
      warnings: ['No position attribute.'],
    };
  }
  // Colour/UV seams split glTF vertices without splitting the physical river.
  // Recover positional connectivity for measurement only; leave render data intact.
  const topology = new THREE.BufferGeometry();
  topology.setAttribute('position', position);
  topology.setIndex(geometry.index);
  const connected = mergeVertices(topology, 1e-4);
  try {
    const { centerline, ...frame } = computeConnectedRiverFrame(connected);
    // Sampled on the ORIGINAL vertices, by position, so seam duplicates get the
    // same values and the arrays line up with the render data.
    return { ...frame, channel: centerline ? sampleChannel(position, centerline) : null };
  } finally { connected.dispose(); topology.dispose(); }
}

function computeConnectedRiverFrame(
  geometry: THREE.BufferGeometry,
): Omit<RiverFrame, 'channel'> & { centerline: Centerline | null } {
  const warnings: string[] = [];
  const position = geometry.getAttribute('position')!;

  const count = position.count;
  const x = new Float64Array(count);
  const z = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    x[i] = position.getX(i);
    z[i] = position.getZ(i);
  }

  const triangles = readTriangles(geometry, count);

  // ---- Channel width, from area and perimeter ---------------------------
  // For a long thin ribbon of length L and width W, the area is L*W and the
  // boundary is about 2L. So W is roughly 2*area/perimeter. Both inputs are
  // measured directly, which keeps this free of any assumption about which way
  // the river runs.
  let totalArea = 0;
  for (const t of triangles) {
    totalArea += triangleArea(x, z, t[0], t[1], t[2]);
  }

  const boundary = findBoundaryEdges(triangles);
  let boundaryLength = 0;
  for (const edge of boundary) {
    boundaryLength += Math.hypot(x[edge.a]! - x[edge.b]!, z[edge.a]! - z[edge.b]!);
  }

  const width = boundaryLength > 0 ? (2 * totalArea) / boundaryLength : 0;

  if (boundary.length === 0) {
    warnings.push('The rio mesh has no boundary edges — it is closed. No banks can be found.');
  }

  // ---- Overall axis ------------------------------------------------------
  const axis = principalAxis(x, z, count);

  // ---- Bank vs. cap ------------------------------------------------------
  // The banks run WITH the current; the two end caps run ACROSS it. They have to
  // be told apart, because a cap edge spanning the full channel would otherwise
  // sit in the bank set and pull the distance field sideways near the river
  // mouth.
  //
  // The outline of a ribbon is ONE closed loop, and cutting any two of its edges
  // always leaves exactly two chains — so "did I get two chains" proves nothing
  // about where the cut fell, and neither does perpendicularity (both most-
  // perpendicular edges once landed at the same end). What identifies the caps
  // is AGREEMENT with the measured width: the mean distance from every vertex to
  // the two chains equals the width from area/perimeter only when the chains
  // are the two sides of the river. Two independent measurements agreeing is
  // hard to satisfy by accident. Every pair is tried — 22 edges, a couple of
  // hundred cheap splits, once, at load.
  let bankEdges: Edge[] = boundary;
  let chains: Edge[][] = [];
  let bestError = Infinity;
  const targetHalfWidth = width * 0.5;

  for (let i = 0; i < boundary.length; i++) {
    for (let j = i + 1; j < boundary.length; j++) {
      const candidate = boundary.filter((_, k) => k !== i && k !== j);
      const candidateChains = splitBankChains(candidate);
      if (candidateChains.length !== 2) continue;

      const mean = meanHalfWidthFor(candidateChains, count, x, z);
      const error = Math.abs(mean - targetHalfWidth);
      if (error < bestError) {
        bestError = error;
        bankEdges = candidate;
        chains = candidateChains;
      }
    }
  }

  const capEdgeCount = boundary.length - bankEdges.length;

  if (boundary.length > 0 && chains.length !== 2) {
    warnings.push(
      'No pair of boundary edges split the outline into two banks. Check whether the ' +
        'river forks or the mesh is more than one ribbon.',
    );
  } else if (chains.length === 2) {
    const a = chains[0]!.length;
    const b = chains[1]!.length;
    // The banks of a ribbon have near-identical edge counts. Anything lopsided
    // means the cut missed an end, and it is silent unless something says so.
    if (Math.min(a, b) / Math.max(a, b) < 0.6) {
      warnings.push(
        `The two banks came out lopsided (${a} edges vs ${b}). The cut probably missed one ` +
          'end of the river, so a cap edge is being treated as bank.',
      );
    }
  }

  const centerline = chains.length === 2 ? buildCenterline(chains[0]!, chains[1]!, x, z, axis) : null;
  if (chains.length === 2 && !centerline) {
    warnings.push(
      'The banks are not two open chains, so no centre line was traced. The ripples fall ' +
        'back to the overall axis and run straight across the bends.',
    );
  }

  const bankSegments = new Float32Array(bankEdges.length * 6);
  bankEdges.forEach((edge, i) => {
    bankSegments[i * 6] = position.getX(edge.a);
    bankSegments[i * 6 + 1] = position.getY(edge.a);
    bankSegments[i * 6 + 2] = position.getZ(edge.a);
    bankSegments[i * 6 + 3] = position.getX(edge.b);
    bankSegments[i * 6 + 4] = position.getY(edge.b);
    bankSegments[i * 6 + 5] = position.getZ(edge.b);
  });

  return {
    width,
    bankEdgeCount: bankEdges.length,
    capEdgeCount,
    bankSegments,
    axis,
    centerline,
    warnings,
  };
}

/**
 * Traces the centre line between the two banks.
 *
 * Each bank is walked end to end, both in the direction of `axis`, and the two
 * walks are zipped together — always stepping the bank whose next vertex makes
 * the shorter rung, the way a strip between two contours is stitched. The rung
 * midpoints, in order, are the centre line; it starts and ends on the caps.
 */
function buildCenterline(
  bankA: Edge[],
  bankB: Edge[],
  x: Float64Array,
  z: Float64Array,
  axis: { x: number; z: number },
): Centerline | null {
  const a = orderChain(bankA, x, z, axis);
  const b = orderChain(bankB, x, z, axis);
  if (!a || !b) return null;

  const rung = (i: number, j: number) => Math.hypot(x[a[i]!]! - x[b[j]!]!, z[a[i]!]! - z[b[j]!]!);
  const cx: number[] = [];
  const cz: number[] = [];
  // Per bank vertex: the shortest rung seen so far, and its centre-line index.
  const shortest = new Map<number, { length: number; k: number }>();
  const push = (i: number, j: number) => {
    const px = (x[a[i]!]! + x[b[j]!]!) * 0.5;
    const pz = (z[a[i]!]! + z[b[j]!]!) * 0.5;
    const last = cx.length - 1;
    if (last < 0 || Math.hypot(px - cx[last]!, pz - cz[last]!) >= 1e-6) {
      cx.push(px);
      cz.push(pz);
    }
    const length = rung(i, j);
    for (const v of [a[i]!, b[j]!]) {
      const seen = shortest.get(v);
      if (!seen || length < seen.length) shortest.set(v, { length, k: cx.length - 1 });
    }
  };

  let i = 0;
  let j = 0;
  push(i, j);
  while (i < a.length - 1 || j < b.length - 1) {
    if (i === a.length - 1) j += 1;
    else if (j === b.length - 1) i += 1;
    else if (rung(i + 1, j) <= rung(i, j + 1)) i += 1;
    else j += 1;
    push(i, j);
  }
  if (cx.length < 2) return null;

  const count = cx.length;
  const s = [0];
  const dx: number[] = [];
  const dz: number[] = [];
  for (let k = 0; k < count - 1; k++) {
    const length = Math.hypot(cx[k + 1]! - cx[k]!, cz[k + 1]! - cz[k]!);
    s.push(s[k]! + length);
    dx.push((cx[k + 1]! - cx[k]!) / length);
    dz.push((cz[k + 1]! - cz[k]!) / length);
  }

  // At each vertex, the bisector of the two segments meeting there; the ends
  // take their one segment. Interpolated along each segment when sampled, so
  // the current direction turns smoothly through a bend instead of stepping.
  const tx: number[] = [];
  const tz: number[] = [];
  for (let k = 0; k < count; k++) {
    let vx = (dx[k - 1] ?? 0) + (dx[k] ?? 0);
    let vz = (dz[k - 1] ?? 0) + (dz[k] ?? 0);
    if (Math.hypot(vx, vz) < 1e-9) {
      // A full reversal has no bisector: take the incoming segment.
      vx = dx[k - 1] ?? dx[k]!;
      vz = dz[k - 1] ?? dz[k]!;
    }
    const length = Math.hypot(vx, vz);
    tx.push(vx / length);
    tz.push(vz / length);
  }

  const anchors = [...shortest].map(([v, { k }]) => ({ x: x[v]!, z: z[v]!, k }));
  return { x: cx, z: cz, s, tx, tz, anchors };
}

/**
 * A bank's vertices in order, from the end lying furthest back along `axis`.
 * Null unless the chain is a single open path: a loop or a fork has no order.
 */
function orderChain(
  chain: Edge[],
  x: Float64Array,
  z: Float64Array,
  axis: { x: number; z: number },
): number[] | null {
  const neighbours = new Map<number, number[]>();
  for (const { a, b } of chain) {
    for (const [p, q] of [[a, b], [b, a]] as const) {
      const list = neighbours.get(p);
      if (list) list.push(q);
      else neighbours.set(p, [q]);
    }
  }

  const lists = [...neighbours.values()];
  if (lists.some((list) => list.length > 2)) return null;
  const ends = [...neighbours].filter(([, list]) => list.length === 1).map(([v]) => v);
  if (ends.length !== 2) return null;

  const order = [ends[0]!];
  let previous = -1;
  while (order.length < neighbours.size) {
    const current = order[order.length - 1]!;
    const next = neighbours.get(current)!.find((v) => v !== previous);
    if (next === undefined) break;
    previous = current;
    order.push(next);
  }
  if (order.length !== neighbours.size) return null;

  const first = order[0]!;
  const last = order[order.length - 1]!;
  const run = (x[last]! - x[first]!) * axis.x + (z[last]! - z[first]!) * axis.z;
  return run < 0 ? order.reverse() : order;
}

/**
 * Samples the channel at every vertex: bank vertices at their cross-section
 * (`Centerline.anchors`), anything else at its nearest point on the centre
 * line. See `RiverChannel`.
 */
function sampleChannel(
  position: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  line: Centerline,
): RiverChannel {
  const coordinates = new Float32Array(position.count * 2);
  const tangents = new Float32Array(position.count * 2);
  const last = line.x.length - 1;
  // Centre-line point `k + t` (t in 0..1 towards k + 1), tangent re-normalised.
  const at = (k: number, t: number) => {
    const n = Math.min(k + 1, last);
    const tx = line.tx[k]! + (line.tx[n]! - line.tx[k]!) * t;
    const tz = line.tz[k]! + (line.tz[n]! - line.tz[k]!) * t;
    const length = Math.hypot(tx, tz) || 1;
    return {
      x: line.x[k]! + (line.x[n]! - line.x[k]!) * t,
      z: line.z[k]! + (line.z[n]! - line.z[k]!) * t,
      s: line.s[k]! + (line.s[n]! - line.s[k]!) * t,
      tx: tx / length,
      tz: tz / length,
    };
  };

  for (let v = 0; v < position.count; v++) {
    const px = position.getX(v);
    const pz = position.getZ(v);

    // The merge that found the banks welded within 1e-4; match well inside that.
    const anchor = line.anchors.find((a) => Math.hypot(a.x - px, a.z - pz) < 1e-3);
    let point;
    if (anchor) {
      point = at(anchor.k, 0);
    } else {
      // Nearest point on the polyline: its segment and the parameter along it.
      let nearest = Infinity;
      let k = 0;
      let t = 0;
      for (let seg = 0; seg < last; seg++) {
        const abx = line.x[seg + 1]! - line.x[seg]!;
        const abz = line.z[seg + 1]! - line.z[seg]!;
        const u = Math.max(
          0,
          Math.min(1, ((px - line.x[seg]!) * abx + (pz - line.z[seg]!) * abz) / (abx * abx + abz * abz)),
        );
        const d = Math.hypot(px - (line.x[seg]! + abx * u), pz - (line.z[seg]! + abz * u));
        if (d < nearest) {
          nearest = d;
          k = seg;
          t = u;
        }
      }
      point = at(k, t);
    }

    coordinates[v * 2] = point.s;
    coordinates[v * 2 + 1] = (px - point.x) * -point.tz + (pz - point.z) * point.tx;
    tangents[v * 2] = point.tx;
    tangents[v * 2 + 1] = point.tz;
  }

  return { coordinates, tangents };
}

/** Dominant direction of the vertex cloud in the XZ plane, as a unit vector. */
function principalAxis(x: Float64Array, z: Float64Array, count: number): { x: number; z: number } {
  let meanX = 0;
  let meanZ = 0;
  for (let i = 0; i < count; i++) {
    meanX += x[i]!;
    meanZ += z[i]!;
  }
  meanX /= Math.max(count, 1);
  meanZ /= Math.max(count, 1);

  // 2x2 covariance. Its dominant eigenvector is the principal axis; at this size
  // the closed form is exact and far cheaper than iterating.
  let xx = 0;
  let xz = 0;
  let zz = 0;
  for (let i = 0; i < count; i++) {
    const dx = x[i]! - meanX;
    const dz = z[i]! - meanZ;
    xx += dx * dx;
    xz += dx * dz;
    zz += dz * dz;
  }

  const trace = xx + zz;
  const det = xx * zz - xz * xz;
  const discriminant = Math.max(0, (trace * trace) / 4 - det);
  const eigenvalue = trace / 2 + Math.sqrt(discriminant);

  let vx = eigenvalue - zz;
  let vz = xz;
  if (Math.hypot(vx, vz) < 1e-12) {
    vx = xz;
    vz = eigenvalue - xx;
  }
  const length = Math.hypot(vx, vz);
  if (length < 1e-12) return { x: 1, z: 0 };
  return { x: vx / length, z: vz / length };
}

function readTriangles(geometry: THREE.BufferGeometry, vertexCount: number): Triangle[] {
  const index = geometry.getIndex();
  const triangles: Triangle[] = [];
  const count = index ? index.count : vertexCount;

  for (let t = 0; t + 2 < count; t += 3) {
    const a = index ? index.getX(t) : t;
    const b = index ? index.getX(t + 1) : t + 1;
    const c = index ? index.getX(t + 2) : t + 2;
    if (a < vertexCount && b < vertexCount && c < vertexCount) triangles.push([a, b, c] as const);
  }
  return triangles;
}

/**
 * Edges used by exactly one triangle — the outline of the ribbon.
 *
 * Keyed on the sorted vertex pair, so the same edge reached from either of its
 * two triangles collapses onto one entry.
 */
function findBoundaryEdges(triangles: Triangle[]): Edge[] {
  const uses = new Map<string, { edge: Edge; count: number }>();

  for (const [a, b, c] of triangles) {
    for (const [p, q] of [[a, b], [b, c], [c, a]] as const) {
      const key = p < q ? `${p}_${q}` : `${q}_${p}`;
      const existing = uses.get(key);
      if (existing) existing.count += 1;
      else uses.set(key, { edge: { a: p, b: q }, count: 1 });
    }
  }

  const boundary: Edge[] = [];
  for (const { edge, count } of uses.values()) {
    if (count === 1) boundary.push(edge);
  }
  return boundary;
}

/**
 * Splits the bank edges into connected chains — normally the left bank and the
 * right bank, in some order. Which is which does not matter. The two caps
 * having already been removed is what makes the split work — with them still
 * in, the outline is one closed loop and this would return a single chain.
 */
function splitBankChains(bankEdges: Edge[]): Edge[][] {
  const byVertex = new Map<number, number[]>();
  bankEdges.forEach((edge, i) => {
    for (const v of [edge.a, edge.b]) {
      const list = byVertex.get(v);
      if (list) list.push(i);
      else byVertex.set(v, [i]);
    }
  });

  const seen = new Array<boolean>(bankEdges.length).fill(false);
  const chains: Edge[][] = [];

  for (let start = 0; start < bankEdges.length; start++) {
    if (seen[start]) continue;

    const chain: Edge[] = [];
    const stack = [start];
    seen[start] = true;

    while (stack.length > 0) {
      const i = stack.pop()!;
      const edge = bankEdges[i]!;
      chain.push(edge);

      for (const v of [edge.a, edge.b]) {
        for (const j of byVertex.get(v) ?? []) {
          if (seen[j]) continue;
          seen[j] = true;
          stack.push(j);
        }
      }
    }

    chains.push(chain);
  }

  // Largest first, so a stray fragment cannot displace a real bank from the two
  // slots that get used.
  chains.sort((a, b) => b.length - a.length);
  return chains;
}

/**
 * Mean of `(dLeft + dRight) / 2` over every vertex — the channel half-width the
 * candidate split implies. Compared against the half-width from area and
 * perimeter to choose where to cut the outline.
 */
function meanHalfWidthFor(
  chains: Edge[][],
  count: number,
  x: Float64Array,
  z: Float64Array,
): number {
  const left = chains[0] ?? [];
  const right = chains[1] ?? [];
  if (left.length === 0 || right.length === 0) return Infinity;

  let total = 0;
  for (let i = 0; i < count; i++) {
    const dLeft = distanceToChain(x[i]!, z[i]!, left, x, z);
    const dRight = distanceToChain(x[i]!, z[i]!, right, x, z);
    if (!Number.isFinite(dLeft) || !Number.isFinite(dRight)) return Infinity;
    total += (dLeft + dRight) * 0.5;
  }
  return total / count;
}

/** Shortest distance from a point to any segment of a chain, in the XZ plane. */
function distanceToChain(
  px: number,
  pz: number,
  chain: Edge[],
  x: Float64Array,
  z: Float64Array,
): number {
  let nearest = Infinity;
  for (const edge of chain) {
    const d = pointSegmentDistance(px, pz, x[edge.a]!, z[edge.a]!, x[edge.b]!, z[edge.b]!);
    if (d < nearest) nearest = d;
  }
  return nearest;
}

function pointSegmentDistance(
  px: number, pz: number,
  ax: number, az: number,
  bx: number, bz: number,
): number {
  const abx = bx - ax;
  const abz = bz - az;
  const lengthSq = abx * abx + abz * abz;
  if (lengthSq < 1e-12) return Math.hypot(px - ax, pz - az);

  // Clamped, so a point past either end measures to the endpoint rather than to
  // the infinite line.
  let t = ((px - ax) * abx + (pz - az) * abz) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + abx * t), pz - (az + abz * t));
}

function triangleArea(x: Float64Array, z: Float64Array, a: number, b: number, c: number): number {
  const e1x = x[b]! - x[a]!;
  const e1z = z[b]! - z[a]!;
  const e2x = x[c]! - x[a]!;
  const e2z = z[c]! - z[a]!;
  return Math.abs(e1x * e2z - e1z * e2x) * 0.5;
}
