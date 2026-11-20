import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadUnifiedLightmaps } from './loadUnifiedLightmaps';

const decoder = vi.hoisted(() => ({ parse: vi.fn(), release: vi.fn() }));
vi.mock('../../../../graphics/decoders', () => ({
  acquireKtx2Loader: () => ({ parse: decoder.parse }),
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
    const buffer = new ArrayBuffer(8);
    decoder.parse.mockImplementation((_buffer: ArrayBuffer, onLoad: (t: THREE.Texture) => void) => onLoad(texture));
    const fetch = vi.fn(async (url: string) => url.endsWith('.ktx2') ? { ok: true, arrayBuffer: async () => buffer } : { ok: true, json: async () => ({
      uvChannel: 1, requiredNames: [lobby.name], atlases: { tower: {
        threeLightMapIntensity: Math.PI * 4, variants: {
          1024: { file: 'tower-1024.ktx2', bytes: 100, mipLevels: 1 },
          2048: { file: 'tower-2048.ktx2', bytes: 200, mipLevels: 2 },
        },
      } },
    }) });
    vi.stubGlobal('fetch', fetch);
    const handle = await loadUnifiedLightmaps({ scene } as unknown as GLTF, {} as THREE.WebGLRenderer, '/maps/', 'lightmaps.json', 1024);
    expect(handle).not.toBeNull();
    expect(fetch).toHaveBeenCalledWith('/maps/tower-1024.ktx2');
    expect(decoder.parse).toHaveBeenCalledOnce();
    expect(decoder.parse.mock.calls[0][0]).toBe(buffer);
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

describe('unified atlas loading order', () => {
  it('requests every atlas up front and still decodes one at a time, in order', async () => {
    const scene = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('uv1', new THREE.Float32BufferAttribute([0, 0], 2));
    for (const atlas of ['north', 'south']) {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
      mesh.userData = { lightmap_atlas: atlas };
      scene.add(mesh);
    }
    const variants = (name: string) => ({
      threeLightMapIntensity: 1, variants: {
        1024: { file: `${name}-1024.ktx2`, bytes: 100, mipLevels: 1 },
        2048: { file: `${name}-2048.ktx2`, bytes: 200, mipLevels: 1 },
      },
    });
    const buffers = new Map<string, ArrayBuffer>();
    const fetch = vi.fn(async (url: string) => {
      if (!url.endsWith('.ktx2')) {
        return { ok: true, json: async () => ({ uvChannel: 1, requiredNames: [], atlases: { north: variants('north'), south: variants('south') } }) };
      }
      const buffer = new ArrayBuffer(8);
      buffers.set(url, buffer);
      return { ok: true, arrayBuffer: async () => buffer };
    });
    vi.stubGlobal('fetch', fetch);
    const pending: Array<() => void> = [];
    decoder.parse.mockImplementation((_buffer: ArrayBuffer, onLoad: (t: THREE.Texture) => void) => {
      pending.push(() => onLoad(new THREE.Texture()));
    });

    const loading = loadUnifiedLightmaps({ scene } as unknown as GLTF, {} as THREE.WebGLRenderer, '/maps/', 'lightmaps.json', 1024);
    await vi.waitFor(() => expect(decoder.parse).toHaveBeenCalledOnce());
    expect(fetch).toHaveBeenCalledWith('/maps/north-1024.ktx2');
    expect(fetch).toHaveBeenCalledWith('/maps/south-1024.ktx2');
    expect(decoder.parse.mock.calls[0][0]).toBe(buffers.get('/maps/north-1024.ktx2'));
    // The second decode waits for the first, however early its bytes arrived.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(decoder.parse).toHaveBeenCalledOnce();

    pending.shift()!();
    await vi.waitFor(() => expect(decoder.parse).toHaveBeenCalledTimes(2));
    expect(decoder.parse.mock.calls[1][0]).toBe(buffers.get('/maps/south-1024.ktx2'));
    pending.shift()!();
    expect(await loading).not.toBeNull();
  });

  it('gives up cleanly when an atlas download fails', async () => {
    const scene = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('uv1', new THREE.Float32BufferAttribute([0, 0], 2));
    const material = new THREE.MeshStandardMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.userData = { lightmap_atlas: 'north' };
    scene.add(mesh);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('.ktx2') ? { ok: false, status: 404 } : { ok: true, json: async () => ({
      uvChannel: 1, requiredNames: [], atlases: { north: { threeLightMapIntensity: 1, variants: {
        1024: { file: 'north-1024.ktx2', bytes: 100, mipLevels: 1 },
        2048: { file: 'north-2048.ktx2', bytes: 200, mipLevels: 1 },
      } } },
    }) }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    expect(await loadUnifiedLightmaps({ scene } as unknown as GLTF, {} as THREE.WebGLRenderer, '/maps/', 'lightmaps.json', 1024)).toBeNull();
    expect(decoder.parse).not.toHaveBeenCalled();
    expect(mesh.material).toBe(material);
    expect(decoder.release).toHaveBeenCalledOnce();
  });
});

describe('instanced receivers', () => {
  const only1024 = (name: string) => ({ uvChannel: 1, requiredNames: [], atlases: { [name]: {
    threeLightMapIntensity: 1, variants: { 1024: { file: `${name}-1024.ktx2`, bytes: 100, mipLevels: 1 } },
  } } });
  const stubAtlas = (name: string) => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.endsWith('.ktx2')
      ? { ok: true, arrayBuffer: async () => new ArrayBuffer(8) }
      : { ok: true, json: async () => only1024(name) }));
    decoder.parse.mockImplementation((_buffer: ArrayBuffer, onLoad: (t: THREE.Texture) => void) => onLoad(new THREE.Texture()));
  };
  const prototype = () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
    geometry.setAttribute('uv1', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
    geometry.setAttribute('_tone', new THREE.Float32BufferAttribute([1, 0, 1], 1));
    return geometry;
  };

  it('gives a toned prop its mask and its per-instance colour, on a geometry of its own', async () => {
    const shared = prototype();
    const bench = new THREE.InstancedMesh(shared, new THREE.MeshStandardMaterial({ vertexColors: true }), 2);
    bench.userData = { lightmap_atlas: 'props', instance_st_accessor: 7, instance_tone_accessor: 8 };
    const scene = new THREE.Group(); scene.add(bench);
    const st = new THREE.BufferAttribute(new Uint16Array(8).fill(32768), 4, true);
    const tone = new THREE.BufferAttribute(new Uint16Array([65535, 0, 0, 0, 65535, 0]), 3, true);
    const parser = { getDependency: vi.fn(async (_type: string, index: number) => (index === 7 ? st : tone)) };
    stubAtlas('props');
    const handle = await loadUnifiedLightmaps({ scene, parser } as unknown as GLTF, {} as THREE.WebGLRenderer, '/maps/', 'lightmaps.json', 2048);
    expect(handle).not.toBeNull();
    expect(bench.geometry).not.toBe(shared);
    expect(bench.geometry.getAttribute('toneMask')).toBe(shared.getAttribute('_tone'));
    const instanceTone = bench.geometry.getAttribute('instanceTone') as THREE.InstancedBufferAttribute;
    expect(instanceTone).toBeInstanceOf(THREE.InstancedBufferAttribute);
    expect(instanceTone.normalized).toBe(true);
    expect(instanceTone.getX(0)).toBeCloseTo(1, 5);
    expect(instanceTone.getY(1)).toBeCloseTo(1, 5);
    // The shared prototype is left as it was.
    expect(shared.getAttribute('instanceTone')).toBeUndefined();
    const material = bench.material as unknown as THREE.MeshBasicMaterial;
    const shader = { vertexShader: '#include <common>\n#include <uv_vertex>\n#include <color_vertex>\n', fragmentShader: '#include <common>\ntexture2D( lightMap, vLightMapUv )', uniforms: {} };
    material.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.vertexShader).toContain('vColor.xyz = mix( vColor.xyz, instanceTone, toneMask );');
    expect(material.customProgramCacheKey()).toContain('true-true');
  });

  it('takes the ST a facade expansion already put on the geometry', async () => {
    const geometry = prototype();
    geometry.deleteAttribute('_tone');
    geometry.setAttribute('_LIGHTMAP_ST', new THREE.InstancedBufferAttribute(new Float32Array(8), 4));
    const windows = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), 2);
    windows.userData = { lightmap_atlas: 'windows', instance_st_builtin: true };
    const scene = new THREE.Group(); scene.add(windows);
    stubAtlas('windows');
    const handle = await loadUnifiedLightmaps({ scene, parser: {} } as unknown as GLTF, {} as THREE.WebGLRenderer, '/maps/', 'lightmaps.json', 1024);
    expect(handle).not.toBeNull();
    expect(windows.geometry).toBe(geometry);
    expect(windows.material).toBeInstanceOf(THREE.MeshBasicMaterial);
  });
});
