import { loadUnifiedLightmaps } from './loadUnifiedLightmaps';
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { acquireKtx2Loader, releaseKtx2Loader } from '../../../../graphics/decoders';
import type { LightmapConfig } from '../../config/environmentConfig';
import {
  LIGHTMAP_CHUNKS,
  chooseLightmapResolution,
  parseAssetLightmapManifest,
  parseGroundLightmapManifest,
  variantFile,
  type LightmapChunk,
  type LightmapResolution,
} from './lightmapManifest';
import { prepareLightmapTexture } from './lightmapMaterial';
import { assetAtlasKey, attachAssetLightmaps, type AttachedAssetLightmaps } from './attachAssetLightmaps';
import { attachGroundLightmaps, meanVertexColour, type AttachedGroundLightmaps } from './attachGroundLightmaps';

/**
 * The city's baked light, fetched as files beside the model and put on the
 * surfaces the export marked as baked.
 *
 * ## What it touches, and what it never does
 *
 * Receivers are the nodes carrying the export's `asset_lightmap_kind` or
 * `ground_lightmap_chunk` extras. The 21 nodes the site finds by name and
 * dresses itself (the tower's screen and logo, the campus, the blog building,
 * the river, the plate) carry `runtime_lightmap: false` and are never visited
 * — their names, pivots and UVs are exactly as exported.
 *
 * ## The plate under the ground
 *
 * `suelo-principal` and the ground chunks cover the same rectangle at the same
 * height. The plate is what the skirt is built from and what every bounds
 * measurement reads, so it stays in the graph — invisible, since the baked
 * ground is what should be seen. Its material becomes an unlit one in the
 * outer ground's mean colour, because that material is what the skirt clones,
 * and the skirt has to continue the ground it wraps.
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
 * its authored lit material — standing, wrongly lit, and reported — the same
 * bargain `loadTrimSheet` makes. Murcia is a non-required boot resource and a
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
  /** The plate, hidden under the baked ground and recoloured for the skirt. */
  terrain: THREE.Mesh | null;
}

const NARROW_QUERY = '(max-width: 767px)';
const COARSE_QUERY = '(pointer: coarse)';

function deviceResolution(): LightmapResolution {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 2048;
  return chooseLightmapResolution({
    narrow: window.matchMedia(NARROW_QUERY).matches,
    coarse: window.matchMedia(COARSE_QUERY).matches,
  });
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`[lightmaps] ${url}: HTTP ${response.status}`);
  return response.json();
}

export async function loadLightmaps(options: LoadLightmapsOptions): Promise<LightmapHandle | null> {
  const { gltf, config, renderer, terrain } = options;
  const resolution = deviceResolution();
  if ('manifest' in config) return loadUnifiedLightmaps(gltf, renderer, config.baseUrl, config.manifest, resolution);
  const base = config.baseUrl;

  const loaded = new Map<string, THREE.Texture>();
  let assets: AttachedAssetLightmaps | null = null;
  let ground: AttachedGroundLightmaps | null = null;

  // Held only while decoding, like every other consumer of the transcoder.
  const ktx2 = acquireKtx2Loader(renderer);
  try {
    const [assetManifest, groundManifest] = await Promise.all([
      fetchJson(base + config.assetsManifest).then(parseAssetLightmapManifest),
      fetchJson(base + config.groundManifest).then(parseGroundLightmapManifest),
    ]);

    // Sequential rather than twelve at once: each transcode is a worker job
    // and a decoded upload, and a phone doing twelve together is the memory
    // spike the resolution split exists to avoid.
    const load = async (key: string, file: string, uvChannel: number) => {
      const texture = await ktx2.loadAsync(base + file);
      prepareLightmapTexture(texture, uvChannel);
      loaded.set(key, texture);
    };
    const assetAtlases = new Map<ReturnType<typeof assetAtlasKey>, THREE.Texture>();
    const groundAtlases = new Map<LightmapChunk, THREE.Texture>();
    for (const chunk of LIGHTMAP_CHUNKS) {
      for (const kind of ['static', 'instances'] as const) {
        const key = assetAtlasKey(chunk, kind);
        await load(key, variantFile(assetManifest.chunks[chunk][kind], resolution, key), assetManifest.uvChannel);
        assetAtlases.set(key, loaded.get(key)!);
      }
      const key = `ground:${chunk}`;
      await load(key, variantFile(groundManifest.chunks[chunk], resolution, key), groundManifest.uvChannel);
      groundAtlases.set(chunk, loaded.get(key)!);
    }

    assets = await attachAssetLightmaps(gltf, assetManifest, assetAtlases, resolution);
    ground = attachGroundLightmaps(gltf.scene, groundManifest, groundAtlases, resolution);
    hidePlateUnderGround(terrain, ground.context);
    dropEmbeddedTrim(gltf.scene);
  } catch (error) {
    console.warn('[lightmaps] not applied', error);
    restore(assets, ground);
    for (const texture of loaded.values()) texture.dispose();
    return null;
  } finally {
    releaseKtx2Loader();
  }

  const attachedAssets = assets;
  const attachedGround = ground;
  return {
    resolution,
    dispose: () => {
      restore(attachedAssets, attachedGround);
      for (const texture of loaded.values()) texture.dispose();
    },
  };
}

function restore(assets: AttachedAssetLightmaps | null, ground: AttachedGroundLightmaps | null): void {
  if (assets) {
    for (const target of assets.targets) {
      target.object.material = target.material;
      target.object.geometry = target.geometry;
    }
    for (const material of assets.materials) material.dispose();
    for (const geometry of assets.geometries) geometry.dispose();
  }
  if (ground) {
    for (const target of ground.targets) target.object.material = target.material;
    for (const material of ground.materials) material.dispose();
  }
}

/**
 * The plate stays for measurement and as the skirt's template; the baked
 * ground is what renders. `Box3.setFromObject` reads geometry regardless of
 * `visible`, so nothing measured off the plate changes.
 */
function hidePlateUnderGround(terrain: THREE.Mesh | null, context: THREE.Mesh | null): void {
  if (!terrain) return;
  terrain.visible = false;
  const colour = (context && meanVertexColour(context)) ?? new THREE.Color(0xffffff);
  const source = Array.isArray(terrain.material) ? terrain.material[0] : terrain.material;
  terrain.material = new THREE.MeshBasicMaterial({
    name: 'MAT_CITY_GROUND',
    color: colour,
    toneMapped: source?.toneMapped ?? true,
  });
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
