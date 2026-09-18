import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadUnifiedLightmaps } from './loadUnifiedLightmaps';

const decoder = vi.hoisted(() => ({ loadAsync: vi.fn(), release: vi.fn() }));
vi.mock('../../../../graphics/decoders', () => ({
  acquireKtx2Loader: () => ({ loadAsync: decoder.loadAsync }),
  releaseKtx2Loader: decoder.release,
}));

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe('unified multi-material building receivers', () => {
  it('lights the opaque primitive, preserves PBR glass, and restores owned resources on disposal', async () => {
    const scene = new THREE.Group();
    const lobby = new THREE.Group();
    lobby.name = 'ARCH_Glass_Lobby';
    lobby.userData = { lightmap_atlas: 'tower', building_id: 'vertigo' };
    scene.add(lobby);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('uv1', new THREE.Float32BufferAttribute([0, 0], 2));
    const opaque = new THREE.MeshStandardMaterial();
    const glass = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.24, roughness: 0.24 });
    const wall = new THREE.Mesh(geometry, opaque);
    const pane = new THREE.Mesh(geometry, glass);
    lobby.add(wall, pane);
    const texture = new THREE.Texture();
    const disposeTexture = vi.spyOn(texture, 'dispose');
    decoder.loadAsync.mockResolvedValue(texture);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({
      uvChannel: 1, requiredNames: [lobby.name], atlases: { tower: {
        threeLightMapIntensity: Math.PI * 4, variants: {
          1024: { file: 'tower-1024.ktx2', bytes: 100, mipLevels: 1 },
          2048: { file: 'tower-2048.ktx2', bytes: 200, mipLevels: 2 },
        },
      } },
    }) }));
    const handle = await loadUnifiedLightmaps({ scene } as unknown as GLTF, {} as THREE.WebGLRenderer, '/maps/', 'lightmaps.json', 1024);
    expect(handle).not.toBeNull();
    expect(decoder.loadAsync).toHaveBeenCalledExactlyOnceWith('/maps/tower-1024.ktx2');
    expect(wall.material).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(wall.material.lightMap).toBe(texture);
    expect(pane.material).toBeInstanceOf(THREE.MeshStandardMaterial);
    expect(pane.material).not.toBe(glass);
    expect(pane.material.opacity).toBe(0.24);
    expect(pane.material.roughness).toBe(0.24);
    expect(pane.material.lightMap).toBeNull();
    expect(pane.material.depthWrite).toBe(false);
    expect(pane.userData.building_id).toBe('vertigo');
    expect(wall.userData.lightmap_atlas).toBe('tower');
    expect(glass.depthWrite).toBe(true);
    const disposeGlass = vi.spyOn(pane.material, 'dispose');
    handle!.dispose();
    handle!.dispose();
    expect(wall.material).toBe(opaque);
    expect(pane.material).toBe(glass);
    expect(disposeGlass).toHaveBeenCalledOnce();
    expect(disposeTexture).toHaveBeenCalledOnce();
    expect(decoder.release).toHaveBeenCalledOnce();
  });
});
