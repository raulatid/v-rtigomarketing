/**
 * The minimum size of a thing a finger has to hit, and how a point is resolved
 * against controls that have been grown to reach it.
 *
 * ONE owner. The DOM has asserted "44 CSS px on a coarse pointer" control by
 * control since the 08-14 mobile audit, but every 3D surface hit-tests a
 * raycast against authored geometry, and a raycast has no notion of a finger.
 * The Murcia display's controls shrank to ~17 px on a phone through two
 * changes that never opened the display's files — a camera dolly and a rect
 * retune — because the drawn rectangle WAS the hit rectangle and nothing stated
 * the floor in the units a finger is measured in.
 *
 * So the rule is stated here, in CSS pixels, and applied AFTER projection:
 * whatever a control's drawn box comes to on screen, its hit box is at least
 * this wide and this tall. A camera can be retuned freely; the drawn size
 * changes, the hit size does not.
 *
 * CSS pixels, never device pixels. A finger is the same size on a 2x and a 3x
 * screen, and so is the box it needs.
 */
export const MIN_TOUCH_TARGET_CSS_PX = 44

/** A box in client space, CSS px. Edges, not origin + size, so containment is two comparisons per axis. */
export interface ScreenBox {
  left: number
  top: number
  right: number
  bottom: number
}

export function boxContains(box: ScreenBox, x: number, y: number): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
}

/**
 * Grows `box` about its centre until each side is at least `minPx`, into `out`.
 *
 * Symmetric, because the drawn control stays where it is and the finger's
 * error is not biased to one side. A box already large enough is copied
 * unchanged, so the desktop's drawn-size behaviour survives in the case where
 * the drawn size was already generous.
 */
export function expandToMinimum(
  box: ScreenBox,
  minPx = MIN_TOUCH_TARGET_CSS_PX,
  out: ScreenBox = { left: 0, top: 0, right: 0, bottom: 0 },
): ScreenBox {
  const width = box.right - box.left
  const height = box.bottom - box.top
  const growX = Math.max(0, minPx - width) / 2
  const growY = Math.max(0, minPx - height) / 2
  out.left = box.left - growX
  out.right = box.right + growX
  out.top = box.top - growY
  out.bottom = box.bottom + growY
  return out
}

export interface TouchCandidate<T> {
  id: T
  /** What is drawn. */
  visible: ScreenBox
  /** What answers to a finger — `visible` grown to the floor. */
  hit: ScreenBox
}

/**
 * Which candidate a touch at (x, y) means, or null.
 *
 * Grown boxes may overlap where two controls sit closer than the floor, and
 * an overlap must never be ambiguous. The rule, in order:
 *
 *   1. a candidate whose DRAWN box contains the point — the finger is on the
 *      glyph, and no grown neighbour may take that away;
 *   2. otherwise, of the candidates whose grown box contains the point, the one
 *      whose drawn centre is nearest;
 *   3. ties go to array order, which is the caller's priority.
 *
 * Rule 2 is what makes the expansion safe without a second table of clipped
 * rectangles: each control's effective zone is its grown box cut at the
 * midpoint to any neighbour, derived from the live layout on every call. A
 * pre-computed clip would have to be re-derived every time the projection
 * changed, which is every frame the camera moves.
 */
export function resolveTouchTarget<T>(
  x: number,
  y: number,
  candidates: ReadonlyArray<TouchCandidate<T>>,
  count = candidates.length,
): T | null {
  let best: T | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < count; i += 1) {
    const candidate = candidates[i]!
    if (boxContains(candidate.visible, x, y)) return candidate.id
    if (!boxContains(candidate.hit, x, y)) continue
    const cx = (candidate.visible.left + candidate.visible.right) / 2
    const cy = (candidate.visible.top + candidate.visible.bottom) / 2
    const distance = Math.hypot(x - cx, y - cy)
    if (distance < bestDistance) {
      bestDistance = distance
      best = candidate.id
    }
  }
  return best
}
