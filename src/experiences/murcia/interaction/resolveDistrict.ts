import * as THREE from 'three';
import { findByAnyNameSpelling } from '../assets/nodeNames';
import type { BoundsRect } from '../config/environmentConfig';

/**
 * What the resolver needs to locate one piece of geometry. Structural rather
 * than the scene binding itself, so the same resolver serves a whole district
 * and a single service building.
 */
export interface DistrictLookupSpec {
  /** Used in messages only. */
  id: string;
  /**
   * Value expected in `userData.district`. Empty when the geometry is not tagged
   * by contract — service buildings are identified by name alone, and an empty
   * tag also silences the "add the custom property" warning that would
   * otherwise fire once per building.
   */
  tag: string;
  /** Blender spellings; all three runtime spellings are tried. */
  nodeNames: string[];
  fallbackRect?: BoundsRect;
  allowSpatialFallback: boolean;
}

/**
 * How a district's geometry was located. Surfaced so a fallback is never silent
 * — the same discipline `TerrainSource` applies to the terrain plate, for the
 * same reason (PROJECT_MEMORY, "Things that will bite you again").
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
 *   1. `userData.district === spec.tag` — a Blender custom property, exported
 *      into glTF `extras`.
 *   2. Explicit node names, in all three spellings (see `findByAnyNameSpelling`).
 *   3. A world-XZ rectangle, development only.
 *   4. not-found.
 *
 * WHICH STEP APPLIES IS THE CALLER'S DECISION, and the shipped one uses (2).
 * Since the 2026-08-27 re-export the city holds one building per service, named
 * `edificio-servicio-NNN`, and `MurciaExperience` resolves each with
 * `tag: ''` — a per-building custom property would add nothing the name does
 * not already say, and the empty tag also keeps step 1's "add the custom
 * property" warning from firing once per building. For that shape the NAME is
 * the contract, and `checks/city-asset.ts` asserts every bound name is really
 * in the GLB.
 *
 * Step 1 is neither dead nor deprecated: a tag is still the better answer for a
 * district resolved as a WHOLE — a cluster of geometry with no single stable
 * name to ask for — which is the shape the city had before the re-export and
 * may have again. It is simply not the shape anything ships today.
 *
 * Blender **collection** names are deliberately absent from that list: the glTF
 * exporter flattens collections, so a collection called `edificios_servicios`
 * produces no node of that name and can never be a runtime contract. Every node
 * name in the shipped GLB was dumped to confirm it.
 *
 * The spatial rectangle is a crutch for working against an asset that carries
 * neither tag nor stable names. World coordinates drift the moment the model is
 * re-exported (PROJECT_MEMORY, "Things that will bite you again"), so it is
 * gated behind `allowSpatialFallback` and warns loudly whenever it fires.
 */
export function resolveDistrict(
  root: THREE.Object3D,
  spec: DistrictLookupSpec,
): DistrictLookup {
  root.updateWorldMatrix(true, true);
  const warnings: string[] = [];

  const byTag = spec.tag ? collectByTag(root, spec.tag) : [];
  if (byTag.length > 0) {
    return finish(byTag, 'tag', warnings);
  }

  const byName = collectByNames(root, spec.nodeNames, warnings);
  if (byName.length > 0) {
    if (spec.tag) {
      warnings.push(
        `District "${spec.id}" resolved by node name, not by tag. Add the ` +
          `custom property district = "${spec.tag}" in Blender and re-export with ` +
          'Include > Custom Properties.',
      );
    }
    return finish(byName, 'name', warnings);
  }

  if (spec.fallbackRect && spec.allowSpatialFallback) {
    const r = spec.fallbackRect;
    const byRect = collectByRect(root, r);
    if (byRect.length > 0) {
      warnings.push(
        `District "${spec.id}" resolved by SPATIAL FALLBACK over ` +
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
