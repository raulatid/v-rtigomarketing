import type { NavigationGestureLimits } from './navigationConfig'

// Raw input travel -> deliberate, reversible navigation progress.
//
// The whole point of this module is that it is NOT `if (deltaY > 0) navigate()`.
// A single event cannot navigate, a single flick cannot navigate, and a gesture
// the viewer abandons half way retreats to zero on its own. `DECISIONS.md` §15
// ruled scroll navigation out partly because "an accidental scroll would warp the
// viewer into another world"; this is the module that answers that objection, and
// it is the reason the reversal was affordable at all.
//
// Pure: no DOM, no three, no React, no clock of its own. It is fed travel and
// time and hands back numbers, on the same shape as `intro-draw/playhead.ts` —
// a factory closing over private state, with `step`/`reset`/`state`. That module
// is not imported (`checks/architecture.ts` forbids reaching into `intro-draw/`,
// and the build keeps it a standalone chunk) and it should not be: a loading
// playhead advances on TIME with progress as an accelerator, and this advances on
// DISPLACEMENT and can go backwards. Same shape, different domain — PRINCIPLES
// §12, duplication is cheaper than the wrong abstraction.
//
// ── Direction is the caller's business ──
//
// This accumulates travel "toward the other world" and nothing else. The caller
// maps a signed wheel or drag delta onto that, because which sign means "away
// from here" depends on which world you are standing in. Travel is clamped at
// zero, so pushing the wrong way against a resting gesture is simply ignored
// rather than building negative progress.
//
// That mapping has a property worth naming, because it is load-bearing for
// trackpad safety and it is easy to delete by accident: the sign that navigates
// FLIPS when the scene swaps. So the momentum tail of the gesture that just
// committed arrives in the new world pointing the wrong way, and subtracts from a
// travel that is already zero. The cooldown is still the real guard — this is a
// second, free one, and it only holds while the two worlds sit at opposite ends
// of the same axis.

export interface GestureFrame {
  /** 0..1. What the indicator draws and what the machine commits on. */
  progress: number
  /** Travel has reached the commit distance this frame. Fires once. */
  committed: boolean
  /** Progress is above zero — a gesture is visibly in flight. */
  active: boolean
  /** Decaying rather than being driven. Diagnostics, and the indicator's cue. */
  releasing: boolean
}

export interface NavigationGesture {
  /**
   * Feeds one input event.
   *
   * `travelPx` is displacement toward the other world, positive. `timeStampMs`
   * comes from the event, never from a clock — see `NavigationCooldownLimits`.
   *
   * EVERY event must be pushed, including the ones that must not count. `accumulate`
   * is how the caller says which is which, and it is a parameter rather than the
   * caller simply not calling because this module owns "when did input last arrive",
   * and the cooldown's quiescence test reads exactly that. A stream that is being
   * refused still has to be visible as a stream, or a viewer scrolling through the
   * whole cooldown would look silent and release it instantly.
   */
  push(travelPx: number, timeStampMs: number, accumulate?: boolean): void
  /** Advances decay and reports the frame. Call once per animation frame. */
  step(deltaSeconds: number, nowMs: number): GestureFrame
  /** Drops all travel. Used on commit, on scene change and on tab hide. */
  reset(): void
  /**
   * The viewer has explicitly let go. Starts the retreat NOW, without waiting
   * out `idleGapSeconds`.
   *
   * The idle gap exists because the wheel has no release event: it is the only
   * way to tell "still scrolling" from "stopped", and it is measured generously
   * so a slow device cannot fight its own decay mid-gesture. When something DOES
   * signal a release the gap is not just unnecessary, it is a half second of the
   * world hanging at a lean for no reason.
   *
   * Two callers. A press on the canvas: grabbing the world means you want to
   * manipulate it, not travel through it. And, later, a touch pointer-up.
   *
   * Not `reset()`, deliberately — that would drop the travel in one frame and
   * teleport the scene. This decays, so the spring still eases it home.
   */
  release(): void
  /**
   * Refuses further travel until the input stream genuinely stops.
   *
   * Set when a cooldown ends on its DEADLINE rather than on quiet — at that moment
   * the stream is by definition still running, and without this the deadline would
   * simply hand the momentum tail a fresh gesture. Cleared by a real quiet gap.
   *
   * Takes the current time because the gap is measured FROM THE LATCH, not from
   * whatever the last event happened to be. Without it a latch set on a gesture
   * that had never pushed would compare against a beginning-of-time timestamp,
   * find an infinite quiet gap, and clear itself on the very first event it was
   * meant to refuse.
   */
  latch(nowMs: number): void
  /** True while latched. Diagnostics. */
  readonly isLatched: boolean
  /** Diagnostics only. */
  state(): { travelPx: number; latched: boolean; released: boolean; lastInputMs: number }
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

export function createNavigationGesture(
  limits: NavigationGestureLimits,
): NavigationGesture {
  let travel = 0
  let latched = false
  /** Event-clock timestamp of the last accepted or rejected input. */
  let lastInputMs = Number.NEGATIVE_INFINITY
  /** Rolling estimate of the frame interval, seconds. 0 until the first frame. */
  let cadence = 0
  let committed = false
  let releasing = false
  /**
   * The viewer let go explicitly, so the idle gap is waived until travel clears.
   *
   * Cleared when travel reaches zero rather than on the next push, so a released
   * gesture always finishes retreating — and a push that arrives mid-retreat
   * (a momentum tail) is still refused by the ordinary guards rather than by
   * this one.
   */
  let released = false

  function push(travelPx: number, timeStampMs: number, accumulate = true): void {
    if (!Number.isFinite(travelPx) || !Number.isFinite(timeStampMs)) return

    // The latch clears on a real gap in the stream, and it is tested BEFORE this
    // event is recorded — otherwise the gap would be measured against the event
    // that is trying to get through it.
    if (latched) {
      const quietFor = (timeStampMs - lastInputMs) / 1000
      if (quietFor >= limits.idleGapSeconds) latched = false
    }

    // Recorded even when refused. A latched stream that never stops must never
    // look quiet, and a rejected event is still evidence the viewer is scrolling.
    lastInputMs = timeStampMs
    if (!accumulate || latched || committed) return

    const capped = clampAbs(travelPx, limits.maxEventTravelPx)
    travel = Math.max(0, Math.min(travel + capped, limits.commitDistancePx))
  }

  function step(deltaSeconds: number, nowMs: number): GestureFrame {
    const dt = Math.max(0, deltaSeconds)

    // Read the cadence as it stood BEFORE this frame. Measuring it after would
    // let a stall widen the very limit meant to contain it — the subtlety
    // `playhead.ts` records, and the reason a 900ms block cannot deliver a
    // navigation here.
    const previousCadence = cadence === 0 ? dt : cadence
    const advanceDt = Math.min(dt, previousCadence * limits.catchUp)
    cadence = cadence === 0 ? dt : cadence + (advanceDt - cadence) * 0.1

    const quietFor = (nowMs - lastInputMs) / 1000
    releasing = false

    // Read BEFORE any retreat is applied. A gesture that reaches the threshold
    // and is released in the same frame — which is what a decisive gesture looks
    // like, and what pointermove and pointerup do when the queue is drained
    // together — would otherwise have the first decay step taken out of it and
    // miss the commit it had already earned. At 0.08s and a 16ms frame that is
    // 18% of the travel, so the loss is not marginal: it is the difference
    // between navigating and not.
    //
    // Only ever true for the one frame the commit fires on: after that
    // `committed` short-circuits the same condition.
    const reachedCommit = travel >= limits.commitDistancePx

    if (
      !committed &&
      !reachedCommit &&
      travel > 0 &&
      (released || quietFor >= limits.idleGapSeconds)
    ) {
      // Frame-rate independent, and it terminates: below a fraction of the
      // commit distance there is nothing left to see, so snapping avoids an
      // asymptote that never clears `active`.
      const alpha =
        limits.decaySeconds > 0 ? 1 - Math.exp(-advanceDt / limits.decaySeconds) : 1
      travel -= travel * alpha
      if (travel < limits.commitDistancePx * limits.snapFraction) {
        travel = 0
        released = false
      }
      releasing = true
    }

    const progress = clamp01(travel / limits.commitDistancePx)

    // Fires on the frame the threshold is reached, exactly once. Latching
    // `committed` here rather than in `push` keeps the edge on the frame the
    // machine reads, so a burst of events inside one frame cannot commit twice.
    const justCommitted = !committed && progress >= 1
    if (justCommitted) committed = true

    return {
      progress,
      committed: justCommitted,
      active: progress > 0,
      releasing,
    }
  }

  function reset(): void {
    travel = 0
    committed = false
    releasing = false
    released = false
    cadence = 0
    // `latched` and `lastInputMs` deliberately survive. A reset happens at a
    // commit and at a scene swap, which is precisely when a momentum tail is
    // still arriving — clearing the latch there would defeat it.
  }

  return {
    push,
    step,
    reset,
    release() {
      // No-op with nothing in flight, so a press on an idle scene costs nothing
      // and cannot arm a retreat that has nothing to retreat from.
      if (travel > 0) released = true
    },
    latch(nowMs: number) {
      latched = true
      if (Number.isFinite(nowMs)) lastInputMs = nowMs
    },
    get isLatched() {
      return latched
    },
    state: () => ({ travelPx: travel, latched, released, lastInputMs }),
  }
}

function clampAbs(value: number, limit: number): number {
  return value < -limit ? -limit : value > limit ? limit : value
}
