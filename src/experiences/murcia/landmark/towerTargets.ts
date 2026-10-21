import * as THREE from 'three';
import { findByAnyNameSpelling } from '../assets/nodeNames';
import { createBuildingHighlight, type BuildingHighlight } from '../interaction/buildingHighlight';
import type { VertigoBuildingConfig } from './vertigoBuildingConfig';

/**
 * The Vertigo tower's point of interest, as a place in the city: its base
 * (Conócenos).
 *
 * It gets what the blog and the campus already have: a world point for its
 * dot, a hover tint in the brand's blue, and a surface to raycast. The rest of
 * the tower stays scenery — nothing else of it answers a pointer.
 *
 * The base is baked surface like any building, so it takes the buildings'
 * highlight as it is (`createBuildingHighlight`). Built after
 * `attachTowerScreen`, which recolours the tower's parts: the highlight must
 * clone the palette's materials, not the trim sheet's they replaced.
 */

export interface TowerTargets {
  /** The base's mesh, for raycasting. Null when the city has none. */
  readonly base: THREE.Mesh | null;
  /** The base's dot: the middle of the lobby glass. */
  baseAnchor(out: THREE.Vector3): THREE.Vector3;
  setBaseHover(on: boolean): void;
  update(deltaTime: number): void;
  dispose(): void;
}

/** The lowest mesh under a node: a node with two primitives arrives as a group of two. */
function lowestMesh(node: THREE.Object3D): THREE.Mesh | null {
  let lowest: THREE.Mesh | null = null;
  let lowestTop = Infinity;
  const box = new THREE.Box3();
  node.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const top = box.setFromObject(mesh).max.y;
    if (top < lowestTop) {
      lowestTop = top;
      lowest = mesh;
    }
  });
  return lowest;
}

export function createTowerTargets(root: THREE.Object3D, config: VertigoBuildingConfig): TowerTargets {
  root.updateMatrixWorld(true);
  const baseNode = findByAnyNameSpelling(root, config.baseNodeName)?.object ?? null;
  const base = baseNode ? lowestMesh(baseNode) : null;
  if (!base) console.warn(`[vertigo] no "${config.baseNodeName}"; Conócenos has no base to point at`);

  const baseCentre = base ? new THREE.Box3().setFromObject(base).getCenter(new THREE.Vector3()) : null;
  const baseHighlight: BuildingHighlight | null = base ? createBuildingHighlight([base]) : null;

  return {
    base,

    baseAnchor(out: THREE.Vector3): THREE.Vector3 {
      return baseCentre ? out.copy(baseCentre) : out.set(0, 0, 0);
    },

    setBaseHover(on: boolean): void {
      baseHighlight?.setTarget(on);
    },

    update(deltaTime: number): void {
      baseHighlight?.update(deltaTime);
    },

    dispose(): void {
      baseHighlight?.dispose();
    },
  };
}
