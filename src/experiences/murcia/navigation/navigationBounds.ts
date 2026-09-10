import type { BoundsRect } from '../config/environmentConfig';

/**
 * Rectangle helpers for navigation bounds.
 *
 * Deliberately plain functions rather than a class: the clamp is applied to a
 * *proposed* focus before it is committed, so soft resistance or a spring
 * effect can be introduced later by changing only the caller
 * (docs/plans/002 Phase 4).
 */

export interface ClampResult {
  x: number;
  z: number;
  /** True when the proposal was outside and had to be corrected. */
  clamped: boolean;
}

export function expandRect(rect: BoundsRect, amount: number): BoundsRect {
  return {
    minX: rect.minX - amount,
    maxX: rect.maxX + amount,
    minZ: rect.minZ - amount,
    maxZ: rect.maxZ + amount,
  };
}

export function intersectRect(a: BoundsRect, b: BoundsRect): BoundsRect {
  return {
    minX: Math.max(a.minX, b.minX),
    maxX: Math.min(a.maxX, b.maxX),
    minZ: Math.max(a.minZ, b.minZ),
    maxZ: Math.min(a.maxZ, b.maxZ),
  };
}

/**
 * The smallest rectangle containing both. Used to guarantee that the limit
 * rectangle contains the firm one whatever the config says, since a limit
 * inside the area the drag already reaches would resist in the wrong direction.
 */
export function unionRect(a: BoundsRect, b: BoundsRect): BoundsRect {
  return {
    minX: Math.min(a.minX, b.minX),
    maxX: Math.max(a.maxX, b.maxX),
    minZ: Math.min(a.minZ, b.minZ),
    maxZ: Math.max(a.maxZ, b.maxZ),
  };
}

/** Whether `outer` covers all of `inner`, edge-inclusive. */
export function containsRect(outer: BoundsRect, inner: BoundsRect): boolean {
  return (
    outer.minX <= inner.minX &&
    outer.maxX >= inner.maxX &&
    outer.minZ <= inner.minZ &&
    outer.maxZ >= inner.maxZ
  );
}

export function isInverted(rect: BoundsRect): boolean {
  return rect.minX > rect.maxX || rect.minZ > rect.maxZ;
}

/**
 * Collapses an over-constrained rectangle to its midpoint on the offending
 * axis rather than leaving it inverted.
 *
 * An inverted rectangle would make every clamp comparison meaningless and
 * effectively remove the limits, which Phase 4 explicitly forbids. Collapsing
 * pins the focus instead, which is restrictive but never unsafe.
 */
export function collapseIfInverted(rect: BoundsRect): BoundsRect {
  const result = { ...rect };
  if (result.minX > result.maxX) {
    const mid = (result.minX + result.maxX) / 2;
    result.minX = mid;
    result.maxX = mid;
  }
  if (result.minZ > result.maxZ) {
    const mid = (result.minZ + result.maxZ) / 2;
    result.minZ = mid;
    result.maxZ = mid;
  }
  return result;
}

export function clampToRect(x: number, z: number, rect: BoundsRect): ClampResult {
  const clampedX = Math.min(Math.max(x, rect.minX), rect.maxX);
  const clampedZ = Math.min(Math.max(z, rect.minZ), rect.maxZ);
  return {
    x: clampedX,
    z: clampedZ,
    clamped: clampedX !== x || clampedZ !== z,
  };
}

export function containsPoint(x: number, z: number, rect: BoundsRect): boolean {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}

/*
 * `resistToRect` lived here: the exponential soft band of DECISIONS §40, which
 * let the drag be pushed past the firm edge against a gain falling to zero.
 *
 * It went with §39 and §40 in the camera-navigation port. There is one
 * rectangle now and the clamp against it is hard, because the rectangle itself
 * is grown past the authored plate — the softness bought pan range that the
 * grown rect simply gives. `?band=` and `extendedBounds` went with it.
 */

