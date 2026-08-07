import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { findByAnyNameSpelling } from './nodeNames';

/** How the terrain plate was located. Surfaced so a fallback is never silent. */
export type TerrainSource =
  | 'configured-name'
  | 'sanitized-name'
  | 'original-name'
  | 'largest-flat-mesh'
  | 'not-found';

export interface LoadTimings {
  loadStartTime: number;
  networkCompleteTime: number | null;
  parseCompleteTime: number | null;
  firstRenderedFrameTime: number | null;
  /** Approximate download size in bytes, when reported by the loader. */
  bytesLoaded: number | null;
}

export interface LoadCityOptions {
  loader: GLTFLoader;
  modelPath: string;
  /** Name of the terrain plate mesh in the GLB. */
  terrainObjectName: string;
}

export interface LoadedCity {
  gltf: GLTF;
  root: THREE.Object3D;
  terrain: THREE.Mesh | null;
  terrainSource: TerrainSource;
  timings: LoadTimings;
  report: SceneReport;
}

export interface SceneReport {
  objectCount: number;
  meshCount: number;
  materialCount: number;
  textureCount: number;
  lightCount: number;
  cameraCount: number;
  skinnedMeshCount: number;
  animationCount: number;
  transparentMaterialCount: number;
  doubleSidedMaterialCount: number;
  negativeScaleObjects: string[];
  warnings: string[];
}

/**
 * Loads a city GLB, records approximate timing/size measurements, locates the
 * terrain plate, and produces a one-time development report.
 *
 * The loader is injected rather than constructed here: the Draco worker pool is
 * shared application-wide (docs/plans/002 Amendment A7).
 *
 * Network vs. parse separation is approximate: GLTFLoader's onProgress fires as
 * bytes arrive; parseCompleteTime is when onLoad resolves.
 */
export async function loadCity(options: LoadCityOptions): Promise<LoadedCity> {
  const timings: LoadTimings = {
    loadStartTime: performance.now(),
    networkCompleteTime: null,
    parseCompleteTime: null,
    firstRenderedFrameTime: null,
    bytesLoaded: null,
  };

  const gltf = await new Promise<GLTF>((resolve, reject) => {
    options.loader.load(
      options.modelPath,
      (result) => {
        timings.parseCompleteTime = performance.now();
        resolve(result);
      },
      (event) => {
        // Fires as bytes download. Last event ~ network complete (approx).
        timings.networkCompleteTime = performance.now();
        if (event.lengthComputable) {
          timings.bytesLoaded = event.loaded;
        }
      },
      (error) => {
        reject(
          error instanceof Error
            ? error
            : new Error(`Failed to load GLB at "${options.modelPath}"`),
        );
      },
    );
  });

  const root = gltf.scene;
  const found = findTerrainPlate(root, options.terrainObjectName);
  const report = buildSceneReport(gltf, found, options.terrainObjectName);

  return {
    gltf,
    root,
    terrain: found.mesh,
    terrainSource: found.source,
    timings,
    report,
  };
}

export interface TerrainLookup {
  mesh: THREE.Mesh | null;
  source: TerrainSource;
  /** Name actually matched, for diagnostics. */
  matchedName: string | null;
}

/**
 * Locates the terrain plate.
 *
 * Name lookup alone is not reliable — see `findByAnyNameSpelling`, which owns
 * the three-spelling logic this used to implement inline.
 *
 * If none match, the largest flat mesh is used instead. That keeps the
 * prototype working across renames and re-exports, and — more importantly —
 * stops a lookup miss from silently degrading navigation, which is exactly the
 * failure this function was written to end.
 */
export function findTerrainPlate(
  root: THREE.Object3D,
  configuredName: string,
): TerrainLookup {
  const match = findByAnyNameSpelling(root, configuredName, isMesh);
  if (match) {
    return {
      mesh: match.object as THREE.Mesh,
      source: match.source,
      matchedName: match.matchedName,
    };
  }

  const largest = findLargestFlatMesh(root);
  if (largest) {
    return {
      mesh: largest,
      source: 'largest-flat-mesh',
      matchedName: largest.name || '(unnamed)',
    };
  }

  return { mesh: null, source: 'not-found', matchedName: null };
}

function isMesh(obj: THREE.Object3D): boolean {
  return (obj as THREE.Mesh).isMesh === true;
}

/**
 * Largest mesh by XZ footprint whose vertical extent is small relative to it —
 * i.e. ground-like rather than a building.
 */
function findLargestFlatMesh(root: THREE.Object3D): THREE.Mesh | null {
  const box = new THREE.Box3();
  const size = new THREE.Vector3();
  let best: THREE.Mesh | null = null;
  let bestArea = 0;

  root.updateWorldMatrix(true, true);
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    // Instanced meshes are scattered props, never the plate.
    if ((mesh as unknown as THREE.InstancedMesh).isInstancedMesh) return;

    box.setFromObject(mesh);
    if (box.isEmpty()) return;
    box.getSize(size);

    const footprint = size.x * size.z;
    const span = Math.max(size.x, size.z);
    if (span <= 0) return;
    // Flatness test: the plate is wide and thin. 0.2 admits gentle relief while
    // excluding anything building-shaped.
    if (size.y > span * 0.2) return;

    if (footprint > bestArea) {
      bestArea = footprint;
      best = mesh;
    }
  });

  return best;
}

/** Releases every geometry, material and texture owned by a loaded model. */
export function disposeLoadedCity(city: LoadedCity): void {
  const textures = new Set<THREE.Texture>();
  const materials = new Set<THREE.Material>();

  city.root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (mat) materials.add(mat);
    }
  });

  for (const mat of materials) {
    collectTextures(mat, textures);
    mat.dispose();
  }
  for (const tex of textures) {
    tex.dispose();
  }

  city.root.removeFromParent();
}

function buildSceneReport(
  gltf: GLTF,
  terrain: TerrainLookup,
  terrainObjectName: string,
): SceneReport {
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  const report: SceneReport = {
    objectCount: 0,
    meshCount: 0,
    materialCount: 0,
    textureCount: 0,
    lightCount: 0,
    cameraCount: 0,
    skinnedMeshCount: 0,
    animationCount: gltf.animations.length,
    transparentMaterialCount: 0,
    doubleSidedMaterialCount: 0,
    negativeScaleObjects: [],
    warnings: [],
  };

  gltf.scene.traverse((obj) => {
    report.objectCount += 1;

    if ((obj as THREE.Light).isLight) report.lightCount += 1;
    if ((obj as THREE.Camera).isCamera) report.cameraCount += 1;

    if (obj.scale.x < 0 || obj.scale.y < 0 || obj.scale.z < 0) {
      report.negativeScaleObjects.push(obj.name || '(unnamed)');
    }

    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh) {
      report.meshCount += 1;
      if ((mesh as THREE.SkinnedMesh).isSkinnedMesh) report.skinnedMeshCount += 1;

      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat) continue;
        materials.add(mat);
        if (mat.transparent) report.transparentMaterialCount += 1;
        if (mat.side === THREE.DoubleSide) report.doubleSidedMaterialCount += 1;
        collectTextures(mat, textures);
      }
    }
  });

  report.materialCount = materials.size;
  report.textureCount = textures.size;

  // Performance / correctness warnings.
  if (report.lightCount > 0) {
    report.warnings.push(
      `${report.lightCount} light(s) exported from Blender; the shell provides its own lighting.`,
    );
  }
  if (report.materialCount === 0) {
    report.warnings.push(
      'GLB contains no materials; every mesh shares one default MeshStandardMaterial. ' +
        'Clone before modifying any of them.',
    );
  }
  if (report.materialCount > 60) {
    report.warnings.push(`High material count (${report.materialCount}).`);
  }
  if (report.meshCount > 500) {
    report.warnings.push(`Many meshes (${report.meshCount}); expect high draw calls.`);
  }
  if (report.transparentMaterialCount > 0) {
    report.warnings.push(
      `${report.transparentMaterialCount} transparent material(s); watch sort/overdraw cost.`,
    );
  }
  if (report.doubleSidedMaterialCount > 0) {
    report.warnings.push(`${report.doubleSidedMaterialCount} double-sided material(s).`);
  }
  if (report.negativeScaleObjects.length > 0) {
    report.warnings.push(
      `Negative scale on: ${report.negativeScaleObjects.join(', ')} (apply transforms in Blender).`,
    );
  }

  for (const tex of textures) {
    const img = tex.image as { width?: number; height?: number } | undefined;
    if (img?.width && img?.height && (img.width > 2048 || img.height > 2048)) {
      report.warnings.push(
        `Large texture ${img.width}x${img.height} (${tex.name || 'unnamed'}).`,
      );
    }
  }

  switch (terrain.source) {
    case 'not-found':
      report.warnings.push(
        `Terrain plate not found (looked for "${terrainObjectName}"). ` +
          'The skirt will be skipped and navigation limits will fall back to content bounds.',
      );
      break;
    case 'sanitized-name':
      report.warnings.push(
        `Terrain "${terrainObjectName}" matched only after GLTFLoader name sanitization ` +
          `(as "${terrain.matchedName}"). Reserved characters []. :/ are stripped from node names.`,
      );
      break;
    case 'original-name':
      report.warnings.push(
        `Terrain "${terrainObjectName}" matched via userData.name, not object name.`,
      );
      break;
    case 'largest-flat-mesh':
      report.warnings.push(
        `Terrain "${terrainObjectName}" not found by name; fell back to the largest flat mesh ` +
          `("${terrain.matchedName}"). Update terrainObjectName to silence this.`,
      );
      break;
    default:
      break;
  }

  return report;
}

function collectTextures(mat: THREE.Material, out: Set<THREE.Texture>): void {
  const record = mat as unknown as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (value && (value as THREE.Texture).isTexture) {
      out.add(value as THREE.Texture);
    }
  }
}
