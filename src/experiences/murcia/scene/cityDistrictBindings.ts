/**
 * Binds editorial district content to geometry in the city GLB, and to the
 * camera decision made when a building in that district is selected.
 *
 * Separate from `src/content/districts.ts` on purpose: Blender identifiers and
 * camera angles are not editorial copy, and mixing them puts a marketing edit
 * one typo away from breaking asset resolution.
 */

/**
 * One service building. Since the 2026-08-27 re-export the city ships one
 * building per service (`edificio-servicio-NNN`), and the district is engaged
 * through one of them rather than picked as a whole.
 */
export interface ServiceBuildingBinding {
  /** References `Service.id` inside `DistrictContent.services`. */
  serviceId: string;
  /**
   * Blender object name. Names ARE the identity for these — a per-building
   * custom property would add nothing the name does not already say — and they
   * are dot-free by contract, so GLTFLoader's reserved-character stripping
   * (`[ ] . : /`) cannot bite. `cityDistrictBindings.test.ts` enforces it.
   */
  nodeName: string;
  /** Per-building override of the district's approach heading; undefined inherits. */
  approachYawDegrees?: number | null;
  /** Per-building override of the district's approach distance; undefined inherits. */
  focusDistanceScale?: number | null;
}

export interface DistrictSceneBinding {
  /** References `DistrictContent.id`. */
  contentId: string;
  /**
   * Rig azimuth to settle on when flying to a building in this district,
   * degrees.
   *
   * Null keeps whatever heading the user had, which avoids an unrequested turn
   * but gives up control of the composition. A number is a deliberate choice of
   * how the building is framed on arrival.
   */
  approachYawDegrees: number | null;
  /**
   * How close to fly, as a multiple of the resting distance. Null keeps the
   * current distance and gives up the composition decision.
   *
   * Here rather than in `districts.ts` for the same reason `approachYawDegrees` is:
   * how a building is framed on arrival is a camera decision, not editorial
   * copy, and mixing them puts a marketing edit one typo away from moving the
   * camera.
   *
   * Clamped against `FocusFlightConfig.minDistanceScale` rather than trusted, and
   * never allowed above 1: outward is the direction whose ground footprint outgrows
   * the terrain skirt, and it does so invisibly on 16:9.
   */
  focusDistanceScale: number | null;
  /**
   * The buildings, one per service. Order here is irrelevant: the tour order
   * (prev/next, tab order) is the district content's curated `services[]`.
   *
   * Every service in the content needs a row (the unit test fails otherwise);
   * a row whose node is missing from the GLB is reported at load and skipped;
   * `edificio-servicio-*` objects with no row are plain city.
   */
  buildings: readonly ServiceBuildingBinding[];
}

/**
 * Current as of the 2026-08-27 `city-prototype.glb`, which ships
 * `edificio-servicio-001..007` and `009` (no 008) clustered at
 * X [-188, -100] Z [388, 462] — near the plate's +Z edge (473).
 *
 * Which slug sits on which building is an art decision made by position;
 * this table is the only place it lives. The three unbound buildings
 * (006, 007, 009) are waiting for services that do not exist yet.
 */
export const cityDistrictBindings: readonly DistrictSceneBinding[] = [
  {
    contentId: 'servicios',
    // The camera sits at direction (sin yaw, cos yaw) from the focus
    // (`applyPoseToCamera`, pose azimuth 0). The cluster is against the plate's
    // +X/+Z corner, so the camera stands OUT on the skirt side and looks back in:
    // the city fills the frame behind the buildings instead of the empty skirt.
    // -35 (inherited from the blog_edificios stand-in) looked outward and left
    // most of the frame grey. Judged headlessly on 2026-08-27; a person in front
    // of it may still move it.
    approachYawDegrees: 45,
    // 0.78 -> distance ~152. Getting closer is the whole point of selecting a
    // building now that nothing else changes distance (`adr/009`), and this is far
    // enough in to read as a closer look while staying well above the 0.7 floor.
    focusDistanceScale: 0.78,
    buildings: [
      { serviceId: 'seo', nodeName: 'edificio-servicio-001' },
      { serviceId: 'web-analysis', nodeName: 'edificio-servicio-002' },
      { serviceId: 'content-strategy', nodeName: 'edificio-servicio-003' },
      { serviceId: 'paid-campaigns', nodeName: 'edificio-servicio-004' },
      { serviceId: 'brand-identity', nodeName: 'edificio-servicio-005' },
    ],
  },
];
