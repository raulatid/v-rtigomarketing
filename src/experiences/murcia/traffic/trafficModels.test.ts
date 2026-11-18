import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { describe, expect, it } from 'vitest';
import { TRAFFIC_KINDS } from './trafficConfig';


/**
 * The vehicles are Draco-compressed (since 2026-11-18), and `DRACOLoader` needs
 * Workers and `fetch`. In Node this stands in for it with three's own glTF
 * decoder (`draco_decoder.js`, the build `public/draco/` copies) run directly,
 * implementing only the one method `GLTFLoader` calls. Every attribute comes
 * back as float32, which is what the contract below reads. Typed `any`: the
 * Emscripten module has no types.
 */
async function nodeDracoLoader() {
  const source = readFileSync(resolve('node_modules/three/examples/jsm/libs/draco/gltf/draco_decoder.js'), 'utf8');
  const factory = runInNewContext(source + '\n;DracoDecoderModule', { console, WebAssembly, TextDecoder, setTimeout, clearTimeout });
  const draco: any = await new Promise((done) => factory({ onModuleLoaded: (m: any) => { delete m.then; done(m); } }));
  return {
    preload() { return this; },
    decodeDracoFile(
      buffer: ArrayBuffer,
      onLoad: (geometry: THREE.BufferGeometry) => void,
      attributeIDs: Record<string, number>,
      _attributeTypes: unknown,
      _colorSpace: unknown,
      onError: (error: unknown) => void,
    ) {
      const decoder = new draco.Decoder();
      const mesh = new draco.Mesh();
      try {
        const bytes = new Int8Array(buffer);
        const status = decoder.DecodeArrayToMesh(bytes, bytes.byteLength, mesh);
        if (!status.ok()) throw new Error(status.error_msg());
        const geometry = new THREE.BufferGeometry();
        for (const [name, id] of Object.entries(attributeIDs)) {
          const attribute = decoder.GetAttributeByUniqueId(mesh, id);
          const values = new draco.DracoFloat32Array();
          decoder.GetAttributeFloatForAllPoints(mesh, attribute, values);
          const array = Float32Array.from({ length: values.size() }, (_, i) => values.GetValue(i));
          draco.destroy(values);
          geometry.setAttribute(name, new THREE.BufferAttribute(array, attribute.num_components()));
        }
        const index = new Uint32Array(mesh.num_faces() * 3);
        const ptr = draco._malloc(index.byteLength);
        decoder.GetTrianglesUInt32Array(mesh, index.byteLength, ptr);
        index.set(new Uint32Array(draco.HEAPU32.buffer, ptr, index.length));
        draco._free(ptr);
        geometry.setIndex(new THREE.BufferAttribute(index, 1));
        onLoad(geometry);
      } catch (error) {
        onError(error);
      } finally {
        draco.destroy(mesh);
        draco.destroy(decoder);
      }
    },
  };
}

// At runtime a model that breaks the contract only warns and its kind draws
// without it; here it fails before it ships. The contract is
// `docs/murcia/blender-export-contract.md` §8: one mesh, one material, vertex
// colours and a `_TONE` mask that marks the body the tones paint.
describe('the vehicle models in TRAFFIC_KINDS', () => {
  const loader = new GLTFLoader();
  const ready = nodeDracoLoader().then((draco) => loader.setDRACOLoader(draco as any));
  for (const kind of TRAFFIC_KINDS) {
    for (const path of kind.models) {
      it(`${path} is one mesh with one material, vertex colours and a _TONE mask`, async () => {
        await ready;
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
