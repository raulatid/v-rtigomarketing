import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { applyCitySurfaceDepth } from './citySurfaceDepth';

describe('city surface depth', () => {
  it('isolates shared materials and retains lightmap shader hooks and occlusion', () => {
    const root = new THREE.Group();
    const source = new THREE.MeshBasicMaterial({ lightMap: new THREE.Texture() });
    source.onBeforeCompile = vi.fn();
    source.customProgramCacheKey = () => 'baked-atlas';
    const road = new THREE.Mesh(new THREE.PlaneGeometry(), source);
    road.userData.source_name = 'P3 Main Streets';
    const building = new THREE.Mesh(new THREE.BoxGeometry(), source);
    root.add(road, building);
    const handle = applyCitySurfaceDepth(root);
    const changed = road.material;
    expect(changed).not.toBe(source);
    expect(building.material).toBe(source);
    expect(source.polygonOffset).toBe(false);
    expect(changed.lightMap).toBe(source.lightMap);
    expect(changed.onBeforeCompile).toBe(source.onBeforeCompile);
    expect(changed.customProgramCacheKey()).toBe('baked-atlas');
    expect(changed.depthTest && changed.depthWrite).toBe(true);
    const disposed = vi.fn();
    changed.addEventListener('dispose', disposed);
    handle.dispose();
    handle.dispose();
    expect(road.material).toBe(source);
    expect(disposed).toHaveBeenCalledTimes(1);
  });

  it('partitions turf without losing reversed faces, markings or UVs', () => {
    const root = new THREE.Group();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0, 0, 0, 1, 1, 0, 0,
      2, 0, 0, 2, 0, 1, 3, 0, 0,
    ], 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute([
      0.1, 0.3, 0.05, 0.1, 0.3, 0.05, 0.1, 0.3, 0.05,
      1, 1, 1, 1, 1, 1, 1, 1, 1,
    ], 3));
    geometry.setAttribute('uv1', new THREE.Float32BufferAttribute([
      0, 0, 0, 1, 1, 0, 0.5, 0, 0.5, 1, 1, 0.5,
    ], 2));
    geometry.setIndex([0, 1, 2, 0, 2, 1, 3, 4, 5]);
    const source = new THREE.MeshBasicMaterial({ vertexColors: true });
    const mesh = new THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>(geometry, source);
    mesh.name = 'estadio-la-condomina';
    root.add(mesh);
    const handle = applyCitySurfaceDepth(root);
    expect(mesh.geometry.index?.count).toBe(9);
    expect(Array.from(mesh.geometry.index!.array)).toEqual([0, 2, 1, 3, 4, 5, 0, 1, 2]);
    expect(mesh.geometry.groups).toEqual([
      { start: 0, count: 6, materialIndex: 0 },
      { start: 6, count: 3, materialIndex: 1 },
    ]);
    expect(mesh.geometry.getAttribute('uv1').array).toEqual(geometry.getAttribute('uv1').array);
    expect(geometry.groups).toEqual([]);
    handle.dispose();
    expect(mesh.geometry).toBe(geometry);
    expect(mesh.material).toBe(source);
  });

  it('targets cathedral, campus base and paving without touching the roof or river', () => {
    const root = new THREE.Group();
    const names = ['Fachada_Murcia_15k', 'ARCH_Porcelain_White', 'Belluga_Radial_Paving__NW',
      'ARCH_Porcelain_White001', 'rio', 'estadio-cesped'];
    const meshes = names.map(name => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      mesh.name = name;
      root.add(mesh);
      return mesh;
    });
    const handle = applyCitySurfaceDepth(root);
    expect(meshes.map(mesh => (mesh.material as THREE.Material).polygonOffset))
      .toEqual([true, true, true, false, false, false]);
    handle.dispose();
  });
});
