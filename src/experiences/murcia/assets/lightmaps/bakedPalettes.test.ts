import { expect, it } from 'vitest';
import * as THREE from 'three';
import { applyCampusPalette } from '../../campus/campusPalette';
import { applyTowerPalette } from '../../landmark/towerScreen/towerPalette';

it('keeps baked campus and tower materials while allowing legacy palette application', () => {
  const root = new THREE.Group();
  const materials = ['ARCH_Porcelain_White', 'ARCH_Roof_Zinc'].map(name => {
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, lightMap: new THREE.Texture() });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), material);
    mesh.name = name;
    mesh.userData.lightmap_atlas = 'landmark';
    root.add(mesh);
    return { mesh, material };
  });
  applyCampusPalette(root);
  applyTowerPalette(root);
  for (const {mesh, material} of materials) {
    expect(mesh.material).toBe(material);
    expect(mesh.material.lightMap).not.toBeNull();
  }
});
