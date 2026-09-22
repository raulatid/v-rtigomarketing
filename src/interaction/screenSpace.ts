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

/**
 * A world position to client coordinates, written into `out`.
 *
 * The other direction, and it lives here for the reason `clientToNdc` does: the
 * Y axis flips and the X axis does not. It was written three times before this
 * — `createBlogDisplayEntry`'s `screenPoint()` and a copy in each of two test
 * files — and the first of those carries a comment calling itself test-only,
 * which stopped being true the moment something on screen had to be pinned to a
 * place in the city.
 *
 * `null` rather than a position when the point cannot be pinned to, which is a
 * meaningful answer and not a failure: the caller should draw nothing.
 *
 * ── Why the frustum test is not just `z` ──
 * `Vector3.project` divides by w, and for a point BEHIND the camera w is
 * negative — so x and y come back negated and a target behind the viewer
 * reports a plausible position on the opposite side of the screen. Guarding `z`
 * alone catches that case, which is why the original did, but it lets a point
 * that has merely slid off the side of the screen keep reporting: x of 4.2 is
 * outside the frustum and projects to three viewport widths off the left edge.
 * Anything anchored there is a DOM node parked far outside the document, which
 * costs layout and can extend the scroll area. Both are rejected here.
 */
export function worldToClient(
  rect: ElementRect,
  camera: THREE.Camera,
  world: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 | null {
  if (rect.width === 0 || rect.height === 0) return null
  out.copy(world).project(camera)
  if (out.z < -1 || out.z > 1) return null
  if (out.x < -1 || out.x > 1 || out.y < -1 || out.y > 1) return null
  // Reusing `out` for the result: NDC is consumed by the two lines below and
  // nothing downstream wants it, so a second vector would exist only to be
  // discarded on a per-frame path.
  out.x = rect.left + ((out.x + 1) / 2) * rect.width
  out.y = rect.top + ((1 - out.y) / 2) * rect.height
  return out
}

/**
 * A world position to client coordinates, KEPT when it falls outside the rect.
 *
 * `worldToClient` refuses a point that has slid off the side of the screen, for
 * a reason that holds whenever the result positions an element: a DOM node
 * parked three viewport widths off the left edge costs layout and can extend
 * the scroll area. This is for a caller that wants a DIRECTION toward the
 * point — Murcia's cursor compass, whose arrowhead has to keep pointing at a
 * building the viewer has turned away from — and never places anything at it.
 *
 * The one guard kept is the one that makes the answer wrong rather than merely
 * off-screen: behind the camera `w` is negative, the divide negates x and y, and
 * the point reports on the opposite side of the screen. `null` there, and the
 * caller falls back to something that does not need the projection.
 */
export function projectToClient(
  rect: ElementRect,
  camera: THREE.Camera,
  world: THREE.Vector3,
  out: THREE.Vector3,
): THREE.Vector3 | null {
  if (rect.width === 0 || rect.height === 0) return null
  out.copy(world).project(camera)
  if (out.z < -1 || out.z > 1) return null
  out.x = rect.left + ((out.x + 1) / 2) * rect.width
  out.y = rect.top + ((1 - out.y) / 2) * rect.height
  return out
}
