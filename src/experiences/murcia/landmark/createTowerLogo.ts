import * as THREE from 'three';
import { findByAnyNameSpelling } from '../assets/nodeNames';
import type { VertigoBuildingConfig } from './vertigoBuildingConfig';

/**
 * The Vertigo tower's logo, turning: the isotype standing on the cap.
 *
 * No loop of its own: `MurciaExperience.update` ticks it with the frame's
 * delta, on the same clock as the water and the districts (plan 019 §1). The
 * angle is speed × elapsed seconds — never a per-frame increment — so a
 * 30 fps phone and a 120 fps desktop see the mark at the same place at the same
 * time.
 *
 * The spin is COMPOSED onto the node's authored orientation, in its local
 * frame: `base × spin`. Position and scale are never written. A re-export that
 * tilts or resizes the mark keeps both; only the turn is ours.
 *
 * Reduced motion holds the mark still. The policy is read once by the
 * experience (the same read the districts use) and handed in, so this module
 * never asks the window anything.
 *
 * It can also be lit (`setGlow`): Conócenos' pulse leaves from it, with a
 * flash and an ember (plan 029b §2.5). The light is an emissive on the logo's
 * own copy of its material, so nothing else that shares the city's material
 * lights with it; a uniform write and no new program, as the colour is there,
 * at no intensity, from the start.
 */
export interface TowerLogo {
  /** How many of the contract's nodes the city actually had. */
  readonly nodeCount: number;
  update(delta: number): void;
  /** The logo's light, as `emissiveIntensity`: 0 is unlit. */
  setGlow(intensity: number): void;
}

/** The logo's light: white with a blue ember in it (decision R6, 2026-11-22), not the brand blue. */
const GLOW_COLOR = 0xd6e4ff;

const AXES = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
} as const;

const TWO_PI = Math.PI * 2;

export function createTowerLogo(
  root: THREE.Object3D,
  config: VertigoBuildingConfig,
  options: { reducedMotion: boolean },
): TowerLogo {
  const nodes: Array<{ object: THREE.Object3D; base: THREE.Quaternion }> = [];
  for (const name of config.logoNodeNames) {
    const match = findByAnyNameSpelling(root, name);
    if (!match) {
      // Optional at runtime, like the river: the city must load without its
      // landmark. The export is failed by the harness, not by the viewer.
      console.warn(
        `[vertigo] no "${name}" node in the model; the logo stands still. ` +
          'checks/city-asset.ts asserts this contract — run `npm run check:asset:contract`.',
      );
      continue;
    }
    nodes.push({ object: match.object, base: match.object.quaternion.clone() });
  }

  // Its own copy of each material that can glow, shared by its parts only.
  const lit: THREE.MeshStandardMaterial[] = [];
  const copies = new Map<THREE.Material, THREE.MeshStandardMaterial>();
  for (const { object } of nodes) {
    object.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const material = mesh.material as THREE.MeshStandardMaterial;
      if (!material.emissive) return;
      let copy = copies.get(material);
      if (!copy) {
        copy = material.clone();
        copy.emissive.set(GLOW_COLOR);
        copy.emissiveIntensity = 0;
        copies.set(material, copy);
        lit.push(copy);
      }
      mesh.material = copy;
    });
  }
  let glow = 0;

  const axis = AXES[config.logo.axis];
  const spin = new THREE.Quaternion();
  let angle = 0;

  return {
    nodeCount: nodes.length,
    setGlow(intensity) {
      if (intensity === glow) return;
      glow = intensity;
      for (const material of lit) material.emissiveIntensity = intensity;
    },
    update(delta: number): void {
      if (options.reducedMotion || nodes.length === 0) return;
      // Wrapped, so a session left open for a day does not drift into the
      // precision floor of a float that only ever grows.
      angle = (angle + config.logo.angularSpeedRadPerSec * delta) % TWO_PI;
      spin.setFromAxisAngle(axis, angle);
      for (const node of nodes) node.object.quaternion.copy(node.base).multiply(spin);
    },
  };
}
