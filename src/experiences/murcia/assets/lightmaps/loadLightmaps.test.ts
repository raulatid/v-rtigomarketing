import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it, vi } from 'vitest';
import { loadLightmaps } from './loadLightmaps';

const unified = vi.hoisted(() => ({ mapsSeen: [] as Array<THREE.Texture | null> }));
vi.mock('./loadUnifiedLightmaps', () => ({
  loadUnifiedLightmaps: vi.fn(async (gltf: GLTF) => {
    gltf.scene.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.isMesh) unified.mapsSeen.push((mesh.material as THREE.MeshStandardMaterial).map);
    });
    return { resolution: 2048, dispose: () => {} };
  }),
}));

describe('the unified bake path', () => {
  it('drops the embedded neutral trim before the baked materials copy it', async () => {
    const trim = new THREE.Texture();
    const disposeTrim = vi.spyOn(trim, 'dispose');
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ map: trim })));

    await loadLightmaps({
      gltf: { scene } as unknown as GLTF,
      config: { baseUrl: '/maps/', manifest: 'lightmaps.json', desktop1024: [] },
      renderer: {} as THREE.WebGLRenderer,
      terrain: null,
    });

    expect(unified.mapsSeen).toEqual([null]);
    expect(disposeTrim).toHaveBeenCalledOnce();
  });
});
