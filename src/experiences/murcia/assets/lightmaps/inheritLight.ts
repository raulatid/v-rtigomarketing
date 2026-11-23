import * as THREE from 'three';
import { LIGHTMAP_ST_ATTRIBUTE } from './lightmapMaterial';
import { SupportIndex, type SupportHit, type SupportSurface } from './supportIndex';
import {
  DEFAULT_SHADE, sampleParapetFace, sampleWindowWall, windowFaceShade, type InheritanceShade,
} from './lightInheritance';

/**
 * Light inheritance: windows and the procedural rooftop parapets have no
 * atlas cells of their own; they read the baked light of the wall or roof
 * they stand on (`lightInheritance.ts` for the rules, report
 * `docs/audits/reports/murcia-light-and-geometry-alternatives-2026-11-20.md` §3).
 *
 * The GLB marks them with `extras.light_inheritance`: `"window"` on the
 * facade-record window nodes (`facadeRecords.ts`), `"parapet"` on
 * `Rooftop_Parapets__*`. They carry no `lightmap_atlas`, so the loader skips
 * them; once it has lit the supports, this replaces each marked node, in
 * place, with one mesh per support atlas whose `uv1` (parapets) or instance
 * ST (windows) points at the support's texels. A city without marked nodes
 * (deliveries up to v8) is left as it is.
 *
 * Runs once per load, on the main thread, before anything else walks the
 * city's materials: with the v8 city it took about 0.4 s for 19,129 windows
 * and 12,856 parapet faces (headless Chromium, 2026-11-23).
 */
export interface InheritedLight {
  /** Lines for the debug console: what inherited, from where, and what fell back. */
  readonly report: readonly string[];
  /** Puts the original nodes back and releases what was built. */
  dispose(): void;
}

/** The loader's lit material for `source` on atlas `key`. */
export type InheritedMaterial = (source: THREE.Material, key: string, instanced: boolean) => THREE.Material;

/** The surfaces details may inherit from: the central district and the outer rings. */
const SUPPORT = /^(Edificios_Procedurales__|CITY_[BC]_SIMPLIFIED$)/;

/** How far outside a window's outline its wall is read, in metres. */
const BESIDE = 0.25;
/**
 * The last resort for a window or parapet face with no wall or roof where the
 * rules look (one window and 9 parapet faces of the v8 city): the nearest
 * support in any orientation within this many metres, read flat.
 */
const FALLBACK_REACH = 5;
const anySupport = () => true;

export function inheritLight(
  root: THREE.Object3D, materialFor: InheritedMaterial, shade: InheritanceShade = DEFAULT_SHADE,
): InheritedLight | null {
  const windows: THREE.InstancedMesh[] = [];
  const parapets: THREE.Mesh[] = [];
  const surfaces: SupportSurface[] = [];
  root.updateMatrixWorld(true);
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const kind = mesh.userData.light_inheritance;
    if (kind !== undefined) {
      if (Array.isArray(mesh.material)) throw new Error(`[inherit] multi-material node: ${mesh.name}`);
      if (kind === 'window' && (mesh as THREE.InstancedMesh).isInstancedMesh) windows.push(mesh as THREE.InstancedMesh);
      else if (kind === 'parapet' && !(mesh as THREE.InstancedMesh).isInstancedMesh) parapets.push(mesh);
      else throw new Error(`[inherit] unknown light_inheritance ${String(kind)}: ${mesh.name}`);
      return;
    }
    if ((mesh as THREE.InstancedMesh).isInstancedMesh || !SUPPORT.test(mesh.name)) return;
    const key = mesh.userData.lightmap_atlas;
    const uv = mesh.geometry.getAttribute('uv1');
    if (typeof key !== 'string' || !uv || Array.isArray(mesh.material) || !(mesh.material as THREE.MeshBasicMaterial).lightMap) return;
    surfaces.push({ key, positions: worldPositions(mesh), index: mesh.geometry.index?.array ?? null, uv: plain(uv) });
  });
  if (!windows.length && !parapets.length) return null;
  if (!surfaces.length) throw new Error('[inherit] no lit supports');

  const started = performance.now();
  const index = new SupportIndex(surfaces);
  const report: string[] = [];
  const replaced: Array<{ original: THREE.Mesh; parent: THREE.Object3D; copies: THREE.Mesh[] }> = [];
  const geometries: THREE.BufferGeometry[] = [];

  const replace = (original: THREE.Mesh, copies: THREE.Mesh[]) => {
    const parent = original.parent!;
    for (const copy of copies) {
      copy.name = original.name;
      copy.position.copy(original.position);
      copy.quaternion.copy(original.quaternion);
      copy.scale.copy(original.scale);
      copy.frustumCulled = original.frustumCulled;
      copy.renderOrder = original.renderOrder;
      copy.userData = { ...original.userData };
      parent.add(copy);
    }
    original.removeFromParent();
    replaced.push({ original, parent, copies });
  };

  // --- Windows --------------------------------------------------------------
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const out = new THREE.Vector3();
  for (const mesh of windows) {
    const source = mesh.material as THREE.Material;
    const box = mesh.geometry.boundingBox ?? new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position') as THREE.BufferAttribute);
    // Beside the window, not behind it: the wall was baked with the window in
    // front of it, so the texels it covers hold the window's own shadow.
    // Right, then left, then under the sill; the centre only if none of those
    // is on a wall.
    const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2;
    const probes = [
      new THREE.Vector3(box.max.x + BESIDE, cy, 0),
      new THREE.Vector3(box.min.x - BESIDE, cy, 0),
      new THREE.Vector3(cx, box.min.y - BESIDE, 0),
      new THREE.Vector3(cx, cy, 0),
    ];
    const groups = new Map<string, { instances: number[]; uv: number[] }>();
    const unlit: number[] = [];
    let fallback = 0;
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, matrix);
      matrix.premultiply(mesh.matrixWorld);
      out.set(0, 0, 1).transformDirection(matrix);
      let hit: SupportHit | null = null;
      for (const probe of probes) {
        point.copy(probe).applyMatrix4(matrix);
        hit = sampleWindowWall(index, point.x, point.y, point.z, out.x, out.y, out.z);
        if (hit) break;
      }
      if (!hit) {
        hit = index.nearest(point.x, point.y, point.z, FALLBACK_REACH, anySupport);
        if (hit) fallback += 1;
      }
      if (!hit) { unlit.push(i); continue; }
      let group = groups.get(hit.key);
      if (!group) groups.set(hit.key, group = { instances: [], uv: [] });
      group.instances.push(i);
      group.uv.push(hit.u, hit.v);
    }
    const shaded = shadedPrototype(mesh.geometry, (nx, ny, nz) => windowFaceShade(nx, ny, nz, shade));
    geometries.push(shaded);
    const copies: THREE.Mesh[] = [];
    for (const [key, group] of groups) {
      const st = new Float32Array(group.instances.length * 4);
      group.instances.forEach((_, k) => st.set([0, 0, group.uv[k * 2], group.uv[k * 2 + 1]], k * 4));
      const geometry = shareAttributes(shaded);
      geometry.setAttribute(LIGHTMAP_ST_ATTRIBUTE, new THREE.InstancedBufferAttribute(st, 4));
      geometries.push(geometry);
      copies.push(instancedSubset(mesh, geometry, materialFor(source, key, true), group.instances));
    }
    if (unlit.length) copies.push(instancedSubset(mesh, mesh.geometry, source, unlit));
    replace(mesh, copies);
    report.push(`${mesh.name}: ${mesh.count - unlit.length}/${mesh.count} inherit ` +
      `(${[...groups].map(([k, g]) => `${k} ${g.instances.length}`).join(', ')}), ${fallback} by the fallback`);
  }

  // --- Parapets -------------------------------------------------------------
  const tri = new Float64Array(9);
  for (const mesh of parapets) {
    const source = mesh.material as THREE.Material;
    const flat = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const position = flat.getAttribute('position');
    const faces = position.count / 3;
    const byKey = new Map<string, FaceLight[]>();
    const unlit: FaceLight[] = [];
    let fallback = 0;
    for (let f = 0; f < faces; f += 1) {
      for (let c = 0; c < 3; c += 1) {
        point.fromBufferAttribute(position, f * 3 + c).applyMatrix4(mesh.matrixWorld);
        tri[c * 3] = point.x; tri[c * 3 + 1] = point.y; tri[c * 3 + 2] = point.z;
      }
      let light: FaceLight | null = null;
      const sampled = sampleParapetFace(index, tri, shade);
      if (sampled) {
        light = { face: f, key: sampled.key, uv: sampled.uv, shade: sampled.shade };
      } else {
        const hit = index.nearest((tri[0] + tri[3] + tri[6]) / 3, (tri[1] + tri[4] + tri[7]) / 3, (tri[2] + tri[5] + tri[8]) / 3, FALLBACK_REACH, anySupport);
        if (hit) {
          fallback += 1;
          light = { face: f, key: hit.key, uv: [hit.u, hit.v, hit.u, hit.v, hit.u, hit.v], shade: 1 };
        }
      }
      if (!light) { unlit.push({ face: f, key: '', uv: [], shade: 1 }); continue; }
      let list = byKey.get(light.key);
      if (!list) byKey.set(light.key, list = []);
      list.push(light);
    }
    const copies: THREE.Mesh[] = [];
    for (const [key, list] of byKey) {
      const geometry = pickFaces(flat, list, true);
      geometries.push(geometry);
      copies.push(new THREE.Mesh(geometry, materialFor(source, key, false)));
    }
    if (unlit.length) {
      const geometry = pickFaces(flat, unlit, false);
      geometries.push(geometry);
      copies.push(new THREE.Mesh(geometry, source));
    }
    if (flat !== mesh.geometry) flat.dispose();
    replace(mesh, copies);
    report.push(`${mesh.name}: ${faces - unlit.length}/${faces} faces inherit ` +
      `(${[...byKey].map(([k, l]) => `${k} ${l.length}`).join(', ')}), ${fallback} by the fallback`);
  }
  report.push(`[inherit] built in ${(performance.now() - started).toFixed(0)} ms from ${index.size} support triangles`);

  return {
    report,
    dispose() {
      for (const { original, parent, copies } of replaced) {
        for (const copy of copies) copy.removeFromParent();
        parent.add(original);
      }
      replaced.length = 0;
      for (const geometry of geometries) geometry.dispose();
      geometries.length = 0;
    },
  };
}

interface FaceLight {
  face: number;
  key: string;
  /** uv per corner, 6 values; empty when the face keeps its own material. */
  uv: readonly number[];
  shade: number;
}

function worldPositions(mesh: THREE.Mesh): Float32Array {
  const attribute = mesh.geometry.getAttribute('position');
  const out = new Float32Array(attribute.count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < attribute.count; i += 1) {
    v.fromBufferAttribute(attribute, i).applyMatrix4(mesh.matrixWorld);
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
  }
  return out;
}

/** Plain float values of a possibly normalized or interleaved attribute. */
function plain(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute): Float32Array {
  const out = new Float32Array(attribute.count * attribute.itemSize);
  for (let i = 0; i < attribute.count; i += 1) {
    for (let c = 0; c < attribute.itemSize; c += 1) out[i * attribute.itemSize + c] = attribute.getComponent(i, c);
  }
  return out;
}

/**
 * The window prototype, one vertex per face corner, its vertex colour times
 * the shade of the face's LOCAL normal, and a zero `uv1`: the instance ST
 * alone places the lightmap sample.
 */
function shadedPrototype(source: THREE.BufferGeometry, shadeOf: (nx: number, ny: number, nz: number) => number): THREE.BufferGeometry {
  const plainGeometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    if (name !== LIGHTMAP_ST_ATTRIBUTE) plainGeometry.setAttribute(name, attribute);
  }
  plainGeometry.setIndex(source.index);
  const flat = source.index ? plainGeometry.toNonIndexed() : plainGeometry;
  const position = flat.getAttribute('position');
  const color = flat.getAttribute('color');
  const size = color?.itemSize ?? 3;
  const shaded = new Float32Array(position.count * size);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let f = 0; f < position.count / 3; f += 1) {
    a.fromBufferAttribute(position, f * 3);
    b.fromBufferAttribute(position, f * 3 + 1);
    c.fromBufferAttribute(position, f * 3 + 2);
    const n = b.sub(a).cross(c.sub(a)).normalize();
    const factor = shadeOf(n.x, n.y, n.z);
    for (let k = f * 3; k < f * 3 + 3; k += 1) {
      for (let ch = 0; ch < size; ch += 1) {
        const value = color ? color.getComponent(k, ch) : 1;
        shaded[k * size + ch] = ch < 3 ? value * factor : value;
      }
    }
  }
  flat.setAttribute('color', new THREE.BufferAttribute(shaded, size));
  flat.setAttribute('uv1', new THREE.BufferAttribute(new Float32Array(position.count * 2), 2));
  return flat;
}

function shareAttributes(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) geometry.setAttribute(name, attribute);
  geometry.setIndex(source.index);
  return geometry;
}

function instancedSubset(mesh: THREE.InstancedMesh, geometry: THREE.BufferGeometry, material: THREE.Material, instances: readonly number[]): THREE.InstancedMesh {
  const copy = new THREE.InstancedMesh(geometry, material, instances.length);
  const matrix = new THREE.Matrix4();
  instances.forEach((i, k) => { mesh.getMatrixAt(i, matrix); copy.setMatrixAt(k, matrix); });
  copy.computeBoundingBox();
  copy.computeBoundingSphere();
  return copy;
}

/**
 * The listed faces of a non-indexed geometry. With `inherit`, each carries
 * its inherited `uv1` and its colour (white if it had none) times its shade.
 */
function pickFaces(flat: THREE.BufferGeometry, list: readonly FaceLight[], inherit: boolean): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const vertices = list.length * 3;
  for (const [name, attribute] of Object.entries(flat.attributes)) {
    if (inherit && name === 'uv1') continue;
    const size = attribute.itemSize;
    const data = new Float32Array(vertices * size);
    list.forEach(({ face, shade }, k) => {
      for (let c = 0; c < 3; c += 1) {
        for (let ch = 0; ch < size; ch += 1) {
          let value = attribute.getComponent(face * 3 + c, ch);
          if (inherit && name === 'color' && ch < 3) value *= shade;
          data[(k * 3 + c) * size + ch] = value;
        }
      }
    });
    geometry.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  if (inherit) {
    const uv1 = new Float32Array(vertices * 2);
    list.forEach(({ uv }, k) => uv1.set(uv, k * 6));
    geometry.setAttribute('uv1', new THREE.BufferAttribute(uv1, 2));
    if (!flat.getAttribute('color')) {
      const color = new Float32Array(vertices * 3);
      list.forEach(({ shade }, k) => color.fill(shade, k * 9, k * 9 + 9));
      geometry.setAttribute('color', new THREE.BufferAttribute(color, 3));
    }
  }
  geometry.computeBoundingSphere();
  return geometry;
}
