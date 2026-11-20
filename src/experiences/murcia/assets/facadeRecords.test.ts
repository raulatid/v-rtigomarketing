import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FACADE_RECORD_STRIDE, buildFacadeInstances, expandFacadeRecords } from './facadeRecords';
import { LIGHTMAP_ST_ATTRIBUTE } from './lightmaps/lightmapMaterial';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

const window = () => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.1), new THREE.MeshBasicMaterial());
  mesh.name = 'Instances_Ventana-001__instances-outer-0';
  mesh.userData = { lightmap_atlas: 'instances-outer-0' };
  return mesh;
};

// A 3 × 2 grid turned a quarter about +Y, and a single window.
const records = [
  10, 8, -20, Math.PI / 2, 3, 3.2, 3, 2,
  -5, 8, 4, 0.3, 0, 0, 1, 1,
];

describe('windows rebuilt from facade records', () => {
  it('places each window along the wall and up it, turned by the yaw', () => {
    const mesh = buildFacadeInstances(window(), records, 7, [10, 0.01, 4]);
    expect(mesh.count).toBe(7);
    const m = new THREE.Matrix4(); const p = new THREE.Vector3(); const q = new THREE.Quaternion(); const s = new THREE.Vector3();
    // (i, j) = (2, 1): two columns along (cos yaw, 0, -sin yaw) = (0, 0, -1), one row up.
    mesh.getMatrixAt(5, m); m.decompose(p, q, s);
    expect(p.x).toBeCloseTo(10, 5); expect(p.y).toBeCloseTo(11.2, 5); expect(p.z).toBeCloseTo(-26, 5);
    expect(q.angleTo(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2))).toBeLessThan(1e-6);
    expect(s.distanceTo(new THREE.Vector3(1, 1, 1))).toBeLessThan(1e-6);
    mesh.getMatrixAt(6, m); m.decompose(p, q, s);
    expect(p.toArray()).toEqual([-5, 8, 4]);
  });

  it('gives consecutive cells of the grid from the first, flipped into glTF UV', () => {
    const mesh = buildFacadeInstances(window(), records, 7, [10, 0.01, 4]);
    const st = mesh.geometry.getAttribute(LIGHTMAP_ST_ATTRIBUTE) as THREE.InstancedBufferAttribute;
    expect(st.count).toBe(7);
    // Window 6 is cell 10: column 0, row 1.
    expect(st.getX(6)).toBeCloseTo(0.08, 6);
    expect(st.getZ(6)).toBeCloseTo(0.01, 6);
    expect(st.getW(6)).toBeCloseTo(1 - 0.08 - 0.11, 6);
    expect(mesh.userData.instance_st_builtin).toBe(true);
    expect(mesh.userData.lightmap_atlas).toBe('instances-outer-0');
  });

  it('refuses records that do not add up to the instance count', () => {
    expect(() => buildFacadeInstances(window(), records, 6, [10, 0.01, 0])).toThrow('more windows');
    expect(() => buildFacadeInstances(window(), records, 8, [10, 0.01, 0])).toThrow('instance_count');
    expect(() => buildFacadeInstances(window(), records.slice(0, FACADE_RECORD_STRIDE + 1), 6, [10, 0.01, 0])).toThrow('ragged');
  });

  it('swaps the plain node for the instanced one in place', async () => {
    const scene = new THREE.Group(); const mesh = window();
    mesh.userData = { ...mesh.userData, facade_records_accessor: 3, instance_count: 7, instance_st_grid: [10, 0.01, 0] };
    scene.add(mesh);
    const gltf = { scene, parser: { getDependency: async () => new THREE.BufferAttribute(new Float32Array(records), 1) } } as unknown as GLTF;
    const [expanded] = await expandFacadeRecords(gltf);
    expect(scene.children).toEqual([expanded]);
    expect(expanded.isInstancedMesh).toBe(true);
    expect(expanded.name).toBe(mesh.name);
  });
});
