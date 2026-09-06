/**
 * Binds editorial district content to the camera decision made when the
 * district is entered.
 *
 * Separate from the generated content on purpose: camera angles are not
 * editorial copy, and mixing them puts a marketing edit one typo away from
 * moving the composition.
 *
 * ## It used to bind geometry too
 *
 * Until the 2026-09-06 re-export this table also carried one row per service —
 * a building node, a connection node and an accent colour — because the export
 * shipped five buildings and five wedges and something had to say which slug
 * sat on which. That export replaced all fifteen district nodes with four, none
 * of which means a service, so there is no mapping left to hold.
 *
 * Nothing was lost with it. The buildings stopped being click targets in plan
 * 003 (§6): a tap on any of them enters the district and after that they are
 * scenery. The accents only ever fed `districtFlow`'s ring and wedges, which
 * went with the geometry. The node names the district still needs are in
 * `district/districtConfig.ts`, because none of them is per-service any more.
 */

export interface DistrictSceneBinding {
  /** References `DistrictContent.id`. */
  contentId: string;
  /**
   * Rig azimuth to settle on when flying into this district, degrees.
   *
   * Null keeps whatever heading the user had, which avoids an unrequested turn
   * but gives up control of the composition. A number is a deliberate choice of
   * how the district is framed on arrival — and it is also the display's resting
   * yaw, so the panel faces the visitor as they land.
   */
  approachYawDegrees: number | null;
  /**
   * How close to fly, as a multiple of the resting distance. Null keeps the
   * current distance and gives up the composition decision.
   *
   * Clamped against `FocusFlightConfig.minDistanceScale` rather than trusted,
   * and never allowed above 1: outward is the direction whose ground footprint
   * outgrows the terrain skirt, and it does so invisibly on 16:9.
   */
  focusDistanceScale: number | null;
}

export const cityDistrictBindings: readonly DistrictSceneBinding[] = [
  {
    contentId: 'servicios',
    // The camera sits at direction (sin yaw, cos yaw) from the focus
    // (`applyPoseToCamera`, pose azimuth 0). The cluster is against the plate's
    // +X/+Z corner, so the camera stands OUT on the skirt side and looks back
    // in: the city fills the frame behind the buildings instead of the empty
    // skirt. Judged headlessly on 2026-08-27 and unchanged by the display
    // redesign — but it now also sets the display's resting yaw, so a person in
    // front of it is judging two things at once.
    approachYawDegrees: 45,
    // 0.78 -> distance ~152.
    //
    // The pair that most needs eyes: the flight frames the plaza on the GROUND,
    // while the display hangs above it, so distance and `PANEL_ELEVATION` in
    // `district/display/servicesDisplay.ts` are tuned together or not at all.
    // Arithmetic gets close and cannot settle it — at fov 35 the visible height
    // at the focus is ~96 units here against a 48-unit panel — but where the
    // panel sits in the frame is a composition judgement.
    focusDistanceScale: 0.78,
  },
];
