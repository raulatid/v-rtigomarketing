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
 *   ?dragGain=0.4  ?yawDeg=100  ?smooth=0.12  ?release=0.1  ?inertia=0.6
 *   ?yawSmooth=0.05  ?focusMin=0.6
 *
 * `?dragGain=0.5&smooth=0.09` restores the pre-rework feel in one URL, which is
 * the comparison most likely to be wanted while reviewing it.
 *
 * ── The camera pose, added 2026-09-04 ──
 *
 *   ?elev=19  ?dist=225  ?fov=35  ?lookAt=5.85  ?farPlane=3500
 *   ?zoomFar=400  ?zoomFarElev=55  ?zoomNear=0.7
 *   ?skirt=700  ?fade=0.21
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
 *   ?elev=19&lookAt=-30           low camera, horizon cropped by aiming below the focus
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
import type { EnvironmentConfig, DragFeelConfig } from './environmentConfig';

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
  if (!enabled) return env;

  const params = new URLSearchParams(search);

  const dragGain = readNumber(params, 'dragGain', (v) => v > 0);
  const yawDegrees = readNumber(params, 'yawDeg', (v) => v > 0);
  // Time constants: 0 is meaningful (exact tracking, no inertia), negatives are
  // not — a negative would flip the sign of the exponential and diverge.
  const smoothing = readNumber(params, 'smooth', (v) => v >= 0);
  const release = readNumber(params, 'release', (v) => v >= 0);
  const inertia = readNumber(params, 'inertia', (v) => v >= 0);
  // Separate from ?smooth= on purpose — see overrideFeel below.
  const yawSmoothing = readNumber(params, 'yawSmooth', (v) => v >= 0);

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
    dragGain,
    yawDegrees,
    smoothing,
    release,
    inertia,
    yawSmoothing,
    focusMin,
    elevation,
    distance,
    fov,
    lookAt,
    farPlane,
    zoomFar,
    zoomFarElev,
    zoomNear,
    skirt,
    fade,
  ];
  if (overrides.every((value) => value === null)) return env;

  // `?smooth=` hits TRANSLATION ONLY. It used to apply to both axes, on the
  // premise that one gesture carried both so a difference in weight between
  // them would read as a fault. That premise died with the gesture split: pan
  // and rotation are now separate inputs with separate feels, and translation's
  // constant is coupled to translationGain in a way rotation's is not. Applying
  // one value to both would silently retune rotation every time someone A/Bs
  // the pan. `?yawSmooth=` is the rotation equivalent.
  const overrideFeel = (feel: DragFeelConfig, smooth: number | null): DragFeelConfig => ({
    ...feel,
    smoothingTimeConstant: smooth ?? feel.smoothingTimeConstant,
    releaseTimeConstant: release ?? feel.releaseTimeConstant,
    inertiaTimeConstant: inertia ?? feel.inertiaTimeConstant,
  });

  const next: EnvironmentConfig = {
    ...env,
    camera: {
      ...env.camera,
      elevationDegrees: elevation ?? env.camera.elevationDegrees,
      distance: distance ?? env.camera.distance,
      fov: fov ?? env.camera.fov,
      lookAtHeight: lookAt ?? env.camera.lookAtHeight,
      far: farPlane ?? env.camera.far,
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
      translationGain: dragGain ?? env.navigation.translationGain,
      feel: overrideFeel(env.navigation.feel, smoothing),
      rotation: {
        ...env.navigation.rotation,
        degreesPerViewportWidth:
          yawDegrees ?? env.navigation.rotation.degreesPerViewportWidth,
        feel: overrideFeel(env.navigation.rotation.feel, yawSmoothing),
      },
    },
    focusFlight: {
      ...env.focusFlight,
      minDistanceScale: focusMin ?? env.focusFlight.minDistanceScale,
    },
  };

  console.info(
    '[navigation] feel overridden by query parameters',
    {
      translationGain: next.navigation.translationGain,
      degreesPerViewportWidth: next.navigation.rotation.degreesPerViewportWidth,
      smoothingTimeConstant: next.navigation.feel.smoothingTimeConstant,
      releaseTimeConstant: next.navigation.feel.releaseTimeConstant,
      inertiaTimeConstant: next.navigation.feel.inertiaTimeConstant,
      yawSmoothingTimeConstant: next.navigation.rotation.feel.smoothingTimeConstant,
      focusMinDistanceScale: next.focusFlight.minDistanceScale,
    },
  );

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
    fov: next.camera.fov,
    lookAtHeight: next.camera.lookAtHeight,
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
