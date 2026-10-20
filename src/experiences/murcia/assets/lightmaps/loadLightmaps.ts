import { loadUnifiedLightmaps } from './loadUnifiedLightmaps';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { LightmapConfig } from '../../config/environmentConfig';
import type { LightmapResolution } from './lightmapManifest';
import { deviceResolution } from './deviceResolution';
import type { CityBytes } from '../cityBytes';

/**
 * The city's baked light, fetched as files beside the model and put on the
 * surfaces the export marked as baked.
 *
 * ## What it touches, and what it never does
 *
 * Receivers are the nodes carrying the export's `lightmap_atlas` extra, each
 * naming an atlas in the bake's one `lightmaps.json` (`unifiedManifest`). The
 * nodes the site finds by name and dresses itself carry no atlas and are never
 * visited — their names, pivots and UVs are exactly as exported.
 *
 * ## Why after every other material pass
 *
 * `configureTrimTextures` sets repeat wrapping and anisotropy on every texture
 * it can reach, which an atlas must not have; the campus and tower palettes
 * replace materials on named nodes that are not receivers. Running last means
 * nothing overwrites a baked material and no atlas is re-configured.
 *
 * ## Failure
 *
 * Loud, not fatal. A manifest or atlas that will not load leaves the city on
 * its authored lit material — standing, wrongly lit, and reported. Murcia is a
 * non-required boot resource and a
 * texture must not be what takes it down.
 */

export interface LightmapHandle {
  resolution: LightmapResolution;
  dispose: () => void;
}

export interface LoadLightmapsOptions {
  gltf: GLTF;
  config: LightmapConfig;
  renderer: THREE.WebGLRenderer;
  /** Where the bake's files come from; fetched on demand when absent. */
  bytes?: CityBytes;
}

export async function loadLightmaps(options: LoadLightmapsOptions): Promise<LightmapHandle | null> {
  const { gltf, config, renderer, bytes } = options;
  // First: the baked materials keep the authored albedo (`preserveAlbedo`),
  // so a trim still attached here would be copied onto every one of them.
  dropEmbeddedTrim(gltf.scene);
  return loadUnifiedLightmaps(gltf, renderer, config.baseUrl, config.manifest, deviceResolution(), config.desktop1024, bytes);
}

/**
 * The export embeds a neutral white trim so the bake and the site share one
 * material graph. White multiplied in changes nothing, and the lit exterior
 * blocks are the only surfaces still holding the authored material — so the
 * texture is dropped rather than sampled for no effect on every one of them.
 */
function dropEmbeddedTrim(root: THREE.Object3D): void {
  const seen = new Set<THREE.Material>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const standard = material as THREE.MeshStandardMaterial;
      if (!standard?.isMeshStandardMaterial || seen.has(standard) || !standard.map) continue;
      seen.add(standard);
      standard.map.dispose();
      standard.map = null;
      standard.needsUpdate = true;
    }
  });
}
