import * as THREE from 'three';

/** Local depth priorities applied AFTER lightmaps, whose materials are shared.
 * Keep geometry, UVs and baked illumination intact; never disable occlusion.
 */
export function applyCitySurfaceDepth(root: THREE.Object3D): { dispose(): void } {
  const restore: Array<() => void> = [];
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];

  const offset = (source: THREE.Material, units: number) => {
    const material = source.clone();
    // Material.clone does not copy these hooks. Losing them breaks atlas sampling.
    material.onBeforeCompile = source.onBeforeCompile;
    material.customProgramCacheKey = source.customProgramCacheKey;
    material.polygonOffset = true;
    material.polygonOffsetFactor = -1;
    material.polygonOffsetUnits = units;
    materials.push(material);
    return material;
  };

  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || (mesh as THREE.InstancedMesh).isInstancedMesh) return;
    const name = String(mesh.userData.source_name ?? mesh.name);
    const source = mesh.material;
    if (name === 'estadio-la-condomina' && !Array.isArray(source)) {
      const geometry = splitPitch(mesh.geometry);
      if (!geometry) return;
      const original = mesh.geometry;
      mesh.geometry = geometry;
      mesh.material = [source, offset(source, -2)];
      geometries.push(geometry);
      restore.push(() => { mesh.geometry = original; mesh.material = source; });
      return;
    }
    const paving = /^(P3 Main Streets|P3_Main_Streets|Belluga Radial Paving|Belluga_Radial_Paving)(?:__|$)/.test(name);
    const detail = name === 'Fachada_Murcia_15k' || name === 'ARCH_Porcelain_White';
    if (!paving && !detail) return;
    mesh.material = Array.isArray(source)
      ? source.map(material => offset(material, -1))
      : offset(source, -1);
    restore.push(() => { mesh.material = source; });
  });

  let disposed = false;
  return { dispose() {
    if (disposed) return;
    disposed = true;
    for (const reset of restore) reset();
    for (const material of materials) material.dispose();
    for (const geometry of geometries) geometry.dispose();
  } };
}

/** The old stadium is one primitive. Select only its green, upward-facing
 * horizontal turf, not the stands, pitch markings or opposite-facing faces.
 * Partition indices rather than moving vertices: atlas UVs remain unchanged.
 */
function splitPitch(source: THREE.BufferGeometry): THREE.BufferGeometry | null {
  const position = source.getAttribute('position');
  const colour = source.getAttribute('color');
  if (!position || !colour) return null;
  const index = source.index;
  const count = index?.count ?? position.count;
  const rest: number[] = [], pitch: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < count; i += 3) {
    const ids = [0, 1, 2].map(k => index ? index.getX(i + k) : i + k);
    a.fromBufferAttribute(position, ids[0]);
    b.fromBufferAttribute(position, ids[1]);
    c.fromBufferAttribute(position, ids[2]);
    const flat = Math.max(a.y, b.y, c.y) - Math.min(a.y, b.y, c.y) < 0.0001;
    const up = b.sub(a).cross(c.sub(a)).y > 0;
    const green = ids.every(id => colour.getY(id) > colour.getX(id) * 1.5 &&
      colour.getY(id) > colour.getZ(id) * 2);
    (flat && up && green ? pitch : rest).push(...ids);
  }
  if (!pitch.length) return null;
  const geometry = source.clone();
  geometry.setIndex([...rest, ...pitch]);
  geometry.clearGroups();
  if (rest.length) geometry.addGroup(0, rest.length, 0);
  geometry.addGroup(rest.length, pitch.length, 1);
  return geometry;
}
