import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { acquireKtx2Loader, releaseKtx2Loader } from '../../../../graphics/decoders';
import { findByAnyNameSpelling } from '../nodeNames';
import {
  INSTANCE_TONE_ATTRIBUTE, LIGHTMAP_ST_ATTRIBUTE, TONE_MASK_ATTRIBUTE, createLightmapMaterial, prepareLightmapTexture,
} from './lightmapMaterial';
import { atlasResolutions, parseUnifiedManifest, selectedVariant } from './unifiedManifest';
import type { LightmapResolution } from './lightmapManifest';
import { fetchCityBytes, type CityBytes } from '../cityBytes';

/**
 * The selected city bake: shared atlases without merging interactive building parts.
 *
 * `resolution` is the device's; `reduced` names atlases that load at 1024 even so.
 */
export async function loadUnifiedLightmaps(
  gltf: GLTF, renderer: THREE.WebGLRenderer, base: string, file: string,
  resolution: LightmapResolution, reduced: readonly string[] | 'all' = [],
  bytes: CityBytes = fetchCityBytes,
): Promise<{ resolution: LightmapResolution; dispose: () => void } | null> {
  const targets: Array<{ object: THREE.Mesh; geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[] }> = [];
  const textures = new Map<string, THREE.Texture>();
  const materials = new Map<string, THREE.Material>();
  const geometries: THREE.BufferGeometry[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    for (const t of targets) { t.object.material = t.material; t.object.geometry = t.geometry; }
    for (const m of materials.values()) m.dispose();
    for (const g of geometries) g.dispose();
    for (const t of textures.values()) t.dispose();
  };
  const ktx2 = acquireKtx2Loader(renderer);
  try {
    const manifest = parseUnifiedManifest(await bytes.json(base + file));
    const sizes = atlasResolutions(manifest, resolution, reduced);
    for (const name of manifest.requiredNames) {
      if (!findByAnyNameSpelling(gltf.scene, name)) throw new Error(`[lightmaps] missing runtime node: ${name}`);
    }
    gltf.scene.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      // GLTFLoader turns a multi-material mesh into a Group. Its primitive
      // children need the atlas and interaction tags stored on that group.
      for (const key of ['lightmap_atlas', 'building_id', 'runtime_material', 'dynamic_rotation']) {
        if (mesh.userData[key] !== undefined) continue;
        for (let parent = mesh.parent; parent; parent = parent.parent) {
          if (parent.userData[key] !== undefined) {
            mesh.userData[key] = parent.userData[key];
            break;
          }
        }
      }
      if (typeof mesh.userData.lightmap_atlas !== 'string') return;
      if (mesh.userData.runtime_material || mesh.userData.dynamic_rotation) {
        throw new Error(`[lightmaps] dynamic surface was baked: ${mesh.name}`);
      }
      if (!mesh.geometry.getAttribute('uv1')) throw new Error(`[lightmaps] missing uv1: ${mesh.name}`);
      targets.push({ object: mesh, geometry: mesh.geometry, material: mesh.material });
    });
    if (!targets.length) throw new Error('[lightmaps] no receivers');
    const keys = [...new Set(targets.map(t => t.object.userData.lightmap_atlas as string))];
    for (const key of keys) if (!manifest.atlases[key]) throw new Error(`[lightmaps] unknown atlas: ${key}`);
    // Download in parallel: one file after another paid a round trip each,
    // 4.5 s for 20 atlases on the tablet. A failure surfaces at its own await
    // below; the catch only keeps the ones never reached from going unhandled.
    const downloads = keys.map(key => bytes.buffer(base + selectedVariant(manifest, key, sizes.get(key)!).file));
    for (const download of downloads) download.catch(() => {});
    // Decode serially to avoid simultaneous worker/upload peaks on phones.
    for (const [index, key] of keys.entries()) {
      const buffer = await downloads[index];
      const texture = await new Promise<THREE.Texture>((resolve, reject) => ktx2.parse(buffer, resolve, reject));
      textures.set(key, texture);
      prepareLightmapTexture(texture, manifest.uvChannel);
    }
    for (const target of targets) {
      const { object, geometry } = target;
      const key = object.userData.lightmap_atlas as string;
      const row = manifest.atlases[key];
      const instanced = (object as THREE.InstancedMesh).isInstancedMesh === true;
      let toned = false;
      if (instanced && object.userData.instance_st_builtin === true) {
        // Expanded from facade records (`facadeRecords.ts`): its own geometry already carries the ST.
        const st = geometry.getAttribute(LIGHTMAP_ST_ATTRIBUTE);
        if (!(st instanceof THREE.InstancedBufferAttribute) || st.count !== (object as THREE.InstancedMesh).count) {
          throw new Error(`[lightmaps] instance count mismatch: ${object.name}`);
        }
      } else if (instanced) {
        const accessor = object.userData.instance_st_accessor;
        if (!Number.isInteger(accessor) || accessor < 0) throw new Error(`[lightmaps] missing ST: ${object.name}`);
        const st = await gltf.parser.getDependency('accessor', accessor) as THREE.BufferAttribute;
        if (st.itemSize !== 4 || st.count !== (object as THREE.InstancedMesh).count) {
          throw new Error(`[lightmaps] instance count mismatch: ${object.name}`);
        }
        // A toned prop: its mask on the prototype, its colour per instance.
        const toneAccessor = object.userData.instance_tone_accessor;
        let tone: THREE.BufferAttribute | null = null;
        if (toneAccessor !== undefined) {
          if (!Number.isInteger(toneAccessor) || toneAccessor < 0 || !geometry.getAttribute(GLTF_TONE_ATTRIBUTE)) {
            throw new Error(`[lightmaps] missing tone: ${object.name}`);
          }
          tone = await gltf.parser.getDependency('accessor', toneAccessor) as THREE.BufferAttribute;
          if (tone.itemSize !== 3 || tone.count !== st.count) throw new Error(`[lightmaps] instance count mismatch: ${object.name}`);
          toned = true;
        }
        object.geometry = ownGeometryWithSt(geometry, st, tone);
        geometries.push(object.geometry);
      } else if (object.userData.instance_st_accessor !== undefined) {
        throw new Error(`[lightmaps] instancing unavailable: ${object.name}`);
      }
      const build = (source: THREE.Material) => {
        const cacheKey = `${key}:${source.uuid}:${instanced}:${toned}`;
        let material = materials.get(cacheKey);
        if (!material && source.transparent && source.opacity < 0.999) {
          // Lobby glass keeps runtime PBR lighting, opacity and roughness.
          material = source.clone();
          if ('lightMap' in material) material.lightMap = null;
          material.depthWrite = false;
          materials.set(cacheKey, material);
        }
        if (!material) {
          const size = sizes.get(key)!;
          const variant = selectedVariant(manifest, key, size);
          material = createLightmapMaterial(source, {
            lightMap: textures.get(key)!, lightMapIntensity: row.threeLightMapIntensity,
            atlasSize: size, maxMip: variant.mipLevels - 1,
            instanced, preserveAlbedo: true, toned,
            programKey: `murcia-v5.1-${instanced}-${toned}-${size}-${variant.mipLevels}`,
          });
          material.name = `${source.name} | ${key}`;
          materials.set(cacheKey, material);
        }
        return material;
      };
      object.material = Array.isArray(target.material) ? target.material.map(build) : build(target.material);
    }
    return { resolution, dispose };
  } catch (error) {
    dispose();
    console.warn('[lightmaps] not applied', error);
    return null;
  } finally {
    releaseKtx2Loader();
  }
}

/**
 * The prototype's attributes by reference, plus this group's own ST.
 *
 * Every instance reads its own rectangle of the atlas through `_LIGHTMAP_ST`,
 * exported as an `EXT_mesh_gpu_instancing` attribute. `GLTFLoader` (0.174)
 * promotes only `_COLOR_0` to an instance attribute; anything else it sets on
 * the geometry as an ordinary per-vertex attribute — and that geometry is the
 * PROTOTYPE, shared by every group that instances the same window or tree, so
 * the last group loaded would have written its rectangles over the others'.
 * The export records each group's accessor in `instance_st_accessor` for
 * exactly this reason; it is read back through the parser and wrapped here.
 * Sharing the position/normal/uv buffers keeps the GPU cost of instancing —
 * one prototype upload — while giving each group the one attribute that differs.
 */
function ownGeometryWithSt(
  source: THREE.BufferGeometry, st: THREE.BufferAttribute, tone: THREE.BufferAttribute | null = null,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const [attribute, value] of Object.entries(source.attributes)) {
    if (attribute === LIGHTMAP_ST_ATTRIBUTE) continue;
    // A toned prop's mask, renamed for the shader (`lightmapMaterial.ts`).
    geometry.setAttribute(tone && attribute === GLTF_TONE_ATTRIBUTE ? TONE_MASK_ATTRIBUTE : attribute, value);
  }
  geometry.setIndex(source.index);
  for (const group of source.groups) geometry.addGroup(group.start, group.count, group.materialIndex);
  geometry.setDrawRange(source.drawRange.start, source.drawRange.count);
  geometry.boundingBox = source.boundingBox?.clone() ?? null;
  geometry.boundingSphere = source.boundingSphere?.clone() ?? null;
  geometry.setAttribute(
    LIGHTMAP_ST_ATTRIBUTE,
    new THREE.InstancedBufferAttribute(st.array as Float32Array, 4, st.normalized),
  );
  if (tone) {
    geometry.setAttribute(
      INSTANCE_TONE_ATTRIBUTE,
      new THREE.InstancedBufferAttribute(tone.array as Float32Array, 3, tone.normalized),
    );
  }
  return geometry;
}

/** `_TONE` in the GLB, lowercased by `GLTFLoader`, as in the traffic. */
const GLTF_TONE_ATTRIBUTE = '_tone';
