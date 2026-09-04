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
// ── The overflow is the whole point ──
//
// `push` returns the travel it could not absorb, and it can only ever do that at
// the +1 end. That leftover is what `navigationGesture` accumulates, so the two
// stages compose into one continuous journey: cross the band to arrive at the
// limit, then keep pushing against it to leave. The far end (-1) is a dead stop
// and returns nothing — there is no world out there to commit to.
//
// The caller is responsible for the ORDER in which the two stages are fed, and
// it matters: travel toward the other world fills this first and overflows into
// the accumulator, while travel away from it must drain the accumulator first
// and only then unzoom. Otherwise a viewer who had banked half a commit would
// watch the camera pull back out while an invisible total was still full, and
// the next nudge would navigate from a pose that no longer looked like the edge
// of anything.
//
// ── Travel, in CSS pixels, not a rate ──
//
// Stored as a signed pixel POSITION rather than as the normalised depth,
// because the two halves of the band are allowed to cost different amounts of
// travel and a normalised accumulator would have to re-derive which half it was
// in on every event. Same physical-distance argument as
// `NavigationGestureLimits.commitDistancePx`: mouse notches, precision
// trackpads and two fingers on glass deliver wildly different event counts for
// the same gesture, so anything counted in events feels like a different
// product on every device.

export interface ZoomBand {
  /**
   * Absorbs signed travel toward the other world. Returns the unabsorbed px.
   *
   * Non-zero only when the band is already pinned at +1 and the push is still
   * heading that way, which is exactly the condition the commit stage means.
   * Clamped per event for the reason the accumulator clamps: one absurd event —
   * a dropped frame, a pen, a synthetic stream — must not be worth more than a
   * flick.
   */
  push(travelPx: number): number
  /** -1 at the far limit, 0 at rest, +1 at the limit that faces the other world. */
  readonly depth: number
  /** Pinned against +1. The commit stage's precondition, and its cue. */
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
