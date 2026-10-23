/**
 * From state to cues. An animation's sound is fired by the state that starts
 * the animation, not by each path that sets it: a case closes from the ✕, the
 * globe and the audit's own deselect, and each close should sound once. So a
 * tracker remembers the last value and names a cue only when it changes —
 * never for the value it starts from, so mounting is silent.
 *
 * Knows no cue names and no audio: the cue type and the `play` are the
 * caller's. `useSoundCue` is the React face of it; a callback that is not
 * React state (the city's `onAttentionChange`) holds a tracker directly.
 */

/** The cue a change from `previous` to `next` is heard as, or null. Pure. */
export type CueFor<T, C> = (previous: T, next: T) => C | null

/**
 * The common shape: a flag whose rising edge is `on` and whose falling edge is
 * `off`, or nothing when `off` is left out. Call it at module level, so the
 * mapping is one stable function.
 */
export function edgeCue<C>(on: C, off: C | null = null): CueFor<boolean, C> {
  return (was, is) => {
    if (was === is) return null
    return is ? on : off
  }
}

export interface CueTracker<T> {
  /** Plays the cue the change to `next` names, if any. */
  update(next: T): void
  /** Takes `next` as the new baseline without a sound: a change that some
   *  other cue already speaks for. */
  reset(next: T): void
}

export function createCueTracker<T, C>(
  // The mapping says what T is: `false` is a boolean here, not the type `false`.
  initial: NoInfer<T>,
  cueFor: CueFor<T, C>,
  play: (cue: C) => void,
): CueTracker<T> {
  let previous = initial
  return {
    update(next) {
      const cue = cueFor(previous, next)
      previous = next
      if (cue !== null) play(cue)
    },
    reset(next) {
      previous = next
    },
  }
}
