import type * as THREE from 'three';

/**
 * Runs `run` with every hidden object in `targets` made visible, then hides them
 * again — also when `run` throws.
 *
 * For `MurciaExperience.warm()`. three's `compile` walks `traverseVisible`, and
 * so does a render, so an object born hidden — the blog's orbit ring, the campus
 * particles — escaped both and compiled its program synchronously on the first
 * frame it appeared: the arrival in the city, measured at a 313 ms frame on a
 * desktop GPU (2026-09-23).
 *
 * Synchronous on purpose. `compileAsync` collects its materials before its first
 * `await`, so the objects only have to be visible for the call itself, and no
 * frame can render them in between.
 */
export function whileRevealed<T>(targets: readonly THREE.Object3D[], run: () => T): T {
  const hidden = targets.filter((object) => !object.visible);
  for (const object of hidden) object.visible = true;
  try {
    return run();
  } finally {
    for (const object of hidden) object.visible = false;
  }
}
