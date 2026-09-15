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
 * So the two outputs are computed here, from the only thing that is trustworthy —
 * the positions and the topology — and handed to the material as uniforms:
 *
 *   bankSegments  the outline minus the two end caps, as local-space segments.
 *                 The fragment stage measures the exact distance to the nearest
 *                 one, so shore ramp and wall shadow are in METRES from the edge
 *                 and stay correct where the channel narrows or bends.
 *   axis          the river's overall direction, unsigned. Which end is upstream
 *                 is a coin toss a person has to call (`config.flowReversed`).
 *
 * Nothing is written onto the geometry: the ribbon has no interior vertices, so
 * no per-vertex field could carry a bank distance anyway.
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
  warnings: string[];
}

type Triangle = readonly [number, number, number];

interface Edge {
  a: number;
  b: number;
}

export function computeRiverFrame(geometry: THREE.BufferGeometry): RiverFrame {
  if (!geometry.getAttribute('position')) return computeConnectedRiverFrame(geometry);
  // Colour/UV seams split glTF vertices without splitting the physical river.
  // Recover positional connectivity for measurement only; leave render data intact.
  const topology = new THREE.BufferGeometry();
  topology.setAttribute('position', geometry.getAttribute('position'));
  topology.setIndex(geometry.index);
  const connected = mergeVertices(topology, 1e-4);
  try { return computeConnectedRiverFrame(connected); }
  finally { connected.dispose(); topology.dispose(); }
}

function computeConnectedRiverFrame(geometry: THREE.BufferGeometry): RiverFrame {
  const warnings: string[] = [];
  const position = geometry.getAttribute('position');

  if (!position) {
    return {
      width: 0, bankEdgeCount: 0, capEdgeCount: 0,
      bankSegments: new Float32Array(0), axis: { x: 1, z: 0 },
      warnings: ['No position attribute.'],
    };
  }

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
    warnings,
  };
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
