import { expect, it } from 'vitest';
import * as THREE from 'three';
import { splitTerrainMeasurement } from './splitTerrainMeasurement';

it('measures every split part in world space without hiding or joining the visible ground', () => {
  const root = new THREE.Group();
  root.position.set(-200, 2, 300);
  const parts = [-50, 50].map(x => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(80, 1, 100));
    mesh.position.x = x;
    mesh.userData.lightmap_atlas = 'ground-Outer';
    root.add(mesh);
    return mesh;
  });
  const before = new THREE.Box3().setFromObject(root);
  const proxy = splitTerrainMeasurement(root)!;
  expect(new THREE.Box3().setFromObject(proxy).equals(before)).toBe(true);
  expect(proxy.visible).toBe(false);
  expect(parts.every(p => p.visible && p.parent === root)).toBe(true);
  expect(proxy.geometry.getAttribute('position').count).toBe(8);
  expect(splitTerrainMeasurement(root)).toBe(proxy);
});

it('does not invent terrain for an unrelated group', () => {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.BoxGeometry()));
  expect(splitTerrainMeasurement(group)).toBeNull();
});
