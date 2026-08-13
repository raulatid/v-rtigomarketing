import type * as THREE from 'three'

/**
 * The part of a `DOMRect` this conversion needs. Structural so both a real
 * `getBoundingClientRect()` result and the cached copies some callers keep
 * satisfy it without a cast.
 */
export interface ElementRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * Client coordinates to normalised device coordinates, written into `out`.
 *
 * Two lines, and it was written five times: the drag controller's ground
 * projection, Murcia's click probe, the district picker, the satellite picker
 * and the geo-marker picker. Shared not to save the lines but because of what
 * the lines are — the Y axis flips and the X axis does not, and that asymmetry
 * is exactly the kind of thing that gets typed correctly four times and
 * inverted once. A picker with a mirrored Y still returns hits; it returns the
 * wrong ones, near the centre it returns the right ones, and it is discovered
 * by hand at an edge of the screen.
 *
 * Writes into a caller-owned vector rather than returning one: every call site
 * is on a pointer path or a per-frame path and already keeps a scratch vector
 * for the purpose (PRINCIPLES §30).
 *
 * Deliberately does NOT do the raycast. The five callers diverge immediately
 * after this point — a plane intersection, an object intersection against
 * different sets, with different recursion — and merging those would be the
 * wrong abstraction over a genuine difference (§12).
 */
export function clientToNdc(
  rect: ElementRect,
  clientX: number,
  clientY: number,
  out: THREE.Vector2,
): THREE.Vector2 {
  out.x = ((clientX - rect.left) / rect.width) * 2 - 1
  out.y = -((clientY - rect.top) / rect.height) * 2 + 1
  return out
}
