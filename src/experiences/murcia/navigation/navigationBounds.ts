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

/**
 * Moves a proposed focus toward the limit rectangle with rising resistance
 * instead of stopping it dead at the firm one (DECISIONS §40).
 *
 * `firm` is where panning is 1:1. `limit` is the hard bound — the rectangle that
 * actually keeps the eye inside the city, and the one no result may ever exceed.
 * Between them the gain falls smoothly to zero, so the edge is felt arriving
 * rather than hit.
 *
 * The ramp, per axis, with `b` the band width on the edge being pressed and
 * `gap` the distance still available to the limit:
 *
 *   gap' = gap * exp(-travel / b)
 *
 * Three properties, and each of them is why this shape rather than a polynomial
 * falloff:
 *
 *  1. It cannot overshoot. Mathematically `gap' > 0` for any finite travel, and
 *     the result is
 *     written as `limit - gap'` rather than `firm + overshoot`, so the bound is
 *     arithmetic and not an epsilon. In float64, beyond ~35 band widths of *accumulated*
 *     travel the exponential underflows and the focus rests exactly on the limit,
 *     which is the safe bound anyway — by then the gain has been zero for a long
 *     while and nothing about the feel depends on the last 1e-15 of a unit.
 *  2. It composes exactly: `d1` then `d2` lands where `d1 + d2` lands, because
 *     multiplying the gap is associative. A naive per-event `delta * gain(o)`
 *     does not have this, so where the city ended up would depend on how many
 *     pointermove events the browser happened to coalesce.
 *  3. Gain is 1 at the firm edge. The band does not announce itself with a step
 *     in speed, which is the whole point of the change.
 *
 * Travel that crosses the firm edge is split: 1:1 up to the edge, ramped after
 * it. Travel that LEAVES a band is 1:1 — the resistance is one-way on purpose.
 * There is no snap-back (the focus stays where it was pushed), so a symmetric
 * ramp would make the first drag back out of a deep overshoot feel stuck.
 */
export function resistToRect(
  currentX: number,
  currentZ: number,
  proposedX: number,
  proposedZ: number,
  firm: BoundsRect,
  limit: BoundsRect,
): ClampResult {
  const x = resistAxis(currentX, proposedX, firm.minX, firm.maxX, limit.minX, limit.maxX);
  const z = resistAxis(currentZ, proposedZ, firm.minZ, firm.maxZ, limit.minZ, limit.maxZ);
  return { x, z, clamped: x !== proposedX || z !== proposedZ };
}

/**
 * One axis of `resistToRect`. Mirrored around the two edges rather than written
 * once and negated, because the asymmetry — outward resists, inward does not —
 * makes the mirror clearer than the sign juggling would be.
 */
function resistAxis(
  current: number,
  proposed: number,
  firmMin: number,
  firmMax: number,
  limitMin: number,
  limitMax: number,
): number {
  if (proposed === current) return current;

  if (proposed > current) {
    if (proposed <= firmMax) return proposed;
    const band = limitMax - firmMax;
    // No band on this edge: the footprint term has bound both rectangles to the
    // same value, or the rectangles disagree. Either way this edge is a wall
    // again, and the tighter of the two is the one to trust.
    if (!(band > 0)) return Math.min(proposed, firmMax, limitMax);
    const from = Math.max(current, firmMax);
    return limitMax - (limitMax - from) * Math.exp(-(proposed - from) / band);
  }

  if (proposed >= firmMin) return proposed;
  const band = firmMin - limitMin;
  if (!(band > 0)) return Math.max(proposed, firmMin, limitMin);
  const from = Math.min(current, firmMin);
  return limitMin + (from - limitMin) * Math.exp(-(from - proposed) / band);
}
