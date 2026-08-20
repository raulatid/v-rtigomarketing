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

  if (
    dragGain === null &&
    yawDegrees === null &&
    smoothing === null &&
    release === null &&
    inertia === null &&
    yawSmoothing === null &&
    focusMin === null
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
