// Wheel events, normalised to CSS pixels.
//
// Extracted from `DragPanController.onWheel` when the wheel stopped driving zoom
// and started driving scene navigation (`adr/009`). It is its own module rather
// than a few lines inside the new handler for one reason: the properties below
// were discovered by a harness that no longer has anything to drive, and a
// property whose only guard is deleted alongside its feature is a property that
// silently regresses.
//
// Imports nothing, deliberately — `checks/architecture.ts` asserts that `utils/`
// reaches for no experience and no shell, and this is the module both the
// application and a Node harness read.

/**
 * A wheel event, reduced to the two fields that decide its magnitude.
 *
 * Structural rather than `WheelEvent` so a test can state a case in one literal
 * and a harness can synthesise a macOS momentum tail without a DOM.
 */
export interface WheelLike {
  deltaY: number
  /** 0 pixels, 1 lines, 2 pages. */
  deltaMode: number
}

/**
 * Pixels per line, for `deltaMode: 1`.
 *
 * Chrome reports pixels and Firefox reports lines. Normalising here is the whole
 * reason navigation is not 16x faster in one browser than in the other — the bug
 * this constant prevents is invisible to anyone testing in a single browser.
 */
export const WHEEL_LINE_HEIGHT_PX = 16

/** Pixels per page, for `deltaMode: 2`. Rare; Firefox with a page-scroll device. */
export const WHEEL_PAGE_HEIGHT_PX = 100

/**
 * Ceiling on what a single event may contribute, in normalised pixels.
 *
 * macOS momentum scrolling can deliver hundreds of pixels in one event at the
 * head of a flick. Uncapped, one flick crosses an entire gesture in a single
 * event and there is no interior left to aim in — which for a navigation gesture
 * means a flick IS a navigation, and the deliberateness the accumulator exists to
 * require is gone.
 *
 * 120 is inherited unchanged from the zoom band's `MAX_WHEEL_DELTA`, where it was
 * chosen against the same event streams for the same reason. It is a judged value
 * and it is being reused rather than re-judged, because the input it is bounding
 * has not changed — only what reads it has.
 */
export const MAX_WHEEL_DELTA_PX = 120

/**
 * One wheel event as a signed pixel travel, normalised across devices and clamped.
 *
 * Positive is a downward scroll, matching `deltaY`. Callers map that onto their own
 * notion of direction; this module has no idea what the gesture means.
 *
 * `ctrlKey` is deliberately NOT consulted. Every browser reports a trackpad pinch
 * as ctrl+wheel, and the zoom band used to amplify those because a pinch carries
 * far smaller deltas than a mouse notch. Nothing zooms any more, so a pinch is not
 * a navigation and its amplifier retired with the band. The caller decides whether
 * to feed a ctrl+wheel event in at all.
 */
export function normalizeWheelDelta(event: WheelLike): number {
  const unit =
    event.deltaMode === 1
      ? WHEEL_LINE_HEIGHT_PX
      : event.deltaMode === 2
        ? WHEEL_PAGE_HEIGHT_PX
        : 1

  const scaled = event.deltaY * unit
  if (!Number.isFinite(scaled)) return 0
  return clamp(scaled, -MAX_WHEEL_DELTA_PX, MAX_WHEEL_DELTA_PX)
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}
