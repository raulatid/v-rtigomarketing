import * as THREE from 'three';
import { LIGHTMAP_ST_ATTRIBUTE } from './lightmapMaterial';
import type { SupportSurface } from './supportIndex';
import { DEFAULT_SHADE, WINDOW_PROBES as PROBES, windowFaceShade, type InheritanceShade } from './lightInheritance';
// Types only: the queries themselves are the worker's, and a static import
// would put them in the city's chunk as well, which is in the initial JS.
import type { InheritanceInput, InheritanceSolution, ParapetQuery, WindowQuery } from './inheritanceSolve';

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
 * Runs once per load, before anything else walks the city's materials, in
 * three steps: the scene is read into plain arrays here, the queries are
 * answered by `solve` (a worker in the page, `inheritanceSolve.ts`), and the
 * meshes are built here from the answer. The queries are the cost: with the
 * v9 city ~0.4 s of main thread on a desktop and over 2 s with the CPU at 4x,
 * in one task, right after the h1 landed (measured 2026-11-25).
 */
export interface InheritedLight {
  /** Lines for the debug console: what inherited, from where, and what fell back. */
  readonly report: readonly string[];
  /** Puts the original nodes back and releases what was built. */
  dispose(): void;
}

/** The loader's lit material for `source` on atlas `key`. */
export type InheritedMaterial = (source: THREE.Material, key: string, instanced: boolean) => THREE.Material;

/** Answers the queries; `solveInWorker` in the page. */
export type InheritanceSolver = (input: InheritanceInput) => Promise<InheritanceSolution>;

/** The surfaces details may inherit from: the central district and the outer rings. */
const SUPPORT = /^(Edificios_Procedurales__|CITY_[BC]_SIMPLIFIED$)/;

/** How far outside a window's outline its wall is read, in metres. */
const BESIDE = 0.25;

export async function inheritLight(
  root: THREE.Object3D, materialFor: InheritedMaterial, shade: InheritanceShade = DEFAULT_SHADE,
  solve: InheritanceSolver = solveInWorker,
): Promise<InheritedLight | null> {
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
    // The index is copied: the worker is handed what it reads, and this one is the geometry's own.
    const index = mesh.geometry.index?.array;
    surfaces.push({ key, positions: worldPositions(mesh), index: index ? index.slice() : null, uv: plain(uv) });
  });
  if (!windows.length && !parapets.length) return null;
  if (!surfaces.length) throw new Error('[inherit] no lit supports');

  const started = performance.now();

  // --- The queries ------------------------------------------------------------
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const out = new THREE.Vector3();
  const windowQueries = windows.map((mesh): WindowQuery => {
    const box = mesh.geometry.boundingBox ?? new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position') as THREE.BufferAttribute);
    // Beside the window, not behind it: the wall was baked with the window in
    // front of it, so the texels it covers hold the window's own shadow.
    // Right, then left, then under the sill; the centre only if none of those
    // is on a wall (`PROBES`, in this order).
    const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2;
    const local = [
      new THREE.Vector3(box.max.x + BESIDE, cy, 0),
      new THREE.Vector3(box.min.x - BESIDE, cy, 0),
      new THREE.Vector3(cx, box.min.y - BESIDE, 0),
      new THREE.Vector3(cx, cy, 0),
    ];
    const probes = new Float64Array(mesh.count * PROBES * 3);
    const outward = new Float64Array(mesh.count * 3);
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, matrix);
      matrix.premultiply(mesh.matrixWorld);
      out.set(0, 0, 1).transformDirection(matrix);
      outward[i * 3] = out.x; outward[i * 3 + 1] = out.y; outward[i * 3 + 2] = out.z;
      local.forEach((probe, k) => {
        point.copy(probe).applyMatrix4(matrix);
        probes.set([point.x, point.y, point.z], (i * PROBES + k) * 3);
      });
    }
    return { count: mesh.count, probes, out: outward };
  });
  const flats = parapets.map(mesh => mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry);
  const parapetQueries = parapets.map((mesh, m): ParapetQuery => {
    const position = flats[m].getAttribute('position');
    const triangles = new Float64Array(position.count * 3);
    for (let v = 0; v < position.count; v += 1) {
      point.fromBufferAttribute(position, v).applyMatrix4(mesh.matrixWorld);
      triangles[v * 3] = point.x; triangles[v * 3 + 1] = point.y; triangles[v * 3 + 2] = point.z;
    }
    return { triangles };
  });

  let solution: InheritanceSolution;
  try {
    solution = await solve({ surfaces, windows: windowQueries, parapets: parapetQueries, shade });
  } catch (error) {
    for (let m = 0; m < parapets.length; m += 1) if (flats[m] !== parapets[m].geometry) flats[m].dispose();
    throw error;
  }

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
  windows.forEach((mesh, m) => {
    const answer = solution.windows[m];
    const source = mesh.material as THREE.Material;
    const groups = new Map<string, { instances: number[]; uv: number[] }>();
    const unlit: number[] = [];
    for (let i = 0; i < mesh.count; i += 1) {
      if (answer.key[i] < 0) { unlit.push(i); continue; }
      const key = solution.keys[answer.key[i]];
      let group = groups.get(key);
      if (!group) groups.set(key, group = { instances: [], uv: [] });
      group.instances.push(i);
      group.uv.push(answer.uv[i * 2], answer.uv[i * 2 + 1]);
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
      `(${[...groups].map(([k, g]) => `${k} ${g.instances.length}`).join(', ')}), ${answer.fallback} by the fallback`);
  });

  // --- Parapets -------------------------------------------------------------
  parapets.forEach((mesh, m) => {
    const answer = solution.parapets[m];
    const flat = flats[m];
    const source = mesh.material as THREE.Material;
    const faces = answer.key.length;
    const byKey = new Map<string, FaceLight[]>();
    const unlit: FaceLight[] = [];
    for (let f = 0; f < faces; f += 1) {
      if (answer.key[f] < 0) { unlit.push({ face: f, key: '', uv: [], shade: 1 }); continue; }
      const key = solution.keys[answer.key[f]];
      let list = byKey.get(key);
      if (!list) byKey.set(key, list = []);
      list.push({ face: f, key, uv: answer.uv.subarray(f * 6, f * 6 + 6), shade: answer.shade[f] });
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
      `(${[...byKey].map(([k, l]) => `${k} ${l.length}`).join(', ')}), ${answer.fallback} by the fallback`);
  });
  report.push(`[inherit] built in ${(performance.now() - started).toFixed(0)} ms from ${solution.supports} support triangles`);

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

/**
 * The queries in a worker of their own, gone when it answers.
 *
 * No main-thread fallback: the city's own decoders (DRACO, KTX2) run in
 * workers, so where none can start the city cannot load either; and the
 * queries' code would cost the initial JS every visit (it counts every
 * chunk). Tests hand `inheritLight` a solver of their own.
 */
export function solveInWorker(input: InheritanceInput): Promise<InheritanceSolution> {
  return new Promise<InheritanceSolution>((resolve, reject) => {
    const worker = new Worker(new URL('./inheritanceWorker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (event: MessageEvent<InheritanceSolution>) => {
      worker.terminate();
      resolve(event.data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      worker.terminate();
      reject(new Error(`[inherit] worker failed: ${event.message}`));
    };
    // Handed over, not copied: every array here was made for the queries.
    worker.postMessage(input, inputTransfer(input));
  });
}

function inputTransfer(input: InheritanceInput): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  for (const s of input.surfaces) {
    for (const a of [s.positions, s.uv, s.index]) if (ArrayBuffer.isView(a)) buffers.add(a.buffer as ArrayBuffer);
  }
  for (const w of input.windows) buffers.add(w.probes.buffer as ArrayBuffer).add(w.out.buffer as ArrayBuffer);
  for (const p of input.parapets) buffers.add(p.triangles.buffer as ArrayBuffer);
  return [...buffers];
}

interface FaceLight {
  face: number;
  key: string;
  /** uv per corner, 6 values; empty when the face keeps its own material. */
  uv: ArrayLike<number>;
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
