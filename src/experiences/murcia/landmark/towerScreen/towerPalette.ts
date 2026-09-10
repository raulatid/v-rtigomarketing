import * as THREE from 'three';

/**
 * The tower's colours, by the node each one was authored for.
 *
 * The city ships the tower with NO materials — its loader dresses every mesh in
 * the city's own building material — so the tower's look travels as this table
 * instead. The colours are the base colours `edificio-vertigo.glb` authored,
 * linear as glTF stores them; METALNESS IS 0 throughout, by decision: the city
 * lights with a hemisphere and one directional light and no environment map,
 * and a metallic surface with nothing to reflect renders near-black.
 *
 * Names are the contract. `ARCH_Light_Warm` is deliberately absent: those light
 * strips were removed from the city export, and a tower part with no entry here
 * is warned about rather than silently left in the city's material.
 */

interface PartColour {
  /** Linear RGB, as the glTF `baseColorFactor` carried it. */
  readonly color: readonly [number, number, number];
  readonly roughness: number;
  /** Below 1 is see-through. Only the lobby glass is. */
  readonly opacity?: number;
}

export const TOWER_PALETTE: Readonly<Record<string, PartColour>> = {
  ARCH_Glass_DeepBlue: { color: [0.032, 0.067, 0.098], roughness: 0.23 },
  ARCH_Glass_Lobby: { color: [0.18, 0.24, 0.28], roughness: 0.24, opacity: 0.24 },
  ARCH_Glass_SilverBlue: { color: [0.075, 0.12, 0.16], roughness: 0.22 },
  ARCH_Glass_WarmOffices: { color: [0.38, 0.225, 0.098], roughness: 0.3 },
  ARCH_Metal_Champagne: { color: [0.4, 0.31, 0.2], roughness: 0.3 },
  ARCH_Metal_Graphite: { color: [0.032, 0.042, 0.053], roughness: 0.28 },
  ARCH_Roof_Zinc: { color: [0.1, 0.13, 0.155], roughness: 0.44 },
  ARCH_Stone_Limestone: { color: [0.32, 0.3, 0.27], roughness: 0.5 },
  BRAND_VERTIGO: { color: [0.88, 0.79, 0.6], roughness: 0.32 },
};

function materialFor(name: string, part: PartColour): THREE.MeshStandardMaterial {
  const opacity = part.opacity ?? 1;
  return new THREE.MeshStandardMaterial({
    name: `MAT_${name}`,
    color: new THREE.Color().setRGB(...part.color, THREE.LinearSRGBColorSpace),
    roughness: part.roughness,
    metalness: 0,
    ...(opacity < 1 ? { transparent: true, opacity, depthWrite: false } : {}),
  });
}

const isMesh = (object: THREE.Object3D): object is THREE.Mesh =>
  (object as THREE.Mesh).isMesh === true;

/**
 * Dresses every palette node under `root`, meshes beneath it included — a node
 * exported with several primitives arrives as a group of meshes.
 *
 * REPLACES the material, never mutates it: in the city the one it displaces is
 * shared by every building. The new ones hang on the tower's meshes, so whoever
 * disposes the tree disposes them. Returns how many nodes were dressed.
 */
export function applyTowerPalette(root: THREE.Object3D): number {
  let dressed = 0;
  const byName = new Map(
    Object.entries(TOWER_PALETTE).map(([name, part]) => [
      THREE.PropertyBinding.sanitizeNodeName(name),
      { name, part },
    ]),
  );

  root.traverse((object) => {
    const entry = byName.get(object.name);
    if (!entry) {
      if (object.name.startsWith('ARCH_') && !isMesh(object.parent ?? object)) {
        console.warn(`[vertigo] "${object.name}" has no colour in the tower palette; it keeps its material`);
      }
      return;
    }
    const material = materialFor(entry.name, entry.part);
    object.traverse((child) => {
      if (isMesh(child)) child.material = material;
    });
    dressed += 1;
  });

  return dressed;
}
