import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { inheritLight, type InheritedMaterial } from './inheritLight';
import { solveInheritance, type InheritanceInput } from './inheritanceSolve';
import { DEFAULT_SHADE } from './lightInheritance';
import { LIGHTMAP_ST_ATTRIBUTE } from './lightmapMaterial';

/**
 * A 10 × 10 m block, 20 m tall, centred on the origin: a roof at y = 20 and a
 * facade facing +X at x = 5, as one lit support whose lightmap UV is a linear
 * function of position (as in `lightInheritance.test.ts`).
 */
function support(): THREE.Mesh {
  const positions = [
    -5, 20, -5, 5, 20, -5, 5, 20, 5, -5, 20, 5, // roof
    5, 0, -5, 5, 0, 5, 5, 20, 5, 5, 20, -5, // facade
  ];
  const uv1: number[] = [];
  for (let i = 0; i < 4; i += 1) uv1.push((positions[i * 3] + 5) / 40, (positions[i * 3 + 2] + 5) / 40);
  for (let i = 4; i < 8; i += 1) uv1.push(0.5 + (positions[i * 3 + 2] + 5) / 40, positions[i * 3 + 1] / 40);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(uv1, 2));
  // Wound so the roof faces +Y and the facade +X.
  geometry.setIndex([0, 2, 1, 0, 3, 2, 4, 6, 5, 4, 7, 6]);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ lightMap: new THREE.Texture() }));
  mesh.name = 'Edificios_Procedurales__NE';
  mesh.userData = { lightmap_atlas: 'static-NE' };
  return mesh;
}

/** A 1 × 1.5 m window prototype facing local +Z, its back plane at z = 0. */
function windows(at: ReadonlyArray<[number, number, number]>): THREE.InstancedMesh {
  const geometry = new THREE.BoxGeometry(1, 1.5, 0.2).translate(0, 0, 0.1);
  geometry.deleteAttribute('normal');
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Array(geometry.getAttribute('position').count * 3).fill(1), 3));
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshBasicMaterial(), at.length);
  // Local +Z turned to world +X: the facade's way.
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  at.forEach((p, i) => mesh.setMatrixAt(i, new THREE.Matrix4().compose(new THREE.Vector3(...p), turn, new THREE.Vector3(1, 1, 1))));
  mesh.name = 'Instances_Ventana-001__windows';
  mesh.userData = { light_inheritance: 'window' };
  return mesh;
}

/** A parapet run along the roof's +X edge: its top and its outer face. */
function parapet(): THREE.Mesh {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    4.8, 21, -2, 5, 21, -2, 5, 21, 2, // top, facing +Y
    5, 20, -2, 5, 20, 2, 5, 21, 2, // outer, in the facade's plane
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Array(12).fill(0), 2));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = 'Rooftop_Parapets__NE';
  mesh.userData = { light_inheritance: 'parapet' };
  return mesh;
}

function city(windowsAt: ReadonlyArray<[number, number, number]>) {
  const root = new THREE.Group();
  const lit = support(); const glazing = windows(windowsAt); const rim = parapet();
  root.add(lit, glazing, rim);
  const lightMaterial = new THREE.MeshBasicMaterial();
  const materialFor = vi.fn((_source: THREE.Material, _key: string, _instanced: boolean) => lightMaterial);
  return { root, glazing, rim, lightMaterial, materialFor };
}

/** The page answers in a worker; there is none here, and the answer is the same. */
const inherit = (root: THREE.Object3D, materialFor: InheritedMaterial) =>
  inheritLight(root, materialFor, DEFAULT_SHADE, input => Promise.resolve(solveInheritance(input)));

describe('inheritLight', () => {
  it('leaves a city without marked nodes as it is', async () => {
    const root = new THREE.Group();
    root.add(support());
    expect(await inherit(root, () => new THREE.MeshBasicMaterial())).toBeNull();
  });

  it('replaces a window node with instances that read the wall beside each window', async () => {
    // On the facade; 3 m off it (only the fallback reaches); 40 m away (nothing does).
    const { root, glazing, materialFor, lightMaterial } = city([[5, 10, 0], [8, 10, 0], [45, 10, 0]]);
    const inherited = (await inherit(root, materialFor))!;
    expect(glazing.parent).toBeNull();
    const copies = root.children.filter(c => c.name === glazing.name) as THREE.InstancedMesh[];
    const lit = copies.find(c => c.material === lightMaterial)!;
    const unlit = copies.find(c => c.material === glazing.material)!;
    expect(lit.count).toBe(2);
    expect(unlit.count).toBe(1);
    expect(materialFor).toHaveBeenCalledWith(glazing.material, 'static-NE', true);
    // Probe right of the window: 0.75 m beside the centre, along the facade (-Z), at the window's height.
    const st = lit.geometry.getAttribute(LIGHTMAP_ST_ATTRIBUTE) as THREE.InstancedBufferAttribute;
    expect(st.getX(0)).toBe(0);
    expect(st.getY(0)).toBe(0);
    expect(st.getZ(0)).toBeCloseTo(0.5 + (-0.75 + 5) / 40, 2);
    expect(st.getW(0)).toBeCloseTo(10 / 40, 2);
    expect(lit.geometry.getAttribute('uv1')).toBeDefined();
    expect(inherited.report[0]).toContain('2/3 inherit');
    expect(inherited.report[0]).toContain('1 by the fallback');
  });

  it('shades the window faces: the front keeps its colour, the reveal darkens', async () => {
    const { root, glazing, lightMaterial } = city([[5, 10, 0]]);
    await inherit(root, () => lightMaterial);
    const lit = root.children.find(c => c.name === glazing.name) as THREE.InstancedMesh;
    const colour = lit.geometry.getAttribute('color');
    const values = new Set<number>();
    for (let i = 0; i < colour.count; i += 1) values.add(Number(colour.getX(i).toFixed(3)));
    expect([...values].sort()).toEqual([0.5, 0.6, 0.85, 1]);
  });

  it('gives each parapet face its roof or facade light', async () => {
    const { root, rim, materialFor, lightMaterial } = city([]);
    await inherit(root, materialFor);
    expect(rim.parent).toBeNull();
    const [copy] = root.children.filter(c => c.name === rim.name) as THREE.Mesh[];
    expect(copy.material).toBe(lightMaterial);
    expect(materialFor).toHaveBeenCalledWith(rim.material, 'static-NE', false);
    const uv1 = copy.geometry.getAttribute('uv1');
    expect(uv1.count).toBe(6);
    // The outer face reads the facade's top edge: u in the facade half of the atlas.
    for (let i = 3; i < 6; i += 1) expect(uv1.getX(i)).toBeGreaterThan(0.5);
    // The top reads the roof 1 m inside the parapet: u in the roof half.
    for (let i = 0; i < 3; i += 1) expect(uv1.getX(i)).toBeLessThan(0.5);
  });

  it('puts the original nodes back on dispose', async () => {
    const { root, glazing, rim, lightMaterial } = city([[5, 10, 0]]);
    const inherited = (await inherit(root, () => lightMaterial))!;
    inherited.dispose();
    expect(glazing.parent).toBe(root);
    expect(rim.parent).toBe(root);
    expect(root.children.filter(c => c.name === glazing.name)).toEqual([glazing]);
  });

  it('asks its solver once, with every window and parapet face, and builds from the answer', async () => {
    const { root, glazing, rim, lightMaterial } = city([[5, 10, 0], [45, 10, 0]]);
    const solve = vi.fn((input: InheritanceInput) => Promise.resolve(solveInheritance(input)));
    const inherited = (await inheritLight(root, () => lightMaterial, DEFAULT_SHADE, solve))!;
    expect(solve).toHaveBeenCalledTimes(1);
    const [input] = solve.mock.calls[0];
    expect(input.windows.map(w => w.count)).toEqual([2]);
    expect(input.parapets.map(p => p.triangles.length / 9)).toEqual([2]);
    expect(inherited.report[0]).toContain('1/2 inherit');
    expect(glazing.parent).toBeNull();
    expect(rim.parent).toBeNull();
  });

  it('leaves the scene as it was when the solver fails', async () => {
    const { root, glazing, rim, lightMaterial } = city([[5, 10, 0]]);
    const solve = () => Promise.reject(new Error('worker gone'));
    await expect(inheritLight(root, () => lightMaterial, DEFAULT_SHADE, solve)).rejects.toThrow('worker gone');
    expect(glazing.parent).toBe(root);
    expect(rim.parent).toBe(root);
  });

  it('refuses a marked node it does not know how to light', async () => {
    const { root, rim } = city([]);
    rim.userData.light_inheritance = 'cornice';
    await expect(inherit(root, () => new THREE.MeshBasicMaterial())).rejects.toThrow('unknown light_inheritance');
  });
});
