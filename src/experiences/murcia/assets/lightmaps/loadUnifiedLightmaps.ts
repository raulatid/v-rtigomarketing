import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { acquireKtx2Loader, releaseKtx2Loader } from '../../../../graphics/decoders';
import { findByAnyNameSpelling } from '../nodeNames';
import { ownGeometryWithSt } from './attachAssetLightmaps';
import { createLightmapMaterial, prepareLightmapTexture } from './lightmapMaterial';
import { parseUnifiedManifest } from './unifiedManifest';
import type { LightmapResolution } from './lightmapManifest';

/** The selected city bake: shared atlases without merging interactive building parts. */
export async function loadUnifiedLightmaps(
  gltf: GLTF, renderer: THREE.WebGLRenderer, base: string, file: string,
  resolution: LightmapResolution,
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
    const response = await fetch(base + file);
    if (!response.ok) throw new Error(`[lightmaps] manifest HTTP ${response.status}`);
    const manifest = parseUnifiedManifest(await response.json());
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
    // Decode serially to avoid simultaneous worker/upload peaks on phones.
    for (const key of new Set(targets.map(t => t.object.userData.lightmap_atlas as string))) {
      const row = manifest.atlases[key];
      if (!row) throw new Error(`[lightmaps] unknown atlas: ${key}`);
      const texture = await ktx2.loadAsync(base + row.variants[resolution].file);
      textures.set(key, texture);
      prepareLightmapTexture(texture, manifest.uvChannel);
    }
    for (const target of targets) {
      const { object, geometry } = target;
      const key = object.userData.lightmap_atlas as string;
      const row = manifest.atlases[key];
      const instanced = (object as THREE.InstancedMesh).isInstancedMesh === true;
      if (instanced) {
        const accessor = object.userData.instance_st_accessor;
        if (!Number.isInteger(accessor) || accessor < 0) throw new Error(`[lightmaps] missing ST: ${object.name}`);
        const st = await gltf.parser.getDependency('accessor', accessor) as THREE.BufferAttribute;
        if (st.itemSize !== 4 || st.count !== (object as THREE.InstancedMesh).count) {
          throw new Error(`[lightmaps] instance count mismatch: ${object.name}`);
        }
        object.geometry = ownGeometryWithSt(geometry, st);
        geometries.push(object.geometry);
      } else if (object.userData.instance_st_accessor !== undefined) {
        throw new Error(`[lightmaps] instancing unavailable: ${object.name}`);
      }
      const build = (source: THREE.Material) => {
        const cacheKey = `${key}:${source.uuid}:${instanced}`;
        let material = materials.get(cacheKey);
        if (!material && source.transparent && source.opacity < 0.999) {
          // Lobby glass keeps runtime PBR lighting, opacity and roughness.
          material = source.clone();
          if ('lightMap' in material) material.lightMap = null;
          material.depthWrite = false;
          materials.set(cacheKey, material);
        }
        if (!material) {
          material = createLightmapMaterial(source, {
            lightMap: textures.get(key)!, lightMapIntensity: row.threeLightMapIntensity,
            atlasSize: resolution, maxMip: row.variants[resolution].mipLevels - 1,
            instanced, preserveAlbedo: true,
            programKey: `murcia-v5.1-${instanced}-${resolution}-${row.variants[resolution].mipLevels}`,
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
