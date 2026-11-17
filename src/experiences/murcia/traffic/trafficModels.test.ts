import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { TRAFFIC_KINDS } from './trafficConfig';

// At runtime a model that breaks the contract only warns and its kind draws
// without it; here it fails before it ships. The contract is
// `docs/murcia/blender-export-contract.md` §8: one mesh, one material, vertex
// colours and a `_TONE` mask that marks the body the tones paint.
describe('the vehicle models in TRAFFIC_KINDS', () => {
  const loader = new GLTFLoader();
  for (const kind of TRAFFIC_KINDS) {
    for (const path of kind.models) {
      it(`${path} is one mesh with one material, vertex colours and a _TONE mask`, async () => {
        const bytes = readFileSync(resolve('public', path.replace(/^\//, '')));
        const gltf = await loader.parseAsync(
          bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          '',
        );
        const meshes: THREE.Mesh[] = [];
        gltf.scene.traverse((node) => {
          if ((node as THREE.Mesh).isMesh) meshes.push(node as THREE.Mesh);
        });
        expect(meshes).toHaveLength(1);
        const mesh = meshes[0]!;
        expect(Array.isArray(mesh.material)).toBe(false);
        expect((mesh.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
        const position = mesh.geometry.getAttribute('position');
        const mask = mesh.geometry.getAttribute('_tone');
        expect(mesh.geometry.getAttribute('color')).toBeDefined();
        expect(mask?.itemSize).toBe(1);
        expect(mask?.count).toBe(position.count);
        // A body to paint, and something that keeps its own colour.
        const values = Array.from({ length: mask!.count }, (_, i) => mask!.getX(i));
        expect(values.every((v) => v === 0 || v === 1)).toBe(true);
        expect(values).toContain(1);
        expect(values).toContain(0);
      });
    }
  }
});
