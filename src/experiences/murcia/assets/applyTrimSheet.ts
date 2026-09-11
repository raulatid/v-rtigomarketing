import * as THREE from 'three';
import type { TrimSheet } from './loadTrimSheet';

/**
 * The name the city's architecture material carries.
 *
 * Not decoration: plan 001 Phase 7 specifies it, and this module's tests pin it.
 * Plan 009 proposes `Murcia_ProceduralArchitecture` instead,
 * which would rename a material the repository already encodes to gain
 * nothing, so the existing name wins.
 */
export const CITY_MATERIAL_NAME = 'MAT_CITY_BUILDINGS';

/** The terrain plate's. See `applyTrimSheet` for why it is a second material. */
export const GROUND_MATERIAL_NAME = 'MAT_CITY_GROUND';

/**
 * The buildings material with vertex colours on, for geometry carrying COLOR_0.
 * See `applyTrimSheet` for why it cannot be the same instance.
 */
export const CITY_VERTEX_COLOR_MATERIAL_NAME = 'MAT_CITY_BUILDINGS_VERTEX_COLOR';

export interface ApplyTrimSheetOptions {
  root: THREE.Object3D;
  sheet: TrimSheet;
  /**
   * The terrain plate, which is kept off the sheet. Null means it was not
   * found, and then nothing is excluded.
   */
  terrain: THREE.Mesh | null;
  /**
   * The outer ground, kept off the sheet for the same reason the plate is, and
   * given the same fabricated ground material.
   *
   * It is ground, not a building: it carries no TEXCOORD_0, so a sheet applied
   * here samples texel (0,0) and paints 2000 units of city floor in whichever
   * band happens to sit in the corner of the calibration chart. The skirt then
   * clones that material and inherits the same wrong colour, which is how a
   * missing UV set turns into a visible seam at the horizon.
   *
   * Null when the model has no ground beyond the plate.
   */
  ground?: THREE.Mesh | null;
  /**
   * Whether the GLB declared materials of its own — read from the file's JSON,
   * not from the scene graph, because by the time `GLTFLoader` has finished the
   * two cases are indistinguishable.
   */
  authored: boolean;
  /**
   * Base colour for the fabricated ground material.
   *
   * Optional, and omitting it leaves the material's own white: a caller that
   * only wants geometry has no opinion here, and the tests are such callers.
   * Ignored entirely on the authored path, which may not overwrite what an
   * artist exported.
   */
  groundColor?: number;
}

export interface AppliedTrimSheet {
  /** Every material now carrying the sheet. */
  textured: THREE.Material[];
  /** The plate's, when it was separated out. */
  ground: THREE.Material | null;
}

/**
 * Puts the trim sheet on the city.
 *
 * ## Why this creates a material rather than setting `.map` on one
 *
 * The shipped GLB declares zero materials, so `GLTFLoader` fabricates one for
 * the whole file — `createDefaultMaterial` caches a single
 * `MeshStandardMaterial` on the parser's registry and hands that same instance
 * to all 222 primitives (`GLTFLoader.js:2260-2277, 3780`). It is per-load
 * rather than application-wide, so writing to it could not reach the satellites
 * — but it is shared across the entire city, which is the hazard the export
 * contract §4 names: modify it and you have recoloured everything.
 *
 * It is also nobody's authored intent. It is `metalness: 1`, and this scene has
 * no environment map, so a fully metallic surface has almost no diffuse term:
 * a base-colour map on it is very nearly invisible. Shipping the sheet without
 * changing that would look like the texture had failed to load.
 *
 * ## Two paths, because the answer changes when the artist exports a material
 *
 * Today the file declares none and the fabricated default must be replaced.
 * The moment the re-export ships a real material — §6.4 asks for one, and
 * `DistrictHighlight` already reads an authored emissive and *scales* rather
 * than overwrites it — replacing it would throw away what the artist authored.
 * That is precisely what plan 001 Phase 4 exists to prevent, so the authored
 * path assigns the maps onto what arrived and touches nothing else.
 *
 * ## Why the terrain plate is excluded
 *
 * Not squeamishness about the ground: `createTerrainTransition` clones the
 * plate's material as the template for the collar and the skirt
 * (`createTerrainTransition.ts:419-429`, `:96`, `:120`), and those two
 * geometries are built here from positions and vertex colours with **no `uv`
 * attribute at all**. A map inherited down that chain samples texel (0,0)
 * across the whole horizon skirt — one flat calibration colour smeared over
 * hundreds of units, which is neither correct nor diagnostic.
 *
 * The plate gets the same lighting parameters — minus the maps, and with its
 * own colour — rather than being left behind, because leaving it on the
 * fabricated default would light the ground and the buildings differently: a
 * new inconsistency introduced by fixing `metalness`, which is worse than the
 * problem.
 */
export function applyTrimSheet(options: ApplyTrimSheetOptions): AppliedTrimSheet {
  const { root, sheet, terrain, authored, groundColor } = options;
  const ground = options.ground ?? null;

  if (authored) {
    const textured: THREE.Material[] = [];
    const seen = new Set<THREE.Material>();
    root.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || mesh === terrain || mesh === ground) return;
      for (const mat of materialsOf(mesh)) {
        if (seen.has(mat)) continue;
        seen.add(mat);
        attachMaps(mat as THREE.MeshStandardMaterial, sheet);
        textured.push(mat);
      }
    });
    return { textured, ground: null };
  }

  const buildings = new THREE.MeshStandardMaterial({
    name: CITY_MATERIAL_NAME,
    metalness: 0,
    roughness: 1,
  });
  attachMaps(buildings, sheet);

  // Identical but for the maps, and for the colour, which the plate needs and
  // the buildings get from the sheet. Left white here until 2026-08-31, on the
  // grounds that choosing one was an art decision nobody had asked for; what
  // white actually meant was albedo 1.0 on the one large flat surface in the
  // scene, which put the floor at 227/255 and made it the brightest thing in
  // the city. The number now lives in `sceneState.groundColor`, with the
  // measurement beside it.
  // One instance for the plate AND the outer ground: they are the same surface
  // at two scales, and giving them separate materials would be two things to
  // keep in step for no gain.
  const groundMaterial =
    terrain || ground
      ? new THREE.MeshStandardMaterial({
          name: GROUND_MATERIAL_NAME,
          metalness: 0,
          roughness: 1,
          ...(groundColor === undefined ? {} : { color: groundColor }),
        })
      : null;

  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) meshes.push(obj as THREE.Mesh);
  });

  // A building that carries COLOR_0 needs `vertexColors`, and a building that
  // does not must NOT have it: three reads a missing attribute as WebGL's
  // default (0,0,0,1), so one shared material with vertex colours switched on
  // would render every uncoloured building black. Only `ShaderMaterial` can
  // supply its own default. Hence exactly two building materials — one per
  // shader variant, never one per coloured mesh — and the second only exists
  // when the file actually has colour. `GLTFLoader` made the same split, but
  // its clones were of the fabricated default this function discards.
  const isBuilding = (mesh: THREE.Mesh) => mesh !== terrain && mesh !== ground;
  const vertexColoured = meshes.some((mesh) => isBuilding(mesh) && hasVertexColours(mesh))
    ? createVertexColoured(buildings)
    : null;

  for (const mesh of meshes) {
    if (!isBuilding(mesh) && groundMaterial) {
      mesh.material = groundMaterial;
    } else {
      mesh.material = vertexColoured && hasVertexColours(mesh) ? vertexColoured : buildings;
    }
  }

  return {
    textured: vertexColoured ? [buildings, vertexColoured] : [buildings],
    ground: groundMaterial,
  };
}

function hasVertexColours(mesh: THREE.Mesh): boolean {
  return mesh.geometry.getAttribute('color') !== undefined;
}

/**
 * The buildings material with vertex colours on, and nothing else different.
 *
 * `clone()` carries the maps by reference and every PBR value, so the two
 * materials sample one trim sheet and light identically; the vertex colour is
 * then a pure multiplier on the sheet's base colour, and white is no change.
 */
function createVertexColoured(buildings: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const material = buildings.clone();
  material.name = CITY_VERTEX_COLOR_MATERIAL_NAME;
  material.vertexColors = true;
  return material;
}

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material];
}

function attachMaps(material: THREE.MeshStandardMaterial, sheet: TrimSheet): void {
  if (sheet.textures.baseColor) material.map = sheet.textures.baseColor;
  if (sheet.textures.normal) material.normalMap = sheet.textures.normal;

  // One ORM texture in three slots, which is the glTF packing and is safe to
  // share: three picks a map's UV set from `Texture.channel`, and `channel`
  // belongs to the texture rather than the slot — so one instance cannot
  // disagree with itself, and its default of 0 is the `uv` attribute the city
  // has. The old "AO needs a second UV set" rule is pre-r151 and does not apply.
  // Plan 009 Phase 6 asked for this to be confirmed rather than assumed; it was,
  // against three 0.174 (`Texture.js:114`, `ShaderChunk/uv_vertex.glsl.js:24`).
  const orm = sheet.textures.orm;
  if (orm) {
    material.aoMap = orm;
    material.roughnessMap = orm;
    material.metalnessMap = orm;
  }

  material.needsUpdate = true;
}
