// Whether the hint should be on screen.
//
// THE RULE, changed on 2026-09-23 (client direction). The sentence STANDS. It
// is there when the viewer arrives, it stays through the first `graceSeconds`
// of them working the scene, and once it has stepped aside it comes back after
// `idleSeconds` of stillness. Earth's hint and Murcia's have shared this
// counter since 2026-09-22, which is why it lives here, in the one place both
// experiences may import from, rather than in either.
//
// What it replaced: the hint was EARNED by two seconds of stillness and was
// gone on the first press, scroll or key. That read as a card that flinched —
// the one thing a viewer does while deciding is move, and the sentence telling
// them how to move left the moment they tried. The two numbers survive the
// change with their jobs swapped: `idleSeconds` no longer gates the first
// appearance, only the return.
//
// Kept as a plain pair of counters with no DOM and no clock of its own, so the
// rule is exercised in Node and each layer only has to decide what counts as
// activity.

export interface IdleWatchOptions {
  /** Stillness before the hint comes BACK, once a busy viewer has lost it. */
  idleSeconds: number
  /** How long the hint stands into a burst of activity before stepping aside. */
  graceSeconds: number
}

export function createIdleWatch({ idleSeconds, graceSeconds }: IdleWatchOptions) {
  // Seeded AT the threshold, not at zero: the viewer arrives still, and this is
  // what makes the first act of the session collect the whole grace rather than
  // whatever is left of a burst that nobody started.
  let quiet = idleSeconds
  /** How long the current burst of activity has been running. */
  let busy = 0

  /** The viewer did something. Restarts the stillness count. */
  function poke(): void {
    // A poke that arrives after the viewer had gone still opens a NEW burst.
    // One that lands mid-burst must not hand back the grace already spent —
    // a wheel stream pokes this dozens of times a second, and resetting on each
    // would leave the sentence sitting over someone plainly busy forever.
    if (quiet >= idleSeconds) busy = 0
    quiet = 0
  }

  /**
   * Advances the counters and answers whether the hint should SHOW now.
   *
   * Returns the answer on every frame rather than only on the edge, so the
   * caller can treat it as a state — which is what it is. The caller is then
   * free to be told the same thing repeatedly, and both layers already skip an
   * attribute write that would not change anything.
   */
  function tick(delta: number): boolean {
    // Guarded rather than trusted: this is driven from harnesses as well as from
    // a clamped frame delta.
    if (Number.isFinite(delta) && delta > 0) {
      quiet += delta
      // The burst only runs while the viewer is short of the stillness
      // threshold. Past it they are idle, the grace is not being spent, and the
      // next poke starts counting from zero again.
      if (quiet < idleSeconds) busy += delta
    }
    return quiet >= idleSeconds || busy < graceSeconds
  }

  /** Seconds of stillness so far. Diagnostics; the rule is `tick`'s answer. */
  function quietSeconds(): number {
    return quiet
  }

  return { poke, tick, quietSeconds }
}

export type IdleWatch = ReturnType<typeof createIdleWatch>
