import type { ExperienceId } from '../experience'
import type { NavigationCooldownLimits } from './navigationConfig'

// Who is allowed to navigate, and when. Pure; no DOM, no timers, no React.
//
// FOUR STATES, AND IT NEVER GROWS BY SCENE. `docs/plans/002` sketches a per-scene
// model — EARTH_IDLE -> EARTH_NAVIGATION_PROGRESS -> EARTH_EXITING -> ... and the
// mirror image for Murcia. That was ruled out (`adr/009`): it doubles the state
// count, duplicates every transition, and turns adding a third world into a
// rewrite instead of a data change.
//
// Scene identity already exists and already has an owner — `ExperienceId` in
// `App`. Copying it in here would create two sources of truth that can disagree,
// so the machine is TOLD which experience is showing and never learns what a
// scene is. Direction is derived at the edge; whether an intent is legal is a
// guard, not a state.
//
// ── The invariants, and why they are unwritable rather than checked ──
//
// `docs/plans/002` §5 asks for the illegal combinations to be named. They are, and
// the design answer to each is that there is no transition to write down:
//
//   transitioning + accepting input   `locked` has no input transition at all
//   cooldown + accumulation           `cooldown` has no input transition at all
//   Earth + exit-to-Earth             `intentFor` returns null before the machine sees it
//   Murcia + enter-Murcia             same
//   POI focus + scene transition      the caller's suppression predicate refuses first
//   two transitions at once           `useExperienceTransition`'s timeline guard, unchanged
//
// The last one is deliberately NOT duplicated here. It already exists, it is
// synchronous, and a second guard that could disagree with it is worse than one.

export type NavigationPhase = 'idle' | 'gesturing' | 'locked' | 'cooldown'

/** What a committed gesture asks the application to do. */
export type NavigationIntent = 'enter-murcia' | 'exit-murcia'

export interface NavigationMachine {
  readonly phase: NavigationPhase
  /** True while raw input may be accumulated at all. */
  canAccumulate(): boolean
  /** A gesture is under way. No-op unless idle. */
  beginGesture(): void
  /** A gesture decayed to nothing without committing. */
  endGesture(): void
  /**
   * A gesture reached the threshold.
   *
   * Enters `locked` SYNCHRONOUSLY, in the same event that committed — never on a
   * React state flip, which lands a render later and leaves a window in which
   * the tail of the committing gesture is still being accepted.
   *
   * Returns the intent to run, or null if the commit was not legal after all.
   */
  commit(current: ExperienceId): NavigationIntent | null
  /** The transition has genuinely finished. Moves `locked` -> `cooldown`. */
  settle(nowMs: number): void
  /**
   * Advances the cooldown. Returns true on the frame it releases.
   *
   * `lastInputMs` is the event-clock timestamp of the most recent input, accepted
   * or refused — see `NavigationCooldownLimits.quietGapSeconds` for why it cannot
   * be a wall clock.
   */
  tick(nowMs: number, lastInputMs: number): CooldownRelease | null
  /** Back to `idle` from anywhere. Tab hidden, unmount, fatal. */
  reset(): void
}

export interface CooldownRelease {
  /**
   * True when the cooldown ran out of patience rather than seeing the stream
   * stop. The caller latches the accumulator on this, because at that moment the
   * input stream is by definition still running and releasing without a latch
   * simply hands the momentum tail a fresh gesture.
   */
  onDeadline: boolean
}

/**
 * Which intent a commit means, given where the viewer is standing.
 *
 * Exported because the edge needs it before the machine does — the input layer
 * maps a signed delta onto "toward the other world" using the same fact, and the
 * indicator needs to know which way to draw.
 */
export function intentFor(current: ExperienceId): NavigationIntent {
  return current === 'earth' ? 'enter-murcia' : 'exit-murcia'
}

/** True when an intent is legal from the experience currently showing. */
export function isIntentLegal(intent: NavigationIntent, current: ExperienceId): boolean {
  return intent === 'enter-murcia' ? current === 'earth' : current === 'murcia'
}

export function createNavigationMachine(
  limits: NavigationCooldownLimits,
): NavigationMachine {
  let phase: NavigationPhase = 'idle'
  /** When the cooldown began, on the same event clock as `lastInputMs`. */
  let cooldownFromMs = 0

  return {
    get phase() {
      return phase
    },

    canAccumulate() {
      return phase === 'idle' || phase === 'gesturing'
    },

    beginGesture() {
      if (phase === 'idle') phase = 'gesturing'
    },

    endGesture() {
      if (phase === 'gesturing') phase = 'idle'
    },

    commit(current) {
      if (phase !== 'gesturing' && phase !== 'idle') return null

      const intent = intentFor(current)
      // Belt and braces against a caller that commits with a stale scene. The
      // edge already filtered direction; this makes "Earth asked to leave Earth"
      // unrepresentable rather than merely unlikely.
      if (!isIntentLegal(intent, current)) {
        phase = 'idle'
        return null
      }

      phase = 'locked'
      return intent
    },

    settle(nowMs) {
      if (phase !== 'locked') return
      phase = 'cooldown'
      cooldownFromMs = nowMs
    },

    tick(nowMs, lastInputMs) {
      if (phase !== 'cooldown') return null

      const elapsed = (nowMs - cooldownFromMs) / 1000
      if (elapsed < limits.minSeconds) return null

      const quietFor = (nowMs - lastInputMs) / 1000
      const quiet = quietFor >= limits.quietGapSeconds
      const expired = elapsed >= limits.maxSeconds
      if (!quiet && !expired) return null

      phase = 'idle'
      // Quiet wins when both are true: the stream really did stop, so there is
      // nothing to latch against and latching would refuse a deliberate gesture.
      return { onDeadline: !quiet }
    },

    reset() {
      phase = 'idle'
      cooldownFromMs = 0
    },
  }
}
