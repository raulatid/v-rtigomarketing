/**
 * When a selected satellite's panel may unfold, now that its logo loads on
 * demand (`createBrandAtlas`'s `onDemand`, owned by `createOrbitSystem`).
 *
 * A selection unfolds when its logo is in the atlas, or after `holdSeconds`,
 * whichever comes first. Without the wait a tap — which has no hover to fetch
 * the logo ahead of it — would unfold onto the drawn wordmark and then swap it
 * for the artwork mid-unfold. A fold is never held.
 *
 * Each request carries a generation per satellite, so a timer or a logo load
 * left over from an earlier selection cannot open a later one early, and a
 * deselect, a `reset` or a `dispose` cancels whatever is waiting.
 *
 * Separate from `createOrbitSystem` so the race can be tested without a scene.
 */
export interface LogoHoldOptions {
  /** Starts (or joins) the logo load for a plate; never rejects. */
  request(index: number): Promise<void>
  /** Folds or unfolds the panel, now. */
  apply(id: string, on: boolean): void
  holdSeconds: number
}

export interface LogoHold {
  /** The latest unfold wanted for one satellite. Repeating the same answer does nothing. */
  set(id: string, index: number, on: boolean): void
  /** Forgets every wish and cancels every wait. For a scene reset, which snaps panels shut itself. */
  reset(): void
  dispose(): void
}

export function createLogoHold({ request, apply, holdSeconds }: LogoHoldOptions): LogoHold {
  const wanted = new Map<string, boolean>()
  const generation = new Map<string, number>()
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let disposed = false

  function cancelAll() {
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
  }

  return {
    set(id, index, on) {
      if (disposed || wanted.get(id) === on) return
      wanted.set(id, on)
      const mine = (generation.get(id) ?? 0) + 1
      generation.set(id, mine)
      if (!on) {
        apply(id, false)
        return
      }
      let opened = false
      const open = () => {
        clearTimeout(timer)
        timers.delete(timer)
        if (opened || disposed || generation.get(id) !== mine || wanted.get(id) !== true) return
        opened = true
        apply(id, true)
      }
      const timer = setTimeout(open, holdSeconds * 1000)
      timers.add(timer)
      void request(index).then(open)
    },
    reset() {
      cancelAll()
      wanted.clear()
    },
    dispose() {
      disposed = true
      cancelAll()
    },
  }
}
