import { expect, it } from 'vitest'
import { HINT_CONFIG } from './hintConfig'

it('ships a threshold a person would actually wait through', () => {
  // Long enough that it is not competing with someone who is still looking
  // around, short enough to feel like a response to stillness rather than a
  // timeout. Pinned so a retune is a decision rather than a drift.
  expect(HINT_CONFIG.presence.idleSeconds).toBe(2)
})

it('stands long enough to be read by someone already moving', () => {
  // The client's number (2026-09-23). The hint used to go on the first press;
  // this is how long it now survives a viewer who is working the scene. Pinned
  // for the same reason as its neighbour.
  expect(HINT_CONFIG.presence.graceSeconds).toBe(5)
})

it('outlasts the stillness it waits for', () => {
  // The rule reads as one sentence only while this holds: lose it by being
  // busy, get it back by being still. A grace under the idle threshold would
  // make a single nudge flicker the hint instead of holding it.
  expect(HINT_CONFIG.presence.graceSeconds).toBeGreaterThan(
    HINT_CONFIG.presence.idleSeconds,
  )
})
