import * as THREE from 'three';

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

/**
 * The average vertex colour of a mesh, in linear space as it is stored.
 *
 * Used to colour the horizon skirt: the skirt is a clone of the plate's
 * material with its RGB held white, so whatever colour that material carries
 * is the colour the horizon fades from. Reading it off the outer ground it
 * continues is what keeps the seam invisible without anyone tuning a hex.
 */
function meanVertexColour(mesh: THREE.Mesh): THREE.Color | null {
  const attribute = mesh.geometry.getAttribute('color');
  if (!attribute || attribute.count === 0) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < attribute.count; i += 1) {
    r += attribute.getX(i);
    g += attribute.getY(i);
    b += attribute.getZ(i);
  }
  return new THREE.Color(r / attribute.count, g / attribute.count, b / attribute.count);
}
