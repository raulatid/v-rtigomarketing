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
 *   ?yawSmooth=0.05  ?zoomMin=0.6  ?zoomMax=1.3  ?wheelZoom=0.002  ?zoomSmooth=0.2
 *
 * `?dragGain=0.5&smooth=0.09` restores the pre-rework feel in one URL, which is
 * the comparison most likely to be wanted while reviewing it.
 *
 * `?zoomMax=` is not like the others: it is the one parameter whose safe value
 * was measured rather than judged, so exceeding it is warned about explicitly.
 * See the note where that warning is raised.
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

  const wheelZoom = readNumber(params, 'wheelZoom', (v) => v > 0);
  const zoomSmoothing = readNumber(params, 'zoomSmooth', (v) => v >= 0);
  let zoomMin = readNumber(params, 'zoomMin', (v) => v > 0);
  let zoomMax = readNumber(params, 'zoomMax', (v) => v > 0);

  // An inverted band would clamp every scale to a single unreachable value and
  // leave zoom silently dead, which is worse than ignoring the parameters.
  const resolvedMin = zoomMin ?? env.navigation.zoom.minDistanceScale;
  const resolvedMax = zoomMax ?? env.navigation.zoom.maxDistanceScale;
  if (resolvedMin > resolvedMax) {
    console.warn(
      `[navigation] ignoring ?zoomMin=${resolvedMin} / ?zoomMax=${resolvedMax} — min exceeds max`,
    );
    zoomMin = null;
    zoomMax = null;
  }

  // This one gets a warning of its own, because it is the only parameter here
  // whose shipped value is a MEASUREMENT rather than a judgement. Past it the
  // viewport's ground footprint outgrows the terrain skirt and the hard plate
  // edge enters frame — on wide viewports first, so the person raising it is
  // unlikely to see the failure they caused.
  if (zoomMax !== null && zoomMax > env.navigation.zoom.maxDistanceScale) {
    console.warn(
      `[navigation] ?zoomMax=${zoomMax} exceeds ${env.navigation.zoom.maxDistanceScale}, the ` +
        'value checks/navigation-zoom.ts proved footprint-safe. Beyond it the plate edge can ' +
        'enter frame on wide viewports. Fine for comparing feel; not a value to settle on ' +
        'without re-running that check.',
    );
  }

  if (
    dragGain === null &&
    yawDegrees === null &&
    smoothing === null &&
    release === null &&
    inertia === null &&
    yawSmoothing === null &&
    wheelZoom === null &&
    zoomSmoothing === null &&
    zoomMin === null &&
    zoomMax === null
  ) {
    return env;
  }

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
      zoom: {
        ...env.navigation.zoom,
        minDistanceScale: zoomMin ?? env.navigation.zoom.minDistanceScale,
        maxDistanceScale: zoomMax ?? env.navigation.zoom.maxDistanceScale,
        wheelSensitivity: wheelZoom ?? env.navigation.zoom.wheelSensitivity,
        smoothingTimeConstant:
          zoomSmoothing ?? env.navigation.zoom.smoothingTimeConstant,
      },
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
      zoom: next.navigation.zoom,
    },
  );

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
