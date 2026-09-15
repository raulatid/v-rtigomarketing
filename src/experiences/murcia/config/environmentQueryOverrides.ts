/**
 * Query-parameter overrides for navigation feel.
 *
 * Separate from `applyQueryOverrides` in appConfig.ts because the two have
 * different owners: that one adjusts the shell (renderer, debug tooling), while
 * everything here belongs to an EnvironmentConfig and would have to be applied
 * per environment once there is more than one (docs/plans/002 Amendment A5).
 *
 * These exist because drag feel is a judgement, not a measurement. The check
 * harness can prove a sign, a magnitude or a bound; it cannot say whether the
 * result feels heavy. Retuning by hand meant an edit and a rebuild per attempt,
 * which is too slow to converge on a feel.
 *
 * They are a tuning tool, not configuration. Once a value is settled it belongs
 * in murciaConfig.ts with the reasoning written down.
 *
 *   ?focusMin=0.6
 *
 * (`?dragGain=`, `?yawDeg=`, `?smooth=`, `?release=`, `?inertia=`, `?yawSmooth=`,
 * `?touchDragGain=` and `?touchYawDeg=` tuned the map-pan controller's feel, and
 * went with it — DECISIONS §44. The rig's feel lives in `camera/cameraTuning.ts`
 * and has no query surface.)
 *
 * ── The camera pose, added 2026-09-04 ──
 *
 *   ?elev=18  ?dist=285  ?azimuth=267  ?lookAt=5.85  ?fov=35  ?farPlane=3500
 *   ?focusX=-262.3  ?focusZ=296.9
 *   ?zoomFar=400  ?zoomFarElev=55  ?zoomNear=0.7
 *   ?skirt=700  ?fade=0.21
 *
 * (`?band=` was the §40 resistance band. It went with the band.)
 *
 * `?azimuth=`, `?focusX=` and `?focusZ=` were added 2026-09-05 and they close
 * the loop rather than adding a knob. The overlay has always REPORTED azimuth
 * and focus; until now neither could be replayed, so a bearing found by turning
 * the city cost a source edit and a rebuild per candidate — which is exactly
 * what made the 2026-09-05 reframe expensive (four rebuilds to land on 267).
 * With these, the overlay's `POSE` line pastes straight back into a URL.
 *
 * Here for exactly the reason the feel parameters are: how horizontal a city
 * should look is a judgement, and it was being made by editing a constant and
 * waiting for a rebuild. The client drove the 30 -> 19 change from screenshots,
 * over a call, and every candidate cost a round trip.
 *
 * TWO OF THESE ARE NOT FEEL, AND THAT IS THE WARNING. `?elev=` and `?lookAt=`
 * decide whether the frustum passes the horizon, and `?skirt=`/`?fade=` decide
 * how far out the ground stops. A URL can put the edge of the world on screen —
 * which the drag parameters could never do — so a pose found this way is a
 * CANDIDATE, and `npm run check:footprint` is what makes it a decision.
 *
 * The useful comparisons in one line each:
 *
 *   ?elev=30                      the pre-2026-09-04 pose, horizon well out of frame
 *   ?elev=19&dist=225&azimuth=0   the pre-2026-09-05 pose, the city from the other side
 *   ?elev=18&lookAt=-30           low camera, horizon cropped by aiming below the focus
 *   ?elev=24&fov=28               longer lens, less perspective, more of the skyline
 *   ?zoomFar=500&zoomFarElev=58   a bolder zoom-out, if the current one reads timid
 *
 * `?zoomMin`, `?zoomMax`, `?wheelZoom` and `?zoomSmooth` were retired with the zoom
 * band (`adr/009`). `?focusMin` replaces the first: it is the floor a district flight
 * may dolly to, and it is the only remaining way distance changes at all. There is no
 * max-side parameter any more because there is no outward direction — which also
 * retires the one warning in this file, since growing the ground footprint past the
 * terrain skirt is no longer reachable from a URL.
 */
import { DEBUG_TOOLS_ENABLED } from '../../../platform/buildFlags';
import type { EnvironmentConfig } from './environmentConfig';

/**
 * Returns a new EnvironmentConfig with any recognised overrides applied.
 *
 * Nothing is mutated: murciaConfig is a shared module-level constant, and with
 * two environments it would be reachable from both.
 */
export function applyNavigationQueryOverrides(
  env: EnvironmentConfig,
  search: string,
  enabled: boolean,
): EnvironmentConfig {
  // Off in production builds. `?dragGain=99999` is not a security hole, but it
  // does make the city unnavigable for anyone handed the link, and a tuning
  // tool has no business being reachable on a marketing site. Same seam as
  // applyQueryOverrides — the flag comes from the shell.
  /**
   * A COMPILE-TIME gate in front of the runtime one, and the pair is not
   * redundant. `enabled` is what the shell decides, so it is a value and cannot
   * be folded; DEBUG_TOOLS_ENABLED is a literal, so Rollup removes everything
   * below it from a production build. Measured on the emitted chunk: without it
   * the whole parser shipped to every visitor, inert, behind a boolean that is
   * always false there.
   *
   * The `checks/` harnesses bundle this module for Node with esbuild, where the
   * define does not exist — buildFlags.ts reads it behind a `typeof` guard and
   * resolves to development, so they keep the overrides they rely on. That guard
   * is the reason this import is safe here at all.
   */
  if (!DEBUG_TOOLS_ENABLED || !enabled) return env;

  const params = new URLSearchParams(search);

  // Clamped rather than trusted: a floor above 1 would ask a flight to dolly OUT,
  // which is the direction whose footprint grows past the terrain skirt.
  const focusMin = readNumber(params, 'focusMin', (v) => v > 0 && v <= 1);

  // ── Pose ──
  //
  // Bounds are sanity, not safety. They reject values that would break the pose
  // maths outright — a non-positive distance, an elevation at or past vertical
  // where the azimuth stops meaning anything — and nothing else. Whether a pose
  // is SAFE is a sweep, and no `valid` predicate here can stand in for it.
  //
  // `lookAt` takes any finite number, negative included, and that is the point:
  // aiming below the focus is what crops the horizon out of frame, and it is the
  // first thing to reach for if the low pose shows too much distance.
  const elevation = readNumber(params, 'elev', (v) => v > 0 && v < 90);
  const distance = readNumber(params, 'dist', (v) => v > 0);
  const fov = readNumber(params, 'fov', (v) => v > 0 && v < 120);
  const lookAt = readNumber(params, 'lookAt', () => true);
  const farPlane = readNumber(params, 'farPlane', (v) => v > 0);
  // Unbounded on purpose: a bearing is periodic, so there is no value that
  // breaks the maths. 267 and -93 and 627 all name the same heading, and
  // `applyPoseToCamera` takes the sine and cosine without caring which.
  const azimuth = readNumber(params, 'azimuth', () => true);

  // ── Where the camera is pointed, as opposed to how it sits ──
  //
  // The arrival focus, so a framing reached by PANNING can be replayed from a
  // URL. Without these the overlay could report a focus that nothing but a
  // source edit could reproduce, which is the gap that makes the readout a
  // half-measure: the pose fields round-trip and the aim point does not.
  //
  // Unbounded here, and deliberately so. The navigable clamp lives in
  // `CameraRig`, against `navigation.bounds`, and runs on every target write;
  // duplicating it as a predicate would be a second opinion about the edges that
  // could drift from the first.
  const focusX = readNumber(params, 'focusX', () => true);
  const focusZ = readNumber(params, 'focusZ', () => true);

  // ── The zoom band ──
  const zoomFar = readNumber(params, 'zoomFar', (v) => v > 0);
  const zoomFarElev = readNumber(params, 'zoomFarElev', (v) => v > 0 && v < 90);
  const zoomNear = readNumber(params, 'zoomNear', (v) => v > 0 && v <= 1);

  // ── The skirt ──
  //
  // `?skirt=0` disables the transition outright rather than building a
  // zero-width one, which is the comparison worth having: it shows where the
  // ground actually ends.
  const skirt = readNumber(params, 'skirt', (v) => v >= 0);
  const fade = readNumber(params, 'fade', (v) => v > 0 && v <= 1);


  const overrides = [
    focusMin,
    elevation,
    distance,
    fov,
    lookAt,
    farPlane,
    azimuth,
    focusX,
    focusZ,
    zoomFar,
    zoomFarElev,
    zoomNear,
    skirt,
    fade,
  ];
  if (overrides.every((value) => value === null)) return env;

  const next: EnvironmentConfig = {
    ...env,
    camera: {
      ...env.camera,
      elevationDegrees: elevation ?? env.camera.elevationDegrees,
      distance: distance ?? env.camera.distance,
      fov: fov ?? env.camera.fov,
      lookAtHeight: lookAt ?? env.camera.lookAtHeight,
      far: farPlane ?? env.camera.far,
      azimuthDegrees: azimuth ?? env.camera.azimuthDegrees,
    },
    initialFocus: {
      ...env.initialFocus,
      x: focusX ?? env.initialFocus.x,
      z: focusZ ?? env.initialFocus.z,
    },
    zoomFarDistance: zoomFar ?? env.zoomFarDistance,
    zoomFarElevationDegrees: zoomFarElev ?? env.zoomFarElevationDegrees,
    zoomNearScale: zoomNear ?? env.zoomNearScale,
    terrainTransition: {
      ...env.terrainTransition,
      enabled: skirt === 0 ? false : env.terrainTransition.enabled,
      width: skirt !== null && skirt > 0 ? skirt : env.terrainTransition.width,
      fadeEndFraction: fade ?? env.terrainTransition.fadeEndFraction,
    },
    navigation: {
      ...env.navigation,
    },
    focusFlight: {
      ...env.focusFlight,
      minDistanceScale: focusMin ?? env.focusFlight.minDistanceScale,
    },
  };

  console.info('[navigation] overridden by query parameters', {
    focusMinDistanceScale: next.focusFlight.minDistanceScale,
    elevationDegrees: next.camera.elevationDegrees,
    distance: next.camera.distance,
    zoomNearScale: next.zoomNearScale,
    zoomFarDistance: next.zoomFarDistance,
  });

  // Logged separately, and louder, because these are the ones that can put the
  // edge of the world on screen. Effective pitch is included because it, not the
  // elevation, is what decides whether the frustum passes the horizon — and it
  // moves when `?lookAt=` does, which is not obvious from the two numbers.
  const height = next.camera.distance * Math.sin((next.camera.elevationDegrees * Math.PI) / 180);
  const groundRun =
    next.camera.distance * Math.cos((next.camera.elevationDegrees * Math.PI) / 180);
  const effectivePitch =
    (Math.atan2(height - next.camera.lookAtHeight, groundRun) * 180) / Math.PI;
  console.info('[murcia pose] overridden by query parameters — run check:footprint before keeping', {
    elevationDegrees: next.camera.elevationDegrees,
    distance: next.camera.distance,
    azimuthDegrees: next.camera.azimuthDegrees,
    fov: next.camera.fov,
    lookAtHeight: next.camera.lookAtHeight,
    focus: `${next.initialFocus.x}, ${next.initialFocus.z}`,
    cameraHeight: Number(height.toFixed(1)),
    effectivePitch: Number(effectivePitch.toFixed(1)),
    horizonInFrame: effectivePitch < next.camera.fov / 2,
    zoomFar: `${next.zoomFarDistance} @ ${next.zoomFarElevationDegrees} deg`,
    skirt: next.terrainTransition.enabled ? next.terrainTransition.width : 'DISABLED',
  });

  return next;
}


/** Parses a finite number, ignoring the parameter entirely if it fails `valid`. */
function readNumber(
  params: URLSearchParams,
  key: string,
  valid: (value: number) => boolean,
): number | null {
  const raw = params.get(key);
  if (raw === null || raw.length === 0) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || !valid(value)) {
    console.warn(`[navigation] ignoring ?${key}=${raw} — not a usable number`);
    return null;
  }
  return value;
}
