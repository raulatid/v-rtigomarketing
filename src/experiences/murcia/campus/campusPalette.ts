import { CAMPUS_INSTANCED_TREE_NAMES } from './campusConfig';
import * as THREE from 'three';
import { CAMPUS_PART_NODE_NAMES, type CampusPartName } from './campusConfig';

/**
 * The campus's colours, by the node each one was authored for.
 *
 * The city ships the campus with NO materials — `applyTrimSheet` dresses every
 * mesh in the city's building material — so its look travels as this table,
 * the way the tower's does (`landmark/towerScreen/towerPalette.ts`). The values
 * are the lab's `campus_vertigo.glb` materials, linear as glTF stores them.
 *
 * ## Metalness is the authored value, unlike the tower's
 *
 * The tower zeroed its metals because they had nothing to reflect. The campus's
 * numbers were judged in the lab under the same kind of rig — a hemisphere and
 * one directional light, no environment map — so they are kept. The glazing
 * (0.43) and the window frames (0.70) are the two that could read dark here;
 * that is a visual-pass knob, not a reason to flatten all of them in advance.
 *
 * Not in the table, on purpose: the water, which `lake/lakeWater.ts` puts on
 * its own shader, and the LED strip, which the facade replaces. Both hand back
 * whatever they found when they are disposed.
 */

interface PartColour {
  /** Linear RGB, as the glTF `baseColorFactor` carried it. */
  readonly color: readonly [number, number, number];
  readonly metalness: number;
  readonly roughness: number;
  /** Linear RGB `emissiveFactor`, scaled by `KHR_materials_emissive_strength`. */
  readonly emissive?: readonly [number, number, number];
  readonly emissiveIntensity?: number;
}

export const CAMPUS_PALETTE: Readonly<Record<CampusPartName, PartColour>> = {
  ARCH_Porcelain_White: { color: [0.83, 0.855, 0.89], metalness: 0.12, roughness: 0.34 },
  // The roof cap, split out of the base by the export; the same porcelain.
  'ARCH_Porcelain_White.001': { color: [0.83, 0.855, 0.89], metalness: 0.12, roughness: 0.34 },
  ARCH_Glazing_Opaque_Blue: { color: [0.055, 0.135, 0.19], metalness: 0.43, roughness: 0.2 },
  ARCH_Blue_Light: {
    color: [0.008, 0.22, 0.95],
    metalness: 0.1,
    roughness: 0.3,
    emissive: [0.0084, 0.2316, 1.0],
    emissiveIntensity: 2.185,
  },
  ARCH_Window_Frames: { color: [0.2, 0.27, 0.32], metalness: 0.7, roughness: 0.3 },
  ARCH_Vertigo_Blue: { color: [0.012, 0.12, 0.55], metalness: 0.45, roughness: 0.28 },
  ARCH_Roof_Joints: { color: [0.42, 0.49, 0.57], metalness: 0.15, roughness: 0.6 },
  ARCH_Solar_Blue: { color: [0.025, 0.095, 0.2], metalness: 0.4, roughness: 0.33 },
  SITE_Light_Limestone: { color: [0.59, 0.63, 0.66], metalness: 0, roughness: 0.8 },
  PARK_Grass: { color: [0.16, 0.28, 0.13], metalness: 0, roughness: 0.95 },
  PARK_Trunks: { color: [0.2, 0.12, 0.065], metalness: 0, roughness: 0.92 },
  PARK_Leaves_Olive: { color: [0.25, 0.36, 0.12], metalness: 0, roughness: 0.9 },
  PARK_Leaves_Sage: { color: [0.16, 0.3, 0.12], metalness: 0, roughness: 0.9 },
};

function materialFor(name: string, part: PartColour): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    name: `MAT_${name}`,
    color: new THREE.Color().setRGB(...part.color, THREE.LinearSRGBColorSpace),
    metalness: part.metalness,
    roughness: part.roughness,
  });
  if (part.emissive) {
    material.emissive.setRGB(...part.emissive, THREE.LinearSRGBColorSpace);
    material.emissiveIntensity = part.emissiveIntensity ?? 1;
  }
  return material;
}

const isMesh = (object: THREE.Object3D): object is THREE.Mesh =>
  (object as THREE.Mesh).isMesh === true;

/**
 * Dresses every campus part under `root`, meshes beneath it included.
 *
 * REPLACES the material, never mutates it: the one it displaces is shared by
 * every building in the city. The new ones hang on the campus's meshes, so
 * whoever disposes the tree disposes them. A city without the campus is left
 * alone and silent; one with only part of it warns once, naming what is
 * missing. Returns how many parts were dressed.
 */
export function applyCampusPalette(root: THREE.Object3D): number {
  const byName = new Map(
    CAMPUS_PART_NODE_NAMES.map((name) => [THREE.PropertyBinding.sanitizeNodeName(name), name]),
  );
  const dressed = new Set<CampusPartName>();
  let bakedCampus = false;

  root.traverse((object) => {
    const name = byName.get(object.name);
    if (!name || dressed.has(name)) return;
    if (object.userData.lightmap_atlas) {
      bakedCampus = true;
      dressed.add(name);
      return;
    }
    const material = materialFor(name, CAMPUS_PALETTE[name]);
    object.traverse((child) => {
      if (isMesh(child) && !child.userData.lightmap_atlas) child.material = material;
    });
    dressed.add(name);
  });

  const missing = CAMPUS_PART_NODE_NAMES.filter((name) => !dressed.has(name) && !(bakedCampus && CAMPUS_INSTANCED_TREE_NAMES.includes(name)));
  if (missing.length > 0 && dressed.size > 0) {
    console.warn(
      `[campus] ${missing.length} campus part(s) are not in the model: ${missing.join(', ')}`,
    );
  }
  return dressed.size;
}
