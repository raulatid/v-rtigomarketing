import * as THREE from 'three';
import { findByAnyNameSpelling } from '../assets/nodeNames';
import { createBuildingHighlight, type BuildingHighlight } from '../interaction/buildingHighlight';
import type { ScreenFrame } from '../about/aboutPoses';
import type { VertigoBuildingConfig } from './vertigoBuildingConfig';

/**
 * The Vertigo tower's point of interest, as a place in the city: its base
 * (Conócenos) — and what the Conócenos visit is framed on: the screen as a
 * picture to stand in front of, and the middle of the logo.
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
  /** The screen, measured: null when the city has none. */
  readonly screenFrame: ScreenFrame | null;
  /** The middle of the logo's parts together, at rest: null when the city has none. */
  readonly logoCentre: THREE.Vector3 | null;
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

/** The mean of a mesh's normals in world space, flattened to the ground. Null if it has none. */
export function meanHorizontalNormal(mesh: THREE.Mesh): THREE.Vector3 | null {
  const normals = mesh.geometry.getAttribute('normal');
  if (!normals) return null;
  const sum = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let i = 0; i < normals.count; i++) sum.add(n.fromBufferAttribute(normals, i));
  const toWorld = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  sum.applyMatrix3(toWorld).setY(0);
  return sum.lengthSq() > 1e-8 ? sum.normalize() : null;
}

/**
 * The screen as a picture: its middle, the way it faces, its height and the
 * chord across the curved strip. Recovered from the Anuncios flight of
 * `8057303`, retired the same day, whose framing was good.
 */
export function measureScreenFrame(mesh: THREE.Mesh): ScreenFrame | null {
  mesh.updateWorldMatrix(true, false);
  const normal = meanHorizontalNormal(mesh);
  if (!normal) return null;
  const box = new THREE.Box3().setFromObject(mesh);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  // The axis-aligned box of a turned strip: its chord is its footprint's
  // extent along the horizontal axis square to the normal.
  const across = new THREE.Vector3(-normal.z, 0, normal.x);
  const width = Math.abs(across.x) * size.x + Math.abs(across.z) * size.z;
  return { centre, normal, height: size.y, width };
}

export function createTowerTargets(root: THREE.Object3D, config: VertigoBuildingConfig): TowerTargets {
  root.updateMatrixWorld(true);
  const baseNode = findByAnyNameSpelling(root, config.baseNodeName)?.object ?? null;
  const base = baseNode ? lowestMesh(baseNode) : null;
  if (!base) console.warn(`[vertigo] no "${config.baseNodeName}"; Conócenos has no base to point at`);

  const baseCentre = base ? new THREE.Box3().setFromObject(base).getCenter(new THREE.Vector3()) : null;
  const baseHighlight: BuildingHighlight | null = base ? createBuildingHighlight([base]) : null;

  const screenNode = findByAnyNameSpelling(root, config.screenNodeName)?.object ?? null;
  let screenMesh: THREE.Mesh | null = null;
  screenNode?.traverse((object) => {
    if (!screenMesh && (object as THREE.Mesh).isMesh) screenMesh = object as THREE.Mesh;
  });
  const screenFrame = screenMesh ? measureScreenFrame(screenMesh) : null;

  // Measured before the logo first turns: the box of a turning mark breathes,
  // and its middle does not move.
  const logoBox = new THREE.Box3();
  for (const name of config.logoNodeNames) {
    const node = findByAnyNameSpelling(root, name)?.object;
    if (node) logoBox.expandByObject(node);
  }
  const logoCentre = logoBox.isEmpty() ? null : logoBox.getCenter(new THREE.Vector3());

  return {
    base,

    baseAnchor(out: THREE.Vector3): THREE.Vector3 {
      return baseCentre ? out.copy(baseCentre) : out.set(0, 0, 0);
    },

    setBaseHover(on: boolean): void {
      baseHighlight?.setTarget(on);
    },

    screenFrame,
    logoCentre,

    update(deltaTime: number): void {
      baseHighlight?.update(deltaTime);
    },

    dispose(): void {
      baseHighlight?.dispose();
    },
  };
}
