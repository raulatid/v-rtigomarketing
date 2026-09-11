/**
 * The services campus's scene vocabulary: which authored object is which part.
 *
 * A LEAF, with no imports at all, because `checks/city-asset.ts` bundles it for
 * Node to assert these names against the shipped GLB — the same arrangement as
 * `landmark/vertigoBuildingConfig.ts`. A shader or a three import here would be
 * bundled into that harness too.
 *
 * The campus arrived with murcia-v6 (2026-09-11): fifteen ROOT-LEVEL nodes
 * sharing one transform, scale applied at 0.7417 of the lab's standalone
 * `campus_vertigo.glb`, and no materials. Nothing here is per-service; which
 * symbol and figure a service takes is scene composition, in
 * `scene/cityDistrictBindings.ts`.
 *
 * Names are the identity. A rename in Blender is otherwise silent: the part
 * keeps the city's trim material and nothing fails.
 */

/**
 * One mesh holding every body of water on the site — the lake and the two
 * pools by the entrance. `lake/lakeBasin.ts` picks the lake out by clustering,
 * which is why the campus is handed over as its own group (`gatherCampus.ts`):
 * it clusters around the centre of whatever root it is given.
 */
export const CAMPUS_WATER_NODE_NAME = 'PARK_Water';

/**
 * The ring's LED strip. Its authored UVs are the screen: U runs round the wall
 * from the right entrance jamb, and every composition rides them.
 */
export const CAMPUS_SCREEN_NODE_NAME = 'CAMPUS_SCREEN_Continuous';

/**
 * Which UV set of the strip is the screen. 1 since murcia-v7: the exporter
 * writes the material graph's trim-band UV to `TEXCOORD_0` and the authored
 * strip UV to `TEXCOORD_1`, the same as the tower's screen (export contract
 * §6.8). Measured on v7 through set 1: 255 m round by 5 m tall.
 */
export const CAMPUS_SCREEN_UV_CHANNEL: 0 | 1 = 1;

/**
 * The parts coloured by `campusPalette.ts`, one colour each.
 *
 * `ARCH_Porcelain_White.001` is authored with its dot; GLTFLoader renames it
 * `ARCH_Porcelain_White001`, and every lookup sanitizes the name it is given
 * before matching (blender-export-contract §2).
 */
export const CAMPUS_PART_NODE_NAMES = [
  'ARCH_Porcelain_White',
  'ARCH_Porcelain_White.001',
  'ARCH_Glazing_Opaque_Blue',
  'ARCH_Blue_Light',
  'ARCH_Window_Frames',
  'ARCH_Vertigo_Blue',
  'ARCH_Roof_Joints',
  'ARCH_Solar_Blue',
  'SITE_Light_Limestone',
  'PARK_Grass',
  'PARK_Trunks',
  'PARK_Leaves_Olive',
  'PARK_Leaves_Sage',
] as const;

export type CampusPartName = (typeof CAMPUS_PART_NODE_NAMES)[number];

/** Every node that is the campus: the parts, the water and the strip. */
export const CAMPUS_NODE_NAMES: readonly string[] = [
  ...CAMPUS_PART_NODE_NAMES,
  CAMPUS_WATER_NODE_NAME,
  CAMPUS_SCREEN_NODE_NAME,
];
