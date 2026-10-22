// The page's one opening (ADR 016): the machine's state, and who is told when it
// changes.
//
// The boot entry does not import this: the drawing never consults the machine,
// and the boot chunk has a byte budget. The app creates the one instance when
// it adopts the boot (`loading/opening.ts`), from what the boot already
// publishes — the way in, readiness and the drawing's fill.

import { createOpening, next, type Opening, type OpeningEvent } from './openingMachine'

export interface OpeningStore {
  current(): Opening
  send(event: OpeningEvent): void
  /** Called after every change, never for an event that changed nothing. */
  subscribe(fn: () => void): () => void
}

export function createOpeningStore(options: { returning: boolean; reducedMotion: boolean }): OpeningStore {
  let state = createOpening(options)
  const listeners = new Set<() => void>()

  return {
    current: () => state,
    send(event) {
      const following = next(state, event)
      if (following === state) return
      state = following
      for (const fn of listeners) fn()
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}
