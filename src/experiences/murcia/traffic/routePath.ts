/**
 * Arc-length sampling of a world-space polyline, for the ambient traffic.
 *
 * Pure: no three, no allocation per sample. The traffic samples one point per
 * agent per frame, so `sample` writes into the caller's object.
 *
 * The heading is not the direction of the segment under the point: at every
 * vertex that jumps, and an agent would snap round the corner and, with a
 * lateral offset, jump sideways too. It is the chord across a short window
 * (`turnRadius` either side), so heading and offset both turn continuously
 * through a corner.
 */

export type RoutePoint = readonly [x: number, y: number, z: number];

export interface PathSample {
  x: number;
  y: number;
  z: number;
  /** Unit heading in XZ, in the direction of travel. */
  dirX: number;
  dirZ: number;
}

export interface RoutePath {
  /** Length in XZ, in world units. */
  readonly length: number;
  /**
   * The point `distance` along the path (clamped to its ends), pushed
   * `lateral` units to the RIGHT of the direction of travel. `reversed` walks
   * the path from its last point: distance 0 is then the last point, and right
   * is the right of that direction.
   */
  sample(distance: number, lateral: number, reversed: boolean, out: PathSample): PathSample;
}

export function createSample(): PathSample {
  return { x: 0, y: 0, z: 0, dirX: 1, dirZ: 0 };
}

export function createRoutePath(points: readonly RoutePoint[], turnRadius: number): RoutePath {
  if (points.length < 2) throw new Error('[traffic] a route needs at least two points');
  if (!(turnRadius > 0)) throw new Error('[traffic] turnRadius must be positive');

  const cumulative = new Float64Array(points.length);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const step = Math.hypot(b[0] - a[0], b[2] - a[2]);
    if (!(step > 0)) throw new Error(`[traffic] route has a zero-length segment at point ${i}`);
    cumulative[i] = cumulative[i - 1]! + step;
  }
  const length = cumulative[points.length - 1]!;

  // Last segment whose start is at or before `d`.
  const segmentAt = (d: number): number => {
    let lo = 0;
    let hi = points.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (cumulative[mid]! <= d) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };

  const at = { x: 0, y: 0, z: 0 };
  const pointAt = (d: number): typeof at => {
    const clamped = Math.min(Math.max(d, 0), length);
    const i = segmentAt(clamped);
    const a = points[i]!;
    const b = points[i + 1]!;
    const t = (clamped - cumulative[i]!) / (cumulative[i + 1]! - cumulative[i]!);
    at.x = a[0] + (b[0] - a[0]) * t;
    at.y = a[1] + (b[1] - a[1]) * t;
    at.z = a[2] + (b[2] - a[2]) * t;
    return at;
  };

  return {
    length,
    sample(distance, lateral, reversed, out) {
      const d = reversed ? length - distance : distance;
      // The chord across the window, shortened at the ends so it never collapses.
      const behind = pointAt(d - turnRadius);
      const bx = behind.x;
      const bz = behind.z;
      const ahead = pointAt(d + turnRadius);
      let dx = ahead.x - bx;
      let dz = ahead.z - bz;
      const chord = Math.hypot(dx, dz);
      if (chord > 1e-9) {
        dx /= chord;
        dz /= chord;
      } else {
        dx = 1;
        dz = 0;
      }
      if (reversed) {
        dx = -dx;
        dz = -dz;
      }

      const centre = pointAt(d);
      // Right of travel with Y up: heading × up = (-dz, 0, dx).
      out.x = centre.x - dz * lateral;
      out.y = centre.y;
      out.z = centre.z + dx * lateral;
      out.dirX = dx;
      out.dirZ = dz;
      return out;
    },
  };
}
