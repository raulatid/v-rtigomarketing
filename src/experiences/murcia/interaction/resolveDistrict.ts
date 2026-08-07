import * as THREE from 'three';
import { findByAnyNameSpelling } from '../assets/nodeNames';
import type { DistrictSceneBinding } from '../scene/cityDistrictBindings';

/**
 * How a district's geometry was located. Surfaced so a fallback is never silent
 * — the same discipline `TerrainSource` applies to the terrain plate, for the
 * same reason (PROJECT_MEMORY section 4.2).
 */
export type DistrictSource = 'tag' | 'name' | 'rect' | 'not-found';

export interface DistrictLookup {
  meshes: THREE.Mesh[];
  source: DistrictSource;
  bounds: THREE.Box3;
  center: THREE.Vector3;
  /** Non-fatal problems worth reporting once, at load. */
  warnings: string[];
}

/**
 * Locates the meshes belonging to a district.
 *
 * Resolution order, most to least trustworthy:
 *
 *   1. `userData.district === binding.tag` — a Blender custom property, exported
 *      into glTF `extras`. This is the production mechanism.
 *   2. Explicit node names, in all three spellings (see `findByAnyNameSpelling`).
 *   3. A world-XZ rectangle, development only.
 *   4. not-found.
 *
 * Blender **collection** names are deliberately absent from that list: the glTF
 * exporter flattens collections, so a collection called `edificios_servicios`
 * produces no node of that name and can never be a runtime contract. All 294
 * node names in the shipped GLB were dumped to confirm it.
 *
 * The spatial rectangle is a crutch for working against an asset that carries
 * neither tag nor stable names. World coordinates drift the moment the model is
 * re-exported (section 4.3), so it is gated behind `allowSpatialFallback` and
 * warns loudly whenever it fires.
 */
export function resolveDistrict(
  root: THREE.Object3D,
  binding: DistrictSceneBinding,
): DistrictLookup {
  root.updateWorldMatrix(true, true);
  const warnings: string[] = [];

  const byTag = collectByTag(root, binding.tag);
  if (byTag.length > 0) {
    return finish(byTag, 'tag', warnings);
  }

  const byName = collectByNames(root, binding.nodeNames, warnings);
  if (byName.length > 0) {
    warnings.push(
      `District "${binding.contentId}" resolved by node name, not by tag. Add the ` +
        `custom property district = "${binding.tag}" in Blender and re-export with ` +
        'Include > Custom Properties.',
    );
    return finish(byName, 'name', warnings);
  }

  if (binding.fallbackRect && binding.allowSpatialFallback) {
    const r = binding.fallbackRect;
    const byRect = collectByRect(root, r);
    if (byRect.length > 0) {
      warnings.push(
        `District "${binding.contentId}" resolved by SPATIAL FALLBACK over ` +
          `X [${r.minX}, ${r.maxX}] Z [${r.minZ}, ${r.maxZ}] — ${byRect.length} mesh(es). ` +
          'This is a development crutch: hardcoded world coordinates drift on ' +
          're-export. Tag the objects in Blender before shipping.',
      );
      return finish(byRect, 'rect', warnings);
    }
  }

  return {
    meshes: [],
    source: 'not-found',
    bounds: new THREE.Box3(),
    center: new THREE.Vector3(),
    warnings,
  };
}

function finish(
  meshes: THREE.Mesh[],
  source: DistrictSource,
  warnings: string[],
): DistrictLookup {
  const bounds = new THREE.Box3();
  for (const mesh of meshes) {
    bounds.expandByObject(mesh);
  }

  // A tagged InstancedMesh is a contract violation waiting to become a rendering
  // bug: its instances share one material, so highlighting the district would
  // light every instance in the mesh, including any that belong elsewhere. The
  // fix is per-instance attributes, which is a different implementation — so say
  // so now rather than discovering it visually.
  for (const mesh of meshes) {
    if ((mesh as unknown as THREE.InstancedMesh).isInstancedMesh) {
      warnings.push(
        `"${mesh.name || '(unnamed)'}" is an InstancedMesh. A district-tagged ` +
          'InstancedMesh must contain ONLY that district\'s instances — a shared ' +
          'material swap cannot highlight a subset. If it spans districts, ' +
          'highlighting must move to instance IDs and a per-instance attribute.',
      );
    }
  }

  const center = new THREE.Vector3();
  if (!bounds.isEmpty()) bounds.getCenter(center);

  return { meshes, source, bounds, center, warnings };
}

function collectByTag(root: THREE.Object3D, tag: string): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj.userData?.['district'] !== tag) return;
    // The property may sit on a group; take every mesh beneath it.
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) found.push(child as THREE.Mesh);
    });
  });
  return dedupe(found);
}

function collectByNames(
  root: THREE.Object3D,
  names: string[],
  warnings: string[],
): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  for (const name of names) {
    const match = findByAnyNameSpelling(root, name);
    if (!match) {
      warnings.push(`Configured district node "${name}" not found in any spelling.`);
      continue;
    }
    if (match.source !== 'configured-name') {
      warnings.push(
        `District node "${name}" matched only as "${match.matchedName}" ` +
          `(${match.source}); GLTFLoader strips [ ] . : / from node names.`,
      );
    }
    match.object.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) found.push(child as THREE.Mesh);
    });
  }
  return dedupe(found);
}

/**
 * Meshes whose world bounding box intersects the rectangle.
 *
 * Intersection rather than centroid containment: a building straddling the edge
 * of a hand-drawn rectangle should be included, and a centroid test drops it
 * with no indication that anything was missed.
 */
function collectByRect(
  root: THREE.Object3D,
  rect: { minX: number; maxX: number; minZ: number; maxZ: number },
): THREE.Mesh[] {
  const found: THREE.Mesh[] = [];
  const box = new THREE.Box3();

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    box.setFromObject(mesh);
    if (box.isEmpty()) return;
    const overlaps =
      box.max.x >= rect.minX &&
      box.min.x <= rect.maxX &&
      box.max.z >= rect.minZ &&
      box.min.z <= rect.maxZ;
    if (overlaps) found.push(mesh);
  });

  return dedupe(found);
}

function dedupe(meshes: THREE.Mesh[]): THREE.Mesh[] {
  return Array.from(new Set(meshes));
}
