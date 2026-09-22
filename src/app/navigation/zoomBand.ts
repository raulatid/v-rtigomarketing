import type { ZoomBandLimits } from './navigationConfig'

// Where the viewer has put the camera, and what is left over when they run out
// of room.
//
// This is the module `adr/014` adds and `adr/009` had removed: a REAL zoom, in
// the ordinary sense that it stays where you leave it. Nothing here decays,
// nothing springs back, and no amount of scrolling in one direction navigates on
// its own. It is a position, not a gesture.
//
// ── One scalar, signed toward the other world ──
//
// The band runs -1 .. +1 with 0 at the resting pose, and +1 is always the end
// that FACES THE OTHER WORLD. Which physical direction that is belongs to the
// scene, not to this: on Earth +1 is fully zoomed IN, because Murcia is down
// there; in Murcia it is fully zoomed OUT, because leaving is an ascent
// (`adr/006`). Each world maps the depth onto its own pose through its own
// `zoomPose`, so the two never have to know about each other and this file never
// learns what a world is.
//
// That reuses `towardOther` in `createNavigationInput` exactly as it stood: the
// sign that leads out of a world already had one owner, and a second opinion
// would be a second place to get it wrong.
//
// The input layer confirms navigation at +1. This module only owns position;
// it preserves overflow accounting at that end without requiring another stage.
// The far end (-1) remains a dead stop, with no destination beyond it.
//
// ── Travel, in CSS pixels, not a rate ──
//
// Stored as a signed pixel POSITION rather than as the normalised depth,
// because the two halves of the band are allowed to cost different amounts of
// travel and a normalised accumulator would have to re-derive which half it was
// in on every event. Mouse notches, precision
// trackpads and two fingers on glass deliver wildly different event counts for
// the same gesture, so anything counted in events feels like a different
// product on every device.

export interface ZoomBand {
  /**
   * Absorbs signed travel toward the other world. Returns the unabsorbed px.
   *
   * Non-zero only when the band is already pinned at +1 and the push is still
   * heading that way. Navigation now commits at the end of the band itself.
   * Clamped per event because one absurd event —
   * a dropped frame, a pen, a synthetic stream — must not be worth more than a
   * flick.
   */
  push(travelPx: number): number
  /** -1 at the far limit, 0 at rest, +1 at the limit that faces the other world. */
  readonly depth: number
  /** Pinned against +1, the shared navigation threshold. */
  readonly atLimit: boolean
  /**
   * Back to rest, with no travel of its own.
   *
   * Called at the CUT, never at the commit: the departing warp continues from
   * wherever the zoom left the camera, so dropping the depth when the gesture
   * commits would snap the pose on the first frame of the cinematic it started.
   * Under the cut's full cover there is nothing to see, and the world arriving
   * is a different world, whose zoom nobody has touched yet.
   */
  reset(): void
  /** Diagnostics only. */
  state(): { positionPx: number; depth: number }
}

export function createZoomBand(limits: ZoomBandLimits): ZoomBand {
  /** Signed travel from rest, in CSS px. Positive is toward the other world. */
  let position = 0

  /** Span of the half `position` currently sits in. Never zero. */
  const spanFor = (px: number) =>
    Math.max(1, px >= 0 ? limits.towardTravelPx : limits.awayTravelPx)

  /**
   * The published depth, with negative zero normalised away.
   *
   * `Math.max(x, -0)` yields `-0`, which is numerically zero and compares equal
   * to it everywhere except `Object.is` — and the scenes multiply this into
   * camera distances, where a signed zero is a trap waiting for whichever
   * comparison is written with `===` against a literal.
   */
  const depthAt = (px: number) => {
    const value = px / spanFor(px)
    return value === 0 ? 0 : value
  }

  function push(travelPx: number): number {
    if (!Number.isFinite(travelPx) || travelPx === 0) return 0

    const capped = clampAbs(travelPx, limits.maxEventTravelPx)
    const wanted = position + capped

    if (wanted > limits.towardTravelPx) {
      position = limits.towardTravelPx
      // Everything past the limit, INCLUDING the part of this event that was
      // still inside it. The band absorbed the rest by moving; the caller gets
      // what is left, so no pixel of a gesture is ever silently dropped at the
      // seam between the two stages.
      return wanted - limits.towardTravelPx
    }

    position = Math.max(wanted, -limits.awayTravelPx)
    return 0
  }

  return {
    push,
    reset() {
      position = 0
    },
    get depth() {
      return depthAt(position)
    },
    get atLimit() {
      return position >= limits.towardTravelPx
    },
    state: () => ({ positionPx: position, depth: depthAt(position) }),
  }
}

function clampAbs(value: number, limit: number): number {
  return value < -limit ? -limit : value > limit ? limit : value
}
