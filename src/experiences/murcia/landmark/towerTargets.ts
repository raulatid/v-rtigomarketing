import * as THREE from 'three';
import { findByAnyNameSpelling } from '../assets/nodeNames';
import { findScreen } from '../screens/screenMesh';
import {
  BUILDING_HIGHLIGHT,
  createBuildingHighlight,
  easeHighlight,
  stepHighlight,
  type BuildingHighlight,
} from '../interaction/buildingHighlight';
import type { VertigoBuildingConfig } from './vertigoBuildingConfig';

/**
 * The Vertigo tower's two points of interest, as places in the city: its LED
 * screen (Anuncios) and its base (Conócenos).
 *
 * Each gets what the blog and the campus already have: a world point for its
 * dot, a hover tint in the brand's blue, and a surface to raycast. The tower
 * itself stays scenery — nothing else of it answers a pointer.
 *
 * ## Two tints, one look
 *
 * The base is baked surface like any building, so it takes the buildings'
 * highlight as it is (`createBuildingHighlight`).
 *
 * The screen cannot: its material is the facade's own `ShaderMaterial`, with no
 * `<opaque_fragment>` to inject into, and the highlight throws on it. So the
 * screen wears a SHELL — its own geometry again, as a child, in flat blue whose
 * opacity is the highlight's strength. Alpha blending is `mix(screen, blue, a)`,
 * which is exactly what the buildings' injection computes, so the two read as
 * the same light. It is drawn only while lit.
 *
 * Built after `attachTowerScreen`, which recolours the tower's parts and moves
 * the screen's UV set: the base's highlight must clone the palette's materials,
 * not the trim sheet's they replaced.
 */

/** The screen as a picture to stand in front of, in world space. */
export interface ScreenFrame {
  readonly centre: THREE.Vector3;
  /** Horizontal, unit length, pointing out of the picture. */
  readonly normal: THREE.Vector3;
  readonly height: number;
  /** The chord across the curved strip, measured square to the normal. */
  readonly width: number;
}

export interface TowerTargets {
  /** The screen's mesh, for raycasting. Null when the city has none. */
  readonly screen: THREE.Mesh | null;
  /** The base's mesh, for raycasting. Null when the city has none. */
  readonly base: THREE.Mesh | null;
  readonly screenFrame: ScreenFrame | null;
  /** The screen's dot: its centre, a hair proud of its face. */
  screenAnchor(out: THREE.Vector3): THREE.Vector3;
  /** The base's dot: the middle of the lobby glass. */
  baseAnchor(out: THREE.Vector3): THREE.Vector3;
  setScreenHover(on: boolean): void;
  setBaseHover(on: boolean): void;
  /** Parts born hidden, for the host's warm-up. */
  readonly precompileTargets: readonly THREE.Object3D[];
  update(deltaTime: number): void;
  dispose(): void;
}

/** How far in front of the screen's face its dot stands, in world units. */
const SCREEN_DOT_LIFT = 1;

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

function createScreenShell(screen: THREE.Mesh): THREE.Mesh {
  const shell = new THREE.Mesh(
    screen.geometry,
    new THREE.MeshBasicMaterial({
      color: BUILDING_HIGHLIGHT.color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      // Drawn on the screen's own surface, so it is pulled forward in depth
      // rather than offset in space: the curve stays exact.
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
      fog: false,
    }),
  );
  shell.name = 'LED_Main | highlight';
  shell.visible = false;
  // Not a target: the screen under it is (trap: interfaz #47).
  shell.raycast = () => {};
  screen.add(shell);
  return shell;
}

export function createTowerTargets(root: THREE.Object3D, config: VertigoBuildingConfig): TowerTargets {
  root.updateMatrixWorld(true);
  // Channel 0: `attachTowerScreen` has already made the screen's own UV set `uv`.
  const screen = findScreen(root, config.screenNodeName, 0);
  if (!screen) console.warn(`[vertigo] no "${config.screenNodeName}"; Anuncios has no screen to point at`);
  const baseNode = findByAnyNameSpelling(root, config.baseNodeName)?.object ?? null;
  const base = baseNode ? lowestMesh(baseNode) : null;
  if (!base) console.warn(`[vertigo] no "${config.baseNodeName}"; Conócenos has no base to point at`);

  const screenFrame = screen ? measureScreenFrame(screen) : null;
  const baseCentre = base ? new THREE.Box3().setFromObject(base).getCenter(new THREE.Vector3()) : null;

  const shell = screen ? createScreenShell(screen) : null;
  const shellMaterial = shell?.material as THREE.MeshBasicMaterial | undefined;
  let screenProgress = 0;
  let screenTarget = 0;
  const baseHighlight: BuildingHighlight | null = base ? createBuildingHighlight([base]) : null;

  return {
    screen,
    base,
    screenFrame,

    screenAnchor(out: THREE.Vector3): THREE.Vector3 {
      if (!screenFrame) return out.set(0, 0, 0);
      return out.copy(screenFrame.normal).multiplyScalar(SCREEN_DOT_LIFT).add(screenFrame.centre);
    },

    baseAnchor(out: THREE.Vector3): THREE.Vector3 {
      return baseCentre ? out.copy(baseCentre) : out.set(0, 0, 0);
    },

    setScreenHover(on: boolean): void {
      screenTarget = on ? 1 : 0;
    },

    setBaseHover(on: boolean): void {
      baseHighlight?.setTarget(on);
    },

    precompileTargets: shell ? [shell] : [],

    update(deltaTime: number): void {
      baseHighlight?.update(deltaTime);
      if (!shell || !shellMaterial) return;
      if (screenProgress !== screenTarget) {
        screenProgress = stepHighlight(screenProgress, screenTarget, deltaTime, BUILDING_HIGHLIGHT.duration);
      }
      const strength = easeHighlight(screenProgress) * BUILDING_HIGHLIGHT.intensity;
      shellMaterial.opacity = strength;
      shell.visible = strength > 0;
    },

    dispose(): void {
      baseHighlight?.dispose();
      if (shell) {
        shell.removeFromParent();
        shellMaterial?.dispose();
      }
    },
  };
}
