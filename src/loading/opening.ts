import { createOpeningStore, type OpeningStore } from '../intro-draw/openingStore'

// App-side owner of the page's one opening (ADR 016).
//
// Created here, on first use, rather than by the boot entry: nothing the boot
// runs consults the machine, and the boot chunk has a byte budget. It is seeded
// from what the boot publishes and catches up on what already happened —
// readiness is latched in bootState (`fatal` included) and the fill in the
// drawing's `isDone()` — then follows both.
//
// Importing intro-draw by value is safe here only because the boot entry does
// not import the machine: a module both entries import would be hoisted into a
// shared chunk, and the build refuses a boot entry with an import.

let adopted: OpeningStore | null | undefined

/** The opening, or null when the boot entry is missing and there is nothing to adopt. */
export function getOpening(): OpeningStore | null {
  if (adopted !== undefined) return adopted
  const intro = window.__vertigoIntro
  if (!intro) return (adopted = null)

  const opening = createOpeningStore({ returning: intro.returning, reducedMotion: intro.reducedMotion })
  const tellReadiness = () => opening.send({ type: 'readiness', readiness: intro.boot.readiness() })
  tellReadiness()
  intro.boot.subscribe(tellReadiness)
  // Every fill, replays included; the machine ignores one it is not waiting for.
  if (intro.handle.isDone()) opening.send({ type: 'fill' })
  intro.handle.subscribeComplete(() => opening.send({ type: 'fill' }))
  return (adopted = opening)
}
