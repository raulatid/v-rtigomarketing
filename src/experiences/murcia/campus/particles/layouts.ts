import type * as THREE from 'three';

/**
 * Where the particles end up.
 *
 * A layout hands particle `index` of `count` a target point, drawing from
 * `random` so the field stays reproducible per seed. `order` is the
 * particle's rank by seed, 0..1: low orders start a morph first, so a layout
 * that hands them one end of a shape makes the shape draw from that end.
 * The particle system knows nothing about discs: swapping the disc for a
 * word is a new layout and nothing else.
 */
export type TargetLayout = (
  index: number,
  count: number,
  random: () => number,
  out: THREE.Vector3,
  order: number,
) => void;

/**
 * A flat disc in the ground plane, evenly filled. The square root on the
 * radius is what makes it even: without it the particles crowd the centre.
 */
export function discLayout(center: THREE.Vector3, radius: number): TargetLayout {
  return (_index, _count, random, out) => {
    const phi = random() * Math.PI * 2;
    const r = radius * Math.sqrt(random());
    out.set(center.x + Math.cos(phi) * r, center.y, center.z + Math.sin(phi) * r);
  };
}

/** A square in the world: its centre, the directions of its axes, and its width. */
export interface PlaneFrame {
  readonly center: THREE.Vector3;
  /** Unit vector along +u. */
  readonly right: THREE.Vector3;
  /** Unit vector along +v. */
  readonly up: THREE.Vector3;
  readonly width: number;
}

/** Maps a point of the unit square (u, v in -0.5..0.5) onto `frame`. */
export function placeOnPlane(frame: PlaneFrame, u: number, v: number, out: THREE.Vector3): void {
  out
    .copy(frame.center)
    .addScaledVector(frame.right, u * frame.width)
    .addScaledVector(frame.up, v * frame.width);
}
