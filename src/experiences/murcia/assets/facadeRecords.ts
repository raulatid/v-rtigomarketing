import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LIGHTMAP_ST_ATTRIBUTE } from './lightmaps/lightmapMaterial';

/**
 * The city's windows, stored as facades instead of one transform each.
 *
 * Almost every window stands in a regular grid on a wall: same turn, evenly
 * spaced along the wall and up it. The export writes one record per grid
 * instead of a translation, rotation and lightmap rectangle per window, and
 * this rebuilds the `InstancedMesh` that `EXT_mesh_gpu_instancing` would have
 * given. A window that fits no grid is a grid of one.
 *
 * A node carries, in `extras`:
 * - `facade_records_accessor`: a float accessor, {@link FACADE_RECORD_STRIDE}
 *   values per record, in glTF space: `x, y, z, yaw, colStep, rowStep, cols, rows`.
 *   Window `(i, j)` stands at the origin plus `i * colStep` along
 *   `(cos yaw, 0, -sin yaw)` and `j * rowStep` up, turned `yaw` about +Y;
 * - `instance_count`: the windows all records add up to;
 * - either `instance_st_grid`: `[cells, pad, first]`. The windows take consecutive
 *   cells of a `cells × cells` grid in the atlas from `first`, row-major from
 *   the atlas's bottom-left in Blender's UV, with `pad` on each side;
 * - or `light_inheritance: "window"` and no grid: the windows have no cells
 *   and take the light of their wall (`lightmaps/inheritLight.ts`).
 *
 * The node arrives as a plain mesh of the prototype; it leaves as an
 * `InstancedMesh` with its own geometry, sharing the prototype's buffers. With
 * a grid it also gets `userData.instance_st_builtin`, so the lightmap loader
 * takes the ST that is already there. Runs before anything else looks at the scene.
 */
export const FACADE_RECORD_STRIDE = 8;

export async function expandFacadeRecords(gltf: GLTF): Promise<THREE.InstancedMesh[]> {
  const targets: THREE.Mesh[] = [];
  gltf.scene.traverse((object) => {
    if ((object as THREE.Mesh).isMesh && object.userData.facade_records_accessor !== undefined) targets.push(object as THREE.Mesh);
  });
  const expanded: THREE.InstancedMesh[] = [];
  for (const mesh of targets) {
    const { facade_records_accessor: accessor, instance_count: count, instance_st_grid: grid } = mesh.userData;
    const inherits = mesh.userData.light_inheritance === 'window';
    const gridValid = Array.isArray(grid) && grid.length === 3 && grid.every(Number.isFinite);
    if (!Number.isInteger(accessor) || accessor < 0 || !Number.isInteger(count) || count <= 0 ||
        (inherits ? grid !== undefined : !gridValid)) {
      throw new Error(`[facades] invalid record contract: ${mesh.name}`);
    }
    const records = await gltf.parser.getDependency('accessor', accessor) as THREE.BufferAttribute;
    const instanced = buildFacadeInstances(mesh, records.array as ArrayLike<number>, count, inherits ? null : grid as [number, number, number]);
    mesh.parent!.add(instanced);
    mesh.removeFromParent();
    expanded.push(instanced);
  }
  return expanded;
}

/** The matrices, and with a grid the lightmap rectangles, of one node's windows. Exported for tests. */
export function buildFacadeInstances(
  mesh: THREE.Mesh, records: ArrayLike<number>, count: number, grid: [number, number, number] | null,
): THREE.InstancedMesh {
  const [cells, pad, first] = grid ?? [1, 0, 0];
  if (records.length % FACADE_RECORD_STRIDE !== 0) throw new Error(`[facades] ragged records: ${mesh.name}`);
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) geometry.setAttribute(name, attribute);
  geometry.setIndex(mesh.geometry.index);
  for (const group of mesh.geometry.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  const instanced = new THREE.InstancedMesh(geometry, mesh.material, count);
  const st = new Float32Array(grid ? count * 4 : 0);
  const step = 1 / cells;
  const size = step - 2 * pad;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const unit = new THREE.Vector3(1, 1, 1);
  const up = new THREE.Vector3(0, 1, 0);
  let k = 0;
  for (let r = 0; r < records.length; r += FACADE_RECORD_STRIDE) {
    const x = records[r], y = records[r + 1], z = records[r + 2], yaw = records[r + 3];
    const colStep = records[r + 4], rowStep = records[r + 5], cols = records[r + 6], rows = records[r + 7];
    const dx = Math.cos(yaw), dz = -Math.sin(yaw);
    rotation.setFromAxisAngle(up, yaw);
    for (let j = 0; j < rows; j += 1) {
      for (let i = 0; i < cols; i += 1) {
        if (k >= count) throw new Error(`[facades] more windows than instance_count: ${mesh.name}`);
        position.set(x + i * colStep * dx, y + j * rowStep, z + i * colStep * dz);
        instanced.setMatrixAt(k, matrix.compose(position, rotation, unit));
        if (grid) {
          const cell = first + k;
          const u = (cell % cells) * step + pad;
          const v = Math.floor(cell / cells) * step + pad;
          // Blender's UV runs up from the bottom; glTF's runs down from the top.
          st.set([size, size, u, 1 - size - v], k * 4);
        }
        k += 1;
      }
    }
  }
  if (k !== count) throw new Error(`[facades] ${k} windows for an instance_count of ${count}: ${mesh.name}`);
  instanced.name = mesh.name;
  if (grid) {
    geometry.setAttribute(LIGHTMAP_ST_ATTRIBUTE, new THREE.InstancedBufferAttribute(st, 4));
    instanced.userData = { ...mesh.userData, instance_st_builtin: true };
  } else {
    instanced.userData = { ...mesh.userData };
  }
  instanced.position.copy(mesh.position);
  instanced.quaternion.copy(mesh.quaternion);
  instanced.scale.copy(mesh.scale);
  instanced.castShadow = mesh.castShadow;
  instanced.receiveShadow = mesh.receiveShadow;
  instanced.frustumCulled = mesh.frustumCulled;
  instanced.computeBoundingBox();
  instanced.computeBoundingSphere();
  return instanced;
}
