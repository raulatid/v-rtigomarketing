import * as THREE from 'three';

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
  /**
   * The terrain plate, which gets the ground material rather than the
   * buildings'. Null means it was not found, and then nothing is excluded.
   */
  terrain: THREE.Mesh | null;
  /**
   * The outer ground, given the same fabricated ground material as the plate:
   * it is ground, not a building, and the skirt clones its material.
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
  /** The buildings materials it created; empty on the authored path. */
  textured: THREE.Material[];
  /** The plate's, when it was separated out. */
  ground: THREE.Material | null;
}

/**
 * Gives a GLB that declares no materials the city's own.
 *
 * The name is historical: this used to put a trim sheet on the city too. The
 * trim sheet was retired on 2026-10-20 — the city's colour is vertex colour —
 * and what remains is the material fabrication below.
 *
 * ## Why this creates materials rather than editing the one that arrived
 *
 * A GLB with zero materials makes `GLTFLoader` fabricate one for the whole
 * file — `createDefaultMaterial` caches a single `MeshStandardMaterial` on the
 * parser's registry and hands that same instance to every primitive
 * (`GLTFLoader.js:2260-2277, 3780`). It is shared across the entire city, which
 * is the hazard the export contract §4 names: modify it and you have recoloured
 * everything. It is also `metalness: 1`, and this scene has no environment map,
 * so a fully metallic surface has almost no diffuse term.
 *
 * ## An authored GLB is left alone
 *
 * When the file declares materials, they are the artist's, and replacing them
 * would throw away what was authored (plan 001 Phase 4). Nothing is touched.
 *
 * ## Why the terrain plate gets its own material
 *
 * The plate gets the same lighting parameters as the buildings, with its own
 * colour, rather than being left on the fabricated default — which would light
 * the ground and the buildings differently.
 */
export function applyTrimSheet(options: ApplyTrimSheetOptions): AppliedTrimSheet {
  const { root, terrain, authored, groundColor } = options;
  const ground = options.ground ?? null;

  if (authored) return { textured: [], ground: null };

  const buildings = new THREE.MeshStandardMaterial({
    name: CITY_MATERIAL_NAME,
    metalness: 0,
    roughness: 1,
  });

  // Identical but for the colour, which the plate needs and the buildings get
  // from their vertex colour. Left white here until 2026-08-31, on the
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
 * `clone()` carries every PBR value, so the two materials light identically;
 * the vertex colour is then a pure multiplier, and white is no change.
 */
function createVertexColoured(buildings: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const material = buildings.clone();
  material.name = CITY_VERTEX_COLOR_MATERIAL_NAME;
  material.vertexColors = true;
  return material;
}
