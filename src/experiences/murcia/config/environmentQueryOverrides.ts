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
): EnvironmentConfig {
  const params = new URLSearchParams(search);

  const dragGain = readNumber(params, 'dragGain', (v) => v > 0);
  const yawDegrees = readNumber(params, 'yawDeg', (v) => v > 0);
  // Time constants: 0 is meaningful (exact tracking, no inertia), negatives are
  // not — a negative would flip the sign of the exponential and diverge.
  const smoothing = readNumber(params, 'smooth', (v) => v >= 0);
  const release = readNumber(params, 'release', (v) => v >= 0);
  const inertia = readNumber(params, 'inertia', (v) => v >= 0);

  if (
    dragGain === null &&
    yawDegrees === null &&
    smoothing === null &&
    release === null &&
    inertia === null
  ) {
    return env;
  }

  // The two axes are deliberately kept matched, as in murciaConfig: one gesture
  // carries both, so a difference in weight between them reads as a fault.
  const overrideFeel = (feel: DragFeelConfig): DragFeelConfig => ({
    ...feel,
    smoothingTimeConstant: smoothing ?? feel.smoothingTimeConstant,
    releaseTimeConstant: release ?? feel.releaseTimeConstant,
    inertiaTimeConstant: inertia ?? feel.inertiaTimeConstant,
  });

  const next: EnvironmentConfig = {
    ...env,
    navigation: {
      ...env.navigation,
      translationGain: dragGain ?? env.navigation.translationGain,
      feel: overrideFeel(env.navigation.feel),
      rotation: {
        ...env.navigation.rotation,
        degreesPerViewportWidth:
          yawDegrees ?? env.navigation.rotation.degreesPerViewportWidth,
        feel: overrideFeel(env.navigation.rotation.feel),
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
