// How long the viewer has been still.
//
// A hint is an IDLE affordance, not an arrival one: it is offered when someone
// has stopped doing anything for a couple of seconds, and it steps aside the
// moment they act — press, scroll, key. Earth's hint has worked this way since
// 2026-09-09 and Murcia's since 2026-09-22, which is why this lives here, in
// the one place both experiences may import from, rather than in either.
//
// Kept as a plain counter with no DOM and no clock of its own, so the rule is
// exercised in Node and each layer only has to decide what counts as activity.

export interface IdleWatchOptions {
  /** Stillness before the viewer counts as idle. */
  idleSeconds: number
}

export function createIdleWatch({ idleSeconds }: IdleWatchOptions) {
  let quiet = 0

  /** The viewer did something. Restarts the count. */
  function poke(): void {
    quiet = 0
  }

  /**
   * Advances the count and answers whether the viewer is idle NOW.
   *
   * Returns true on every frame the threshold is met rather than only on the
   * edge, so the caller can treat it as a state — which is what it is. The
   * caller is then free to be told the same thing repeatedly, and `HintLayer`
   * already skips an attribute write that would not change anything.
   */
  function tick(delta: number): boolean {
    // Guarded rather than trusted: this is driven from harnesses as well as from
    // a clamped frame delta.
    if (Number.isFinite(delta) && delta > 0) quiet += delta
    return quiet >= idleSeconds
  }

  /** Seconds of stillness so far. Diagnostics; the rule is `tick`'s answer. */
  function quietSeconds(): number {
    return quiet
  }

  return { poke, tick, quietSeconds }
}

export type IdleWatch = ReturnType<typeof createIdleWatch>
