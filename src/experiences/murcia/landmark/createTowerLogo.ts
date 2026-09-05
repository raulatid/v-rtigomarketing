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
 */
export interface TowerLogo {
  /** How many of the contract's nodes the city actually had. */
  readonly nodeCount: number;
  update(delta: number): void;
}

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

  const axis = AXES[config.logo.axis];
  const spin = new THREE.Quaternion();
  let angle = 0;

  return {
    nodeCount: nodes.length,
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
