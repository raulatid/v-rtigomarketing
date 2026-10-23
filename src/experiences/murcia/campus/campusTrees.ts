import * as THREE from 'three';

/**
 * The park's trees, split out of the city's instanced vegetation.
 *
 * The campus's own tree meshes were retired into the city's GPU-instanced
 * trees (`CAMPUS_INSTANCED_TREE_NAMES`): one `InstancedMesh` per prototype for
 * the whole city. A tap and a hover light have to answer the park's trees
 * alone, and the highlight works by material — on a shared instanced mesh it
 * would light every tree in Murcia. So the park's instances move into meshes
 * of their own and leave the city's.
 *
 * An instance is the campus's when the campus's ground is straight below it.
 * Nothing is named: whatever instanced prop stands on that ground goes.
 *
 * Nothing moves on screen. Each new mesh shares its source's material, index
 * and vertex buffers, sits where the source sits, and takes its instances'
 * matrices and per-instance attributes (`_LIGHTMAP_ST`, `instanceColor`), so
 * each tree keeps its own rectangle of the atlas. The source keeps the rest,
 * compacted in order, with a smaller `count`.
 */

const HIGH_ABOVE = 1000;

export function splitCampusTrees(
  root: THREE.Object3D,
  ground: readonly THREE.Object3D[],
): THREE.InstancedMesh[] {
  if (ground.length === 0) return [];
  root.updateMatrixWorld(true);
  const footprint = new THREE.Box3();
  for (const node of ground) footprint.expandByObject(node);
  if (footprint.isEmpty()) return [];

  const sources: THREE.InstancedMesh[] = [];
  root.traverse((object) => {
    if ((object as THREE.InstancedMesh).isInstancedMesh) sources.push(object as THREE.InstancedMesh);
  });

  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, -1, 0);
  const instance = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const hits: THREE.Intersection[] = [];
  const standsOnCampus = (mesh: THREE.InstancedMesh, index: number): boolean => {
    mesh.getMatrixAt(index, instance);
    position.setFromMatrixPosition(instance.premultiply(mesh.matrixWorld));
    if (position.x < footprint.min.x || position.x > footprint.max.x) return false;
    if (position.z < footprint.min.z || position.z > footprint.max.z) return false;
    raycaster.set(position.setY(footprint.max.y + HIGH_ABOVE), down);
    hits.length = 0;
    raycaster.intersectObjects(ground as THREE.Object3D[], true, hits);
    return hits.length > 0;
  };

  const split: THREE.InstancedMesh[] = [];
  for (const source of sources) {
    const parent = source.parent;
    if (!parent) continue;
    const taken: number[] = [];
    const kept: number[] = [];
    for (let i = 0; i < source.count; i++) (standsOnCampus(source, i) ? taken : kept).push(i);
    if (taken.length === 0) continue;

    const geometry = new THREE.BufferGeometry();
    geometry.setIndex(source.geometry.index);
    for (const [name, attribute] of Object.entries(source.geometry.attributes)) {
      geometry.setAttribute(
        name,
        attribute instanceof THREE.InstancedBufferAttribute ? pick(attribute, taken) : attribute,
      );
    }
    for (const group of source.geometry.groups) geometry.addGroup(group.start, group.count, group.materialIndex);

    const mesh = new THREE.InstancedMesh(geometry, source.material, taken.length);
    mesh.name = `${source.name}__campus`;
    mesh.instanceMatrix.copyArray(pickArray(source.instanceMatrix, taken));
    if (source.instanceColor) mesh.instanceColor = pick(source.instanceColor, taken);
    mesh.position.copy(source.position);
    mesh.quaternion.copy(source.quaternion);
    mesh.scale.copy(source.scale);
    mesh.castShadow = source.castShadow;
    mesh.receiveShadow = source.receiveShadow;
    mesh.frustumCulled = source.frustumCulled;
    mesh.renderOrder = source.renderOrder;
    mesh.layers.mask = source.layers.mask;
    parent.add(mesh);
    mesh.updateMatrixWorld(true);
    split.push(mesh);

    compact(source.instanceMatrix, kept);
    if (source.instanceColor) compact(source.instanceColor, kept);
    for (const attribute of Object.values(source.geometry.attributes)) {
      if (attribute instanceof THREE.InstancedBufferAttribute) compact(attribute, kept);
    }
    source.count = kept.length;
    source.computeBoundingSphere();
    source.computeBoundingBox();
  }
  return split;
}

type InstanceAttribute = THREE.InstancedBufferAttribute;
type Floats = Float32Array;

function pickArray(attribute: InstanceAttribute, indices: readonly number[]): Floats {
  const size = attribute.itemSize;
  const from = attribute.array as Floats;
  // Same array type as the source: `_LIGHTMAP_ST` may arrive normalized.
  const out = new (from.constructor as new (length: number) => Floats)(indices.length * size);
  indices.forEach((index, i) => out.set(from.subarray(index * size, index * size + size), i * size));
  return out;
}

function pick(attribute: InstanceAttribute, indices: readonly number[]): THREE.InstancedBufferAttribute {
  return new THREE.InstancedBufferAttribute(
    pickArray(attribute, indices),
    attribute.itemSize,
    attribute.normalized,
    attribute.meshPerAttribute,
  );
}

/** The kept instances to the front, in order; the tail is left as it was. */
function compact(attribute: InstanceAttribute, kept: readonly number[]): void {
  attribute.array.set(pickArray(attribute, kept));
  attribute.needsUpdate = true;
}
