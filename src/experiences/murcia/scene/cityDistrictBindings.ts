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
    // (`applyPoseToCamera`, pose azimuth 0). It is also the display's resting
    // yaw, so the panel faces the visitor as they land, and a person in front of
    // it is judging two things at once.
    //
    // ── 45 -> 225, 2026-09-08. Half a turn, and it was forced. ──
    //
    // 45 stood the camera on the +X/+Z side and looked back in, so the city
    // filled the frame behind the buildings instead of the empty skirt. Judged
    // headlessly on 2026-08-27, and correct for as long as the camera was allowed
    // to stand off the plate — which is exactly what DECISIONS §39 stopped.
    //
    // The cluster is against the plate's +X/+Z CORNER, and at 45 the camera
    // stands +X/+Z of the focus. So §39 and this heading want the eye in the same
    // place: measured at 1880x966, the clamp pinned it at (-94.4, 465.3) — the
    // corner, dead on the 8-unit margin — which put the camera ON the plaza
    // looking away from it. Three of the display's four controls projected off
    // the canvas entirely. That is not a framing judgement, it is a heading the
    // rule cannot satisfy.
    //
    // 225 is the same composition read from the other side: the camera stands
    // -X/-Z of the plaza, inside the city, and looks out at the corner. It works
    // because the pitch rose with it — at 35 degrees the top of frame reaches
    // only ~78 units past the focus, so what sits behind the district is more
    // city rather than the skirt that 45 was avoiding. Measured on the same
    // capture: eye (-235.8, 312.2), comfortably interior, focus NOT clamped at
    // all, and all four controls framed between x 854-1163 of 1880.
    //
    // If this needs to move again, move it around the plaza — not back onto the
    // corner. `checks/footprint.ts` §4 is the gate.
    approachYawDegrees: 225,
    // A multiple of the resting `camera.distance`, so the arrival distance is
    // `0.78 · CAMERA_DISTANCE` — ~172 units at today's 220 (it was ~222 at 285,
    // and ~152 at the 195 this was tuned against), and the visible height at the
    // focus is `2 · d · tan(fov / 2)` — ~108 units at fov 35, against a 48-unit
    // panel. The panel now fills nearly half the frame height where it filled a
    // third; that is a consequence of the 2026-09-08 distance drop and not a
    // decision anyone took here.
    //
    // The pair that most needs eyes: the flight frames the plaza on the GROUND,
    // while the display hangs above it, so distance and `PANEL_ELEVATION` in
    // `district/display/displayConfig.ts` are tuned together or not at all.
    // Arithmetic gets close and cannot settle where the panel sits in the frame;
    // that is a composition judgement. What arithmetic DOES own is how big the
    // controls are to a finger: the touch floor is enforced after projection by
    // `src/interaction/touchTarget.ts`, and `displayTouchTargets.test.ts` fails
    // if a change here shrinks a control under it — so this number is free to
    // move for the composition's sake.
    focusDistanceScale: 0.78,
  },
];
