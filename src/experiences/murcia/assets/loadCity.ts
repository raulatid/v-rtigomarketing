import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { findByAnyNameSpelling } from './nodeNames';
import { collectTextures, disposeObject3D } from '../../../graphics/disposal';

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
  /**
   * Download progress, 0..1, when the server reports a content length.
   *
   * Reports bytes only — not parse, not GPU upload — so a caller driving a
   * progress display must not treat 1 as "ready to show".
   */
  onProgress?: (fraction: number) => void;
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
  /**
   * Meshes whose geometry has no `uv` attribute.
   *
   * A trim sheet is nothing but UV placement, so a mesh without UVs does not
   * fail — it samples texel (0,0) of the atlas across its whole surface and
   * renders a flat, entirely plausible colour. That is the failure this field
   * exists to make visible, and it is why nothing here generates fallback UVs:
   * a missing UV set is an export regression and belongs fixed in the .blend
   * (`checks/city-asset.ts` asserts the same thing on the file itself).
   */
  meshesMissingUv: string[];
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
          if (event.total > 0) options.onProgress?.(event.loaded / event.total);
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
  configureTrimTextures(root);
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

/**
 * Anisotropic filtering for the city's textures.
 *
 * 4, not `renderer.capabilities.getMaxAnisotropy()`. The brand atlas already
 * ships 4 and mobile GPUs are a deployment target, so maximising it on every
 * texture spends sampling budget the roofs do not need (plan 001 Phase 12). The
 * surfaces that justify any of it are the ones seen at grazing angles — roofs
 * and long cornices at the far end of a 30 deg pose.
 */
const TRIM_ANISOTROPY = 4;

/**
 * The one runtime property this module sets on a Blender-authored texture, and
 * the single deliberate exception to *Blender decides where the texture is
 * sampled* (docs/plans/001, Expected Final Architecture).
 *
 * The trim sheet is laid out as full-width horizontal bands stacked in V. That
 * layout needs the two axes to wrap differently:
 *
 *   wrapS = Repeat       a facade tiles its trim along its own length, so U
 *                        runs past 1 by design
 *   wrapT = ClampToEdge  V must never leave its band; wrapping it would sample
 *                        a neighbouring trim and the error looks like an
 *                        authoring mistake rather than a sampler one
 *
 * Blender cannot express that split. Its Image Texture *Extension* setting is
 * one value for the node, applied to both axes, so a glTF sampler exported from
 * it is either Repeat/Repeat or Clamp/Clamp. glTF and three both carry the axes
 * separately; only the authoring tool in the middle does not. So this is not
 * Three.js second-guessing the export — it is Three.js expressing something the
 * export had no way to say.
 *
 * Nothing else is touched. No offset, no repeat scale, no colour space, no UV
 * arithmetic: `GLTFLoader` already sets colour spaces correctly from the glTF
 * material model, and everything else belongs to the .blend.
 *
 * Idempotent, and safe on the untextured GLB that ships today — it iterates
 * whatever textures exist, which is currently none.
 */
export function configureTrimTextures(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) if (mat) materials.add(mat);
  });

  // By identity, via the same helper the disposal path uses: one trim sheet is
  // reachable from every material that shares it, and configuring it four times
  // would set `needsUpdate` four times on one GPU resource.
  const textures = new Set<THREE.Texture>();
  for (const mat of materials) collectTextures(mat, textures);

  for (const texture of textures) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.anisotropy = TRIM_ANISOTROPY;
    texture.needsUpdate = true;
  }
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
  disposeObject3D(city.root);
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
    meshesMissingUv: [],
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

      if (mesh.geometry && !mesh.geometry.attributes.uv) {
        report.meshesMissingUv.push(mesh.name || '(unnamed)');
      }

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
  if (report.meshesMissingUv.length > 0) {
    const names = report.meshesMissingUv.slice(0, 3).join(', ');
    const rest = report.meshesMissingUv.length - 3;
    report.warnings.push(
      `${report.meshesMissingUv.length} of ${report.meshCount} mesh(es) have no UV coordinates ` +
        `(${names}${rest > 0 ? `, +${rest} more` : ''}). ` +
        (report.textureCount > 0
          ? 'They sample texel (0,0) of every texture — a flat colour that looks deliberate. ' +
            'Fix the export, not the runtime: no fallback UVs are generated here.'
          : 'Harmless while the model ships no textures; blocking for the trim sheet.'),
    );
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
      // The megabytes, not just the dimensions. This project's binding
      // constraint is GPU memory on iOS — ~226 MB resident before the
      // 2026-08-14 remediation, ~70 MB after (audits/ios-safari-2026-08-14.md
      // §3) — and "4096x4096" does not read as "89 MB" to anyone scanning a
      // log. x4 for RGBA8, x1.33 for the mip chain.
      const mb = (img.width * img.height * 4 * 1.33) / (1024 * 1024);
      report.warnings.push(
        `Large texture ${img.width}x${img.height} (${tex.name || 'unnamed'}), ` +
          `~${mb.toFixed(0)} MB of GPU memory with mipmaps.`,
      );
    }
  }

  // A base colour sampled as linear data is the classic mis-export: it does not
  // fail, it just renders washed out, and it is indistinguishable from a
  // lighting problem until someone thinks to check. GLTFLoader gets this right
  // on its own, so a hit here means something downstream replaced the texture.
  for (const mat of materials) {
    const map = (mat as THREE.MeshStandardMaterial).map;
    if (map && map.colorSpace !== THREE.SRGBColorSpace) {
      report.warnings.push(
        `Base colour map on "${mat.name || 'unnamed'}" is not sRGB ` +
          `(colorSpace "${map.colorSpace}"); it will render washed out.`,
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
