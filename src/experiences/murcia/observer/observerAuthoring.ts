/**
 * Authoring data for the vantage points: where the anchors are, and where each
 * should land on screen from the stage's pose.
 *
 * Imported ONLY by `observerDebug.ts`, which is constructed behind the
 * `DEBUG_TOOLS_ENABLED` literal — so none of this reaches a production bundle.
 * Keep it that way: the anchors plus their `expectedNdc` are enough to solve
 * the pose outright (it is a textbook perspective-n-point problem).
 *
 * The pose is NOT here. It lives in `VIEW_SOLUTION` (see `.env.example`), and
 * `__vertigoAlign.capture()` prints a stage ready to paste into it.
 */

export type Vec3Tuple = readonly [number, number, number];

export interface ViewpointMarker {
  /** World-space anchor. Math only — nothing is drawn for it in production. */
  position: Vec3Tuple;
  /** Where it lands at the stage's pose, NDC (-1..1). Captured, not typed. */
  expectedNdc?: readonly [number, number];
}

/**
 * PLACEHOLDER anchors around the initial focus, at different depths and
 * heights, to be replaced by points picked on real scenery.
 */
export const AUTHORING_MARKERS: readonly ViewpointMarker[] = [
  { position: [-330, 18, -40] },
  { position: [-300, 32, 10] },
  { position: [-260, 12, 60] },
  { position: [-240, 26, -20] },
  { position: [-210, 40, 30] },
];
