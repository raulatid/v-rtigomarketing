import { expect, it } from 'vitest'
import { HINT_CONFIG } from './hintConfig'

it('ships a threshold a person would actually wait through', () => {
  // Long enough that it is not competing with someone who is still looking
  // around, short enough to feel like a response to stillness rather than a
  // timeout. Pinned so a retune is a decision rather than a drift.
  expect(HINT_CONFIG.presence.idleSeconds).toBe(2)
})
