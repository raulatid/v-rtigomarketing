// The hint figure's own clock, as a pure state machine.
//
// It answers one question per frame — how gathered is the figure, and how far
// has it scattered — and nothing else. No three, no DOM, so the whole lifecycle
// runs in Node, which is the same split `hoverTutorial.ts` makes from
// `createHoverCue.ts` next door.
//
// WHAT IT DELIBERATELY DOES NOT OWN: when the hint is offered and when it is
// taken away. That is `createNavigationInput` — 1.2s after an arrival, gone 3s
// after the first interaction, closed the moment navigation is refused — and it
// is already tested there, fourteen times over. Restating any of it here would
// give the app two answers to one question. This machine is told, it does not
// decide.
//
// TWO CHANNELS, NOT ONE. `progress` gathers the figure and `exit` scatters it,
// and they are separate because they are not each other's reverse: the figure
// gathers slowly from a wide field and leaves quickly and outward. Running the
// exit backwards through `progress` would send the points home the way they
// came, which reads as a rewind rather than as a departure.

import { HINT_CONFIG } from './hintConfig'

export interface HintFrame {
  /** 0..1, how gathered the figure is. */
  progress: number
  /** 0..1, how far it has scattered. 0 is held, 1 is gone. */
  exit: number
  /** False when there is nothing on screen at all. */
  visible: boolean
}

export interface HintPresenceOptions {
  /**
   * Formed at once, with no flight in from the field.
   *
   * The fade OUT is kept, and that split is the repo's, not an invention: the
   * HTML hint's own reduced-motion rule keeps "every fade and the rise" and
   * kills only the loops, and `hoverTutorial` describes the policy as "same
   * state, less motion, not a second visual language".
   */
  reducedMotion?: boolean
  formSeconds?: number
  exitSeconds?: number
}

export function createHintPresence({
  reducedMotion = false,
  formSeconds = HINT_CONFIG.presence.formSeconds,
  exitSeconds = HINT_CONFIG.presence.exitSeconds,
}: HintPresenceOptions = {}) {
  let wanted = false
  let progress = 0
  let exit = 0
  /** False only once the scatter has finished, so the last frame still draws. */
  let present = false

  function setVisible(next: boolean): void {
    if (next === wanted) return
    wanted = next
    if (!next) return

    // Offered again after it had FULLY gone: start from nothing. Without this
    // the scatter is still wound to 1 and the next arrival would gather and
    // un-scatter at the same time, taking `exitSeconds` to become visible at
    // all. A hint re-offered mid-departure is the other case and is handled in
    // `tick`, which unwinds what is left rather than discarding it.
    if (!present) exit = 0
    present = true
  }

  function tick(delta: number): HintFrame {
    // Guarded rather than trusted. Callers pass `clampFrameDelta`, but this is
    // driven from harnesses too and a backwards step must not unwind the state.
    const dt = Number.isFinite(delta) && delta > 0 ? delta : 0

    if (wanted) {
      // The scatter reverses FIRST. A hint re-offered mid-departure — a panel
      // that opened and closed inside a second — draws itself back in from
      // where it had got to instead of restarting, which is why `progress` is
      // left alone while `exit` still has ground to give back.
      exit = exitSeconds > 0 ? Math.max(0, exit - dt / exitSeconds) : 0
      progress = reducedMotion ? 1 : formSeconds > 0 ? Math.min(1, progress + dt / formSeconds) : 1
    } else if (present) {
      exit = exitSeconds > 0 ? Math.min(1, exit + dt / exitSeconds) : 1
      if (exit >= 1) {
        // Gone. Reset the formation so the next arrival gathers rather than
        // reappearing already assembled.
        present = false
        progress = 0
      }
    }

    return { progress, exit, visible: present }
  }

  return { setVisible, tick }
}

export type HintPresence = ReturnType<typeof createHintPresence>
