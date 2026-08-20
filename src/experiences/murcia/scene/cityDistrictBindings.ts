import type { BoundsRect } from '../config/environmentConfig';

/**
 * Binds editorial district content to geometry in the city GLB, and to the
 * camera decision made when that district is selected.
 *
 * Separate from `src/content/districts.ts` on purpose: Blender identifiers and
 * camera angles are not editorial copy, and mixing them puts a marketing edit
 * one typo away from breaking asset resolution.
 */
export interface DistrictSceneBinding {
  /** References `DistrictContent.id`. */
  contentId: string;
  /**
   * Value expected in `userData.district`, written by a Blender custom property.
   * This is the target identity mechanism — see
   * `docs/murcia/blender-export-contract.md`.
   */
  tag: string;
  /**
   * Explicit node names, tried when no node carries the tag yet.
   *
   * Written in the Blender spelling. `resolveDistrict` also tries the
   * GLTFLoader-sanitized spelling and `userData.name`, because reserved
   * characters `[ ] . : /` are stripped from node names at load
   * (PROJECT_MEMORY, "Things that will bite you again").
   */
  nodeNames: string[];
  /**
   * Last-resort spatial selection, in world XZ.
   *
   * A development crutch for working against an asset that carries neither the
   * tag nor stable names — never a production identity mechanism, because world
   * coordinates drift the moment the model is re-exported (PROJECT_MEMORY,
   * "Things that will bite you again"). Gated behind `allowSpatialFallback`.
   */
  fallbackRect?: BoundsRect;
  /**
   * Whether the spatial fallback may run at all. Passed down from the caller
   * rather than read from `import.meta.env` inside the resolver: the `checks/`
   * harnesses bundle these modules for Node with esbuild, where `import.meta.env`
   * does not exist.
   */
  allowSpatialFallback: boolean;
  /**
   * Rig azimuth to settle on when flying to this district, degrees.
   *
   * Null keeps whatever heading the user had, which avoids an unrequested turn
   * but gives up control of the composition. A number is a deliberate choice of
   * how the district is framed on arrival.
   */
  approachYawDegrees: number | null;
  /**
   * How close to fly, as a multiple of the resting distance. Null keeps the
   * current distance and gives up the composition decision.
   *
   * Here rather than in `districts.ts` for the same reason `approachYawDegrees` is:
   * how a district is framed on arrival is a camera decision about that district,
   * not editorial copy, and mixing them puts a marketing edit one typo away from
   * moving the camera.
   *
   * Clamped against `FocusFlightConfig.minDistanceScale` rather than trusted, and
   * never allowed above 1: outward is the direction whose ground footprint outgrows
   * the terrain skirt, and it does so invisibly on 16:9.
   */
  focusDistanceScale: number | null;
}

/**
 * Stand-in geometry, current as of the shipped `city-prototype.glb`.
 *
 * The GLB contains no node called `edificios_servicios`: Blender's glTF exporter
 * flattens collections, so only object names survive and collection names are
 * not a runtime contract at all. All 294 node names were dumped to confirm this.
 *
 * `blog_edificios` and `blog_edificios.001` are used meanwhile — two real,
 * non-instanced, semantically named nodes forming a coherent cluster at
 * X [-381, -299] Z [156, 212], well inside the plate. They are placeholders for
 * the services district, not the district itself.
 *
 * Once the asset ships `district = "servicios"` custom properties the tag path
 * wins automatically and nothing here needs to change.
 */
export const cityDistrictBindings: readonly DistrictSceneBinding[] = [
  {
    contentId: 'servicios',
    tag: 'servicios',
    nodeNames: ['blog_edificios', 'blog_edificios.001'],
    fallbackRect: { minX: -381, maxX: -299, minZ: 156, maxZ: 212 },
    allowSpatialFallback: false,
    // Faces the cluster from the south-east, keeping the river strip (Plane.018,
    // Z 291-360) behind the camera rather than across the composition.
    approachYawDegrees: -35,
    // 0.78 -> distance ~129. Getting closer is the whole point of selecting a
    // district now that nothing else changes distance (`adr/009`), and this is far
    // enough in to read as a closer look while staying well above the 0.7 floor.
    // STARTING POINT, not judged — the composition wants a person in front of it.
    focusDistanceScale: 0.78,
  },
];
