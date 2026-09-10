/**
 * Where the focused satellite sits on screen, and why it is not a constant.
 *
 * THE BUG THIS EXISTS FOR. The close-up used to shift the look-at by a fixed
 * 0.32 world units, chosen so the satellite lands left of centre and the case
 * panel has the right of the frame to itself. A world-space offset is an
 * ANGULAR offset — ~16.2° off the view axis at the close-up distance — and the
 * frame's horizontal half-angle is not a constant at all: it is
 * `atan(tan(vFov/2) * aspect)`, which collapses as the viewport narrows.
 *
 *   16:9      horizontal half-FOV 36.4°   offset is 45% of half-width
 *   3:4       19.3°                       84% — at the frame edge
 *   9:19.5    10.8°                       150% — OUTSIDE the frustum
 *
 * So on a phone in portrait, tapping a satellite flew the subject of the
 * close-up off the side of the screen. See `audits/mobile-responsiveness-2026-08-14.md`, M2.
 *
 * THE FIX IS TO EXPRESS THE COMPOSITION THE WAY IT WAS ALWAYS MEANT. What was
 * being chosen was never a distance in metres; it was "a bit less than half way
 * to the left edge". Stated as a fraction of the half-width, it holds at every
 * aspect ratio by construction, which is the same reasoning Murcia's
 * `computeFramedFocus` follows when it raycasts an NDC target rather than
 * assuming a FOV axis.
 *
 * AND BELOW THE BREAKPOINT THERE IS NOTHING TO CLEAR. The panel stops being a
 * right-hand dock and becomes a bottom sheet (`styles.css`, the
 * `(max-width: 767px), (max-height: 500px)` block), so a sideways shift would
 * move the subject away from centre for no reason at all. The offset goes to
 * zero and the satellite is centred — which is also what keeps it clear of the
 * sheet's peek stop, since the sheet's top edge sits at 60% of the screen.
 *
 * This module is deliberately pure — no three.js, no DOM — so the unit tier can
 * drive it directly (DECISIONS §22).
 */

/**
 * Reproduces the shipped desktop composition exactly.
 *
 * Derived, not picked: at the 16:9 the look was judged on, the old constant
 * 0.32 world units sat at 0.32 / (tan(22.5°) × 1.1 × 16/9) = 0.3951 of the
 * horizontal half-width. Rounding to 0.395 moves the satellite by 4/10000 of a
 * world unit, which is why this is a refactor of the framing rather than a
 * retune of it.
 */
export const CLOSE_UP_OFFSET_FRACTION = 0.395

/**
 * The width at which the case panel is a right-hand dock rather than a bottom
 * sheet. Must stay in step with the media query in `styles.css` — they are two
 * halves of one composition decision, which is the coupling `styles.css` has
 * always documented as "a contract with the camera".
 */
export const CASE_PANEL_DOCK_MIN_WIDTH = 768

/**
 * And the height, because a dock is as impossible on a short viewport as on a
 * narrow one. A phone in landscape is 852x393: wide enough to pass the width
 * test, and less than half as tall as the panel's own content, so it used to
 * get a 324px-wide dock 820px tall with no way to scroll it — AND this offset,
 * pushing the satellite aside to clear a column that did not fit on screen.
 *
 * 501 pairs with the stylesheet's `(max-height: 500px)`.
 */
export const CASE_PANEL_DOCK_MIN_HEIGHT = 501

/**
 * Is this viewport a PHONE?
 *
 * The two constants above are a width AND a height because a breakpoint written
 * only in width does not describe a phone — `styles.css` learned that the hard
 * way with `(max-width: 767px), (max-height: 500px)`, and PROJECT_MEMORY records
 * it. A phone in landscape is 852x393: wide enough to pass any width test, and
 * still a phone.
 *
 * Extracted on 2026-09-09 so the satellites' size can ask the same question the
 * close-up's framing already asked, rather than spelling the breakpoint a fifth
 * time. The repo has four spellings already (SiteHeader's PHONE_QUERY,
 * AuditSection's MOBILE_MAX, earthConfig's and spaceConfig's narrowMaxWidth) and
 * DECISIONS.md records a shipped black sky caused by exactly that kind of drift.
 *
 * A 0x0 viewport answers TRUE. R3F reports 0x0 for a frame or two before the
 * container is measured, and of the two possible wrong answers this is the
 * harmless one: it is what the guards below already do by falling through to
 * `return 0`, and any consumer that acts on it is corrected on the next read.
 */
export function isPhoneViewport(viewportWidthPx: number, viewportHeightPx: number): boolean {
  return viewportWidthPx < CASE_PANEL_DOCK_MIN_WIDTH || viewportHeightPx < CASE_PANEL_DOCK_MIN_HEIGHT
}

export interface CloseUpOffsetParams {
  /** Camera-to-subject distance, in world units. */
  subjectDistance: number
  /** The camera's vertical field of view, in degrees — three's `camera.fov`. */
  verticalFovDegrees: number
  /** Viewport aspect, width / height. */
  aspect: number
  /** Viewport width in CSS pixels, which is what the breakpoint is written in. */
  viewportWidthPx: number
  /** Viewport height in CSS pixels. See CASE_PANEL_DOCK_MIN_HEIGHT. */
  viewportHeightPx: number
}

/**
 * The lateral world-space offset to add to the look-at, pushing the subject
 * left of centre. Zero when the panel is not beside it — which means whenever
 * the panel is a bottom sheet, on a narrow viewport OR a short one.
 */
export function closeUpScreenOffset({
  subjectDistance,
  verticalFovDegrees,
  aspect,
  viewportWidthPx,
  viewportHeightPx,
}: CloseUpOffsetParams): number {
  if (isPhoneViewport(viewportWidthPx, viewportHeightPx)) return 0

  // Degenerate inputs are possible in practice: R3F reports a 0×0 size for a
  // frame or two before the container is measured, and an aspect of 0 would
  // silently centre the subject rather than erroring. Guarding is cheaper than
  // explaining the one-frame flicker later.
  if (!(aspect > 0) || !(subjectDistance > 0)) return 0

  const halfHeight = Math.tan((verticalFovDegrees * Math.PI) / 360) * subjectDistance
  return halfHeight * aspect * CLOSE_UP_OFFSET_FRACTION
}
