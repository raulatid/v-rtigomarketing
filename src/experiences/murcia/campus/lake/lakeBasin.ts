import * as THREE from 'three';
import type { LakeBasin } from '../particles/particleField';

/**
 * Reads the lake off the loaded campus: its centre at surface height and its
 * radius in the ground plane.
 *
 * The water node is ONE mesh holding every body of water on the site: the
 * central lake and the two pools by the entrance plaza. Its bounding box is
 * therefore the whole park, not the lake. So the vertices are bucketed into a
 * coarse ground-plane grid, the occupied cells are joined into islands, and
 * the island nearest the campus centre is the lake.
 *
 * Returns the mesh too, so a click can be tested against it. If the export
 * ever renames the node this returns `null` and the harness says so, rather
 * than guessing a lake.
 */
export function findLakeBasin(
  root: THREE.Object3D,
  waterNode: string,
): { basin: LakeBasin; mesh: THREE.Object3D } | null {
  const mesh = root.getObjectByName(waterNode);
  if (!mesh) return null;

  root.updateMatrixWorld(true);
  const campus = new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
  const points = worldVertices(mesh);
  if (points.length === 0) return null;

  const island = nearestIsland(points, campus);
  const box = new THREE.Box3().setFromPoints(island);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  center.y = box.max.y;

  return { mesh, basin: { center, radius: Math.max(size.x, size.z) * 0.5 } };
}

function worldVertices(object: THREE.Object3D): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  object.traverse((child) => {
    const geometry = (child as Partial<THREE.Mesh>).geometry;
    const position = geometry?.getAttribute('position');
    if (!position) return;
    for (let i = 0; i < position.count; i += 1) {
      out.push(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(child.matrixWorld));
    }
  });
  return out;
}

/** Cells per side of the clustering grid over the water's extent. */
const GRID = 48;

/**
 * The connected group of vertices nearest `near`, in the ground plane.
 *
 * Connectivity is 8-neighbour adjacency between occupied grid cells, which is
 * coarse enough that a mesh's triangles never split their own body of water
 * and fine enough that bodies a few cells apart stay separate.
 */
function nearestIsland(points: THREE.Vector3[], near: THREE.Vector3): THREE.Vector3[] {
  const bounds = new THREE.Box3().setFromPoints(points);
  const span = Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z) || 1;
  const cell = span / GRID;
  const key = (p: THREE.Vector3): number =>
    Math.floor((p.x - bounds.min.x) / cell) * (GRID + 2) + Math.floor((p.z - bounds.min.z) / cell);

  const cells = new Map<number, THREE.Vector3[]>();
  for (const p of points) {
    const k = key(p);
    const bucket = cells.get(k);
    if (bucket) bucket.push(p);
    else cells.set(k, [p]);
  }

  // Seed from the vertex nearest the campus centre, then flood outward.
  let seed = points[0]!;
  let best = Infinity;
  for (const p of points) {
    const d = (p.x - near.x) ** 2 + (p.z - near.z) ** 2;
    if (d < best) {
      best = d;
      seed = p;
    }
  }

  const island: THREE.Vector3[] = [];
  const queue = [key(seed)];
  const seen = new Set<number>(queue);
  while (queue.length > 0) {
    const k = queue.pop()!;
    const bucket = cells.get(k);
    if (!bucket) continue;
    island.push(...bucket);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dz = -1; dz <= 1; dz += 1) {
        const n = k + dx * (GRID + 2) + dz;
        if (!seen.has(n) && cells.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
  }
  return island;
}
