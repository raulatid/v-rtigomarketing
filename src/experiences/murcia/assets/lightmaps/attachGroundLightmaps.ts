import * as THREE from 'three';
import {
  LIGHTMAP_CHUNKS,
  maxMipLevel,
  type GroundLightmapManifest,
  type LightmapChunk,
  type LightmapResolution,
} from './lightmapManifest';
import { createLightmapMaterial, createUnlitVertexColourMaterial } from './lightmapMaterial';

/**
 * The baked ground: four central chunks, found by the `ground_lightmap_chunk`
 * extra, each with its own atlas. The outer ground carries the same extra with
 * the value `Context` and no atlas — it is beyond the bake — and is made unlit
 * here too, so the floor does not change lighting model at the chunk edge.
 */

export interface GroundLightmapTarget {
  object: THREE.Mesh;
  material: THREE.Material | THREE.Material[];
}

export interface AttachedGroundLightmaps {
  targets: GroundLightmapTarget[];
  materials: THREE.Material[];
  /** The outer ground, when the model has one. */
  context: THREE.Mesh | null;
}

export const GROUND_CONTEXT_CHUNK = 'Context';

export function attachGroundLightmaps(
  root: THREE.Object3D,
  manifest: GroundLightmapManifest,
  atlases: ReadonlyMap<LightmapChunk, THREE.Texture>,
  resolution: LightmapResolution,
): AttachedGroundLightmaps {
  const targets: Array<GroundLightmapTarget & { chunk: string }> = [];
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const chunk = (mesh.userData as { ground_lightmap_chunk?: string }).ground_lightmap_chunk;
    if (!mesh.isMesh || !chunk) return;
    targets.push({ object: mesh, material: mesh.material, chunk });
  });

  const baked = new Set(targets.map((t) => t.chunk).filter((c) => (LIGHTMAP_CHUNKS as string[]).includes(c)));
  if (baked.size !== LIGHTMAP_CHUNKS.length) {
    throw new Error(`[lightmaps] ground chunks found: ${[...baked].join(',') || 'none'}`);
  }

  const materials = new Map<string, THREE.Material>();
  let context: THREE.Mesh | null = null;

  for (const target of targets) {
    const build = (source: THREE.Material): THREE.Material => {
      const key = `${target.chunk}:${source.uuid}`;
      let material = materials.get(key);
      if (material) return material;
      if (target.chunk === GROUND_CONTEXT_CHUNK) {
        material = createUnlitVertexColourMaterial(source);
      } else {
        const chunk = target.chunk as LightmapChunk;
        const atlas = atlases.get(chunk);
        if (!atlas) throw new Error(`[lightmaps] no ground atlas for ${chunk}`);
        material = createLightmapMaterial(source, {
          lightMap: atlas,
          lightMapIntensity: manifest.chunks[chunk].threeLightMapIntensity,
          atlasSize: resolution,
          maxMip: maxMipLevel('ground', resolution),
          instanced: false,
          programKey: 'murcia-ground-mip-v1',
        });
      }
      materials.set(key, material);
      return material;
    };
    target.object.material = Array.isArray(target.material)
      ? target.material.map(build)
      : build(target.material);
    if (target.chunk === GROUND_CONTEXT_CHUNK) context = target.object;
  }

  return {
    targets: targets.map(({ object, material }) => ({ object, material })),
    materials: [...materials.values()],
    context,
  };
}

/**
 * The average vertex colour of a mesh, in linear space as it is stored.
 *
 * Used to colour the horizon skirt: the skirt is a clone of the plate's
 * material with its RGB held white, so whatever colour that material carries
 * is the colour the horizon fades from. Reading it off the outer ground it
 * continues is what keeps the seam invisible without anyone tuning a hex.
 */
export function meanVertexColour(mesh: THREE.Mesh): THREE.Color | null {
  const attribute = mesh.geometry.getAttribute('color');
  if (!attribute || attribute.count === 0) return null;
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < attribute.count; i += 1) {
    r += attribute.getX(i);
    g += attribute.getY(i);
    b += attribute.getZ(i);
  }
  return new THREE.Color(r / attribute.count, g / attribute.count, b / attribute.count);
}
