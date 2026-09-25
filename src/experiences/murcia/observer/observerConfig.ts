/**
 * What the city needs to know to report where its camera rests — and nothing
 * about where it should rest.
 *
 * The vantage points themselves are judged on the server (`server/view/`),
 * against `VIEW_SOLUTION` in the deployment's environment. Nothing here, and
 * nothing in the bundle, says what the answer is: every visitor's resting
 * camera is reported alike, and the reply is the same shape either way.
 *
 * Authoring data (the anchors and where they should land on screen) lives in
 * `observerAuthoring.ts`, which only the debug tooling imports.
 */

export interface ObserverConfig {
  /** Continuous seconds of stillness, while the viewer navigates, that count as a rest. */
  dwellSeconds: number;
  /** World units per second. Below it the camera counts as still. */
  stillLinearSpeed: number;
  /** Degrees per second of view-direction change. */
  stillAngularSpeedDegrees: number;
  /** A rest reported sooner than this after the previous report is dropped. */
  minReportIntervalSeconds: number;
  /** Reports per page load. A tab left navigating for hours stops here. */
  maxReportsPerSession: number;
}

export const OBSERVER: ObserverConfig = {
  dwellSeconds: 1.8,
  stillLinearSpeed: 2,
  stillAngularSpeedDegrees: 1.5,
  minReportIntervalSeconds: 4,
  maxReportsPerSession: 120,
};
