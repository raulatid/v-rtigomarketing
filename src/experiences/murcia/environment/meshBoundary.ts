import * as THREE from 'three';

/** A closed boundary loop in world space, ordered, without a repeated end point. */
export type BoundaryLoop = THREE.Vector3[];

export interface BoundaryResult {
  loops: BoundaryLoop[];
  warnings: string[];
}

/**
 * Extracts the open boundary loops of a mesh — the edges belonging to exactly
 * one triangle — in world space.
 *
 * Vertices are welded by position first. A GLB splits vertices wherever normals
 * or UVs differ, so raw index comparison reports seams as boundaries and the
 * real outline never closes.
 *
 * Loops come back ordered and de-duplicated; caller decides which is the outer
 * one (see `signedAreaXZ`).
 */
export function extractBoundaryLoops(
  mesh: THREE.Mesh,
  weldEpsilon = 1e-3,
): BoundaryResult {
  const warnings: string[] = [];
  const geometry = mesh.geometry;
  const position = geometry.getAttribute('position');
  if (!position) {
    return { loops: [], warnings: ['Terrain geometry has no position attribute.'] };
  }

  mesh.updateWorldMatrix(true, false);
  const matrix = mesh.matrixWorld;

  // --- Weld by position ---------------------------------------------------
  const world: THREE.Vector3[] = [];
  const canonical = new Int32Array(position.count);
  const lookup = new Map<string, number>();
  const v = new THREE.Vector3();
  const inverseEpsilon = 1 / weldEpsilon;

  for (let i = 0; i < position.count; i += 1) {
    v.fromBufferAttribute(position, i).applyMatrix4(matrix);
    const key =
      `${Math.round(v.x * inverseEpsilon)},` +
      `${Math.round(v.y * inverseEpsilon)},` +
      `${Math.round(v.z * inverseEpsilon)}`;
    const existing = lookup.get(key);
    if (existing === undefined) {
      const id = world.length;
      lookup.set(key, id);
      world.push(v.clone());
      canonical[i] = id;
    } else {
      canonical[i] = existing;
    }
  }

  // --- Count undirected edges, remember direction -------------------------
  const index = geometry.getIndex();
  const triangleCount = index ? index.count / 3 : position.count / 3;
  const edgeCount = new Map<string, number>();
  const directed: Array<[number, number]> = [];

  const vertexAt = (corner: number): number => {
    const raw = index ? index.getX(corner) : corner;
    return canonical[raw]!;
  };

  for (let t = 0; t < triangleCount; t += 1) {
    const a = vertexAt(t * 3);
    const b = vertexAt(t * 3 + 1);
    const c = vertexAt(t * 3 + 2);
    if (a === b || b === c || c === a) continue; // degenerate after welding
    for (const [from, to] of [
      [a, b],
      [b, c],
      [c, a],
    ] as Array<[number, number]>) {
      const key = from < to ? `${from}_${to}` : `${to}_${from}`;
      edgeCount.set(key, (edgeCount.get(key) ?? 0) + 1);
      directed.push([from, to]);
    }
  }

  // --- Keep the directed edges that are unshared --------------------------
  const nextVertex = new Map<number, number>();
  let forks = 0;
  for (const [from, to] of directed) {
    const key = from < to ? `${from}_${to}` : `${to}_${from}`;
    if (edgeCount.get(key) !== 1) continue;
    if (nextVertex.has(from)) {
      forks += 1;
      continue;
    }
    nextVertex.set(from, to);
  }

  if (forks > 0) {
    warnings.push(
      `Terrain boundary has ${forks} pinch point(s) where edges fork; loops may be approximate.`,
    );
  }

  // --- Walk loops ----------------------------------------------------------
  const loops: BoundaryLoop[] = [];
  const visited = new Set<number>();

  for (const start of nextVertex.keys()) {
    if (visited.has(start)) continue;

    const loop: BoundaryLoop = [];
    let current = start;
    // Bounded so a malformed graph cannot spin forever.
    for (let guard = 0; guard <= nextVertex.size; guard += 1) {
      if (visited.has(current)) break;
      visited.add(current);
      loop.push(world[current]!);
      const next = nextVertex.get(current);
      if (next === undefined) break;
      current = next;
      if (current === start) break;
    }

    if (loop.length >= 3) loops.push(loop);
  }

  if (loops.length === 0) {
    warnings.push('Terrain mesh has no open boundary (it may be a closed solid).');
  }

  loops.sort((a, b) => Math.abs(signedAreaXZ(b)) - Math.abs(signedAreaXZ(a)));
  return { loops, warnings };
}

/** Signed area on the XZ plane. Positive is counter-clockwise seen from +Y. */
export function signedAreaXZ(loop: BoundaryLoop): number {
  let sum = 0;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
    const a = loop[j]!;
    const b = loop[i]!;
    sum += a.x * b.z - b.x * a.z;
  }
  return sum / 2;
}

/**
 * Moves each loop vertex along its inward bisector.
 *
 * Only meant for small distances — a large offset self-intersects at any
 * concave feature narrower than the offset. Used here purely to tuck the collar
 * a fraction of a unit under the plate so the join has no hairline gap.
 */
export function offsetLoopInward(loop: BoundaryLoop, amount: number): BoundaryLoop {
  if (amount === 0) return loop.map((p) => p.clone());

  // Outward is to the right of travel for a CCW loop seen from +Y.
  const winding = signedAreaXZ(loop) >= 0 ? 1 : -1;
  const result: BoundaryLoop = [];

  for (let i = 0; i < loop.length; i += 1) {
    const previous = loop[(i - 1 + loop.length) % loop.length]!;
    const current = loop[i]!;
    const next = loop[(i + 1) % loop.length]!;

    const inX = normalizedNormalX(current, next) + normalizedNormalX(previous, current);
    const inZ = normalizedNormalZ(current, next) + normalizedNormalZ(previous, current);
    const length = Math.hypot(inX, inZ);

    if (length < 1e-6) {
      result.push(current.clone());
      continue;
    }
    // Negated because the edge normal below points outward for a CCW loop.
    result.push(
      new THREE.Vector3(
        current.x - (inX / length) * amount * winding,
        current.y,
        current.z - (inZ / length) * amount * winding,
      ),
    );
  }

  return result;
}

function normalizedNormalX(a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  return length < 1e-9 ? 0 : dz / length;
}

function normalizedNormalZ(a: THREE.Vector3, b: THREE.Vector3): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  return length < 1e-9 ? 0 : -dx / length;
}
