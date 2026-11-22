import * as THREE from 'three';
import { LIGHTMAP_ST_ATTRIBUTE, createLightmapMaterial } from './lightmapMaterial';
import { SupportIndex, type SupportSurface } from './supportIndex';
import { rasterizeWindowFront, type WindowFront } from './windowFront';
import {
  DEFAULT_SHADE, sampleParapetFace, sampleWindowWall, windowFaceShade, type InheritanceShade,
} from './lightInheritance';

/**
 * PROTOTYPE, debug builds only (`?inherit=1`): windows and rooftop parapets
 * read the light of the wall or roof they stand on instead of their own
 * atlas cells (`lightInheritance.ts`, and report
 * `docs/audits/reports/murcia-light-and-geometry-alternatives-2026-11-20.md` §3).
 *
 * Nothing in the delivery changes. The inherited copies are built from the
 * loaded scene, beside the originals, and `setEnabled` swaps which of the two
 * is visible, so both can be compared on the same frame. The originals' atlas
 * cells still download; what the prototype answers is whether the city looks
 * right without them, not what it would weigh.
 */
export interface LightInheritance {
  readonly enabled: boolean;
  setEnabled(on: boolean): void;
  /** Lines for the console: what was inherited and what kept its own light. */
  readonly report: readonly string[];
  dispose(): void;
}

/** The surfaces details may inherit from: the central district and the outer rings. */
const SUPPORT = /^(Edificios_Procedurales__|CITY_[BC]_SIMPLIFIED$)/;
const PARAPET = /^Rooftop_Parapets__/;

interface Atlas { texture: THREE.Texture; intensity: number }

/** How far outside a window's outline its wall is read, in metres. */
const BESIDE = 0.25;

/** Texels per side of a window's front picture (`windowFront.ts`). */
const FRONT_SIZE = 256;
/** How far in front of the prototype's back plane its quad stands, in metres. */
const FRONT_LIFT = 0.02;

/**
 * `debugKinds` paints each inherited parapet face by what it was classified
 * as, unlit: top white, outer blue, inner orange, bottom magenta.
 *
 * `windowFronts` draws each inheriting window as one quad that samples the
 * prototype's front picture (`windowFront.ts`, report §4) instead of the
 * prototype's geometry. The light is the same inherited constant either way.
 */
export function applyLightInheritance(
  root: THREE.Object3D, shade: InheritanceShade = DEFAULT_SHADE, debugKinds = false, windowFronts = false,
): LightInheritance {
  const started = performance.now();
  root.updateMatrixWorld(true);
  const report: string[] = [];
  const originals: THREE.Object3D[] = [];
  const copies: THREE.Mesh[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const materials = new Map<string, THREE.Material>();
  const textures: THREE.Texture[] = [];

  // --- Supports -------------------------------------------------------------
  const atlases = new Map<string, Atlas>();
  const surfaces: SupportSurface[] = [];
  const windows: THREE.InstancedMesh[] = [];
  const parapets: THREE.Mesh[] = [];
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) {
      if (mesh.userData.instance_st_builtin === true) windows.push(mesh as THREE.InstancedMesh);
      return;
    }
    if (PARAPET.test(mesh.name)) { parapets.push(mesh); return; }
    if (!SUPPORT.test(mesh.name)) return;
    const material = mesh.material as THREE.MeshBasicMaterial;
    const key = mesh.userData.lightmap_atlas;
    const uv = mesh.geometry.getAttribute('uv1');
    if (Array.isArray(mesh.material) || !material.lightMap || typeof key !== 'string' || !uv) return;
    atlases.set(key, { texture: material.lightMap, intensity: material.lightMapIntensity });
    surfaces.push({ key, positions: worldPositions(mesh), index: mesh.geometry.index?.array ?? null, uv: plain(uv) });
  });
  if (!surfaces.length) throw new Error('[inherit] no baked supports: are the lightmaps applied?');
  const index = new SupportIndex(surfaces);

  const materialFor = (source: THREE.Material, key: string, instanced: boolean, front?: THREE.Texture): THREE.Material => {
    const cacheKey = `${source.uuid}:${key}:${instanced}:${front?.uuid ?? ''}`;
    let material = materials.get(cacheKey);
    if (material) return material;
    const atlas = atlases.get(key)!;
    const size = (atlas.texture.image as { width: number }).width;
    const maxMip = Math.max(0, (atlas.texture.mipmaps?.length ?? 1) - 1);
    const built = createLightmapMaterial(source, {
      lightMap: atlas.texture, lightMapIntensity: atlas.intensity, atlasSize: size, maxMip,
      instanced, preserveAlbedo: true, programKey: `murcia-inherit-${instanced}-${front ? 'front-' : ''}${size}-${maxMip}`,
    });
    built.polygonOffset = source.polygonOffset;
    built.polygonOffsetFactor = source.polygonOffsetFactor;
    built.polygonOffsetUnits = source.polygonOffsetUnits;
    if (front) {
      // The picture replaces the white trim; its coverage decides what is window.
      built.map = front;
      built.alphaTest = 0.5;
      // The quad stands 2 cm off the wall: pulled forward so it never sinks into it.
      built.polygonOffset = true;
      built.polygonOffsetFactor = -1;
      built.polygonOffsetUnits = -1;
    }
    built.name = `${source.name} | inherit ${key}${front ? ' front' : ''}`;
    materials.set(cacheKey, built);
    return built;
  };
  const place = (copy: THREE.Mesh, original: THREE.Mesh, name: string) => {
    copy.name = name;
    copy.position.copy(original.position);
    copy.quaternion.copy(original.quaternion);
    copy.scale.copy(original.scale);
    copy.frustumCulled = original.frustumCulled;
    copy.renderOrder = original.renderOrder;
    copy.userData = { ...original.userData, light_inheritance: true };
    original.parent!.add(copy);
    copies.push(copy);
  };

  // --- Windows --------------------------------------------------------------
  const matrix = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const out = new THREE.Vector3();
  for (const mesh of windows) {
    const source = mesh.material as THREE.Material;
    const box = mesh.geometry.boundingBox ?? new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute('position') as THREE.BufferAttribute);
    // Beside the window, not behind it: the wall was baked with the window in
    // front of it, so the texels it covers hold the window's own shadow and
    // read near black (seen in the scene, 2026-11-20). Right, then left, then
    // under the sill; the centre only if none of those is on a wall.
    const cx = (box.min.x + box.max.x) / 2, cy = (box.min.y + box.max.y) / 2;
    const probes = [
      new THREE.Vector3(box.max.x + BESIDE, cy, 0),
      new THREE.Vector3(box.min.x - BESIDE, cy, 0),
      new THREE.Vector3(cx, box.min.y - BESIDE, 0),
      new THREE.Vector3(cx, cy, 0),
    ];
    const groups = new Map<string, { instances: number[]; uv: number[] }>();
    const own: number[] = [];
    for (let i = 0; i < mesh.count; i += 1) {
      mesh.getMatrixAt(i, matrix);
      matrix.premultiply(mesh.matrixWorld);
      out.set(0, 0, 1).transformDirection(matrix);
      let hit = null;
      for (const probe of probes) {
        point.copy(probe).applyMatrix4(matrix);
        hit = sampleWindowWall(index, point.x, point.y, point.z, out.x, out.y, out.z);
        if (hit) break;
      }
      if (!hit || !atlases.has(hit.key)) { own.push(i); continue; }
      let group = groups.get(hit.key);
      if (!group) groups.set(hit.key, group = { instances: [], uv: [] });
      group.instances.push(i);
      group.uv.push(hit.u, hit.v);
    }
    const shadeOf = (nx: number, ny: number, nz: number) => windowFaceShade(nx, ny, nz, shade);
    let shaded: THREE.BufferGeometry;
    let front: THREE.Texture | undefined;
    if (windowFronts) {
      const picture = frontOf(mesh.geometry, shadeOf);
      front = frontTexture(picture);
      textures.push(front);
      shaded = frontQuad(picture);
    } else {
      shaded = shadedPrototype(mesh.geometry, shadeOf);
    }
    geometries.push(shaded);
    for (const [key, group] of groups) {
      const st = new Float32Array(group.instances.length * 4);
      group.instances.forEach((_, k) => st.set([0, 0, group.uv[k * 2], group.uv[k * 2 + 1]], k * 4));
      const geometry = shareAttributes(shaded);
      geometry.setAttribute(LIGHTMAP_ST_ATTRIBUTE, new THREE.InstancedBufferAttribute(st, 4));
      geometries.push(geometry);
      place(instancedCopy(mesh, geometry, materialFor(source, key, true, front), group.instances), mesh, `${mesh.name}__inherit_${key}`);
    }
    if (own.length) {
      // Kept on their own cell, as today.
      const st = mesh.geometry.getAttribute(LIGHTMAP_ST_ATTRIBUTE) as THREE.InstancedBufferAttribute;
      const subset = new Float32Array(own.length * 4);
      own.forEach((i, k) => subset.set((st.array as Float32Array).subarray(i * 4, i * 4 + 4), k * 4));
      const geometry = shareAttributes(mesh.geometry);
      geometry.setAttribute(LIGHTMAP_ST_ATTRIBUTE, new THREE.InstancedBufferAttribute(subset, 4));
      geometries.push(geometry);
      place(instancedCopy(mesh, geometry, source, own), mesh, `${mesh.name}__inherit_own`);
    }
    originals.push(mesh);
    const prototypeTriangles = (mesh.geometry.index?.count ?? mesh.geometry.getAttribute('position').count) / 3;
    const drawn = windowFronts ? (mesh.count - own.length) * 2 + own.length * prototypeTriangles : mesh.count * prototypeTriangles;
    report.push(`${mesh.name}: ${mesh.count - own.length}/${mesh.count} inherit (${[...groups].map(([k, g]) => `${k} ${g.instances.length}`).join(', ')}), ` +
      `${windowFronts ? 'front quads' : 'geometry'}, ${drawn} of ${mesh.count * prototypeTriangles} triangles`);
  }

  // --- Parapets -------------------------------------------------------------
  // Per build, in `materials`, so `dispose` releases it with the rest.
  let kindMaterial: THREE.MeshBasicMaterial | null = null;
  const kindMaterialFor = (): THREE.MeshBasicMaterial => {
    if (!kindMaterial) {
      kindMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
      materials.set('debug-kinds', kindMaterial);
    }
    return kindMaterial;
  };
  const tri = new Float64Array(9);
  for (const mesh of parapets) {
    const source = mesh.material as THREE.Material;
    const flat = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const position = flat.getAttribute('position');
    const faces = position.count / 3;
    const byKey = new Map<string, Array<{ face: number; uv: number[]; shade: number; kind: string }>>();
    const kinds: Record<string, number> = {};
    for (let f = 0; f < faces; f += 1) {
      for (let c = 0; c < 3; c += 1) {
        point.fromBufferAttribute(position, f * 3 + c).applyMatrix4(mesh.matrixWorld);
        tri[c * 3] = point.x; tri[c * 3 + 1] = point.y; tri[c * 3 + 2] = point.z;
      }
      const light = sampleParapetFace(index, tri, shade);
      const key = light && atlases.has(light.key) ? light.key : '';
      if (light && key) kinds[light.kind] = (kinds[light.kind] ?? 0) + 1;
      let list = byKey.get(key);
      if (!list) byKey.set(key, list = []);
      list.push({ face: f, uv: light && key ? light.uv : [], shade: light && key ? light.shade : 1, kind: light?.kind ?? '' });
    }
    for (const [key, list] of byKey) {
      const geometry = pickFaces(flat, list, key !== '');
      geometries.push(geometry);
      if (debugKinds) paintKinds(geometry, list);
      const copy = new THREE.Mesh(geometry, debugKinds ? kindMaterialFor() : key ? materialFor(source, key, false) : source);
      place(copy, mesh, `${mesh.name}__inherit_${key || 'own'}`);
    }
    if (flat !== mesh.geometry) flat.dispose();
    originals.push(mesh);
    report.push(`${mesh.name}: ${faces - (byKey.get('')?.length ?? 0)}/${faces} faces inherit ${JSON.stringify(kinds)}`);
  }

  report.push(`built in ${(performance.now() - started).toFixed(0)} ms from ${index.size} support triangles`);

  let enabled = false;
  const setEnabled = (on: boolean) => {
    enabled = on;
    for (const object of originals) object.visible = !on;
    for (const copy of copies) copy.visible = on;
  };
  setEnabled(true);
  return {
    get enabled() { return enabled; },
    setEnabled,
    report,
    dispose() {
      setEnabled(false);
      for (const copy of copies) copy.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials.values()) material.dispose();
      for (const texture of textures) texture.dispose();
    },
  };
}

const KIND_COLOURS: Record<string, [number, number, number]> = {
  top: [1, 1, 1], outer: [0.1, 0.35, 1], inner: [1, 0.5, 0], bottom: [1, 0, 1], '': [0, 0, 0],
};
function paintKinds(geometry: THREE.BufferGeometry, list: ReadonlyArray<{ kind: string }>): void {
  const data = new Float32Array(list.length * 9);
  list.forEach(({ kind }, k) => { for (let c = 0; c < 3; c += 1) data.set(KIND_COLOURS[kind], k * 9 + c * 3); });
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
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
 * The window prototype without its per-instance ST, one vertex per face
 * corner, its vertex colour times the shade of the face's LOCAL normal.
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
  return flat;
}

function shareAttributes(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    if (name !== LIGHTMAP_ST_ATTRIBUTE) geometry.setAttribute(name, attribute);
  }
  geometry.setIndex(source.index);
  return geometry;
}

/** The front picture of a window prototype, in its local space. */
function frontOf(source: THREE.BufferGeometry, shadeOf: (nx: number, ny: number, nz: number) => number): WindowFront {
  const colour = source.getAttribute('color');
  return rasterizeWindowFront(
    plain(source.getAttribute('position')), colour ? plain(colour) : null, colour?.itemSize ?? 3,
    source.index?.array ?? null, FRONT_SIZE, shadeOf,
  );
}

/** The picture as a texture with its own mip chain: nothing is generated on the GPU. */
function frontTexture(front: WindowFront): THREE.DataTexture {
  const texture = new THREE.DataTexture(front.levels[0], front.size, front.size, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.mipmaps = front.levels.map((data, l) => ({ data, width: front.size >> l, height: front.size >> l }));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * One quad over the prototype's extent, facing local +Z, just in front of its
 * back plane. `uv` reads the picture; `uv1` is zero so the instance ST alone
 * places the lightmap sample; the colour is white because the picture carries it.
 */
function frontQuad(front: WindowFront): THREE.BufferGeometry {
  const z = front.backZ + FRONT_LIFT;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    front.minX, front.minY, z, front.maxX, front.minY, z, front.maxX, front.maxY, z, front.minX, front.maxY, z,
  ], 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(new Float32Array(8), 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(12).fill(1), 3));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  return geometry;
}

function instancedCopy(mesh: THREE.InstancedMesh, geometry: THREE.BufferGeometry, material: THREE.Material, instances: readonly number[]): THREE.InstancedMesh {
  const copy = new THREE.InstancedMesh(geometry, material, instances.length);
  const matrix = new THREE.Matrix4();
  instances.forEach((i, k) => { mesh.getMatrixAt(i, matrix); copy.setMatrixAt(k, matrix); });
  copy.computeBoundingBox();
  copy.computeBoundingSphere();
  return copy;
}

/**
 * The listed faces of a non-indexed geometry, with their inherited lightmap
 * UV and their colour times their shade (`inherit`), or as they were.
 */
function pickFaces(flat: THREE.BufferGeometry, list: ReadonlyArray<{ face: number; uv: number[]; shade: number }>, inherit: boolean): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const vertices = list.length * 3;
  for (const [name, attribute] of Object.entries(flat.attributes)) {
    const size = attribute.itemSize;
    const data = new Float32Array(vertices * size);
    list.forEach(({ face, uv, shade }, k) => {
      for (let c = 0; c < 3; c += 1) {
        const from = face * 3 + c, to = k * 3 + c;
        for (let ch = 0; ch < size; ch += 1) {
          let value = attribute.getComponent(from, ch);
          if (inherit && name === 'uv1') value = uv[c * 2 + ch];
          else if (inherit && name === 'color' && ch < 3) value *= shade;
          data[to * size + ch] = value;
        }
      }
    });
    geometry.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  if (inherit && !flat.getAttribute('color')) {
    const data = new Float32Array(vertices * 3);
    list.forEach(({ shade }, k) => data.fill(shade, k * 9, k * 9 + 9));
    geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
  }
  geometry.computeBoundingSphere();
  return geometry;
}
