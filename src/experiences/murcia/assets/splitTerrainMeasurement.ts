import * as THREE from 'three';
import { meanVertexColour } from './lightmaps/attachGroundLightmaps';

/** A hidden bounds template for the skirt; the five authored ground parts render normally.
 * Only eight points are needed: the transition consumes the box, not surface topology.
 * This never fills the river channel or merges the visible meshes.
 */
export function splitTerrainMeasurement(group: THREE.Object3D): THREE.Mesh | null {
  const existing = group.children.find(child => child.userData.terrainMeasurement) as THREE.Mesh | undefined;
  if (existing) return existing;
  const parts = group.children.filter(child => (child as THREE.Mesh).isMesh &&
    String(child.userData.lightmap_atlas).startsWith('ground-')) as THREE.Mesh[];
  if (!parts.length) return null;
  group.updateWorldMatrix(true, true);
  const inverse = group.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  for (const part of parts) {
    part.geometry.computeBoundingBox();
    box.union(part.geometry.boundingBox!.clone().applyMatrix4(
      inverse.clone().multiply(part.matrixWorld),
    ));
  }
  if (box.isEmpty()) return null;
  const positions: number[] = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) {
    for (const z of [box.min.z, box.max.z]) positions.push(x, y, z);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const outer = parts.find(part => part.userData.lightmap_atlas === 'ground-Outer') ?? parts[0];
  const material = new THREE.MeshBasicMaterial({
    name: 'MAT_CITY_GROUND', color: meanVertexColour(outer) ?? new THREE.Color(0xffffff),
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${group.name}__measurement`;
  mesh.userData.terrainMeasurement = true;
  mesh.visible = false;
  // Measurement geometry must not intercept city picking.
  mesh.raycast = () => {};
  group.add(mesh);
  return mesh;
}
