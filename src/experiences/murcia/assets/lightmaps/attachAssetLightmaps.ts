import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  maxMipLevel,
  type AssetLightmapKind,
  type AssetLightmapManifest,
  type LightmapChunk,
  type LightmapResolution,
} from './lightmapManifest';
import { LIGHTMAP_ST_ATTRIBUTE, createLightmapMaterial } from './lightmapMaterial';

/**
 * The baked buildings and their instanced props.
 *
 * Receivers are found by the extras the export writes, never by name: a node
 * with `asset_lightmap_kind` is baked and gets its chunk's atlas; everything
 * else — the 21 named nodes the site dresses itself, the unbaked exterior —
 * is not touched here.
 *
 * ## Why instanced groups get a new geometry
 *
 * Every instance reads its own rectangle of the atlas through `_LIGHTMAP_ST`,
 * exported as an `EXT_mesh_gpu_instancing` attribute. `GLTFLoader` (0.174)
 * promotes only `_COLOR_0` to an instance attribute; anything else it sets on
 * the geometry as an ordinary per-vertex attribute — and that geometry is the
 * PROTOTYPE, shared by every group that instances the same window or tree, so
 * the last group loaded would have written its rectangles over the others'.
 * The export records each group's accessor in `asset_st_accessor` for exactly
 * this reason; it is read back through the parser and wrapped as an
 * `InstancedBufferAttribute` on a geometry the group owns.
 */

export interface AssetLightmapReceiverTarget {
  object: THREE.Mesh;
  material: THREE.Material | THREE.Material[];
  geometry: THREE.BufferGeometry;
}

export interface AttachedAssetLightmaps {
  targets: AssetLightmapReceiverTarget[];
  materials: THREE.Material[];
  geometries: THREE.BufferGeometry[];
}

type AtlasKey = `${LightmapChunk}:${AssetLightmapKind}`;

export function assetAtlasKey(chunk: LightmapChunk, kind: AssetLightmapKind): AtlasKey {
  return `${chunk}:${kind}`;
}

interface ReceiverExtras {
  asset_lightmap_kind?: AssetLightmapKind;
  asset_lightmap_chunk?: LightmapChunk;
  asset_st_accessor?: number;
}

export async function attachAssetLightmaps(
  gltf: GLTF,
  manifest: AssetLightmapManifest,
  atlases: ReadonlyMap<AtlasKey, THREE.Texture>,
  resolution: LightmapResolution,
): Promise<AttachedAssetLightmaps> {
  const targets: AssetLightmapReceiverTarget[] = [];
  gltf.scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const extras = mesh.userData as ReceiverExtras;
    if (!extras.asset_lightmap_kind) return;
    targets.push({ object: mesh, material: mesh.material, geometry: mesh.geometry });
  });
  if (targets.length === 0) throw new Error('[lightmaps] no asset receivers');

  const materials = new Map<string, THREE.Material>();
  const geometries: THREE.BufferGeometry[] = [];

  for (const target of targets) {
    const extras = target.object.userData as Required<ReceiverExtras>;
    const { asset_lightmap_chunk: chunk, asset_lightmap_kind: kind } = extras;
    const atlas = atlases.get(assetAtlasKey(chunk, kind));
    if (!atlas) throw new Error(`[lightmaps] no atlas for ${chunk} ${kind}`);
    const instanced = kind === 'instances';
    const name = target.object.name;

    if (instanced) {
      const instancedMesh = target.object as unknown as THREE.InstancedMesh;
      if (!instancedMesh.isInstancedMesh) {
        throw new Error(`[lightmaps] "${name}" did not load instanced`);
      }
      const st = (await gltf.parser.getDependency('accessor', extras.asset_st_accessor)) as THREE.BufferAttribute;
      if (st.count !== instancedMesh.count || st.itemSize !== 4) {
        throw new Error(`[lightmaps] "${name}": bad ${LIGHTMAP_ST_ATTRIBUTE}`);
      }
      target.object.geometry = ownGeometryWithSt(target.geometry, st);
      geometries.push(target.object.geometry);
    }

    const entry = manifest.chunks[chunk][kind];
    const build = (source: THREE.Material): THREE.Material => {
      const key = `${chunk}:${kind}:${source.uuid}`;
      let material = materials.get(key);
      if (!material) {
        material = createLightmapMaterial(source, {
          lightMap: atlas,
          lightMapIntensity: entry.threeLightMapIntensity,
          atlasSize: resolution,
          maxMip: maxMipLevel(kind, resolution),
          instanced,
          programKey: `murcia-assets-v1-${instanced ? 'instanced' : 'static'}`,
        });
        material.name = `MAT_CITY_BAKED_${chunk}_${kind}`;
        materials.set(key, material);
      }
      return material;
    };
    target.object.material = Array.isArray(target.material)
      ? target.material.map(build)
      : build(target.material);
  }

  return { targets, materials: [...materials.values()], geometries };
}

/**
 * The prototype's attributes by reference, plus this group's own ST. Sharing
 * the position/normal/uv buffers keeps the GPU cost of instancing — one
 * prototype upload — while giving each group the one attribute that differs.
 */
function ownGeometryWithSt(source: THREE.BufferGeometry, st: THREE.BufferAttribute): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const [attribute, value] of Object.entries(source.attributes)) {
    if (attribute !== LIGHTMAP_ST_ATTRIBUTE) geometry.setAttribute(attribute, value);
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
  return geometry;
}
